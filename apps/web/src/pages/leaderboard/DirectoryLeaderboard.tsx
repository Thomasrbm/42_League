import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Search,
  X,
  SlidersHorizontal,
  ArrowUpDown,
  Flame,
  Trophy,
  Crown,
  LayoutGrid,
  Rows3,
} from 'lucide-react';
import {
  rankTierForRank,
  RANK_TIERS,
  GRANDMASTER,
  type RankTierKey,
} from '@42-league/shared';
import { api, type LeaderboardEntry } from '../../lib/api';
import { computeTrophies } from '../../lib/trophies';
import { Avatar } from '../../components/Avatar';
import { PlayerLink } from '../../components/PlayerLink';
import { RankBadge } from '../../components/RankBadge';
import { WinRateBar } from '../../components/WinRateBar';
import { BadgeChip } from '../../components/Badges';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useGameMode } from '../../hooks/useGameMode';

// ─── Modèle enrichi d'un joueur inscrit ──────────────────────────────────────
// L'annuaire couvre TOUS les joueurs inscrits (y compris ceux à 0 partie, absents
// du classement classé). On dérive pour chacun les stats du jeu courant + son
// palier + son décompte de trophées, puis on filtre / trie / regroupe à volonté.
interface Row {
  entry: LeaderboardEntry;
  wins: number;
  losses: number;
  games: number;
  winRate: number; // 0–100
  tierKey: RankTierKey;
  tierLabel: string;
  tierColor: string;
  trophies: number;
  level: number | null;
  onFire: boolean;
  titled: boolean;
  goat: boolean;
  champion: boolean;
}

// ─── Regroupement par section ────────────────────────────────────────────────
type GroupBy = 'none' | 'campus' | 'tier' | 'activity' | 'trophies' | 'alpha';
type SortKey =
  | 'elo'
  | 'winRate'
  | 'games'
  | 'trophies'
  | 'wins'
  | 'losses'
  | 'level'
  | 'campus'
  | 'name'
  | 'alpha';
type SortDir = 'asc' | 'desc';
type Layout = 'grid' | 'list';

// Ordre d'affichage des paliers (haut → bas) pour le regroupement par grade.
const TIER_ORDER: RankTierKey[] = ['grandmaster', 'diamant', 'or', 'argent', 'bronze', 'etain'];

interface Filters {
  q: string;
  campus: string; // '' = tous
  tiers: Set<RankTierKey>; // vide = tous
  minGames: number;
  minWinRate: number;
  minTrophies: number;
  minElo: number | null;
  maxElo: number | null;
  onlyTitled: boolean;
  onlyOnFire: boolean;
  onlyGoat: boolean;
  onlyChampion: boolean;
  activity: 'all' | 'ranked' | 'never';
}

const EMPTY_FILTERS: Filters = {
  q: '',
  campus: '',
  tiers: new Set(),
  minGames: 0,
  minWinRate: 0,
  minTrophies: 0,
  minElo: null,
  maxElo: null,
  onlyTitled: false,
  onlyOnFire: false,
  onlyGoat: false,
  onlyChampion: false,
  activity: 'all',
};

/**
 * Onglet « Tous » — annuaire complet des joueurs inscrits.
 *
 * Contrairement au classement Solo (qui n'affiche que les joueurs ayant ≥ 1
 * partie cette saison), l'annuaire liste TOUT LE MONDE, avec un maximum de
 * filtres (campus, palier, trophées, activité, en feu, titré, champion, ELO…)
 * et un regroupement par section empilées verticalement (campus, grade, activité,
 * trophées, initiale). Partagé par les vues desktop et mobile.
 */
export function DirectoryLeaderboard({ myLogin }: { myLogin?: string | null }) {
  const { leaderboard: rankedBoard, matches: allMatches, activeSeasonId } = useLeagueData();
  const { game } = useGameMode();

  // Roster COMPLET (tous les inscrits visibles, même à 0 partie / hors discipline) :
  // le classement `rankedBoard` de useLeagueData est filtré au mode + parties jouées,
  // donc il masque les simples inscrits. On charge donc ici l'annuaire dédié
  // (/leaderboard?scope=all) — c'est LUI qui doit tout montrer. Repli sur le classement
  // classé tant que l'annuaire n'est pas revenu (jamais vide au premier rendu).
  const [roster, setRoster] = useState<LeaderboardEntry[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .directory(game)
      .then((rows) => {
        if (alive) setRoster(rows);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [game]);
  const leaderboard = roster.length > 0 ? roster : rankedBoard;

  // Stats du jeu courant, cloisonnées à la saison active (comme le classement).
  const gameMatches = useMemo(() => {
    const base = allMatches.filter((m) => (m.game ?? 'babyfoot') === game);
    return activeSeasonId ? base.filter((m) => m.seasonId === activeSeasonId) : base;
  }, [allMatches, game, activeSeasonId]);

  // Trophées du jeu courant → décompte par login (winner.login).
  const trophyCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const trophy of computeTrophies(leaderboard, gameMatches, game)) {
      if (trophy.earned && trophy.winner) {
        m.set(trophy.winner.login, (m.get(trophy.winner.login) ?? 0) + 1);
      }
    }
    return m;
  }, [leaderboard, gameMatches, game]);

  // Niveau (passe de combat) — chargé à la demande, cross-jeux. Facultatif :
  // en cas d'échec, le filtre/tri « niveau » reste neutre (level=null).
  const [levelByLogin, setLevelByLogin] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let alive = true;
    api
      .xpLeaderboard()
      .then((rows) => {
        if (!alive) return;
        const m = new Map<string, number>();
        for (const r of rows) m.set(r.login, r.level);
        setLevelByLogin(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // W/L cumulés du jeu courant (draws exclus des séries V/D).
  const wlByLogin = useMemo(() => {
    const m = new Map<string, { wins: number; losses: number }>();
    for (const u of leaderboard) m.set(u.login, { wins: 0, losses: 0 });
    for (const match of gameMatches) {
      if (match.winner === 'draw') continue;
      for (const login of [match.playerALogin, match.playerBLogin]) {
        const cur = m.get(login);
        if (!cur) continue;
        const isA = match.playerALogin === login;
        const won = (isA && match.winner === 'A') || (!isA && match.winner === 'B');
        if (won) cur.wins++;
        else cur.losses++;
      }
    }
    return m;
  }, [leaderboard, gameMatches]);

  // Instant figé au montage : sert de repère « en feu » sans invalider le memo
  // (Date.now() recalculé à chaque render rendrait le useMemo inutile).
  const [now] = useState(() => Date.now());
  const rows = useMemo<Row[]>(() => {
    return leaderboard.map((entry) => {
      const wl = wlByLogin.get(entry.login) ?? { wins: 0, losses: 0 };
      const games = wl.wins + wl.losses;
      const tier = rankTierForRank(entry.elo, entry.rank);
      const fireUntil = entry.eloMultUntil ? new Date(entry.eloMultUntil).getTime() : 0;
      return {
        entry,
        wins: wl.wins,
        losses: wl.losses,
        games,
        winRate: games === 0 ? 0 : Math.round((wl.wins / games) * 100),
        tierKey: tier.key,
        tierLabel: tier.label,
        tierColor: tier.color,
        trophies: trophyCount.get(entry.login) ?? 0,
        level: levelByLogin.get(entry.login) ?? null,
        onFire: fireUntil > now,
        titled: !!entry.title,
        goat: !!entry.badges?.includes('goat'),
        champion: (entry.tournamentsWon ?? 0) > 0,
      };
    });
  }, [leaderboard, wlByLogin, trophyCount, levelByLogin, now]);

  // Liste des campus présents (pour le sélecteur de campus).
  const campuses = useMemo(() => {
    const s = new Set<string>();
    for (const u of leaderboard) if (u.campus) s.add(u.campus);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [leaderboard]);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [sortKey, setSortKey] = useState<SortKey>('elo');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [layout, setLayout] = useState<Layout>('grid');

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  const toggleTier = (k: RankTierKey) =>
    setFilters((f) => {
      const next = new Set(f.tiers);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return { ...f, tiers: next };
    });

  // ─── Filtrage ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return rows.filter((r) => {
      const { entry } = r;
      if (q) {
        const hay = `${entry.login} ${entry.firstName ?? ''} ${entry.lastName ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.campus && entry.campus !== filters.campus) return false;
      if (filters.tiers.size > 0 && !filters.tiers.has(r.tierKey)) return false;
      if (r.games < filters.minGames) return false;
      if (r.games > 0 && r.winRate < filters.minWinRate) return false;
      if (filters.minWinRate > 0 && r.games === 0) return false;
      if (r.trophies < filters.minTrophies) return false;
      if (filters.minElo != null && entry.elo < filters.minElo) return false;
      if (filters.maxElo != null && entry.elo > filters.maxElo) return false;
      if (filters.onlyTitled && !r.titled) return false;
      if (filters.onlyOnFire && !r.onFire) return false;
      if (filters.onlyGoat && !r.goat) return false;
      if (filters.onlyChampion && !r.champion) return false;
      if (filters.activity === 'ranked' && r.games === 0) return false;
      if (filters.activity === 'never' && r.games > 0) return false;
      return true;
    });
  }, [rows, filters]);

  // ─── Tri (dans chaque section) ───────────────────────────────────────────────
  const cmp = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return (a: Row, b: Row) => {
      let c = 0;
      switch (sortKey) {
        case 'elo': c = a.entry.elo - b.entry.elo; break;
        case 'winRate': c = a.winRate - b.winRate; break;
        case 'games': c = a.games - b.games; break;
        case 'wins': c = a.wins - b.wins; break;
        case 'losses': c = a.losses - b.losses; break;
        case 'trophies': c = a.trophies - b.trophies; break;
        case 'level': c = (a.level ?? -1) - (b.level ?? -1); break;
        // Campus / nom / login : tri texte croissant « naturel » — on inverse le
        // signe pour que dir=desc (défaut) reste A→Z (l'utilisateur attend A→Z).
        case 'campus':
          c = -(a.entry.campus ?? '￿').localeCompare(b.entry.campus ?? '￿');
          break;
        case 'name': {
          const an = `${a.entry.lastName ?? ''} ${a.entry.firstName ?? ''}`.trim() || a.entry.login;
          const bn = `${b.entry.lastName ?? ''} ${b.entry.firstName ?? ''}`.trim() || b.entry.login;
          c = -an.localeCompare(bn);
          break;
        }
        case 'alpha': c = -a.entry.login.localeCompare(b.entry.login); break;
      }
      if (c === 0) c = a.entry.elo - b.entry.elo;
      return c * dir;
    };
  }, [sortKey, sortDir]);

  // ─── Regroupement en sections ────────────────────────────────────────────────
  const sections = useMemo<{ key: string; label: string; color?: string; rows: Row[] }[]>(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: '', rows: [...filtered].sort(cmp) }];
    }
    const buckets = new Map<string, { label: string; color?: string; order: number; rows: Row[] }>();
    const push = (key: string, label: string, order: number, r: Row, color?: string) => {
      let b = buckets.get(key);
      if (!b) { b = { label, color, order, rows: [] }; buckets.set(key, b); }
      b.rows.push(r);
    };
    for (const r of filtered) {
      if (groupBy === 'campus') {
        const key = r.entry.campus ?? '__none';
        push(key, r.entry.campus ?? 'Sans campus', r.entry.campus ? 0 : 99, r);
      } else if (groupBy === 'tier') {
        const order = TIER_ORDER.indexOf(r.tierKey);
        const color = r.tierKey === 'grandmaster' ? GRANDMASTER.color : r.tierColor;
        push(r.tierKey, r.tierLabel, order < 0 ? 99 : order, r, color);
      } else if (groupBy === 'activity') {
        const [key, label, order] =
          r.games === 0 ? ['never', 'Jamais joué', 3]
          : r.games < 10 ? ['beginner', 'Débutants · 1–9 parties', 2]
          : r.games < 50 ? ['active', 'Actifs · 10–49 parties', 1]
          : ['veteran', 'Vétérans · 50+ parties', 0];
        push(key as string, label as string, order as number, r);
      } else if (groupBy === 'trophies') {
        const [key, label, order] =
          r.trophies === 0 ? ['none', 'Sans trophée', 2]
          : r.trophies < 5 ? ['some', 'Décorés · 1–4 trophées', 1]
          : ['collector', 'Collectionneurs · 5+ trophées', 0];
        push(key as string, label as string, order as number, r);
      } else if (groupBy === 'alpha') {
        const ch = (r.entry.login[0] ?? '#').toUpperCase();
        const key = /[A-Z]/.test(ch) ? ch : '#';
        push(key, key, key === '#' ? 999 : key.charCodeAt(0), r);
      }
    }
    return [...buckets.entries()]
      .map(([key, b]) => ({ key, label: b.label, color: b.color, order: b.order, rows: b.rows.sort(cmp) }))
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  }, [filtered, groupBy, cmp]);

  const activeFilterCount =
    (filters.campus ? 1 : 0) +
    (filters.tiers.size > 0 ? 1 : 0) +
    (filters.minGames > 0 ? 1 : 0) +
    (filters.minWinRate > 0 ? 1 : 0) +
    (filters.minTrophies > 0 ? 1 : 0) +
    (filters.minElo != null ? 1 : 0) +
    (filters.maxElo != null ? 1 : 0) +
    (filters.onlyTitled ? 1 : 0) +
    (filters.onlyOnFire ? 1 : 0) +
    (filters.onlyGoat ? 1 : 0) +
    (filters.onlyChampion ? 1 : 0) +
    (filters.activity !== 'all' ? 1 : 0);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-2/90 leading-snug">
        Tous les inscrits, tous campus et disciplines confondus — même ceux qui n'ont
        jamais joué. Filtre, trie, regroupe par section, et bascule entre grille (côte
        à côte) et liste. Stats du jeu courant, saison en cours.
      </p>

      {/* ── Barre : recherche + section + tri ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" strokeWidth={2.5} />
          <input
            value={filters.q}
            onChange={(e) => set('q', e.target.value)}
            placeholder="Rechercher un joueur…"
            className="w-full pl-10 pr-9 py-2.5 bg-bg-1 border border-border rounded-xl text-sm font-medium focus:border-gold outline-none text-text-strong placeholder:text-muted allow-select transition-colors"
          />
          {filters.q && (
            <button
              type="button"
              aria-label="Effacer"
              onClick={() => set('q', '')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-muted hover:text-red hover:bg-red/10"
            >
              <X className="w-4 h-4" strokeWidth={2.5} />
            </button>
          )}
        </div>

        <Select value={groupBy} onChange={(v) => setGroupBy(v as GroupBy)} title="Regrouper par section">
          <option value="none">Section : aucune</option>
          <option value="campus">Section : campus</option>
          <option value="tier">Section : palier</option>
          <option value="activity">Section : activité</option>
          <option value="trophies">Section : trophées</option>
          <option value="alpha">Section : A–Z</option>
        </Select>

        <Select value={sortKey} onChange={(v) => setSortKey(v as SortKey)} title="Trier par">
          <option value="elo">Tri : ELO</option>
          <option value="winRate">Tri : win rate</option>
          <option value="games">Tri : parties</option>
          <option value="wins">Tri : victoires</option>
          <option value="losses">Tri : défaites</option>
          <option value="trophies">Tri : trophées</option>
          <option value="level">Tri : niveau</option>
          <option value="campus">Tri : campus</option>
          <option value="name">Tri : nom</option>
          <option value="alpha">Tri : login A–Z</option>
        </Select>

        <button
          type="button"
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          title={sortDir === 'asc' ? 'Croissant' : 'Décroissant'}
          className="h-9 px-2.5 inline-flex items-center gap-1 rounded-lg border border-border bg-bg-1 text-xs font-bold text-muted-2 hover:text-gold hover:border-gold/40 transition-colors"
        >
          <ArrowUpDown className="w-3.5 h-3.5" strokeWidth={2.4} />
          {sortDir === 'asc' ? 'ASC' : 'DESC'}
        </button>

        <button
          type="button"
          onClick={() => setLayout((l) => (l === 'grid' ? 'list' : 'grid'))}
          title={layout === 'grid' ? 'Vue grille — joueurs côte à côte' : 'Vue liste — une ligne par joueur'}
          aria-label="Changer de disposition"
          className="h-9 px-2.5 inline-flex items-center gap-1 rounded-lg border border-border bg-bg-1 text-xs font-bold text-muted-2 hover:text-gold hover:border-gold/40 transition-colors"
        >
          {layout === 'grid'
            ? <LayoutGrid className="w-3.5 h-3.5" strokeWidth={2.4} />
            : <Rows3 className="w-3.5 h-3.5" strokeWidth={2.4} />}
        </button>

        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border text-xs font-bold transition-colors ${
            showFilters || activeFilterCount > 0
              ? 'border-gold/50 bg-gold/10 text-gold'
              : 'border-border bg-bg-1 text-muted-2 hover:text-gold hover:border-gold/40'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={2.4} />
          Filtres
          {activeFilterCount > 0 && (
            <span className="ml-0.5 min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-gold text-[10px] font-black text-[#1a1100]">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Panneau de filtres ─────────────────────────────────────────────── */}
      {showFilters && (
        <div className="rounded-xl border border-gold/20 bg-bg-1/60 p-3 space-y-3">
          {/* Campus + activité */}
          <div className="flex flex-wrap items-center gap-2">
            {campuses.length > 0 && (
              <Select value={filters.campus} onChange={(v) => set('campus', v)} title="Campus">
                <option value="">Campus : tous</option>
                {campuses.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            )}
            <Select value={filters.activity} onChange={(v) => set('activity', v as Filters['activity'])} title="Activité">
              <option value="all">Activité : tous</option>
              <option value="ranked">A déjà joué</option>
              <option value="never">Jamais joué</option>
            </Select>
          </div>

          {/* Paliers (multi) */}
          <div className="flex flex-wrap gap-1.5">
            {[...RANK_TIERS].reverse().map((tier) => (
              <FilterChip
                key={tier.key}
                active={filters.tiers.has(tier.key)}
                onClick={() => toggleTier(tier.key)}
                color={tier.color}
              >
                {tier.label}
              </FilterChip>
            ))}
            <FilterChip
              active={filters.tiers.has('grandmaster')}
              onClick={() => toggleTier('grandmaster')}
              color={GRANDMASTER.color}
            >
              {GRANDMASTER.label}
            </FilterChip>
          </div>

          {/* Chips booléens */}
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={filters.onlyOnFire} onClick={() => set('onlyOnFire', !filters.onlyOnFire)} color="#ff8c3a">
              <Flame className="w-3 h-3" strokeWidth={2.5} /> En feu
            </FilterChip>
            <FilterChip active={filters.onlyTitled} onClick={() => set('onlyTitled', !filters.onlyTitled)} color="#ffc94a">
              Avec titre
            </FilterChip>
            <FilterChip active={filters.onlyGoat} onClick={() => set('onlyGoat', !filters.onlyGoat)} color="#ffc94a">
              <Crown className="w-3 h-3" strokeWidth={2.5} /> G.O.A.T
            </FilterChip>
            <FilterChip active={filters.onlyChampion} onClick={() => set('onlyChampion', !filters.onlyChampion)} color="#c084fc">
              <Trophy className="w-3 h-3" strokeWidth={2.5} /> Champion
            </FilterChip>
          </div>

          {/* Curseurs numériques */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <RangeField label="Parties min" value={filters.minGames} min={0} max={100} step={5} onChange={(v) => set('minGames', v)} />
            <RangeField label="Win rate min" value={filters.minWinRate} min={0} max={100} step={5} suffix="%" onChange={(v) => set('minWinRate', v)} />
            <RangeField label="Trophées min" value={filters.minTrophies} min={0} max={15} step={1} onChange={(v) => set('minTrophies', v)} />
          </div>

          {/* ELO min/max */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">ELO</span>
            <NumInput placeholder="min" value={filters.minElo} onChange={(v) => set('minElo', v)} />
            <span className="text-muted">–</span>
            <NumInput placeholder="max" value={filters.maxElo} onChange={(v) => set('maxElo', v)} />
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="ml-auto h-8 px-3 rounded-lg border border-red/30 bg-red/10 text-red text-xs font-bold hover:bg-red/15 transition-colors"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Compteur ────────────────────────────────────────────────────────── */}
      <div className="text-[11px] text-muted-2 font-semibold">
        {filtered.length} joueur{filtered.length > 1 ? 's' : ''}
        {groupBy !== 'none' && ` · ${sections.length} section${sections.length > 1 ? 's' : ''}`}
      </div>

      {/* ── Sections empilées verticalement ─────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="text-center text-muted-2 py-10 text-sm">
          Aucun joueur ne correspond à ces filtres.
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.key}>
              {section.label && (
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div
                    className="w-0.5 h-4 rounded-full flex-shrink-0"
                    style={{ background: section.color ?? '#ffc94a' }}
                  />
                  <span
                    className="font-gaming text-[11px] uppercase tracking-[0.16em] font-extrabold"
                    style={{ color: section.color ?? '#ffc94a' }}
                  >
                    {section.label}
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-r from-gold/15 to-transparent" />
                  <span className="text-[9px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-muted-2">
                    {section.rows.length}
                  </span>
                </div>
              )}
              {layout === 'grid' ? (
                // Grille : joueurs côte à côte (2–3 par rangée sur desktop) pour en
                // voir un maximum d'un coup d'œil. Carte compacte adaptée à la largeur.
                <div className="grid gap-1.5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                  {section.rows.map((r) => (
                    <DirectoryCard key={r.entry.login} row={r} isMe={r.entry.login === myLogin} />
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {section.rows.map((r) => (
                    <DirectoryRow key={r.entry.login} row={r} isMe={r.entry.login === myLogin} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Ligne joueur ─────────────────────────────────────────────────────────────
function DirectoryRow({ row, isMe }: { row: Row; isMe: boolean }) {
  const { entry } = row;
  return (
    <div
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-colors ${
        isMe
          ? 'border-gold/50 bg-gold/[0.08]'
          : 'border-border/60 bg-bg-1/50 hover:bg-bg-2/60'
      }`}
    >
      <div className="relative shrink-0">
        <Avatar login={entry.login} imageUrl={entry.imageUrl} size="sm" />
        {row.onFire && (
          <Flame
            className="absolute -top-1 -right-1 w-3.5 h-3.5 text-[#ff8c3a]"
            strokeWidth={2.5}
            fill="currentColor"
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <PlayerLink login={entry.login} className={`text-sm font-bold truncate ${isMe ? 'text-gold' : 'text-text-strong'}`}>
            {entry.login}
          </PlayerLink>
          {row.goat && <BadgeChip code="goat" size="xs" iconOnly />}
          {row.champion && (
            <span title="A remporté un tournoi" className="text-[#c084fc]">
              <Trophy className="w-3 h-3" strokeWidth={2.5} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {entry.campus && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-2 truncate max-w-[90px]">
              {entry.campus}
            </span>
          )}
          {entry.title && (
            <span
              className={`text-[10px] italic truncate max-w-[160px] ${entry.titleColor === 'rainbow' ? 'title-rainbow' : ''}`}
              style={entry.titleColor === 'rainbow' ? undefined : { color: entry.titleColor ?? '#ffc94a' }}
            >
              « {entry.title} »
            </span>
          )}
        </div>
      </div>

      {/* Trophées */}
      {row.trophies > 0 && (
        <span className="hidden sm:inline-flex items-center gap-0.5 shrink-0 text-[11px] font-bold text-gold tabular-nums" title={`${row.trophies} trophée(s)`}>
          <Trophy className="w-3 h-3" strokeWidth={2.4} />
          {row.trophies}
        </span>
      )}

      {/* Win rate (si a joué) */}
      {row.games > 0 ? (
        <div className="hidden md:block w-[120px] shrink-0" title={`${row.wins}V · ${row.losses}D · ${row.winRate}%`}>
          <WinRateBar wins={row.wins} losses={row.losses} />
        </div>
      ) : (
        <span className="hidden md:inline text-[10px] text-muted/50 uppercase tracking-wide shrink-0 w-[120px] text-center">
          Non classé
        </span>
      )}

      {/* Parties */}
      <span className="shrink-0 w-10 text-right tabular-nums text-xs text-muted-2" title="Parties jouées">
        {row.games}
      </span>

      {/* ELO + palier */}
      <span className="shrink-0 inline-flex items-center gap-1.5 font-display font-extrabold tabular-nums text-sm text-gold">
        <RankBadge elo={entry.elo} rank={entry.rank} size="xs" showLabel={false} />
        {entry.elo}
      </span>
    </div>
  );
}

// ─── Carte joueur compacte (vue grille, côte à côte) ──────────────────────────
// Même info que la ligne, condensée sur ~1/3 de largeur : entête (avatar + login +
// campus/titre) puis pied (ELO + parties/WR + trophées) et une fine barre V/D.
function DirectoryCard({ row, isMe }: { row: Row; isMe: boolean }) {
  const { entry } = row;
  return (
    <div
      className={`flex flex-col gap-1.5 px-2.5 py-2 rounded-xl border transition-colors ${
        isMe
          ? 'border-gold/50 bg-gold/[0.08]'
          : 'border-border/60 bg-bg-1/50 hover:bg-bg-2/60'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="relative shrink-0">
          <Avatar login={entry.login} imageUrl={entry.imageUrl} size="sm" />
          {row.onFire && (
            <Flame
              className="absolute -top-1 -right-1 w-3.5 h-3.5 text-[#ff8c3a]"
              strokeWidth={2.5}
              fill="currentColor"
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <PlayerLink login={entry.login} className={`text-sm font-bold truncate ${isMe ? 'text-gold' : 'text-text-strong'}`}>
              {entry.login}
            </PlayerLink>
            {row.goat && <BadgeChip code="goat" size="xs" iconOnly />}
            {row.champion && (
              <span title="A remporté un tournoi" className="text-[#c084fc] shrink-0">
                <Trophy className="w-3 h-3" strokeWidth={2.5} />
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            {entry.campus && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-2 truncate max-w-[80px]">
                {entry.campus}
              </span>
            )}
            {entry.title && (
              <span
                className={`text-[10px] italic truncate ${entry.titleColor === 'rainbow' ? 'title-rainbow' : ''}`}
                style={entry.titleColor === 'rainbow' ? undefined : { color: entry.titleColor ?? '#ffc94a' }}
              >
                « {entry.title} »
              </span>
            )}
          </div>
        </div>

        <span className="shrink-0 inline-flex items-center gap-1 font-display font-extrabold tabular-nums text-sm text-gold">
          <RankBadge elo={entry.elo} rank={entry.rank} size="xs" showLabel={false} />
          {entry.elo}
        </span>
      </div>

      {/* Pied : parties · WR · trophées, puis fine barre V/D (si a joué) */}
      <div className="flex items-center gap-2 text-[10px] text-muted-2 tabular-nums">
        {row.games > 0 ? (
          <>
            <span title="Parties · win rate">{row.games} pt · {row.winRate}%</span>
            <div className="flex-1 min-w-0" title={`${row.wins}V · ${row.losses}D`}>
              <WinRateBar wins={row.wins} losses={row.losses} />
            </div>
          </>
        ) : (
          <span className="flex-1 uppercase tracking-wide text-muted/50">Non classé</span>
        )}
        {row.trophies > 0 && (
          <span className="inline-flex items-center gap-0.5 shrink-0 font-bold text-gold" title={`${row.trophies} trophée(s)`}>
            <Trophy className="w-3 h-3" strokeWidth={2.4} />
            {row.trophies}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Primitives UI ────────────────────────────────────────────────────────────
function Select({
  value,
  onChange,
  title,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title={title}
      className="h-9 px-2.5 bg-bg-1 border border-border rounded-lg text-xs font-bold text-text focus:border-gold outline-none transition-colors cursor-pointer max-w-[180px]"
    >
      {children}
    </select>
  );
}

function FilterChip({
  active,
  onClick,
  color = '#ffc94a',
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-[11px] font-bold uppercase tracking-wide transition-colors"
      style={{
        color: active ? '#1a1100' : color,
        borderColor: `${color}55`,
        background: active ? color : `${color}14`,
      }}
    >
      {children}
    </button>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {label} : <span className="text-gold tabular-nums">{value}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-gold cursor-pointer"
      />
    </label>
  );
}

function NumInput({
  value,
  placeholder,
  onChange,
}: {
  value: number | null;
  placeholder: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? null : Number(v));
      }}
      className="w-[72px] h-8 px-2 bg-bg-1 border border-border rounded-lg text-xs font-bold text-text-strong focus:border-gold outline-none tabular-nums"
    />
  );
}
