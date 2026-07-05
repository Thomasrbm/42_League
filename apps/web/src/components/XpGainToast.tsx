import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useLeagueData } from '../hooks/useLeagueData';
import { useT } from '../lib/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Toast « +XP » — feedback immédiat du gain d'expérience après un match.
//
// L'XP tombait silencieusement : on ne voyait quelque chose qu'au level-up.
// Ici, toute hausse de `me.xp` (détectée comme LevelUpOverlay détecte le
// niveau) affiche un petit encart discret en bas à droite : +N XP et la barre
// du niveau qui se remplit. Les gains rapprochés s'additionnent. Quand le
// niveau monte, on laisse la cinématique de level-up faire le show à sa place.
// ─────────────────────────────────────────────────────────────────────────────

const SHOW_MS = 3400;
const BLUE = '#2cc3ff';

export function XpGainToast() {
  const t = useT();
  const { me } = useLeagueData();
  const xp = me?.xp;
  const level = me?.level;
  const xpIntoLevel = me?.xpIntoLevel ?? 0;
  const xpForNextLevel = Math.max(1, me?.xpForNextLevel ?? 1);

  // Référence du dernier état vu — le premier rendu n'affiche rien.
  const prev = useRef<{ xp: number; level: number } | null>(null);
  const [gain, setGain] = useState<{ amount: number; nonce: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof xp !== 'number' || typeof level !== 'number') return;
    const p = prev.current;
    prev.current = { xp, level };
    if (!p) return;
    const delta = xp - p.xp;
    if (delta <= 0) return;
    // Le level-up a sa propre cinématique plein écran — pas de doublon.
    if (level > p.level) return;
    setGain((g) => ({ amount: (g?.amount ?? 0) + delta, nonce: Date.now() }));
  }, [xp, level]);

  useEffect(() => {
    if (!gain) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setGain(null), SHOW_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [gain]);

  const pct = Math.min(1, Math.max(0, xpIntoLevel / xpForNextLevel));

  return (
    <AnimatePresence>
      {gain && (
        <motion.div
          key="xp-gain"
          className="fixed bottom-24 sm:bottom-8 right-3 sm:right-6 z-[95] pointer-events-none"
          initial={{ opacity: 0, y: 24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 380, damping: 26 }}
        >
          <div
            className="min-w-[190px] rounded-xl px-3.5 py-2.5 border backdrop-blur-md"
            style={{
              background: 'rgba(10,16,34,0.9)',
              borderColor: `${BLUE}55`,
              boxShadow: `0 8px 28px -10px rgba(0,0,0,0.8), 0 0 18px -6px ${BLUE}`,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded-md flex items-center justify-center"
                style={{ background: `${BLUE}22`, border: `1px solid ${BLUE}66` }}
              >
                <Zap className="w-3.5 h-3.5" strokeWidth={2.6} style={{ color: BLUE }} />
              </span>
              {/* key sur amount : petit pop à chaque gain additionné */}
              <motion.span
                key={gain.amount}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                className="font-gaming font-black italic text-lg text-white tabular-nums leading-none"
              >
                +{gain.amount} <span className="text-[11px]" style={{ color: BLUE }}>{t('battlepass.xp')}</span>
              </motion.span>
            </div>

            {/* Barre du niveau en cours */}
            <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, #1a86ff, ${BLUE})`, boxShadow: `0 0 8px ${BLUE}` }}
                initial={false}
                animate={{ width: `${pct * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <div className="mt-1 text-[10px] font-bold tabular-nums text-white/45">
              {xpIntoLevel}/{xpForNextLevel} {t('battlepass.xp')} · {t('battlepass.level')} {level}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
