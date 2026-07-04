import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { PackageOpen, Sparkles, X } from 'lucide-react';
import type { MysteryReward } from '../../lib/api';
import { RARITY, type Rarity } from '../../lib/rarity';
import { useT } from '../../lib/i18n';

const CATEGORY_LABEL: Record<string, string> = {
  title: 'Titre',
  banner: 'Bannière',
  badge: 'Badge',
};

/**
 * Animation de révélation d'une Boîte Mystère : la boîte tremble, « explose » en
 * gerbe d'étincelles, puis la carte du lot gagné jaillit (teintée par sa rareté,
 * ou en arc-en-ciel animé pour le titre « Mysterious »). Explique clairement au
 * joueur ce qu'il vient d'obtenir. Rendu via portal (au-dessus de tout).
 */
export function MysteryRevealModal({
  reward,
  onClose,
}: {
  reward: MysteryReward | null;
  onClose: () => void;
}) {
  const t = useT();
  const [phase, setPhase] = useState<'shaking' | 'revealed'>('shaking');

  useEffect(() => {
    const id = setTimeout(() => setPhase('revealed'), 1100);
    return () => clearTimeout(id);
  }, []);

  const isRainbow = reward?.color === 'rainbow';
  const rarityKey = (reward?.rarity ?? 'common') as Rarity;
  const rarity = RARITY[rarityKey] ?? RARITY.common;
  const accent = isRainbow ? '#c97bff' : reward?.color ?? rarity.hex;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 16, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-sm rounded-2xl border border-gold/30 bg-bg-1 shadow-2xl overflow-hidden"
        >
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-text hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>

          {/* Lueur d'ambiance teintée par la rareté / l'arc-en-ciel */}
          <div
            className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-40 rounded-full blur-3xl pointer-events-none opacity-60"
            style={{ background: isRainbow ? 'conic-gradient(from 0deg,#ff5c7c,#ffb347,#ffe66d,#7bed9f,#54a0ff,#a55eea,#ff5c7c)' : `${accent}55` }}
          />

          <div className="relative px-6 py-7 flex flex-col items-center text-center gap-4">
            <div className="text-[11px] uppercase tracking-[0.2em] font-extrabold text-muted-2">
              {t('shop.cat.mystery_box')}
            </div>

            {phase === 'shaking' ? (
              <motion.div
                animate={{ rotate: [-8, 8, -8, 8, -4, 4, 0], scale: [1, 1.06, 1, 1.06, 1.1] }}
                transition={{ duration: 1, ease: 'easeInOut' }}
                className="w-24 h-24 rounded-2xl bg-gradient-to-br from-violet-500/30 to-gold/20 border border-gold/40 flex items-center justify-center shadow-gold-glow"
              >
                <PackageOpen className="w-12 h-12 text-gold" strokeWidth={1.8} />
              </motion.div>
            ) : (
              <motion.div
                initial={{ scale: 0.4, opacity: 0, y: 8 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                className="flex flex-col items-center gap-3"
              >
                {reward ? (
                  <>
                    {/* GAIN : gerbe d'étincelles + titre Mysterious */}
                    <div className="relative">
                      {[...Array(8)].map((_, i) => (
                        <motion.span
                          key={i}
                          initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                          animate={{ opacity: 0, x: Math.cos((i / 8) * Math.PI * 2) * 60, y: Math.sin((i / 8) * Math.PI * 2) * 60, scale: 0.3 }}
                          transition={{ duration: 0.7, ease: 'easeOut' }}
                          className="absolute left-1/2 top-1/2"
                        >
                          <Sparkles className="w-4 h-4" style={{ color: accent }} />
                        </motion.span>
                      ))}
                      <div
                        className="w-24 h-24 rounded-2xl flex items-center justify-center border-2"
                        style={{
                          borderColor: accent,
                          background: isRainbow
                            ? 'linear-gradient(135deg,rgba(255,92,124,0.18),rgba(165,94,234,0.18))'
                            : `${accent}1f`,
                          boxShadow: `0 0 30px ${accent}66`,
                        }}
                      >
                        <Sparkles className="w-11 h-11" style={{ color: accent }} strokeWidth={1.8} />
                      </div>
                    </div>
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-2">
                      Jackpot ! 🎉
                    </div>
                    <div
                      className={`font-display text-2xl font-black leading-tight ${isRainbow ? 'title-rainbow' : ''}`}
                      style={isRainbow ? undefined : { color: accent }}
                    >
                      {reward.name}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-muted-2 font-bold">
                        {CATEGORY_LABEL[reward.category] ?? reward.category}
                      </span>
                      <span
                        className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full border"
                        style={{ color: rarity.hex, borderColor: `${rarity.hex}55`, backgroundColor: `${rarity.hex}1a` }}
                      >
                        {t(`shop.rarity.${rarityKey}`)}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    {/* PERTE : -10 ELO, pas de lot (9 fois sur 10) */}
                    <div className="w-24 h-24 rounded-2xl flex items-center justify-center border-2 border-red/50 bg-red/10 text-4xl">
                      😬
                    </div>
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-2">Pas de chance…</div>
                    <div className="font-display text-3xl font-black text-red leading-none">−10 ELO</div>
                    <div className="text-[11px] text-muted-2 max-w-[15rem]">
                      Le titre « Mysterious » se cache encore (1 chance sur 10). Retente ta chance !
                    </div>
                  </>
                )}
              </motion.div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="mt-1 w-full py-2.5 rounded-xl bg-gradient-to-r from-gold to-gold-dim text-bg-0 font-extrabold text-sm uppercase tracking-wider hover:brightness-110 transition-all"
            >
              Super !
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
