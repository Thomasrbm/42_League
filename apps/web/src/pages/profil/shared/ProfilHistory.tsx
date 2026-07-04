import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Users } from 'lucide-react';
import type { Game, PlayedFfa, PlayedMatch } from '../../../lib/api';
import { GAME_META } from '../../../lib/gameMeta';
import { pickRating, type RatingSource } from '../../../lib/gameStats';
import { useLeagueData } from '../../../hooks/useLeagueData';
import { useI18n, useT } from '../../../lib/i18n';
import type { MyDartsStat } from '../../historique/shared/useHistoriqueLogic';
import { MyDartsCard } from '../../historique/shared/MatchCards';
import { SeasonFilterSelect } from '../../../components/SeasonFilterSelect';
import { RecentMatchRow } from './RecentMatchRow';

// Catégorie filtrable : une discipline (Game, dont 'flechettes') OU le 2v2 babyfoot
// (mode distinct du 1v1, son propre ELO). 'all' = tout mélangé.
type Filter = 'all' | Game | '2v2';

// Ordre d'affichage des onglets (les catégories absentes sont retirées).
const FILTER_ORDER: (Game | '2v2')[] = [
  'babyfoot', '2v2', 'smash', 'streetfighter', 'chess', 'flechettes',
];

// Catégorie d'un match : 2v2 si mode équipe, sinon sa discipline.
function matchCategory(m: PlayedMatch): Game | '2v2' {
  return m.mode === '2v2' ? '2v2' : ((m.game ?? 'babyfoot') as Game);
}

// Couleur/libellé/icône d'une catégorie d'onglet.
function categoryMeta(cat: Game | '2v2'): { label: string; color: string; icon?: ReactNode } {
  if (cat === '2v2') {
    return { label: '2v2', color: '#eab308', icon: <Users className="w-3.5 h-3.5" strokeWidth={2.5} /> };
  }
  const m = GAME_META[cat];
  return { label: m.shortLabel, color: m.color, icon: m.icon(true) };
}

interface ProfilHistoryProps {
  /** Login du joueur dont on affiche l'historique (perspective « moi »). */
  login: string;
  /** Historique global (GET /matches) — filtré ici par joueur + catégorie. */
  matches: PlayedMatch[];
  /** Manches de fléchettes (GET /matches/darts) — filtrées ici par participant. */
  darts?: PlayedFfa[];
  /** Source de rating du joueur — pour afficher l'ELO de la catégorie filtrée. */
  user?: RatingSource;
  /** Nb max de lignes affichées (20 desktop, 10 mobile). */
  limit?: number;
  /** Affiche le lien « voir tout l'historique » sous la liste (mobile). */
  showFullHistoryLink?: boolean;
}

// Élément d'historique unifié : un match 1v1/2v2 OU une manche de fléchettes.
type HistItem =
  | { kind: 'match'; id: string; at: number; cat: Game | '2v2'; match: PlayedMatch }
  | { kind: 'darts'; id: string; at: number; cat: 'flechettes'; stat: MyDartsStat };

/**
 * Historique de match d'un profil, filtrable par catégorie — partagé entre le
 * profil perso (desktop + mobile) et la fiche d'un autre joueur (PlayerPage).
 * Découplé du sélecteur de mode global : « Tous » mélange tout (chaque ligne
 * porte sa pastille), sinon on isole une catégorie. Le 2v2 babyfoot est une
 * catégorie À PART du 1v1 (ELO + historique distincts) et les fléchettes y sont
 * intégrées (modèle FFA, table séparée). On n'affiche que les onglets des
 * catégories réellement jouées par ce joueur.
 */
export function ProfilHistory({
  login,
  matches,
  darts = [],
  user,
  limit = 20,
  showFullHistoryLink = false,
}: ProfilHistoryProps) {
  const t = useT();
  const { lang } = useI18n();
  const { leaderboard, activeSeasonId } = useLeagueData();
  const [filter, setFilter] = useState<Filter>('all');
  // '' = saison en cours (défaut), 'all' = toutes, sinon une saison passée.
  const [seasonFilter, setSeasonFilter] = useState('');
  const seasonId =
    seasonFilter === '' ? activeSeasonId : seasonFilter === 'all' ? null : seasonFilter;

  const imgByLogin = useMemo(
    () => new Map(leaderboard.map((u) => [u.login, u.imageUrl ?? null])),
    [leaderboard],
  );

  // Tous mes éléments (matchs + fléchettes), du plus récent au plus ancien.
  // Cloisonné par saison (défaut : saison en cours).
  const items = useMemo<HistItem[]>(() => {
    const mineMatches = matches.filter(
      (m) =>
        (!seasonId || m.seasonId === seasonId) &&
        (m.playerALogin === login ||
          m.playerBLogin === login ||
          m.playerA2Login === login ||
          m.playerB2Login === login),
    );
    const matchItems: HistItem[] = mineMatches.map((m) => ({
      kind: 'match',
      id: m.id,
      at: +new Date(m.playedAt),
      cat: matchCategory(m),
      match: m,
    }));
    const dartItems: HistItem[] = darts
      .filter((d) => !seasonId || d.seasonId === seasonId)
      .map((d): HistItem | null => {
        const me = d.participants.find((p) => p.login === login);
        if (!me) return null;
        return {
          kind: 'darts',
          id: d.id,
          at: +new Date(d.playedAt),
          cat: 'flechettes',
          stat: { ffa: d, myPosition: me.position, myDelta: me.delta, total: d.participants.length },
        };
      })
      .filter((x): x is HistItem => x !== null);
    return [...matchItems, ...dartItems].sort((a, b) => b.at - a.at);
  }, [matches, darts, login, seasonId]);

  // Catégories réellement présentes (pour n'afficher que ces onglets).
  const categories = useMemo(() => {
    const present = new Set<Game | '2v2'>();
    for (const it of items) present.add(it.cat);
    return FILTER_ORDER.filter((c) => present.has(c));
  }, [items]);

  const shown = useMemo(
    () => (filter === 'all' ? items : items.filter((it) => it.cat === filter)).slice(0, limit),
    [items, filter, limit],
  );

  // ELO de la catégorie filtrée (un ELO PAR MODE) — null pour « Tous » / sans user.
  const filterElo = useMemo<number | null>(() => {
    if (!user || filter === 'all') return null;
    if (filter === '2v2') return user.eloBabyfoot2v2 ?? 1000;
    return pickRating(user, filter).elo;
  }, [user, filter]);

  return (
    <div>
      {/* Sélecteur de saison — toujours visible (pour revenir à « toutes » même si
          la saison en cours est vide). */}
      <div className="flex justify-end mb-3">
        <SeasonFilterSelect value={seasonFilter} onChange={setSeasonFilter} />
      </div>

      {/* Filtre par catégorie — uniquement si le joueur a touché à ≥2 catégories. */}
      {categories.length >= 2 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label={t('profil.histFilter.all')} />
          {categories.map((c) => {
            const meta = categoryMeta(c);
            return (
              <FilterPill
                key={c}
                active={filter === c}
                onClick={() => setFilter(c)}
                label={meta.label}
                color={meta.color}
                icon={meta.icon}
              />
            );
          })}
          {filterElo != null && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-mono font-extrabold tabular-nums text-text-strong">
              <span className="text-[9px] uppercase tracking-wider text-muted-2 font-sans">ELO</span>
              {filterElo}
            </span>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-2">{t('profil.noMatchYet')}</div>
      ) : (
        <div className="space-y-1.5">
          {shown.map((it, i) =>
            it.kind === 'darts' ? (
              <MyDartsCard key={it.id} stat={it.stat} lang={lang} imgByLogin={imgByLogin} delay={i * 0.03} />
            ) : (
              <RecentMatchRow key={it.id} match={it.match} ownerLogin={login} delay={i * 0.03} />
            ),
          )}
          {showFullHistoryLink && (
            <Link
              to="/history"
              className="flex items-center justify-center gap-1 py-2.5 mt-2 text-xs font-bold text-muted-2 hover:text-teal uppercase tracking-wider tap-transparent transition-colors"
            >
              {t('profil.seeFullHistory')}
              <ChevronRight className="w-3 h-3" strokeWidth={2.5} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** Pastille de filtre. Active = remplie de la couleur de la catégorie (gris neutre
 *  pour « Tous ») avec texte sombre ; inactive = contour discret. */
function FilterPill({
  active,
  onClick,
  label,
  color = '#d4d4d8',
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tap-transparent transition-colors border ' +
        (active
          ? 'border-transparent'
          : 'bg-bg-1/40 border-border/60 text-muted-2 hover:text-text-strong')
      }
      style={active ? { backgroundColor: color, color: '#0b0e12', borderColor: color } : undefined}
    >
      {icon && <span className="inline-flex w-4 h-4 items-center justify-center">{icon}</span>}
      {label}
    </button>
  );
}
