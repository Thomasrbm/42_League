import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  clearLevelUp,
  getLevelUp,
  subscribeLevelUp,
  triggerLevelUp,
  type LevelUp,
} from '../lib/battlePassFx';
import { useLeagueData } from '../hooks/useLeagueData';
import { useT } from '../lib/i18n';
import { haptic } from '../mobile/feedback/useHaptic';

// ─────────────────────────────────────────────────────────────────────────────
// Cinématique « NIVEAU SUPÉRIEUR » (passe de combat).
//
// Détection : on compare `me.level` au précédent (ref). Une hausse déclenche un
// overlay doré bref (scale + glow), sobre et skippable au clic. Pendant à
// `RankUpOverlay` mais volontairement plus discret (l'XP monte souvent).
// ─────────────────────────────────────────────────────────────────────────────

const GOLD = '#ffc94a';
const TOTAL_MS = 2200;

export function LevelUpOverlay() {
  const { me } = useLeagueData();
  const level = me?.level;

  // Détection de la hausse de niveau via le niveau précédent.
  // Le premier rendu enregistre le niveau de référence SANS déclencher (on ne
  // veut pas d'animation au chargement de page).
  const prevLevel = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (typeof level !== 'number') return;
    if (prevLevel.current !== undefined && level > prevLevel.current) {
      triggerLevelUp(level);
      haptic('heavy');
    }
    prevLevel.current = level;
  }, [level]);

  const levelUp = useSyncExternalStore(subscribeLevelUp, getLevelUp, getLevelUp);
  return (
    <AnimatePresence>
      {levelUp && <LevelUpScene key={levelUp.nonce} levelUp={levelUp} />}
    </AnimatePresence>
  );
}

function LevelUpScene({ levelUp }: { levelUp: LevelUp }) {
  const t = useT();
  const dismissed = useRef(false);

  function done() {
    if (dismissed.current) return;
    dismissed.current = true;
    clearLevelUp();
  }

  useEffect(() => {
    const close = setTimeout(done, TOTAL_MS);
    return () => clearTimeout(close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[2147483646] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      transition={{ duration: 0.15 }}
      onClick={done}
      role="dialog"
      aria-modal="true"
      style={{ cursor: 'pointer' }}
    >
      {/* Fond sombre teinté or */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 46%, ${GOLD}26, rgba(3,3,7,0.9) 60%), rgba(4,4,8,0.9)`,
        }}
      />

      <motion.div
        className="relative z-10 flex flex-col items-center"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.12, 1], opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Halo pulsé derrière le badge de niveau */}
        <motion.div
          className="absolute"
          style={{
            width: 320,
            height: 320,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${GOLD}cc 0%, ${GOLD}33 30%, transparent 65%)`,
            mixBlendMode: 'screen',
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.2, 1.4], opacity: [0, 1, 0] }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />

        <motion.div
          className="font-display text-[11px] font-black uppercase tracking-[0.34em] md:text-sm"
          style={{ color: GOLD }}
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 240, damping: 18 }}
        >
          {t('battlepass.levelUp')}
        </motion.div>

        <div
          className="relative mt-3 flex items-center justify-center rounded-full"
          style={{
            width: 150,
            height: 150,
            background: `${GOLD}1f`,
            border: `3px solid ${GOLD}`,
            boxShadow: `0 0 60px ${GOLD}88, inset 0 0 36px ${GOLD}33`,
          }}
        >
          <div className="text-center">
            <div className="font-display text-[10px] font-black uppercase tracking-[0.3em] text-muted-2">
              {t('battlepass.level')}
            </div>
            <div
              className="font-display text-6xl font-black tabular-nums leading-none"
              style={{
                background: `linear-gradient(180deg, #ffffff 0%, ${GOLD} 60%, #1a1208 130%)`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: `drop-shadow(0 2px 14px ${GOLD}aa)`,
              }}
            >
              {levelUp.level}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
