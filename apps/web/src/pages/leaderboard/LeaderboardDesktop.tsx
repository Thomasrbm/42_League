import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp, ChevronDown, Flame, Snowflake, Skull, LocateFixed } from 'lucide-react';
import { api, type Season, type SeasonStanding, type LeaderboardEntry, type PlayedMatch } from '../../lib/api';
import { Panel } from '../../components/Panel';
import { PlayerLink } from '../../components/PlayerLink';
import { Avatar } from '../../components/Avatar';
import { OnlineBadge } from '../../components/OnlineBadge';
import { Tooltip } from '../../components/Tooltip';
import { WinRateBar } from '../../components/WinRateBar';
import { RankBadge } from '../../components/RankBadge';
import { BadgeChip } from '../../components/Badges';
import { DesktopPodium } from './DesktopPodium';
import { LeaderboardBanner } from '../../components/LeaderboardBanner';
import { LeaderboardScatter, RankingViewToggle, GradesNavButton, type RankingView, type LeaderboardScatterHandle } from './LeaderboardScatter';
import { GoatView } from '../GoatPage';
import { TeamLeaderboard } from './TeamLeaderboard';
import { RankingScopeToggle } from './RankingScopeToggle';
import { CampusScopeToggle, useCampusScope, filterByCampus, hasCampusInfo } from './campusScope';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useGameMode } from '../../hooks/useGameMode';
import { useT } from '../../lib/i18n';

type LeaderboardTab = 'personal' | 'teams';

// ─── Stats dérivées par joueur ───────────────────────────────────────────────
/** Adversaire ayant mis fin à une plus longue série (photo Intra pour le tooltip). */
interface StreakBreaker {
  login: string;
  imageUrl: string | null;
}

interface PlayerStats {
  wins: number;
  losses: number;
  games: number;
  winRate: number; // 0–100
  /** Série en cours : positif = victoires consécutives, négatif = défaites. */
  streak: number;
  /** Plus longue série de victoires consécutives. */
  maxWinStreak: number;
  /** Plus longue série de défaites consécutives. */
  maxLossStreak: number;
  /** Qui a brisé la plus longue série de V (l'a battu). null si série encore en cours. */
  maxWinBreaker: StreakBreaker | null;
  /** Qui a mis fin à la plus longue série de D (battu par le joueur). null si en cours. */
  maxLossBreaker: StreakBreaker | null;
}

const EMPTY_STATS: PlayerStats = {
  wins: 0,
  losses: 0,
  games: 0,
  winRate: 0,
  streak: 0,
  maxWinStreak: 0,
  maxLossStreak: 0,
  maxWinBreaker: null,
  maxLossBreaker: null,
};

interface LeaderboardStats {
  /** Matchs du jeu courant (filtre déjà appliqué). */
  matches: PlayedMatch[];
  /** Stats dérivées par login. */
  stats: Map<string, PlayerStats>;
}

/**
 * Calcul lourd des stats du leaderboard (filtre matchs + W/L + séries) extrait du
 * composant pour bénéficier d'un cache au niveau module : keyé sur les références
 * stables `allMatches`/`leaderboard`/`game` (qui ne changent qu'au refetch), il
 * survit aux démontages/remontages de page. Un `useMemo` de composant repartirait
 * de zéro à chaque navigation, ce qui était la principale cause de lag.
 */
let _statsCache: ({ allMatches: PlayedMatch[]; leaderboard: LeaderboardEntry[]; game: string } & LeaderboardStats) | null = null;

function computeLeaderboardStats(
  allMatches: PlayedMatch[],
  leaderboard: LeaderboardEntry[],
  game: string,
): LeaderboardStats {
  if (
    _statsCache &&
    _statsCache.allMatches === allMatches &&
    _statsCache.leaderboard === leaderboard &&
    _statsCache.game === game
  ) {
    return _statsCache;
  }

  const matches = allMatches.filter((m) => (m.game ?? 'babyfoot') === game);
  const map = new Map<string, PlayerStats>();
  for (const u of leaderboard) {
    map.set(u.login, { ...EMPTY_STATS });
  }

  // W/L cumulés
  for (const m of matches) {
    if (m.winner === 'draw') continue; // nulle : ni V ni D
    for (const login of [m.playerALogin, m.playerBLogin]) {
      const cur = map.get(login);
      if (!cur) continue;
      const isA = m.playerALogin === login;
      const won = (isA && m.winner === 'A') || (!isA && m.winner === 'B');
      if (won) cur.wins++;
      else cur.losses++;
    }
  }

  // Photo Intra par login (pour le tooltip « brisée par … »).
  const infoByLogin = new Map<string, string | null>();
  for (const u of leaderboard) infoByLogin.set(u.login, u.imageUrl);

  // Série en cours : on parcourt les matches récents → anciens par joueur.
  const byPlayer = new Map<string, { won: boolean; at: number; opp: string }[]>();
  for (const m of matches) {
    if (m.winner === 'draw') continue; // nulle : hors série V/D
    for (const login of [m.playerALogin, m.playerBLogin]) {
      if (!map.has(login)) continue;
      const isA = m.playerALogin === login;
      const won = (isA && m.winner === 'A') || (!isA && m.winner === 'B');
      const opp = isA ? m.playerBLogin : m.playerALogin;
      const arr = byPlayer.get(login) ?? [];
      arr.push({ won, at: new Date(m.playedAt).getTime(), opp });
      byPlayer.set(login, arr);
    }
  }
  for (const [login, results] of byPlayer) {
    results.sort((a, b) => b.at - a.at);
    let streak = 0;
    const first = results[0];
    if (first) {
      for (const r of results) {
        if (r.won === first.won) streak++;
        else break;
      }
      if (!first.won) streak = -streak;
    }
    // Plus longues séries (V / D) + qui y a mis fin. On parcourt en ordre
    // chronologique (ancien → récent). Un run n'est comptabilisé qu'à sa
    // CLÔTURE (match de signe opposé) : c'est cet adversaire qui « brise » la
    // série. Le run final, jamais clos, est le record « en cours » → pas de
    // briseur (on ne montrera pas « brisée par … »).
    const chrono = results.slice().reverse();
    let maxWin = 0;
    let maxLoss = 0;
    let winBreaker: string | null = null; // adversaire qui a battu le joueur
    let lossBreaker: string | null = null; // adversaire battu par le joueur
    let winOngoing = false;
    let lossOngoing = false;
    let run = 0;
    let runSign: 'W' | 'L' | null = null;
    for (const r of chrono) {
      const sign: 'W' | 'L' = r.won ? 'W' : 'L';
      if (runSign === null || sign === runSign) {
        run++;
        runSign = sign;
        continue;
      }
      // Le run précédent (runSign) est clos par r (signe opposé) → r.opp l'a brisé.
      if (runSign === 'W') {
        if (run > maxWin) { maxWin = run; winBreaker = r.opp; winOngoing = false; }
      } else if (run > maxLoss) {
        maxLoss = run; lossBreaker = r.opp; lossOngoing = false;
      }
      run = 1;
      runSign = sign;
    }
    // Run final encore ouvert : record « en cours » s'il bat les précédents.
    if (runSign === 'W') {
      if (run > maxWin) { maxWin = run; winOngoing = true; winBreaker = null; }
    } else if (runSign === 'L' && run > maxLoss) {
      maxLoss = run; lossOngoing = true; lossBreaker = null;
    }

    const s = map.get(login)!;
    s.streak = streak;
    s.maxWinStreak = maxWin;
    s.maxLossStreak = maxLoss;
    s.maxWinBreaker = winBreaker && !winOngoing
      ? { login: winBreaker, imageUrl: infoByLogin.get(winBreaker) ?? null }
      : null;
    s.maxLossBreaker = lossBreaker && !lossOngoing
      ? { login: lossBreaker, imageUrl: infoByLogin.get(lossBreaker) ?? null }
      : null;
  }

  for (const s of map.values()) {
    s.games = s.wins + s.losses;
    s.winRate = s.games === 0 ? 0 : Math.round((s.wins / s.games) * 100);
  }

  _statsCache = { allMatches, leaderboard, game, matches, stats: map };
  return _statsCache;
}

type SortKey =
  | 'rank'
  | 'player'
  | 'elo'
  | 'games'
  | 'winRate'
  | 'wins'
  | 'losses'
  | 'streak'
  | 'maxWin'
  | 'maxLoss'
  | 'titles';
type SortDir = 'asc' | 'desc';

/**
 * Vue desktop du leaderboard — tracker esport.
 * Podium 3D pour le Top 3 + tableau dense avec colonnes triables
 * (games, win rate, W/L, série, titres).
 */
export function LeaderboardDesktop() {
  const t = useT();
  const { leaderboard, matches: allMatches, me, allOps, locations, activeSeasonId } = useLeagueData();
  const { game } = useGameMode();
  const myLogin = me?.login;

  // Cloisonnement par campus : par défaut le joueur ne voit que son campus ; la
  // bascule « Inter-campus » (ouverte à tous) lève le filtre. ELO global inchangé,
  // on ne filtre que l'affichage (cf. campusScope).
  const { scope: campusScope, setScope: setCampusScope, myCampus } = useCampusScope();

  const showTeamsTab = game === 'babyfoot';
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('personal');
  useEffect(() => {
    if (game !== 'babyfoot') setActiveTab('personal');
  }, [game]);
  // Le classement courant est celui du mode (babyfoot|smash) → stats dérivées sur
  // les matchs de ce jeu uniquement. Calcul lourd déporté dans une fonction cachée
  // au niveau module (cf. computeLeaderboardStats) → instantané en revenant sur la
  // page tant que les données n'ont pas changé.
  //
  // Cloisonnement par saison : les séries / win-rate du classement LIVE ne comptent
  // que les matchs de la saison active (l'ELO ayant déjà été reset à la clôture, les
  // stats doivent repartir de zéro elles aussi). On garde `allMatches` complet pour
  // le GOAT (cross-saison) et les snapshots de saisons passées. activeSeasonId null
  // (pas encore chargé / aucune saison) → repli sur tout l'historique.
  const liveMatches = useMemo(
    () => (activeSeasonId ? allMatches.filter((m) => m.seasonId === activeSeasonId) : allMatches),
    [allMatches, activeSeasonId],
  );
  const { stats: statsByLogin } = useMemo(
    () => computeLeaderboardStats(liveMatches, leaderboard, game),
    [liveMatches, leaderboard, game],
  );

  // ─── Vue (liste / nuage) ─────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<RankingView>('list');

  // ─── Saison affichée : '' = en cours (live), sinon snapshot d'une saison passée ───
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string>('');
  const [standings, setStandings] = useState<SeasonStanding[] | null>(null);

  useEffect(() => {
    api.seasons().then(setSeasons).catch(() => {});
  }, []);

  useEffect(() => {
    if (!seasonId) {
      setStandings(null);
      return;
    }
    let alive = true;
    api.seasonStandings(seasonId, game).then((s) => alive && setStandings(s)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [seasonId, game]);

  const viewingPast = standings !== null;

  // Matchs de la saison affichée : en saison passée, on ne garde que ceux taggés
  // de son seasonId. La saison BETA précède le tagging → 0 match rattaché : on la
  // détecte ainsi (seasonHasMatches=false) pour masquer la vue G.O.A.T (et les
  // séries), non recalculables sans historique. Nuage + Liste restent dispo.
  const seasonMatches = useMemo(
    () => (standings ? allMatches.filter((m) => m.seasonId === seasonId) : allMatches),
    [standings, allMatches, seasonId],
  );
  const seasonHasMatches = !viewingPast || seasonMatches.length > 0;

  // Photos par login (les snapshots de saison ne stockent pas l'imageUrl → on
  // réutilise la photo actuelle du joueur, prise dans le classement courant).
  const imgByLogin = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const u of leaderboard) m.set(u.login, u.imageUrl);
    return m;
  }, [leaderboard]);

  // Données affichées : live (classement courant) ou snapshot d'une saison passée.
  // Le snapshot ne contient que login/rang/elo/V/D. Pour une saison V1 (matchs
  // taggés), on recalcule les séries réelles depuis ses matchs ; pour la BETA
  // (0 match rattaché), on se contente des V/D du snapshot (séries vides).
  const { entries, rowStats } = useMemo<{
    entries: LeaderboardEntry[];
    rowStats: Map<string, PlayerStats>;
  }>(() => {
    if (!standings) {
      // Vue LIVE : seuls les joueurs ayant disputé ≥ 1 partie cette saison sont
      // classés — l'ELO de base (1000) ne suffit pas à figurer au classement. On
      // re-numérote les rangs de façon contiguë par ELO décroissant (le back classe
      // TOUS les joueurs, y compris ceux à 0 partie qui, après reset au plancher de
      // grade, peuvent squatter un rang). `leaderboard` est déjà trié par ELO desc.
      const ranked = leaderboard
        .filter((u) => (u.matchesPlayed ?? 0) > 0)
        .map((u, i) => ({ ...u, rank: i + 1 }));
      return { entries: ranked, rowStats: statsByLogin };
    }
    const e = standings.map(
      (s): LeaderboardEntry => ({
        rank: s.rank,
        login: s.login,
        elo: s.elo,
        imageUrl: imgByLogin.get(s.login) ?? null,
        matchesPlayed: s.wins + s.losses,
        campus: null,
      }),
    );
    // V1 : historique match par match disponible → stats complètes (séries incluses).
    if (seasonMatches.length > 0) {
      return { entries: e, rowStats: computeLeaderboardStats(seasonMatches, e, game).stats };
    }
    // BETA : pas d'historique taggé → V/D figés du snapshot, séries vides.
    const st = new Map<string, PlayerStats>();
    for (const s of standings) {
      const games = s.wins + s.losses;
      st.set(s.login, {
        ...EMPTY_STATS,
        wins: s.wins,
        losses: s.losses,
        games,
        winRate: games === 0 ? 0 : Math.round((s.wins / games) * 100),
      });
    }
    return { entries: e, rowStats: st };
  }, [standings, imgByLogin, leaderboard, statsByLogin, seasonMatches, game]);

  // Cloisonnement campus : on filtre les entrées affichées puis on re-numérote les
  // rangs de façon contiguë (un classement « de campus » commence à #1). En vue
  // Inter-campus, ou sans campus rattaché, rien n'est retiré. Les snapshots non
  // taggés (campus inconnu) restent globaux (cf. filterByCampus).
  const scopedEntries = useMemo<LeaderboardEntry[]>(
    () => filterByCampus(entries, campusScope, myCampus).map((e, i) => ({ ...e, rank: i + 1 })),
    [entries, campusScope, myCampus],
  );

  // Snapshot d'une saison antérieure au tagging campus, demandé en vue « Mon
  // campus » : on a affiché le classement global faute de mieux → on le signale.
  const campusLegacySnapshot =
    viewingPast && campusScope === 'mine' && !!myCampus && !hasCampusInfo(entries);

  // Win rate par login — abscisse du nuage de points. Dérivé de rowStats pour
  // suivre la saison affichée (live ou snapshot passé).
  const scatterWinRates = useMemo(() => {
    const m = new Map<string, number>();
    for (const [login, s] of rowStats) m.set(login, s.winRate);
    return m;
  }, [rowStats]);

  // Top 3 par rang officiel (ELO) — pour le podium (scopé campus).
  const top3 = useMemo(
    () => [...scopedEntries].sort((a, b) => a.rank - b.rank).slice(0, 3),
    [scopedEntries],
  );

  // Leaderboard live complet filtré campus → alimente le G.O.A.T live (pool
  // cross-saison : on garde TOUS les joueurs du campus, pas seulement les classés).
  const goatLiveLeaderboard = useMemo(
    () => filterByCampus(leaderboard, campusScope, myCampus),
    [leaderboard, campusScope, myCampus],
  );

  const podiumStats = useMemo(() => {
    const m = new Map<string, { winRate: number; games: number }>();
    for (const u of top3) {
      const s = rowStats.get(u.login);
      m.set(u.login, { winRate: s?.winRate ?? 0, games: s?.games ?? 0 });
    }
    return m;
  }, [top3, rowStats]);

  // ─── Tri ───────────────────────────────────────────────────────────────────
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'rank', dir: 'asc' });

  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      // Par défaut : 'player' monte (A→Z), les colonnes numériques descendent.
      return { key, dir: key === 'player' || key === 'rank' ? 'asc' : 'desc' };
    });
  };

  const sortedRows = useMemo(() => {
    const rows = scopedEntries.map((u) => ({
      entry: u,
      stats: rowStats.get(u.login) ?? EMPTY_STATS,
    }));
    const dir = sort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case 'rank':
          cmp = a.entry.rank - b.entry.rank;
          break;
        case 'player':
          cmp = a.entry.login.localeCompare(b.entry.login);
          break;
        case 'elo':
          cmp = a.entry.elo - b.entry.elo;
          break;
        case 'games':
          cmp = a.stats.games - b.stats.games;
          break;
        case 'winRate':
          cmp = a.stats.winRate - b.stats.winRate;
          break;
        case 'wins':
          cmp = a.stats.wins - b.stats.wins;
          break;
        case 'losses':
          cmp = a.stats.losses - b.stats.losses;
          break;
        case 'streak':
          cmp = a.stats.streak - b.stats.streak;
          break;
        case 'maxWin':
          cmp = a.stats.maxWinStreak - b.stats.maxWinStreak;
          break;
        case 'maxLoss':
          cmp = a.stats.maxLossStreak - b.stats.maxLossStreak;
          break;
        case 'titles':
          cmp = (a.entry.tournamentsWon ?? 0) - (b.entry.tournamentsWon ?? 0);
          break;
      }
      // Départage stable par rang officiel.
      if (cmp === 0) cmp = a.entry.rank - b.entry.rank;
      return cmp * dir;
    });
    return rows;
  }, [scopedEntries, rowStats, sort]);

  // Bouton « Où suis-je ? » : recentre sur le joueur courant dans les 3 vues.
  //  • Liste / G.O.A.T → défile jusqu'à l'élément #lb-me-row.
  //  • Nuage → commande impérative du nuage (pan/zoom interne, pas de scroll).
  // (Plus d'auto-scroll au montage — déclenché à la demande via le bouton.)
  const scatterRef = useRef<LeaderboardScatterHandle>(null);
  const scrollToMe = useCallback(() => {
    if (viewMode === 'graph') {
      scatterRef.current?.locateMe();
      return;
    }
    const el = document.getElementById('lb-me-row');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [viewMode]);

  // Saison BETA sélectionnée alors qu'on était sur la vue G.O.A.T (indisponible) →
  // bascule sur la liste pour ne pas rester sur une vue vide.
  useEffect(() => {
    if (viewMode === 'goat' && !seasonHasMatches) setViewMode('list');
  }, [viewMode, seasonHasMatches]);

  return (
    <div>
      {!viewingPast && <LeaderboardBanner />}

      {activeTab !== 'teams' && top3.length === 3 && (
        <DesktopPodium top3={top3} statsByLogin={podiumStats} past={viewingPast} />
      )}

      <Panel title={t('panel.lb.title')} sub={`${scopedEntries.length} ${t('panel.lb.sub')}`} accent="crown">
        {/* Onglets Personnel / Équipes — Babyfoot uniquement */}
        {showTeamsTab && (
          <div className="mb-4 max-w-xs">
            <RankingScopeToggle
              value={activeTab}
              onChange={setActiveTab}
              choices={[
                { value: 'personal' as LeaderboardTab, label: t('lb.tab.solo') },
                { value: 'teams' as LeaderboardTab, label: t('lb.tab.teams') },
              ]}
            />
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'teams' ? (
            <motion.div
              key="teams"
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <TeamLeaderboard
                campusScope={campusScope}
                onCampusScopeChange={setCampusScope}
                myCampus={myCampus}
              />
            </motion.div>
          ) : (
            <motion.div
              key="personal"
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 14 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >

        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <SeasonSelect seasons={seasons} value={seasonId} onChange={setSeasonId} currentLabel={t('lb.season.current')} />
            <CampusScopeToggle value={campusScope} onChange={setCampusScope} myCampus={myCampus} />
          </div>
          <div className="flex items-center gap-2">
            {myLogin && sortedRows.some((r) => r.entry.login === myLogin) && (
              <button
                type="button"
                onClick={scrollToMe}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gold/30 bg-gold/10 text-gold text-xs font-semibold hover:bg-gold/15 hover:border-gold/50 transition-colors"
              >
                <LocateFixed className="w-3.5 h-3.5" strokeWidth={2.4} />
                {t('lb.whereAmI')}
              </button>
            )}
            <RankingViewToggle view={viewMode} onChange={setViewMode} showGoat={seasonHasMatches} />
            <GradesNavButton />
          </div>
        </div>
        {!viewingPast && (
          <p className="text-[11px] text-muted-2/80 mb-3 -mt-1 leading-snug">
            {t('lb.unranked.note')}
          </p>
        )}
        {campusLegacySnapshot && (
          <p className="text-[11px] text-amber-400/80 mb-3 -mt-1 leading-snug">
            {t('lb.campus.legacyNote')}
          </p>
        )}
        {scopedEntries.length === 0 ? (
          <div className="text-center text-muted-2 py-10">
            {viewingPast ? t('lb.snapshot.empty') : t('lb.unranked.empty')}
          </div>
        ) : viewMode === 'goat' && seasonHasMatches ? (
          viewingPast ? (
            <GoatView leaderboard={scopedEntries} matches={seasonMatches} />
          ) : (
            <GoatView leaderboard={goatLiveLeaderboard} matches={allMatches} />
          )
        ) : viewMode === 'graph' ? (
          <LeaderboardScatter
            ref={scatterRef}
            entries={scopedEntries}
            myLogin={myLogin}
            winRates={scatterWinRates}
            className="h-[640px]"
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="font-gaming text-[10px] uppercase tracking-[0.14em] text-gold/80 font-extrabold">
                  <SortTh label="#" k="rank" sort={sort} onSort={toggleSort} align="left" />
                  <SortTh label={t('lb.col.player')} k="player" sort={sort} onSort={toggleSort} align="left" />
                  <SortTh label={t('lb.col.elo')} k="elo" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label={t('lb.col.games')} k="games" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label={t('lb.col.winrate')} k="winRate" sort={sort} onSort={toggleSort} align="center" />
                  <SortTh label={t('lb.col.streak')} k="streak" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label={t('lb.col.streak.win')} k="maxWin" sort={sort} onSort={toggleSort} align="right" tone="gold" />
                  <SortTh label={t('lb.col.streak.loss')} k="maxLoss" sort={sort} onSort={toggleSort} align="right" tone="red" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(({ entry: u, stats }) => {
                  const isMe = u.login === myLogin;
                  // Indicateurs temps réel (Ops, en ligne) : sans objet sur un
                  // classement figé d'une saison passée → on les masque.
                  const targetedBy = viewingPast ? undefined : allOps.find((o) => o.targetLogin === u.login);
                  const host = viewingPast ? undefined : locations.get(u.login);
                  const rankCls =
                    u.rank === 1
                      ? 'text-gold'
                      : u.rank === 2
                        ? 'text-muted-2'
                        : u.rank === 3
                          ? 'text-[#cd7f32]'
                          : 'text-muted';
                  return (
                    <tr
                      key={u.login}
                      id={isMe ? 'lb-me-row' : undefined}
                      className={
                        'group border-t border-gold/10 transition-colors scroll-mt-24 ' +
                        (isMe
                          ? 'bg-gold/[0.06] shadow-[inset_3px_0_0_0_rgba(255,201,74,0.7)]'
                          : 'hover:bg-gold/[0.04]')
                      }
                    >
                      <td className={`px-2 sm:px-3 py-2.5 font-display font-black tabular-nums ${rankCls}`}>
                        #{u.rank}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5">
                        <PlayerLink login={u.login}>
                          <div className="relative flex-shrink-0">
                            <Avatar login={u.login} imageUrl={u.imageUrl} size="sm" grayscale={viewingPast} />
                            {host && (
                              <OnlineBadge host={host} compact className="absolute -bottom-0.5 -right-0.5" />
                            )}
                          </div>
                          <span className="truncate max-w-[120px] sm:max-w-[150px] font-semibold">
                            {u.login}
                          </span>
                          {u.badges?.includes('goat') && (
                            <BadgeChip code="goat" size="xs" iconOnly />
                          )}
                          {isMe && (
                            <span className="text-[8px] font-extrabold text-[#1a1100] metal-plate-gold px-1.5 py-0.5 rounded-full uppercase tracking-wider ml-1">
                              {t('lb.me')}
                            </span>
                          )}
                          {targetedBy && (
                            <span
                              className="text-red ml-1"
                              title={`${t('lb.opsOf')} ${targetedBy.ownerLogin}`}
                            >
                              <Skull className="w-3 h-3 inline" strokeWidth={2.5} />
                            </span>
                          )}
                        </PlayerLink>
                        {u.title && (
                          <div
                            className={`text-[10px] italic mt-0.5 ml-10 truncate ${
                              u.titleColor === 'rainbow' ? 'title-rainbow' : ''
                            }`}
                            style={u.titleColor === 'rainbow' ? undefined : { color: u.titleColor ?? '#ffc94a' }}
                          >
                            « {u.title} »
                          </div>
                        )}
                      </td>
                      <td
                        className="px-2 sm:px-3 py-2.5 text-right tabular-nums font-display font-extrabold text-gold"
                        style={{ textShadow: '0 0 10px rgba(255,201,74,0.25)' }}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <RankBadge elo={u.elo} rank={u.rank} size="xs" showLabel={false} />
                          {u.elo}
                        </span>
                      </td>
                      <td className="px-1 sm:px-3 py-2.5 text-right tabular-nums text-muted-2">
                        {stats.games}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 min-w-[230px]">
                        <WinRateCell
                          winRate={stats.winRate}
                          games={stats.games}
                          wins={stats.wins}
                          losses={stats.losses}
                        />
                      </td>
                      <td className="px-1 sm:px-3 py-2.5 text-right">
                        <StreakCell streak={stats.streak} />
                      </td>
                      <td className="px-1 sm:px-3 py-2.5 text-right">
                        <MaxStreakCell value={stats.maxWinStreak} kind="win" breaker={stats.maxWinBreaker} />
                      </td>
                      <td className="px-1 sm:px-3 py-2.5 text-right">
                        <MaxStreakCell value={stats.maxLossStreak} kind="loss" breaker={stats.maxLossBreaker} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
            </motion.div>
          )}
        </AnimatePresence>

      </Panel>
    </div>
  );
}

// ─── Sélecteur de saison (en cours / saisons passées) ────────────────────────
function SeasonSelect({
  seasons,
  value,
  onChange,
  currentLabel,
}: {
  seasons: Season[];
  value: string;
  onChange: (v: string) => void;
  currentLabel: string;
}) {
  const past = seasons.filter((s) => !s.isActive);
  if (past.length === 0) return <div />;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 bg-bg-1 border border-border rounded-lg text-xs font-bold uppercase tracking-wider text-text focus:border-gold outline-none transition-colors"
    >
      <option value="">{currentLabel}</option>
      {past.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

// ─── En-tête de colonne triable ──────────────────────────────────────────────
function SortTh({
  label,
  k,
  sort,
  onSort,
  align,
  tone,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (k: SortKey) => void;
  align: 'left' | 'right' | 'center';
  tone?: 'gold' | 'red';
}) {
  const active = sort.key === k;
  const toneCls = tone === 'gold' ? 'text-gold' : tone === 'red' ? 'text-red' : '';
  return (
    <th
      className={`px-1 sm:px-3 py-2 border-b border-gold/20 select-none ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'}`}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 cursor-pointer transition-colors hover:text-gold ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${active ? 'text-gold' : toneCls || 'text-gold/70'}`}
      >
        <span>{label}</span>
        <span className="w-3 inline-flex justify-center">
          {active ? (
            sort.dir === 'asc' ? (
              <ChevronUp className="w-3 h-3" strokeWidth={3} />
            ) : (
              <ChevronDown className="w-3 h-3" strokeWidth={3} />
            )
          ) : (
            <ChevronDown className="w-3 h-3 opacity-20" strokeWidth={3} />
          )}
        </span>
      </button>
    </th>
  );
}

// ─── Cellule win rate — barre type OP.GG (W / L dans la jauge) ────────────────
// Le pourcentage se place À GAUCHE en jaune si win rate > 50, sinon À DROITE en
// rouge — repère visuel immédiat des joueurs au-dessus / en-dessous de 50 %.
function WinRateCell({
  winRate,
  games,
  wins,
  losses,
}: {
  winRate: number;
  games: number;
  wins: number;
  losses: number;
}) {
  const t = useT();
  if (games === 0) return <span className="text-muted/40 text-xs">—</span>;
  return (
    <Tooltip
      label={`${wins} ${t('lb.abbr.win')} · ${losses} ${t('lb.abbr.loss')} · ${winRate}%`}
      className="w-full"
    >
      <WinRateBar wins={wins} losses={losses} />
    </Tooltip>
  );
}

// ─── Cellule série en cours ──────────────────────────────────────────────────
// On n'affiche une série qu'à partir de 2 (une seule V ou D n'est pas une série) :
// en dessous, c'est « none ».
function StreakCell({ streak }: { streak: number }) {
  const t = useT();
  if (Math.abs(streak) < 2) {
    return <span className="text-muted/40 text-xs uppercase tracking-wide">{t('lb.streak.none')}</span>;
  }
  if (streak > 0) {
    return (
      <Tooltip label={`${streak} ${t('lb.streak.wins')} 🔥`}>
        <span className="inline-flex items-center gap-1 font-mono font-bold tabular-nums text-[#ff8c3a]">
          <Flame className="w-3.5 h-3.5" strokeWidth={2.5} fill="currentColor" />
          {streak}
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip label={`${Math.abs(streak)} ${t('lb.streak.losses')} ❄️`}>
      <span className="inline-flex items-center gap-1 font-mono font-bold tabular-nums text-[#5fb4ff]">
        <Snowflake className="w-3.5 h-3.5" strokeWidth={2.5} />
        {Math.abs(streak)}
      </span>
    </Tooltip>
  );
}

// ─── Cellule plus longue série (V ou D) ──────────────────────────────────────
// Même règle : une série commence à 2, sinon « - ». Au survol, si la série a été
// brisée par quelqu'un (record clos, pas « en cours »), le tooltip montre la
// photo Intra de l'adversaire qui y a mis fin.
function MaxStreakCell({
  value,
  kind,
  breaker,
}: {
  value: number;
  kind: 'win' | 'loss';
  breaker?: StreakBreaker | null;
}) {
  const t = useT();
  if (value < 2) {
    return <span className="text-muted/40 text-xs uppercase tracking-wide">{t('lb.streak.none')}</span>;
  }
  const isWin = kind === 'win';
  const color = isWin ? '#ff8c3a' : '#5fb4ff';
  const Icon = isWin ? Flame : Snowflake;
  const countLabel = `${value} ${isWin ? t('lb.streak.wins') : t('lb.streak.losses')} ${isWin ? '🔥' : '❄️'}`;
  // Tooltip enrichi (photo + « brisée par … ») uniquement si un briseur existe.
  const label = breaker ? (
    <span className="inline-flex items-center gap-2 py-0.5">
      <Avatar login={breaker.login} imageUrl={breaker.imageUrl} size="xs" />
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[9px] uppercase tracking-wider text-muted-2">
          {isWin ? t('lb.streak.brokenBy') : t('lb.streak.endedVs')}
        </span>
        <span className="font-semibold">@{breaker.login}</span>
      </span>
    </span>
  ) : (
    countLabel
  );
  return (
    <Tooltip label={label}>
      <span
        className="inline-flex items-center gap-1 font-mono font-bold tabular-nums"
        style={{ color }}
      >
        <Icon className="w-3.5 h-3.5" strokeWidth={2.5} fill={isWin ? 'currentColor' : 'none'} />
        {value}
      </span>
    </Tooltip>
  );
}
