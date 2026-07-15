/**
 * Section « Trophées d'Équipe (Babyfoot 2v2) »
 *
 * Rendue à deux endroits :
 *   1. `TrophiesSection` (Hall of Fame général) — sous forme de grille de cartes.
 *   2. Pages `TeamProfileMobile` / `TeamProfileDesktop` — avec filtre par équipe.
 *
 * Charge le classement des équipes via `api.teamLeaderboard()`, enrichit les
 * avatars depuis le leaderboard individuel, puis calcule les trophées client-side.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { api, type BabyfootTeamEntry } from '../lib/api';
import { useLeagueData } from '../hooks/useLeagueData';
import {
  computeTeamTrophies,
  teamDisplayName,
  type TeamTrophyCode,
  type TeamTrophyResult,
  type TeamTrophyWinner,
} from '../lib/trophies2v2';
import { TeamTrophyCard, TeamTrophyRow, DuoAvatar } from './TeamTrophyBadge';
import { StaggerList, StaggerItem } from '../mobile/motion/StaggerList';

// ─── Fetch + enrich des équipes ───────────────────────────────────────────────

function useEnrichedTeams(): { teams: TeamTrophyWinner[]; loading: boolean } {
  const { leaderboard } = useLeagueData();
  const [raw, setRaw] = useState<BabyfootTeamEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.teamLeaderboard()
      .then((data) => { if (alive) setRaw(data); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const avatarByLogin = useMemo(
    () => new Map(leaderboard.map((u) => [u.login, u.imageUrl])),
    [leaderboard],
  );

  const teams = useMemo<TeamTrophyWinner[]>(
    () =>
      raw.map((t) => ({
        ...t,
        player1ImageUrl: avatarByLogin.get(t.player1Login) ?? null,
        player2ImageUrl: avatarByLogin.get(t.player2Login) ?? null,
      })),
    [raw, avatarByLogin],
  );

  return { teams, loading };
}

// ─── Version Hall of Fame — grille complète ───────────────────────────────────

/**
 * Grille de trophées d'équipe pour le Hall of Fame général.
 * Utilisée dans `TrophiesSection` quand l'onglet "Équipes 2v2" est actif.
 */
// Catégorisation des trophées d'équipe (miroir de la vue solo).
type TeamSortMode = 'category' | 'team';
type TeamCatKey = 'perfs' | 'exploits' | 'activite' | 'honte';

interface TeamCategory {
  key: TeamCatKey;
  label: string;
  emoji: string;
}
const TEAM_CATEGORIES: TeamCategory[] = [
  { key: 'perfs', label: 'Performances', emoji: '🏆' },
  { key: 'exploits', label: 'Exploits', emoji: '⚡' },
  { key: 'activite', label: 'Activité', emoji: '📅' },
  { key: 'honte', label: 'Hontes', emoji: '💀' },
];
const TEAM_CATEGORY_OF: Record<TeamTrophyCode, TeamCatKey> = {
  // Performances
  sommet: 'perfs',
  machine_de_guerre: 'perfs',
  muraille: 'perfs',
  duo_de_choc: 'perfs',
  invaincus: 'perfs',
  dream_team: 'perfs',
  // Exploits / faits d'armes
  carry: 'exploits',
  jumeaux: 'exploits',
  odd_couple: 'exploits',
  montagnes_russes: 'exploits',
  rouleau: 'exploits',
  sang_froid: 'exploits',
  bourreaux: 'exploits',
  // Activité
  increvables: 'activite',
  // Hontes
  wooden_spoon: 'honte',
};

interface DuoHolder {
  team: TeamTrophyWinner;
  trophies: TeamTrophyResult[];
}

export function TeamTrophiesHallOfFame() {
  const { leaderboard, matches } = useLeagueData();
  const { teams, loading } = useEnrichedTeams();
  const [sortMode, setSortMode] = useState<TeamSortMode>('category');

  const trophies = useMemo<TeamTrophyResult[]>(
    () => (teams.length > 0 ? computeTeamTrophies(teams, leaderboard, matches) : []),
    [teams, leaderboard, matches],
  );

  // Duos détenteurs, classés par nombre de trophées (vue "par duo" + podium).
  const holders = useMemo<DuoHolder[]>(() => {
    const byId = new Map<string, DuoHolder>();
    for (const t of trophies) {
      if (!t.earned || !t.winner) continue;
      let h = byId.get(t.winner.id);
      if (!h) {
        h = { team: t.winner, trophies: [] };
        byId.set(t.winner.id, h);
      }
      h.trophies.push(t);
    }
    return [...byId.values()].sort(
      (a, b) =>
        b.trophies.length - a.trophies.length ||
        teamDisplayName(a.team).localeCompare(teamDisplayName(b.team)),
    );
  }, [trophies]);

  // Trophées regroupés par catégorie.
  const byCategory = useMemo(() => {
    const map = new Map<TeamCatKey, TeamTrophyResult[]>();
    for (const c of TEAM_CATEGORIES) map.set(c.key, []);
    for (const t of trophies) map.get(TEAM_CATEGORY_OF[t.code] ?? 'activite')?.push(t);
    return map;
  }, [trophies]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="card-hud rounded-xl h-28 animate-pulse opacity-50" />
        ))}
      </div>
    );
  }

  const anyEarned = trophies.some((t) => t.earned);

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-muted-2 leading-relaxed">
        Trophées récompensant les performances exceptionnelles en mode{' '}
        <span className="text-text font-semibold">2v2 Babyfoot</span>. Recalculés en temps réel
        à partir des matchs confirmés.
      </p>

      {/* Podium des duos les plus titrés */}
      {holders.length > 0 && <MostTitledDuos holders={holders} teams={teams} />}

      {!anyEarned ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-8 text-sm text-muted-2"
        >
          <div className="text-3xl mb-3 opacity-50">⚽</div>
          Jouez plus de matchs 2v2 pour débloquer ces trophées !
        </motion.div>
      ) : (
        <>
          {/* Sélecteur de tri : par catégorie / par duo */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-2 font-bold">
              Affichage
            </span>
            <div className="inline-flex gap-1 p-1 rounded-lg bg-bg-2/60">
              {([
                ['category', 'Par catégorie'],
                ['team', 'Par duo'],
              ] as const).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setSortMode(m)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-extrabold uppercase tracking-[0.12em] transition-all border ${
                    sortMode === m
                      ? 'bg-red/10 border-red/30 text-red'
                      : 'border-transparent text-muted-2 hover:text-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {sortMode === 'category' ? (
            /* ── Vue par catégorie ── */
            <div className="space-y-6">
              {TEAM_CATEGORIES.map((cat) => {
                const list = byCategory.get(cat.key) ?? [];
                if (list.length === 0) return null;
                const earned = list.filter((t) => t.earned).length;
                return (
                  <div key={cat.key}>
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="text-sm leading-none">{cat.emoji}</span>
                      <span className="font-gaming text-[10px] uppercase tracking-[0.2em] font-extrabold text-red/80">
                        {cat.label}
                      </span>
                      <div className="flex-1 h-px bg-gradient-to-r from-red/20 to-transparent" />
                      <span className="text-[9px] font-mono font-bold tabular-nums text-muted-2">
                        {earned}/{list.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {list.map((t) => (
                        <TeamTrophyCard key={t.code} trophy={t} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Vue par duo ── */
            <div className="space-y-6">
              {holders.map((h, i) => (
                <div key={h.team.id}>
                  <DuoGroupHeader holder={h} rank={i + 1} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {h.trophies.map((t) => (
                      <TeamTrophyCard key={t.code} trophy={t} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── En-tête de groupe « par duo » ────────────────────────────────────────────

function DuoGroupHeader({ holder, rank }: { holder: DuoHolder; rank: number }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="font-mono text-xs text-muted-2 font-bold w-6 text-end">#{rank}</span>
      <button
        type="button"
        onClick={() => navigate(`/team/${holder.team.id}`)}
        className="flex items-center gap-2 min-w-0"
      >
        <DuoAvatar winner={holder.team} size={20} />
        <span className="font-extrabold text-text-strong text-sm truncate">
          {teamDisplayName(holder.team)}
        </span>
      </button>
      <span className="text-[11px] font-extrabold text-red bg-red/10 border border-red/20 rounded-full px-2 py-0.5">
        {holder.trophies.length} 🏆
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-red/20 to-transparent" />
    </div>
  );
}

// ─── Podium des duos les plus titrés ──────────────────────────────────────────

function MostTitledDuos({
  holders,
  teams,
}: {
  holders: DuoHolder[];
  teams: TeamTrophyWinner[];
}) {
  // Toujours 3 colonnes : on complète avec les meilleurs duos (par ELO) quand il
  // y a moins de 3 détenteurs de trophées.
  const ranked: DuoHolder[] = [...holders];
  if (ranked.length < 3) {
    const have = new Set(ranked.map((h) => h.team.id));
    for (const team of [...teams].sort((a, b) => b.elo - a.elo)) {
      if (ranked.length >= 3) break;
      if (have.has(team.id)) continue;
      have.add(team.id);
      ranked.push({ team, trophies: [] });
    }
  }
  const top3 = ranked.slice(0, 3);
  const podium = [
    top3[1] ? { holder: top3[1], rank: 2 } : null,
    top3[0] ? { holder: top3[0], rank: 1 } : null,
    top3[2] ? { holder: top3[2], rank: 3 } : null,
  ].filter(Boolean) as { holder: DuoHolder; rank: number }[];

  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-red font-extrabold mb-3 flex items-center gap-2">
        <span className="inline-block w-1 h-2.5 bg-gradient-to-b from-red to-red/40 rounded-sm" />
        Les duos les plus titrés
      </div>
      {/* Plein cadre (overflow-hidden, sans padding) : le halo et le balayage de
          brillance atteignent les bords — pas de cadre mort autour du podium. */}
      <div className="rounded-xl bg-white/[0.025] overflow-hidden">
        <TeamTrophyPodium
          podium={podium.map(({ holder, rank }) => ({
            team: holder.team,
            trophyCount: holder.trophies.length,
            rank,
          }))}
        />
      </div>
    </div>
  );
}

interface TeamPodiumEntry {
  team: TeamTrophyWinner;
  trophyCount: number;
  rank: number;
}

const T_TIER: Record<number, 'first' | 'second' | 'third'> = { 1: 'first', 2: 'second', 3: 'third' };
const T_STEP_H: Record<number, string> = { 1: 'h-28 sm:h-36', 2: 'h-20 sm:h-24', 3: 'h-14 sm:h-16' };
const T_STEP: Record<string, string> = {
  first: 'from-[#3a2e10] via-[#241c08] to-[#0f0c04] border-[#e0b34a]/55',
  second: 'from-[#241a3a] via-[#160f28] to-[#0b0816] border-[#a259ff]/40',
  third: 'from-[#10262b] via-[#0a1a1e] to-[#060f11] border-[#22d3d3]/35',
};
const T_TXT: Record<string, string> = {
  first: 'text-[#ffd76a]',
  second: 'text-[#c4a0ff]',
  third: 'text-[#5fe6e6]',
};
const T_BADGE: Record<string, string> = {
  first: 'bg-gradient-to-br from-[#ffe08a] to-[#c79122] text-[#231600]',
  second: 'bg-gradient-to-br from-[#c9a8ff] to-[#7c3aed] text-white',
  third: 'bg-gradient-to-br from-[#7df0f0] to-[#1fa3a3] text-[#062020]',
};
const T_BIG: Record<string, string> = {
  first: 'text-[#ffce5a]/25',
  second: 'text-[#a259ff]/20',
  third: 'text-[#22d3d3]/18',
};

function TeamTrophyPodium({ podium }: { podium: TeamPodiumEntry[] }) {
  return (
    <div className="relative overflow-hidden rounded-xl pt-8 pb-0">
      {/* Halo doré + voile violet */}
      <div
        className="absolute inset-x-0 top-0 h-44 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 80% at 50% 0%, rgba(255,201,74,0.20), rgba(180,120,255,0.10) 46%, transparent 70%)',
        }}
      />
      {/* Balayage holographique */}
      <motion.div
        aria-hidden
        className="absolute top-0 bottom-0 w-1/3 pointer-events-none [background:linear-gradient(100deg,transparent,rgba(255,255,255,0.08),rgba(190,140,255,0.07),transparent)]"
        initial={{ left: '-35%' }}
        animate={{ left: '115%' }}
        transition={{ duration: 3.4, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }}
      />
      <div
        className="relative grid grid-cols-3 items-end gap-2 sm:gap-4 max-w-xl mx-auto"
        style={{ perspective: '1100px' }}
      >
        {podium.map((e, i) => (
          <TeamPodiumColumn key={e.team.id} entry={e} delay={i * 0.11} />
        ))}
      </div>
    </div>
  );
}

function TeamPodiumColumn({ entry, delay }: { entry: TeamPodiumEntry; delay: number }) {
  const navigate = useNavigate();
  const { rank } = entry;
  const tier = T_TIER[rank] ?? 'third';
  const isFirst = rank === 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      className="group relative flex flex-col items-center gap-2.5"
    >
      <div className="flex flex-col items-center gap-2 transition-transform duration-300 ease-out group-hover:-translate-y-1.5">
        <motion.div
          className="relative"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: delay + 0.5 }}
        >
          {isFirst && (
            <motion.div
              initial={{ y: -18, opacity: 0, scale: 0.4 }}
              animate={{ y: [0, -5, 0], opacity: 1, scale: 1, rotate: [0, -8, 8, 0] }}
              transition={{
                opacity: { delay: delay + 0.35, duration: 0.4 },
                scale: { delay: delay + 0.35, type: 'spring', stiffness: 300, damping: 11 },
                y: { delay: delay + 0.8, duration: 2.6, repeat: Infinity, ease: 'easeInOut' },
                rotate: { delay: delay + 0.8, duration: 4.2, repeat: Infinity, ease: 'easeInOut' },
              }}
              className="absolute -top-8 left-1/2 -translate-x-1/2 z-10"
            >
              <Trophy
                className="w-7 h-7 sm:w-8 sm:h-8 text-[#ffd76a] drop-shadow-[0_2px_10px_rgba(255,201,74,0.7)]"
                strokeWidth={2.5}
                fill="currentColor"
              />
            </motion.div>
          )}
          <button
            type="button"
            onClick={() => navigate(`/team/${entry.team.id}`)}
            className="block transition-transform duration-300 group-hover:scale-105"
          >
            <DuoAvatar winner={entry.team} size={isFirst ? 40 : 32} />
          </button>
          <div
            className={`absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full flex items-center justify-center font-mono font-black ring-2 ring-bg-1 ${T_BADGE[tier]} ${
              isFirst ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-[11px]'
            }`}
          >
            {rank}
          </div>
        </motion.div>

        <div className="text-center mt-1 max-w-full px-1">
          <div
            className={`font-extrabold truncate max-w-[110px] sm:max-w-[140px] ${T_TXT[tier]} ${
              isFirst ? 'text-sm' : 'text-xs'
            }`}
          >
            {teamDisplayName(entry.team)}
          </div>
          <div className={`font-display font-black tabular-nums leading-tight ${T_TXT[tier]}`}>
            {entry.trophyCount}
            <span className="ms-1 text-sm align-middle">🏆</span>
          </div>
          {isFirst && (
            <div className="mt-0.5 inline-block text-[8px] font-extrabold uppercase tracking-[0.18em] text-[#ffd76a]/90">
              Duo le plus titré
            </div>
          )}
        </div>
      </div>

      <div
        className={`relative w-full ${T_STEP_H[rank]} rounded-t-xl border-t border-s border-e bg-gradient-to-b ${T_STEP[tier]} flex items-start justify-center pt-2 overflow-hidden transition-all duration-300 group-hover:brightness-110`}
        style={{ transform: 'rotateX(8deg)', transformOrigin: 'bottom' }}
      >
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        <span
          className={`font-display font-black leading-none ${T_BIG[tier]} ${
            isFirst ? 'text-5xl sm:text-6xl' : 'text-3xl sm:text-4xl'
          }`}
        >
          {rank}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Version TeamProfile — badges filtrés par équipe ─────────────────────────

interface TeamTrophiesBadgesProps {
  /** ID de l'équipe dont on veut afficher les trophées. */
  teamId: string;
}

/**
 * Rangée de badges pour une page de profil d'équipe.
 * N'affiche que les trophées détenus par CETTE équipe.
 * Si aucun trophée, ne rend rien (pas de section vide).
 */
export function TeamTrophiesBadges({ teamId }: TeamTrophiesBadgesProps) {
  const { leaderboard, matches } = useLeagueData();
  const { teams, loading } = useEnrichedTeams();

  const trophies = useMemo<TeamTrophyResult[]>(
    () => (teams.length > 0 ? computeTeamTrophies(teams, leaderboard, matches) : []),
    [teams, leaderboard, matches],
  );

  if (loading) return null;

  const earned = trophies.filter((t) => t.earned && t.winner?.id === teamId);
  if (earned.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <TeamTrophyRow trophies={trophies} teamId={teamId} />
    </motion.div>
  );
}

// ─── Section complète pour TeamProfile (badges + explication) ─────────────────

/**
 * Section "Trophées" complète pour les pages TeamProfile mobile et desktop.
 * Affiche les badges gagnés + cartes avec description pour l'équipe donnée.
 */
export function TeamProfileTrophiesSection({ teamId }: { teamId: string }) {
  const { leaderboard, matches } = useLeagueData();
  const { teams, loading } = useEnrichedTeams();

  const trophies = useMemo<TeamTrophyResult[]>(
    () => (teams.length > 0 ? computeTeamTrophies(teams, leaderboard, matches) : []),
    [teams, leaderboard, matches],
  );

  if (loading) return null;

  const earned = trophies.filter((t) => t.earned && t.winner?.id === teamId);
  const locked = trophies.filter((t) => !(t.earned && t.winner?.id === teamId));

  return (
    <div className="space-y-3">
      {earned.length > 0 && (
        <StaggerList className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" stagger={0.1}>
          {earned.map((t) => (
            <StaggerItem key={t.code}>
              <TeamTrophyCard trophy={t} />
            </StaggerItem>
          ))}
        </StaggerList>
      )}

      {/* Trophées verrouillés — grisés */}
      {locked.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {locked.map((t) => (
            <TeamTrophyCard key={t.code} trophy={{ ...t, earned: false }} />
          ))}
        </div>
      )}

      {earned.length === 0 && locked.length === 0 && (
        <div className="text-center py-6 text-xs text-muted-2 italic">
          Aucun trophée d'équipe disponible pour l'instant.
        </div>
      )}
    </div>
  );
}
