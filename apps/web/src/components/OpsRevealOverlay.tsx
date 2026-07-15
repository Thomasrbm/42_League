import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Skull, Crosshair, Clock, Swords, Flame } from 'lucide-react';
import { Avatar } from './Avatar';
import { useOpsStatus } from '../hooks/useOpsStatus';
import { fmtCountdown } from '../lib/format';
import { OPS_FORCED_MATCHES } from '../lib/api';
import { haptic } from '../mobile/feedback/useHaptic';

// ─────────────────────────────────────────────────────────────────────────────
// Révélation OPS — prise de contrôle plein écran « event spécial » (façon
// Google doodle / score sportif en live). Se déclenche UNE seule fois, au
// chargement du site, quand on vient de se faire déclarer comme la cible d'un
// OPS. Deux temps : (1) l'impact « WAOUH », (2) le briefing des règles, puis on
// reprend le cours normal de l'app.
//
// Le « déjà vu » est mémorisé dans localStorage par id d'OPS : un nouvel OPS
// (nouvel id) re-déclenche l'animation, mais recharger la page non.
// ─────────────────────────────────────────────────────────────────────────────

const SEEN_KEY = 'ops-reveal-seen';

function alreadySeen(opsId: string): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === opsId;
  } catch {
    return false;
  }
}
function markSeen(opsId: string): void {
  try {
    localStorage.setItem(SEEN_KEY, opsId);
  } catch {
    /* ignore */
  }
}

const KEYFRAMES = `
@keyframes ops-strobe { 0%,100% { opacity: 0; } 8% { opacity: 0.55; } 16% { opacity: 0; } 24% { opacity: 0.4; } 32% { opacity: 0; } }
@keyframes ops-scan { from { transform: translateY(-100%); } to { transform: translateY(100%); } }
@keyframes ops-ring-spin { to { transform: rotate(360deg); } }
@keyframes ops-glitch { 0%,100% { transform: translate(0,0); } 20% { transform: translate(-2px,1px); } 40% { transform: translate(2px,-1px); } 60% { transform: translate(-1px,-1px); } 80% { transform: translate(1px,1px); } }
`;

export function OpsRevealOverlay() {
  const { amTarget, hunter } = useOpsStatus();
  const opsId = hunter?.id ?? null;

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'impact' | 'brief'>('impact');

  // Déclenchement : nouvelle cible jamais vue.
  useEffect(() => {
    if (amTarget && opsId && !alreadySeen(opsId)) {
      setPhase('impact');
      setOpen(true);
      haptic('error');
    }
  }, [amTarget, opsId]);

  // Auto-passage impact → briefing.
  useEffect(() => {
    if (!open || phase !== 'impact') return;
    const t = setTimeout(() => {
      setPhase('brief');
      haptic('warning');
    }, 2300);
    return () => clearTimeout(t);
  }, [open, phase]);

  function dismiss() {
    if (opsId) markSeen(opsId);
    haptic('heavy');
    setOpen(false);
  }

  if (!hunter) return null;

  const hunterLogin = hunter.owner?.login ?? hunter.ownerLogin;

  return createPortal(
    <>
      <style>{KEYFRAMES}</style>
      <AnimatePresence>
        {open && (
          <motion.div
            key="ops-reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            transition={{ duration: 0.18 }}
            onClick={phase === 'impact' ? () => setPhase('brief') : undefined}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 2147483647,
              background:
                'radial-gradient(120% 90% at 50% 38%, rgba(60,0,8,0.96) 0%, rgba(8,5,9,0.985) 60%, rgba(2,2,4,0.995) 100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              overflow: 'hidden',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {/* Strobe rouge d'alerte (phase impact) */}
            {phase === 'impact' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'radial-gradient(circle at 50% 40%, rgba(255,40,70,0.5), transparent 60%)',
                  animation: 'ops-strobe 1.1s ease-in-out 2',
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* Scanline qui balaie l'écran en continu */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: '40%',
                background:
                  'linear-gradient(180deg, transparent, rgba(255,60,90,0.10) 50%, transparent)',
                animation: 'ops-scan 2.6s linear infinite',
                pointerEvents: 'none',
              }}
            />
            {/* Grille HUD diagonale */}
            <div className="absolute inset-0 hud-diag opacity-[0.12] pointer-events-none" />

            <AnimatePresence mode="wait">
              {phase === 'impact' ? (
                <ImpactContent key="impact" />
              ) : (
                <BriefContent
                  key="brief"
                  hunterLogin={hunterLogin}
                  hunterImg={hunter.owner?.imageUrl ?? null}
                  expiresAt={hunter.expiresAt}
                  onDismiss={dismiss}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}

// ─── Phase 1 : impact « WAOUH » ────────────────────────────────────────────────
function ImpactContent() {
  return (
    <motion.div
      className="relative z-10 flex flex-col items-center text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, transition: { duration: 0.25 } }}
    >
      {/* Crâne qui s'écrase à l'écran */}
      <motion.div
        initial={{ scale: 3.4, opacity: 0, rotate: -18 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16, mass: 1.1 }}
      >
        <Skull
          className="w-28 h-28 sm:w-36 sm:h-36 text-red"
          strokeWidth={1.5}
          fill="rgba(255,59,92,0.18)"
          style={{ filter: 'drop-shadow(0 0 28px rgba(255,59,92,0.65))' }}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, letterSpacing: '0.6em' }}
        animate={{ opacity: 1, letterSpacing: '0.32em' }}
        transition={{ delay: 0.35, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="font-gaming mt-6 text-red font-extrabold text-xs sm:text-sm uppercase"
        style={{ textShadow: '0 0 14px rgba(255,59,92,0.7)' }}
      >
        ⚠ Alerte · Opération déclarée
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 14, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 220, damping: 18 }}
        className="font-display font-black text-white mt-3 leading-[0.95] text-[clamp(2.6rem,12vw,5.5rem)]"
        style={{
          textShadow: '0 0 40px rgba(255,59,92,0.55)',
          animation: 'ops-glitch 2.4s steps(2) infinite',
        }}
      >
        TU ES
        <br />
        UNE CIBLE
      </motion.h1>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        transition={{ delay: 1.1, duration: 0.6 }}
        className="mt-7 text-[10px] uppercase tracking-[0.3em] text-red/70 font-mono"
      >
        Toucher pour continuer
      </motion.div>
    </motion.div>
  );
}

// ─── Phase 2 : briefing des règles ─────────────────────────────────────────────
function BriefContent({
  hunterLogin,
  hunterImg,
  expiresAt,
  onDismiss,
}: {
  hunterLogin: string;
  hunterImg: string | null;
  expiresAt: string;
  onDismiss: () => void;
}) {
  const rules: { Icon: typeof Swords; text: ReactNode }[] = [
    {
      Icon: Clock,
      text: (
        <>
          La traque dure <span className="text-white font-bold">24 heures</span> —{' '}
          <span className="text-red font-mono">{fmtCountdown(expiresAt)}</span> restantes.
        </>
      ),
    },
    {
      Icon: Swords,
      text: (
        <>
          Tu ne peux pas refuser ses{' '}
          <span className="text-white font-bold">{OPS_FORCED_MATCHES} prochains défis</span>. Il
          faut les jouer.
        </>
      ),
    },
    {
      Icon: Flame,
      text: (
        <>
          Refuser un match forcé coûte{' '}
          <span className="text-red font-bold">3× l'ELO d'une défaite</span>. Mieux vaut se
          battre.
        </>
      ),
    },
  ];

  return (
    <motion.div
      className="relative z-10 flex flex-col items-center text-center w-full max-w-sm"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Avatar du traqueur cerclé d'un viseur tournant */}
      <div className="relative mb-5">
        <div
          className="absolute -inset-3 rounded-full border-2 border-red/40 border-dashed"
          style={{ animation: 'ops-ring-spin 7s linear infinite' }}
        />
        <Crosshair
          className="absolute -inset-3 m-auto w-[calc(100%+24px)] h-[calc(100%+24px)] text-red/30"
          strokeWidth={1}
        />
        <div
          className="rounded-full"
          style={{ boxShadow: '0 0 0 3px rgba(255,59,92,0.5), 0 0 30px rgba(255,59,92,0.45)' }}
        >
          <Avatar login={hunterLogin} imageUrl={hunterImg} size="xl" />
        </div>
      </div>

      <div className="font-gaming text-[10px] uppercase tracking-[0.3em] text-red/80 font-extrabold mb-1.5">
        Ennemi juré
      </div>
      <h2 className="font-display font-black text-white text-2xl mb-1">{hunterLogin}</h2>
      <p className="text-sm text-muted leading-relaxed mb-6">
        t'a déclaré comme son <span className="text-red font-bold">ops</span>. La chasse est
        ouverte.
      </p>

      {/* Règles */}
      <div className="w-full space-y-2.5 mb-7">
        {rules.map(({ Icon, text }, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 + i * 0.12, duration: 0.35 }}
            className="flex items-start gap-3 text-start p-3 rounded-xl border border-red/25 bg-red/[0.06]"
          >
            <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-red/15 border border-red/30 flex items-center justify-center">
              <Icon className="w-4 h-4 text-red" strokeWidth={2.4} />
            </span>
            <span className="text-[13px] text-muted leading-snug self-center">{text}</span>
          </motion.div>
        ))}
      </div>

      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.35 }}
        onClick={onDismiss}
        className="font-gaming w-full py-3.5 rounded-xl bg-gradient-to-b from-red to-[#c41f3a] text-white font-extrabold text-sm uppercase tracking-[0.14em] active:scale-[0.98] transition-transform"
        style={{ boxShadow: '0 8px 28px -6px rgba(255,59,92,0.6), inset 0 1px 0 rgba(255,255,255,0.2)' }}
      >
        Que la traque commence →
      </motion.button>
    </motion.div>
  );
}
