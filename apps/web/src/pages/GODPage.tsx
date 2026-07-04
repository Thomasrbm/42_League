import { useEffect, useState, useCallback, useRef, Fragment, type ReactNode, type ClipboardEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useServerEvents } from '../hooks/useServerEvents';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useIsMobile } from '../hooks/useViewport';
import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe';
import { haptic } from '../mobile/feedback/useHaptic';
import { useT } from '../lib/i18n';
import { IS_STAGING } from '../lib/config';
import { SortableTh, useTableSort, sortRows } from '../components/SortableTh';
import {
  api,
  type AdminUser,
  type RejectedMatch,
  type ModerationStats,
  MODERATOR_PERMISSION_KEYS,
  MODERATOR_PERMISSION_LABELS,
  type ModeratorPermissionKey,
  type FeatureRequestWithAuthor,
  type BugReportWithAuthor,
  type PlayedMatch,
  type PendingMatch,
  type SuspiciousFlag,
  type AdminAuditEntry,
  type AdminAuditAction,
  type AllHistoryEvent,
  type AllHistoryEventType,
  type Season,
  type Tournament,
  type TournamentInvite,
  type TournamentMatch,
  type StatsOverview,
  type StatCount,
  type DayPoint,
  type AnnouncementData,
  type AnnouncementKind,
  type AdminUserItems,
  type ConsumableKind,
  type ShopItemData,
  type BattlePassTierAdmin,
} from '../lib/api';
import { BADGE_ICONS } from '../lib/badgeIcons';
import { ANNOUNCEMENT_KINDS, announcementKindMeta } from '../lib/announcements';
import type { Game } from '../lib/gameMode';
import { useGameMode } from '../hooks/useGameMode';
import { useLeagueData } from '../hooks/useLeagueData';
import { GAMES, GAME_META } from '../lib/gameMeta';
import { fireContestRage } from '../lib/contestRage';
import { triggerDuelStrike } from '../lib/duelStrike';
import { triggerRankUp } from '../lib/rankUp';
import { RANK_TIERS, GRANDMASTER } from '@42-league/shared';
import { VersusOverlay as GlobalVersusOverlay } from '../components/VersusOverlay';
import { VersusOverlay as TournVersusOverlay } from '../components/tournois/VersusOverlay';
import { CoinFlipOverlay } from '../components/tournois/CoinFlipOverlay';
import TournamentLaunchCeremony from '../components/tournois/TournamentLaunchCeremony';
import { VictoryOverlay } from '../components/tournois/VictoryOverlay';
import { PlayerReactionOverlay } from '../components/PlayerReactionOverlay';
import { MysteryRevealModal } from '../components/shop/MysteryRevealModal';
import type { MysteryReward } from '../lib/api';

type Tab = 'stats' | 'players' | 'activity' | 'safety' | 'history' | 'tournaments' | 'feedback' | 'content' | 'system' | 'sf-club';
type Role = 'MODERATOR' | 'ADMIN' | 'SUPERADMIN';

// Temps réel : événements SSE qui doivent rafraîchir le panel.
//  - `data:update`  : émis sur toute mutation /admin/* (actions d'un autre admin).
//  - `panel:update` : émis sur toute mutation matchs / défis / idées (actions des
//                     joueurs, qui sinon ne sont notifiées qu'aux intéressés).
// Chaque onglet s'y abonne et recharge ses données en silence (sans spinner).
const PANEL_EVENTS = ['data:update', 'panel:update'];

// ── Shared primitives ──────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  if (role === 'SUPERADMIN')
    return <span className="px-1.5 py-0.5 text-xs bg-amber-400/15 text-amber-400 rounded font-mono tracking-wide">SUPERADMIN</span>;
  if (role === 'ADMIN')
    return <span className="px-1.5 py-0.5 text-xs bg-blue-400/15 text-blue-400 rounded font-mono tracking-wide">ADMIN</span>;
  if (role === 'MODERATOR')
    return <span className="px-1.5 py-0.5 text-xs bg-violet-400/15 text-violet-400 rounded font-mono tracking-wide">MODO</span>;
  return <span className="px-1.5 py-0.5 text-xs bg-zinc-700/50 text-zinc-400 rounded font-mono tracking-wide">USER</span>;
}

// Pastilles des modes auxquels le joueur adhère, avec son ELO par discipline en tooltip.
function GameModeBadges({ user }: { user: AdminUser }) {
  const t = useT();
  const games = (user.games as string[] | undefined) ?? ['babyfoot'];
  const defs: { id: string; label: string; cls: string; elo: number }[] = [
    { id: 'babyfoot', label: 'B', cls: 'bg-amber-400/15 text-amber-400', elo: user.elo },
    { id: 'smash', label: 'S', cls: 'bg-red-400/15 text-red-400', elo: user.eloSmash ?? 1000 },
    { id: 'chess', label: 'É', cls: 'bg-emerald-400/15 text-emerald-400', elo: user.eloChess ?? 1000 },
    { id: 'streetfighter', label: 'SF', cls: 'bg-orange-400/15 text-orange-400', elo: user.eloSf ?? 1000 },
    { id: 'flechettes', label: '🎯', cls: 'bg-teal-400/15 text-teal-300', elo: (user as { eloFlechettes?: number }).eloFlechettes ?? 1000 },
  ];
  return (
    <span className="inline-flex gap-1">
      {defs.map((d) => {
        const on = games.includes(d.id);
        return (
          <span
            key={d.id}
            title={`${d.id} · ${on ? `${d.elo} ELO` : t('god.status.notRegistered')}`}
            className={`w-5 h-5 grid place-items-center rounded text-[10px] font-mono font-bold ${
              on ? d.cls : 'bg-zinc-800 text-zinc-600'
            }`}
          >
            {d.label}
          </span>
        );
      })}
    </span>
  );
}

function StatusBadge({ banned }: { banned: boolean }) {
  const t = useT();
  if (banned)
    return <span className="px-1.5 py-0.5 text-xs bg-red-400/15 text-red-400 rounded font-mono">{t('god.status.banned')}</span>;
  return <span className="px-1.5 py-0.5 text-xs bg-emerald-400/15 text-emerald-400 rounded font-mono">{t('god.status.active')}</span>;
}

function FRStatusBadge({ status }: { status: string }) {
  const t = useT();
  if (status === 'accepted')
    return <span className="px-1.5 py-0.5 text-xs bg-emerald-400/15 text-emerald-400 rounded font-mono">{t('god.fr.accepted')}</span>;
  if (status === 'rejected')
    return <span className="px-1.5 py-0.5 text-xs bg-red-400/15 text-red-400 rounded font-mono">{t('god.fr.rejected')}</span>;
  return <span className="px-1.5 py-0.5 text-xs bg-yellow-400/15 text-yellow-400 rounded font-mono">{t('god.fr.pending')}</span>;
}

function BugStatusBadge({ status }: { status: string }) {
  const t = useT();
  if (status === 'resolved')
    return <span className="px-1.5 py-0.5 text-xs bg-emerald-400/15 text-emerald-400 rounded font-mono">{t('god.bug.resolved')}</span>;
  if (status === 'closed')
    return <span className="px-1.5 py-0.5 text-xs bg-zinc-400/15 text-zinc-400 rounded font-mono">{t('god.bug.closed')}</span>;
  return <span className="px-1.5 py-0.5 text-xs bg-red-400/15 text-red-400 rounded font-mono">{t('god.bug.open')}</span>;
}

function Btn({
  onClick,
  variant = 'default',
  disabled,
  children,
  className = '',
}: {
  onClick: () => void;
  variant?: 'default' | 'danger' | 'success' | 'warn' | 'ghost';
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const base = 'px-2 py-1 text-xs rounded font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
  const variants = {
    default: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100',
    danger: 'bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30',
    success: 'bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 border border-emerald-500/30',
    warn: 'bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-400 border border-yellow-500/30',
    ghost: 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200',
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  className = '',
  type = 'text',
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 ${className}`}
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2 px-1">
        {title}
      </div>
      {children}
    </div>
  );
}

function SubTabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex items-center gap-0 border-b border-zinc-800 mb-4">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`px-4 py-2 text-xs font-mono tracking-widest transition-colors cursor-pointer border-b-2 -mb-[1px] whitespace-nowrap ${
            active === t.id
              ? 'text-zinc-100 border-zinc-400'
              : 'text-zinc-500 border-transparent hover:text-zinc-300'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Primitives : confirmation soignée + mode sudo + sélection multi-lignes ───

function ConfirmModal({
  message,
  danger,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  danger?: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  useEscapeKey(true, onCancel);
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/70 font-mono" onClick={onCancel}>
      <div
        className={`bg-zinc-900 border rounded-lg w-full max-w-sm p-5 ${danger ? 'border-red-500/40' : 'border-zinc-700'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm text-zinc-200 mb-4 whitespace-pre-wrap leading-relaxed">{message}</div>
        <div className="flex gap-2 justify-end">
          <Btn variant="ghost" onClick={onCancel}>{t('god.cancel')}</Btn>
          <Btn variant={danger ? 'danger' : 'default'} onClick={onConfirm}>{confirmLabel ?? t('god.confirm')}</Btn>
        </div>
      </div>
    </div>
  );
}

/** Confirmation impérative : requestConfirm(msg) renvoie une Promise<boolean>. */
function useConfirmDialog() {
  const [state, setState] = useState<
    { message: string; danger?: boolean; confirmLabel?: string; resolve: (v: boolean) => void } | null
  >(null);
  const requestConfirm = useCallback(
    (message: string, opts?: { danger?: boolean; confirmLabel?: string }) =>
      new Promise<boolean>((resolve) =>
        setState({ message, danger: opts?.danger, confirmLabel: opts?.confirmLabel, resolve }),
      ),
    [],
  );
  const confirmNode = state ? (
    <ConfirmModal
      message={state.message}
      danger={state.danger}
      confirmLabel={state.confirmLabel}
      onConfirm={() => {
        state.resolve(true);
        setState(null);
      }}
      onCancel={() => {
        state.resolve(false);
        setState(null);
      }}
    />
  ) : null;
  return { requestConfirm, confirmNode };
}

/** Sélection multi-lignes (par id/login). */
function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = (ids: string[]) =>
    setSelected((prev) => (ids.length > 0 && ids.every((i) => prev.has(i)) ? new Set() : new Set(ids)));
  const clear = () => setSelected(new Set());
  return { selected, toggle, toggleAll, clear };
}

function Check({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="w-3.5 h-3.5 cursor-pointer accent-red-500 align-middle"
    />
  );
}

/**
 * Barre en haut d'un tableau : interrupteur « sudo » (activation confirmée ;
 * une fois ON, les actions destructrices ne re-demandent plus confirmation) +
 * bouton de suppression groupée de la sélection.
 */
function SudoBar({
  sudo,
  onToggle,
  selectedCount,
  onBulkDelete,
  bulkLabel,
}: {
  sudo: boolean;
  onToggle: () => void;
  selectedCount?: number;
  onBulkDelete?: () => void;
  bulkLabel?: string;
}) {
  const t = useT();
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 text-xs font-mono cursor-pointer select-none"
      >
        <span className={`relative w-9 h-5 rounded-full transition-colors ${sudo ? 'bg-red-500/70' : 'bg-zinc-700'}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${sudo ? 'left-[18px]' : 'left-0.5'}`} />
        </span>
        <span className={sudo ? 'text-red-400 font-bold' : 'text-zinc-400'}>{t('god.sudo.label')} {sudo ? t('god.sudo.on') : t('god.sudo.off')}</span>
        <span className="text-[10px] text-zinc-600">
          {sudo ? t('god.sudo.hintOn') : t('god.sudo.hintOff')}
        </span>
      </button>
      {onBulkDelete && (selectedCount ?? 0) > 0 && (
        <Btn variant="danger" onClick={onBulkDelete} className="border border-red-500/40">
          {bulkLabel ?? t('god.sudo.bulkDefault')} ({selectedCount})
        </Btn>
      )}
    </div>
  );
}

// ── Stats edit modal ───────────────────────────────────────────────────────

function StatsEditModal({
  user,
  onClose,
  onSave,
}: {
  user: AdminUser;
  onClose: () => void;
  onSave: () => void;
}) {
  const [elo, setElo] = useState(String(user.elo));
  const [matches, setMatches] = useState(String(user.matchesPlayed));
  const [dodges, setDodges] = useState(String(user.dodgeCount));
  const [trophies, setTrophies] = useState(String(user.tournamentsWon));
  const [eloS, setEloS] = useState(String(user.eloSmash ?? 1000));
  const [matchesS, setMatchesS] = useState(String(user.matchesPlayedSmash ?? 0));
  const [trophiesS, setTrophiesS] = useState(String(user.tournamentsWonSmash ?? 0));
  const [eloC, setEloC] = useState(String(user.eloChess ?? 1000));
  const [matchesC, setMatchesC] = useState(String(user.matchesPlayedChess ?? 0));
  const [trophiesC, setTrophiesC] = useState(String(user.tournamentsWonChess ?? 0));
  const [eloSf, setEloSf] = useState(String(user.eloSf ?? 1000));
  const [matchesSf, setMatchesSf] = useState(String(user.matchesPlayedSf ?? 0));
  const [trophiesSf, setTrophiesSf] = useState(String(user.tournamentsWonSf ?? 0));
  const fl = user as { eloFlechettes?: number; matchesPlayedFlechettes?: number; tournamentsWonFlechettes?: number };
  const [eloFl, setEloFl] = useState(String(fl.eloFlechettes ?? 1000));
  const [matchesFl, setMatchesFl] = useState(String(fl.matchesPlayedFlechettes ?? 0));
  const [trophiesFl, setTrophiesFl] = useState(String(fl.tournamentsWonFlechettes ?? 0));
  const [games, setGames] = useState<Set<'babyfoot' | 'smash' | 'chess' | 'streetfighter' | 'flechettes'>>(
    new Set((user.games as ('babyfoot' | 'smash' | 'chess' | 'streetfighter' | 'flechettes')[] | undefined) ?? ['babyfoot']),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const t = useT();
  useEscapeKey(true, onClose);

  const toggleGame = (g: 'babyfoot' | 'smash' | 'chess' | 'streetfighter' | 'flechettes') =>
    setGames((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  async function handleSave() {
    if (games.size === 0) {
      setError(t('god.stats.atLeastOne'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.adminSetStats(user.login, {
        elo: Number(elo),
        matchesPlayed: Number(matches),
        dodgeCount: Number(dodges),
        tournamentsWon: Number(trophies),
        eloSmash: Number(eloS),
        matchesPlayedSmash: Number(matchesS),
        tournamentsWonSmash: Number(trophiesS),
        eloChess: Number(eloC),
        matchesPlayedChess: Number(matchesC),
        tournamentsWonChess: Number(trophiesC),
        eloSf: Number(eloSf),
        matchesPlayedSf: Number(matchesSf),
        tournamentsWonSf: Number(trophiesSf),
        eloFlechettes: Number(eloFl),
        matchesPlayedFlechettes: Number(matchesFl),
        tournamentsWonFlechettes: Number(trophiesFl),
        games: [...games],
      } as Parameters<typeof api.adminSetStats>[1]);
      onSave();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('god.error'));
    } finally {
      setSaving(false);
    }
  }

  const GAME_GROUPS: { title: string; accent: string; rows: { label: string; value: string; set: (v: string) => void }[] }[] = [
    {
      title: t('god.game.babyfoot'),
      accent: 'text-amber-400',
      rows: [
        { label: t('god.stats.elo'), value: elo, set: setElo },
        { label: t('god.stats.matches'), value: matches, set: setMatches },
        { label: t('god.stats.tournamentsWon'), value: trophies, set: setTrophies },
      ],
    },
    {
      title: t('god.game.smash'),
      accent: 'text-red-400',
      rows: [
        { label: t('god.stats.elo'), value: eloS, set: setEloS },
        { label: t('god.stats.matches'), value: matchesS, set: setMatchesS },
        { label: t('god.stats.tournamentsWon'), value: trophiesS, set: setTrophiesS },
      ],
    },
    {
      title: t('god.game.chess'),
      accent: 'text-emerald-400',
      rows: [
        { label: t('god.stats.elo'), value: eloC, set: setEloC },
        { label: t('god.stats.matches'), value: matchesC, set: setMatchesC },
        { label: t('god.stats.tournamentsWon'), value: trophiesC, set: setTrophiesC },
      ],
    },
    {
      title: t('god.game.streetfighter'),
      accent: 'text-orange-400',
      rows: [
        { label: t('god.stats.elo'), value: eloSf, set: setEloSf },
        { label: t('god.stats.matches'), value: matchesSf, set: setMatchesSf },
        { label: t('god.stats.tournamentsWon'), value: trophiesSf, set: setTrophiesSf },
      ],
    },
    {
      title: t('god.game.flechettes'),
      accent: 'text-teal-300',
      rows: [
        { label: t('god.stats.elo'), value: eloFl, set: setEloFl },
        { label: t('god.stats.matches'), value: matchesFl, set: setMatchesFl },
        { label: t('god.stats.tournamentsWon'), value: trophiesFl, set: setTrophiesFl },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-[28rem] max-w-full max-h-[88vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-mono text-zinc-300 mb-4">
          {t('god.stats.title')} <span className="text-zinc-100 font-bold">{user.login}</span>
        </div>

        {/* Adhésion aux modes */}
        <div className="mb-4">
          <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">{t('god.stats.activeModes')}</div>
          <div className="flex gap-2">
            {(['babyfoot', 'smash', 'chess', 'streetfighter', 'flechettes'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => toggleGame(g)}
                className={`px-3 py-1.5 rounded font-mono text-xs border transition-colors ${
                  games.has(g)
                    ? 'bg-zinc-100/10 border-zinc-400 text-zinc-100'
                    : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Stats par discipline */}
        <div className="space-y-4">
          {GAME_GROUPS.map((grp) => (
            <div key={grp.title}>
              <div className={`text-xs font-mono uppercase tracking-widest mb-2 ${grp.accent}`}>{grp.title}</div>
              <div className="space-y-2">
                {grp.rows.map(({ label, value, set }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-zinc-400 w-28">{label}</span>
                    <Input type="number" value={value} onChange={set} className="flex-1" />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* Dodges (transversal) */}
          <div className="flex items-center gap-3 border-t border-zinc-800 pt-3">
            <span className="text-xs font-mono text-zinc-400 w-28">{t('god.stats.dodges')}</span>
            <Input type="number" value={dodges} onChange={setDodges} className="flex-1" />
          </div>
        </div>

        {error && <div className="mt-3 text-xs text-red-400 font-mono">{error}</div>}
        <div className="mt-5 flex gap-2 justify-end">
          <Btn onClick={onClose} variant="ghost">{t('god.cancel')}</Btn>
          <Btn onClick={handleSave} disabled={saving} variant="default">
            {saving ? t('god.saving') : t('god.save')}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Reset total de la ligue (SUPERADMIN) ───────────────────────────────────
// Phrase à recopier À LA MAIN (copier-coller / glisser bloqués) pour déverrouiller
// le bouton. Doit être identique côté backend (RESET_CONFIRM_PHRASE).
const RESET_CONFIRM_PHRASE = 'oui je suis sure de ce que je fais';

function ResetDatabaseModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [typed, setTyped] = useState('');
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ removedUsers: number; resetUsers: number } | null>(null);
  const t = useT();
  useEscapeKey(true, onClose);

  const blockPaste = (e: ClipboardEvent | DragEvent) => {
    e.preventDefault();
    setError(t('god.reset.noPaste'));
  };

  const ok = typed === RESET_CONFIRM_PHRASE;

  async function handleReset() {
    if (!ok) return;
    setResetting(true);
    setError('');
    try {
      const r = await api.adminResetDatabase(typed);
      setResult({ removedUsers: r.removedUsers, resetUsers: r.resetUsers });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('god.error'));
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-red-500/40 rounded-lg p-6 w-[28rem] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {result ? (
          <>
            <div className="text-sm font-mono text-emerald-400 mb-3 font-bold">{t('god.reset.done')}</div>
            <div className="text-xs font-mono text-zinc-400 space-y-1">
              <div>{result.resetUsers} {t('god.reset.resetUsers')}</div>
              <div>{result.removedUsers} {t('god.reset.removedUsers')}</div>
              <div className="text-zinc-500">{t('god.reset.historyWiped')}</div>
            </div>
            <div className="mt-5 flex justify-end">
              <Btn onClick={onClose} variant="default">{t('god.close')}</Btn>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">💣</span>
              <span className="text-sm font-mono text-red-400 font-bold uppercase tracking-widest">{t('god.reset.title')}</span>
            </div>
            <div className="text-xs font-mono text-zinc-400 leading-relaxed space-y-2 mb-4">
              <p>{t('god.reset.willA')} <span className="text-red-400 font-bold">{t('god.reset.irreversible')}</span>{t('god.reset.willB')}</p>
              <ul className="list-disc list-inside text-zinc-500 space-y-0.5">
                <li>{t('god.reset.li1.a')} <span className="text-zinc-300">{t('god.reset.li1.b')}</span>{t('god.reset.li1.c')}</li>
                <li>{t('god.reset.li2.a')} <span className="text-zinc-300">{t('god.reset.li2.b')}</span>{t('god.reset.li2.c')}</li>
                <li>{t('god.reset.li3.a')} <span className="text-zinc-300">{t('god.reset.li3.b')}</span>.</li>
              </ul>
              <p className="text-zinc-500">{t('god.reset.preserve')}</p>
            </div>
            <div className="text-xs font-mono text-zinc-400 mb-2">
              {t('god.reset.copyHint')}
            </div>
            <div className="bg-zinc-800/60 border border-zinc-700 rounded px-3 py-2 mb-2 text-sm font-mono text-zinc-200 select-none">
              {RESET_CONFIRM_PHRASE}
            </div>
            <input
              type="text"
              value={typed}
              onChange={(e) => { setTyped(e.target.value); setError(''); }}
              onPaste={blockPaste}
              onDrop={blockPaste}
              onDragOver={(e) => e.preventDefault()}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={t('god.reset.copyPlaceholder')}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-red-500/60"
            />
            {error && <div className="mt-3 text-xs text-red-400 font-mono">{error}</div>}
            <div className="mt-5 flex gap-2 justify-end">
              <Btn onClick={onClose} variant="ghost">{t('god.cancel')}</Btn>
              <Btn onClick={handleReset} disabled={!ok || resetting} variant="danger">
                {resetting ? t('god.reset.resetting') : t('god.reset.confirmBtn')}
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Éditeur de permissions modérateur ─────────────────────────────────────

type PermsWithGames = Partial<Record<ModeratorPermissionKey, boolean>> & { managedGames?: string[] };

const MANAGED_GAME_OPTIONS = [
  { id: 'babyfoot', label: 'Baby', color: '#ffc94a' },
  { id: 'smash', label: 'Smash', color: '#ff3d50' },
  { id: 'chess', label: 'Échecs', color: '#56c46e' },
  { id: 'streetfighter', label: 'SF', color: '#ff7a18' },
  { id: 'flechettes', label: 'Fléch.', color: '#14b8a6' },
] as const;

const GAME_ABBREV: Record<string, string> = {
  babyfoot: 'B',
  smash: 'S',
  chess: 'É',
  streetfighter: 'SF',
  flechettes: 'F',
};

function ModeratorPermissionsButton({ user, onSaved }: { user: AdminUser; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [perms, setPerms] = useState<PermsWithGames>(
    (user.moderatorPermissions as PermsWithGames) ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  useEscapeKey(open, () => setOpen(false));

  function toggle(k: ModeratorPermissionKey) {
    setPerms((p) => ({ ...p, [k]: !p[k] }));
  }

  function toggleGame(gameId: string) {
    setPerms((p) => {
      const current = p.managedGames ?? [];
      const next = current.includes(gameId)
        ? current.filter((g) => g !== gameId)
        : [...current, gameId];
      return { ...p, managedGames: next };
    });
  }

  async function save() {
    setSaving(true);
    setErr('');
    try {
      await api.setModeratorPermissions(user.login, perms);
      onSaved();
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  const activeCount = MODERATOR_PERMISSION_KEYS.filter((k) => !!perms[k]).length;
  const managedGames = (user.moderatorPermissions as PermsWithGames)?.managedGames ?? [];

  return (
    <>
      <Btn
        onClick={() => { setPerms((user.moderatorPermissions as PermsWithGames) ?? {}); setOpen(true); }}
        variant="ghost"
        className="border border-violet-500/30 text-violet-400"
      >
        🔑 {activeCount}/{MODERATOR_PERMISSION_KEYS.length}
        {managedGames.length > 0 && (
          <span className="ml-1.5 text-[10px] opacity-70">
            {managedGames.map((g) => GAME_ABBREV[g] ?? g).join('+')}
          </span>
        )}
      </Btn>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-80 shadow-2xl">
            <div className="text-sm font-mono text-zinc-100 font-bold mb-1">Permissions de @{user.login}</div>
            <div className="text-xs text-zinc-500 font-mono mb-3">MODO — cocher = accès accordé</div>
            {/* Jeux gérés */}
            <div className="mb-4">
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2">Jeux gérés</div>
              <div className="flex flex-wrap gap-2">
                {MANAGED_GAME_OPTIONS.map(({ id, label, color }) => {
                  const active = (perms.managedGames ?? []).includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleGame(id)}
                      className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border"
                      style={{
                        background: active ? `${color}22` : 'rgba(255,255,255,0.03)',
                        borderColor: active ? color : 'rgba(255,255,255,0.1)',
                        color: active ? color : 'rgba(255,255,255,0.35)',
                        boxShadow: active ? `0 0 12px -4px ${color}` : 'none',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5 mb-4">
              {MODERATOR_PERMISSION_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={!!perms[k]}
                    onChange={() => toggle(k)}
                    className="accent-violet-500 w-3.5 h-3.5"
                  />
                  <span className="text-xs font-mono text-zinc-300 group-hover:text-zinc-100 transition-colors">
                    {MODERATOR_PERMISSION_LABELS[k]}
                  </span>
                </label>
              ))}
            </div>
            {err && <div className="text-xs text-red-400 font-mono mb-2">{err}</div>}
            <div className="flex gap-2 justify-end">
              <Btn onClick={() => setOpen(false)} variant="ghost">Annuler</Btn>
              <Btn onClick={save} disabled={saving} variant="default">
                {saving ? 'Sauvegarde…' : 'Enregistrer'}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab: UTILISATEURS ──────────────────────────────────────────────────────

// Logins hardcodés côté serveur — on ne leur propose pas le toggle staging
// (ils ont accès quoi qu'il arrive, et le backend les protège de toute façon).
const HARDCODED_SUPERADMINS = new Set(['abidaux', 'throbert']);

// Ordre de privilège pour trier la colonne « rôle ».
const ROLE_WEIGHT: Record<string, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPERADMIN: 3 };
type UsersSortKey = 'login' | 'role' | 'elo' | 'matches' | 'dodges' | 'trophies' | 'status' | 'campus';

// Accès ELO/matchs/trophées par discipline — permet d'afficher dans la table users
// le classement du mode sélectionné (et pas seulement le babyfoot 1v1).
const USER_GAME_STATS: Record<Game, {
  elo: (u: AdminUser) => number;
  matches: (u: AdminUser) => number;
  trophies: (u: AdminUser) => number;
}> = {
  babyfoot: { elo: (u) => u.elo, matches: (u) => u.matchesPlayed, trophies: (u) => u.tournamentsWon },
  smash: { elo: (u) => u.eloSmash ?? 1000, matches: (u) => u.matchesPlayedSmash ?? 0, trophies: (u) => u.tournamentsWonSmash ?? 0 },
  chess: { elo: (u) => u.eloChess ?? 1000, matches: (u) => u.matchesPlayedChess ?? 0, trophies: (u) => u.tournamentsWonChess ?? 0 },
  streetfighter: { elo: (u) => u.eloSf ?? 1000, matches: (u) => u.matchesPlayedSf ?? 0, trophies: (u) => u.tournamentsWonSf ?? 0 },
  flechettes: { elo: (u) => u.eloFlechettes ?? 1000, matches: (u) => u.matchesPlayedFlechettes ?? 0, trophies: (u) => u.tournamentsWonFlechettes ?? 0 },
};

function UserDetailPanel({
  user,
  myRole,
  myLogin,
  pending,
  onAction,
  onClose,
  onEditStats,
  onReload,
}: {
  user: AdminUser;
  myRole: Role;
  myLogin: string;
  pending: string | null;
  onAction: (fn: () => Promise<unknown>) => Promise<void>;
  onClose: () => void;
  onEditStats: () => void;
  onReload: () => void;
}) {
  const isSelf = user.login === myLogin;
  const isHardcoded = HARDCODED_SUPERADMINS.has(user.login.toLowerCase());
  const isLocked = isSelf || isHardcoded;
  const isBusy = pending === user.login;
  const isStagingAllowed = !!user.stagingAllowed;
  const sfAdmin = !!(user as AdminUser & { sfAdmin?: boolean }).sfAdmin;
  const t = useT();
  const { requestConfirm, confirmNode } = useConfirmDialog();

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-zinc-800/50">
      {confirmNode}

      {/* Col 1: Rôle */}
      <div className="space-y-3">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Rôle</div>
        {isLocked ? (
          <div className="flex items-center gap-2">
            <RoleBadge role={user.role} />
            <span className="text-zinc-600 text-xs font-mono">{t('god.users.permanent')}</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(['USER', 'MODERATOR', 'ADMIN'] as const).map((role) => {
              const isActive = user.role === role;
              if (myRole !== 'SUPERADMIN' && role === 'ADMIN') return null;
              if (myRole !== 'SUPERADMIN' && user.role === 'SUPERADMIN') return null;
              return (
                <button
                  key={role}
                  type="button"
                  disabled={isActive || isBusy}
                  onClick={() => onAction(() => api.setUserRole(user.login, role))}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all cursor-pointer border disabled:cursor-default ${
                    isActive
                      ? role === 'ADMIN'
                        ? 'bg-blue-400/15 border-blue-400/40 text-blue-400'
                        : role === 'MODERATOR'
                        ? 'bg-violet-400/15 border-violet-400/40 text-violet-400'
                        : 'bg-zinc-700/60 border-zinc-600 text-zinc-300'
                      : 'bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {role}
                </button>
              );
            })}
          </div>
        )}

        {/* Flags */}
        {!isLocked && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {/* SF Admin */}
            {(myRole === 'ADMIN' || myRole === 'SUPERADMIN') && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  onAction(() =>
                    (api as unknown as { adminSetSfAdmin: (l: string, v: boolean) => Promise<unknown> }).adminSetSfAdmin(
                      user.login,
                      !sfAdmin
                    )
                  )
                }
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all cursor-pointer border ${
                  sfAdmin
                    ? 'bg-orange-400/15 border-orange-400/40 text-orange-400'
                    : 'bg-transparent border-zinc-700 text-zinc-500 hover:border-orange-400/40 hover:text-orange-400'
                }`}
              >
                SF Admin {sfAdmin ? '✓' : '○'}
              </button>
            )}
            {/* Staging (SUPERADMIN) */}
            {myRole === 'SUPERADMIN' && (
              <button
                type="button"
                disabled={isBusy}
                onClick={async () => {
                  const grant = !isStagingAllowed;
                  const msg = grant
                    ? t('god.users.staging.grant').replace('{login}', user.login)
                    : t('god.users.staging.revoke').replace('{login}', user.login);
                  const ok = await requestConfirm(msg, {
                    danger: !grant,
                    confirmLabel: grant ? t('god.users.staging.grantLabel') : t('god.users.staging.revokeLabel'),
                  });
                  if (ok) onAction(() => api.setStagingAccess(user.login, grant));
                }}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all cursor-pointer border ${
                  isStagingAllowed
                    ? 'bg-teal-400/15 border-teal-400/40 text-teal-400'
                    : 'bg-transparent border-zinc-700 text-zinc-500 hover:border-teal-400/40 hover:text-teal-400'
                }`}
              >
                β Staging {isStagingAllowed ? '✓' : '○'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Col 2: Permissions (only for MODERATOR) */}
      <div className="space-y-3">
        {user.role === 'MODERATOR' && (myRole === 'ADMIN' || myRole === 'SUPERADMIN') ? (
          <>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Permissions</div>
            <ModeratorPermissionsButton user={user} onSaved={onReload} />
            <div className="text-[10px] text-zinc-600 font-mono">
              {MODERATOR_PERMISSION_KEYS.filter((k) =>
                !!(user.moderatorPermissions as Partial<Record<ModeratorPermissionKey, boolean>> | null)?.[k]
              ).length}/{MODERATOR_PERMISSION_KEYS.length} permissions actives
            </div>
          </>
        ) : (
          <div className="text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
            {user.role === 'MODERATOR' ? 'Permissions' : 'Permissions (n/a — non MODO)'}
          </div>
        )}
      </div>

      {/* Col 3: Actions */}
      <div className="space-y-3">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Actions</div>
        <div className="flex flex-wrap gap-1.5">
          <Btn onClick={onEditStats} variant="ghost">{t('god.users.statsBtn')}</Btn>
          <Btn
            onClick={() => onAction(() => api.adminResetOpsCooldown(user.login))}
            disabled={isBusy}
            variant="ghost"
            className="border border-red-500/30 text-red-400"
          >
            {t('god.users.resetCooldown')}
          </Btn>
          {!isLocked && (
            user.bannedAt ? (
              <Btn
                onClick={() => onAction(() => api.adminUnbanUser(user.login))}
                disabled={isBusy}
                variant="success"
              >
                {t('god.users.unban')}
              </Btn>
            ) : (
              <Btn
                onClick={async () => {
                  const ok = await requestConfirm(
                    t('god.users.confirmBan').replace('{login}', user.login),
                    { danger: true, confirmLabel: t('god.users.confirmBanLabel') }
                  );
                  if (ok) onAction(() => api.adminBanUser(user.login));
                }}
                disabled={isBusy}
                variant="danger"
              >
                {t('god.users.ban')}
              </Btn>
            )
          )}
          {myRole === 'SUPERADMIN' && (IS_STAGING || user.ftId === null) && !isLocked && (
            <Btn
              onClick={async () => {
                const ok = await requestConfirm(
                  t('god.users.confirmDeleteFake').replace('{login}', user.login),
                  { danger: true, confirmLabel: t('god.delete') }
                );
                if (ok) { onAction(() => api.adminDeleteUser(user.login)); onClose(); }
              }}
              disabled={isBusy}
              variant="danger"
              className="border border-red-500/40"
            >
              {t('god.users.deleteBtn')}
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}

function UsersTab({ myRole, myLogin }: { myRole: Role; myLogin: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  // Discipline dont on affiche l'ELO/matchs/trophées dans la table.
  const [statGame, setStatGame] = useState<Game>('babyfoot');
  const [pending, setPending] = useState<string | null>(null);
  const [editingStats, setEditingStats] = useState<AdminUser | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [selectedLogin, setSelectedLogin] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [sudo, setSudo] = useState(false);
  const { requestConfirm, confirmNode } = useConfirmDialog();
  const { selected, toggle, toggleAll, clear } = useSelection();
  const t = useT();

  // Création d'un faux joueur (SUPERADMIN).
  const [newLogin, setNewLogin] = useState('');
  const [newCampus, setNewCampus] = useState('Le Havre');
  const [newElo, setNewElo] = useState('1000');
  const [creating, setCreating] = useState(false);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.adminUsers()
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useServerEvents(() => load(true), PANEL_EVENTS);

  const filtered = users.filter((u) => u.login.toLowerCase().includes(filter.toLowerCase()));

  const { sort, toggleSort } = useTableSort<UsersSortKey>({ key: 'login', dir: 'asc' });
  const sorted = sortRows(
    filtered,
    sort,
    (u, k) => {
      switch (k) {
        case 'login': return u.login.toLowerCase();
        case 'role': return ROLE_WEIGHT[u.role] ?? 0;
        case 'elo': return USER_GAME_STATS[statGame].elo(u);
        case 'matches': return USER_GAME_STATS[statGame].matches(u);
        case 'dodges': return u.dodgeCount;
        case 'trophies': return USER_GAME_STATS[statGame].trophies(u);
        case 'status': return u.bannedAt ? 1 : 0;
        case 'campus': return (u.campus ?? '').toLowerCase();
        default: return 0;
      }
    },
    (a, b) => a.login.localeCompare(b.login),
  );

  async function createUser() {
    const login = newLogin.trim();
    if (!login) return;
    setCreating(true);
    setError('');
    try {
      await api.adminCreateUser(login, {
        campus: newCampus.trim() || undefined,
        elo: Number(newElo) || 1000,
      });
      setNewLogin('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('god.error'));
    } finally {
      setCreating(false);
    }
  }

  // Confirme l'action, SAUF si le mode sudo est actif (le toggle a déjà été confirmé).
  async function confirmOrSudo(message: string, confirmLabel = t('god.delete')) {
    return sudo ? true : requestConfirm(message, { danger: true, confirmLabel });
  }
  async function toggleSudo() {
    if (sudo) {
      setSudo(false);
      return;
    }
    const ok = await requestConfirm(
      t('god.sudo.confirmUsers'),
      { danger: true, confirmLabel: t('god.sudo.activate') },
    );
    if (ok) setSudo(true);
  }

  // Comptes supprimables : faux joueurs (sans 42), hors soi-même et superadmins.
  // En staging, on autorise aussi les comptes synchronisés depuis la prod (ftId
  // réel mais simple copie sandbox) — cf. backend, suppression élargie en staging.
  const deletableLogins =
    myRole === 'SUPERADMIN'
      ? filtered
          .filter((u) => (IS_STAGING || u.ftId === null) && u.login !== myLogin && u.role !== 'SUPERADMIN')
          .map((u) => u.login)
      : [];

  async function bulkDelete() {
    const ids = [...selected].filter((l) => deletableLogins.includes(l));
    if (ids.length === 0) return;
    if (!(await confirmOrSudo(t('god.users.confirmBulk').replace('{n}', String(ids.length))))) return;
    setError('');
    for (const l of ids) await api.adminDeleteUser(l).catch((e) => setError(String(e)));
    clear();
    load();
  }

  return (
    <div className="p-4">
      {editingStats && (
        <StatsEditModal user={editingStats} onClose={() => setEditingStats(null)} onSave={load} />
      )}
      {showReset && (
        <ResetDatabaseModal onClose={() => setShowReset(false)} onDone={() => load()} />
      )}

      {myRole === 'SUPERADMIN' && (
        <div className="mb-4 bg-red-500/5 border border-red-500/30 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-mono text-red-400 uppercase tracking-widest mb-0.5">
              {t('god.users.danger.title')}
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">
              {t('god.users.danger.desc')}
            </div>
          </div>
          <Btn onClick={() => setShowReset(true)} variant="danger" className="border border-red-500/40 px-3 py-1.5">
            {t('god.users.danger.btn')}
          </Btn>
        </div>
      )}

      {myRole === 'SUPERADMIN' && (
        <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-wrap items-end gap-3">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest w-full mb-1">
            {t('god.users.create.title')}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono">{t('god.users.create.login')}</span>
            <Input value={newLogin} onChange={setNewLogin} placeholder="ex. test9" className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono">{t('god.users.create.campus')}</span>
            <Input value={newCampus} onChange={setNewCampus} placeholder="Le Havre" className="w-36" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono">{t('god.users.create.elo')}</span>
            <Input type="number" value={newElo} onChange={setNewElo} className="w-24" />
          </div>
          <Btn onClick={createUser} disabled={creating || !newLogin.trim()} variant="success">
            {creating ? t('god.users.create.creating') : t('god.users.create.btn')}
          </Btn>
          <span className="text-[10px] text-zinc-600 font-mono">
            {t('god.users.create.hint')}
          </span>
        </div>
      )}

      {confirmNode}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input value={filter} onChange={setFilter} placeholder={t('god.users.filter')} className="w-64" />
        <span className="text-zinc-500 text-xs font-mono">{filtered.length} {t('god.users.count')}</span>
        {/* Discipline affichée dans les colonnes ELO / matchs / 🏆. */}
        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span style={{ color: GAME_META[statGame].color }}>●</span>
          ELO du mode
          <select
            value={statGame}
            onChange={(e) => setStatGame(e.target.value as Game)}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/60"
          >
            {GAMES.map((g) => <option key={g} value={g}>{t(`game.${g}`)}</option>)}
          </select>
        </label>
      </div>

      <SudoBar
        sudo={sudo}
        onToggle={toggleSudo}
        selectedCount={selected.size}
        onBulkDelete={deletableLogins.length > 0 ? bulkDelete : undefined}
        bulkLabel={t('god.users.bulkDelete')}
      />

      {error && <div className="mb-3 text-xs text-red-400 font-mono">{error}</div>}
      {loading ? (
        <div className="text-zinc-500 text-sm font-mono">{t('god.loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                <th className="py-2 px-3 w-8">
                  {deletableLogins.length > 0 && (
                    <Check
                      checked={deletableLogins.every((l) => selected.has(l))}
                      onChange={() => toggleAll(deletableLogins)}
                    />
                  )}
                </th>
                <SortableTh<UsersSortKey> label={t('god.users.col.login')} k="login" sort={sort} onSort={toggleSort} align="left" className="py-2 px-3" />
                <SortableTh<UsersSortKey> label={t('god.users.col.role')} k="role" sort={sort} onSort={toggleSort} align="left" defaultDir="desc" className="py-2 px-3" />
                <th className="text-left py-2 px-3">{t('god.users.col.modes')}</th>
                <SortableTh<UsersSortKey> label={t('god.users.col.elo')} k="elo" sort={sort} onSort={toggleSort} align="right" defaultDir="desc" className="py-2 px-3" />
                <SortableTh<UsersSortKey> label={t('god.users.col.matches')} k="matches" sort={sort} onSort={toggleSort} align="right" defaultDir="desc" className="py-2 px-3" />
                <SortableTh<UsersSortKey> label={t('god.users.col.dodges')} k="dodges" sort={sort} onSort={toggleSort} align="right" defaultDir="desc" className="py-2 px-3" />
                <SortableTh<UsersSortKey> label="🏆" k="trophies" sort={sort} onSort={toggleSort} align="right" defaultDir="desc" className="py-2 px-3" />
                <SortableTh<UsersSortKey> label={t('god.users.col.status')} k="status" sort={sort} onSort={toggleSort} align="left" defaultDir="desc" className="py-2 px-3" />
                <SortableTh<UsersSortKey> label={t('god.users.col.campus')} k="campus" sort={sort} onSort={toggleSort} align="left" className="py-2 px-3" />
                <th className="text-right py-2 px-3">{t('god.users.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((u) => {
                const isDeletable = deletableLogins.includes(u.login);
                const isStagingAllowed = !!u.stagingAllowed;
                const isExpanded = selectedLogin === u.login;
                return (
                  <Fragment key={u.login}>
                    <tr
                      onClick={() => setSelectedLogin(isExpanded ? null : u.login)}
                      className={`border-b border-zinc-800/40 cursor-pointer transition-colors ${
                        isExpanded ? 'bg-zinc-800/60' : 'hover:bg-zinc-900/60'
                      } ${selected.has(u.login) ? 'bg-red-500/5' : ''}`}
                    >
                      <td className="py-2 px-3">
                        {isDeletable && (
                          <Check
                            checked={selected.has(u.login)}
                            onChange={() => toggle(u.login)}
                          />
                        )}
                      </td>
                      <td className="py-2 px-3 text-zinc-100 font-mono">{u.login}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1">
                          <RoleBadge role={u.role} />
                          {isStagingAllowed && !HARDCODED_SUPERADMINS.has(u.login.toLowerCase()) && (
                            <span className="px-1 py-0.5 text-[10px] bg-teal-400/10 text-teal-400 rounded font-mono" title="Accès staging">β</span>
                          )}
                          {(u as AdminUser & { sfAdmin?: boolean }).sfAdmin && (
                            <span className="px-1 py-0.5 text-[10px] bg-orange-400/10 text-orange-400 rounded font-mono" title="SF Admin">SF</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3"><GameModeBadges user={u} /></td>
                      <td className="py-2 px-3 text-right tabular-nums text-zinc-100">{USER_GAME_STATS[statGame].elo(u)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-zinc-400">{USER_GAME_STATS[statGame].matches(u)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-zinc-400">{u.dodgeCount}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-zinc-400">{USER_GAME_STATS[statGame].trophies(u)}</td>
                      <td className="py-2 px-3"><StatusBadge banned={!!u.bannedAt} /></td>
                      <td className="py-2 px-3 text-zinc-500 text-xs">{u.campus ?? '—'}</td>
                      <td className="py-2 px-3 text-right">
                        <span className={`text-zinc-500 transition-transform inline-block ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-zinc-900/80 border-b border-zinc-700">
                        <td colSpan={11} className="p-0">
                          <UserDetailPanel
                            user={u}
                            myRole={myRole}
                            myLogin={myLogin}
                            pending={pending}
                            onAction={async (fn) => {
                              setPending(u.login);
                              setError('');
                              try { await fn(); load(); }
                              catch (e) { setError(e instanceof Error ? e.message : t('god.error')); }
                              finally { setPending(null); }
                            }}
                            onClose={() => setSelectedLogin(null)}
                            onEditStats={() => setEditingStats(u)}
                            onReload={load}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: MODÉRATION ────────────────────────────────────────────────────────

function ModerationTab() {
  const [query, setQuery] = useState('');
  const [stats, setStats] = useState<ModerationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const t = useT();

  async function lookup() {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setStats(null);
    try {
      const data = await api.adminModerationStats(query.trim());
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('god.mod.notFound'));
    } finally {
      setLoading(false);
    }
  }

  async function handleBan() {
    if (!stats) return;
    setPending('ban');
    try {
      await api.adminBanUser(stats.user.login);
      const data = await api.adminModerationStats(stats.user.login);
      setStats(data);
    } finally { setPending(''); }
  }

  async function handleUnban() {
    if (!stats) return;
    setPending('unban');
    try {
      await api.adminUnbanUser(stats.user.login);
      const data = await api.adminModerationStats(stats.user.login);
      setStats(data);
    } finally { setPending(''); }
  }

  // Temps réel : si un joueur est affiché, on rafraîchit ses stats en silence.
  useServerEvents(() => {
    if (!stats) return;
    api.adminModerationStats(stats.user.login).then(setStats).catch(() => {});
  }, PANEL_EVENTS);

  const u = stats?.user;

  return (
    <div className="p-4">
      <div className="mb-5 flex items-center gap-3">
        <Input
          value={query}
          onChange={setQuery}
          placeholder={t('god.mod.lookup')}
          className="w-64"
        />
        <Btn
          onClick={lookup}
          disabled={loading || !query.trim()}
          variant="default"
        >
          {loading ? t('god.mod.analyzing') : t('god.mod.analyze')}
        </Btn>
      </div>
      {error && <div className="text-xs text-red-400 font-mono mb-4">{error}</div>}

      {u && stats && (
        <div className="space-y-5">
          {/* Header */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg font-mono text-zinc-100 font-bold">{u.login}</span>
                <RoleBadge role={u.role} />
                <StatusBadge banned={!!u.bannedAt} />
              </div>
              <div className="grid grid-cols-4 gap-4 text-center">
                {[
                  { label: t('god.mod.elo'), value: u.elo },
                  { label: t('god.mod.matches'), value: u.matchesPlayed },
                  { label: t('god.mod.dodges'), value: u.dodgeCount },
                  { label: t('god.mod.trophies'), value: u.tournamentsWon },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-zinc-800/60 rounded p-2">
                    <div className="text-xl font-mono font-bold text-zinc-100 tabular-nums">{value}</div>
                    <div className="text-xs text-zinc-500 uppercase">{label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4 text-center">
                {[
                  { label: t('god.mod.rejEmitted'), value: stats.rejectionsEmitted.length, color: 'text-orange-400' },
                  { label: t('god.mod.rejReceived'), value: stats.rejectionsReceived.length, color: 'text-red-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-zinc-800/60 rounded p-2">
                    <div className={`text-xl font-mono font-bold tabular-nums ${color}`}>{value}</div>
                    <div className="text-xs text-zinc-500 uppercase">{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {u.bannedAt
                ? <Btn onClick={handleUnban} disabled={!!pending} variant="success">{t('god.mod.unban')}</Btn>
                : <Btn onClick={handleBan} disabled={!!pending} variant="danger">{t('god.mod.ban')}</Btn>
              }
            </div>
          </div>

          {/* Permissions du modérateur */}
          {u.role === 'MODERATOR' && (
            <div className="bg-zinc-900 border border-violet-500/20 rounded-lg p-4">
              <div className="text-xs font-mono text-violet-400 uppercase tracking-widest mb-3">Permissions MODO</div>
              <div className="grid grid-cols-2 gap-1.5">
                {MODERATOR_PERMISSION_KEYS.map((k) => {
                  const active = !!(stats.moderatorPermissions?.[k as ModeratorPermissionKey]);
                  return (
                    <div key={k} className={`flex items-center gap-1.5 text-xs font-mono ${active ? 'text-violet-300' : 'text-zinc-600'}`}>
                      <span>{active ? '✅' : '⬜'}</span>
                      <span>{MODERATOR_PERMISSION_LABELS[k as ModeratorPermissionKey]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top opponents */}
          <Section title={t('god.mod.topOpponents')}>
            <div className="flex flex-wrap gap-2">
              {stats.topOpponents.length === 0 ? (
                <span className="text-zinc-600 text-xs font-mono">{t('god.mod.noMatch')}</span>
              ) : (
                stats.topOpponents.map(({ login, count }) => (
                  <div key={login} className="bg-zinc-800 rounded px-3 py-1.5 flex items-center gap-2">
                    <span className="text-zinc-200 font-mono text-sm">{login}</span>
                    <span className="text-zinc-500 font-mono text-xs">{count} {count > 1 ? t('god.mod.matchs') : t('god.mod.match')}</span>
                  </div>
                ))
              )}
            </div>
          </Section>

          {/* Match history */}
          <Section title={t('god.mod.history').replace('{n}', String(stats.recentMatches.length))}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                    <th className="text-left py-1.5 px-2">{t('god.match.col.date')}</th>
                    <th className="text-left py-1.5 px-2">{t('god.match.col.playerA')}</th>
                    <th className="text-center py-1.5 px-2">{t('god.match.col.score')}</th>
                    <th className="text-left py-1.5 px-2">{t('god.match.col.playerB')}</th>
                    <th className="text-right py-1.5 px-2">ΔA</th>
                    <th className="text-right py-1.5 px-2">ΔB</th>
                    <th className="text-center py-1.5 px-2">ELO</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentMatches.map((m) => {
                    const isWinner = (m.playerALogin === u.login && m.winner === 'A') || (m.playerBLogin === u.login && m.winner === 'B');
                    return (
                      <tr key={m.id} className={`border-b border-zinc-800/40 ${isWinner ? 'bg-emerald-400/5' : 'bg-red-400/5'}`}>
                        <td className="py-1.5 px-2 text-zinc-500">{fmtDate(m.playedAt)}</td>
                        <td className={`py-1.5 px-2 ${m.winner === 'A' ? 'text-emerald-400' : 'text-zinc-300'}`}>{m.playerALogin}</td>
                        <td className="py-1.5 px-2 text-center tabular-nums text-zinc-100">{m.scoreA}–{m.scoreB}</td>
                        <td className={`py-1.5 px-2 ${m.winner === 'B' ? 'text-emerald-400' : 'text-zinc-300'}`}>{m.playerBLogin}</td>
                        <td className={`py-1.5 px-2 text-right tabular-nums ${m.deltaA >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{m.deltaA > 0 ? '+' : ''}{m.deltaA}</td>
                        <td className={`py-1.5 px-2 text-right tabular-nums ${m.deltaB >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{m.deltaB > 0 ? '+' : ''}{m.deltaB}</td>
                        <td className="py-1.5 px-2 text-center">{m.countedForElo ? <span className="text-emerald-400">✓</span> : <span className="text-zinc-600">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Rejections */}
          {stats.rejectionsEmitted.length > 0 && (
            <Section title={t('god.mod.rejEmittedBy').replace('{login}', u.login).replace('{n}', String(stats.rejectionsEmitted.length))}>
              <RejectionTable rows={stats.rejectionsEmitted} perspective="emitted" />
            </Section>
          )}
          {stats.rejectionsReceived.length > 0 && (
            <Section title={t('god.mod.rejReceivedBy').replace('{login}', u.login).replace('{n}', String(stats.rejectionsReceived.length))}>
              <RejectionTable rows={stats.rejectionsReceived} perspective="received" />
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab: REJETS ────────────────────────────────────────────────────────────

function RejectionTable({ rows }: { rows: RejectedMatch[]; perspective?: 'emitted' | 'received' | 'all' }) {
  const t = useT();
  return (
    <table className="w-full text-xs font-mono border-collapse">
      <thead>
        <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
          <th className="text-left py-1.5 px-2">{t('god.rej.col.date')}</th>
          <th className="text-left py-1.5 px-2">{t('god.rej.col.declarer')}</th>
          <th className="text-left py-1.5 px-2">{t('god.rej.col.opponent')}</th>
          <th className="text-center py-1.5 px-2">{t('god.rej.col.score')}</th>
          <th className="text-left py-1.5 px-2">{t('god.rej.col.reason')}</th>
          <th className="text-left py-1.5 px-2">{t('god.rej.col.message')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-zinc-800/40 hover:bg-zinc-900/40 transition-colors">
            <td className="py-1.5 px-2 text-zinc-500">{fmtDate(r.rejectedAt)}</td>
            <td className="py-1.5 px-2 text-zinc-300">{r.declarerLogin}</td>
            <td className="py-1.5 px-2 text-zinc-300">{r.opponentLogin}</td>
            <td className="py-1.5 px-2 text-center tabular-nums text-zinc-400">{r.scoreDeclarer}–{r.scoreOpponent}</td>
            <td className="py-1.5 px-2">
              <span className={`px-1 py-0.5 rounded text-xs ${r.contestReason === 'never_played' ? 'bg-red-400/15 text-red-400' : 'bg-orange-400/15 text-orange-400'}`}>
                {r.contestReason === 'never_played' ? t('god.rej.neverPlayed') : t('god.rej.wrongScore')}
              </span>
            </td>
            <td className="py-1.5 px-2 text-zinc-400 max-w-xs truncate" title={r.contestMessage}>{r.contestMessage || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Arbitrage des litiges OUVERTS : l'admin tranche (faux score / contestation
// abusive / sans suite) → le fautif prend le malus croissant (cf. backend).
function DisputeArbitration() {
  const [rows, setRows] = useState<RejectedMatch[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback((silent = false) => {
    if (!silent) setRows([]);
    api.adminDisputes('open').then(setRows).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  useServerEvents(() => load(true), PANEL_EVENTS);

  const resolve = async (id: string, verdict: 'declarer_wrong' | 'contester_wrong' | 'dismiss') => {
    setBusy(id);
    setMsg('');
    try {
      const res = await api.adminResolveDispute(id, verdict);
      setMsg(
        res.culprit && res.malus
          ? `Sanction appliquée à @${res.culprit} : -${res.malus.elo} Elo, -${res.malus.coins} coins (litige n°${res.malus.tier}).`
          : 'Litige classé sans suite.',
      );
      load(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) return null;
  return (
    <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3">
      <div className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400 mb-2">
        ⚖️ Litiges à arbitrer · {rows.length}
      </div>
      {msg && <div className="text-[11px] font-mono text-amber-300 mb-2">{msg}</div>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-md border border-zinc-800 bg-zinc-900/50 p-2.5 text-xs font-mono">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-300">
              <span className="text-zinc-500">{fmtDate(r.rejectedAt)}</span>
              <span className="text-zinc-100 font-bold">@{r.declarerLogin}</span>
              <span className="text-zinc-500">a déclaré</span>
              <span className="tabular-nums text-zinc-400">{r.scoreDeclarer}–{r.scoreOpponent}</span>
              <span className="text-zinc-500">vs</span>
              <span className="text-zinc-100 font-bold">@{r.opponentLogin}</span>
              <span className={`px-1 py-0.5 rounded ${r.contestReason === 'never_played' ? 'bg-red-400/15 text-red-400' : 'bg-orange-400/15 text-orange-400'}`}>
                {r.contestReason === 'never_played' ? 'jamais joué' : 'score incorrect'}
              </span>
              {r.game && <span className="text-zinc-600">[{r.game}]</span>}
            </div>
            {r.contestMessage && <div className="mt-1 text-zinc-400 italic">« {r.contestMessage} »</div>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void resolve(r.id, 'declarer_wrong')}
                className="px-2 py-1 rounded bg-red-500/15 hover:bg-red-500/30 text-red-300 border border-red-500/30 disabled:opacity-40"
              >
                Faux score · sanctionner @{r.declarerLogin}
              </button>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void resolve(r.id, 'contester_wrong')}
                className="px-2 py-1 rounded bg-orange-500/15 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 disabled:opacity-40"
              >
                Contestation abusive · sanctionner @{r.opponentLogin}
              </button>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void resolve(r.id, 'dismiss')}
                className="px-2 py-1 rounded bg-zinc-700/40 hover:bg-zinc-600/40 text-zinc-300 border border-zinc-600/40 disabled:opacity-40"
              >
                Sans suite
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RejetsTab() {
  const [rows, setRows] = useState<RejectedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const t = useT();

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.adminRejectedMatches()
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useServerEvents(() => load(true), PANEL_EVENTS);

  const filtered = rows.filter(
    (r) =>
      r.declarerLogin.includes(filter) ||
      r.opponentLogin.includes(filter) ||
      r.contestMessage.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="p-4">
      {/* File d'arbitrage des litiges ouverts (tranche → malus au fautif). */}
      <DisputeArbitration />
      <div className="mb-4 flex items-center gap-3">
        <Input value={filter} onChange={setFilter} placeholder={t('god.rej.filter')} className="w-72" />
        <span className="text-zinc-500 text-xs font-mono">{filtered.length} {t('god.rej.count')}</span>
      </div>
      {error && <div className="text-xs text-red-400 font-mono mb-3">{error}</div>}
      {loading ? (
        <div className="text-zinc-500 text-sm font-mono">{t('god.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="text-zinc-600 text-sm font-mono">{t('god.rej.empty')}</div>
      ) : (
        <div className="overflow-x-auto">
          <RejectionTable rows={filtered} perspective="all" />
        </div>
      )}
    </div>
  );
}

// ── Tab: MATCHES ───────────────────────────────────────────────────────────

type MatchesSortKey = 'date' | 'playerA' | 'score' | 'playerB' | 'deltaA' | 'deltaB' | 'elo';

function MatchesTab() {
  const [matches, setMatches] = useState<PlayedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [gameFilter, setGameFilter] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editPlayerA, setEditPlayerA] = useState('');
  const [editPlayerB, setEditPlayerB] = useState('');
  const [editA, setEditA] = useState('');
  const [editB, setEditB] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [sudo, setSudo] = useState(false);
  const { requestConfirm, confirmNode } = useConfirmDialog();
  const { selected, toggle, toggleAll, clear } = useSelection();
  const t = useT();

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.playedMatches()
      .then(setMatches)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useServerEvents(() => load(true), PANEL_EVENTS);

  const { sort, toggleSort } = useTableSort<MatchesSortKey>({ key: 'date', dir: 'desc' });
  const filtered = sortRows(
    matches.filter((m) =>
      (!gameFilter || (m.game ?? 'babyfoot') === gameFilter) &&
      (m.playerALogin.includes(filter) || m.playerBLogin.includes(filter))
    ),
    sort,
    (m, k) => {
      switch (k) {
        case 'date': return new Date(m.playedAt).getTime();
        case 'playerA': return m.playerALogin.toLowerCase();
        case 'score': return m.scoreA + m.scoreB;
        case 'playerB': return m.playerBLogin.toLowerCase();
        case 'deltaA': return m.deltaA;
        case 'deltaB': return m.deltaB;
        case 'elo': return m.countedForElo ? 1 : 0;
        default: return 0;
      }
    },
    (a, b) => b.id.localeCompare(a.id),
  ).slice(0, 200);

  function startEdit(m: PlayedMatch) {
    setEditId(m.id);
    setEditPlayerA(m.playerALogin);
    setEditPlayerB(m.playerBLogin);
    setEditA(String(m.scoreA));
    setEditB(String(m.scoreB));
  }

  async function saveEdit(id: string) {
    const playerALogin = editPlayerA.trim();
    const playerBLogin = editPlayerB.trim();
    if (!playerALogin || !playerBLogin) {
      setError(t('god.matches.bothRequired'));
      return;
    }
    if (playerALogin === playerBLogin) {
      setError(t('god.matches.bothDifferent'));
      return;
    }
    setPending(id);
    setError('');
    try {
      await api.adminEditMatch(id, {
        scoreA: Number(editA),
        scoreB: Number(editB),
        playerALogin,
        playerBLogin,
      });
      setEditId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('god.error'));
    } finally { setPending(null); }
  }

  async function confirmOrSudo(message: string) {
    return sudo ? true : requestConfirm(message, { danger: true, confirmLabel: t('god.delete') });
  }
  async function toggleSudo() {
    if (sudo) {
      setSudo(false);
      return;
    }
    const ok = await requestConfirm(
      t('god.sudo.confirmMatches'),
      { danger: true, confirmLabel: t('god.sudo.activate') },
    );
    if (ok) setSudo(true);
  }

  async function deleteMatch(id: string) {
    if (!(await confirmOrSudo(t('god.matches.confirmDelete')))) return;
    setPending(id);
    setError('');
    try {
      await api.adminDeleteMatch(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('god.error'));
    } finally { setPending(null); }
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!(await confirmOrSudo(t('god.matches.confirmBulk').replace('{n}', String(ids.length))))) return;
    setError('');
    for (const id of ids) await api.adminDeleteMatch(id).catch((e) => setError(String(e)));
    clear();
    load();
  }

  return (
    <div className="p-4">
      {confirmNode}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <Input value={filter} onChange={setFilter} placeholder={t('god.matches.filter')} className="w-64" />
        <span className="text-zinc-500 text-xs font-mono">{filtered.length} {t('god.matches.shown')} / {matches.length} {t('god.matches.total')}</span>
      </div>
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        {[
          { id: '', label: 'Tous' },
          { id: 'babyfoot', label: 'Baby', color: '#ffc94a' },
          { id: 'smash', label: 'Smash', color: '#ff3d50' },
          { id: 'chess', label: 'Échecs', color: '#56c46e' },
          { id: 'streetfighter', label: 'SF', color: '#ff7a18' },
          { id: 'flechettes', label: 'Fléch.', color: '#14b8a6' },
        ].map(({ id, label, color }) => (
          <button
            key={id}
            type="button"
            onClick={() => setGameFilter(id)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer border"
            style={{
              background: gameFilter === id ? `${color ?? 'rgba(255,255,255,0.5)'}22` : 'rgba(255,255,255,0.03)',
              borderColor: gameFilter === id ? (color ?? 'rgba(255,255,255,0.4)') : 'rgba(255,255,255,0.07)',
              color: gameFilter === id ? (color ?? 'rgba(255,255,255,0.9)') : 'rgba(255,255,255,0.35)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <SudoBar
        sudo={sudo}
        onToggle={toggleSudo}
        selectedCount={selected.size}
        onBulkDelete={bulkDelete}
        bulkLabel={t('god.matches.bulkDelete')}
      />
      {error && <div className="text-xs text-red-400 font-mono mb-3">{error}</div>}
      {loading ? (
        <div className="text-zinc-500 text-sm font-mono">{t('god.loading')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                <th className="py-2 px-2 w-8">
                  {filtered.length > 0 && (
                    <Check
                      checked={filtered.every((m) => selected.has(m.id))}
                      onChange={() => toggleAll(filtered.map((m) => m.id))}
                    />
                  )}
                </th>
                <SortableTh<MatchesSortKey> label={t('god.match.col.date')} k="date" sort={sort} onSort={toggleSort} align="left" defaultDir="desc" />
                <SortableTh<MatchesSortKey> label={t('god.match.col.playerA')} k="playerA" sort={sort} onSort={toggleSort} align="left" />
                <SortableTh<MatchesSortKey> label={t('god.match.col.score')} k="score" sort={sort} onSort={toggleSort} align="center" defaultDir="desc" />
                <SortableTh<MatchesSortKey> label={t('god.match.col.playerB')} k="playerB" sort={sort} onSort={toggleSort} align="left" />
                <SortableTh<MatchesSortKey> label="ΔA" k="deltaA" sort={sort} onSort={toggleSort} align="right" defaultDir="desc" />
                <SortableTh<MatchesSortKey> label="ΔB" k="deltaB" sort={sort} onSort={toggleSort} align="right" defaultDir="desc" />
                <SortableTh<MatchesSortKey> label="ELO" k="elo" sort={sort} onSort={toggleSort} align="center" defaultDir="desc" />
                <th className="text-right py-2 px-2">{t('god.match.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className={`border-b border-zinc-800/40 hover:bg-zinc-900/50 transition-colors ${selected.has(m.id) ? 'bg-red-500/5' : ''}`}>
                  <td className="py-1.5 px-2">
                    <Check checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                  </td>
                  <td className="py-1.5 px-2 text-zinc-500">{fmtDate(m.playedAt)}</td>
                  <td className={`py-1.5 px-2 ${m.winner === 'A' ? 'text-emerald-400' : 'text-zinc-300'}`}>
                    {editId === m.id ? <Input value={editPlayerA} onChange={setEditPlayerA} className="w-28" /> : m.playerALogin}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {editId === m.id ? (
                      <span className="flex items-center gap-1 justify-center">
                        <input
                          type="number"
                          value={editA}
                          onChange={(e) => setEditA(e.target.value)}
                          className="w-10 bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-center text-zinc-100 font-mono text-xs focus:outline-none"
                        />
                        <span className="text-zinc-500">–</span>
                        <input
                          type="number"
                          value={editB}
                          onChange={(e) => setEditB(e.target.value)}
                          className="w-10 bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-center text-zinc-100 font-mono text-xs focus:outline-none"
                        />
                      </span>
                    ) : (
                      <span className="tabular-nums text-zinc-100">{m.scoreA}–{m.scoreB}</span>
                    )}
                  </td>
                  <td className={`py-1.5 px-2 ${m.winner === 'B' ? 'text-emerald-400' : 'text-zinc-300'}`}>
                    {editId === m.id ? <Input value={editPlayerB} onChange={setEditPlayerB} className="w-28" /> : m.playerBLogin}
                  </td>
                  <td className={`py-1.5 px-2 text-right tabular-nums ${m.deltaA >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{m.deltaA > 0 ? '+' : ''}{m.deltaA}</td>
                  <td className={`py-1.5 px-2 text-right tabular-nums ${m.deltaB >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{m.deltaB > 0 ? '+' : ''}{m.deltaB}</td>
                  <td className="py-1.5 px-2 text-center">{m.countedForElo ? <span className="text-emerald-400">✓</span> : <span className="text-zinc-600">—</span>}</td>
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1.5 justify-end">
                      {editId === m.id ? (
                        <>
                          <Btn onClick={() => saveEdit(m.id)} disabled={pending === m.id} variant="success">{t('god.matches.save')}</Btn>
                          <Btn onClick={() => setEditId(null)} variant="ghost">✕</Btn>
                        </>
                      ) : (
                        <>
                          <Btn onClick={() => startEdit(m)} variant="ghost">✏️</Btn>
                          <Btn onClick={() => deleteMatch(m.id)} disabled={pending === m.id} variant="danger">🗑️</Btn>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: IDÉES ─────────────────────────────────────────────────────────────

function IdeasTab() {
  const [ideas, setIdeas] = useState<FeatureRequestWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const t = useT();

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.featureRequests()
      .then(setIdeas)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useServerEvents(() => load(true), PANEL_EVENTS);

  const filtered = filter === 'all' ? ideas : ideas.filter((i) => i.status === filter);

  async function setStatus(id: string, status: 'pending' | 'accepted' | 'rejected') {
    setPending(id);
    setError('');
    try {
      await api.setFeatureRequestStatus(id, status);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('god.error'));
    } finally { setPending(null); }
  }

  const counts = {
    pending: ideas.filter((i) => i.status === 'pending').length,
    accepted: ideas.filter((i) => i.status === 'accepted').length,
    rejected: ideas.filter((i) => i.status === 'rejected').length,
  };

  return (
    <div className="p-4">
      {/* Summary bar */}
      <div className="mb-4 flex items-center gap-4">
        {(['all', 'pending', 'accepted', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs font-mono px-3 py-1.5 rounded transition-colors cursor-pointer ${filter === f ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {f === 'all' ? `${t('god.ideas.all')} (${ideas.length})` : f === 'pending' ? `${t('god.ideas.pending')} (${counts.pending})` : f === 'accepted' ? `${t('god.ideas.accepted')} (${counts.accepted})` : `${t('god.ideas.rejected')} (${counts.rejected})`}
          </button>
        ))}
      </div>
      {error && <div className="text-xs text-red-400 font-mono mb-3">{error}</div>}
      {loading ? (
        <div className="text-zinc-500 text-sm font-mono">{t('god.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="text-zinc-600 text-sm font-mono">{t('god.ideas.empty')}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((idea) => (
            <div key={idea.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-zinc-400">{idea.author.login}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-xs font-mono text-zinc-500">{fmtDate(idea.createdAt)}</span>
                    <FRStatusBadge status={idea.status} />
                  </div>
                  <p className="text-sm text-zinc-200 leading-relaxed">{idea.text}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {idea.status !== 'accepted' && (
                    <Btn onClick={() => setStatus(idea.id, 'accepted')} disabled={pending === idea.id} variant="success">{t('god.ideas.accept')}</Btn>
                  )}
                  {idea.status !== 'rejected' && (
                    <Btn onClick={() => setStatus(idea.id, 'rejected')} disabled={pending === idea.id} variant="danger">{t('god.ideas.reject')}</Btn>
                  )}
                  {idea.status !== 'pending' && (
                    <Btn onClick={() => setStatus(idea.id, 'pending')} disabled={pending === idea.id} variant="ghost">{t('god.ideas.setPending')}</Btn>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: BUGS ──────────────────────────────────────────────────────────────

function BugsTab() {
  const [bugs, setBugs] = useState<BugReportWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved' | 'closed'>('all');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const t = useT();

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.bugReports()
      .then(setBugs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useServerEvents(() => load(true), PANEL_EVENTS);

  const filtered = filter === 'all' ? bugs : bugs.filter((b) => b.status === filter);

  async function setStatus(id: string, status: 'open' | 'resolved' | 'closed') {
    setPending(id);
    setError('');
    try {
      await api.setBugReportStatus(id, status);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('god.error'));
    } finally { setPending(null); }
  }

  const counts = {
    open: bugs.filter((b) => b.status === 'open').length,
    resolved: bugs.filter((b) => b.status === 'resolved').length,
    closed: bugs.filter((b) => b.status === 'closed').length,
  };

  return (
    <div className="p-4">
      {/* Summary bar */}
      <div className="mb-4 flex items-center gap-4">
        {(['all', 'open', 'resolved', 'closed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs font-mono px-3 py-1.5 rounded transition-colors cursor-pointer ${filter === f ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {f === 'all' ? `${t('god.bugs.all')} (${bugs.length})` : f === 'open' ? `${t('god.bugs.open')} (${counts.open})` : f === 'resolved' ? `${t('god.bugs.resolved')} (${counts.resolved})` : `${t('god.bugs.closed')} (${counts.closed})`}
          </button>
        ))}
      </div>
      {error && <div className="text-xs text-red-400 font-mono mb-3">{error}</div>}
      {loading ? (
        <div className="text-zinc-500 text-sm font-mono">{t('god.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="text-zinc-600 text-sm font-mono">{t('god.bugs.empty')}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((bug) => (
            <div key={bug.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-zinc-400">{bug.author.login}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-xs font-mono text-zinc-500">{fmtDate(bug.createdAt)}</span>
                    <BugStatusBadge status={bug.status} />
                  </div>
                  <p className="text-sm text-zinc-200 leading-relaxed">{bug.text}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {bug.status !== 'resolved' && (
                    <Btn onClick={() => setStatus(bug.id, 'resolved')} disabled={pending === bug.id} variant="success">{t('god.bugs.markResolved')}</Btn>
                  )}
                  {bug.status !== 'closed' && (
                    <Btn onClick={() => setStatus(bug.id, 'closed')} disabled={pending === bug.id} variant="ghost">{t('god.bugs.markClosed')}</Btn>
                  )}
                  {bug.status !== 'open' && (
                    <Btn onClick={() => setStatus(bug.id, 'open')} disabled={pending === bug.id} variant="warn">{t('god.bugs.reopen')}</Btn>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: ALERTES ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: SuspiciousFlag['severity'] }) {
  const t = useT();
  if (severity === 'high')
    return <span className="px-1.5 py-0.5 text-xs bg-red-400/15 text-red-400 rounded font-mono">{t('god.alert.high')}</span>;
  if (severity === 'medium')
    return <span className="px-1.5 py-0.5 text-xs bg-orange-400/15 text-orange-400 rounded font-mono">{t('god.alert.medium')}</span>;
  return <span className="px-1.5 py-0.5 text-xs bg-yellow-400/15 text-yellow-400 rounded font-mono">{t('god.alert.low')}</span>;
}

const FLAG_TYPE_ICON: Record<SuspiciousFlag['type'], string> = {
  pair_domination: '⚖️',
  recent_farming: '🔄',
  elo_spike: '📈',
  victim_pattern: '🎯',
};

function AlertesTab() {
  const [flags, setFlags] = useState<SuspiciousFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState<SuspiciousFlag['type'] | 'all'>('all');
  const [inspectLogin, setInspectLogin] = useState<string | null>(null);
  const t = useT();

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.adminSuspicious()
      .then(setFlags)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useServerEvents(() => load(true), PANEL_EVENTS);

  const filtered = filterType === 'all' ? flags : flags.filter((f) => f.type === filterType);

  const counts = {
    high: flags.filter((f) => f.severity === 'high').length,
    medium: flags.filter((f) => f.severity === 'medium').length,
    low: flags.filter((f) => f.severity === 'low').length,
  };

  return (
    <div className="p-4">
      {/* Summary */}
      <div className="mb-5 grid grid-cols-3 gap-3 max-w-md">
        {[
          { label: t('god.alert.high'), count: counts.high, color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20' },
          { label: t('god.alert.medium'), count: counts.medium, color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20' },
          { label: t('god.alert.low'), count: counts.low, color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20' },
        ].map(({ label, count, color, bg }) => (
          <div key={label} className={`border rounded-lg p-3 text-center ${bg}`}>
            <div className={`text-2xl font-bold font-mono tabular-nums ${color}`}>{count}</div>
            <div className="text-xs text-zinc-500 uppercase mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Type filter */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['all', 'pair_domination', 'recent_farming', 'elo_spike', 'victim_pattern'] as const).map((ft) => (
          <button
            key={ft}
            onClick={() => setFilterType(ft)}
            className={`text-xs font-mono px-3 py-1.5 rounded transition-colors cursor-pointer ${filterType === ft ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {ft === 'all' ? `${t('god.alert.all')} (${flags.length})` : `${FLAG_TYPE_ICON[ft]} ${t(`god.alert.type.${ft}`)}`}
          </button>
        ))}
      </div>

      {error && <div className="text-xs text-red-400 font-mono mb-3">{error}</div>}

      {loading ? (
        <div className="text-zinc-500 text-sm font-mono">{t('god.alert.analyzing')}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
          <div className="text-zinc-500 font-mono text-sm">{t('god.alert.noneTitle')}</div>
          <div className="text-zinc-600 font-mono text-xs mt-1">{t('god.alert.noneSub')}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((flag, i) => (
            <div
              key={i}
              className={`bg-zinc-900 border rounded-lg p-4 transition-colors ${
                flag.severity === 'high'
                  ? 'border-red-400/30 hover:border-red-400/50'
                  : flag.severity === 'medium'
                  ? 'border-orange-400/20 hover:border-orange-400/40'
                  : 'border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-base">{FLAG_TYPE_ICON[flag.type]}</span>
                    <span className="text-xs font-mono text-zinc-300 font-medium">{t(`god.alert.type.${flag.type}`)}</span>
                    <SeverityBadge severity={flag.severity} />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {flag.players.map((p) => (
                        <button
                          key={p}
                          onClick={() => setInspectLogin(p === inspectLogin ? null : p)}
                          className={`px-2 py-0.5 rounded text-xs font-mono transition-colors cursor-pointer ${
                            inspectLogin === p
                              ? 'bg-blue-500/30 text-blue-300 border border-blue-400/40'
                              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">{flag.detail}</p>
                  {(flag.matchCount !== undefined || flag.winRate !== undefined || flag.eloGain !== undefined) && (
                    <div className="mt-2 flex items-center gap-4 text-xs font-mono text-zinc-500">
                      {flag.matchCount !== undefined && <span>{t('god.alert.matches')} <span className="text-zinc-300">{flag.matchCount}</span></span>}
                      {flag.winRate !== undefined && <span>{t('god.alert.winRate')} <span className="text-zinc-300">{Math.round(flag.winRate * 100)}%</span></span>}
                      {flag.eloGain !== undefined && <span>{t('god.alert.eloGain')} <span className="text-emerald-400">+{flag.eloGain}</span></span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Inline moderation panel */}
              {inspectLogin && flag.players.includes(inspectLogin) && (
                <InlineModeration login={inspectLogin} onClose={() => setInspectLogin(null)} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineModeration({ login, onClose }: { login: string; onClose: () => void }) {
  const [stats, setStats] = useState<import('../lib/api').ModerationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const t = useT();

  useEffect(() => {
    setLoading(true);
    api.adminModerationStats(login)
      .then(setStats)
      .finally(() => setLoading(false));
  }, [login]);

  return (
    <div className="mt-4 border-t border-zinc-800 pt-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-zinc-400">{t('god.alert.quickView')} <span className="text-zinc-200">{login}</span></span>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 text-xs font-mono cursor-pointer">{t('god.alert.close')}</button>
      </div>
      {loading ? (
        <div className="text-zinc-600 text-xs font-mono">{t('god.loading')}</div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-4 text-xs font-mono">
          <div>
            <div className="text-zinc-500 uppercase tracking-wider mb-1.5">{t('god.alert.stats')}</div>
            <div className="space-y-1 text-zinc-300">
              <div>{t('god.alert.elo')} <span className="text-zinc-100 font-bold">{stats.user.elo}</span></div>
              <div>{t('god.alert.matchesLabel')} {stats.user.matchesPlayed}</div>
              <div>{t('god.alert.winRateLabel')} <span className="text-zinc-100">{stats.recentMatches.length > 0 ? Math.round(stats.recentMatches.filter(m => (m.playerALogin === login && m.winner === 'A') || (m.playerBLogin === login && m.winner === 'B')).length / stats.recentMatches.length * 100) : 0}%</span></div>
              <div>{t('god.alert.rejEmitted')} <span className="text-orange-400">{stats.rejectionsEmitted.length}</span></div>
              <div>{t('god.alert.rejReceived')} <span className="text-red-400">{stats.rejectionsReceived.length}</span></div>
            </div>
          </div>
          <div>
            <div className="text-zinc-500 uppercase tracking-wider mb-1.5">{t('god.alert.topOpponents')}</div>
            <div className="space-y-1">
              {stats.topOpponents.slice(0, 5).map(({ login: opp, count }) => (
                <div key={opp} className="flex items-center justify-between">
                  <span className="text-zinc-300">{opp}</span>
                  <span className="text-zinc-500">{count}x</span>
                </div>
              ))}
              {stats.topOpponents.length === 0 && <div className="text-zinc-600">{t('god.alert.none')}</div>}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-zinc-600 text-xs font-mono">{t('god.alert.loadError')}</div>
      )}
    </div>
  );
}

// ── Tab: AUDIT ─────────────────────────────────────────────────────────────

const AUDIT_ACTIONS: AdminAuditAction[] = [
  'SET_ROLE', 'BAN_USER', 'UNBAN_USER', 'EDIT_STATS', 'EDIT_TITLE', 'DELETE_MATCH', 'EDIT_MATCH', 'REFRESH_IMAGES', 'RESET_DATABASE',
  'DELETE_CHALLENGE', 'DELETE_PENDING_MATCH', 'DELETE_REJECTED_MATCH', 'DELETE_OPS', 'IMPERSONATE_TESTER', 'SYNC_ELO_FROM_PROD',
];

const ACTION_COLOR: Record<AdminAuditAction, string> = {
  SET_ROLE: 'text-amber-400',
  BAN_USER: 'text-red-400',
  UNBAN_USER: 'text-emerald-400',
  EDIT_STATS: 'text-blue-400',
  EDIT_TITLE: 'text-purple-400',
  DELETE_MATCH: 'text-red-400',
  EDIT_MATCH: 'text-blue-400',
  REFRESH_IMAGES: 'text-zinc-400',
  RESET_DATABASE: 'text-red-500',
  DELETE_CHALLENGE: 'text-red-400',
  DELETE_PENDING_MATCH: 'text-red-400',
  DELETE_REJECTED_MATCH: 'text-red-400',
  DELETE_OPS: 'text-red-400',
  DELETE_TOURNAMENT: 'text-red-400',
  IMPERSONATE_TESTER: 'text-teal-400',
  SYNC_ELO_FROM_PROD: 'text-teal-400',
};

type AuditSortKey = 'date' | 'actor' | 'role' | 'action' | 'target' | 'ip';

function AuditTab() {
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [targetFilter, setTargetFilter] = useState('');
  const [actionFilter, setActionFilter] = useState<AdminAuditAction | 'all'>('all');
  const t = useT();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const list = await api.adminAuditLog({
        actor: actorFilter || undefined,
        target: targetFilter || undefined,
        action: actionFilter === 'all' ? undefined : actionFilter,
        limit: 200,
      });
      setEntries(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('god.error'));
    } finally {
      setLoading(false);
    }
  }, [actorFilter, targetFilter, actionFilter, t]);

  useEffect(() => { load(); }, [load]);
  useServerEvents(() => load(true), PANEL_EVENTS);

  const { sort, toggleSort } = useTableSort<AuditSortKey>({ key: 'date', dir: 'desc' });
  const sorted = sortRows(
    entries,
    sort,
    (e, k) => {
      switch (k) {
        case 'date': return new Date(e.createdAt).getTime();
        case 'actor': return e.actorLogin.toLowerCase();
        case 'role': return ROLE_WEIGHT[e.actorRole] ?? 0;
        case 'action': return e.action;
        case 'target': return (e.targetLogin ?? '').toLowerCase();
        case 'ip': return e.ipAddress ?? '';
        default: return 0;
      }
    },
  );

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input value={actorFilter} onChange={setActorFilter} placeholder={t('god.audit.actorFilter')} className="w-44" />
        <Input value={targetFilter} onChange={setTargetFilter} placeholder={t('god.audit.targetFilter')} className="w-44" />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as AdminAuditAction | 'all')}
          className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-mono px-2 py-1.5 rounded cursor-pointer"
        >
          <option value="all">{t('god.audit.allActions')}</option>
          {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-zinc-500 text-xs font-mono ml-auto">{entries.length} {t('god.audit.entries')}</span>
      </div>
      {error && <div className="mb-3 text-xs text-red-400 font-mono">{error}</div>}
      {loading ? (
        <div className="text-zinc-500 text-xs font-mono">{t('god.loading')}</div>
      ) : entries.length === 0 ? (
        <div className="text-zinc-500 text-xs font-mono">{t('god.audit.empty')}</div>
      ) : (
        <table className="w-full text-xs font-mono border-collapse">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
              <SortableTh<AuditSortKey> label={t('god.audit.col.date')} k="date" sort={sort} onSort={toggleSort} align="left" defaultDir="desc" className="py-1.5 px-2" />
              <SortableTh<AuditSortKey> label={t('god.audit.col.actor')} k="actor" sort={sort} onSort={toggleSort} align="left" className="py-1.5 px-2" />
              <SortableTh<AuditSortKey> label={t('god.audit.col.role')} k="role" sort={sort} onSort={toggleSort} align="left" defaultDir="desc" className="py-1.5 px-2" />
              <SortableTh<AuditSortKey> label={t('god.audit.col.action')} k="action" sort={sort} onSort={toggleSort} align="left" className="py-1.5 px-2" />
              <SortableTh<AuditSortKey> label={t('god.audit.col.target')} k="target" sort={sort} onSort={toggleSort} align="left" className="py-1.5 px-2" />
              <th className="text-left py-1.5 px-2">{t('god.audit.col.details')}</th>
              <SortableTh<AuditSortKey> label={t('god.audit.col.ip')} k="ip" sort={sort} onSort={toggleSort} align="left" className="py-1.5 px-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => (
              <tr key={e.id} className="border-b border-zinc-900 hover:bg-zinc-900/30">
                <td className="py-2 px-2 text-zinc-400 whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleString('fr-FR')}
                </td>
                <td className="py-2 px-2 text-zinc-200 font-medium">{e.actorLogin}</td>
                <td className="py-2 px-2"><RoleBadge role={e.actorRole} /></td>
                <td className={`py-2 px-2 font-bold ${ACTION_COLOR[e.action] ?? 'text-zinc-300'}`}>{e.action}</td>
                <td className="py-2 px-2 text-zinc-300">{e.targetLogin ?? '—'}</td>
                <td className="py-2 px-2 text-zinc-500 max-w-[400px]">
                  {e.payload ? (
                    <code className="text-[10px] text-zinc-400 break-all">
                      {JSON.stringify(e.payload).slice(0, 200)}
                    </code>
                  ) : '—'}
                </td>
                <td className="py-2 px-2 text-zinc-600 text-[10px]">{e.ipAddress ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Tab: ALL HISTORY ──────────────────────────────────────────────────────

const EVENT_TYPE_COLOR: Record<AllHistoryEventType, string> = {
  challenge: 'text-blue-400 bg-blue-400/10',
  pending_match: 'text-yellow-400 bg-yellow-400/10',
  played_match: 'text-emerald-400 bg-emerald-400/10',
  rejected_match: 'text-red-400 bg-red-400/10',
  ops: 'text-orange-400 bg-orange-400/10',
};

const EVENT_TYPE_ICON: Record<AllHistoryEventType, string> = {
  challenge: '⚔️',
  pending_match: '⏳',
  played_match: '✅',
  rejected_match: '✗',
  ops: '🎯',
};

const CHALLENGE_STATUS_COLOR: Record<string, string> = {
  pending: 'text-yellow-400',
  accepted: 'text-emerald-400',
  declined: 'text-red-400',
  recorded: 'text-blue-400',
  cancelled: 'text-zinc-500',
};

function EventDetail({ ev }: { ev: AllHistoryEvent }) {
  const t = useT();
  if (ev.type === 'challenge') {
    return (
      <span className="flex items-center gap-2 flex-wrap">
        <span className={`font-mono text-xs ${CHALLENGE_STATUS_COLOR[ev.status ?? ''] ?? 'text-zinc-400'}`}>
          {ev.status ? t(`god.chStatus.${ev.status}`) : ev.status}
        </span>
        {ev.scheduledAt && (
          <span className="text-zinc-600 text-xs">
            {t('god.event.scheduled')} {new Date(ev.scheduledAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
          </span>
        )}
      </span>
    );
  }
  if (ev.type === 'pending_match') {
    return (
      <span className="text-zinc-400 text-xs tabular-nums">
        {t('god.event.declaredScore')} {ev.scoreA}–{ev.scoreB}
      </span>
    );
  }
  if (ev.type === 'played_match') {
    return (
      <span className="flex items-center gap-2">
        <span className="tabular-nums text-zinc-100 font-mono text-xs">{ev.scoreA}–{ev.scoreB}</span>
        {ev.winner && (
          <span className="text-emerald-400 text-xs">
            → {ev.winner === 'A' ? ev.playerA : ev.playerB} {t('god.event.wins')}
          </span>
        )}
        {typeof ev.deltaA === 'number' && (
          <span className="text-zinc-500 text-xs tabular-nums">
            ({ev.deltaA > 0 ? '+' : ''}{ev.deltaA} / {ev.deltaB! > 0 ? '+' : ''}{ev.deltaB})
          </span>
        )}
        {!ev.countedForElo && <span className="text-zinc-600 text-xs">{t('god.event.offElo')}</span>}
      </span>
    );
  }
  if (ev.type === 'rejected_match') {
    return (
      <span className="flex items-center gap-2 flex-wrap">
        <span className="text-xs tabular-nums text-zinc-400">{ev.scoreA}–{ev.scoreB}</span>
        <span className={`text-xs px-1 py-0.5 rounded ${ev.contestReason === 'never_played' ? 'bg-red-400/15 text-red-400' : 'bg-orange-400/15 text-orange-400'}`}>
          {ev.contestReason === 'never_played' ? t('god.event.neverPlayed') : t('god.event.wrongScore')}
        </span>
        {ev.contestMessage && <span className="text-zinc-500 text-xs truncate max-w-xs" title={ev.contestMessage}>{ev.contestMessage}</span>}
      </span>
    );
  }
  if (ev.type === 'ops') {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="text-zinc-400">{t('god.event.forcedMatches').replace('{n}', String(ev.forcedUsed))}</span>
        {ev.expiresAt && (
          <span className="text-zinc-600">{t('god.event.expires')} {new Date(ev.expiresAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
        )}
      </span>
    );
  }
  return null;
}

// Modération inline rapide (ban/unban) depuis l'historique
function QuickBanButton({ login, onDone }: { login: string; onDone: () => void }) {
  const [userData, setUserData] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const t = useT();

  useEffect(() => {
    api.adminUsers().then((list) => {
      setUserData(list.find((u) => u.login === login) ?? null);
    }).finally(() => setLoading(false));
  }, [login]);

  if (loading) return <span className="text-zinc-600 text-xs font-mono">…</span>;
  if (!userData) return null;

  async function toggle() {
    if (!userData) return;
    setPending(true);
    try {
      if (userData.bannedAt) await api.adminUnbanUser(userData.login);
      else await api.adminBanUser(userData.login);
      onDone();
    } finally { setPending(false); }
  }

  return (
    <Btn onClick={toggle} disabled={pending} variant={userData.bannedAt ? 'success' : 'danger'}>
      {userData.bannedAt ? t('god.users.unban') : t('god.users.ban')}
    </Btn>
  );
}

// Ligne expandée avec actions complètes
function HistoryRowActions({
  ev,
  onDelete,
  onEditSaved,
}: {
  ev: AllHistoryEvent;
  onDelete: () => void;
  onEditSaved: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [editA, setEditA] = useState(String(ev.scoreA ?? ''));
  const [editB, setEditB] = useState(String(ev.scoreB ?? ''));
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState('');
  const [showModo, setShowModo] = useState(false);
  const t = useT();

  async function handleDelete() {
    const label = t(`god.event.${ev.type}`);
    if (!confirm(t('god.hist.confirmDelete').replace('{label}', label))) return;
    setPending(true);
    setErr('');
    try {
      if (ev.type === 'played_match') await api.adminDeleteMatch(ev.id);
      else if (ev.type === 'pending_match') await api.adminDeletePendingMatch(ev.id);
      else if (ev.type === 'rejected_match') await api.adminDeleteRejectedMatch(ev.id);
      else if (ev.type === 'challenge') await api.adminDeleteChallenge(ev.id);
      else if (ev.type === 'ops') await api.adminDeleteOps(ev.id);
      onDelete();
    } catch (e) { setErr(e instanceof Error ? e.message : t('god.error')); }
    finally { setPending(false); }
  }

  async function handleEdit() {
    setPending(true);
    setErr('');
    try {
      await api.adminEditMatch(ev.id, {
        scoreA: Number(editA),
        scoreB: Number(editB),
        playerALogin: ev.playerA,
        playerBLogin: ev.playerB,
      });
      setEditMode(false);
      onEditSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : t('god.error')); }
    finally { setPending(false); }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {err && <span className="text-red-400 text-xs">{err}</span>}

      {/* Edit score — uniquement pour played_match */}
      {ev.type === 'played_match' && (
        editMode ? (
          <>
            <input
              type="number"
              value={editA}
              onChange={(e) => setEditA(e.target.value)}
              className="w-10 bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-center text-zinc-100 font-mono text-xs focus:outline-none"
            />
            <span className="text-zinc-500 text-xs">–</span>
            <input
              type="number"
              value={editB}
              onChange={(e) => setEditB(e.target.value)}
              className="w-10 bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-center text-zinc-100 font-mono text-xs focus:outline-none"
            />
            <Btn onClick={handleEdit} disabled={pending} variant="success">✓</Btn>
            <Btn onClick={() => setEditMode(false)} variant="ghost">✕</Btn>
          </>
        ) : (
          <Btn onClick={() => { setEditMode(true); setEditA(String(ev.scoreA ?? 0)); setEditB(String(ev.scoreB ?? 0)); }} variant="ghost">✏️</Btn>
        )
      )}

      {/* Modération joueurs */}
      <Btn onClick={() => setShowModo((v) => !v)} variant="ghost" className={showModo ? 'text-blue-400' : ''}>
        👤
      </Btn>

      {/* Supprimer */}
      {!editMode && (
        <Btn onClick={handleDelete} disabled={pending} variant="danger">🗑️</Btn>
      )}

      {/* Panel modo inline */}
      {showModo && (
        <div className="w-full mt-2 pt-2 border-t border-zinc-800 flex flex-wrap gap-3 items-center">
          <span className="text-zinc-500 text-xs font-mono">{t('god.hist.moderation')}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-300 text-xs font-mono">{ev.playerA}</span>
            <QuickBanButton login={ev.playerA} onDone={() => setShowModo(false)} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-300 text-xs font-mono">{ev.playerB}</span>
            <QuickBanButton login={ev.playerB} onDone={() => setShowModo(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

type AllHistorySortKey = 'date' | 'type' | 'playerA' | 'playerB';

function AllHistoryTab() {
  const [events, setEvents] = useState<AllHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loginFilter, setLoginFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<AllHistoryEventType | 'all'>('all');
  const [gameFilter, setGameFilter] = useState<'all' | 'babyfoot' | 'smash' | 'chess' | 'streetfighter' | 'flechettes'>('all');
  const [sudo, setSudo] = useState(false);
  const { requestConfirm, confirmNode } = useConfirmDialog();
  const { selected, toggle, toggleAll, clear } = useSelection();
  const t = useT();

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.adminAllHistory({
      login: loginFilter.trim() || undefined,
      type: typeFilter === 'all' ? undefined : typeFilter,
      game: gameFilter === 'all' ? undefined : gameFilter,
      limit: 500,
    })
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : t('god.error')))
      .finally(() => setLoading(false));
  }, [loginFilter, typeFilter, gameFilter, t]);

  useEffect(() => { load(); }, [load]);

  const typeOrder: AllHistoryEventType[] = ['challenge', 'pending_match', 'played_match', 'rejected_match', 'ops'];

  const { sort, toggleSort } = useTableSort<AllHistorySortKey>({ key: 'date', dir: 'desc' });
  const sorted = sortRows(
    events,
    sort,
    (ev, k) => {
      switch (k) {
        case 'date': return new Date(ev.at).getTime();
        case 'type': return typeOrder.indexOf(ev.type);
        case 'playerA': return (ev.playerA ?? '').toLowerCase();
        case 'playerB': return (ev.playerB ?? '').toLowerCase();
        default: return 0;
      }
    },
  );

  function removeEvent(id: string, type: AllHistoryEventType) {
    setEvents((prev) => prev.filter((e) => !(e.id === id && e.type === type)));
  }

  const keyOf = (ev: AllHistoryEvent) => `${ev.type}-${ev.id}`;
  function deleteEvent(ev: AllHistoryEvent): Promise<unknown> {
    switch (ev.type) {
      case 'played_match': return api.adminDeleteMatch(ev.id);
      case 'pending_match': return api.adminDeletePendingMatch(ev.id);
      case 'rejected_match': return api.adminDeleteRejectedMatch(ev.id);
      case 'challenge': return api.adminDeleteChallenge(ev.id);
      case 'ops': return api.adminDeleteOps(ev.id);
    }
  }
  async function toggleSudo() {
    if (sudo) { setSudo(false); return; }
    const ok = await requestConfirm(
      t('god.sudo.confirmHistory'),
      { danger: true, confirmLabel: t('god.sudo.activate') },
    );
    if (ok) setSudo(true);
  }
  async function bulkDelete() {
    const picked = events.filter((e) => selected.has(keyOf(e)));
    if (picked.length === 0) return;
    if (!sudo) {
      const ok = await requestConfirm(t('god.hist.confirmBulk').replace('{n}', String(picked.length)), {
        danger: true,
        confirmLabel: t('god.delete'),
      });
      if (!ok) return;
    }
    for (const ev of picked) {
      await deleteEvent(ev).catch(() => {});
      removeEvent(ev.id, ev.type);
    }
    clear();
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input value={loginFilter} onChange={setLoginFilter} placeholder={t('god.hist.filter')} className="w-56" />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as AllHistoryEventType | 'all')}
          className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-mono px-2 py-1.5 rounded cursor-pointer"
        >
          <option value="all">{t('god.hist.allTypes')}</option>
          {typeOrder.map((ty) => (
            <option key={ty} value={ty}>{EVENT_TYPE_ICON[ty]} {t(`god.event.${ty}`)}</option>
          ))}
        </select>
        <div className="flex gap-1 flex-wrap">
          {([
            { id: 'all', label: null },
            { id: 'babyfoot', label: null },
            { id: 'smash', label: null },
            { id: 'chess', label: null },
            { id: 'streetfighter', label: 'SF' },
            { id: 'flechettes', label: 'Fléch.' },
          ] as { id: 'all' | 'babyfoot' | 'smash' | 'chess' | 'streetfighter' | 'flechettes'; label: string | null }[]).map(({ id: g, label }) => (
            <button
              key={g}
              type="button"
              onClick={() => setGameFilter(g)}
              className={`px-2.5 py-1.5 rounded font-mono text-xs border transition-colors ${
                gameFilter === g
                  ? 'bg-zinc-100/10 border-zinc-400 text-zinc-100'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {g === 'all' ? t('god.hist.allGames') : (label ?? t(`god.tourn.game.${g}`))}
            </button>
          ))}
        </div>
        <Btn onClick={load} variant="default">{t('god.refreshAction')}</Btn>
        <span className="text-zinc-500 text-xs font-mono ml-auto">{events.length} {t('god.hist.events')}</span>
      </div>

      {/* Type pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {typeOrder.map((ty) => {
          const count = events.filter((e) => e.type === ty).length;
          return (
            <button
              key={ty}
              onClick={() => setTypeFilter(typeFilter === ty ? 'all' : ty)}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer border ${
                typeFilter === ty
                  ? EVENT_TYPE_COLOR[ty] + ' border-current/40'
                  : 'text-zinc-500 border-zinc-800 hover:text-zinc-300'
              }`}
            >
              {EVENT_TYPE_ICON[ty]} {t(`god.event.${ty}`)} <span className="opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {confirmNode}
      <SudoBar
        sudo={sudo}
        onToggle={toggleSudo}
        selectedCount={selected.size}
        onBulkDelete={bulkDelete}
        bulkLabel={t('god.hist.bulkDelete')}
      />

      {error && <div className="text-xs text-red-400 font-mono mb-3">{error}</div>}

      {loading ? (
        <div className="text-zinc-500 text-sm font-mono">{t('god.loading')}</div>
      ) : events.length === 0 ? (
        <div className="text-zinc-600 text-sm font-mono">{t('god.hist.empty')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                <th className="py-1.5 px-2 w-8">
                  {events.length > 0 && (
                    <Check
                      checked={events.every((e) => selected.has(keyOf(e)))}
                      onChange={() => toggleAll(events.map(keyOf))}
                    />
                  )}
                </th>
                <SortableTh<AllHistorySortKey> label={t('god.match.col.date')} k="date" sort={sort} onSort={toggleSort} align="left" defaultDir="desc" className="py-1.5 px-2" />
                <SortableTh<AllHistorySortKey> label={t('god.hist.col.type')} k="type" sort={sort} onSort={toggleSort} align="left" className="py-1.5 px-2" />
                <SortableTh<AllHistorySortKey> label={t('god.match.col.playerA')} k="playerA" sort={sort} onSort={toggleSort} align="left" className="py-1.5 px-2" />
                <SortableTh<AllHistorySortKey> label={t('god.match.col.playerB')} k="playerB" sort={sort} onSort={toggleSort} align="left" className="py-1.5 px-2" />
                <th className="text-left py-1.5 px-2">{t('god.hist.col.detail')}</th>
                <th className="text-right py-1.5 px-2">{t('god.match.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((ev) => (
                <tr key={`${ev.type}-${ev.id}`} className={`border-b border-zinc-800/40 hover:bg-zinc-900/30 transition-colors ${selected.has(keyOf(ev)) ? 'bg-red-500/5' : ''}`}>
                  <td className="py-2 px-2 align-top">
                    <Check checked={selected.has(keyOf(ev))} onChange={() => toggle(keyOf(ev))} />
                  </td>
                  <td className="py-2 px-2 text-zinc-500 whitespace-nowrap align-top">{fmtDate(ev.at)}</td>
                  <td className="py-2 px-2 align-top">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${EVENT_TYPE_COLOR[ev.type]}`}>
                      {EVENT_TYPE_ICON[ev.type]} {t(`god.event.${ev.type}`)}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-zinc-200 align-top">{ev.playerA}</td>
                  <td className="py-2 px-2 text-zinc-400 align-top">{ev.playerB}</td>
                  <td className="py-2 px-2 align-top"><EventDetail ev={ev} /></td>
                  <td className="py-2 px-2 align-top">
                    <HistoryRowActions
                      ev={ev}
                      onDelete={() => removeEvent(ev.id, ev.type)}
                      onEditSaved={load}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: EN ATTENTE (SUPERADMIN) ───────────────────────────────────────────

function PendingTab() {
  const [rows, setRows] = useState<PendingMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [fA, setFA] = useState('');
  const [fB, setFB] = useState('');
  const [fScoreA, setFScoreA] = useState('10');
  const [fScoreB, setFScoreB] = useState('0');
  const [forcing, setForcing] = useState(false);
  const [forceMsg, setForceMsg] = useState('');
  const t = useT();

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.pendingMatches()
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useServerEvents(() => load(true), PANEL_EVENTS);

  async function act(id: string, fn: () => Promise<unknown>) {
    setPending(id);
    setError('');
    try { await fn(); load(); }
    catch (e) { setError(e instanceof Error ? e.message : t('god.error')); }
    finally { setPending(null); }
  }

  async function forceResult() {
    const a = fA.trim();
    const b = fB.trim();
    if (!a || !b) return;
    setForcing(true);
    setForceMsg('');
    try {
      await api.adminForceResult(a, b, Number(fScoreA), Number(fScoreB));
      setForceMsg(t('god.pending.forced').replace('{a}', a).replace('{sa}', fScoreA).replace('{sb}', fScoreB).replace('{b}', b));
      setFA('');
      setFB('');
    } catch (e) {
      setForceMsg(e instanceof Error ? e.message : t('god.error'));
    } finally {
      setForcing(false);
    }
  }

  return (
    <div className="p-4">
      {/* Forcer un résultat directement */}
      <div className="mb-5 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
        <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest mb-2">
          {t('god.pending.force.title')}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono">{t('god.pending.playerA')}</span>
            <Input value={fA} onChange={setFA} placeholder={t('god.pending.loginA')} className="w-36" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono">{t('god.pending.scoreA')}</span>
            <Input type="number" value={fScoreA} onChange={setFScoreA} className="w-20" />
          </div>
          <span className="text-zinc-600 pb-2">–</span>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono">{t('god.pending.scoreB')}</span>
            <Input type="number" value={fScoreB} onChange={setFScoreB} className="w-20" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono">{t('god.pending.playerB')}</span>
            <Input value={fB} onChange={setFB} placeholder={t('god.pending.loginB')} className="w-36" />
          </div>
          <Btn onClick={forceResult} disabled={forcing || !fA.trim() || !fB.trim()} variant="success">
            {forcing ? t('god.pending.forcing') : t('god.pending.force')}
          </Btn>
        </div>
        {forceMsg && <div className="mt-2 text-xs font-mono text-zinc-300">{forceMsg}</div>}
        <div className="mt-1 text-[10px] text-zinc-600 font-mono">
          {t('god.pending.forceHint')}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <span className="text-zinc-500 text-xs font-mono">
          {t('god.pending.awaiting').replace('{n}', String(rows.length))}
        </span>
        <Btn onClick={load} variant="ghost">{t('god.refresh')}</Btn>
      </div>
      {error && <div className="mb-3 text-xs text-red-400 font-mono">{error}</div>}
      {loading ? (
        <div className="text-zinc-500 text-sm font-mono">{t('god.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="text-zinc-600 text-sm font-mono">{t('god.pending.empty')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                <th className="text-left py-2 px-2">{t('god.pending.col.declaredAt')}</th>
                <th className="text-left py-2 px-2">{t('god.pending.col.declarer')}</th>
                <th className="text-center py-2 px-2">{t('god.match.col.score')}</th>
                <th className="text-left py-2 px-2">{t('god.pending.col.opponent')}</th>
                <th className="text-right py-2 px-2">{t('god.match.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-zinc-800/40 hover:bg-zinc-900/50 transition-colors">
                  <td className="py-1.5 px-2 text-zinc-500 whitespace-nowrap">{fmtDate(p.declaredAt)}</td>
                  <td className="py-1.5 px-2 text-zinc-200">{p.declarerLogin}</td>
                  <td className="py-1.5 px-2 text-center tabular-nums text-zinc-100">{p.scoreDeclarer}–{p.scoreOpponent}</td>
                  <td className="py-1.5 px-2 text-zinc-300">{p.opponentLogin}</td>
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1.5 justify-end">
                      <Btn
                        onClick={() => {
                          if (confirm(t('god.pending.confirmForce').replace('{sa}', String(p.scoreDeclarer)).replace('{sb}', String(p.scoreOpponent)).replace('{a}', p.declarerLogin).replace('{b}', p.opponentLogin))) {
                            act(p.id, () => api.adminForceConfirmMatch(p.id));
                          }
                        }}
                        disabled={pending === p.id}
                        variant="success"
                      >
                        {t('god.pending.forceBtn')}
                      </Btn>
                      <Btn
                        onClick={() => {
                          if (confirm(t('god.pending.confirmCancel'))) {
                            act(p.id, () => api.adminForceCancelMatch(p.id));
                          }
                        }}
                        disabled={pending === p.id}
                        variant="danger"
                      >
                        {t('god.pending.cancel')}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

// `pending` (force-valider/annuler) est réservé au SUPERADMIN → filtré à l'affichage.
// ── Saisons (SUPERADMIN) ────────────────────────────────────────────────────

// Démarrer une nouvelle saison clôture instantanément la précédente (snapshot +
// champions) et remet tout le monde au plancher de son grade. Confirmation
// rapide (un clic) — le « long message » de friction est réservé à la SUPPRESSION.
function TransitionSeasonModal({
  activeName,
  newName,
  onClose,
  onDone,
}: {
  activeName: string;
  newName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ champion: string | null; players: number } | null>(null);
  const t = useT();
  useEscapeKey(true, onClose);

  async function go() {
    setBusy(true);
    try {
      const r = await api.createSeason(newName);
      setResult({ champion: r.previous?.champion ?? null, players: r.previous?.players ?? 0 });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-zinc-900 border border-emerald-500/40 rounded-lg w-full max-w-md p-5 font-mono" onClick={(e) => e.stopPropagation()}>
        {result ? (
          <div className="space-y-3 text-sm text-zinc-200">
            <div className="text-emerald-400 font-bold">{t('god.season.transitionDone').replace('{name}', newName)}</div>
            <div>{result.players} {t('god.season.playersReset')}</div>
            {result.champion && <div>{t('god.season.champion')} <span className="text-yellow-400 font-bold">{result.champion}</span></div>}
            <Btn variant="default" onClick={() => { onDone(); onClose(); }} className="mt-2">{t('god.close')}</Btn>
          </div>
        ) : (
          <>
            <div className="text-sm font-bold text-emerald-400 uppercase tracking-widest mb-2">{t('god.season.transitionTitle').replace('{name}', newName)}</div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-2">
              {t('god.season.transitionDesc.a').replace('{name}', activeName)} <span className="text-amber-300 font-bold">{t('god.season.transitionDesc.b')}</span>{t('god.season.transitionDesc.c')}
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
              {t('god.season.transitionDesc.etain.a')}<span className="text-zinc-300 font-bold">{t('god.season.transitionDesc.etain.tin')}</span>{t('god.season.transitionDesc.etain.mid')}<span className="text-amber-600 font-bold">{t('god.season.transitionDesc.etain.bronze')}</span>{t('god.season.transitionDesc.etain.b')}
            </p>
            <div className="flex gap-2 justify-end">
              <Btn variant="ghost" onClick={onClose}>{t('god.cancel')}</Btn>
              <Btn variant="success" onClick={go} disabled={busy}>
                {busy ? t('god.season.transitioning') : t('god.season.transitionBtn')}
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const DELETE_SEASON_PHRASE = 'supprimer la saison';

// Suppression d'une saison : action destructive irréversible → longue
// confirmation (énumération des conséquences + recopie de phrase).
function DeleteSeasonModal({
  season,
  onClose,
  onDone,
}: {
  season: Season;
  onClose: () => void;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = typed.trim().toLowerCase() === DELETE_SEASON_PHRASE;
  const t = useT();
  useEscapeKey(true, onClose);

  async function go() {
    setBusy(true);
    try {
      await api.deleteSeason(season.id);
      onDone();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-zinc-900 border border-red-500/40 rounded-lg w-full max-w-md p-5 font-mono" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-bold text-red-400 uppercase tracking-widest mb-2">{t('god.season.deleteTitle').replace('{name}', season.name)}</div>
        <p className="text-xs text-zinc-400 leading-relaxed mb-2">{t('god.season.deleteDesc.a')}</p>
        <ul className="text-[11px] text-zinc-400 leading-relaxed mb-3 list-disc pl-4 space-y-0.5">
          <li>{t('god.season.deleteDesc.li1')}</li>
          <li>{t('god.season.deleteDesc.li2')}</li>
          <li>{t('god.season.deleteDesc.li3')}</li>
        </ul>
        <p className="text-xs text-red-400 font-bold mb-3">{t('god.season.deleteDesc.irr')}</p>
        <p className="text-[11px] text-zinc-500 mb-1">{t('god.season.copyToConfirm')}</p>
        <div className="text-yellow-400 text-xs mb-2 select-none">{DELETE_SEASON_PHRASE}</div>
        <Input value={typed} onChange={setTyped} placeholder={DELETE_SEASON_PHRASE} className="w-full mb-3" />
        <div className="flex gap-2 justify-end">
          <Btn variant="ghost" onClick={onClose}>{t('god.cancel')}</Btn>
          <Btn variant="danger" onClick={go} disabled={!ok || busy}>
            {busy ? t('god.season.deleting') : t('god.season.deleteBtn')}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// Classements figés d'une saison, par discipline (granularité par mode).
function SeasonStandingsBlock({ seasonId }: { seasonId: string }) {
  const [game, setGame] = useState<'babyfoot' | 'smash' | 'chess' | 'streetfighter' | 'flechettes'>('babyfoot');
  const [rows, setRows] = useState<import('../lib/api').SeasonStanding[] | null>(null);
  const t = useT();

  useEffect(() => {
    let alive = true;
    setRows(null);
    api.seasonStandings(seasonId, game).then((r) => alive && setRows(r)).catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [seasonId, game]);

  return (
    <div className="border-t border-zinc-800 px-3 py-2.5">
      <div className="flex gap-1 mb-2">
        {(['babyfoot', 'smash', 'chess', 'streetfighter', 'flechettes'] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGame(g)}
            className={`px-2 py-1 rounded font-mono text-[11px] border transition-colors ${
              game === g ? 'bg-zinc-100/10 border-zinc-400 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t(`god.game.${g}`)}
          </button>
        ))}
      </div>
      {rows === null ? (
        <div className="text-zinc-600 text-xs font-mono">{t('god.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="text-zinc-600 text-xs font-mono">{t('god.season.noStandings')}</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 font-mono uppercase tracking-wider">
              <th className="text-left py-1 px-2">#</th>
              <th className="text-left py-1 px-2">{t('god.season.col.player')}</th>
              <th className="text-right py-1 px-2">{t('god.season.col.elo')}</th>
              <th className="text-right py-1 px-2">{t('god.season.col.wl')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.login} className="border-t border-zinc-800/50">
                <td className="py-1 px-2 tabular-nums text-zinc-400">{r.rank}</td>
                <td className="py-1 px-2 text-zinc-200">{r.login}</td>
                <td className="py-1 px-2 text-right tabular-nums text-zinc-100">{r.elo}</td>
                <td className="py-1 px-2 text-right tabular-nums text-zinc-500">{r.wins}-{r.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SeasonsTab() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState<Season | null>(null);
  const [openSeason, setOpenSeason] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Clôture programmée de la saison active.
  const [schedAt, setSchedAt] = useState('');
  const [schedName, setSchedName] = useState('');
  const [schedBusy, setSchedBusy] = useState(false);
  const { requestConfirm, confirmNode } = useConfirmDialog();
  const t = useT();

  const load = useCallback(async () => {
    try {
      setSeasons(await api.seasons());
    } catch {
      /* noop */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const active = seasons.find((s) => s.isActive) ?? null;

  // Première saison (aucune active) : création directe, sans reset ni confirmation.
  const createFirst = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setMsg('');
    try {
      await api.createSeason(n);
      setName('');
      setMsg(t('god.season.created'));
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Ajouter une saison alors qu'une est active = transition (clôture + reset) →
  // on passe par la modale de confirmation.
  const onAdd = () => {
    if (!name.trim()) return;
    if (active) setConfirming(true);
    else void createFirst();
  };

  // Synchro ELO/stats depuis la prod (staging only). Lecture seule côté prod,
  // n'écrase QUE l'ELO + compteurs ; rôles/permissions/coins/comptes de test
  // staging préservés. Action lourde mais non destructive (réversible via une
  // nouvelle synchro), donc simple confirmation.
  const onSyncFromProd = async () => {
    if (
      !(await requestConfirm(t('god.season.syncConfirm'), {
        confirmLabel: t('god.season.syncBtn'),
      }))
    )
      return;
    setSyncing(true);
    setMsg('');
    try {
      const r = await api.syncEloFromProd();
      setMsg(
        t('god.season.syncDone')
          .replace('{prodCount}', String(r.prodCount))
          .replace('{updated}', String(r.updated))
          .replace('{created}', String(r.created))
          .replace('{skipped}', String(r.skipped.length)) +
          ` · ${r.tournamentsSynced} tournoi${r.tournamentsSynced > 1 ? 's' : ''} synchronisé${r.tournamentsSynced > 1 ? 's' : ''}${
            r.tournamentsSkipped.length > 0 ? ` (${r.tournamentsSkipped.length} sauté${r.tournamentsSkipped.length > 1 ? 's' : ''})` : ''
          }${r.seasonSwitched ? ` · saison basculée sur « ${r.seasonSwitched} »` : ''}`,
      );
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  // Programme la clôture auto de la saison active à la date/heure choisie.
  const onSchedule = async () => {
    if (!schedAt || !schedName.trim()) return;
    const when = new Date(schedAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setMsg('La date de clôture doit être dans le futur.');
      return;
    }
    setSchedBusy(true);
    setMsg('');
    try {
      await api.scheduleSeasonEnd(when.toISOString(), schedName.trim());
      setSchedAt('');
      setSchedName('');
      setMsg(`Clôture programmée le ${fmtDate(when.toISOString())} → « ${schedName.trim()} ».`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSchedBusy(false);
    }
  };

  const onCancelSchedule = async () => {
    setSchedBusy(true);
    setMsg('');
    try {
      await api.cancelSeasonSchedule();
      setMsg('Clôture programmée annulée.');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSchedBusy(false);
    }
  };

  // Basculement de vue : remet une saison clôturée comme active (sans reset d'ELO).
  const onActivate = async (s: Season) => {
    setActivatingId(s.id);
    setMsg('');
    try {
      await api.activateSeason(s.id);
      setMsg(t('god.season.activated').replace('{name}', s.name));
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setActivatingId(null);
    }
  };

  return (
    <div className="p-4">
      {confirmNode}
      {confirming && active && (
        <TransitionSeasonModal
          activeName={active.name}
          newName={name.trim()}
          onClose={() => setConfirming(false)}
          onDone={() => {
            setName('');
            void load();
          }}
        />
      )}
      {deleting && (
        <DeleteSeasonModal season={deleting} onClose={() => setDeleting(null)} onDone={load} />
      )}

      <Section title={t('god.season.current')}>
        {active ? (
          <div className="bg-zinc-800/50 border border-zinc-700 rounded p-3 text-sm text-zinc-200">
            <span className="text-emerald-400 font-bold">{active.name}</span>
            <span className="text-zinc-500 text-xs ml-2">{t('god.season.since')} {fmtDate(active.startedAt)}</span>
          </div>
        ) : (
          <div className="text-sm text-zinc-500">{t('god.season.noneActive')}</div>
        )}
      </Section>

      <Section title={active ? t('god.season.nextTitle') : t('god.season.createTitle')}>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={name} onChange={setName} placeholder={t('god.season.namePlaceholder')} className="flex-1 min-w-[180px]" />
          <Btn variant="success" onClick={onAdd} disabled={busy || !name.trim()}>
            {busy ? t('god.season.creating') : active ? t('god.season.next') : t('god.season.create')}
          </Btn>
        </div>
        {active && <div className="text-[11px] text-zinc-500 mt-2 leading-relaxed">{t('god.season.nextHint')}</div>}
        {msg && <div className="text-xs text-zinc-400 mt-2">{msg}</div>}
      </Section>

      {active && (
        <Section title="Clôture programmée">
          {active.scheduledEndAt ? (
            <div className="bg-amber-500/5 border border-amber-500/30 rounded p-3 text-sm">
              <div className="text-amber-300">
                ⏱ Bascule auto le <span className="font-bold">{fmtDate(active.scheduledEndAt)}</span>
                {active.nextSeasonName && (
                  <> vers <span className="font-bold">« {active.nextSeasonName} »</span></>
                )}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">
                À cette date, la saison est clôturée automatiquement (snapshot + reset ELO au plancher de grade). Les League Coins sont conservés.
              </div>
              <Btn variant="ghost" onClick={() => void onCancelSchedule()} disabled={schedBusy} className="border border-red-500/40 text-red-400 mt-2">
                Annuler la programmation
              </Btn>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
                  Date &amp; heure de clôture
                  <input
                    type="datetime-local"
                    value={schedAt}
                    onChange={(e) => setSchedAt(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                  />
                </label>
                <Input value={schedName} onChange={setSchedName} placeholder="Nom de la nouvelle saison" className="flex-1 min-w-[180px]" />
                <Btn variant="success" onClick={() => void onSchedule()} disabled={schedBusy || !schedAt || !schedName.trim()}>
                  {schedBusy ? '…' : 'Programmer'}
                </Btn>
              </div>
              <div className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
                À l'heure choisie (ex. minuit), la saison actuelle est clôturée et « {schedName.trim() || 'la nouvelle saison'} » démarre automatiquement. Les coins persistent entre les saisons.
              </div>
            </>
          )}
        </Section>
      )}

      <Section title={t('god.season.historyTitle')}>
        <div className="space-y-1.5">
          {seasons.map((s) => (
            <div key={s.id} className="bg-zinc-800/30 border border-zinc-800 rounded">
              <div className="w-full flex items-center justify-between gap-2 text-xs px-3 py-2">
                <button
                  type="button"
                  onClick={() => setOpenSeason(openSeason === s.id ? null : s.id)}
                  className="flex-1 flex items-center justify-between gap-2 cursor-pointer text-left hover:opacity-80"
                >
                  <span className="text-zinc-200 font-bold">{s.name}</span>
                  <span className="flex items-center gap-2 text-zinc-500">
                    {s.isActive ? (
                      <span className="text-emerald-400">{t('god.season.ongoing')}</span>
                    ) : (
                      `${t('god.season.closedOn')} ${s.endedAt ? fmtDate(s.endedAt) : ''}`
                    )}
                    {!s.isActive && <span className="text-zinc-600">{openSeason === s.id ? '▲' : t('god.season.standings')}</span>}
                  </span>
                </button>
                {s.isActive ? (
                  <span className="shrink-0 text-[10px] uppercase tracking-wide font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5">
                    {t('god.season.active')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onActivate(s)}
                    disabled={activatingId !== null}
                    className="shrink-0 text-[11px] text-emerald-400/80 hover:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/20 hover:border-emerald-500/40 transition-colors disabled:opacity-50"
                  >
                    {activatingId === s.id ? t('god.season.activating') : t('god.season.activate')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDeleting(s)}
                  title={t('god.season.delete')}
                  className="shrink-0 text-red-400/60 hover:text-red-400 px-1.5 py-0.5 rounded border border-transparent hover:border-red-500/30 transition-colors"
                >
                  ✕
                </button>
              </div>
              {openSeason === s.id && !s.isActive && <SeasonStandingsBlock seasonId={s.id} />}
            </div>
          ))}
          {seasons.length === 0 && <div className="text-zinc-600 text-xs">{t('god.season.none')}</div>}
        </div>
      </Section>

      {IS_STAGING && (
        <Section title={t('god.season.syncTitle')}>
          <p className="text-[11px] text-zinc-500 leading-relaxed mb-2">{t('god.season.syncHint')}</p>
          <Btn
            variant="ghost"
            onClick={() => void onSyncFromProd()}
            disabled={syncing}
            className="border border-teal-600/50 text-teal-400"
          >
            {syncing ? t('god.season.syncing') : t('god.season.syncBtn')}
          </Btn>
        </Section>
      )}
    </div>
  );
}

// ── Onglet TOURNOIS : liste complète + suppression précise ───────────────────

const TOURN_STATUS_CLS: Record<Tournament['status'], string> = {
  registration: 'bg-teal-400/15 text-teal-300',
  in_progress: 'bg-amber-400/15 text-amber-400',
  finished: 'bg-zinc-600/30 text-zinc-400',
  cancelled: 'bg-red-400/15 text-red-400',
};

type TournSortKey = 'name' | 'game' | 'type' | 'format' | 'players' | 'status' | 'organizer' | 'winner' | 'created';

// Panneau de gestion des « en attente » d'un tournoi (invitations + matchs).
function ManagePanel({
  tr,
  detail,
  scores,
  setScores,
  actionBusy,
  onForceAccept,
  onForceMatch,
  onCancelInvite,
  onRemoveEntry,
  onAddPlayer,
  onStart,
  onUpdateParams,
}: {
  tr: (k: string) => string;
  detail: Tournament;
  scores: Record<string, { a: string; b: string }>;
  setScores: (fn: (prev: Record<string, { a: string; b: string }>) => Record<string, { a: string; b: string }>) => void;
  actionBusy: string | null;
  onForceAccept: (invite: TournamentInvite) => void;
  onForceMatch: (match: TournamentMatch) => void;
  onCancelInvite: (invite: TournamentInvite) => void;
  onRemoveEntry: (login: string) => void;
  onAddPlayer: (login: string) => void;
  onStart: () => void;
  onUpdateParams: (patch: {
    name?: string;
    kind?: 'friendly' | 'official';
    isPrivate?: boolean;
    capacity?: number;
    format?: 'elimination' | 'pools' | 'league';
  }) => void;
}) {
  const isReg = detail.status === 'registration';
  const pendingInvites = (detail.invites ?? []).filter((i) => i.status === 'pending');
  const entries = detail.entries ?? [];
  const matchesToForce = (detail.matches ?? []).filter(
    (m) => m.confirmedAt == null && m.playerALogin && m.playerBLogin,
  );

  // Formulaire de paramètres — initialisé depuis `detail` (le composant est
  // remonté via key={detail.id} quand on change de tournoi).
  const [name, setName] = useState(detail.name);
  const [kind, setKind] = useState<'friendly' | 'official'>(detail.kind);
  const [isPrivate, setIsPrivate] = useState(Boolean(detail.isPrivate));
  const [capacity, setCapacity] = useState(String(detail.capacity));
  const [format, setFormat] = useState<'elimination' | 'pools' | 'league'>(detail.format ?? 'elimination');
  const [addLogin, setAddLogin] = useState('');

  const curFormat = detail.format ?? 'elimination';
  const dirty =
    name.trim() !== detail.name ||
    kind !== detail.kind ||
    isPrivate !== Boolean(detail.isPrivate) ||
    (isReg && (Number(capacity) !== detail.capacity || format !== curFormat));

  function saveParams() {
    const patch: {
      name?: string;
      kind?: 'friendly' | 'official';
      isPrivate?: boolean;
      capacity?: number;
      format?: 'elimination' | 'pools' | 'league';
    } = {};
    if (name.trim() !== detail.name) patch.name = name.trim();
    if (kind !== detail.kind) patch.kind = kind;
    if (isPrivate !== Boolean(detail.isPrivate)) patch.isPrivate = isPrivate;
    if (isReg && Number(capacity) !== detail.capacity) patch.capacity = Number(capacity);
    if (isReg && format !== curFormat) patch.format = format;
    onUpdateParams(patch);
  }

  function submitAdd() {
    const v = addLogin.trim();
    if (!v) return;
    onAddPlayer(v);
    setAddLogin('');
  }

  function matchLabel(m: TournamentMatch) {
    const place =
      m.stage === 'pool'
        ? `${tr('god.tourn.pool')} ${(m.poolIndex ?? 0) + 1}`
        : `${tr('god.tourn.round')} ${m.round}`;
    return `${m.playerALogin} ${tr('god.tourn.vs')} ${m.playerBLogin} · ${place}`;
  }

  const sectionTitle = 'text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2';
  const segBtn = (active: boolean) =>
    `px-2.5 py-1.5 rounded font-mono text-xs border transition-colors ${
      active ? 'bg-zinc-100/10 border-zinc-400 text-zinc-100' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
    }`;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Paramètres ─────────────────────────────────────────────────────── */}
      <div>
        <div className={sectionTitle}>{tr('god.tourn.params')}</div>
        <div className="flex flex-col gap-3 max-w-2xl">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-zinc-500 font-mono text-xs w-20">{tr('god.tourn.name')}</span>
            <Input value={name} onChange={setName} className="flex-1 min-w-[180px]" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-zinc-500 font-mono text-xs w-20">{tr('god.tourn.col.type')}</span>
            <button type="button" onClick={() => setKind('friendly')} className={segBtn(kind === 'friendly')}>
              {tr('god.tourn.friendly')}
            </button>
            <button type="button" onClick={() => setKind('official')} className={segBtn(kind === 'official')}>
              {tr('god.tourn.official')}
            </button>
            <button type="button" onClick={() => setIsPrivate((v) => !v)} className={segBtn(isPrivate)}>
              {isPrivate ? `🔒 ${tr('god.tourn.private')}` : tr('god.tourn.public')}
            </button>
          </div>
          {isReg && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-zinc-500 font-mono text-xs w-20">{tr('god.tourn.col.format')}</span>
              <button type="button" onClick={() => setFormat('elimination')} className={segBtn(format === 'elimination')}>
                {tr('god.tourn.elim')}
              </button>
              <button type="button" onClick={() => setFormat('pools')} className={segBtn(format === 'pools')}>
                {tr('god.tourn.pools')}
              </button>
              <button type="button" onClick={() => setFormat('league')} className={segBtn(format === 'league')}>
                {tr('god.tourn.league')}
              </button>
              <span className="text-zinc-500 font-mono text-xs ml-2">{tr('god.tourn.capacity')}</span>
              <Input type="number" value={capacity} onChange={setCapacity} className="w-20" />
            </div>
          )}
          <div>
            <Btn onClick={saveParams} disabled={!dirty || actionBusy === 'edit'} variant="success">
              {tr('god.tourn.save')}
            </Btn>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Participants ─────────────────────────────────────────────────── */}
        <div>
          <div className={sectionTitle}>
            {tr('god.tourn.participants')} ({entries.length}/{detail.capacity})
          </div>
          {entries.length === 0 ? (
            <div className="text-zinc-600 text-xs font-mono mb-2">{tr('god.tourn.noParticipants')}</div>
          ) : (
            <div className="flex flex-col gap-1.5 mb-2">
              {entries.map((e) => (
                <div key={e.login} className="flex items-center justify-between gap-3 bg-zinc-800/40 rounded px-3 py-1.5">
                  <span className="text-zinc-200 font-mono text-xs truncate">{e.login}</span>
                  {isReg && (
                    <Btn onClick={() => onRemoveEntry(e.login)} disabled={actionBusy === `rm-${e.login}`} variant="danger">
                      {tr('god.tourn.remove')}
                    </Btn>
                  )}
                </div>
              ))}
            </div>
          )}
          {isReg && (
            <div className="flex items-center gap-2">
              <Input
                value={addLogin}
                onChange={setAddLogin}
                placeholder={tr('god.tourn.addPlayerPh')}
                className="flex-1"
              />
              <Btn onClick={submitAdd} disabled={!addLogin.trim() || actionBusy === 'add-player'} variant="success">
                {tr('god.tourn.add')}
              </Btn>
            </div>
          )}
        </div>

        {/* ── Invitations en attente ───────────────────────────────────────── */}
        <div>
          <div className={sectionTitle}>{tr('god.tourn.pendingInvites')}</div>
          {pendingInvites.length === 0 ? (
            <div className="text-zinc-600 text-xs font-mono">{tr('god.tourn.noPendingInvites')}</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-2 bg-zinc-800/40 rounded px-3 py-1.5">
                  <span className="text-zinc-200 font-mono text-xs truncate">{inv.inviteeLogin}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isReg && (
                      <Btn onClick={() => onForceAccept(inv)} disabled={actionBusy === inv.id} variant="success">
                        {tr('god.tourn.forceAccept')}
                      </Btn>
                    )}
                    <Btn onClick={() => onCancelInvite(inv)} disabled={actionBusy === `cancel-${inv.id}`} variant="danger">
                      {tr('god.tourn.cancelInvite')}
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Matchs à valider / forcer ──────────────────────────────────────── */}
      <div>
        <div className={sectionTitle}>{tr('god.tourn.matchesToForce')}</div>
        {matchesToForce.length === 0 ? (
          <div className="text-zinc-600 text-xs font-mono">{tr('god.tourn.noMatchToForce')}</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {matchesToForce.map((m) => {
              const s = scores[m.id] ?? { a: '', b: '' };
              return (
                <div key={m.id} className="bg-zinc-800/40 rounded px-3 py-2">
                  <div className="text-zinc-300 font-mono text-xs mb-1.5 truncate">{matchLabel(m)}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      type="number"
                      value={s.a}
                      onChange={(v) => setScores((prev) => ({ ...prev, [m.id]: { a: v, b: prev[m.id]?.b ?? '' } }))}
                      placeholder={tr('god.tourn.scoreA')}
                      className="w-16"
                    />
                    <span className="text-zinc-500 font-mono text-xs">{tr('god.tourn.vs')}</span>
                    <Input
                      type="number"
                      value={s.b}
                      onChange={(v) => setScores((prev) => ({ ...prev, [m.id]: { a: prev[m.id]?.a ?? '', b: v } }))}
                      placeholder={tr('god.tourn.scoreB')}
                      className="w-16"
                    />
                    <Btn onClick={() => onForceMatch(m)} disabled={actionBusy === m.id} variant="warn">
                      {tr('god.tourn.forceValidate')}
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Cycle de vie ───────────────────────────────────────────────────── */}
      {isReg && (
        <div>
          <div className={sectionTitle}>{tr('god.tourn.lifecycle')}</div>
          <div className="flex items-center gap-3 flex-wrap">
            <Btn onClick={onStart} disabled={entries.length < 2 || actionBusy === 'start'} variant="warn">
              {tr('god.tourn.start')}
            </Btn>
            <span className="text-zinc-600 text-xs font-mono">{tr('god.tourn.startHint')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TournamentsTab() {
  const tr = useT();
  const [rows, setRows] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [gameFilter, setGameFilter] = useState<'all' | 'babyfoot' | 'smash' | 'chess' | 'streetfighter' | 'flechettes'>('all');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  // Gestion « en attente » : un seul tournoi déplié à la fois.
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Tournament | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Action en cours dans le panneau (id invite/match) + scores saisis par match.
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, { a: string; b: string }>>({});

  // Le GOD gère TOUTES les disciplines : on agrège les 3 listes (chaque endpoint
  // est filtré par jeu côté serveur).
  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      api.tournaments('babyfoot'),
      api.tournaments('smash'),
      api.tournaments('chess'),
      api.tournaments('streetfighter'),
      api.tournaments('flechettes'),
    ])
      .then((lists) => setRows(lists.flat()))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useServerEvents(() => load(true), [...PANEL_EVENTS, 'tournament:update']);

  async function handleDelete(t: Tournament) {
    if (
      !confirm(
        tr('god.tourn.confirmDelete')
          .replace('{name}', t.name)
          .replace('{kind}', t.kind)
          .replace('{status}', tr(`god.tourn.status.${t.status}`)),
      )
    )
      return;
    setBusyId(t.id);
    setError('');
    try {
      await api.adminDeleteTournament(t.id);
      load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  // Charge le détail complet (entries/invites/matches) d'un tournoi.
  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError('');
    try {
      const full = await api.tournament(id);
      setDetail(full);
      // Pré-remplit les scores avec ceux déjà saisis (cas « valider »).
      const init: Record<string, { a: string; b: string }> = {};
      for (const m of full.matches ?? []) {
        init[m.id] = {
          a: m.scoreA != null ? String(m.scoreA) : '',
          b: m.scoreB != null ? String(m.scoreB) : '',
        };
      }
      setScores(init);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function toggleManage(t: Tournament) {
    if (openId === t.id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(t.id);
    setDetail(null);
    loadDetail(t.id);
  }

  async function handleForceAccept(t: Tournament, invite: TournamentInvite) {
    setActionBusy(invite.id);
    setError('');
    try {
      await api.adminForceTournamentAccept(t.id, invite.id);
      await loadDetail(t.id);
      load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleForceMatch(t: Tournament, match: TournamentMatch) {
    const s = scores[match.id] ?? { a: '', b: '' };
    setActionBusy(match.id);
    setError('');
    try {
      await api.adminForceTournamentMatch(t.id, match.id, Number(s.a), Number(s.b));
      await loadDetail(t.id);
      load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  }

  // Wrapper générique : exécute une action de gestion, recharge le détail + la
  // liste, et remonte l'erreur éventuelle dans le bandeau du panneau.
  async function runAction(t: Tournament, busyKey: string, fn: () => Promise<unknown>) {
    setActionBusy(busyKey);
    setError('');
    try {
      await fn();
      await loadDetail(t.id);
      load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  }

  const filtered = rows.filter(
    (t) =>
      (gameFilter === 'all' || (t.game ?? 'babyfoot') === gameFilter) &&
      (t.name.toLowerCase().includes(filter.toLowerCase()) ||
        t.createdByLogin.includes(filter) ||
        (t.winner?.login ?? '').includes(filter)),
  );

  const order: Tournament['status'][] = ['in_progress', 'registration', 'finished', 'cancelled'];
  const { sort, toggleSort } = useTableSort<TournSortKey>({ key: 'status', dir: 'asc' });
  const sorted = sortRows(
    filtered,
    sort,
    (tn, k) => {
      switch (k) {
        case 'name': return tn.name.toLowerCase();
        case 'game': return tn.game ?? 'babyfoot';
        case 'type': return tn.kind;
        case 'format': return tn.format ?? '';
        case 'players': return tn.entries?.length ?? 0;
        case 'status': return order.indexOf(tn.status);
        case 'organizer': return tn.createdByLogin.toLowerCase();
        case 'winner': return (tn.winner?.login ?? '').toLowerCase();
        case 'created': return new Date(tn.createdAt).getTime();
        default: return 0;
      }
    },
    // Départage : du plus récent au plus ancien (comportement historique).
    (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
  );

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Input value={filter} onChange={setFilter} placeholder={tr('god.tourn.filter')} className="w-72" />
        <div className="flex gap-1">
          {(['all', 'babyfoot', 'smash', 'chess', 'streetfighter', 'flechettes'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGameFilter(g)}
              className={`px-2.5 py-1.5 rounded font-mono text-xs border transition-colors ${
                gameFilter === g
                  ? 'bg-zinc-100/10 border-zinc-400 text-zinc-100'
                  : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {g === 'all' ? tr('god.tourn.all') : tr(`god.tourn.game.${g}`)}
            </button>
          ))}
        </div>
        <Btn onClick={() => load()} variant="ghost">{tr('god.reload')}</Btn>
        <span className="text-zinc-600 text-xs font-mono">{sorted.length} {tr('god.tourn.count')}</span>
      </div>
      {error && <div className="text-red-400 text-xs font-mono mb-3">{error}</div>}
      {loading ? (
        <div className="text-zinc-600 text-sm font-mono">{tr('god.loading')}</div>
      ) : sorted.length === 0 ? (
        <div className="text-zinc-600 text-sm font-mono">{tr('god.tourn.empty')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-xs font-mono uppercase tracking-wider border-b border-zinc-800">
                <SortableTh<TournSortKey> label={tr('god.tourn.col.name')} k="name" sort={sort} onSort={toggleSort} align="left" className="py-2 px-3" />
                <SortableTh<TournSortKey> label={tr('god.tourn.col.game')} k="game" sort={sort} onSort={toggleSort} align="left" className="py-2 px-3" />
                <SortableTh<TournSortKey> label={tr('god.tourn.col.type')} k="type" sort={sort} onSort={toggleSort} align="left" className="py-2 px-3" />
                <SortableTh<TournSortKey> label={tr('god.tourn.col.format')} k="format" sort={sort} onSort={toggleSort} align="left" className="py-2 px-3" />
                <SortableTh<TournSortKey> label={tr('god.tourn.col.players')} k="players" sort={sort} onSort={toggleSort} align="center" defaultDir="desc" className="py-2 px-3" />
                <SortableTh<TournSortKey> label={tr('god.tourn.col.status')} k="status" sort={sort} onSort={toggleSort} align="left" className="py-2 px-3" />
                <SortableTh<TournSortKey> label={tr('god.tourn.col.organizer')} k="organizer" sort={sort} onSort={toggleSort} align="left" className="py-2 px-3" />
                <SortableTh<TournSortKey> label={tr('god.tourn.col.winner')} k="winner" sort={sort} onSort={toggleSort} align="left" className="py-2 px-3" />
                <SortableTh<TournSortKey> label={tr('god.tourn.col.created')} k="created" sort={sort} onSort={toggleSort} align="left" defaultDir="desc" className="py-2 px-3" />
                <th className="text-right py-2 px-3">{tr('god.tourn.col.action')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const manageable = t.status === 'registration' || t.status === 'in_progress';
                const isOpen = openId === t.id;
                return (
                <Fragment key={t.id}>
                <tr className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                  <td className="py-2 px-3 text-zinc-100 font-medium max-w-[200px] truncate">
                    <button
                      onClick={() => window.open(`/tournaments/${encodeURIComponent(t.id)}`, '_blank')}
                      className="hover:text-amber-400 cursor-pointer text-left truncate w-full"
                    >
                      {t.name}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-zinc-300 font-mono text-xs whitespace-nowrap">
                    {tr(`god.tourn.game.${t.game ?? 'babyfoot'}`)}
                  </td>
                  <td className="py-2 px-3">
                    <span className={t.kind === 'official' ? 'text-amber-400 font-mono text-xs' : 'text-zinc-400 font-mono text-xs'}>
                      {t.kind === 'official' ? tr('god.tourn.official') : tr('god.tourn.friendly')}
                      {t.isPrivate ? ' 🔒' : ''}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-zinc-400 font-mono text-xs">
                    {t.format === 'pools' ? tr('god.tourn.pools') : t.format === 'league' ? tr('god.tourn.league') : tr('god.tourn.elim')}
                  </td>
                  <td className="py-2 px-3 text-center tabular-nums text-zinc-300">
                    {(t.entries?.length ?? 0)}/{t.capacity}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`px-1.5 py-0.5 text-xs rounded font-mono ${TOURN_STATUS_CLS[t.status]}`}>
                      {tr(`god.tourn.status.${t.status}`)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-zinc-400 font-mono text-xs">{t.createdByLogin}</td>
                  <td className="py-2 px-3 text-zinc-300 font-mono text-xs">
                    {t.winner?.login ? `🏆 ${t.winner.login}` : '—'}
                  </td>
                  <td className="py-2 px-3 text-zinc-500 font-mono text-xs whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                  <td className="py-2 px-3 text-right whitespace-nowrap">
                    {manageable && (
                      <Btn onClick={() => toggleManage(t)} variant={isOpen ? 'warn' : 'default'} className="mr-1.5">
                        {isOpen ? tr('god.tourn.close') : tr('god.tourn.manage')}
                      </Btn>
                    )}
                    <Btn onClick={() => handleDelete(t)} disabled={busyId === t.id} variant="danger">
                      {tr('god.tourn.delete')}
                    </Btn>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-zinc-800/60 bg-zinc-900/40">
                    <td colSpan={10} className="px-3 py-4">
                      {detailLoading || !detail ? (
                        <div className="text-zinc-600 text-xs font-mono">{tr('god.loading')}</div>
                      ) : (
                        <ManagePanel
                          key={detail.id}
                          tr={tr}
                          detail={detail}
                          scores={scores}
                          setScores={setScores}
                          actionBusy={actionBusy}
                          onForceAccept={(inv) => handleForceAccept(t, inv)}
                          onForceMatch={(m) => handleForceMatch(t, m)}
                          onCancelInvite={(inv) =>
                            runAction(t, `cancel-${inv.id}`, () => api.adminCancelTournamentInvite(t.id, inv.id))
                          }
                          onRemoveEntry={(login) =>
                            runAction(t, `rm-${login}`, () => api.adminRemoveTournamentEntry(t.id, login))
                          }
                          onAddPlayer={(login) =>
                            runAction(t, 'add-player', () => api.adminAddTournamentPlayer(t.id, login))
                          }
                          onStart={() => runAction(t, 'start', () => api.adminStartTournament(t.id))}
                          onUpdateParams={(patch) =>
                            runAction(t, 'edit', () => api.adminUpdateTournament(t.id, patch))
                          }
                        />
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: STATS (usage produit) ─────────────────────────────────────────────
// Tableau de bord agrégé : inscrits vs actifs, par jeu & global, pages les plus
// vues et actions les plus déclenchées. Alimenté par /admin/stats/overview, dont
// les compteurs d'usage proviennent de la télémétrie (cf. lib/analytics).

const STAT_GAMES: Game[] = ['babyfoot', 'smash', 'chess', 'streetfighter', 'flechettes'];
const STAT_PERIODS = [7, 30, 90] as const;

/** Liste « top N » avec barre de proportion (pages vues / actions). */
function StatBarList({ rows, empty }: { rows: StatCount[]; empty: string }) {
  if (rows.length === 0) return <div className="text-zinc-600 text-xs font-mono py-2">{empty}</div>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r) => (
        <div key={r.name} className="relative flex items-center justify-between px-2 py-1 rounded overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-zinc-700/30 rounded" style={{ width: `${(r.count / max) * 100}%` }} />
          <span className="relative z-10 text-zinc-300 text-xs font-mono truncate pr-2">{r.name}</span>
          <span className="relative z-10 text-zinc-400 text-xs font-mono tabular-nums">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

/** Mini histogramme journalier (sans dépendance graphique). */
function Sparkbars({ data }: { data: DayPoint[] }) {
  if (data.length === 0) return <div className="text-zinc-600 text-xs font-mono">—</div>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-0.5 h-16">
      {data.map((d) => (
        <div
          key={d.day}
          title={`${d.day} · ${d.count}`}
          className="flex-1 min-w-0 bg-zinc-600/60 hover:bg-zinc-400 rounded-sm transition-colors"
          style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-4 py-3">
      <div className="text-zinc-500 text-[11px] font-mono uppercase tracking-wider">{label}</div>
      <div className="text-zinc-100 text-2xl font-bold font-mono mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-zinc-600 text-[11px] font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

function StatsTab() {
  const t = useT();
  const [data, setData] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState<number>(30);
  const [game, setGame] = useState<Game | 'all'>('all');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await api.adminStatsOverview({ days, game: game === 'all' ? undefined : game });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('god.error'));
    } finally {
      setLoading(false);
    }
  }, [days, game, t]);

  useEffect(() => { load(); }, [load]);

  const activityRate = data && data.totals.registered > 0
    ? Math.round((data.totals.activeUsers / data.totals.registered) * 100)
    : 0;

  return (
    <div className="p-4">
      {/* Contrôles : fenêtre temporelle + discipline */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded p-0.5">
          {STAT_PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setDays(p)}
              className={`px-2.5 py-1 text-xs font-mono rounded cursor-pointer transition-colors ${
                days === p ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t('god.stats.days').replace('{n}', String(p))}
            </button>
          ))}
        </div>
        <select
          value={game}
          onChange={(e) => setGame(e.target.value as Game | 'all')}
          className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-mono px-2 py-1.5 rounded cursor-pointer"
        >
          <option value="all">{t('god.stats.allGames')}</option>
          {STAT_GAMES.map((g) => <option key={g} value={g}>{t(`game.${g}`)}</option>)}
        </select>
        <span className="text-zinc-500 text-xs font-mono ml-auto">{t('god.stats.window').replace('{n}', String(days))}</span>
      </div>

      {error && <div className="mb-3 text-xs text-red-400 font-mono">{error}</div>}
      {loading && !data ? (
        <div className="text-zinc-500 text-xs font-mono">{t('god.loading')}</div>
      ) : data ? (
        <div className="flex flex-col gap-5">
          {/* KPI globaux */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label={t('god.stats.registered')} value={data.totals.registered} sub={t('god.stats.realAccounts').replace('{n}', String(data.totals.registeredReal))} />
            <StatCard label={t('god.stats.active')} value={data.totals.activeUsers} sub={t('god.stats.activeSub')} />
            <StatCard label={t('god.stats.activityRate')} value={`${activityRate}%`} sub={t('god.stats.activityRateSub')} />
            <StatCard label={t('god.stats.totalMatches')} value={data.perGame.reduce((s, g) => s + g.matches, 0)} sub={t('god.stats.totalMatchesSub')} />
          </div>

          {/* Timelines */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3">
              <div className="text-zinc-400 text-xs font-mono uppercase tracking-wider mb-2">{t('god.stats.signups')}</div>
              <Sparkbars data={data.signupTimeline} />
            </div>
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3">
              <div className="text-zinc-400 text-xs font-mono uppercase tracking-wider mb-2">{t('god.stats.dailyActive')}</div>
              <Sparkbars data={data.activityTimeline} />
            </div>
          </div>

          {/* Par jeu */}
          <div>
            <div className="text-zinc-400 text-xs font-mono uppercase tracking-wider mb-2">{t('god.stats.perGame')}</div>
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                  <th className="text-left py-1.5 px-2">{t('god.stats.col.game')}</th>
                  <th className="text-right py-1.5 px-2">{t('god.stats.col.registered')}</th>
                  <th className="text-right py-1.5 px-2">{t('god.stats.col.activePlayers')}</th>
                  <th className="text-right py-1.5 px-2">{t('god.stats.col.matches')}</th>
                </tr>
              </thead>
              <tbody>
                {data.perGame.map((g) => (
                  <tr key={g.game} className="border-b border-zinc-900 hover:bg-zinc-900/30">
                    <td className="py-2 px-2 text-zinc-200 font-medium">{t(`game.${g.game}`)}</td>
                    <td className="py-2 px-2 text-right text-zinc-300 tabular-nums">{g.registered}</td>
                    <td className="py-2 px-2 text-right text-zinc-300 tabular-nums">{g.activePlayers}</td>
                    <td className="py-2 px-2 text-right text-zinc-300 tabular-nums">{g.matches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top pages / actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-zinc-400 text-xs font-mono uppercase tracking-wider mb-2">{t('god.stats.topPages')}</div>
              <StatBarList rows={data.topPages} empty={t('god.stats.noData')} />
            </div>
            <div>
              <div className="text-zinc-400 text-xs font-mono uppercase tracking-wider mb-2">{t('god.stats.topEvents')}</div>
              <StatBarList rows={data.topEvents} empty={t('god.stats.noData')} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Onglet ANIMATIONS : déclenche manuellement les cinématiques du site ───────
function AnimationsTab({ myLogin }: { myLogin: string }) {
  const t = useT();
  const { leaderboard, me } = useLeagueData();
  const { game, setGame } = useGameMode();

  // Échantillon de joueurs : vrais joueurs du classement si dispo, sinon factices.
  const meLogin = me?.login ?? myLogin;
  const pool = leaderboard.map((e) => ({ login: e.login, imageUrl: e.imageUrl }));
  const meP = { login: meLogin, imageUrl: pool.find((p) => p.login === meLogin)?.imageUrl ?? null };
  const others = pool.filter((p) => p.login !== meLogin);
  const opp = others[0] ?? { login: 'rival', imageUrl: null };
  const participants =
    pool.length >= 4
      ? pool.slice(0, 8)
      : [meP, opp, { login: 'joueur3', imageUrl: null }, { login: 'joueur4', imageUrl: null }];
  const pairings: { a: { login: string; imageUrl: string | null } | null; b: { login: string; imageUrl: string | null } | null }[] = [];
  for (let i = 0; i < participants.length; i += 2) {
    pairings.push({ a: participants[i] ?? null, b: participants[i + 1] ?? null });
  }
  const accent = GAME_META[game].color;

  type Anim = null | 'versus' | 'tversus' | 'ceremony' | 'victory';
  const [anim, setAnim] = useState<Anim>(null);
  // Passage de rang : chaque clic monte d'un palier (Étain → … → Diamant → GM),
  // pour passer en revue tous les emblèmes. Overlay global monté dans l'AppShell.
  const rankUpIdx = useRef(0);
  const playRankUp = () => {
    const ladder = [...RANK_TIERS, GRANDMASTER];
    const i = rankUpIdx.current % (ladder.length - 1);
    rankUpIdx.current += 1;
    triggerRankUp({ tier: ladder[i + 1]!, fromTier: ladder[i]!, game });
  };
  // Réaction (meme) : la série croît à chaque clic → signature inédite, donc rejoue.
  const [reactionStreak, setReactionStreak] = useState(0);
  // Boîte mystère : 'win' = titre arc-en-ciel, 'loss' = malus −10 ELO.
  const [mystery, setMystery] = useState<'win' | 'loss' | null>(null);
  const [coinOpen, setCoinOpen] = useState(false);
  const [coin, setCoin] = useState<{ flipping: boolean; side: 'heads' | 'tails' | null }>({ flipping: false, side: null });

  const playCoin = () => {
    setCoinOpen(true);
    setCoin({ flipping: true, side: null });
    // Lancer ~2.6 s, atterrissage + PP du gagnant ~4 s, puis fermeture.
    window.setTimeout(() => setCoin({ flipping: false, side: Date.now() % 2 ? 'heads' : 'tails' }), 2600);
    window.setTimeout(() => { setCoinOpen(false); setCoin({ flipping: false, side: null }); }, 6500);
  };
  const coinWinner = coin.side === 'tails' ? opp : meP;

  const cycleGame = () => {
    const idx = GAMES.indexOf(game);
    const next = GAMES[(idx + 1) % GAMES.length];
    if (next) setGame(next);
  };

  const items: { key: string; label: string; desc: string; onClick: () => void }[] = [
    { key: 'versus', label: 'VERSUS (matchmaking)', desc: 'Écran VS plein écran (toi vs un joueur).', onClick: () => setAnim('versus') },
    { key: 'tversus', label: 'VERSUS (tournoi)', desc: 'Éclair diagonal + VS, couleur du mode courant.', onClick: () => setAnim('tversus') },
    { key: 'coin', label: 'Pile ou face', desc: 'Pièce lancée en l\'air + révélation de la PP du gagnant.', onClick: playCoin },
    { key: 'ceremony', label: 'Cérémonie de lancement', desc: 'Cérémonie de tournoi (titre, tirage, parade).', onClick: () => setAnim('ceremony') },
    { key: 'rage', label: 'Contestation (rage)', desc: 'Flash rouge + onde de choc + emojis de rage.', onClick: () => fireContestRage('sender') },
    { key: 'duel', label: 'Éclair de duel', desc: 'Foudre diagonale + VS au lancement/à l\'acceptation d\'un duel.', onClick: () => triggerDuelStrike({ meLogin, opponentLogin: opp.login, game, kind: 'challenge' }) },
    { key: 'victory', label: 'Champion (victoire)', desc: 'Confettis + portrait du vainqueur (duo affiché en 2v2).', onClick: () => setAnim('victory') },
    { key: 'reaction', label: 'Réaction (meme)', desc: 'Pop-up moqueur/élogieux selon la série (ici série chaude).', onClick: () => setReactionStreak((s) => (s >= 6 ? s + 1 : 6)) },
    { key: 'mystery-win', label: 'Boîte mystère (gain)', desc: 'Révélation animée du titre arc-en-ciel « Mysterious ».', onClick: () => setMystery('win') },
    { key: 'mystery-loss', label: 'Boîte mystère (perte)', desc: 'La boîte n\'offre rien : malus de −10 ELO (9 chances sur 10).', onClick: () => setMystery('loss') },
    { key: 'transition', label: 'Transition de mode ⚠️', desc: 'Joue la cinématique en passant au mode suivant (change ton mode).', onClick: cycleGame },
    { key: 'rankup', label: 'Passage de rang', desc: 'L\'emblème du grade claque au centre : onde de choc + éclairs (palier suivant à chaque clic).', onClick: playRankUp },
  ];

  // Lot d'exemple pour la boîte mystère gagnante : le titre arc-en-ciel « Mysterious ».
  const MYSTERY_SAMPLE: MysteryReward = {
    id: 'title-mysterious', name: 'Mysterious', category: 'title', color: 'rainbow', rarity: 'legendary',
  };

  return (
    <div className="p-4 space-y-4">
      <p className="text-zinc-400 text-xs">
        Déclenche manuellement les cinématiques du site, avec des données d'exemple. Le mode courant ({t(`game.${game}`)}) sert d'accent.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={it.onClick}
            className="text-left p-4 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-800/60 transition-colors cursor-pointer"
          >
            <div className="text-zinc-100 text-sm font-bold tracking-wide">{it.label}</div>
            <div className="text-zinc-500 text-[11px] mt-1 leading-snug">{it.desc}</div>
          </button>
        ))}
      </div>

      {/* Cinématiques montées à la demande (chacune portale en plein écran) */}
      {anim === 'versus' && (
        <GlobalVersusOverlay me={meP} opponent={opp} game={game} onDone={() => setAnim(null)} />
      )}
      <TournVersusOverlay open={anim === 'tversus'} a={meP} b={opp} accent={accent} onDone={() => setAnim(null)} t={t} />
      <CoinFlipOverlay
        open={coinOpen}
        side={coin.side}
        flipping={coin.flipping}
        winnerName={!coin.flipping && coin.side ? coinWinner.login : undefined}
        winnerLogin={!coin.flipping && coin.side ? coinWinner.login : undefined}
        winnerImageUrl={coinWinner.imageUrl}
        t={t}
      />
      {anim === 'ceremony' && (
        <TournamentLaunchCeremony
          tournamentName="Tournoi de démonstration"
          participants={participants}
          pairings={pairings}
          accent={accent}
          onDone={() => setAnim(null)}
          t={t}
        />
      )}
      <VictoryOverlay
        open={anim === 'victory'}
        champion={meP}
        partner={opp}
        tournamentName="Tournoi de démonstration"
        accent={accent}
        onDone={() => setAnim(null)}
        t={t}
      />
      {reactionStreak > 0 && (
        <PlayerReactionOverlay signals={{ currentStreak: reactionStreak, winRate: 88, total: 30 }} />
      )}
      {mystery && (
        <MysteryRevealModal
          reward={mystery === 'win' ? MYSTERY_SAMPLE : null}
          onClose={() => setMystery(null)}
        />
      )}
    </div>
  );
}

// ─── Onglet ANNONCES : crée des annonces générales (popup à la connexion) ─────
function AnnouncementsTab() {
  const t = useT();
  const [list, setList] = useState<AnnouncementData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<AnnouncementKind>('info');
  const [creating, setCreating] = useState(false);
  const [okMsg, setOkMsg] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api
      .adminAnnouncements()
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : t('god.error')))
      .finally(() => setLoading(false));
  }, [t]);

  // Chargement initial + rafraîchissement silencieux périodique : la liste (et
  // surtout les compteurs « vu(s) ») reste à jour sans avoir à recharger la page.
  useEffect(() => {
    load();
    const id = window.setInterval(() => load(true), 15000);
    return () => window.clearInterval(id);
  }, [load]);

  async function handleCreate() {
    setError('');
    setOkMsg('');
    if (!title.trim() || !body.trim()) {
      setError('Titre et message obligatoires.');
      return;
    }
    setCreating(true);
    try {
      const created = await api.adminCreateAnnouncement({ title: title.trim(), body: body.trim(), kind });
      setOkMsg(`Annonce « ${created.title} » publiée — elle poppera à la prochaine connexion de chaque joueur.`);
      setTitle('');
      setBody('');
      setKind('info');
      load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('god.error'));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Supprimer cette annonce ? (disparaît de la liste publique et des accusés de lecture)')) return;
    setDeleting(id);
    setError('');
    try {
      await api.adminDeleteAnnouncement(id);
      load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('god.error'));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-4 space-y-5">
      {/* Création */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
        <div className="text-sm font-bold text-zinc-100 tracking-wide">Nouvelle annonce</div>
        <p className="text-[11px] text-zinc-500 leading-snug">
          Affichée une seule fois en popup à la prochaine connexion de chaque joueur, puis listée en
          permanence dans « À propos → Annonces ».
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Titre *</span>
            <Input value={title} onChange={setTitle} placeholder="ex. Nouvelle saison !" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Type</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as AnnouncementKind)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
            >
              {ANNOUNCEMENT_KINDS.map((k) => (
                <option key={k} value={k}>{announcementKindMeta(k).label}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Message *</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Le contenu de l'annonce (les retours à la ligne sont conservés)."
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-y"
          />
        </label>
        {error && <div className="text-xs text-red-400 font-mono">{error}</div>}
        {okMsg && <div className="text-xs text-emerald-400 font-mono">{okMsg}</div>}
        <div>
          <Btn onClick={handleCreate} disabled={creating} variant="success">
            {creating ? '…' : 'Publier l\'annonce'}
          </Btn>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="text-zinc-500 text-sm font-mono">{t('god.loading')}</div>
      ) : list.length === 0 ? (
        <div className="text-zinc-600 text-sm font-mono">Aucune annonce.</div>
      ) : (
        <div className="space-y-2">
          {list.map((a) => {
            const meta = announcementKindMeta(a.kind);
            const Icon = meta.Icon;
            return (
              <div key={a.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: meta.accent, background: `${meta.accent}1a`, border: `1px solid ${meta.accent}55` }}
                      >
                        <Icon className="w-3 h-3" strokeWidth={2.5} />
                        {meta.label}
                      </span>
                      <span className="text-sm font-bold text-zinc-100">{a.title}</span>
                    </div>
                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">{a.body}</p>
                    <div className="mt-2 flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                      <span>{fmtDate(a.createdAt)}</span>
                      {a.createdBy && (<><span className="text-zinc-700">·</span><span>{a.createdBy}</span></>)}
                      <span className="text-zinc-700">·</span>
                      <span>👁 {a.seenCount ?? 0} vu(s)</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <Btn onClick={() => handleDelete(a.id)} disabled={deleting === a.id} variant="danger">
                      {deleting === a.id ? '…' : 'Supprimer'}
                    </Btn>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CONSUMABLE_LABEL: Record<ConsumableKind, string> = {
  anti_ops: 'Anti-OPS',
  elo_mult: "Multiplicateur d'ELO",
  force_duel: 'Main du Destin',
  mini_ops: 'Mini-OPS',
};

/** Onglet GOD : gestion des consommables, badges libres et titre d'un joueur. */
function ItemsAdminTab() {
  const [login, setLogin] = useState('');
  const [data, setData] = useState<AdminUserItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  // Formulaire de badge libre.
  const [bCode, setBCode] = useState('');
  const [bLabel, setBLabel] = useState('');
  const [bIcon, setBIcon] = useState('Award');
  const [bColor, setBColor] = useState('#ffc94a');

  const iconNames = Object.keys(BADGE_ICONS);
  const PreviewIcon = BADGE_ICONS[bIcon] ?? BADGE_ICONS.Award!;

  const flash = (m: string) => { setMsg(m); setErr(null); };
  const fail = (e: unknown) => { setErr(e instanceof Error ? e.message : String(e)); setMsg(null); };

  const load = useCallback(async (who: string) => {
    const l = who.trim();
    if (!l) return;
    setLoading(true);
    setErr(null);
    try {
      const d = await api.adminUserItems(l);
      setData(d);
      setTitle(d.title ?? '');
    } catch (e) {
      setData(null);
      fail(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = () => data && load(data.login);

  const grant = async (kind: ConsumableKind, amount: number) => {
    if (!data) return;
    try { await api.adminGrantConsumable(data.login, kind, amount); flash(`${CONSUMABLE_LABEL[kind]} ${amount >= 0 ? '+' : ''}${amount}`); await load(data.login); } catch (e) { fail(e); }
  };
  const force = async (kind: ConsumableKind) => {
    if (!data) return;
    try { await api.adminForceConsumable(data.login, kind); flash(`Effet « ${CONSUMABLE_LABEL[kind]} » forcé`); await load(data.login); } catch (e) { fail(e); }
  };
  const saveTitle = async () => {
    if (!data) return;
    try { await api.setUserTitle(data.login, title.trim() || null); flash('Titre mis à jour'); await load(data.login); } catch (e) { fail(e); }
  };
  const addBadge = async () => {
    if (!data) return;
    try {
      await api.adminGrantBadge(data.login, { code: bCode.trim() || bLabel.trim().toLowerCase().replace(/\s+/g, '_'), label: bLabel.trim(), icon: bIcon, color: bColor });
      flash('Badge attribué');
      setBCode(''); setBLabel('');
      await load(data.login);
    } catch (e) { fail(e); }
  };
  const removeBadge = async (code: string) => {
    if (!data) return;
    try { await api.adminRemoveBadge(data.login, code); flash('Badge retiré'); await load(data.login); } catch (e) { fail(e); }
  };

  return (
    <div className="p-4">
      <Section title="Joueur">
        <div className="flex items-center gap-2">
          <Input value={login} onChange={setLogin} placeholder="login" className="w-64" />
          <Btn onClick={() => load(login)} disabled={loading || !login.trim()}>
            {loading ? '…' : 'Charger'}
          </Btn>
          {data && <Btn variant="ghost" onClick={reload}>↻</Btn>}
        </div>
        {msg && <div className="mt-2 text-xs text-emerald-400">{msg}</div>}
        {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
      </Section>

      {data && (
        <>
          <Section title="Titre">
            <div className="flex items-center gap-2">
              <Input value={title} onChange={setTitle} placeholder="(aucun)" className="w-72" />
              <Btn variant="success" onClick={saveTitle}>Appliquer</Btn>
              <Btn variant="ghost" onClick={() => { setTitle(''); }}>Vider</Btn>
            </div>
          </Section>

          <Section title="Consommables">
            <div className="space-y-2">
              {data.consumables.map((c) => (
                <div key={c.kind} className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-zinc-300 w-44">{CONSUMABLE_LABEL[c.kind]}</span>
                  <span className="text-sm font-bold text-zinc-100 tabular-nums w-10 text-center">×{c.quantity}</span>
                  <Btn onClick={() => grant(c.kind, 1)}>+1</Btn>
                  <Btn variant="danger" onClick={() => grant(c.kind, -1)}>-1</Btn>
                  {/* La Main du Destin exige deux cibles : pas de « forçage » admin sans contexte. */}
                  {c.kind !== 'force_duel' && (
                    <Btn variant="warn" onClick={() => force(c.kind)}>Forcer l'usage</Btn>
                  )}
                  {c.kind === 'elo_mult' && data.eloMultUntil && new Date(data.eloMultUntil) > new Date() && (
                    <span className="text-xs text-orange-400">en feu</span>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Badges libres">
            <div className="flex flex-wrap gap-2 mb-3">
              {data.badges.length === 0 && <span className="text-xs text-zinc-500">aucun badge libre</span>}
              {data.badges.map((b) => {
                const Icon = BADGE_ICONS[b.icon] ?? BADGE_ICONS.Award!;
                return (
                  <span
                    key={b.code}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold border"
                    style={{ color: b.color ?? '#a89880', borderColor: `${b.color ?? '#a89880'}55`, background: `${b.color ?? '#a89880'}1a` }}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
                    {b.label}
                    <button onClick={() => removeBadge(b.code)} className="ml-1 text-red-400 hover:text-red-300 cursor-pointer" aria-label="retirer">✕</button>
                  </span>
                );
              })}
            </div>
            <div className="flex flex-wrap items-end gap-2 border-t border-zinc-800 pt-3">
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
                Label
                <Input value={bLabel} onChange={setBLabel} placeholder="ex. Légende" className="w-40" />
              </label>
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
                Code (optionnel)
                <Input value={bCode} onChange={setBCode} placeholder="auto" className="w-32" />
              </label>
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
                Icône
                <select
                  value={bIcon}
                  onChange={(e) => setBIcon(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
                >
                  {iconNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
                Couleur
                <input type="color" value={bColor} onChange={(e) => setBColor(e.target.value)} className="w-12 h-9 bg-zinc-800 border border-zinc-700 rounded cursor-pointer" />
              </label>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold border self-end"
                style={{ color: bColor, borderColor: `${bColor}55`, background: `${bColor}1a` }}
              >
                <PreviewIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                {bLabel || 'aperçu'}
              </span>
              <Btn variant="success" onClick={addBadge} disabled={!bLabel.trim()}>Attribuer</Btn>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

// ── Passe de combat (XP) Tab ────────────────────────────────────────────────

const BP_REWARD_KINDS: BattlePassTierAdmin['rewardKind'][] = ['none', 'item', 'coins', 'consumable'];
const BP_CONSUMABLES: ConsumableKind[] = ['anti_ops', 'elo_mult', 'force_duel', 'mini_ops'];

/** Ligne d'édition d'un palier du passe (récompense : rien / item / coins / consommable). */
function BattlePassTierRow({
  tier,
  items,
  onSaved,
  onDeleted,
}: {
  tier: BattlePassTierAdmin;
  items: ShopItemData[];
  onSaved: (t: BattlePassTierAdmin) => void;
  onDeleted: (tier: number) => void;
}) {
  const t = useT();
  const [rewardKind, setRewardKind] = useState<BattlePassTierAdmin['rewardKind']>(tier.rewardKind);
  const [itemId, setItemId] = useState(tier.itemId ?? '');
  const [coins, setCoins] = useState(String(tier.coins ?? 0));
  const [consumableKind, setConsumableKind] = useState<ConsumableKind>(
    (tier.consumableKind as ConsumableKind) ?? 'elo_mult',
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const input: Omit<BattlePassTierAdmin, 'tier'> = {
        rewardKind,
        itemId: rewardKind === 'item' ? itemId || null : null,
        coins: rewardKind === 'coins' ? Number(coins) || 0 : null,
        consumableKind: rewardKind === 'consumable' ? consumableKind : null,
      };
      const res = await api.adminSetBattlePassTier(tier.tier, input);
      onSaved(res);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.adminDeleteBattlePassTier(tier.tier);
      onDeleted(tier.tier);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2">
      <span className="inline-flex items-center justify-center w-9 h-7 rounded bg-amber-400/15 text-amber-400 text-xs font-mono font-bold tabular-nums shrink-0">
        {t('battlepass.admin.tier')} {tier.tier}
      </span>

      {/* Type de récompense */}
      <select
        value={rewardKind}
        onChange={(e) => setRewardKind(e.target.value as BattlePassTierAdmin['rewardKind'])}
        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
      >
        {BP_REWARD_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`battlepass.reward.${k}`)}
          </option>
        ))}
      </select>

      {/* Paramètre dépendant du type */}
      {rewardKind === 'item' && (
        <select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500 max-w-[14rem]"
        >
          <option value="">— {t('battlepass.admin.item')} —</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name} ({it.category})
            </option>
          ))}
        </select>
      )}

      {rewardKind === 'coins' && (
        <label className="flex items-center gap-1.5">
          <img src="/42coin.webp" alt="" className="w-4 h-4" />
          <Input type="number" value={coins} onChange={setCoins} className="w-24" />
        </label>
      )}

      {rewardKind === 'consumable' && (
        <select
          value={consumableKind}
          onChange={(e) => setConsumableKind(e.target.value as ConsumableKind)}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
        >
          {BP_CONSUMABLES.map((k) => (
            <option key={k} value={k}>
              {CONSUMABLE_LABEL[k]}
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center gap-2 ml-auto">
        {err && <span className="text-xs text-red-400 font-mono">{err}</span>}
        {saved && <span className="text-xs text-emerald-400 font-mono">{t('battlepass.admin.saved')}</span>}
        <Btn variant="success" onClick={save} disabled={busy}>
          {t('battlepass.admin.save')}
        </Btn>
        <Btn variant="danger" onClick={del} disabled={busy}>
          {t('battlepass.admin.delete')}
        </Btn>
      </div>
    </div>
  );
}

/** Onglet GOD : configuration des récompenses du passe de combat. */
function BattlePassAdminTab() {
  const t = useT();
  const [tiers, setTiers] = useState<BattlePassTierAdmin[]>([]);
  const [items, setItems] = useState<ShopItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Ajout d'un nouveau palier.
  const [newTier, setNewTier] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [ts, its] = await Promise.all([
        api.adminBattlePassTiers(),
        api.adminShopItems().catch(() => [] as ShopItemData[]),
      ]);
      setTiers([...ts].sort((a, b) => a.tier - b.tier));
      setItems(its);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upsert = (saved: BattlePassTierAdmin) =>
    setTiers((prev) =>
      [...prev.filter((t) => t.tier !== saved.tier), saved].sort((a, b) => a.tier - b.tier),
    );
  const remove = (tier: number) => setTiers((prev) => prev.filter((t) => t.tier !== tier));

  const addTier = async () => {
    const n = Number(newTier);
    if (!Number.isInteger(n) || n <= 0) return;
    setErr(null);
    try {
      const res = await api.adminSetBattlePassTier(n, { rewardKind: 'none' });
      upsert(res);
      setNewTier('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="p-4">
      <Section title={t('battlepass.admin.title')}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
            {t('battlepass.admin.tier')}
          </span>
          <Input type="number" value={newTier} onChange={setNewTier} placeholder="ex. 5" className="w-24" />
          <Btn variant="default" onClick={addTier} disabled={!Number(newTier)}>
            + {t('battlepass.admin.save')}
          </Btn>
          {err && <span className="text-xs text-red-400 font-mono">{err}</span>}
        </div>

        {loading ? (
          <div className="text-xs text-zinc-500 font-mono">…</div>
        ) : tiers.length === 0 ? (
          <div className="text-xs text-zinc-500 font-mono">{t('battlepass.empty')}</div>
        ) : (
          <div className="space-y-2">
            {tiers.map((tier) => (
              <BattlePassTierRow
                key={tier.tier}
                tier={tier}
                items={items}
                onSaved={upsert}
                onDeleted={remove}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── SF Sessions Tab ────────────────────────────────────────────────────────

interface LocalSfSession {
  id: string;
  startTime: string;
  endTime: string | null;
  organizerLogin: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  organizer: { login: string; firstName: string | null; lastName: string | null; imageUrl: string | null };
}

function SfSessionsTab({ myLogin }: { myLogin: string }) {
  const [sessions, setSessions] = useState<LocalSfSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    startNow: true,
    startTime: '',
    durationHours: '3',
    useEndTime: false,
    endTime: '',
    description: '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  void myLogin;

  const load = useCallback(async () => {
    try {
      const list = await (api as unknown as { adminListSfSessions: () => Promise<LocalSfSession[]> }).adminListSfSessions();
      setSessions(list);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const now = new Date();
  const activeSession = sessions.find(
    (s) =>
      s.isActive &&
      new Date(s.startTime) <= now &&
      (!s.endTime || new Date(s.endTime) > now)
  );

  const openSession = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const startTime = form.startNow
        ? new Date().toISOString()
        : form.startTime
        ? new Date(form.startTime).toISOString()
        : new Date().toISOString();
      const data: Record<string, unknown> = {
        startTime,
        description: form.description || undefined,
      };
      if (form.useEndTime && form.endTime) {
        data.endTime = new Date(form.endTime).toISOString();
      } else if (!form.useEndTime && form.durationHours) {
        data.durationHours = parseFloat(form.durationHours);
      }
      await (api as unknown as { adminCreateSfSession: (d: Record<string, unknown>) => Promise<LocalSfSession> }).adminCreateSfSession(data);
      setMsg('Session ouverte !');
      setCreating(false);
      void load();
    } catch {
      setMsg("Erreur lors de l'ouverture");
    } finally {
      setBusy(false);
    }
  };

  const closeSession = async (id: string) => {
    setBusy(true);
    try {
      await (api as unknown as { adminUpdateSfSession: (id: string, d: { isActive: boolean }) => Promise<LocalSfSession> }).adminUpdateSfSession(id, { isActive: false });
      void load();
    } finally {
      setBusy(false);
    }
  };

  const cancelSession = async (id: string) => {
    if (!confirm('Annuler cette session ?')) return;
    setBusy(true);
    try {
      await (api as unknown as { adminDeleteSfSession: (id: string) => Promise<{ ok: boolean }> }).adminDeleteSfSession(id);
      void load();
    } finally {
      setBusy(false);
    }
  };

  const fmtDt = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-6 p-4">
      <Section title="État actuel">
        {activeSession ? (
          <div className="flex items-center justify-between bg-zinc-800/60 border border-zinc-700 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <div>
                <span className="text-green-400 font-mono text-xs font-bold uppercase tracking-wide">
                  Session en cours
                </span>
                <p className="text-zinc-400 text-xs mt-0.5">
                  Depuis {fmtDt(activeSession.startTime)}
                  {activeSession.endTime
                    ? ` · Fin prévue ${fmtDt(activeSession.endTime)}`
                    : ' · Pas de fin planifiée'}
                </p>
              </div>
            </div>
            <Btn onClick={() => closeSession(activeSession.id)} variant="danger" disabled={busy}>
              Clôturer
            </Btn>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-zinc-800/60 border border-zinc-800 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-zinc-600" />
              <span className="text-zinc-500 font-mono text-xs">Aucune session active</span>
            </div>
            <Btn
              onClick={() => setCreating(!creating)}
              variant="success"
              disabled={busy}
            >
              {creating ? 'Annuler' : '+ Ouvrir une session'}
            </Btn>
          </div>
        )}
      </Section>

      {creating && !activeSession && (
        <Section title="Nouvelle session">
          <div className="bg-zinc-800/40 border border-zinc-700 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.startNow}
                  onChange={(e) => setForm((f) => ({ ...f, startNow: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-zinc-300 text-xs font-mono">Démarrer maintenant</span>
              </label>
              {!form.startNow && (
                <Input
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(v) => setForm((f) => ({ ...f, startTime: v }))}
                  className="text-xs"
                />
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.useEndTime}
                  onChange={(e) => setForm((f) => ({ ...f, useEndTime: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-zinc-300 text-xs font-mono">Heure de fin fixe</span>
              </label>
              {form.useEndTime ? (
                <Input
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(v) => setForm((f) => ({ ...f, endTime: v }))}
                  className="text-xs"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 text-xs">Durée :</span>
                  <Input
                    type="number"
                    value={form.durationHours}
                    onChange={(v) => setForm((f) => ({ ...f, durationHours: v }))}
                    placeholder="3"
                    className="w-16 text-xs"
                  />
                  <span className="text-zinc-500 text-xs">heures</span>
                </div>
              )}
            </div>
            <div>
              <Input
                value={form.description}
                onChange={(v) => setForm((f) => ({ ...f, description: v }))}
                placeholder="Description (optionnelle)"
                className="w-full text-xs"
              />
            </div>
            <div className="flex items-center gap-3">
              <Btn onClick={openSession} variant="success" disabled={busy}>
                {busy ? '…' : 'Ouvrir la session'}
              </Btn>
              {msg && <span className="text-xs font-mono text-zinc-400">{msg}</span>}
            </div>
          </div>
        </Section>
      )}

      <Section title={`Historique (${sessions.length})`}>
        {loading ? (
          <span className="text-zinc-600 text-xs font-mono">Chargement…</span>
        ) : sessions.length === 0 ? (
          <span className="text-zinc-600 text-xs font-mono">Aucune session</span>
        ) : (
          <div className="space-y-1.5">
            {sessions.map((s) => {
              const sessionNow = new Date();
              const isOn =
                s.isActive &&
                new Date(s.startTime) <= sessionNow &&
                (!s.endTime || new Date(s.endTime) > sessionNow);
              const isPending = s.isActive && new Date(s.startTime) > sessionNow;
              const orgName =
                [s.organizer.firstName, s.organizer.lastName]
                  .filter(Boolean)
                  .join(' ') || s.organizerLogin;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between bg-zinc-800/40 border border-zinc-800 rounded px-3 py-2 gap-4"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        isOn
                          ? 'bg-green-400'
                          : isPending
                          ? 'bg-yellow-400'
                          : 'bg-zinc-600'
                      }`}
                    />
                    <span className="text-zinc-300 text-xs font-mono truncate">
                      {fmtDt(s.startTime)}
                    </span>
                    {s.endTime && (
                      <span className="text-zinc-600 text-xs">→ {fmtDt(s.endTime)}</span>
                    )}
                    <span className="text-zinc-500 text-xs">par {orgName}</span>
                    {s.description && (
                      <span className="text-zinc-600 text-xs truncate italic">
                        &ldquo;{s.description}&rdquo;
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isOn && (
                      <Btn onClick={() => closeSession(s.id)} variant="danger" disabled={busy}>
                        Clôturer
                      </Btn>
                    )}
                    {isPending && (
                      <Btn onClick={() => cancelSession(s.id)} variant="warn" disabled={busy}>
                        Annuler
                      </Btn>
                    )}
                    {!isOn && !isPending && (
                      <span className="text-zinc-700 text-[10px] font-mono">terminée</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Onglets fusionnés ─────────────────────────────────────────────────────────

function FeedbackTab() {
  const [sub, setSub] = useState<'ideas' | 'bugs'>('ideas');
  return (
    <div>
      <SubTabBar
        tabs={[
          { id: 'ideas', label: '💡 IDÉES' },
          { id: 'bugs', label: '🐛 BUGS' },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === 'ideas' && <IdeasTab />}
      {sub === 'bugs' && <BugsTab />}
    </div>
  );
}

function ContentTab() {
  const [sub, setSub] = useState<'announcements' | 'items' | 'battlepass'>('announcements');
  return (
    <div>
      <SubTabBar
        tabs={[
          { id: 'announcements', label: '📣 ANNONCES' },
          { id: 'items', label: '🎨 INVENTAIRES' },
          { id: 'battlepass', label: '🎖 PASSE DE COMBAT' },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === 'announcements' && <AnnouncementsTab />}
      {sub === 'items' && <ItemsAdminTab />}
      {sub === 'battlepass' && <BattlePassAdminTab />}
    </div>
  );
}

function ActivityTab({ myRole }: { myRole: Role }) {
  const [sub, setSub] = useState<'matches' | 'pending'>('matches');
  return (
    <div>
      <SubTabBar
        tabs={[
          { id: 'matches', label: '⚔️ JOUÉS' },
          ...(myRole === 'SUPERADMIN' ? [{ id: 'pending' as const, label: '⏳ EN ATTENTE' }] : []),
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === 'matches' && <MatchesTab />}
      {sub === 'pending' && myRole === 'SUPERADMIN' && <PendingTab />}
    </div>
  );
}

function SafetyTab() {
  const [sub, setSub] = useState<'rejets' | 'alertes'>('alertes');
  return (
    <div>
      <SubTabBar
        tabs={[
          { id: 'alertes', label: '⚠️ ALERTES' },
          { id: 'rejets', label: '❌ REJETS' },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === 'alertes' && <AlertesTab />}
      {sub === 'rejets' && <RejetsTab />}
    </div>
  );
}

function SystemTab({ myRole, myLogin }: { myRole: Role; myLogin: string }) {
  type SystemSub = 'audit' | 'seasons' | 'animations';
  const subTabs: { id: SystemSub; label: string }[] = [
    { id: 'audit', label: '📋 AUDIT' },
    ...(myRole === 'SUPERADMIN' ? [{ id: 'seasons' as SystemSub, label: '🏆 SAISONS' }] : []),
    ...(myRole === 'ADMIN' || myRole === 'SUPERADMIN' ? [{ id: 'animations' as SystemSub, label: '🎬 ANIMATIONS' }] : []),
  ];
  const [sub, setSub] = useState<SystemSub>('audit');

  return (
    <div>
      <SubTabBar tabs={subTabs} active={sub} onChange={setSub} />
      {sub === 'audit' && <AuditTab />}
      {sub === 'seasons' && myRole === 'SUPERADMIN' && <SeasonsTab />}
      {sub === 'animations' && (myRole === 'ADMIN' || myRole === 'SUPERADMIN') && <AnimationsTab myLogin={myLogin} />}
    </div>
  );
}

function PlayersTab({ myRole, myLogin }: { myRole: Role; myLogin: string }) {
  const [sub, setSub] = useState<'users' | 'moderation'>('users');
  return (
    <div>
      <SubTabBar
        tabs={[
          { id: 'users', label: '👥 LISTE' },
          { id: 'moderation', label: '🔍 INSPECTION' },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === 'users' && <UsersTab myRole={myRole} myLogin={myLogin} />}
      {sub === 'moderation' && <ModerationTab />}
    </div>
  );
}

const TAB_ICONS: Partial<Record<Tab, string>> = {
  stats: '📊',
  players: '👥',
  activity: '⚔️',
  safety: '🛡',
  history: '📜',
  tournaments: '🎯',
  feedback: '💬',
  content: '📣',
  system: '⚙️',
  'sf-club': '🥊',
};

const TABS: { id: Tab; superAdminOnly?: boolean; sfAdminOnly?: boolean; adminOnly?: boolean }[] = [
  { id: 'stats' },
  { id: 'players' },
  { id: 'activity' },
  { id: 'safety' },
  { id: 'history' },
  { id: 'tournaments' },
  { id: 'feedback', adminOnly: true },
  { id: 'content', adminOnly: true },
  { id: 'system' },
  { id: 'sf-club', sfAdminOnly: true },
];

// ── Panneau /moodo (modérateurs) ──────────────────────────────────────────────
// Un MODERATOR voit le même panneau que /GOD mais restreint aux onglets couverts
// par ses permissions (accordées par un admin via l'onglet MODÉRATION). Onglet
// visible si AU MOINS UNE des permissions listées est accordée ; les onglets
// absents de cette table (saisons, annonces, inventaires…) restent admin-only.
// La vraie barrière reste côté serveur (requirePerm sur chaque endpoint).
const MODO_TAB_PERMS: Partial<Record<Tab, ModeratorPermissionKey[]>> = {
  stats: ['canViewStats'],
  players: ['canBan', 'canEditStats'],
  safety: ['canDeleteRejectedMatches', 'canViewSuspicious'],
  history: ['canViewHistory'],
  tournaments: ['canDeleteTournaments'],
  system: ['canViewAuditLog'],
};

export function GODPage({ moodo = false }: { moodo?: boolean }) {
  const navigate = useNavigate();
  const t = useT();
  const [myLogin, setMyLogin] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [myPerms, setMyPerms] = useState<Partial<Record<ModeratorPermissionKey, boolean>>>({});
  const [isSfAdmin, setIsSfAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(moodo ? 'stats' : 'players');
  // Sens de la dernière transition d'onglet (1 = suivant, -1 = précédent),
  // pour orienter la petite animation de glissement sur mobile.
  const [navDir, setNavDir] = useState(0);
  const isMobile = useIsMobile();

  // Onglets réellement visibles selon le rôle — base de la nav par swipe.
  // /moodo : un MODERATOR ne voit que les onglets couverts par ses permissions ;
  // un admin qui visite /moodo voit tous les onglets « modo » (aperçu).
  const visibleTabs = moodo
    ? TABS.filter((tab) => {
        const perms = MODO_TAB_PERMS[tab.id];
        if (!perms) return false;
        if (myRole === 'ADMIN' || myRole === 'SUPERADMIN') return true;
        return perms.some((p) => myPerms[p]);
      })
    : TABS.filter((tab) => {
        if (tab.superAdminOnly && myRole !== 'SUPERADMIN') return false;
        if (tab.adminOnly && myRole !== 'ADMIN' && myRole !== 'SUPERADMIN') return false;
        if (isSfAdmin && myRole === 'MODERATOR') return !!tab.sfAdminOnly;
        return true;
      });

  const goToTab = useCallback(
    (dir: 1 | -1) => {
      setActiveTab((current) => {
        const idx = visibleTabs.findIndex((tab) => tab.id === current);
        const target = visibleTabs[idx + dir];
        if (!target) return current; // borné aux extrémités
        setNavDir(dir);
        haptic('selection');
        return target.id;
      });
    },
    [visibleTabs],
  );

  const swipeRef = useHorizontalSwipe<HTMLDivElement>({
    enabled: isMobile,
    onSwipeLeft: () => goToTab(1),
    onSwipeRight: () => goToTab(-1),
  });

  // Barre d'onglets : drag à la souris (maintenir + pousser gauche/droite) pour
  // scroller horizontalement et atteindre les onglets partiellement cachés.
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabDrag = useRef({ down: false, moved: false, startX: 0, scroll: 0 });

  useEffect(() => {
    api.me()
      .then((data) => {
        const role = data.role;
        const hasSfAdmin = (data as { sfAdmin?: boolean }).sfAdmin === true;
        if (role === 'ADMIN' || role === 'SUPERADMIN') {
          setMyLogin(data.login);
          setMyRole(role);
          setMyPerms(data.moderatorPermissions ?? {});
          setIsSfAdmin(hasSfAdmin);
        } else if (hasSfAdmin && !moodo) {
          setMyLogin(data.login);
          setMyRole('MODERATOR' as Role);
          setIsSfAdmin(true);
          setActiveTab('sf-club');
        } else if (moodo && role === 'MODERATOR') {
          setMyLogin(data.login);
          setMyRole(role);
          setMyPerms(data.moderatorPermissions ?? {});
        } else {
          setMyRole(null);
        }
      })
      .catch(() => setMyRole(null))
      .finally(() => setAuthLoading(false));
  }, [moodo]);

  // /moodo : l'onglet courant peut ne pas être autorisé pour ce modo (permissions
  // chargées après coup) → on se rabat sur le premier onglet visible.
  useEffect(() => {
    if (!moodo || authLoading || !myRole) return;
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id ?? 'stats');
    }
    // visibleTabs est dérivé de myPerms/myRole — les deps suffisent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moodo, authLoading, myRole, myPerms, activeTab]);

  if (authLoading) {
    return (
      <div className="h-screen bg-zinc-950 flex items-center justify-center overflow-hidden">
        <span className="text-zinc-500 font-mono text-sm">{t('god.checkingRights')}</span>
      </div>
    );
  }

  // /moodo : un modo sans AUCUNE permission accordée n'a rien à voir → 403 aussi.
  if (!myRole || !myLogin || (moodo && visibleTabs.length === 0)) {
    return (
      <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 overflow-hidden">
        <span className="text-red-400 font-mono text-2xl font-bold">{t('god.denied.code')}</span>
        <span className="text-zinc-400 font-mono text-sm">
          {moodo ? t('god.denied.msgModo') : t('god.denied.msg')}
        </span>
        <button onClick={() => navigate('/challenges')} className="text-zinc-500 font-mono text-xs hover:text-zinc-300 transition-colors cursor-pointer">
          {t('god.back')}
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 font-mono flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/challenges')}
              aria-label={t('god.backApp.aria')}
              className="flex items-center justify-center w-8 h-8 -ml-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
            </button>
            <span className="text-zinc-300 font-bold tracking-widest text-sm">
              {moodo ? t('moodo.panel') : t('god.panel')}
            </span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-400 text-xs">{myLogin}</span>
            <RoleBadge role={myRole} />
          </div>
          <button
            onClick={() => navigate('/challenges')}
            className="flex items-center gap-1 text-zinc-500 text-xs hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
            {t('god.backApp')}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/30">
        <div
          ref={tabBarRef}
          onPointerDown={(e) => {
            const el = tabBarRef.current;
            if (!el) return;
            tabDrag.current = { down: true, moved: false, startX: e.clientX, scroll: el.scrollLeft };
          }}
          onPointerMove={(e) => {
            const el = tabBarRef.current;
            if (!el || !tabDrag.current.down) return;
            const dx = e.clientX - tabDrag.current.startX;
            if (Math.abs(dx) > 4) tabDrag.current.moved = true;
            el.scrollLeft = tabDrag.current.scroll - dx;
          }}
          onPointerUp={() => { tabDrag.current.down = false; }}
          onPointerLeave={() => { tabDrag.current.down = false; }}
          // Un vrai drag ne doit pas changer d'onglet : on avale le clic qui suit.
          onClickCapture={(e) => {
            if (tabDrag.current.moved) {
              e.preventDefault();
              e.stopPropagation();
              tabDrag.current.moved = false;
            }
          }}
          className="max-w-screen-2xl mx-auto px-4 flex items-center gap-0 overflow-x-auto cursor-grab active:cursor-grabbing select-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                const from = visibleTabs.findIndex((x) => x.id === activeTab);
                const to = visibleTabs.findIndex((x) => x.id === tab.id);
                setNavDir(to === from ? 0 : to > from ? 1 : -1);
                setActiveTab(tab.id);
              }}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs tracking-widest transition-colors cursor-pointer border-b-2 whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'text-zinc-100 border-zinc-400'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              {TAB_ICONS[tab.id] && <span className="text-sm leading-none">{TAB_ICONS[tab.id]}</span>}
              <span className="hidden sm:inline">{t(`god.tab.${tab.id}`)}</span>
              <span className="sm:hidden text-[10px] font-bold">{t(`god.tab.${tab.id}`).slice(0, 4)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content — swipe horizontal mobile pour changer d'onglet */}
      <div ref={swipeRef} className="flex-1 overflow-y-auto">
        <motion.div
          key={isMobile ? activeTab : 'static'}
          initial={isMobile ? { opacity: 0, x: navDir * 24 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="max-w-screen-2xl mx-auto"
        >
          {activeTab === 'stats' && <StatsTab />}
          {activeTab === 'players' && <PlayersTab myRole={myRole} myLogin={myLogin} />}
          {activeTab === 'activity' && <ActivityTab myRole={myRole} />}
          {activeTab === 'safety' && <SafetyTab />}
          {activeTab === 'history' && <AllHistoryTab />}
          {activeTab === 'tournaments' && <TournamentsTab />}
          {activeTab === 'feedback' && <FeedbackTab />}
          {activeTab === 'content' && <ContentTab />}
          {activeTab === 'system' && <SystemTab myRole={myRole} myLogin={myLogin} />}
          {activeTab === 'sf-club' && myLogin && <SfSessionsTab myLogin={myLogin} />}
        </motion.div>
      </div>
    </div>
  );
}
