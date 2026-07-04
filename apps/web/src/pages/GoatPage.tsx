import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, ChevronLeft, Flame, HelpCircle, Gift, X } from 'lucide-react';
import { Panel } from '../components/Panel';
import { Avatar } from '../components/Avatar';
import { PlayerLink } from '../components/PlayerLink';
import { TournamentCup } from '../components/TournamentCup';
import { BadgeChip } from '../components/Badges';
import { useLeagueData } from '../hooks/useLeagueData';
import { useGameMode } from '../hooks/useGameMode';
import {
  computeGoat,
  GOAT_WEIGHTS,
  type GoatPlayer,
  type GoatMetricKey,
} from '../lib/goat';
import type { LeaderboardEntry, PlayedMatch } from '../lib/api';
import { useT } from '../lib/i18n';
import { CampusScopeToggle, filterByCampus, type CampusScope } from './leaderboard/campusScope';
import { hasSeenGoatIntro, markGoatIntroSeen } from '../lib/storage';

const OFFICIAL_CUP = '#ff6b6b';
const FRIENDLY_CUP = '#ffc94a';

function displayName(e: LeaderboardEntry): string {
  const full = [e.firstName, e.lastName].filter(Boolean).join(' ').trim();
  return full || e.login;
}

const weightPct = (w: number) => Math.round(w * 100);

/**
 * Répartition réelle du Score G.O.A.T, générée depuis GOAT_WEIGHTS — reste donc
 * toujours synchrone avec le calcul (toutes les mesures), contrairement à
 * l'ancien résumé « ELO/WR/titres » figé et faux.
 */
function GoatWeightsList({ compact = false }: { compact?: boolean }) {
  const t = useT();
  return (
    <ul className={`grid grid-cols-2 ${compact ? 'gap-x-3 gap-y-1' : 'gap-x-4 gap-y-1.5'}`}>
      {GOAT_WEIGHTS.map((w) => (
        <li
          key={w.key}
          className={`flex items-center justify-between gap-2 ${compact ? 'text-[11px]' : 'text-xs'}`}
        >
          <span className="text-muted truncate">{t(`goat.metric.${w.key}`)}</span>
          <span className="text-gold/90 font-bold tabular-nums shrink-0">{weightPct(w.weight)}%</span>
        </li>
      ))}
    </ul>
  );
}

export function GoatView({
  leaderboard: lbOverride,
  matches: matchesOverride,
  campusScoped = false,
}: {
  /** Classement scopé saison (snapshot). Défaut : classement live. */
  leaderboard?: LeaderboardEntry[];
  /** Matchs scopés saison (filtrés par seasonId). Défaut : tous les matchs live. */
  matches?: PlayedMatch[];
  /**
   * Affiche un sélecteur « Mon campus / Inter-campus » et filtre le G.O.A.T par
   * campus. Réservé à la page autonome /goat : quand le G.O.A.T est embarqué dans
   * le classement, le parent fournit déjà un `leaderboard` cloisonné.
   */
  campusScoped?: boolean;
} = {}) {
  const live = useLeagueData();
  const { tournaments, me } = live;
  const myCampus = me?.user?.campus ?? null;
  const [campusScope, setCampusScope] = useState<CampusScope>('mine');
  const baseLeaderboard = lbOverride ?? live.leaderboard;
  const leaderboard = campusScoped
    ? filterByCampus(baseLeaderboard, myCampus ? campusScope : 'all', myCampus)
    : baseLeaderboard;
  const matches = matchesOverride ?? live.matches;
  const { game } = useGameMode();
  const t = useT();
  // L'intro ne s'affiche qu'au tout premier passage ; ensuite elle est rappelable
  // via le bouton « ? ». La case « ne plus montrer » (cochée par défaut) mémorise
  // le choix ; décochée, l'intro reviendra au prochain passage.
  const [showIntro, setShowIntro] = useState(() => !hasSeenGoatIntro());
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const dismissIntro = () => {
    if (dontShowAgain) markGoatIntroSeen();
    setShowIntro(false);
  };
  const ranking = useMemo(
    () => computeGoat(leaderboard, matches.filter((m) => (m.game ?? 'babyfoot') === game), tournaments),
    [leaderboard, matches, tournaments, game],
  );

  const goat = ranking[0];
  const rest = ranking.slice(1);

  return (
    <div>
      {campusScoped && myCampus && (
        <div className="mb-4 max-w-[240px]">
          <CampusScopeToggle value={campusScope} onChange={setCampusScope} myCampus={myCampus} />
        </div>
      )}
      {/* ── Bandeau d'en-tête : explique la page d'emblée + accès à l'aide ── */}
      <GoatHeader onOpenHelp={() => setShowIntro(true)} />

      {!goat ? (
        <div className="text-center text-muted-2 py-16">
          <div className="text-5xl mb-3 opacity-40">🐐</div>
          <div className="text-sm font-semibold">{t('goat.notEnough.title')}</div>
          <div className="text-xs mt-1">{t('goat.notEnough.sub')}</div>
        </div>
      ) : (
        <>
          {/* ── Héro G.O.A.T ── */}
          <GoatHero player={goat} isMe={goat.entry.login === me?.login} />

          {/* ── Prétendants : grille de cartes, tout visible, pas de "Voir plus" ── */}
          {rest.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-4">
                <span className="font-gaming text-[10px] uppercase tracking-[0.18em] text-gold/80 font-extrabold">{t('goat.contenders')}</span>
                <div className="flex-1 h-px bg-gradient-to-r from-gold/20 to-transparent" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rest.map((p) => (
                  <ContenderCard key={p.entry.login} player={p} isMe={p.entry.login === me?.login} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modale d'explication — rendue en portal, centrée dans la fenêtre ── */}
      <GoatIntroModal
        open={showIntro}
        dontShowAgain={dontShowAgain}
        setDontShowAgain={setDontShowAgain}
        onClose={dismissIntro}
      />
    </div>
  );
}

// ─── En-tête explicite (toujours visible) ────────────────────────────────────
// Remplace l'ancien bouton « ? » isolé : le titre + la baseline disent ce qu'est
// la page sans rien ouvrir, et un bouton clairement libellé invite à l'aide.

function GoatHeader({ onOpenHelp }: { onOpenHelp: () => void }) {
  const t = useT();
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-gold drop-shadow-[0_1px_5px_rgba(255,201,74,0.5)]" fill="currentColor" strokeWidth={1.5} />
          <span className="font-display text-sm font-black uppercase tracking-[0.18em] text-gold">
            {t('goat.intro.scoreLabel')}
          </span>
        </div>
        <p className="text-[11px] text-muted-2 leading-snug mt-1 max-w-md">
          {t('goat.tagline')}
        </p>
      </div>
      {/* Bouton d'aide libellé : survol = aperçu de la répartition, clic = modale. */}
      <div className="relative group shrink-0">
        <button
          type="button"
          onClick={onOpenHelp}
          aria-label={t('goat.help.aria')}
          className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 px-2.5 py-1.5 text-[11px] font-semibold text-gold/85 hover:text-gold hover:border-gold/60 hover:bg-gold/5 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" strokeWidth={2.4} />
          <span className="hidden sm:inline">{t('goat.help.button')}</span>
        </button>
        <div className="absolute right-0 top-10 z-30 w-64 rounded-xl border border-gold/30 bg-bg-1/95 backdrop-blur p-3 shadow-xl opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-150">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-gold mb-2">
            {t('goat.intro.scoreLabel')}
          </div>
          <GoatWeightsList compact />
        </div>
      </div>
    </div>
  );
}

// ─── Modale d'explication ─────────────────────────────────────────────────────
// Rendue via portal en `fixed inset-0` : toujours centrée dans la fenêtre (et non
// au milieu d'un conteneur très long, ce qui la faisait apparaître « en bas »).
// Se ferme via la croix, le fond, ou Échap.

function GoatIntroModal({
  open,
  dontShowAgain,
  setDontShowAgain,
  onClose,
}: {
  open: boolean;
  dontShowAgain: boolean;
  setDontShowAgain: (v: boolean) => void;
  onClose: () => void;
}) {
  const t = useT();

  // Échap pour fermer + blocage du scroll de fond tant que la modale est ouverte.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="goat-intro"
          role="dialog"
          aria-modal="true"
          aria-label={t('goat.title')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto"
          style={{ background: 'rgba(8,6,3,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md my-auto rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(155deg, rgba(50,38,12,0.96) 0%, rgba(20,16,7,0.98) 100%)',
              border: '1.5px solid rgba(255,201,74,0.45)',
              boxShadow: '0 0 50px rgba(255,201,74,0.18), inset 0 1px 0 rgba(255,215,120,0.12)',
            }}
          >
            <div className="absolute -right-6 -top-6 opacity-[0.07] pointer-events-none">
              <Crown className="w-40 h-40 text-gold" fill="currentColor" strokeWidth={0.5} />
            </div>
            {/* Croix de fermeture — affordance claire en haut à droite. */}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.back')}
              className="absolute right-3 top-3 z-10 w-7 h-7 rounded-full flex items-center justify-center text-muted-2 hover:text-text-strong hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" strokeWidth={2.4} />
            </button>
            <div className="relative p-6 sm:p-7">
              <div className="flex items-center gap-2.5 mb-3">
                <Crown className="w-6 h-6 text-gold drop-shadow-[0_2px_8px_rgba(255,201,74,0.6)]" fill="currentColor" strokeWidth={1.5} />
                <span className="font-display text-xl font-black text-text-strong leading-none">
                  {t('goat.title')}
                </span>
              </div>
              <div className="text-[9px] font-extrabold uppercase tracking-[0.24em] text-gold mb-4">
                🐐 {t('goat.sub')}
              </div>
              <p className="text-sm text-muted leading-relaxed">
                {t('goat.intro.p1.a')}<span className="text-gold/90 font-semibold">{t('goat.intro.scoreLabel')}</span>{t('goat.intro.p1.b')}
              </p>
              <p className="text-sm text-muted leading-relaxed mt-3">
                {t('goat.intro.p2.a')}
                <span className="text-gold/90 font-semibold">{GOAT_WEIGHTS.length} {t('goat.intro.measures')}</span>
                {t('goat.intro.p2.b')}
              </p>
              <div className="mt-3 rounded-xl border border-gold/15 bg-black/20 p-3">
                <GoatWeightsList />
              </div>
              {/* Récompense — l'info « le GOAT reçoit un truc en plus ». */}
              <div
                className="mt-3 flex items-start gap-3 rounded-xl p-3"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,201,74,0.16) 0%, rgba(255,201,74,0.05) 100%)',
                  border: '1px solid rgba(255,201,74,0.4)',
                }}
              >
                <Gift className="w-5 h-5 text-gold shrink-0 mt-0.5 drop-shadow-[0_1px_4px_rgba(255,201,74,0.5)]" strokeWidth={2} />
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gold">
                    {t('goat.reward.title')}
                  </div>
                  <p className="text-[12px] text-muted leading-snug mt-0.5">
                    {t('goat.reward.text')}
                  </p>
                </div>
              </div>
              <label className="mt-5 flex items-center gap-2 cursor-pointer select-none text-[11px] text-muted-2 hover:text-muted transition-colors">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="w-3.5 h-3.5 rounded cursor-pointer accent-[#ffc94a]"
                />
                {t('goat.intro.dontShowAgain')}
              </label>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-sm font-black uppercase tracking-wider text-bg-1 bg-gradient-to-r from-gold to-[#f5b942] hover:brightness-110 shadow-gold-glow transition-all active:scale-[0.98]"
              >
                {t('goat.intro.ok')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// Page autonome (route /goat) — conserve le cartouche + le bouton retour. Le
// classement affiche désormais le G.O.A.T en vue inline (cf. RankingViewToggle),
// mais on garde cette page pour les liens directs.
export function GoatPage() {
  const navigate = useNavigate();
  const t = useT();
  return (
    <Panel title="G.O.A.T" sub={t('goat.sub')} accent="crown">
      {/* ── Bouton retour ── */}
      <button
        type="button"
        onClick={() => navigate('/leaderboard')}
        className="group inline-flex items-center gap-1 mb-4 rounded-lg px-2.5 py-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-2 hover:text-gold hover:bg-white/[0.03] border border-transparent hover:border-border/50 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" strokeWidth={2.5} />
        {t('common.back')}
      </button>
      <GoatView campusScoped />
    </Panel>
  );
}

// ─── Héro (n°1) ──────────────────────────────────────────────────────────────

function GoatHero({ player, isMe }: { player: GoatPlayer; isMe: boolean }) {
  const { entry, metrics } = player;
  const t = useT();
  return (
    <div
      id={isMe ? 'lb-me-row' : undefined}
      className="relative rounded-2xl overflow-hidden scroll-mt-24"
      style={{
        background: 'linear-gradient(145deg, rgba(50,38,12,0.9) 0%, rgba(22,18,8,0.95) 100%)',
        border: '1.5px solid rgba(255,201,74,0.45)',
        boxShadow: '0 0 40px rgba(255,201,74,0.14), inset 0 1px 0 rgba(255,215,120,0.12)',
      }}
    >
      {/* Filigrane couronne */}
      <div className="absolute -right-8 -top-8 opacity-[0.06] pointer-events-none">
        <Crown className="w-48 h-48 text-gold" fill="currentColor" strokeWidth={0.5} />
      </div>

      <div className="relative p-5 sm:p-6">
        {/* En-tête */}
        <div className="flex items-start gap-4 mb-5">
          <div className="relative shrink-0">
            <Avatar login={entry.login} imageUrl={entry.imageUrl} size="xl"
              className="ring-2 ring-gold ring-offset-2 ring-offset-bg-1 shadow-gold-glow" />
            <Crown className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-8 text-gold drop-shadow-[0_2px_8px_rgba(255,201,74,0.75)]"
              fill="currentColor" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-extrabold uppercase tracking-[0.24em] text-gold mb-1">
              🐐 {t('goat.sub')} {isMe && `· ${t('common.toi')}`}
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <PlayerLink login={entry.login} className="block min-w-0">
                <span className="block truncate font-display text-2xl sm:text-3xl font-black text-text-strong leading-none">
                  {displayName(entry)}
                </span>
              </PlayerLink>
              {/* Badge G.O.A.T — actif d'office sur le #1 (récompense du statut). */}
              <BadgeChip code="goat" size="sm" />
            </div>
            <div className="text-xs text-muted-2 mt-1">@{entry.login} · #{entry.rank} ELO</div>
          </div>
          {/* Score GOAT */}
          <div className="text-right shrink-0">
            <div className="font-display text-5xl font-black gradient-text-brand tabular-nums leading-none">
              {player.score}
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-2 font-bold mt-1">Score</div>
          </div>
        </div>

        {/* Stats grid compacte */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <MiniStat label="ELO cumulé" value={String(metrics.elo)} accent="gold" />
          <MiniStat label={t('profil.winRate')} value={`${metrics.winRate}%`} accent="gold" />
          <MiniStat label={t('goat.stat.matches')} value={`${metrics.wins}${t('lb.abbr.win')}`} accent="teal" />
          <MiniStat label={t('goat.stat.officialCup')} value={String(metrics.officialTitles)} accent={metrics.officialTitles > 0 ? 'red' : 'muted'} />
        </div>

        {/* Barres de contribution */}
        <MetricBars player={player} />

        {/* Récompense du G.O.A.T — bandeau toujours visible sous le héro. */}
        <div
          className="mt-4 flex items-center gap-2.5 rounded-xl px-3 py-2.5"
          style={{
            background: 'linear-gradient(135deg, rgba(255,201,74,0.16) 0%, rgba(255,201,74,0.05) 100%)',
            border: '1px solid rgba(255,201,74,0.4)',
          }}
        >
          <Gift className="w-4 h-4 text-gold shrink-0 drop-shadow-[0_1px_4px_rgba(255,201,74,0.5)]" strokeWidth={2.2} />
          <span className="text-[11px] text-muted leading-snug">
            <span className="text-gold font-bold">{t('goat.reward.title')} · </span>
            {t('goat.reward.text')}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Carte prétendant (visible d'emblée, sans expand) ────────────────────────

function ContenderCard({ player, isMe }: { player: GoatPlayer; isMe: boolean }) {
  const { entry, metrics } = player;
  const t = useT();
  return (
    <div
      id={isMe ? 'lb-me-row' : undefined}
      className={`rounded-xl p-3.5 transition-colors scroll-mt-24 ${
        isMe ? 'border border-gold/35 bg-gold/[0.04]' : 'border border-border/50 bg-white/[0.02]'
      }`}
    >
      {/* En-tête de carte */}
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-7 text-center font-display font-black tabular-nums text-muted-2 text-sm shrink-0">
          {player.rank}
        </span>
        <PlayerLink login={entry.login} className="flex items-center gap-2 min-w-0 flex-1">
          <Avatar login={entry.login} imageUrl={entry.imageUrl} size="sm" />
          <div className="min-w-0">
            <div className="font-semibold text-text-strong truncate text-sm leading-tight">
              {displayName(entry)}
            </div>
            <div className="text-[10px] text-muted-2 font-mono">{metrics.elo} ELO · {metrics.wins}V</div>
          </div>
        </PlayerLink>
        {/* Score GOAT proéminent */}
        <div className="text-right shrink-0">
          <div className="font-display text-xl font-black text-gold tabular-nums">{player.score}</div>
          {metrics.officialTitles > 0 && (
            <div className="flex items-center justify-end gap-0.5 mt-0.5">
              <TournamentCup accent={OFFICIAL_CUP} className="w-3 h-3" />
              <span className="text-[10px] text-red font-bold">{metrics.officialTitles}</span>
            </div>
          )}
        </div>
      </div>

      {/* Barres compactes — toutes visibles sans expand */}
      <div className="space-y-1">
        {GOAT_WEIGHTS.slice(0, 3).map((w) => {
          const pct = Math.round((player.norm[w.key as GoatMetricKey] ?? 0) * 100);
          return (
            <div key={w.key} className="flex items-center gap-2">
              <span className="w-20 text-[9px] uppercase tracking-wider text-muted-2 font-semibold truncate shrink-0">
                {t(`goat.metric.${w.key}`)}
              </span>
              <div className="flex-1 h-1 rounded-full bg-bg-1 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-gold/50 to-gold"
                  style={{ width: `${pct}%`, transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
              </div>
              <span className="text-[9px] font-mono text-muted-2 w-7 text-right shrink-0">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function MiniStat({ label, value, accent }: { label: string; value: string; accent: 'gold' | 'teal' | 'red' | 'muted' }) {
  const cls = accent === 'gold' ? 'text-gold' : accent === 'teal' ? 'text-teal' : accent === 'red' ? 'text-red' : 'text-text-strong';
  return (
    <div className="rounded-lg bg-bg-1/60 px-2 py-1.5 text-center">
      <div className={`font-display font-extrabold tabular-nums text-sm ${cls}`}>{value}</div>
      <div className="text-[8px] uppercase tracking-wider text-muted-2 mt-0.5 truncate">{label}</div>
    </div>
  );
}

function MetricBars({ player }: { player: GoatPlayer }) {
  const t = useT();
  return (
    <div className="space-y-1.5">
      {GOAT_WEIGHTS.map((w) => {
        const pct = Math.round((player.norm[w.key as GoatMetricKey] ?? 0) * 100);
        return (
          <div key={w.key} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-[10px] uppercase tracking-wider text-muted-2 font-semibold truncate">
              {t(`goat.metric.${w.key}`)}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-bg-0/60 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-gold/60 to-gold"
                style={{ width: `${pct}%` }} />
            </div>
            <span className="w-9 text-right text-[10px] font-mono tabular-nums text-muted-2">
              {Math.round(w.weight * 100)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// unused but kept for compat
const _FRIENDLY_CUP = FRIENDLY_CUP;
void _FRIENDLY_CUP;
const _Flame = Flame;
void _Flame;
