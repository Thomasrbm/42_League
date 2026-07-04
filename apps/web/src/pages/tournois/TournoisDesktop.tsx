import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Panel } from '../../components/Panel';
import { Button } from '../../components/Button';
import { Pills } from '../../components/Pills';
import {
  TournamentPrizePicker,
  buildPrizePayload,
  EMPTY_PRIZE,
  type PrizeFormState,
} from '../../components/tournois/TournamentPrizePicker';
import { Trophy, Lock, X, Swords, Users, Info, Crown } from 'lucide-react';
import { api, type Tournament, type LeaderboardEntry } from '../../lib/api';
import { PlayerSearch } from '../defis/shared/PlayerSearch';
import { tournamentArt, safeImageUrl } from '../../lib/tournamentArt';
import { TournamentCup } from '../../components/TournamentCup';
import { SmashTrophy } from '../../components/SmashTrophy';
import { ChessTrophy } from '../../components/ChessTrophy';
import { PastTournamentHover } from '../../components/tournois/PastTournamentPopover';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useIsMobile } from '../../hooks/useViewport';
import { useGameMode } from '../../hooks/useGameMode';
import { useFlash } from '../../hooks/useFlash';
import { useScrollRoot } from '../../shell/scrollRoot';
import { useT } from '../../lib/i18n';
import { useEscapeKey } from '../../hooks/useEscapeKey';

const POOLS_MIN = 12;

export function TournoisDesktop() {
  const { tournaments, me, refresh } = useLeagueData();
  const { game } = useGameMode();
  const t = useT();
  const isAdmin = !!me?.isAdmin;
  const scrollRoot = useScrollRoot();

  // Cette page (réutilisée sur mobile) est lourde : le reset de scroll synchrone du
  // MobileShell s'applique parfois avant que le layout soit prêt et ne « prend » pas.
  // On rejoue donc le reset au montage, après une frame, pour repartir en haut.
  // (Sur desktop `scrollRoot` est null → no-op, le DesktopShell s'en charge déjà.)
  useEffect(() => {
    const root = scrollRoot?.current;
    if (!root) return;
    const id = requestAnimationFrame(() => root.scrollTo({ top: 0 }));
    return () => cancelAnimationFrame(id);
  }, [scrollRoot]);

  // Un seul clic « Créer » ouvre directement le panneau de paramètres : nom,
  // capacité, joueurs et réglages se choisissent désormais à l'intérieur.
  const [paramsOpen, setParamsOpen] = useState(false);
  const [initialKind, setInitialKind] = useState<'friendly' | 'official'>('friendly');
  const [helpOpen, setHelpOpen] = useState(false);

  const active = tournaments.filter((t) => t.status === 'in_progress');
  const inPrep = tournaments.filter((t) => t.status === 'registration');
  const past = tournaments.filter((t) => t.status === 'finished' || t.status === 'cancelled');

  const openCreate = (kind: 'friendly' | 'official') => {
    setInitialKind(kind);
    setParamsOpen(true);
  };

  return (
    <Panel title={t('tournois.title')} sub={t('tournois.sub')} accent="trophy">

      {/* ── Hero CTA — un seul bouton « Créer un tournoi » ──────────────────── */}
      {/* Le choix amical / officiel se fait dans le panneau de paramètres. */}
      <div className="mb-8">
        <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
          <button
            type="button"
            onClick={() => openCreate('friendly')}
            className="shine group relative w-full overflow-hidden rounded-2xl border-2 border-gold/45 hover:border-gold
              flex items-center gap-5 px-6 py-5 text-left transition-all duration-300"
            style={{
              background: 'linear-gradient(135deg, rgba(50,38,12,0.7) 0%, rgba(20,16,6,0.9) 100%)',
              boxShadow: '0 0 28px rgba(255,201,74,0.14)',
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-gold/10 via-gold/3 to-transparent opacity-80 pointer-events-none" />
            <span className="relative flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-xl"
              style={{ background: 'rgba(255,201,74,0.18)', boxShadow: 'inset 0 1px 0 rgba(255,247,228,0.18)' }}>
              <Swords className="w-7 h-7 text-gold" strokeWidth={2.2} />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block font-display text-xl font-black text-gold tracking-tight mb-0.5">
                {t('tournois.create')}
              </span>
              <span className="block text-[11px] text-muted-2 uppercase tracking-[0.14em]">
                {t('tournois.create.subtitle')}
              </span>
            </span>
            <span className="relative text-gold/50 group-hover:text-gold group-hover:translate-x-1 transition-all">→</span>
          </button>
        </motion.div>
      </div>

      {/* Modal création (params) — nom, capacité et réglages tout-en-un */}
      {paramsOpen && (
        <CreateTournamentModal
          isAdmin={isAdmin}
          initialKind={initialKind}
          onClose={() => setParamsOpen(false)}
          onCreated={async () => {
            setParamsOpen(false);
            await refresh();
          }}
        />
      )}

      {/* ── Liste des tournois ───────────────────────────────────────────────── */}
      {tournaments.length === 0 ? (
        <EmptyTournois game={game} />
      ) : (
        <div className="space-y-8">
          {active.length > 0 && <TournoiGroup label={t('tournois.group.live')} tone="gold" items={active} />}
          {inPrep.length > 0 && <TournoiGroup label={t('tournois.group.open')} tone="teal" items={inPrep} />}
          {past.length > 0 && <TournoiGroup label={t('tournois.group.history')} tone="muted" items={past} />}
        </div>
      )}

      {/* ── Aide discrète ──────────────────────────────────────────────────── */}
      <div className="mt-8 pt-6 border-t border-border/30">
        <button type="button" onClick={() => setHelpOpen((o) => !o)}
          className="flex items-center gap-2 text-[11px] text-muted-2 hover:text-muted transition-colors">
          <Info className="w-3.5 h-3.5" strokeWidth={2} />
          {t('tournois.help.toggle')}
        </button>
        <AnimatePresence>
          {helpOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
              className="overflow-hidden">
              <div className="grid grid-cols-2 gap-3 mt-3">
                {[
                  { n: '1', text: t('tournois.help.step1') },
                  { n: '2', text: t('tournois.help.step2') },
                  { n: '3', text: t('tournois.help.step3') },
                  { n: '4', text: t('tournois.help.step4') },
                ].map(({ n, text }) => (
                  <div key={n} className="flex gap-3 p-3 rounded-xl bg-white/[0.02] border border-border/30 text-[11px] text-muted-2">
                    <span className="w-5 h-5 rounded-full bg-gold/15 text-gold text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Panel>
  );
}

// ─── Sceau de cire rouge cadenassé ───────────────────────────────────────────
// Réutilisé sur l'option « Officiel » du panneau pour les non-admins.
function RedWaxSeal({ size = 48 }: { size?: number }) {
  return (
    <motion.div
      initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
      animate={{ scale: 1, rotate: -8, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 18 }}
      className="relative flex-shrink-0 flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: 'radial-gradient(circle at 38% 32%, #d44 0%, #a31818 45%, #7a0e0e 100%)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,140,140,0.35), inset 0 -3px 6px rgba(0,0,0,0.45)',
        border: '2px solid rgba(120,8,8,0.9)',
      }}
    >
      {/* Bord cranté du sceau de cire */}
      <span
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ boxShadow: 'inset 0 0 0 3px rgba(180,30,30,0.55)' }}
      />
      <Lock className="relative text-[#3a0606]" style={{ width: size * 0.44, height: size * 0.44 }} strokeWidth={2.6} fill="rgba(58,6,6,0.25)" />
    </motion.div>
  );
}

// ─── Empty state visuel ───────────────────────────────────────────────────────

function EmptyTournois({ game }: { game: string }) {
  const t = useT();
  const gameEmoji = game === 'smash' ? '🎮' : game === 'streetfighter' ? '🥊' : game === 'chess' ? '♟' : '⚽';
  return (
    <div className="flex flex-col items-center text-center py-16">
      <div className="relative mb-6 w-24 h-24">
        <div className="absolute inset-0 bg-gold/15 blur-2xl rounded-full" />
        <Trophy className="relative w-full h-full text-gold/60" strokeWidth={1.2} />
        <span className="absolute -bottom-1 -right-1 text-2xl">{gameEmoji}</span>
      </div>
      <h3 className="font-display text-2xl font-black text-text-strong mb-2">
        {t('tournois.empty.title')}
      </h3>
      <p className="text-sm text-muted-2 max-w-md mb-6 leading-relaxed">
        {t('tournois.empty.body')}
      </p>
      {/* Plus de bouton « Créer » ici : seul le gros CTA du haut sert à créer. */}
      <div className="flex flex-wrap justify-center gap-2">
        {[t('tournois.empty.tag.elim'), t('tournois.empty.tag.pools'), t('tournois.empty.tag.players')].map((tag) => (
          <span key={tag} className="text-[11px] text-muted-2 px-3 py-1.5 rounded-full border border-border/50 bg-white/[0.02]">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Groupe de tournois ───────────────────────────────────────────────────────

type GroupTone = 'gold' | 'teal' | 'muted';
const GROUP_BAR: Record<GroupTone, string> = { gold: 'from-gold to-gold-dim', teal: 'from-teal to-teal', muted: 'from-muted to-muted/40' };
const GROUP_TXT: Record<GroupTone, string> = { gold: 'text-gold', teal: 'text-teal', muted: 'text-muted-2' };

function TournoiGroup({ label, tone, items }: { label: string; tone: GroupTone; items: Tournament[] }) {
  return (
    <section>
      <div className={`font-gaming text-[10px] uppercase tracking-[0.18em] font-extrabold mb-4 flex items-center gap-2 ${GROUP_TXT[tone]}`}>
        <span className={`inline-block w-1 h-2.5 bg-gradient-to-b ${GROUP_BAR[tone]} rounded-sm`} />
        {label}
        <span className="text-muted-2 font-mono text-[10px] normal-case">· {items.length}</span>
        <div className="flex-1 h-px bg-gradient-to-r from-border/50 to-transparent ml-1" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {items.map((t, i) => (
          <motion.div key={t.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.22 }}>
            <TournoiCard t={t} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ─── Carte tournoi ────────────────────────────────────────────────────────────

const STATUS_KEY: Record<Tournament['status'], string> = {
  registration: 'tournois.status.registration', in_progress: 'tournois.status.in_progress',
  finished: 'tournois.status.finished', cancelled: 'tournois.status.cancelled',
};
const STATUS_TONE: Record<Tournament['status'], string> = {
  registration: 'border-teal text-teal', in_progress: 'border-gold text-gold',
  finished: 'border-muted text-muted-2', cancelled: 'border-red text-red',
};

function TournoiCard({ t }: { t: Tournament }) {
  const tr = useT();
  const count = t.entries?.length ?? 0;
  const art = tournamentArt(t.id);
  const cover = safeImageUrl(t.imageUrl);
  // Ligue : capacité indicative (on peut dépasser) → barre/pourcentage masqués.
  const isLeague = t.format === 'league';
  const fillPct = Math.min(100, Math.round((count / Math.max(1, t.capacity)) * 100));
  const isOfficial = t.kind === 'official';
  const card = (
    <Link
      to={`/tournaments/${encodeURIComponent(t.id)}`}
      className="group relative block rounded-xl overflow-hidden card-hud hover-glow transition-all duration-200 hover:-translate-y-0.5"
      style={
        isOfficial
          ? {
              border: '2.5px solid #ff3347',
              boxShadow:
                '0 0 0 1.5px rgba(255,51,71,0.5), 0 0 22px rgba(255,51,71,0.55), inset 0 0 40px rgba(255,51,71,0.12)',
            }
          : undefined
      }
    >
      {/* Liseré rouge officiel : bandeau supérieur + halo d'angle */}
      {isOfficial && (
        <>
          <div className="absolute inset-x-0 top-0 h-[3px] z-20 bg-gradient-to-r from-transparent via-[#ff3347] to-transparent" />
          <div
            aria-hidden
            className="absolute inset-0 z-10 pointer-events-none rounded-xl"
            style={{ background: 'radial-gradient(120% 80% at 50% 0%, rgba(255,51,71,0.18) 0%, transparent 55%)' }}
          />
        </>
      )}
      {/* Art en haut (format 4:3) */}
      <div className="relative aspect-video overflow-hidden">
        {cover ? (
          <img src={cover} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: art.background }} />
            {t.game === 'smash' || t.game === 'streetfighter'
              ? <SmashTrophy accent={art.accent} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 opacity-80" />
              : t.game === 'chess'
              ? <ChessTrophy accent={art.accent} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 opacity-80" />
              : <TournamentCup accent={art.accent} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 opacity-80" />
            }
          </>
        )}
        {/* Badges haut */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
          <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider border bg-black/50 backdrop-blur-sm ${STATUS_TONE[t.status]}`}>
            {tr(STATUS_KEY[t.status])}
          </span>
          {t.game && t.game !== 'babyfoot' && (
            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-black/50 backdrop-blur-sm border border-accent/30 text-accent">
              {t.game === 'smash' ? '🎮' : t.game === 'streetfighter' ? '🥊' : '♟'}
            </span>
          )}
        </div>
      </div>

      {/* Infos bas */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <span className={`inline-flex items-center gap-1 text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider border ${
            isOfficial ? 'text-white border-[#ff3347] bg-[#e8132a]' : 'text-muted-2 border-border bg-transparent'
          }`}>
            {isOfficial && <Crown className="w-2.5 h-2.5" strokeWidth={3} />}
            {isOfficial ? tr('tournois.kind.official') : tr('tournois.kind.friendly')}
          </span>
          {t.isPrivate && <Lock className="w-3 h-3 text-teal flex-shrink-0 mt-0.5" strokeWidth={2.5} />}
        </div>

        <div className="font-semibold text-text-strong text-sm leading-tight mb-2 line-clamp-2">{t.name}</div>

        {/* Progress bar (inscriptions/en cours) */}
        {(t.status === 'registration' || t.status === 'in_progress') && (
          <div className="mb-1.5">
            {!isLeague && (
              <div className="h-1 rounded-full bg-bg-0/60 overflow-hidden mb-1">
                <div className="h-full rounded-full bg-gradient-to-r from-gold/60 to-gold"
                  style={{ width: `${fillPct}%` }} />
              </div>
            )}
            <div className="flex items-center justify-between text-[9px] text-muted-2">
              <span className="flex items-center gap-1">
                <Users className="w-2.5 h-2.5" strokeWidth={2.5} />
                {isLeague ? `${count} inscrit${count > 1 ? 's' : ''}` : `${count}/${t.capacity}`}
              </span>
              {t.status === 'registration' && !isLeague && <span>{fillPct}%</span>}
            </div>
          </div>
        )}

        {t.winner && (
          <div className="text-[10px] text-gold font-bold truncate">🏆 {t.winner.login}</div>
        )}
        {t.status === 'finished' && (
          <div className="mt-1 text-[9px] font-bold text-teal/90 group-hover:text-teal transition-colors">
            Voir les résultats →
          </div>
        )}
      </div>
    </Link>
  );
  return t.status === 'finished' ? <PastTournamentHover t={t}>{card}</PastTournamentHover> : card;
}

// ─── Modal de création (paramètres) ──────────────────────────────────────────

function CreateTournamentModal({ isAdmin, initialKind, onClose, onCreated }: {
  isAdmin: boolean; initialKind: 'friendly' | 'official';
  onClose: () => void; onCreated: () => Promise<void>;
}) {
  useEscapeKey(true, onClose);
  const flash = useFlash();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { game } = useGameMode();
  const { leaderboard, me, locations } = useLeagueData();
  const t = useT();
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState(8);
  const [kind, setKind] = useState<'friendly' | 'official'>(isAdmin ? initialKind : 'friendly');
  // Mode 1v1 / 2v2 — le 2v2 (doubles) est réservé au babyfoot (cf. backend).
  const [mode, setMode] = useState<'1v1' | '2v2'>('1v1');
  const [partner, setPartner] = useState<LeaderboardEntry | null>(null);
  // L'organisateur participe-t-il à son propre tournoi ? Décoché par défaut.
  const [selfJoin, setSelfJoin] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [format, setFormat] = useState<'elimination' | 'pools' | 'league'>('elimination');
  const [imageUrl, setImageUrl] = useState('');
  const [prize, setPrize] = useState<PrizeFormState>(EMPTY_PRIZE);
  const [busy, setBusy] = useState(false);

  const isLeague = format === 'league';
  const poolsAllowed = capacity >= POOLS_MIN;
  // Ligue : le format est conservé tel quel (nombre de joueurs libre). Sinon, les
  // poules retombent en élimination directe si la capacité est trop faible.
  const effectiveFormat = isLeague ? 'league' : poolsAllowed ? format : 'elimination';
  // 2v2 uniquement en babyfoot ; partout ailleurs on force le 1v1.
  const teamMode = game === 'babyfoot' && mode === '2v2';
  // Coéquipier requis uniquement si l'organisateur participe à un 2v2.
  const needsPartner = teamMode && selfJoin;
  // Coéquipiers candidats : tous les joueurs sauf moi (le créateur).
  const partnerCandidates = leaderboard.filter((p) => p.login !== me?.user?.login);

  const submit = async () => {
    const n = name.trim();
    if (n.length < 2) { flash.show(t('tournois.flash.nameRequired'), 'error'); return; }
    if (capacity < (isLeague ? 3 : 6)) { flash.show(t('tournois.flash.capacityMin'), 'error'); return; }
    if (needsPartner && !partner) { flash.show(t('tournois.create.needPartner'), 'error'); return; }
    setBusy(true);
    try {
      const img = imageUrl.trim();
      // La récompense n'est envoyée que pour un officiel (sinon le backend 400).
      const prizePayload = kind === 'official' ? buildPrizePayload(prize) : { kind: 'none' as const };
      const tNew = await api.createTournament({
        name: n, capacity, kind, format: effectiveFormat, game,
        mode: teamMode ? '2v2' : '1v1',
        selfJoin,
        partnerLogin: needsPartner ? partner!.login : undefined,
        private: visibility === 'private',
        prize: prizePayload,
        ...(img ? { imageUrl: img } : {}),
      });
      flash.show(t('tournois.flash.created').replace('{name}', tNew.name));
      await onCreated();
      navigate(`/tournaments/${encodeURIComponent(tNew.id)}`);
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      setBusy(false);
    }
  };

  // Rendu via portail sur <body> : sur mobile, ce modal est monté à l'intérieur de
  // PageTransition (framer-motion applique un `transform`), ce qui piège le
  // `position: fixed` dans le contexte du <main> (z-1) → le modal passait SOUS la
  // tab bar (z-40) et son bas se cachait derrière la nav. Le portail l'extrait du
  // conteneur transformé : `fixed inset-0 z-50` couvre alors le vrai viewport et
  // repasse au-dessus de la tab bar. Sur desktop, comportement identique à avant.
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className="relative w-full max-w-lg flex flex-col rounded-2xl border border-gold/25 bg-bg-1 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)] overflow-hidden"
        // Hauteur max : sur mobile on borne au viewport dynamique RÉEL (dvh, suit la
        // barre d'URL) moins la safe-area, pour que le bas (les boutons) reste
        // toujours visible et atteignable au scroll. Sur desktop, 90vh classique.
        style={{
          maxHeight: isMobile
            ? 'calc(100dvh - env(safe-area-inset-bottom) - 24px)'
            : '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center gap-3 px-5 py-4 border-b border-gold/15 bg-bg-2/40 shrink-0">
          {game === 'smash' ? <SmashTrophy accent="#ff4d5c" className="w-10 h-10 shrink-0" />
            : game === 'streetfighter' ? <SmashTrophy accent="#ff7a18" className="w-10 h-10 shrink-0" />
            : game === 'chess' ? <ChessTrophy accent="#56c46e" className="w-10 h-10 shrink-0" />
            : <TournamentCup accent="#ffc94a" className="w-10 h-10 shrink-0" />}
          <div className="min-w-0">
            <div className="font-gaming text-sm font-extrabold uppercase tracking-[0.12em] text-text-strong truncate">
              {t('tournois.modal.title')}
            </div>
            <div className="text-[11px] text-muted-2">{t('tournois.modal.subtitle')}</div>
          </div>
          <button onClick={onClose} aria-label={t('tournois.modal.close')}
            className="ml-auto grid place-items-center w-8 h-8 rounded-lg text-muted-2 hover:text-text hover:bg-bg-2 transition-colors">
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
          <Field label={t('tournois.field.name')}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              placeholder={t('tournois.field.name.placeholder')}
              maxLength={60}
              autoFocus
              className="w-full px-3 py-2.5 bg-bg-1 border border-border rounded-xl text-sm focus:border-gold outline-none transition-colors"
            />
          </Field>
          {/* Mode 1v1 / 2v2 — proposé uniquement en babyfoot (seule discipline à
              système d'équipes côté backend). */}
          {game === 'babyfoot' && (
            <Field label={t('tournois.field.mode')}>
              <Pills<'1v1' | '2v2'>
                value={mode}
                onChange={(m) => { setMode(m); if (m === '1v1') setPartner(null); }}
                choices={[
                  { value: '1v1', label: t('tournois.mode.1v1') },
                  { value: '2v2', label: t('tournois.mode.2v2') },
                ]}
              />
            </Field>
          )}
          {/* L'organisateur participe-t-il ? Décoché par défaut : créer n'oblige pas à jouer. */}
          <Field label={t('tournois.field.selfJoin')} hint={t('tournois.field.selfJoin.hint')}>
            <button
              type="button"
              onClick={() => setSelfJoin((v) => { if (v) setPartner(null); return !v; })}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-extrabold uppercase tracking-wider transition-all duration-200 ${
                selfJoin
                  ? 'bg-gradient-to-b from-gold/25 to-gold/10 text-gold border-gold/40 shadow-[inset_0_1px_0_rgba(255,247,228,0.18)]'
                  : 'text-muted-2 border-border hover:text-gold/90'
              }`}
            >
              <span className={`grid place-items-center w-4 h-4 rounded border ${selfJoin ? 'border-gold bg-gold/25' : 'border-border'}`}>
                {selfJoin && (
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="none">
                    <path d="M5 10.5l3.5 3.5L15 6.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {t('tournois.field.selfJoin')}
            </button>
          </Field>
          {/* Coéquipier (2v2) — le créateur engage sa paire (seulement s'il participe). */}
          {needsPartner && (
            <Field label={t('tournois.field.partner')}>
              <PlayerSearch
                players={partnerCandidates}
                recentPlayers={[]}
                opponentCounts={{}}
                selected={partner}
                onSelect={setPartner}
                onClear={() => setPartner(null)}
                locations={locations}
                variant="desktop"
              />
            </Field>
          )}
          {/* Format choisi AVANT le nombre de joueurs : il conditionne les capacités
              proposées (paliers en puissance de 2 vs nombre libre en ligue). */}
          <Field label={t('tournois.field.format')} hint={
            isLeague ? t('tournois.field.format.hint.league')
            : poolsAllowed
            ? effectiveFormat === 'pools' ? t('tournois.field.format.hint.pools') : t('tournois.field.format.hint.elim')
            : t('tournois.field.format.hint.minpools').replace('{n}', String(POOLS_MIN))
          }>
            <Pills<'elimination' | 'pools' | 'league'> value={effectiveFormat}
              onChange={(v) => {
                if (v === 'pools' && !poolsAllowed) { flash.show(t('tournois.flash.poolsMin').replace('{n}', String(POOLS_MIN)), 'error'); return; }
                // En quittant la ligue, recale une capacité libre vers une puissance de 2 valide.
                if (v !== 'league' && (capacity < 8 || (capacity & (capacity - 1)) !== 0)) setCapacity(8);
                setFormat(v);
              }}
              choices={[
                { value: 'elimination', label: t('tournois.field.format.elim') },
                { value: 'pools', label: poolsAllowed ? t('tournois.field.format.pools') : t('tournois.field.format.pools.locked') },
                { value: 'league', label: t('tournois.field.format.league') },
              ]}
            />
          </Field>
          {/* Élimination/poules : capacités en puissances de 2 uniquement → bracket
              toujours plein, jamais de joueur exempt au 1er tour. Ligue : nombre libre
              (l'admin compose les affiches). En 2v2 = nombre d'équipes. */}
          <Field
            label={teamMode ? t('tournois.field.teams') : t('tournois.field.players')}
            hint={isLeague ? t('tournois.field.players.hint.league') : undefined}
          >
            {isLeague ? (
              <input
                type="number"
                min={3}
                max={64}
                value={capacity}
                onChange={(e) => setCapacity(Math.max(3, Math.min(64, Number(e.target.value) || 0)))}
                className="w-24 px-3 py-2 bg-bg-1 border border-border rounded-lg text-sm focus:border-gold outline-none transition-colors tabular-nums"
              />
            ) : (
              <Pills<string>
                value={String(capacity)}
                onChange={(v) => setCapacity(Number(v))}
                choices={[
                  { value: '8', label: '8' },
                  { value: '16', label: '16' },
                  { value: '32', label: '32' },
                ]}
              />
            )}
          </Field>
          <Field label={t('tournois.field.type')} hint={isAdmin ? undefined : t('tournois.field.type.hint')}>
            {isAdmin ? (
              <Pills<'friendly' | 'official'> value={kind}
                onChange={setKind}
                choices={[{ value: 'friendly', label: t('tournois.type.friendly') }, { value: 'official', label: t('tournois.type.official') }]}
              />
            ) : (
              <div className="inline-flex gap-2">
                <button type="button" onClick={() => setKind('friendly')}
                  className={`px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-wider rounded-lg border transition-all duration-200 ${
                    kind === 'friendly'
                      ? 'bg-gradient-to-b from-gold/25 to-gold/10 text-gold border-gold/40 shadow-[inset_0_1px_0_rgba(255,247,228,0.18)]'
                      : 'text-muted-2 border-border hover:text-gold/90'
                  }`}>
                  {t('tournois.type.friendly')}
                </button>
                {/* Officiel scellé sous cire rouge — non sélectionnable */}
                <button type="button"
                  onClick={() => flash.show(t('tournois.official.adminsOnly'), 'error')}
                  aria-disabled="true"
                  title={t('tournois.official.sealTitle')}
                  className="relative flex items-center gap-2 px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-wider rounded-lg border border-red/40 cursor-not-allowed select-none">
                  <span className="text-muted-2/60 opacity-50">{t('tournois.type.official')}</span>
                  <RedWaxSeal size={28} />
                </button>
              </div>
            )}
          </Field>
          <Field label={t('tournois.field.visibility')} hint={visibility === 'private' ? t('tournois.field.visibility.hint.private') : t('tournois.field.visibility.hint.public')}>
            <Pills<'public' | 'private'> value={visibility} onChange={setVisibility}
              choices={[{ value: 'public', label: t('tournois.field.visibility.public') }, { value: 'private', label: t('tournois.field.visibility.private') }]}
            />
          </Field>
          <Field label={t('tournois.field.cover')} hint={t('tournois.field.cover.hint')}>
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…" inputMode="url"
              className="w-full px-3 py-2 bg-bg-1 border border-border rounded-lg text-sm focus:border-gold outline-none transition-colors" />
          </Field>
          {isAdmin && kind === 'official' && (
            <Field label={t('tournois.field.prize')} hint={t('tournois.field.prize.hint')}>
              <TournamentPrizePicker value={prize} onChange={setPrize} />
            </Field>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} className="flex-1">{t('tournois.modal.cancel')}</Button>
            <Button loading={busy} onClick={submit} className="flex-[2]">{t('tournois.modal.submit')}</Button>
          </div>
        </div>
      </motion.div>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted font-bold mb-2">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-muted-2">{hint}</p>}
    </div>
  );
}
