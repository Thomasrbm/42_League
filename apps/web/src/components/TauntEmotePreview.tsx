import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { tauntPhrase } from '../lib/tauntEmotes';

/**
 * Aperçu animé d'une émote de victoire — joué quand le joueur en sélectionne une
 * dans le picker, pour montrer EXACTEMENT ce que verra l'adversaire après un 1v1 :
 * même langage visuel que TauntOverlay (rebond + wiggle + halo + sparks + grappe
 * de satellites + PLUIE d'émojis plein écran + punchline troll), mais en version
 * courte et non bloquante (pointer-events-none), auto-fermée.
 */
const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2;
  return { x: Math.cos(angle) * 130, y: Math.sin(angle) * 130, d: 0.04 * i };
});

// Pluie d'émojis (nappe de fond) — mêmes règles déterministes que TauntOverlay
// pour que l'aperçu colle au rendu réel. 18 gouttes réparties sur la largeur.
const RAIN = Array.from({ length: 18 }, (_, i) => {
  const r1 = ((i * 9301 + 49297) % 233280) / 233280;
  const r2 = ((i * 4021 + 12345) % 100) / 100;
  return {
    left: (i / 18) * 100 + (r1 * 7 - 3.5),
    size: 20 + Math.round(r2 * 28),
    delay: r1 * 0.9,
    dur: 2.2 + r2 * 1.4,
    drift: (r1 - 0.5) * 60,
    rot: (r2 - 0.5) * 150,
  };
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

export function TauntEmotePreview({
  emote,
  winner = 'Toi',
  onDone,
}: {
  emote: string | null;
  /** Nom affiché comme vainqueur dans la punchline (par défaut le joueur courant). */
  winner?: string;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!emote) return;
    const timer = setTimeout(onDone, 2400);
    return () => clearTimeout(timer);
  }, [emote, onDone]);

  // Punchline troll figée pour cette émote (seed = l'émote → stable au replay).
  const phrase = emote ? tauntPhrase(emote, winner, emote) : '';

  return createPortal(
    <AnimatePresence>
      {emote && (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[125] flex flex-col items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Voile discret pour détacher l'émote du fond */}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(6,8,12,0.62), rgba(6,8,12,0.28) 40%, transparent 72%)' }} />

          {/* Pluie d'émojis de victoire — nappe de fond plein écran */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {RAIN.map((r, i) => (
              <motion.span
                key={i}
                className="absolute top-0 will-change-transform leading-none"
                style={{ left: `${r.left}%`, fontSize: r.size, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }}
                initial={{ y: '-14vh', opacity: 0, rotate: 0 }}
                animate={{ y: '114vh', x: r.drift, rotate: r.rot, opacity: [0, 0.9, 0.9, 0] }}
                transition={{ duration: r.dur, delay: r.delay, ease: 'easeIn', repeat: Infinity }}
              >
                {emote}
              </motion.span>
            ))}
          </div>

          {/* Émote + halo + sparks + satellites, groupés et centrés ensemble */}
          <div className="relative flex items-center justify-center leading-none">
            {/* Halo pulsant derrière l'émote */}
            <motion.div
              className="absolute top-1/2 left-1/2 rounded-full pointer-events-none"
              style={{ width: 220, height: 220, translate: '-50% -50%', background: 'radial-gradient(circle, rgba(255,201,74,0.45), transparent 68%)' }}
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: 1.15, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 14 }}
            />

            {/* Sparks projetées depuis le centre */}
            {SPARKS.map((s, i) => (
              <motion.span
                key={i}
                className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full"
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
          </div>

          {/* Punchline troll — ce que lira l'adversaire narguté */}
          <motion.div
            className="relative mt-6 max-w-[min(90vw,420px)] text-center font-gaming font-black italic uppercase text-lg sm:text-xl leading-tight"
            style={{ color: '#fff', transform: 'skewX(-5deg)', textShadow: '0 2px 16px rgba(255,201,74,0.6)' }}
            initial={{ y: 18, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 240, damping: 15 }}
          >
            {phrase}
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
