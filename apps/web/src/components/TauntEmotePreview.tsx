import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Aperçu animé d'une émote de victoire — joué quand le joueur en sélectionne une
 * dans le picker, pour montrer l'animation qu'elle déclenchera après un 1v1.
 * Reprend le langage visuel de TauntOverlay (rebond + wiggle + halo + sparks)
 * mais en version courte et non bloquante (pointer-events-none), auto-fermée.
 */
const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2;
  return { x: Math.cos(angle) * 130, y: Math.sin(angle) * 130, d: 0.04 * i };
});

// Émotes SATELLITES : des exemplaires plus petits de la même émote, en grappe
// autour de celle du centre → l'aperçu montre une volée d'émotes, pas une seule.
const SATELLITES = [
  { x: -118, y: -18, size: 'clamp(40px, 9vw, 66px)', d: 0.05, dur: 1.5 },
  { x: 118, y: -18, size: 'clamp(40px, 9vw, 66px)', d: 0.12, dur: 1.7 },
  { x: -92, y: 84, size: 'clamp(32px, 7vw, 52px)', d: 0.18, dur: 1.6 },
  { x: 92, y: 84, size: 'clamp(32px, 7vw, 52px)', d: 0.24, dur: 1.8 },
  { x: 4, y: -120, size: 'clamp(28px, 6vw, 44px)', d: 0.3, dur: 1.55 },
];

export function TauntEmotePreview({ emote, onDone }: { emote: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!emote) return;
    const timer = setTimeout(onDone, 1500);
    return () => clearTimeout(timer);
  }, [emote, onDone]);

  return createPortal(
    <AnimatePresence>
      {emote && (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[125] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Voile discret pour détacher l'émote du fond */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(6,8,12,0.55), rgba(6,8,12,0.2) 40%, transparent 70%)' }} />

          {/* Halo pulsant derrière l'émote */}
          <motion.div
            className="absolute rounded-full"
            style={{ width: 220, height: 220, background: 'radial-gradient(circle, rgba(255,201,74,0.45), transparent 68%)' }}
            initial={{ scale: 0.2, opacity: 0 }}
            animate={{ scale: 1.15, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 14 }}
          />

          {/* Sparks projetées */}
          {SPARKS.map((s, i) => (
            <motion.span
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{ background: '#ffd873', boxShadow: '0 0 8px #ffbf20' }}
              initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
              animate={{ x: s.x, y: s.y, scale: [0, 1, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 0.9, delay: 0.1 + s.d, ease: 'easeOut' }}
            />
          ))}

          {/* Émotes satellites : la même émote, plus petite, tout autour du centre */}
          {SATELLITES.map((s, i) => (
            <motion.span
              key={`sat-${i}`}
              className="absolute leading-none"
              style={{ top: '50%', left: '50%', translate: '-50% -50%', fontSize: s.size, filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.45))' }}
              initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
              animate={{ x: s.x, y: s.y, scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 15, delay: 0.12 + s.d }}
            >
              <span className="inline-block" style={{ animation: `tauntFloat ${s.dur}s ease-in-out infinite alternate`, animationDelay: `${s.d}s` }}>
                {emote}
              </span>
            </motion.span>
          ))}

          {/* L'émote : rebond spring puis wiggle en boucle */}
          <motion.div
            className="relative leading-none"
            style={{ fontSize: 'clamp(90px, 20vw, 150px)' }}
            initial={{ scale: 0.1, rotate: -18, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 12 }}
          >
            <span className="inline-block" style={{ animation: 'tauntWiggle 0.9s ease-in-out infinite alternate' }}>
              {emote}
            </span>
          </motion.div>

          <style>{`
            @keyframes tauntWiggle {
              from { transform: rotate(-7deg) scale(1); }
              to   { transform: rotate(7deg) scale(1.08); }
            }
            @keyframes tauntFloat {
              from { transform: translateY(3px) rotate(-10deg); }
              to   { transform: translateY(-7px) rotate(10deg); }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
