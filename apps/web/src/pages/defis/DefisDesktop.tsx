import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Swords, X, Clock, Zap, Users, Target } from 'lucide-react';
import { Panel } from '../../components/Panel';
import { Avatar } from '../../components/Avatar';
import { SheldonApostleAura, SHELDON_COLORS, isSheldonTitle } from '../../components/SheldonApostle';
import { Button } from '../../components/Button';
import { PlayerLink } from '../../components/PlayerLink';
import { OutcomeButton } from '../../components/OutcomeButton';
import { AbacusSlider } from '../../components/AbacusSlider';
import { ContestModal } from '../../components/ContestModal';
import { MatchmakingButton } from '../../components/MatchmakingButton';
import {
  api,
  type Challenge,
  type Game,
  type LeaderboardEntry,
  type MatchResultInput,
  type PendingMatch,
  type PendingFfa,
  type PlayedMatch,
} from '../../lib/api';
import { useMemo } from 'react';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useGameMode } from '../../hooks/useGameMode';
import { pickRating } from '../../lib/gameStats';
import { RankedBadge } from '../../components/RankedBadge';
import { StatCard } from '../../components/StatCard';
import { useFlash } from '../../hooks/useFlash';
import { useOpsStatus } from '../../hooks/useOpsStatus';
import { useI18n, useT, type Lang } from '../../lib/i18n';
import { fmtRelative } from '../../lib/format';
import { useDefisLogic, challengeCancelState } from './shared/useDefisLogic';
import { Cooldown } from './shared/Cooldown';
import { gameColor, GAME_EMOJI as GAME_EMOJI_MAP } from '../../lib/gameVisuals';
import {
  DeclareGameFlow,
  WINNING_SCORE,
  LOSER_SCORE_MIN,
  LOSER_SCORE_MAX,
} from './shared/DeclareGameFlow';
import { ChallengeFlow } from './shared/ChallengeFlow';
import { Declare2v2GameFlow } from './shared/Declare2v2GameFlow';
import { Challenge2v2Flow } from './shared/Challenge2v2Flow';
import { Mode1v1Toggle, type DuelMode } from './shared/Mode1v1Toggle';
import { DeclareFfaGameFlow } from './shared/DeclareFfaGameFlow';
import { DeclareDartsGameFlow } from './shared/DeclareDartsGameFlow';
import { SmashSetEditor, type SmashSetValue } from './shared/SmashSetEditor';
import { NewTeamCelebration } from '../../components/NewTeamCelebration';
import type { Declare2v2Response } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
type Kind = 'incoming' | 'outgoing' | 'accepted';
type OpenCard = 'declare' | 'challenge' | 'ffa' | 'darts' | null;
const NOOP = () => {};

// ─── Badge de discipline ──────────────────────────────────────────────────────
// Affiché sur TOUS les jeux avec la couleur propre au jeu (pas la couleur du
// mode courant). Utilise gameColor() de gameVisuals pour la cohérence.

function GameTag({ game }: { game?: Game }) {
  const t = useT();
  const g = game ?? 'babyfoot';
  const color = gameColor(g);
  const emoji = GAME_EMOJI_MAP[g];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-extrabold uppercase tracking-[0.12em] text-[9px] leading-none flex-shrink-0"
      style={{
        color,
        background: `${color}18`,
        border: `1px solid ${color}40`,
      }}
    >
      <span>{emoji}</span>
      <span>{t(`game.${g}`)}</span>
    </span>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function DefisDesktop() {
  const t = useT();
  const { lang } = useI18n();
  const { locations, me, matches, leaderboard } = useLeagueData();
  const { game } = useGameMode();
  const {
    myLogin,
    incoming,
    outgoing,
    accepted,
    pendingToConfirm,
    pendingWaiting,
    ffaToConfirm,
    ffaWaiting,
    dartsToConfirm,
    dartsWaiting,
    contestableMatches,
    others,
    recentOpponents,
    opponentCounts,
    refresh,
    handleAction,
    cancelDeclaration,
    confirmFfa,
    contestFfa,
    cancelFfaDeclaration,
    confirmDarts,
    contestDarts,
    cancelDartsDeclaration,
    contestMatch,
    requestAmicableCancel,
    respondAmicableCancel,
  } = useDefisLogic();

  const [openCard, setOpenCard] = useState<OpenCard>(null);
  const [presetOpp, setPresetOpp] = useState<LeaderboardEntry | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Stats game-aware : filtrées sur la discipline courante (corrige le bug ELO global).
  const gameStats = useMemo(() => {
    const login = myLogin;
    if (!me?.user || !login) return null;
    const mine = (matches ?? []).filter(
      (m) => (m.game ?? 'babyfoot') === game &&
        (m.playerALogin === login || m.playerBLogin === login),
    );
    let wins = 0; let losses = 0; let streak = 0; let streakBroken = false;
    for (const m of [...mine].sort((a, b) => +new Date(b.playedAt) - +new Date(a.playedAt))) {
      if (m.winner === 'draw') { streakBroken = true; continue; } // nulle : ni V ni D, casse la série
      const isA = m.playerALogin === login;
      const won = (isA && m.winner === 'A') || (!isA && m.winner === 'B');
      if (won) wins++; else losses++;
      if (!streakBroken) { if (won) streak++; else streakBroken = true; }
    }
    const total = wins + losses;
    const rank = leaderboard.find((u) => u.login === login)?.rank ?? null;
    const rating = pickRating(me.user, game);
    return { elo: rating.elo, rank, wins, losses, winRate: total ? Math.round(wins / total * 100) : 0, streak };
  }, [me, myLogin, matches, leaderboard, game]);

  const openChallengeWith = (player: LeaderboardEntry | null) => {
    setPresetOpp(player);
    setOpenCard('challenge');
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const hasActivity =
    pendingToConfirm.length > 0 ||
    pendingWaiting.length > 0 ||
    ffaToConfirm.length > 0 ||
    ffaWaiting.length > 0 ||
    dartsToConfirm.length > 0 ||
    dartsWaiting.length > 0 ||
    contestableMatches.length > 0 ||
    incoming.length > 0 ||
    accepted.length > 0 ||
    outgoing.length > 0;

  return (
    <Panel title={t('panel.defis.title')} sub={t('panel.defis.sub')} accent="swords">
      <div ref={topRef} />

      {/* ── Stats game-aware (mini bar, toujours visible) ────────────────── */}
      {gameStats && (
        <div className="grid grid-cols-5 gap-2 mb-6">
          <StatCard value={gameStats.rank ? `#${gameStats.rank}` : '—'} label={t('defis.stat.rank')} tone="gold" />
          <StatCard value={String(gameStats.elo)} label={<>ELO <RankedBadge size="xs" /></>} tone="teal" />
          <StatCard value={`${gameStats.wins}-${gameStats.losses}`} label={t('defis.stat.wl')} tone="neutral" />
          <StatCard value={`${gameStats.winRate}%`} label={t('defis.stat.winrate')} tone={gameStats.winRate >= 50 ? 'win' : 'loss'} />
          <StatCard
            value={gameStats.streak > 0 ? `${gameStats.streak}V` : gameStats.streak < 0 ? `${Math.abs(gameStats.streak)}D` : '—'}
            label={t('defis.stat.streak')}
            tone={gameStats.streak > 0 ? 'win' : gameStats.streak < 0 ? 'loss' : 'neutral'}
          />
        </div>
      )}

      {/* ── 0. MATCH ALÉATOIRE (matchmaking queue) ───────────────────────── */}
      <div className="mb-4">
        <MatchmakingButton />
      </div>

      {/* ── 1. HERO CTAs ─────────────────────────────────────────────────── */}
      {/* Les 2 boutons les plus importants du site : toujours au-dessus du pli,
          taille héro, jamais discrets. */}
      <HeroCTAs
        openCard={openCard}
        presetOpp={presetOpp}
        others={others}
        recentOpponents={recentOpponents}
        opponentCounts={opponentCounts}
        myLogin={myLogin}
        myElo={gameStats?.elo}
        isSmash={game === 'smash'}
        isDarts={game === 'flechettes'}
        locations={locations}
        onOpen={(c) => {
          if (c === 'challenge') setPresetOpp(null);
          setOpenCard(c);
        }}
        onClose={() => { setOpenCard(null); setPresetOpp(null); }}
        onDone={refresh}
      />

      {/* ── 2. ACTIVITÉ (flux compact, en dessous des CTAs) ──────────────── */}
      {hasActivity && (
        <ActivityStream
          pendingToConfirm={pendingToConfirm}
          pendingWaiting={pendingWaiting}
          ffaToConfirm={ffaToConfirm}
          ffaWaiting={ffaWaiting}
          dartsToConfirm={dartsToConfirm}
          dartsWaiting={dartsWaiting}
          contestableMatches={contestableMatches}
          incoming={incoming}
          accepted={accepted}
          outgoing={outgoing}
          myLogin={myLogin}
          lang={lang}
          refresh={refresh}
          contestMatch={contestMatch}
          handleAction={handleAction}
          cancelDeclaration={cancelDeclaration}
          confirmFfa={confirmFfa}
          contestFfa={contestFfa}
          cancelFfaDeclaration={cancelFfaDeclaration}
          confirmDarts={confirmDarts}
          contestDarts={contestDarts}
          cancelDartsDeclaration={cancelDartsDeclaration}
          requestAmicableCancel={requestAmicableCancel}
          respondAmicableCancel={respondAmicableCancel}
        />
      )}

      {/* ── 3. POOL COMPLET DE JOUEURS ───────────────────────────────────── */}
      <PlayerPool
        players={others}
        leaderboard={[]}
        game={game}
        onChallenge={openChallengeWith}
        onDeclare={(p) => { setPresetOpp(p); setOpenCard('declare'); }}
      />
    </Panel>
  );
}

// ─── Hero CTAs ────────────────────────────────────────────────────────────────
// Les 2 boutons d'action principaux du site : Déclarer + Défier.
// Fermés : grandes cartes hero avec glow et animation d'entrée.
// Ouverts : expansion pleine largeur avec le flow de saisie intégré.

interface HeroCTAsProps {
  openCard: OpenCard;
  presetOpp: LeaderboardEntry | null;
  others: LeaderboardEntry[];
  recentOpponents: LeaderboardEntry[];
  opponentCounts: Record<string, number>;
  myLogin: string | undefined;
  myElo?: number;
  /** Le mode FFA n'est proposé qu'en Smash. */
  isSmash: boolean;
  /** Le mode Fléchettes n'est proposé qu'en flechettes. */
  isDarts: boolean;
  locations: Map<string, string>;
  onOpen: (card: Exclude<OpenCard, null>) => void;
  onClose: () => void;
  onDone: () => Promise<void>;
}

function HeroCTAs({
  openCard, presetOpp, others, recentOpponents, opponentCounts,
  myLogin, myElo, isSmash, isDarts, locations, onOpen, onClose, onDone,
}: HeroCTAsProps) {
  const { game } = useGameMode();
  const [declareMode, setDeclareMode] = useState<DuelMode>('1v1');
  const [challengeMode, setChallengeMode] = useState<DuelMode>('1v1');
  const [celebration, setCelebration] = useState<{
    teamId: string; teamElo: number;
    player1: { login: string; elo?: number };
    player2: { login: string; imageUrl?: string | null; elo?: number };
  } | null>(null);

  const submitAndClose = async () => { await onDone(); onClose(); };

  // Échap referme la carte ouverte (déclarer une game / défi / ffa / fléchettes) —
  // comme la croix. Phase CAPTURE : sinon un combobox interne (picker d'adversaire)
  // intercepte Escape et bloque la propagation, et la carte ne se ferme jamais.
  useEffect(() => {
    if (openCard === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [openCard, onClose]);

  const submit2v2AndClose = async (result: Declare2v2Response, partnerLogin: string) => {
    await onDone();
    onClose();
    if (result.myTeamIsNew && myLogin) {
      const partnerEntry =
        others.find((p) => p.login === partnerLogin) ??
        recentOpponents.find((p) => p.login === partnerLogin);
      setCelebration({
        teamId: result.myTeamId,
        teamElo: result.myTeamElo ?? Math.round(
          Math.max(myElo ?? 1000, partnerEntry?.elo ?? 1000) * 0.65 +
          Math.min(myElo ?? 1000, partnerEntry?.elo ?? 1000) * 0.35,
        ),
        player1: { login: myLogin, elo: myElo },
        player2: { login: partnerLogin, imageUrl: partnerEntry?.imageUrl, elo: partnerEntry?.elo },
      });
    }
  };

  return (
    <>
    {celebration && (
      <NewTeamCelebration
        teamId={celebration.teamId}
        teamElo={celebration.teamElo}
        player1={celebration.player1}
        player2={celebration.player2}
        onClose={() => setCelebration(null)}
      />
    )}
    <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
      {/* Seule la carte sélectionnée s'anime, via le morph `layoutId` (bouton ↔
          panneau). Les autres cartes n'ont PAS d'animation d'opacité d'entrée/
          sortie : sinon, combinées au `popLayout` (qui les repositionne dans un
          portail le temps de la sortie), elles clignotent à chaque ouverture/
          fermeture. Elles apparaissent/disparaissent donc instantanément pendant
          que la carte choisie se redimensionne. initial={false} évite en plus que
          le morph rejoue à chaque visite de la page. */}
      <AnimatePresence initial={false}>
        {(openCard === null || openCard === 'declare') && (
          <HeroCTACard
            key="declare"
            kind="declare"
            expanded={openCard === 'declare'}
            onOpen={() => onOpen('declare')}
            onClose={onClose}
          >
            <Mode1v1Toggle mode={declareMode} onChange={setDeclareMode} game={game} className="mb-4" />
            {declareMode === '2v2' && game === 'babyfoot' ? (
              <Declare2v2GameFlow
                variant="desktop"
                others={others}
                recentOpponents={recentOpponents}
                opponentCounts={opponentCounts}
                myLogin={myLogin}
                myElo={myElo}
                locations={locations}
                onSubmitted={submit2v2AndClose}
              />
            ) : (
              <DeclareGameFlow
                variant="desktop"
                others={others}
                recentOpponents={recentOpponents}
                opponentCounts={opponentCounts}
                myLogin={myLogin}
                locations={locations}
                onSubmitted={submitAndClose}
              />
            )}
          </HeroCTACard>
        )}

        {(openCard === null || openCard === 'challenge') && (
          <HeroCTACard
            key="challenge"
            kind="challenge"
            expanded={openCard === 'challenge'}
            onOpen={() => onOpen('challenge')}
            onClose={onClose}
          >
            {/* Pas de toggle si un adversaire est pré-imposé (défi 1v1 ciblé). */}
            {!presetOpp && (
              <Mode1v1Toggle mode={challengeMode} onChange={setChallengeMode} game={game} className="mb-4" />
            )}
            {challengeMode === '2v2' && game === 'babyfoot' && !presetOpp ? (
              <Challenge2v2Flow
                variant="desktop"
                others={others}
                recentOpponents={recentOpponents}
                opponentCounts={opponentCounts}
                myLogin={myLogin}
                locations={locations}
                onSubmitted={submitAndClose}
              />
            ) : (
              <ChallengeFlow
                key={presetOpp?.login ?? 'free'}
                variant="desktop"
                others={others}
                recentOpponents={recentOpponents}
                opponentCounts={opponentCounts}
                myLogin={myLogin}
                locations={locations}
                presetOpponent={presetOpp}
                onSubmitted={submitAndClose}
              />
            )}
          </HeroCTACard>
        )}

        {/* FFA — uniquement en Smash. */}
        {isSmash && (openCard === null || openCard === 'ffa') && (
          <HeroCTACard
            key="ffa"
            kind="ffa"
            expanded={openCard === 'ffa'}
            onOpen={() => onOpen('ffa')}
            onClose={onClose}
          >
            <DeclareFfaGameFlow
              variant="desktop"
              others={others}
              recentOpponents={recentOpponents}
              opponentCounts={opponentCounts}
              myLogin={myLogin}
              myElo={myElo}
              locations={locations}
              onSubmitted={submitAndClose}
            />
          </HeroCTACard>
        )}

        {/* Fléchettes — uniquement en flechettes. */}
        {isDarts && (openCard === null || openCard === 'darts') && (
          <HeroCTACard
            key="darts"
            kind="darts"
            expanded={openCard === 'darts'}
            onOpen={() => onOpen('darts')}
            onClose={onClose}
          >
            <DeclareDartsGameFlow
              variant="desktop"
              others={others}
              recentOpponents={recentOpponents}
              opponentCounts={opponentCounts}
              myLogin={myLogin}
              myElo={myElo}
              locations={locations}
              onSubmitted={submitAndClose}
            />
          </HeroCTACard>
        )}
      </AnimatePresence>
    </motion.div>
    </>
  );
}

const CTA_META = {
  declare: {
    Icon: Plus,
    labelKey: 'defis.cta.declare',
    subKey: 'defis.cta.declare.sub',
    gradient: 'from-gold/25 via-gold/8 to-transparent',
    border: 'border-gold/50 hover:border-gold',
    glow: '0 0 36px rgba(255,201,74,0.22)',
    iconBg: 'bg-gold/20',
    accent: 'text-gold',
  },
  challenge: {
    Icon: Swords,
    labelKey: 'defis.cta.challenge',
    subKey: 'defis.cta.challenge.sub',
    gradient: 'from-accent/20 via-accent/6 to-transparent',
    border: 'border-accent/50 hover:border-accent',
    glow: '0 0 36px rgba(var(--accent-gold),0.20)',
    iconBg: 'bg-accent/20',
    accent: 'text-accent',
  },
  ffa: {
    Icon: Users,
    labelKey: 'ffa.cta.title',
    subKey: 'ffa.cta.sub',
    gradient: 'from-red/20 via-red/6 to-transparent',
    border: 'border-red/50 hover:border-red',
    glow: '0 0 36px rgba(255,83,102,0.20)',
    iconBg: 'bg-red/20',
    accent: 'text-red',
  },
  // Fléchettes : accent teal #14b8a6 (différent du token "teal" du thème qui est ambré).
  darts: {
    Icon: Target,
    labelKey: 'darts.cta.title',
    subKey: 'darts.cta.sub',
    gradient: 'from-[#14b8a6]/20 via-[#14b8a6]/6 to-transparent',
    border: 'border-[#14b8a6]/50 hover:border-[#14b8a6]',
    glow: '0 0 36px rgba(20,184,166,0.20)',
    iconBg: 'bg-[#14b8a6]/20',
    accent: 'text-[#14b8a6]',
  },
} as const;

interface HeroCTACardProps {
  kind: keyof typeof CTA_META;
  expanded: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
}

function HeroCTACard({ kind, expanded, onOpen, onClose, children }: HeroCTACardProps) {
  const t = useT();
  const meta = CTA_META[kind];
  const Icon = meta.Icon;
  const label = t(meta.labelKey);
  const sub = t(meta.subKey);

  if (!expanded) {
    // NB : `transition-colors` (et NON `transition-all`) — la carte porte le morph
    // `layoutId`, donc Framer Motion pilote son `transform` à chaque frame. Un
    // `transition: all` ferait re-transitionner ce transform par le navigateur en
    // parallèle du ressort → conflit visible (saccades / à-coups). On limite donc la
    // transition CSS à la couleur de bordure (seul état hover de la carte).
    return (
      <motion.button
        layoutId={`hero-cta-${kind}`}
        transition={{
          layout: { type: 'spring', stiffness: 440, damping: 40, mass: 0.9 },
        }}
        type="button"
        onClick={onOpen}
        className={`shine group relative overflow-hidden rounded-2xl border-2 ${meta.border}
          bg-gradient-to-br from-bg-2/80 to-bg-1/90
          flex items-center gap-5 px-7 py-6
          transition-colors duration-300 text-left
          ${kind === 'ffa' || kind === 'darts' ? 'md:col-span-2 md:w-[calc(50%-0.5rem)] md:mx-auto' : ''}`}
        style={{ boxShadow: meta.glow }}
      >
        {/* Gradient d'accent en background */}
        <div className={`absolute inset-0 bg-gradient-to-br ${meta.gradient} opacity-60 pointer-events-none`} />
        {/* Filet doré en haut */}
        <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-gold/50 to-transparent pointer-events-none" />

        {/* Icône grande et ronde */}
        <span
          className={`relative flex-shrink-0 flex items-center justify-center w-16 h-16 rounded-2xl ${meta.iconBg}
            group-hover:scale-110 transition-transform duration-300`}
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,247,228,0.18)' }}
        >
          <Icon className={`w-8 h-8 ${meta.accent}`} strokeWidth={2.2} />
        </span>

        {/* Texte */}
        <span className="relative min-w-0 flex-1">
          <span className={`block font-display text-xl font-black tracking-tight ${meta.accent} leading-none mb-1.5`}>
            {label}
          </span>
          <span className="block text-[11px] text-muted-2 font-medium uppercase tracking-[0.16em]">
            {sub}
          </span>
        </span>

        {/* Flèche */}
        <span className={`relative ${meta.accent} opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all`}>
          →
        </span>
      </motion.button>
    );
  }

  return (
    <motion.div
      layoutId={`hero-cta-${kind}`}
      transition={{
        layout: { type: 'spring', stiffness: 440, damping: 40, mass: 0.9 },
      }}
      className="relative md:col-span-2 card-hud border-gold/40 rounded-2xl p-6 min-h-[460px] flex flex-col"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(255,201,74,0.18), transparent 70%)',
        boxShadow:
          '0 18px 48px rgba(0,0,0,0.5), 0 0 36px rgba(255,201,74,0.15), inset 0 1px 0 rgba(255,215,120,0.1)',
      }}
    >
      <div className="relative flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${meta.accent}`} strokeWidth={2.5} />
          <span className={`font-display text-base font-black ${meta.accent}`}>
            {label}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('defis.close')}
          className="text-muted hover:text-text-strong transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
        >
          <X className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </div>
      <div className="relative w-full max-w-md mx-auto flex-1">{children}</div>
    </motion.div>
  );
}

// ─── Flux d'activité (compact) ───────────────────────────────────────────────
// Regroupé dans une section dépliable pour ne pas écraser les CTAs.

interface ActivityStreamProps {
  pendingToConfirm: PendingMatch[];
  pendingWaiting: PendingMatch[];
  ffaToConfirm: PendingFfa[];
  ffaWaiting: PendingFfa[];
  dartsToConfirm: PendingFfa[];
  dartsWaiting: PendingFfa[];
  contestableMatches: PlayedMatch[];
  incoming: Challenge[];
  accepted: Challenge[];
  outgoing: Challenge[];
  myLogin: string | undefined;
  lang: Lang;
  refresh: () => Promise<void>;
  contestMatch: (id: string, reason: 'never_played' | 'wrong_score', message: string) => Promise<void>;
  handleAction: (id: string, action: 'accept' | 'decline') => Promise<void>;
  cancelDeclaration: (match: PendingMatch) => void;
  confirmFfa: (id: string, position: number) => Promise<void>;
  contestFfa: (id: string, claimedPosition: number, message?: string) => Promise<void>;
  cancelFfaDeclaration: (id: string) => Promise<void>;
  confirmDarts: (id: string, remaining: number) => Promise<void>;
  contestDarts: (id: string, claimedRemaining: number, message?: string) => Promise<void>;
  cancelDartsDeclaration: (id: string) => Promise<void>;
  requestAmicableCancel: (id: string) => Promise<void>;
  respondAmicableCancel: (id: string, accept: boolean) => Promise<void>;
}

function ActivityStream({
  pendingToConfirm, pendingWaiting, ffaToConfirm, ffaWaiting,
  dartsToConfirm, dartsWaiting, contestableMatches, incoming, accepted, outgoing,
  myLogin, lang, refresh, contestMatch, handleAction, cancelDeclaration,
  confirmFfa, contestFfa, cancelFfaDeclaration,
  confirmDarts, contestDarts, cancelDartsDeclaration,
  requestAmicableCancel, respondAmicableCancel,
}: ActivityStreamProps) {
  const t = useT();
  const urgentCount = pendingToConfirm.length + ffaToConfirm.length + dartsToConfirm.length + contestableMatches.length + incoming.length;

  return (
    <div className="mb-8">
      {/* Header — même DA que PlayerPool */}
      <div className="flex items-center gap-3 mb-4">
        <div className="font-gaming text-[10px] uppercase tracking-[0.18em] text-gold/80 font-extrabold flex items-center gap-2">
          <span className="inline-block w-1 h-2.5 bg-gradient-to-b from-gold to-gold-dim rounded-sm" />
          {t('defis.activity')}
          {urgentCount > 0 && (
            <span className="font-mono text-gold bg-gold/15 normal-case tracking-normal px-1.5 py-0.5 rounded-full text-[9px]">
              {urgentCount}
            </span>
          )}
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-gold/20 to-transparent" />
      </div>

      <div className="space-y-4">
        {pendingToConfirm.length > 0 && (
          <ActivityGroup label={t('defis.toConfirm')} badge={pendingToConfirm.length} urgent>
            {pendingToConfirm.map((p) => (
              <PendingConfirmRow key={p.id} match={p} onDone={refresh} />
            ))}
          </ActivityGroup>
        )}
        {ffaToConfirm.length > 0 && (
          <ActivityGroup label={t('ffa.toConfirm')} badge={ffaToConfirm.length} urgent>
            {ffaToConfirm.map((f) => (
              <FfaConfirmRow key={f.id} ffa={f} myLogin={myLogin} onConfirm={confirmFfa} onContest={contestFfa} />
            ))}
          </ActivityGroup>
        )}
        {dartsToConfirm.length > 0 && (
          <ActivityGroup label={t('darts.toConfirm')} badge={dartsToConfirm.length} urgent>
            {dartsToConfirm.map((d) => (
              <DartsConfirmRow key={d.id} darts={d} myLogin={myLogin} onConfirm={confirmDarts} onContest={contestDarts} />
            ))}
          </ActivityGroup>
        )}
        {contestableMatches.length > 0 && (
          <ActivityGroup label={t('defis.contestable.title')} badge={contestableMatches.length} urgent>
            {contestableMatches.map((m) => (
              <ContestableRow key={m.id} match={m} onContest={contestMatch} />
            ))}
          </ActivityGroup>
        )}
        {incoming.length > 0 && (
          <ActivityGroup label={t('defis.received')} badge={incoming.length} urgent>
            {incoming.map((c) => (
              <ChallengeRow key={c.id} challenge={c} kind="incoming" myLogin={myLogin} lang={lang}
                onAccept={() => handleAction(c.id, 'accept')}
                onDecline={() => handleAction(c.id, 'decline')} />
            ))}
          </ActivityGroup>
        )}
        {accepted.length > 0 && (
          <ActivityGroup label={t('defis.scheduledDuels')} badge={accepted.length}>
            {accepted.map((c) => (
              <ChallengeRow key={c.id} challenge={c} kind="accepted" myLogin={myLogin} lang={lang}
                onAccept={NOOP}
                onDecline={() => handleAction(c.id, 'decline')}
                onAmicableRequest={() => requestAmicableCancel(c.id)}
                onAmicableRespond={(accept) => respondAmicableCancel(c.id, accept)} />
            ))}
          </ActivityGroup>
        )}
        {outgoing.length > 0 && (
          <ActivityGroup label={t('defis.sent')} badge={outgoing.length}>
            {outgoing.map((c) => (
              <ChallengeRow key={c.id} challenge={c} kind="outgoing" myLogin={myLogin} lang={lang}
                onAccept={NOOP}
                onDecline={() => handleAction(c.id, 'decline')} />
            ))}
          </ActivityGroup>
        )}
        {pendingWaiting.length > 0 && (
          <ActivityGroup label={t('defis.waitingConfirm')} badge={pendingWaiting.length}>
            {pendingWaiting.map((p) => (
              <PendingWaitRow key={p.id} match={p} onCancel={() => cancelDeclaration(p)} />
            ))}
          </ActivityGroup>
        )}
        {ffaWaiting.length > 0 && (
          <ActivityGroup label={t('ffa.waiting')} badge={ffaWaiting.length}>
            {ffaWaiting.map((f) => (
              <FfaWaitRow key={f.id} ffa={f} myLogin={myLogin} onCancel={cancelFfaDeclaration} />
            ))}
          </ActivityGroup>
        )}
        {dartsWaiting.length > 0 && (
          <ActivityGroup label={t('darts.waiting')} badge={dartsWaiting.length}>
            {dartsWaiting.map((d) => (
              <DartsWaitRow key={d.id} darts={d} myLogin={myLogin} onCancel={cancelDartsDeclaration} />
            ))}
          </ActivityGroup>
        )}
      </div>
    </div>
  );
}

function ActivityGroup({ label, badge, urgent = false, children }: {
  label: string; badge: number; urgent?: boolean; children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-gaming text-[9px] uppercase tracking-[0.16em] font-extrabold text-muted-2">{label}</span>
        <span className={`text-[9px] font-mono font-extrabold px-1.5 py-0.5 rounded-full ${urgent ? 'text-gold bg-gold/15' : 'text-muted bg-bg-2'}`}>
          {badge}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// ─── Pool complet de joueurs ──────────────────────────────────────────────────
// Tous les joueurs, triés par rang, avec ELO + WR + boutons d'action.

interface PlayerPoolProps {
  players: LeaderboardEntry[];
  leaderboard: LeaderboardEntry[];
  game: Game;
  onChallenge: (player: LeaderboardEntry) => void;
  onDeclare: (player: LeaderboardEntry) => void;
}

function PlayerPool({ players, leaderboard: _lb, game: _game, onChallenge, onDeclare }: PlayerPoolProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const filtered = query.trim()
    ? players.filter((p) => p.login.toLowerCase().includes(query.trim().toLowerCase()))
    : players;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="font-gaming text-[10px] uppercase tracking-[0.18em] text-gold/80 font-extrabold flex items-center gap-2">
          <span className="inline-block w-1 h-2.5 bg-gradient-to-b from-gold to-gold-dim rounded-sm" />
          {t('defis.pool')}
          <span className="font-mono text-muted-2 normal-case tracking-normal">
            · {players.length} {t('defis.poolCount')}
          </span>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-gold/20 to-transparent" />
        {/* Mini recherche */}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('defis.filter')}
          className="w-36 px-3 py-1.5 bg-bg-1 border border-border rounded-lg text-xs font-medium focus:border-gold outline-none text-text-strong placeholder:text-muted tap-transparent allow-select transition-all"
        />
      </div>

      {players.length === 0 ? (
        <div className="text-center text-muted-2 py-8 text-sm">{t('defis.empty')}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {filtered.map((u) => (
            <PlayerCard
              key={u.login}
              player={u}
              onChallenge={onChallenge}
              onDeclare={onDeclare}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerCard({
  player,
  onChallenge,
  onDeclare,
}: {
  player: LeaderboardEntry;
  onChallenge: (p: LeaderboardEntry) => void;
  onDeclare: (p: LeaderboardEntry) => void;
}) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const isSheldon = isSheldonTitle(player.title);
  return (
    <div
      className="relative rounded-xl p-3 hover-glow flex items-center gap-3 group overflow-hidden"
      style={isSheldon ? {
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: `${SHELDON_COLORS.slime}40`,
        background: `linear-gradient(135deg, #0d1d0d 0%, #071007 55%, #0a140a 100%)`,
        boxShadow: `0 0 0 1px ${SHELDON_COLORS.slime}1a, 0 4px 16px -4px ${SHELDON_COLORS.slime}30`,
      } : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!isSheldon && <span className="absolute inset-0 card-hud rounded-xl pointer-events-none" />}
      <SheldonApostleAura active={isSheldon} count={5} />

      {/* Liseré supérieur */}
      <span
        className="absolute top-0 left-3 right-3 h-[1px] pointer-events-none"
        style={isSheldon
          ? { background: `linear-gradient(90deg, transparent, ${SHELDON_COLORS.slime}66, transparent)` }
          : { background: 'linear-gradient(90deg, transparent, rgba(255,201,74,0.25), transparent)' }
        }
      />

      {/* Rang */}
      <span className="relative w-8 flex-shrink-0 text-center font-mono font-extrabold tabular-nums text-sm text-muted-2">
        #{player.rank}
      </span>

      {/* Avatar + infos */}
      <PlayerLink login={player.login} className="relative flex-1 min-w-0">
        <Avatar login={player.login} imageUrl={player.imageUrl} size="md" />
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold truncate text-text-strong text-sm">{player.login}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="font-extrabold font-mono tabular-nums text-[11px]"
              style={isSheldon ? { color: SHELDON_COLORS.bile } : { color: 'var(--color-gold)' }}
            >{player.elo}</span>
            <span className="text-[10px] text-muted-2">ELO</span>
          </div>
        </div>
      </PlayerLink>

      {/* Boutons d'action (visibles au hover) */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.15 }}
            className="relative flex items-center gap-1.5 flex-shrink-0"
          >
            <button
              type="button"
              onClick={() => onDeclare(player)}
              title={t('defis.declarePastGame')}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-2 hover:text-gold hover:bg-gold/10 transition-colors"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => onChallenge(player)}
              title={t('defis.challengeThisPlayer')}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-2 hover:text-accent hover:bg-accent/10 transition-colors"
            >
              <Swords className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Ligne de match en attente de confirmation ────────────────────────────────

function PendingConfirmRow({ match, onDone }: { match: PendingMatch; onDone: () => Promise<void> }) {
  const t = useT();
  const flash = useFlash();
  const { isOpsDuel } = useOpsStatus();
  const isOps = match.mode !== '2v2' && isOpsDuel(match.declarerLogin, match.opponentLogin, match.declaredAt);
  const [contesting, setContesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState(false);
  const iWon = match.scoreOpponent > match.scoreDeclarer;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await api.confirmMatch(match.id, match.scoreOpponent, match.scoreDeclarer, {
        game: match.game,
        bestOf: match.bestOf as 3 | 5 | undefined,
      });
      flash.show(t('defis.matchConfirmed'));
      setResolved(true);
      await onDone();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      setBusy(false);
    }
  };

  // 2v2 : confirmation de présence (pas de re-saisie de score). Le settlement ne
  // se déclenche que lorsque les 3 non-déclarants ont confirmé.
  const handleConfirm2v2 = async () => {
    setBusy(true);
    try {
      const res = await api.confirm2v2Match(match.id);
      if ('status' in res && res.status === 'waiting') {
        flash.show(`${res.confirmed}/3 joueurs ont confirmé — en attente des autres`);
        setBusy(false);
      } else {
        flash.show(t('defis.matchConfirmed'));
        setResolved(true);
        await onDone();
      }
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      setBusy(false);
    }
  };

  const handleContestSubmit = async (reason: 'never_played' | 'wrong_score', message: string) => {
    setContesting(false);
    setBusy(true);
    try {
      await api.rejectMatch(match.id, reason, message);
      flash.show(t('defis.contestSent'));
      setResolved(true);
      await onDone();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      setBusy(false);
    }
  };

  if (resolved) return null;

  const is2v2 = match.mode === '2v2';
  const confirmed2v2 = [match.partner1Confirmed, match.opp1Confirmed, match.opp2Confirmed].filter(Boolean).length;

  return (
    <>
      <div className={`relative rounded-xl p-3 border border-gold/40 bg-gold/[0.05] animate-pop flex flex-wrap items-center gap-2.5 ${isOps ? 'ops-duel' : ''}`}>
        <Zap className="w-4 h-4 text-gold flex-shrink-0" strokeWidth={2.5} fill="rgba(255,201,74,0.4)" />
        <PlayerLink login={match.declarerLogin} className="font-semibold text-gold text-sm">
          {match.declarerLogin}
        </PlayerLink>
        <span className="text-muted-2 text-sm">{t('defis.declared')}</span>
        {is2v2 && (
          <>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-[0.14em] bg-red/15 text-red border border-red/30">
              2 vs 2
            </span>
            <span className="text-[11px] font-semibold">
              <span className="text-gold">{match.declarerLogin} &amp; {match.partner1Login}</span>
              <span className="text-muted-2"> vs </span>
              <span>{match.opponentLogin} &amp; {match.partner2Login}</span>
            </span>
          </>
        )}
        <span className="font-mono font-extrabold tabular-nums text-text-strong text-sm">
          {match.scoreDeclarer}
          <span className="text-muted mx-1">–</span>
          {match.scoreOpponent}
        </span>
        {is2v2 ? (
          <span className="text-[10px] font-bold text-muted">{confirmed2v2}/3 ✓</span>
        ) : (
          <>
            <GameTag game={match.game} />
            <span className="text-[10px] text-muted bg-bg-2 px-1.5 py-0.5 rounded">{t('defis.themYou')}</span>
            <span className="text-[11px] text-muted-2 hidden sm:inline">
              → {t('defis.youHave')} {iWon ? t('defis.won') : t('defis.lost')}
            </span>
          </>
        )}
        {/* Cooldown 48h : passé ce délai sans réponse, le match est auto-validé. */}
        <Cooldown
          from={match.declaredAt}
          label={t('defis.cooldown.autoValidateIn')}
          expiredLabel={t('defis.cooldown.autoValidating')}
        />
        <div className="ml-auto flex gap-2">
          <Button size="sm" loading={busy} onClick={is2v2 ? handleConfirm2v2 : handleConfirm}>{t('defis.confirmCheck')}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setContesting(true)}
            className="text-red border-red/30 hover:border-red hover:bg-red/5 hover:text-red">
            {t('defis.contest')}
          </Button>
        </div>
      </div>
      {contesting && (
        <ContestModal
          declarerLogin={match.declarerLogin}
          score={`${match.scoreDeclarer}–${match.scoreOpponent}`}
          busy={busy}
          onSubmit={handleContestSubmit}
          onClose={() => setContesting(false)}
        />
      )}
    </>
  );
}

// ─── Ligne de match AUTO-VALIDÉ à contester (a posteriori) ───────────────────
// Match déclaré confirmé automatiquement après 48h sans réponse de l'adversaire :
// le résultat compte déjà, mais l'adversaire peut encore ouvrir un litige (qui part
// en arbitrage, sans annuler l'ELO automatiquement).
function ContestableRow({
  match,
  onContest,
}: {
  match: PlayedMatch;
  onContest: (id: string, reason: 'never_played' | 'wrong_score', message: string) => Promise<void>;
}) {
  const t = useT();
  const [contesting, setContesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const decl = match.autoConfirmDeclarerLogin ?? match.playerALogin;
  // Score en perspective déclarant (les côtés A/B suivent l'ordre canonique).
  const declSideIsA = decl === match.playerALogin || decl === match.playerA2Login;
  const scoreDeclarer = declSideIsA ? match.scoreA : match.scoreB;
  const scoreOpponent = declSideIsA ? match.scoreB : match.scoreA;
  const iWon = scoreOpponent > scoreDeclarer;

  const handleSubmit = async (reason: 'never_played' | 'wrong_score', message: string) => {
    setContesting(false);
    setBusy(true);
    try {
      await onContest(match.id, reason, message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="relative rounded-xl p-3 border border-amber-500/40 bg-amber-500/[0.05] flex flex-wrap items-center gap-2.5">
        <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" strokeWidth={2.5} />
        <PlayerLink login={decl} className="font-semibold text-amber-300 text-sm">{decl}</PlayerLink>
        <span className="text-muted-2 text-sm">{t('defis.declared')}</span>
        <span className="font-mono font-extrabold tabular-nums text-text-strong text-sm">
          {scoreDeclarer}
          <span className="text-muted mx-1">–</span>
          {scoreOpponent}
        </span>
        <GameTag game={match.game} />
        <span className="text-[11px] text-muted-2 hidden sm:inline">
          → {t('defis.youHave')} {iWon ? t('defis.won') : t('defis.lost')}
        </span>
        <span className="text-[10px] text-amber-300/80 italic hidden md:inline">{t('defis.contestable.hint')}</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setContesting(true)}
            className="text-red border-red/30 hover:border-red hover:bg-red/5 hover:text-red">
            {t('defis.contestable.contest')}
          </Button>
        </div>
      </div>
      {contesting && (
        <ContestModal
          declarerLogin={decl}
          score={`${scoreDeclarer}–${scoreOpponent}`}
          busy={busy}
          onSubmit={handleSubmit}
          onClose={() => setContesting(false)}
        />
      )}
    </>
  );
}

function PendingWaitRow({ match, onCancel }: { match: PendingMatch; onCancel: () => void }) {
  const t = useT();
  const { isOpsDuel } = useOpsStatus();
  const isOps = match.mode !== '2v2' && isOpsDuel(match.declarerLogin, match.opponentLogin, match.declaredAt);
  // 2v2 : on attend la validation des 3 autres joueurs — on affiche la
  // composition complète (mon duo vs duo adverse) + l'avancée des confirmations.
  if (match.mode === '2v2') {
    const confirmed = [match.partner1Confirmed, match.opp1Confirmed, match.opp2Confirmed].filter(Boolean).length;
    return (
      <div className="rounded-xl p-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm border border-border/50 bg-white/[0.02]">
        <Clock className="w-4 h-4 text-muted-2 flex-shrink-0" strokeWidth={2} />
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-[0.14em] bg-red/15 text-red border border-red/30">
          2 vs 2
        </span>
        <span className="font-semibold">
          <PlayerLink login={match.declarerLogin} className="text-gold">{match.declarerLogin}</PlayerLink>
          <span className="text-muted-2"> &amp; </span>
          {match.partner1Login && (
            <PlayerLink login={match.partner1Login} className="text-gold">{match.partner1Login}</PlayerLink>
          )}
        </span>
        <span className="text-muted-2 text-xs">vs</span>
        <span className="font-semibold">
          <PlayerLink login={match.opponentLogin}>{match.opponentLogin}</PlayerLink>
          <span className="text-muted-2"> &amp; </span>
          {match.partner2Login && <PlayerLink login={match.partner2Login}>{match.partner2Login}</PlayerLink>}
        </span>
        <span className="font-mono font-extrabold tabular-nums text-text-strong">
          {match.scoreDeclarer}
          <span className="text-muted mx-1">–</span>
          {match.scoreOpponent}
        </span>
        <span className="text-[10px] font-bold text-muted">{confirmed}/3 ✓</span>
        <span className="ml-auto text-[10px] text-muted italic">{t('defis.waitingConfirmEllipsis')}</span>
        <button type="button" onClick={onCancel}
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-2 hover:text-red hover:bg-red/10 transition-colors"
          title={t('defis.cancel')} aria-label={t('defis.cancel')}>
          <X className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </div>
    );
  }
  return (
    <div className={`rounded-xl p-3 flex flex-wrap items-center gap-2 text-sm border border-border/50 bg-white/[0.02] ${isOps ? 'ops-duel' : ''}`}>
      <Clock className="w-4 h-4 text-muted-2 flex-shrink-0" strokeWidth={2} />
      <span className="text-muted-2">{t('defis.waitingFor')}</span>
      <PlayerLink login={match.opponentLogin} className="font-semibold">{match.opponentLogin}</PlayerLink>
      <span className="font-mono font-extrabold tabular-nums text-text-strong">
        {match.scoreDeclarer}
        <span className="text-muted mx-1">–</span>
        {match.scoreOpponent}
      </span>
      <GameTag game={match.game} />
      <span className="ml-auto text-[10px] text-muted italic">{t('defis.waitingConfirmEllipsis')}</span>
      <button type="button" onClick={onCancel}
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-2 hover:text-red hover:bg-red/10 transition-colors"
        title={t('defis.cancel')} aria-label={t('defis.cancel')}>
        <X className="w-4 h-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

// ─── FFA Smash : lignes d'activité ────────────────────────────────────────────

/** Récapitulatif compact du classement proposé : « 1.@a 2.@b … » (ma place en or). */
function FfaRankingInline({ ffa, myLogin }: { ffa: PendingFfa; myLogin: string | undefined }) {
  const ordered = [...ffa.participants].sort((a, b) => a.position - b.position);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
      {ordered.map((p) => (
        <span key={p.login} className={p.login === myLogin ? 'text-gold font-extrabold' : 'text-muted-2'}>
          <span className="font-mono">{p.position}.</span>
          {p.login}
          {p.confirmed && <span className="text-teal ml-0.5">✓</span>}
        </span>
      ))}
    </span>
  );
}

function FfaConfirmRow({
  ffa, myLogin, onConfirm, onContest,
}: {
  ffa: PendingFfa;
  myLogin: string | undefined;
  onConfirm: (id: string, position: number) => Promise<void>;
  onContest: (id: string, claimedPosition: number, message?: string) => Promise<void>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [contesting, setContesting] = useState(false);
  const mine = ffa.participants.find((p) => p.login === myLogin);
  const confirmedCount = ffa.participants.filter((p) => p.confirmed).length;
  const total = ffa.participants.length;
  if (!mine) return null;

  return (
    <>
      <div className="relative rounded-xl p-3 border border-gold/40 bg-gold/[0.05] animate-pop flex flex-wrap items-center gap-2.5">
        <Users className="w-4 h-4 text-gold flex-shrink-0" strokeWidth={2.5} />
        <PlayerLink login={ffa.declarerLogin} className="font-semibold text-gold text-sm">
          {ffa.declarerLogin}
        </PlayerLink>
        <span className="text-muted-2 text-sm">{t('ffa.placedYou')}</span>
        <span className="font-mono font-extrabold tabular-nums text-text-strong text-sm">
          {t('ffa.positionShort')}{mine.position}
        </span>
        <GameTag game="smash" />
        <span className="text-[10px] text-muted bg-bg-2 px-1.5 py-0.5 rounded font-mono">{confirmedCount}/{total}</span>
        <FfaRankingInline ffa={ffa} myLogin={myLogin} />
        <div className="ml-auto flex gap-2">
          <Button size="sm" loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(ffa.id, mine.position); } finally { setBusy(false); } }}>
            {t('ffa.confirmPlace')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setContesting(true)}
            className="text-red border-red/30 hover:border-red hover:bg-red/5 hover:text-red">
            {t('ffa.contest')}
          </Button>
        </div>
      </div>
      {contesting && (
        <FfaContestModal
          ffa={ffa}
          myPosition={mine.position}
          onSubmit={async (claimed, msg) => { setContesting(false); setBusy(true); try { await onContest(ffa.id, claimed, msg); } finally { setBusy(false); } }}
          onClose={() => setContesting(false)}
        />
      )}
    </>
  );
}

function FfaWaitRow({
  ffa, myLogin, onCancel,
}: {
  ffa: PendingFfa;
  myLogin: string | undefined;
  onCancel: (id: string) => Promise<void>;
}) {
  const t = useT();
  const confirmedCount = ffa.participants.filter((p) => p.confirmed).length;
  const total = ffa.participants.length;
  const isDeclarer = ffa.declarerLogin === myLogin;
  return (
    <div className="rounded-xl p-3 flex flex-wrap items-center gap-2 text-sm border border-border/50 bg-white/[0.02]">
      <Clock className="w-4 h-4 text-muted-2 flex-shrink-0" strokeWidth={2} />
      <span className="text-muted-2">{t('ffa.waitingFor')}</span>
      <span className="font-mono font-extrabold text-text-strong">{confirmedCount}/{total}</span>
      <GameTag game="smash" />
      <FfaRankingInline ffa={ffa} myLogin={myLogin} />
      <span className="ml-auto text-[10px] text-muted italic">{t('defis.waitingConfirmEllipsis')}</span>
      {isDeclarer && (
        <button type="button" onClick={() => onCancel(ffa.id)}
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-2 hover:text-red hover:bg-red/10 transition-colors"
          title={t('defis.cancel')} aria-label={t('defis.cancel')}>
          <X className="w-4 h-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

/** Modale de contestation FFA : le joueur revendique sa VRAIE position (annule le FFA). */
function FfaContestModal({
  ffa, myPosition, onSubmit, onClose,
}: {
  ffa: PendingFfa;
  myPosition: number;
  onSubmit: (claimedPosition: number, message?: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const total = ffa.participants.length;
  const [claimed, setClaimed] = useState(myPosition);
  const [message, setMessage] = useState('');

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/70 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-red/40 bg-bg-1 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-extrabold text-text-strong mb-1">{t('ffa.contest.title')}</div>
        <p className="text-[11px] text-muted-2 mb-4 leading-relaxed">{t('ffa.contest.sub')}</p>

        <div className="text-[10px] uppercase tracking-wider font-bold text-muted mb-2">{t('ffa.contest.yourPlace')}</div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {Array.from({ length: total }, (_, i) => i + 1).map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => setClaimed(pos)}
              className={`w-9 h-9 rounded-lg font-mono font-extrabold text-sm transition-colors ${
                claimed === pos ? 'bg-gold text-[#1a1100]' : 'bg-bg-2 text-muted-2 hover:bg-bg-2/70'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          placeholder={t('ffa.contest.messagePlaceholder')}
          className="w-full h-20 px-3 py-2 bg-bg-2 border border-border rounded-lg text-xs resize-none focus:border-red outline-none text-text-strong placeholder:text-muted mb-4"
        />

        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} className="flex-1">{t('defis.confirm.keep')}</Button>
          <Button size="sm" variant="danger" onClick={() => onSubmit(claimed, message.trim() || undefined)} className="flex-1">
            {t('ffa.contest.submit')}
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}

// ─── Fléchettes (301/501) : lignes d'activité ─────────────────────────────────
// Réutilise le modèle FFA mais affiche les POINTS RESTANTS de chaque joueur
// (remaining) au lieu d'une position. Le vainqueur a remaining===0 → 🏆.
// Accent teal #14b8a6.

const DARTS_TEAL = '#14b8a6';

/** Récapitulatif compact : « @a 0🏆 @b 42 … » (mon reste en teal). */
function DartsRemainingInline({ darts, myLogin }: { darts: PendingFfa; myLogin: string | undefined }) {
  // Trié par reste croissant (le vainqueur, reste 0, en premier).
  const ordered = [...darts.participants].sort(
    (a, b) => (a.remaining ?? Infinity) - (b.remaining ?? Infinity),
  );
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
      {ordered.map((p) => (
        <span
          key={p.login}
          className={p.login === myLogin ? 'font-extrabold' : 'text-muted-2'}
          style={p.login === myLogin ? { color: DARTS_TEAL } : undefined}
        >
          {p.login}
          <span className="font-mono ml-0.5">{p.remaining ?? '—'}</span>
          {p.remaining === 0 && <span className="ml-0.5">🏆</span>}
          {p.confirmed && <span className="text-teal ml-0.5">✓</span>}
        </span>
      ))}
    </span>
  );
}

function DartsConfirmRow({
  darts, myLogin, onConfirm, onContest,
}: {
  darts: PendingFfa;
  myLogin: string | undefined;
  onConfirm: (id: string, remaining: number) => Promise<void>;
  onContest: (id: string, claimedRemaining: number, message?: string) => Promise<void>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [contesting, setContesting] = useState(false);
  const mine = darts.participants.find((p) => p.login === myLogin);
  const confirmedCount = darts.participants.filter((p) => p.confirmed).length;
  const total = darts.participants.length;
  if (!mine) return null;
  const myRemaining = mine.remaining ?? 0;

  return (
    <>
      <div
        className="relative rounded-xl p-3 border animate-pop flex flex-wrap items-center gap-2.5"
        style={{ borderColor: `${DARTS_TEAL}66`, background: `${DARTS_TEAL}0d` }}
      >
        <Target className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} style={{ color: DARTS_TEAL }} />
        <PlayerLink login={darts.declarerLogin} className="font-semibold text-sm">
          <span style={{ color: DARTS_TEAL }}>{darts.declarerLogin}</span>
        </PlayerLink>
        <span className="text-muted-2 text-sm">{t('darts.placedYou')}</span>
        <span className="font-mono font-extrabold tabular-nums text-text-strong text-sm">
          {myRemaining}{myRemaining === 0 && ' 🏆'}
        </span>
        {darts.startScore != null && (
          <span className="text-[10px] text-muted bg-bg-2 px-1.5 py-0.5 rounded font-mono">
            {t('darts.startScore')} {darts.startScore}
          </span>
        )}
        <GameTag game="flechettes" />
        <span className="text-[10px] text-muted bg-bg-2 px-1.5 py-0.5 rounded font-mono">{confirmedCount}/{total}</span>
        <DartsRemainingInline darts={darts} myLogin={myLogin} />
        <div className="ml-auto flex gap-2">
          <Button size="sm" loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(darts.id, myRemaining); } finally { setBusy(false); } }}>
            {t('darts.confirmPlace')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setContesting(true)}
            className="text-red border-red/30 hover:border-red hover:bg-red/5 hover:text-red">
            {t('darts.contest')}
          </Button>
        </div>
      </div>
      {contesting && (
        <DartsContestModal
          darts={darts}
          myRemaining={myRemaining}
          onSubmit={async (claimed, msg) => { setContesting(false); setBusy(true); try { await onContest(darts.id, claimed, msg); } finally { setBusy(false); } }}
          onClose={() => setContesting(false)}
        />
      )}
    </>
  );
}

function DartsWaitRow({
  darts, myLogin, onCancel,
}: {
  darts: PendingFfa;
  myLogin: string | undefined;
  onCancel: (id: string) => Promise<void>;
}) {
  const t = useT();
  const confirmedCount = darts.participants.filter((p) => p.confirmed).length;
  const total = darts.participants.length;
  const isDeclarer = darts.declarerLogin === myLogin;
  return (
    <div className="rounded-xl p-3 flex flex-wrap items-center gap-2 text-sm border border-border/50 bg-white/[0.02]">
      <Clock className="w-4 h-4 text-muted-2 flex-shrink-0" strokeWidth={2} />
      <span className="text-muted-2">{t('darts.waitingFor')}</span>
      <span className="font-mono font-extrabold text-text-strong">{confirmedCount}/{total}</span>
      <GameTag game="flechettes" />
      <DartsRemainingInline darts={darts} myLogin={myLogin} />
      <span className="ml-auto text-[10px] text-muted italic">{t('defis.waitingConfirmEllipsis')}</span>
      {isDeclarer && (
        <button type="button" onClick={() => onCancel(darts.id)}
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-2 hover:text-red hover:bg-red/10 transition-colors"
          title={t('defis.cancel')} aria-label={t('defis.cancel')}>
          <X className="w-4 h-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

/** Modale de contestation Fléchettes : le joueur revendique son VRAI reste (annule la manche). */
function DartsContestModal({
  darts, myRemaining, onSubmit, onClose,
}: {
  darts: PendingFfa;
  myRemaining: number;
  onSubmit: (claimedRemaining: number, message?: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const max = darts.startScore ?? 501;
  const [claimed, setClaimed] = useState(String(myRemaining));
  const [message, setMessage] = useState('');

  const claimedNum = Number(claimed);
  const valid = claimed.trim() !== '' && Number.isInteger(claimedNum) && claimedNum >= 0 && claimedNum <= max;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/70 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-red/40 bg-bg-1 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-extrabold text-text-strong mb-1">{t('darts.contest.title')}</div>
        <p className="text-[11px] text-muted-2 mb-4 leading-relaxed">{t('darts.contest.sub')}</p>

        <div className="text-[10px] uppercase tracking-wider font-bold text-muted mb-2">{t('darts.contest.yourRemaining')}</div>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          value={claimed}
          onChange={(e) => setClaimed(e.target.value)}
          placeholder="0"
          className="w-full px-3 py-2 bg-bg-2 border border-border rounded-lg text-sm font-mono font-extrabold tabular-nums focus:border-red outline-none text-text-strong placeholder:text-muted mb-1"
        />
        <p className="text-[10px] text-muted-2 mb-4">0 – {max}</p>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          placeholder={t('darts.contest.messagePlaceholder')}
          className="w-full h-20 px-3 py-2 bg-bg-2 border border-border rounded-lg text-xs resize-none focus:border-red outline-none text-text-strong placeholder:text-muted mb-4"
        />

        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} className="flex-1">{t('defis.confirm.keep')}</Button>
          <Button size="sm" variant="danger" disabled={!valid} onClick={() => onSubmit(claimedNum, message.trim() || undefined)} className="flex-1">
            {t('darts.contest.submit')}
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}

// ─── Ligne de défi ────────────────────────────────────────────────────────────

interface ChallengeRowProps {
  challenge: Challenge;
  kind: Kind;
  myLogin: string | undefined;
  lang: Lang;
  onAccept: () => void;
  onDecline: () => void;
  /** Demande d'annulation à l'amiable (défi accepté uniquement). */
  onAmicableRequest?: () => void;
  /** Réponse à une demande d'annulation à l'amiable (accept = true/false). */
  onAmicableRespond?: (accept: boolean) => void;
}

function ChallengeRow({ challenge, kind, myLogin, lang, onAccept, onDecline, onAmicableRequest, onAmicableRespond }: ChallengeRowProps) {
  const t = useT();
  const { isOpsDuel } = useOpsStatus();
  const opponent = challenge.challengerLogin === myLogin ? challenge.opponentLogin : challenge.challengerLogin;
  const isOps = challenge.mode !== '2v2' && isOpsDuel(challenge.challengerLogin, challenge.opponentLogin, challenge.createdAt);
  const when = fmtRelative(challenge.scheduledAt, lang);
  const [recording, setRecording] = useState(false);
  const cancelState = challengeCancelState(challenge, myLogin);

  const KIND_ICON = { incoming: '⚔', outgoing: '→', accepted: '🎯' };
  const KIND_LABEL = {
    incoming: t('defis.challengeReceivedFrom'),
    outgoing: t('defis.challengeSentTo'),
    accepted: t('defis.vs'),
  };

  return (
    <div className={`rounded-xl p-3 border border-border/50 bg-white/[0.02] hover:border-accent/30 transition-colors ${isOps ? 'ops-duel' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span aria-hidden>{KIND_ICON[kind]}</span>
        <span className="text-muted-2 text-[11px]">{KIND_LABEL[kind]}</span>
        {challenge.mode === '2v2' ? (
          <>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-[0.14em] bg-red/15 text-red border border-red/30">
              2 vs 2
            </span>
            <span className="text-[11px] font-semibold">
              <span className="text-gold">{challenge.challengerLogin} &amp; {challenge.partnerLogin}</span>
              <span className="text-muted-2"> vs </span>
              <span>{challenge.opponentLogin} &amp; {challenge.opponentPartnerLogin}</span>
            </span>
          </>
        ) : (
          <PlayerLink login={opponent} className="font-semibold text-sm">{opponent}</PlayerLink>
        )}
        {/* Game badge proéminent */}
        <GameTag game={challenge.game} />
        <span className={`text-[11px] ml-auto ${when.late ? 'text-red' : 'text-muted-2'}`}>{when.text}</span>

        {kind === 'incoming' && (
          <>
            {/* Cooldown 48h : un défi non accepté sous ce délai expire (sans pénalité). */}
            <Cooldown
              from={challenge.createdAt}
              label={t('defis.cooldown.expireIn')}
              expiredLabel={t('defis.cooldown.expired')}
            />
            <Button size="sm" onClick={onAccept}>{t('defis.accept')}</Button>
            <Button size="sm" variant="ghost" onClick={onDecline}>{t('defis.decline')}</Button>
          </>
        )}
        {kind === 'outgoing' && (
          <Button size="sm" variant="ghost" onClick={onDecline}>{t('defis.cancel')}</Button>
        )}
        {/* Duel OPS forcé : la cible (comme le traqueur) ne peut ni fuir ni
            demander une annulation à l'amiable — seul l'enregistrement du score
            est offert. C'est le sens du « forcé » : le duel a lieu. */}
        {kind === 'accepted' && !recording && isOps && (
          <Button size="sm" onClick={() => setRecording(true)}>{t('defis.enterScore')}</Button>
        )}
        {kind === 'accepted' && !recording && !isOps && (
          <>
            <Button size="sm" onClick={() => setRecording(true)}>{t('defis.enterScore')}</Button>
            {cancelState === 'awaiting_my_response' ? (
              <>
                <Button size="sm" onClick={() => onAmicableRespond?.(true)}>{t('defis.amicable.accept')}</Button>
                <Button size="sm" variant="ghost" onClick={() => onAmicableRespond?.(false)}>{t('defis.amicable.refuse')}</Button>
              </>
            ) : cancelState === 'requested_by_my_team' ? (
              <>
                <span className="text-[11px] text-gold/80 italic">{t('defis.amicable.waiting')}</span>
                <Button size="sm" variant="ghost" onClick={onDecline}>{t('defis.flee')}</Button>
              </>
            ) : cancelState === 'awaiting_other_response' ? (
              <span className="text-[11px] text-gold/80 italic">{t('defis.amicable.waitingTeam')}</span>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={onAmicableRequest}>{t('defis.amicable.request')}</Button>
                <Button size="sm" variant="ghost" onClick={onDecline}>{t('defis.flee')}</Button>
              </>
            )}
          </>
        )}
      </div>
      {kind === 'accepted' && recording && (
        <RecordResultForm
          challengeId={challenge.id}
          game={challenge.game ?? 'babyfoot'}
          oppLogin={opponent}
          onDone={() => setRecording(false)}
        />
      )}
    </div>
  );
}

// ─── Formulaire d'enregistrement d'un résultat de défi ───────────────────────

function RecordResultForm({ challengeId, game, oppLogin, onDone }: {
  challengeId: string; game: Game; oppLogin: string; onDone: () => void;
}) {
  const t = useT();
  const { refresh } = useLeagueData();
  const flash = useFlash();
  const [iWon, setIWon] = useState<boolean | null>(null);
  const [loserScore, setLoserScore] = useState(0);
  const [busy, setBusy] = useState(false);

  const send = async (result: MatchResultInput) => {
    setBusy(true);
    try {
      await api.recordChallengeResult(challengeId, result);
      flash.show(t('defis.scoreSent'));
      await refresh();
      onDone();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      setBusy(false);
    }
  };

  if (game === 'chess') {
    return (
      <div className="mt-3 grid grid-cols-2 gap-3">
        <OutcomeButton kind="win" onClick={() => send({ scoreSelf: 1, scoreOpponent: 0, game: 'chess' })}>{t('defis.iWon')}</OutcomeButton>
        <OutcomeButton kind="loss" onClick={() => send({ scoreSelf: 0, scoreOpponent: 1, game: 'chess' })}>{t('defis.iLost')}</OutcomeButton>
      </div>
    );
  }
  if (game === 'smash' || game === 'streetfighter') {
    return <RecordSetResultForm challengeId={challengeId} game={game} oppLogin={oppLogin} onDone={onDone} />;
  }

  if (iWon === null) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-3">
        <OutcomeButton kind="win" onClick={() => setIWon(true)}>{t('defis.iWon')}</OutcomeButton>
        <OutcomeButton kind="loss" onClick={() => setIWon(false)}>{t('defis.iLost')}</OutcomeButton>
      </div>
    );
  }

  const winnerLogin = iWon ? 'Moi' : oppLogin;
  const loserLogin = iWon ? oppLogin : 'Moi';

  return (
    <div className="mt-3 space-y-3">
      {/* Score visuel côte à côte */}
      <div className="flex items-stretch gap-2">
        {[{ login: winnerLogin, score: WINNING_SCORE, isWinner: true },
          { login: loserLogin, score: loserScore, isWinner: false }].map(({ login, score, isWinner }) => (
          <div key={login} className={`flex-1 rounded-xl flex flex-col items-center py-3 gap-1
            ${isWinner ? 'bg-gold/10 border border-gold/40' : loserScore < 0 ? 'bg-red/[0.07] border border-red/30' : 'bg-bg-2/60 border border-border/60'}`}>
            <span className="text-[9px] uppercase tracking-wider text-muted font-bold">{login === 'Moi' ? t('defis.you') : login}</span>
            <span className={`font-display text-3xl font-black tabular-nums ${isWinner ? 'text-gold' : loserScore < 0 ? 'text-red' : 'text-text-strong'}`}>
              {score}
            </span>
            {isWinner && <span className="text-[8px] text-gold/50 font-extrabold uppercase tracking-wider">🔒</span>}
            {!isWinner && <span className="text-[8px] text-muted-2 font-extrabold uppercase tracking-wider">{t('defis.slideHint')}</span>}
          </div>
        ))}
      </div>
      <AbacusSlider value={loserScore} onChange={setLoserScore} min={LOSER_SCORE_MIN} max={LOSER_SCORE_MAX} />
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={() => setIWon(null)} className="flex-none">←</Button>
        <Button size="sm" loading={busy}
          onClick={() => send({
            scoreSelf: iWon ? WINNING_SCORE : loserScore,
            scoreOpponent: iWon ? loserScore : WINNING_SCORE,
            game: 'babyfoot',
          })}
          className="flex-1">{t('defis.send')}</Button>
        <Button size="sm" variant="ghost" onClick={onDone} className="flex-none">{t('defis.cancel')}</Button>
      </div>
    </div>
  );
}

// ─── Saisie d'un résultat de SET (Smash / Street Fighter) côté desktop ──────────
// Délègue tout le corps du set (format, score, persos optionnels) au composant
// partagé SmashSetEditor — même UI « score d'abord » que la sheet mobile.

function RecordSetResultForm({ challengeId, game, oppLogin, onDone }: {
  challengeId: string; game: 'smash' | 'streetfighter'; oppLogin: string; onDone: () => void;
}) {
  const t = useT();
  const { refresh, me } = useLeagueData();
  const flash = useFlash();
  const isSf = game === 'streetfighter';
  const myLogin = me?.login;
  const myFavorites = (isSf ? me?.user?.favSf : me?.user?.favSmash) ?? [];

  const [iWon, setIWon] = useState<boolean | null>(null);
  const [setValue, setSetValue] = useState<SmashSetValue | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (iWon === null || !setValue) return;
    setBusy(true);
    try {
      await api.recordChallengeResult(challengeId, {
        scoreSelf: setValue.scoreSelf,
        scoreOpponent: setValue.scoreOpponent,
        game,
        bestOf: setValue.bestOf,
        charSelf: setValue.charSelf,
        charOpponent: setValue.charOpponent,
      });
      flash.show(t('defis.scoreSent'));
      await refresh();
      onDone();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      setBusy(false);
    }
  };

  if (iWon === null) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-3">
        <OutcomeButton kind="win" onClick={() => setIWon(true)}>{t('defis.iWon')}</OutcomeButton>
        <OutcomeButton kind="loss" onClick={() => setIWon(false)}>{t('defis.iLost')}</OutcomeButton>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      <button type="button" onClick={() => setIWon(null)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border transition-all ${iWon ? 'border-teal/40 bg-teal/10 text-teal' : 'border-red/40 bg-red/10 text-red'}`}>
        <span className="text-sm font-extrabold">{iWon ? t('defis.iWon') : t('defis.iLost')}</span>
        <span className="text-muted-2 text-lg">×</span>
      </button>

      <SmashSetEditor
        game={game}
        iWon={iWon}
        myLogin={myLogin}
        oppLogin={oppLogin}
        myFavorites={myFavorites}
        onChange={setSetValue}
      />

      <div className="flex gap-2">
        <Button size="sm" loading={busy} onClick={send} className="flex-1">{t('defis.send')}</Button>
        <Button size="sm" variant="ghost" onClick={onDone} className="flex-none">{t('defis.cancel')}</Button>
      </div>
    </div>
  );
}

