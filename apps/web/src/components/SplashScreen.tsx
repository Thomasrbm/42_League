import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

// ── Static data ──────────────────────────────────────────────────────────────

const CHESS_CORNERS = [
  { piece: '♔', left: '2%',  top: '13%', size: 48, rotate: -10, color: '#ffc94a' },
  { piece: '♛', left: '88%', top: '11%', size: 44, rotate:  13, color: '#00d9dc' },
  { piece: '♚', left: '2%',  top: '76%', size: 40, rotate:  -5, color: '#00d9dc' },
  { piece: '♟', left: '89%', top: '75%', size: 36, rotate:   8, color: '#ffc94a' },
] as const;

const BURST_LINES = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  angle: (i * 360) / 8,
  width: i % 2 === 0 ? '50vmax' : '38vmax',
  thickness: i % 3 === 0 ? 2 : 1,
  color:
    i % 3 === 0
      ? 'rgba(255,201,74,0.22)'
      : i % 3 === 1
        ? 'rgba(0,217,220,0.18)'
        : 'rgba(255,255,255,0.08)',
}));

const BABY_RODS = [
  { y: '28%', players: [0.08, 0.32, 0.58, 0.82] },
  { y: '72%', players: [0.15, 0.45, 0.75] },
] as const;

const SECTION_PILLS = [
  { icon: '⚽', label: 'DÉFIS',    color: '#ffc94a', delay: 0      },
  { icon: '♟',  label: 'RANK',     color: '#00d9dc', delay: 0.04   },
  { icon: '🏆', label: 'TOURNOIS', color: '#ffc94a', delay: 0.08   },
  { icon: '📊', label: 'STATS',    color: '#00d9dc', delay: 0.12   },
] as const;

const TABS = [
  { icon: '⚽', active: true  },
  { icon: '🏆', active: false },
  { icon: '📊', active: false },
  { icon: '👤', active: false },
  { icon: '···', active: false },
];

const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const rad = ((i * 360) / 8 * Math.PI) / 180;
  return {
    id: i,
    tx: Math.cos(rad) * 52,
    ty: Math.sin(rad) * 52,
    color: i % 2 === 0 ? '#ffc94a' : '#00d9dc',
  };
});

// ── Component ─────────────────────────────────────────────────────────────────

interface SplashScreenProps {
  onComplete: () => void;
}

/**
 * Splash ultra-rapide.
 *
 * - Démarre immédiatement (pas de gate preload)
 * - Image logo chargée en parallèle ; apparaît dès qu'elle est prête
 * - Timeline compressée ~650ms
 * - `onComplete` signale que l'animation est finie ; App.tsx attend en plus
 *   que les données soient chargées avant de couper le splash
 */
export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase]   = useState(0);
  const [imgOk, setImgOk]   = useState(false);
  const reduce = useReducedMotion();
  const decor  = !reduce;
  // Évite d'appeler onComplete deux fois si le composant re-render
  const doneCalled = useRef(false);

  // ── Préchargement image en parallèle (sans gater l'animation) ──────────────
  useEffect(() => {
    const img   = new Image();
    const done  = () => setImgOk(true);
    img.onload  = done;
    img.onerror = done;
    img.src     = '/apple-touch-icon.png';
    // Si l'image prend trop longtemps → on l'affiche quand même (texte suffit)
    const failsafe = setTimeout(done, 500);
    return () => clearTimeout(failsafe);
  }, []);

  // ── Timeline d'animation (démarre immédiatement) ───────────────────────────
  useEffect(() => {
    // Phase 1 : background décoratif + squelettes header/tabbar
    setPhase(1);

    // Phase 2 : logo + flash + shockwave (si image pas encore prête → logo
    // apparaît quand imgOk devient true, grâce au rendu conditionnel séparé)
    const t2 = setTimeout(() => setPhase(2),  40);
    // Phase 3 : texte LEAGUE
    const t3 = setTimeout(() => setPhase(3), 180);
    // Phase 4 : pills sections
    const t4 = setTimeout(() => setPhase(4), 300);
    // Signal « animation finie » → App.tsx peut couper le splash dès que les
    // données sont aussi prêtes
    const t5 = setTimeout(() => {
      if (!doneCalled.current) { doneCalled.current = true; onComplete(); }
    }, 680);

    return () => [t2, t3, t4, t5].forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // volontairement vide : on ne re-lance pas la timeline

  return (
    <motion.div
      className="fixed inset-0 z-[9999] overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse 120% 65% at 50% -5%, #0a2020 0%, #090b10 50%, #090b10 100%)',
        cursor: 'pointer',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      exit={{ opacity: 0, transition: { duration: 0.32, ease: 'easeInOut' } }}
      onClick={() => { if (!doneCalled.current) { doneCalled.current = true; onComplete(); } }}
    >
      {/* ── Grid discret ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,217,220,0.025) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(0,217,220,0.025) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* ── Tiges babyfoot ── */}
      {decor && phase >= 1 &&
        BABY_RODS.map((rod, ri) => (
          <motion.div
            key={ri}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top: rod.y, height: 1, zIndex: 1 }}
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1], delay: ri * 0.03 }}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,201,74,0.08)' }} />
            {rod.players.map((pos, pi) => (
              <div
                key={pi}
                style={{
                  position: 'absolute',
                  left: `${pos * 100}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 10, height: 10,
                  borderRadius: '50%',
                  border: '1.5px solid rgba(255,201,74,0.18)',
                  background: 'rgba(255,201,74,0.05)',
                }}
              />
            ))}
          </motion.div>
        ))}

      {/* ── Starburst ── */}
      {decor && phase >= 1 &&
        BURST_LINES.map((line) => (
          <motion.div
            key={line.id}
            className="absolute pointer-events-none"
            style={{
              left: '50%', top: '46%',
              width: line.width,
              height: line.thickness + 'px',
              background: `linear-gradient(90deg, ${line.color}, transparent)`,
              transformOrigin: 'left center',
              rotate: line.angle,
              zIndex: 1,
            }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1], delay: line.id * 0.012 }}
          />
        ))}

      {/* ── Pièces d'échecs (coins) ── */}
      {decor && phase >= 1 &&
        CHESS_CORNERS.map((item, i) => (
          <motion.div
            key={i}
            className="absolute pointer-events-none"
            style={{
              left: item.left, top: item.top,
              fontSize: item.size,
              fontFamily: 'Georgia, serif',
              color: item.color,
              filter: `drop-shadow(0 0 10px ${item.color}70)`,
              rotate: item.rotate,
              zIndex: 2,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.22 }}
            transition={{ duration: 0.18, ease: 'easeOut', delay: i * 0.04 }}
          />
        ))}

      {/* ── Header skeleton ── */}
      {phase >= 1 && (
        <motion.div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: 0, height: 50, zIndex: 3,
            background: 'rgba(255,201,74,0.04)',
            borderBottom: '1px solid rgba(255,201,74,0.12)',
            display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
          }}
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,201,74,0.15)' }} />
          <div>
            <div style={{ width: 70, height: 7, borderRadius: 3, background: 'rgba(255,255,255,0.12)' }} />
            <div style={{ width: 44, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', marginTop: 4 }} />
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(0,217,220,0.20)', background: 'rgba(0,217,220,0.04)' }} />
            <div style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(0,217,220,0.20)', background: 'rgba(0,217,220,0.04)' }} />
          </div>
        </motion.div>
      )}

      {/* ── Tab bar skeleton ── */}
      {phase >= 1 && (
        <motion.div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            bottom: 0, height: 64, zIndex: 3,
            background: 'rgba(0,217,220,0.03)',
            borderTop: '1px solid rgba(0,217,220,0.10)',
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-around', padding: '0 8px',
          }}
          initial={{ opacity: 0, y: 64 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {TABS.map((tab, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: tab.active ? 0.75 : 0.25 }}>
              <span style={{ fontSize: 14 }}>{tab.icon}</span>
              <div style={{ width: tab.active ? 18 : 4, height: 3, borderRadius: 2, background: tab.active ? '#ffc94a' : 'rgba(255,255,255,0.25)' }} />
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Flash d'impact ── */}
      {phase >= 2 && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: '#ffffff', zIndex: 8 }}
          initial={{ opacity: 0.25 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
        />
      )}

      {/* ── Shockwave ring ── */}
      {decor && phase >= 2 && (
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{
            left: '50%', top: '46%',
            width: 110, height: 110,
            marginLeft: -55, marginTop: -55,
            border: '2px solid rgba(255,201,74,0.75)',
            zIndex: 9,
          }}
          initial={{ scale: 1, opacity: 0.9 }}
          animate={{ scale: 5.5, opacity: 0 }}
          transition={{ duration: 0.38, ease: 'easeOut' }}
        />
      )}

      {/* ── Particules d'impact ── */}
      {decor && phase >= 2 &&
        SPARKS.map((spark) => (
          <motion.div
            key={spark.id}
            className="absolute pointer-events-none rounded-full"
            style={{
              left: '50%', top: '46%',
              width: 5, height: 5,
              background: spark.color,
              boxShadow: `0 0 6px ${spark.color}`,
              marginLeft: -2.5, marginTop: -2.5,
              zIndex: 10,
            }}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{ x: spark.tx, y: spark.ty, scale: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        ))}

      {/* ── Logo + LEAGUE + pills (centre absolu) ── */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        style={{ gap: 6, transform: 'translateY(-5%)' }}
      >
        {/* Logo — apparaît dès que l'image est prête ET que phase >= 2 */}
        <AnimatePresence>
          {phase >= 2 && imgOk && (
            <motion.img
              key="logo"
              src="/apple-touch-icon.png"
              alt="42 League"
              style={{
                width: 112, height: 112,
                borderRadius: 24,
                filter:
                  'drop-shadow(0 0 22px rgba(0,217,220,0.60))' +
                  ' drop-shadow(0 0 50px rgba(255,183,27,0.55))',
                zIndex: 11,
              }}
              initial={{ scale: 0.1, y: -200, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 680, damping: 32, mass: 0.75 }}
            />
          )}
        </AnimatePresence>

        {/* LEAGUE — wipe gauche → droite */}
        {phase >= 3 && (
          <motion.div
            style={{ zIndex: 11, overflow: 'hidden' }}
            initial={{ clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: 'inset(0 0% 0 0)' }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <span
              style={{
                fontFamily: '"Orbitron", "Rajdhani", sans-serif',
                fontSize: '2.2rem',
                fontWeight: 900,
                letterSpacing: '0.14em',
                color: '#00d9dc',
                display: 'block',
                whiteSpace: 'nowrap',
                textShadow:
                  '0 0 18px rgba(0,217,220,0.95), 0 0 44px rgba(0,217,220,0.55)',
              }}
            >
              LEAGUE
            </span>
          </motion.div>
        )}

        {/* Pills sections — staggerées naturellement */}
        {phase >= 4 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, zIndex: 11 }}>
            {SECTION_PILLS.map((pill) => (
              <motion.div
                key={pill.label}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 20,
                  border: `1px solid ${pill.color}40`,
                  background: `${pill.color}0d`,
                  backdropFilter: 'blur(4px)',
                }}
                initial={{ opacity: 0, y: 12, scale: 0.88 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.24, delay: pill.delay, ease: [0.16, 1, 0.3, 1] }}
              >
                <span style={{ fontSize: 13 }}>{pill.icon}</span>
                <span
                  style={{
                    fontFamily: '"Rajdhani", "Orbitron", sans-serif',
                    fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.12em',
                    color: `${pill.color}cc`,
                  }}
                >
                  {pill.label}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
