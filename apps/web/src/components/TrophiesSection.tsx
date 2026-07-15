import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PlayerLink } from './PlayerLink';
import { Avatar, UserBadge } from './Avatar';
import { TiltCard } from './TiltCard';
import { useLeagueData } from '../hooks/useLeagueData';
import { useGameMode } from '../hooks/useGameMode';
import {
  computeTrophies,
  computeMixTrophies,
  type GameBoards,
  type TrophyColor,
  type TrophyResult,
} from '../lib/trophies';
import { computeFfaTrophies } from '../lib/trophiesFfa';
import { api, type LeaderboardEntry, type PlayedFfa } from '../lib/api';
import { TeamTrophiesHallOfFame } from './TeamTrophiesSection';
import { TrophyPodium } from './TrophyPodium';

interface TrophyHolder {
  login: string;
  imageUrl: string | null;
  trophies: TrophyResult[];
}

type SortMode = 'category' | 'player';

const COLOR_BORDER: Record<TrophyColor, string> = {
  gold: 'border-gold/40',
  red: 'border-red/40',
  cyan: 'border-teal/40',
  violet: 'border-[#a259ff]/40',
  magenta: 'border-[#ff3bd9]/40',
  bronze: 'border-[#cd7f32]/40',
  crimson: 'border-[#dc143c]/40',
  green: 'border-[#10b981]/40',
  sapphire: 'border-[#3b82f6]/40',
};

const COLOR_TEXT: Record<TrophyColor, string> = {
  gold: 'text-gold',
  red: 'text-red',
  cyan: 'text-[#f5b942]',
  violet: 'text-[#c97bff]',
  magenta: 'text-[#ff5bb0]',
  bronze: 'text-[#cd7f32]',
  crimson: 'text-[#dc143c]',
  green: 'text-[#7fd66e]',
  sapphire: 'text-[#7aa8ff]',
};

// Couleur (hex) du halo de brillance TiltCard, par couleur de trophée.
const COLOR_HEX: Record<TrophyColor, string> = {
  gold: '#ffc94a',
  red: '#ff5366',
  cyan: '#f5b942',
  violet: '#a259ff',
  magenta: '#ff3bd9',
  bronze: '#cd7f32',
  crimson: '#dc143c',
  green: '#10b981',
  sapphire: '#3b82f6',
};

// ─── Catégories de trophées (progressive disclosure) ─────────────────────────

type TrophyCategoryKey = 'perfs' | 'exploits' | 'activite' | 'honte';

interface TrophyCategory {
  key: TrophyCategoryKey;
  label: string;
  emoji: string;
  defaultOpen: boolean;
}

const TROPHY_CATEGORIES: TrophyCategory[] = [
  { key: 'perfs',    label: 'Performances',  emoji: '🏆', defaultOpen: true },
  { key: 'exploits', label: 'Exploits',       emoji: '⚡', defaultOpen: false },
  { key: 'activite', label: 'Activité',       emoji: '📅', defaultOpen: false },
  { key: 'honte',    label: 'Hontes',         emoji: '💀', defaultOpen: false },
];

// Mapping titre → catégorie. Les titres non listés tombent dans 'activite'.
const TITLE_TO_CATEGORY: Record<string, TrophyCategoryKey> = {
  // Performances
  'Elo KING':          'perfs',
  'G.O.A.T':           'perfs',
  'Smash God':         'perfs',
  'Maître du jeu':     'perfs',
  'Sniper':            'perfs',
  'Le Stratège':       'perfs',
  'En feu':            'perfs',
  'Combo King':        'perfs',
  'Série gagnante':    'perfs',
  'Maître des fléchettes': 'perfs',
  'Main chaude':       'perfs',
  'Chasseur de primes':'perfs',
  'Némésis':           'perfs',
  // Exploits
  'Destroyer':         'exploits',
  'Le Serré':          'exploits',
  'Negativer':         'exploits',
  'Annihilateur':      'exploits',
  'Spectacle':         'exploits',
  'Sweep Master':      'exploits',
  'Sans Pitié':        'exploits',
  'Pissette Master':   'exploits',
  // Hontes
  'Loooooooooser':     'honte',
  'Glissade':          'honte',
  'Zéro Absolu':       'honte',
  'Le Boulet':         'honte',
  'Le Couard':         'honte',
  // Activité (reste)
  'Marathonien':       'activite',
  'Le Noctambule':     'activite',
  'Bourreau de travail':'activite',
  'Rivalité':          'activite',
  // Inter-jeux (mix)
  'Touche-à-tout':       'perfs',
  'Légende universelle': 'perfs',
  'Roi multi-jeux':      'perfs',
  'Machine de guerre':   'perfs',
  'Le Polyvalent':       'activite',
  'Marathonien Universel':'activite',
  'Le Surdoué':          'perfs',
  'Pilier de la Ligue':  'perfs',
  'Grand Chelem':        'perfs',
};

function categoryOf(title: string): TrophyCategoryKey {
  return TITLE_TO_CATEGORY[title] ?? 'activite';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderRivalryOrValue(value: string, leaderboard: LeaderboardEntry[]) {
  const match = value.match(/^([\w-]+)\s+vs\s+([\w-]+)(.*)$/);
  if (match) {
    const [, login1, login2, rest] = match;
    const u1 = leaderboard.find((u) => u.login === login1);
    const u2 = leaderboard.find((u) => u.login === login2);
    if (u1 && u2) {
      return (
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <PlayerLink login={u1.login} className="!gap-1.5">
            <Avatar login={u1.login} imageUrl={u1.imageUrl} size="sm" />
            <span className="font-semibold text-sm text-text-strong">{u1.login}</span>
          </PlayerLink>
          <span className="text-muted-2 text-[10px] font-black uppercase tracking-wider">VS</span>
          <PlayerLink login={u2.login} className="!gap-1.5">
            <Avatar login={u2.login} imageUrl={u2.imageUrl} size="sm" />
            <span className="font-semibold text-sm text-text-strong">{u2.login}</span>
          </PlayerLink>
          <span className="text-muted-2 text-xs ms-1">{rest}</span>
        </div>
      );
    }
  }
  return <div className="text-text-strong font-semibold text-sm">{value}</div>;
}

// ─── Séparateur de catégorie (toujours ouvert) ────────────────────────────────

const CATEGORY_ACCENT: Record<TrophyCategoryKey, string> = {
  perfs:    'from-gold to-gold/30',
  exploits: 'from-[#a259ff] to-[#a259ff]/30',
  activite: 'from-[#3b82f6] to-[#3b82f6]/30',
  honte:    'from-[#dc143c] to-[#dc143c]/30',
};

const CATEGORY_LINE: Record<TrophyCategoryKey, string> = {
  perfs:    'from-gold/20',
  exploits: 'from-[#a259ff]/20',
  activite: 'from-[#3b82f6]/20',
  honte:    'from-[#dc143c]/20',
};

const CATEGORY_LABEL_COLOR: Record<TrophyCategoryKey, string> = {
  perfs:    'text-gold/70',
  exploits: 'text-[#c97bff]/80',
  activite: 'text-[#7aa8ff]/80',
  honte:    'text-[#dc143c]/80',
};

const CATEGORY_BADGE: Record<TrophyCategoryKey, string> = {
  perfs:    'text-gold',
  exploits: 'text-[#c97bff]',
  activite: 'text-[#7aa8ff]',
  honte:    'text-[#dc143c]',
};

function CategorySection({
  category,
  trophies,
  leaderboard,
  isFirst,
}: {
  category: TrophyCategory;
  trophies: TrophyResult[];
  leaderboard: LeaderboardEntry[];
  isFirst: boolean;
}) {
  const earned = trophies.filter((t) => t.earned).length;
  if (trophies.length === 0) return null;
  const allEarned = earned === trophies.length;

  return (
    <div className={isFirst ? '' : 'mt-8'}>
      {/* Séparateur catégorie */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className={`w-0.5 h-4 rounded-full bg-gradient-to-b ${CATEGORY_ACCENT[category.key]} flex-shrink-0`} />
        <span className="text-sm leading-none">{category.emoji}</span>
        <span className={`font-gaming text-[10px] uppercase tracking-[0.2em] font-extrabold ${CATEGORY_LABEL_COLOR[category.key]}`}>
          {category.label}
        </span>
        <div className={`flex-1 h-px bg-gradient-to-r ${CATEGORY_LINE[category.key]} to-transparent`} />
        <span className={`text-[9px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] ${allEarned ? CATEGORY_BADGE[category.key] : 'text-muted-2'}`}>
          {earned}/{trophies.length}
        </span>
      </div>

      <TrophyGrid trophies={trophies} leaderboard={leaderboard} />
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

interface TrophiesSectionProps {
  title?: string;
}

export function TrophiesSection({ title = 'Trophées' }: TrophiesSectionProps) {
  const { leaderboard, matches: allMatches, activeSeasonId } = useLeagueData();
  const { game } = useGameMode();
  // Trophées cloisonnés à la saison active : ils se gagnent sur la saison en cours
  // et repartent de zéro à chaque clôture (comme l'ELO et les stats du classement).
  // L'historique complet reste dispo pour le GOAT (cross-saison). activeSeasonId
  // null (pas encore chargé / aucune saison) → repli sur tout l'historique.
  const matches = useMemo(
    () => (activeSeasonId ? allMatches.filter((m) => m.seasonId === activeSeasonId) : allMatches),
    [allMatches, activeSeasonId],
  );
  const [view, setView] = useState<'mode' | 'mix' | 'teams' | 'ffa'>('mode');
  const trophies = useMemo(
    () => computeTrophies(leaderboard, matches, game),
    [leaderboard, matches, game],
  );

  // Changer de discipline réinitialise la vue (les onglets « Équipes 2v2 » /
  // « FFA Smash » sont spécifiques à un jeu → on évite de rester sur un onglet
  // qui n'existe plus).
  useEffect(() => {
    setView('mode');
  }, [game]);

  // Onglet « FFA Smash » : historique des Free-For-All, chargé à la demande.
  const [ffas, setFfas] = useState<PlayedFfa[] | null>(null);
  useEffect(() => {
    if (view !== 'ffa' || ffas) return;
    api
      .playedFfas()
      .then(setFfas)
      .catch(() => setFfas([]));
  }, [view, ffas]);

  const ffaTrophies = useMemo(
    () =>
      ffas
        ? computeFfaTrophies(
            activeSeasonId ? ffas.filter((f) => f.seasonId === activeSeasonId) : ffas,
            leaderboard,
          )
        : [],
    [ffas, leaderboard, activeSeasonId],
  );

  // Onglet « Mix » : trophées inter-jeux → nécessite les 3 classements.
  const [boards, setBoards] = useState<GameBoards | null>(null);
  useEffect(() => {
    if (view !== 'mix' || boards) return;
    Promise.all([
      api.leaderboard('babyfoot'),
      api.leaderboard('smash'),
      api.leaderboard('chess'),
      api.leaderboard('flechettes'),
    ])
      .then(([babyfoot, smash, chess, flechettes]) =>
        setBoards({ babyfoot, smash, chess, flechettes }),
      )
      .catch(() => setBoards({ babyfoot: leaderboard }));
  }, [view, boards, leaderboard]);

  const mixTrophies = useMemo(
    () => (boards ? computeMixTrophies(boards, matches) : []),
    [boards, matches],
  );
  const mergedBoard = useMemo<LeaderboardEntry[]>(() => {
    if (!boards) return leaderboard;
    const seen = new Map<string, LeaderboardEntry>();
    for (const g of ['babyfoot', 'smash', 'chess', 'flechettes'] as const)
      for (const e of boards[g] ?? []) if (!seen.has(e.login)) seen.set(e.login, e);
    return [...seen.values()];
  }, [boards, leaderboard]);

  if (trophies.length === 0) {
    return (
      <section className="mt-8 pt-6 border-t border-gold/15">
        <div className="font-gaming text-xs font-extrabold uppercase tracking-[0.18em] text-gold mb-2 flex items-center gap-2">
          <span>🏆</span>
          <span>{title}</span>
        </div>
        <div className="text-center text-muted-2 py-6 text-sm">
          Pas encore assez de matchs pour décerner des trophées.
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 pt-6 border-t border-gold/15">
      {/* Titre */}
      <div className="font-gaming text-xs font-extrabold uppercase tracking-[0.18em] text-gold mb-4 flex items-center gap-2">
        <span className="text-base">🏆</span>
        <span>{title}</span>
        <span className="text-[10px] text-muted font-semibold normal-case tracking-[0.12em]">
          · récompenses légendaires
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-gold/30 via-gold/10 to-transparent ms-2" />
      </div>

      {/* Bascule mode actuel / mix inter-jeux / équipes 2v2 */}
      <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-bg-2/60 mb-5 w-fit">
        {(
          [
            { v: 'mode',  label: 'Ce mode' },
            { v: 'mix',   label: '🌐 Mix inter-jeux' },
            // Onglet Équipes uniquement en Babyfoot — les équipes 2v2 n'existent que dans ce jeu.
            ...(game === 'babyfoot' ? [{ v: 'teams', label: '⚽ Équipes 2v2' }] : []),
            // Onglet FFA uniquement en Smash — le Free-For-All n'existe que là.
            ...(game === 'smash' ? [{ v: 'ffa', label: '🎮 FFA Smash' }] : []),
          ] as { v: 'mode' | 'mix' | 'teams' | 'ffa'; label: string }[]
        ).map(({ v, label }) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-md text-[10px] font-extrabold uppercase tracking-[0.12em] transition-all ${
              view === v
                ? v === 'teams'
                  ? 'bg-red/10 border border-red/30 text-red'
                  : v === 'ffa'
                    ? 'bg-[#a259ff]/10 border border-[#a259ff]/30 text-[#c79bff]'
                    : 'bg-gold/10 border border-gold/30 text-gold'
                : 'border border-transparent text-muted-2 hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'teams' ? (
        /* ── Trophées d'équipe 2v2 Babyfoot ── */
        <TeamTrophiesHallOfFame />
      ) : view === 'ffa' ? (
        /* ── Trophées Smash FFA (Free-For-All) ── */
        ffas === null ? (
          <div className="text-center text-muted-2 py-8 text-sm">Chargement des FFA…</div>
        ) : ffaTrophies.length === 0 ? (
          <div className="text-center text-muted-2 py-8 text-sm">
            Pas encore de FFA Smash joué — lance une mêlée à 3+ joueurs !
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted-2 mb-4 leading-relaxed">
              Récompenses du mode Free-For-All Smash (mêlées à 3 joueurs ou plus).
            </p>
            <TrophyGrid trophies={ffaTrophies} leaderboard={leaderboard} />
          </>
        )
      ) : view === 'mix' ? (
        boards === null ? (
          <div className="text-center text-muted-2 py-8 text-sm">Chargement des classements…</div>
        ) : (
          <>
            <p className="text-[11px] text-muted-2 mb-4 leading-relaxed">
              Trophées combinant les performances sur plusieurs disciplines (babyfoot, smash, échecs, Street Fighter).
            </p>
            <TrophyHallView trophies={mixTrophies} leaderboard={mergedBoard} />
          </>
        )
      ) : (
        <TrophyHallView trophies={trophies} leaderboard={leaderboard} />
      )}
    </section>
  );
}

// ─── Vue « hall of fame » réutilisable (Ce mode + Mix inter-jeux) ────────────
//
// Même structure pour les deux onglets (→ même hauteur / même langage) : podium
// des plus titrés, sélecteur de tri (par catégorie / par joueur), puis grille.

function TrophyHallView({
  trophies,
  leaderboard,
}: {
  trophies: TrophyResult[];
  leaderboard: LeaderboardEntry[];
}) {
  const [sortMode, setSortMode] = useState<SortMode>('category');

  // Trophées par détenteur (vue "par joueur" + podium des plus titrés).
  const holders = useMemo<TrophyHolder[]>(() => {
    const byLogin = new Map<string, TrophyHolder>();
    for (const t of trophies) {
      if (!t.winner) continue;
      let h = byLogin.get(t.winner.login);
      if (!h) {
        h = { login: t.winner.login, imageUrl: t.winner.imageUrl, trophies: [] };
        byLogin.set(t.winner.login, h);
      }
      h.trophies.push(t);
    }
    return [...byLogin.values()].sort(
      (a, b) => b.trophies.length - a.trophies.length || a.login.localeCompare(b.login),
    );
  }, [trophies]);

  const unattributed = useMemo(() => trophies.filter((t) => !t.winner), [trophies]);

  // Trophées regroupés par catégorie (vue "par catégorie").
  const byCategory = useMemo(() => {
    const map = new Map<TrophyCategoryKey, TrophyResult[]>();
    for (const cat of TROPHY_CATEGORIES) map.set(cat.key, []);
    for (const t of trophies) map.get(categoryOf(t.title))?.push(t);
    return map;
  }, [trophies]);

  return (
    <>
      {/* Classement des plus titrés */}
      {holders.length > 0 && <MostTitled holders={holders} leaderboard={leaderboard} />}

      {/* Sélecteur de tri */}
      <div className="flex items-center gap-2 mb-5">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-2 font-bold">Affichage</span>
        <SortToggle mode={sortMode} onChange={setSortMode} />
      </div>

      {sortMode === 'category' ? (
        /* ── Vue par catégorie : sections toujours ouvertes ── */
        <div>
          {TROPHY_CATEGORIES.map((cat, i) => (
            <CategorySection
              key={cat.key}
              category={cat}
              trophies={byCategory.get(cat.key) ?? []}
              leaderboard={leaderboard}
              isFirst={i === 0}
            />
          ))}
        </div>
      ) : (
        /* ── Vue par joueur ── */
        <div className="space-y-6">
          {holders.map((h, i) => (
            <div key={h.login}>
              <PlayerGroupHeader holder={h} rank={i + 1} />
              <TrophyGrid trophies={h.trophies} leaderboard={leaderboard} />
            </div>
          ))}
          {unattributed.length > 0 && (
            <div>
              <div className="font-gaming text-[10px] uppercase tracking-[0.16em] text-muted-2 font-extrabold mb-3 flex items-center gap-2">
                <span className="inline-block w-1 h-2.5 bg-gradient-to-b from-muted to-muted/40 rounded-sm" />
                Non attribués
                <span className="font-mono normal-case text-muted-2">· {unattributed.length}</span>
              </div>
              <TrophyGrid trophies={unattributed} leaderboard={leaderboard} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Grille de trophées ─────────────────────────────────────────────────────

function TrophyGrid({
  trophies,
  leaderboard,
}: {
  trophies: TrophyResult[];
  leaderboard: LeaderboardEntry[];
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
      {trophies.map((t) => {
        return (
          <TiltCard
            key={t.title}
            glowHex={COLOR_HEX[t.color]}
            className={`card-hud overflow-hidden hover-glow ${COLOR_BORDER[t.color]} rounded-xl p-3.5 flex flex-col gap-2 ${
              t.earned ? '' : 'opacity-60'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="text-2xl leading-none">{t.emoji}</div>
              <div className="min-w-0">
                <div className={`text-[11px] font-extrabold uppercase tracking-wider ${COLOR_TEXT[t.color]}`}>
                  {t.title}
                </div>
                <div className="text-[10px] text-muted-2 leading-tight">{t.subtitle}</div>
              </div>
            </div>

            {!t.earned ? (
              <div className="text-[11px] text-muted-2 italic">Personne ne l'a encore 🔒</div>
            ) : t.winner ? (
              <PlayerLink login={t.winner.login} className="mt-0.5">
                <UserBadge
                  login={t.winner.login}
                  imageUrl={t.winner.imageUrl}
                  showUsername
                  size="sm"
                />
              </PlayerLink>
            ) : (
              renderRivalryOrValue(t.value, leaderboard)
            )}

            <div className="flex items-center gap-2 mt-auto pt-0.5">
              {t.winner && (
                <span className={`text-sm font-extrabold ${COLOR_TEXT[t.color]}`}>
                  {t.value}
                </span>
              )}
              {t.hint && <span className="text-[10px] text-muted">{t.hint}</span>}
            </div>
          </TiltCard>
        );
      })}
    </div>
  );
}

// ─── Tri : par catégorie / par joueur ───────────────────────────────────────

function SortToggle({ mode, onChange }: { mode: SortMode; onChange: (m: SortMode) => void }) {
  return (
    <div className="inline-flex gap-1 p-1 rounded-lg bg-bg-2/60">
      {(['category', 'player'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-3 py-1.5 rounded-md text-[10px] font-extrabold uppercase tracking-[0.12em] transition-all duration-150 border ${
            mode === m
              ? 'bg-gold/10 border-gold/30 text-gold'
              : 'border-transparent text-muted-2 hover:text-text'
          }`}
        >
          {m === 'category' ? 'Par catégorie' : 'Par joueur'}
        </button>
      ))}
    </div>
  );
}

function PlayerGroupHeader({
  holder,
  rank,
}: {
  holder: TrophyHolder;
  rank: number;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="font-mono text-xs text-muted-2 font-bold w-6 text-end">#{rank}</span>
      <PlayerLink login={holder.login} className="!gap-2">
        <Avatar login={holder.login} imageUrl={holder.imageUrl} size="sm" />
        <span className="font-extrabold text-text-strong text-sm">{holder.login}</span>
      </PlayerLink>
      <span className="text-[11px] font-extrabold text-gold bg-gold/10 border border-gold/20 rounded-full px-2 py-0.5">
        {holder.trophies.length} 🏆
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-gold/20 to-transparent" />
    </div>
  );
}

// ─── Classement « les plus titrés » : podium + liste dépliable ──────────────

function MostTitled({
  holders,
  leaderboard,
}: {
  holders: TrophyHolder[];
  leaderboard: LeaderboardEntry[];
}) {
  const [showAll, setShowAll] = useState(false);

  // Podium toujours à 3 colonnes : on complète avec les meilleurs joueurs du
  // classement (par ELO) quand il y a moins de 3 détenteurs de trophées — utile
  // notamment en inter-jeux où un seul joueur peut rafler la plupart des trophées.
  const ranked: TrophyHolder[] = [...holders];
  if (ranked.length < 3) {
    const have = new Set(ranked.map((h) => h.login));
    for (const u of [...leaderboard].sort((a, b) => b.elo - a.elo)) {
      if (ranked.length >= 3) break;
      if (have.has(u.login)) continue;
      have.add(u.login);
      ranked.push({ login: u.login, imageUrl: u.imageUrl, trophies: [] });
    }
  }
  const top3 = ranked.slice(0, 3);
  const rest = holders.slice(3);
  const podium = [
    top3[1] ? { holder: top3[1], rank: 2 } : null,
    top3[0] ? { holder: top3[0], rank: 1 } : null,
    top3[2] ? { holder: top3[2], rank: 3 } : null,
  ].filter(Boolean) as { holder: TrophyHolder; rank: number }[];

  return (
    <div className="mb-5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-gold font-extrabold mb-3 flex items-center gap-2">
        <span className="inline-block w-1 h-2.5 bg-gradient-to-b from-gold to-gold-dim rounded-sm" />
        Les plus titrés
      </div>

      {/* Revenus passifs hebdomadaires : le podium des trophées rapporte des League
          Coins CHAQUE SEMAINE, et chaque trophée détenu une prime cumulable. */}
      <div className="mb-3 rounded-xl border border-gold/25 bg-gold/[0.05] px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.14em] text-gold font-extrabold mb-1.5 flex items-center gap-1.5">
          <span>🪙</span>
          <span>Revenus passifs hebdomadaires</span>
        </div>
        <p className="text-[11px] text-muted-2 leading-snug">
          Chaque semaine, le podium des plus titrés est payé en League Coins :{' '}
          <span className="text-gold font-bold">🥇 1 200</span> ·{' '}
          <span className="text-gold/90 font-bold">🥈 700</span> ·{' '}
          <span className="text-gold/80 font-bold">🥉 350</span>. Et chaque trophée détenu
          rapporte <span className="text-gold font-bold">25 coins</span> par semaine — cumulable
          avec la prime de podium. Garde tes trophées pour encaisser !
        </p>
      </div>

      {/* Fond très subtil sans border (évite card-hud dans card-hud).
          overflow-hidden + sans padding : le podium est plein cadre, le halo et
          le balayage de brillance vont jusqu'aux bords (pas de cadre mort autour). */}
      <div className="rounded-xl bg-white/[0.025] overflow-hidden">
        <TrophyPodium
          podium={podium.map(({ holder, rank }) => ({
            login: holder.login,
            imageUrl: holder.imageUrl,
            trophyCount: holder.trophies.length,
            rank,
          }))}
        />

      {rest.length > 0 && (
        <div className="px-4 pb-4 pt-3">
          <button
            onClick={() => setShowAll((s) => !s)}
            className="mx-auto flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-2 hover:text-gold transition-colors"
          >
            {showAll ? 'Masquer' : `Voir + (${rest.length})`}
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`}
              strokeWidth={2.5}
            />
          </button>

          {showAll && (
            <ul className="mt-3 space-y-1 border-t border-border/30 pt-3">
              {rest.map((h, i) => (
                <li key={h.login} className="flex items-center gap-2.5 py-1">
                  <span className="font-mono text-xs text-muted-2 w-7 text-end">#{i + 4}</span>
                  <PlayerLink login={h.login} className="!gap-2 min-w-0 flex-1">
                    <Avatar login={h.login} imageUrl={h.imageUrl} size="xs" />
                    <span className="text-sm font-semibold text-text truncate">{h.login}</span>
                  </PlayerLink>
                  <span className="text-sm font-extrabold text-gold tabular-nums">
                    {h.trophies.length} 🏆
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

