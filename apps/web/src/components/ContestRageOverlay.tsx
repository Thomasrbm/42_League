import { autoCinematicsEnabled } from '../lib/cinematics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useT } from '../lib/i18n';
import { useServerEvents } from '../hooks/useServerEvents';
import { CONTEST_RAGE_EVENT, type ContestRageRole } from '../lib/contestRage';
import { haptic } from '../mobile/feedback/useHaptic';

// ─────────────────────────────────────────────────────────────────────────────
// Réaction « RAGE » de contestation — plein écran, non bloquante (pointer-events
// none, auto-dismiss ~2,2 s). Un gros émoji énervé s'écrase à l'écran dans une
// onde de choc rouge, avec une pluie d'émojis qui jaillit. S'affiche des DEUX
// côtés d'un litige :
//   • le contesteur — déclenché localement au succès de l'API (lib/api.ts →
//     fireContestRage('sender')) ;
//   • le contesté — déclenché ici à la réception de l'event SSE.
// ─────────────────────────────────────────────────────────────────────────────

const SSE_TYPES = ['match:rejected', 'ffa:contested', 'darts:contested'];

const HERO = '🤬';
// Émojis projetés en gerbe autour du visage.
const BURST_EMOJIS = ['😡', '🤬', '💢', '👿', '😤'];
// Angles (deg) de la gerbe — répartis tout autour, distances/tailles variées.
const BURST = [
  { angle: -90, dist: 150, size: '2.1rem', delay: 0.02 },
  { angle: -50, dist: 170, size: '1.5rem', delay: 0.08 },
  { angle: -18, dist: 140, size: '1.8rem', delay: 0.05 },
  { angle: 20, dist: 175, size: '1.4rem', delay: 0.1 },
  { angle: 55, dist: 150, size: '2rem', delay: 0.04 },
  { angle: 92, dist: 165, size: '1.5rem', delay: 0.09 },
  { angle: 135, dist: 155, size: '1.9rem', delay: 0.06 },
  { angle: 168, dist: 145, size: '1.4rem', delay: 0.11 },
  { angle: -135, dist: 168, size: '1.7rem', delay: 0.03 },
].map((b, i) => ({ ...b, emoji: BURST_EMOJIS[i % BURST_EMOJIS.length] }));

const KEYFRAMES = `
@keyframes rage-shake {
  0%,100% { transform: translate(0,0) rotate(-3.5deg); }
  25% { transform: translate(-3px,1.5px) rotate(3.5deg); }
  50% { transform: translate(3px,-1.5px) rotate(-2.5deg); }
  75% { transform: translate(-1.5px,-1.5px) rotate(2.5deg); }
}
`;

export function ContestRageOverlay() {
  const t = useT();
  // `id` force le remount (AnimatePresence rejoue) si un litige enchaîne l'autre.
  const [active, setActive] = useState<{ id: number; role: ContestRageRole } | null>(null);
  const counter = useRef(0);

  const trigger = useCallback((role: ContestRageRole) => {
    if (!autoCinematicsEnabled()) return;
    counter.current += 1;
    setActive({ id: counter.current, role });
    haptic('error');
  }, []);

  // Côté contesteur : CustomEvent dispatché depuis la couche API.
  useEffect(() => {
    const onRage = (e: Event) => {
      const role = (e as CustomEvent).detail?.role as ContestRageRole | undefined;
      trigger(role ?? 'sender');
    };
    window.addEventListener(CONTEST_RAGE_EVENT, onRage);
    return () => window.removeEventListener(CONTEST_RAGE_EVENT, onRage);
  }, [trigger]);

  // Côté contesté : event SSE temps réel (faible debounce pour rester punchy).
  // `fireOnReopen: false` → l'animation ne se rejoue PAS à chaque retour de focus
  // / changement de page (sinon le rattrapage SSE la redéclenche sans contestation).
  useServerEvents(() => trigger('receiver'), SSE_TYPES, {
    debounceMs: 50,
    fireOnReopen: false,
  });

  // Auto-dismiss.
  useEffect(() => {
    if (!active) return;
    const to = setTimeout(() => setActive(null), 2200);
    return () => clearTimeout(to);
  }, [active]);

  const title =
    active?.role === 'receiver'
      ? t('defis.contestRageTitleReceiver')
      : t('defis.contestRageTitleSender');
  const sub =
    active?.role === 'receiver'
      ? t('defis.contestRageSubReceiver')
      : t('defis.contestRageSubSender');

  return createPortal(
    <>
      <style>{KEYFRAMES}</style>
      <AnimatePresence>
        {active && (
          <motion.div
            key={active.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.35 } }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 2147483600,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          >
            {/* Flash rouge + vignette qui pulse une fois. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.4, 0.18] }}
              transition={{ duration: 2.2, times: [0, 0.1, 0.4, 1], ease: 'easeOut' }}
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'radial-gradient(120% 90% at 50% 46%, rgba(255,40,70,0.42) 0%, rgba(120,0,16,0.55) 38%, rgba(4,2,4,0.86) 100%)',
              }}
            />

            {/* Ondes de choc concentriques. */}
            {[0, 0.12, 0.24].map((d, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0.2, opacity: 0.75 }}
                animate={{ scale: 4.6, opacity: 0 }}
                transition={{ duration: 1.1, delay: d, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: 'absolute',
                  width: 150,
                  height: 150,
                  borderRadius: '9999px',
                  border: '2px solid rgba(255,75,100,0.7)',
                  boxShadow: '0 0 30px rgba(255,59,92,0.5)',
                }}
              />
            ))}

            {/* Gerbe d'émojis projetés. */}
            {BURST.map((b, i) => {
              const rad = (b.angle * Math.PI) / 180;
              const dx = Math.cos(rad) * b.dist;
              const dy = Math.sin(rad) * b.dist;
              return (
                <motion.span
                  key={i}
                  initial={{ x: 0, y: 0, scale: 0.3, opacity: 0, rotate: 0 }}
                  animate={{
                    x: dx,
                    y: dy,
                    scale: [0.3, 1.15, 0.85],
                    opacity: [0, 1, 0],
                    rotate: b.angle > 0 ? 220 : -220,
                  }}
                  transition={{ duration: 1.5, delay: b.delay, ease: [0.18, 0.9, 0.3, 1] }}
                  style={{
                    position: 'absolute',
                    fontSize: b.size,
                    filter: 'drop-shadow(0 2px 6px rgba(255,40,70,0.55))',
                  }}
                >
                  {b.emoji}
                </motion.span>
              );
            })}

            {/* Émoji héros qui s'écrase + tremble de rage. */}
            <motion.div
              className="relative z-10"
              initial={{ scale: 0.15, rotate: -28, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 13, mass: 1.1 }}
            >
              <div
                style={{
                  fontSize: 'clamp(5rem, 26vw, 10rem)',
                  lineHeight: 1,
                  animation: 'rage-shake 0.3s ease-in-out infinite',
                  filter: 'drop-shadow(0 0 34px rgba(255,59,92,0.75))',
                }}
              >
                {HERO}
              </div>
            </motion.div>

            {/* Libellé. */}
            <motion.div
              className="relative z-10 mt-5 flex flex-col items-center text-center px-6"
              initial={{ opacity: 0, y: 16, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.18, type: 'spring', stiffness: 240, damping: 18 }}
            >
              <div
                className="font-display font-black text-white uppercase leading-none"
                style={{
                  fontSize: 'clamp(1.8rem, 9vw, 3.4rem)',
                  letterSpacing: '0.04em',
                  textShadow: '0 0 30px rgba(255,59,92,0.7), 0 2px 10px rgba(0,0,0,0.6)',
                }}
              >
                {title}
              </div>
              <div
                className="font-gaming mt-2 text-red font-extrabold uppercase"
                style={{
                  fontSize: 'clamp(0.7rem, 3.4vw, 0.95rem)',
                  letterSpacing: '0.22em',
                  textShadow: '0 0 14px rgba(255,59,92,0.6)',
                }}
              >
                {sub}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
