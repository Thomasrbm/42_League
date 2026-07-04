import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useRankUp } from '../hooks/useRankUp';
import { clearRankUp, type RankUp } from '../lib/rankUp';
import { tierImage } from '../lib/tierImages';
import { useT } from '../lib/i18n';
import { playThunder } from '../lib/thunder';
import { makeBolt } from '../lib/lightning';
import { haptic } from '../mobile/feedback/useHaptic';

// ─────────────────────────────────────────────────────────────────────────────
// Cinématique « PASSAGE DE RANG » — déclenchée quand l'ELO franchit un palier
// supérieur (cf. détection dans LeagueDataProvider, store lib/rankUp.ts).
//
// Un seul temps fort, frontal : l'emblème du nouveau grade arrive de « devant »
// (énorme, hors champ) et CLAQUE au centre de l'écran — flash blanc, secousse,
// tonnerre, ONDE DE CHOC concentrique et ÉCLAIRS fractals qui rayonnent du point
// d'impact. Puis le nom du grade s'affiche en dégradé, et tout s'éteint.
// ─────────────────────────────────────────────────────────────────────────────

const IMPACT_MS = 420; // l'emblème touche l'écran (flash + onde + éclairs)
const TOTAL_MS = 4200; // auto-fermeture

export function RankUpOverlay() {
  const rankUp = useRankUp();
  return (
    <AnimatePresence>{rankUp && <RankUpScene key={rankUp.nonce} rankUp={rankUp} />}</AnimatePresence>
  );
}

function RankUpScene({ rankUp }: { rankUp: RankUp }) {
  const t = useT();
  const dismissed = useRef(false);
  const { tier, fromTier, game } = rankUp;
  const color = tier.color;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const cx = vw / 2;
  const cy = vh * 0.42; // l'emblème claque légèrement au-dessus du centre (texte dessous)

  // Éclairs : 6 branches fractales qui rayonnent du point d'impact vers les bords.
  const bolts = useMemo(() => {
    const radius = Math.max(vw, vh) * 0.62;
    return Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
      const x1 = cx + Math.cos(angle) * radius;
      const y1 = cy + Math.sin(angle) * radius;
      return makeBolt(cx, cy, x1, y1, 110, 5);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankUp.nonce]);

  function done() {
    if (dismissed.current) return;
    dismissed.current = true;
    clearRankUp();
  }

  // L'impact : tonnerre + haptique pile quand l'emblème touche l'écran.
  useEffect(() => {
    const boom = setTimeout(() => {
      playThunder();
      haptic('heavy');
    }, IMPACT_MS);
    const close = setTimeout(done, TOTAL_MS);
    return () => {
      clearTimeout(boom);
      clearTimeout(close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const impact = IMPACT_MS / 1000;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[2147483646] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
      transition={{ duration: 0.15 }}
      onClick={done}
      role="dialog"
      aria-modal="true"
      style={{ cursor: 'pointer' }}
    >
      {/* Fond sombre teinté du grade */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 42%, ${color}26, rgba(3,3,7,0.93) 62%), rgba(4,4,8,0.94)`,
        }}
      />

      {/* Rayons d'énergie derrière l'emblème */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `repeating-conic-gradient(from 0deg at 50% 42%, ${color}1f 0deg, transparent 5deg 11deg)`,
          maskImage: 'radial-gradient(circle at 50% 42%, black, transparent 60%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 42%, black, transparent 60%)',
        }}
        initial={{ opacity: 0, rotate: 0 }}
        animate={{ opacity: 0.45, rotate: 14 }}
        transition={{ delay: impact, duration: 3, ease: 'linear' }}
      />

      {/* Secousse d'écran à l'impact : tout le contenu tremble */}
      <motion.div
        className="absolute inset-0"
        animate={{
          x: [0, 0, -16, 13, -9, 6, -3, 0],
          y: [0, 0, 9, -7, 5, -3, 2, 0],
        }}
        transition={{ duration: impact + 0.5, times: [0, impact / (impact + 0.5), 0.62, 0.72, 0.8, 0.88, 0.94, 1] }}
      >
        {/* Flash blanc stroboscopé à l'impact */}
        <motion.div
          className="absolute inset-0"
          style={{ background: '#ffffff' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 1, 0.15, 0.7, 0, 0.25, 0] }}
          transition={{
            duration: impact + 0.55,
            times: [0, impact / (impact + 0.55), 0.66, 0.72, 0.78, 0.86, 0.92, 1],
            ease: 'linear',
          }}
        />

        {/* ONDE DE CHOC : 3 anneaux concentriques qui partent du point d'impact */}
        {[0, 0.09, 0.2].map((d, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left: cx,
              top: cy,
              width: 80,
              height: 80,
              marginLeft: -40,
              marginTop: -40,
              border: `${i === 0 ? 5 : 3}px solid ${i === 0 ? '#ffffff' : color}`,
              boxShadow: `0 0 40px ${color}aa, inset 0 0 30px ${color}66`,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, (Math.max(vw, vh) / 80) * 1.4], opacity: [0.95, 0] }}
            transition={{ delay: impact + d, duration: 0.9 + i * 0.15, ease: [0.1, 0.8, 0.3, 1] }}
          />
        ))}

        {/* Halo coloré qui pulse au point d'impact */}
        <motion.div
          className="absolute"
          style={{
            left: cx,
            top: cy,
            width: 640,
            height: 640,
            marginLeft: -320,
            marginTop: -320,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${color}cc 0%, ${color}44 22%, transparent 62%)`,
            mixBlendMode: 'screen',
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.15, 1.45], opacity: [0, 1, 0] }}
          transition={{ delay: impact, duration: 0.75, ease: 'easeOut' }}
        />

        {/* ÉCLAIRS fractals qui rayonnent du point d'impact */}
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none">
          <defs>
            <filter id="rankBoltGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {bolts.map((d, i) => (
            <g key={i} filter="url(#rankBoltGlow)">
              <motion.path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={7}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.7}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: [0, 0.9, 0.25, 0.6, 0] }}
                transition={{ delay: impact + i * 0.035, duration: 0.55, times: [0, 0.15, 0.32, 0.5, 1] }}
              />
              <motion.path
                d={d}
                fill="none"
                stroke="#ffffff"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: [0, 1, 0.3, 0.85, 0] }}
                transition={{ delay: impact + i * 0.035, duration: 0.55, times: [0, 0.12, 0.32, 0.5, 1] }}
              />
            </g>
          ))}
        </svg>

        {/* L'EMBLÈME : arrive énorme de « devant » et CLAQUE au centre */}
        <motion.div
          className="absolute z-10"
          style={{ left: cx, top: cy, marginLeft: -90, marginTop: -90 }}
          initial={{ scale: 4.6, opacity: 0, rotate: -16 }}
          animate={{ scale: [4.6, 1, 1.12, 1], opacity: [0, 1, 1, 1], rotate: [-16, 2, -1, 0] }}
          transition={{ duration: impact + 0.32, times: [0, impact / (impact + 0.32), 0.82, 1], ease: [0.2, 0.9, 0.2, 1] }}
        >
          <span
            className="flex items-center justify-center overflow-hidden rounded-full"
            style={{
              width: 180,
              height: 180,
              background: `${color}24`,
              border: `3px solid ${color}`,
              boxShadow: `0 0 60px ${color}99, 0 0 140px ${color}55, inset 0 0 40px ${color}33`,
            }}
          >
            <img
              src={tierImage(tier.key)}
              alt={tier.label}
              draggable={false}
              className="h-full w-full select-none object-cover"
            />
          </span>
        </motion.div>
      </motion.div>

      {/* Textes — apparaissent après l'impact */}
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: cy + 130 }}>
        <motion.div
          className="font-display text-[11px] font-black uppercase tracking-[0.34em] md:text-sm"
          style={{ color }}
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: impact + 0.25, type: 'spring', stiffness: 240, damping: 18 }}
        >
          {t('rankup.title')}
        </motion.div>
        <motion.div
          className="mt-1 font-display text-5xl font-black uppercase italic md:text-7xl"
          style={{
            background: `linear-gradient(180deg, #ffffff 0%, ${color} 58%, #1a1208 130%)`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: `drop-shadow(0 2px 18px ${color}aa)`,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.25, 1], opacity: 1 }}
          transition={{ delay: impact + 0.32, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {tier.label}
        </motion.div>
        {(fromTier || game) && (
          <motion.div
            className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-2 md:text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.85 }}
            transition={{ delay: impact + 0.55 }}
          >
            {fromTier ? `${fromTier.label} → ${tier.label}` : null}
            {fromTier && game ? ' · ' : null}
            {game ? t(`game.${game}`) : null}
          </motion.div>
        )}
        <motion.div
          className="mt-8 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: impact + 1 }}
        >
          {t('defis.strike.tap')}
        </motion.div>
      </div>
    </motion.div>,
    document.body,
  );
}
