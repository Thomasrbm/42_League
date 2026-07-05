import { useAutoCinematics } from '../lib/cinematics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useT } from '../lib/i18n';
import { pickReaction, type ReactionSignals, type ReactionTone } from '../lib/playerReactions';

/* ─────────────────────────────────────────────────────────────────────────
 * OVERLAY DE RÉACTION — pop-up meme contextuel piloté par playerReactions.
 *
 * Générique et réutilisable : on lui passe les `signals` de perf, il choisit la
 * réaction active (cf. pickReaction) et l'affiche. Aucune logique métier ici —
 * ajouter un meme = éditer le registry, pas ce composant.
 *
 * Anti-spam : une réaction fermée ne réapparaît pas tant que sa « signature »
 * de gravité ne change pas (série qui s'allonge). Mémorisé en sessionStorage,
 * donc oublié à la prochaine session.
 * ──────────────────────────────────────────────────────────────────────── */

/** Habillage couleur selon le ton (moquerie rouge / éloge or). */
const TONE_STYLE: Record<ReactionTone, { ring: string; glow: string; accent: string }> = {
  taunt: { ring: 'rgba(239,68,68,0.55)', glow: 'rgba(239,68,68,0.25)', accent: '#f87171' },
  praise: { ring: 'rgba(245,196,90,0.55)', glow: 'rgba(245,196,90,0.25)', accent: '#f5c45a' },
};

const SEEN_PREFIX = 'reaction-seen:';

export function PlayerReactionOverlay({ signals }: { signals: ReactionSignals }) {
  const t = useT();
  const reaction = useMemo(() => pickReaction(signals), [signals]);
  const signature = useMemo(() => (reaction ? reaction.signature(signals) : ''), [reaction, signals]);

  // Signature déjà vue pour cette réaction (rechargée quand la réaction change).
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => {
    if (!reaction) return setSeen(null);
    setSeen(sessionStorage.getItem(SEEN_PREFIX + reaction.id));
  }, [reaction]);

  const autoCine = useAutoCinematics();
  const open = autoCine && !!reaction && seen !== signature;

  const close = useCallback(() => {
    if (!reaction) return;
    sessionStorage.setItem(SEEN_PREFIX + reaction.id, signature);
    setSeen(signature);
  }, [reaction, signature]);

  // Échap = fermer + blocage du scroll de fond tant que le pop-up est ouvert.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  if (!open || !reaction) return null;

  const tone = TONE_STYLE[reaction.tone];
  const count = reaction.count(signals);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="player-reaction"
        role="dialog"
        aria-modal="true"
        aria-label={t(reaction.titleKey)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={close}
        className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        style={{ background: 'rgba(8,6,3,0.72)', backdropFilter: 'blur(4px)' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-sm my-auto rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(155deg, rgba(28,26,22,0.97) 0%, rgba(14,13,11,0.98) 100%)',
            border: `1.5px solid ${tone.ring}`,
            boxShadow: `0 0 50px ${tone.glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}
        >
          {/* Croix de fermeture */}
          <button
            type="button"
            onClick={close}
            aria-label={t('common.back')}
            className="absolute right-3 top-3 z-10 w-7 h-7 rounded-full flex items-center justify-center text-muted-2 hover:text-text-strong hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={2.4} />
          </button>

          {/* Le meme */}
          <img
            src={reaction.image}
            alt=""
            aria-hidden
            className="w-full h-44 object-cover"
            style={{ borderBottom: `1.5px solid ${tone.ring}` }}
          />

          <div className="relative p-6">
            <div
              className="text-[9px] font-extrabold uppercase tracking-[0.24em] mb-1.5"
              style={{ color: tone.accent }}
            >
              {count} {t(reaction.countSuffixKey)}
            </div>
            <div className="font-display text-xl font-black text-text-strong leading-tight mb-2">
              {t(reaction.titleKey)}
            </div>
            <p className="text-sm text-muted leading-relaxed">{t(reaction.messageKey)}</p>

            <button
              type="button"
              onClick={close}
              className="mt-6 w-full inline-flex items-center justify-center rounded-xl px-5 py-2.5 font-display text-sm font-black uppercase tracking-wider text-bg-1 transition-all active:scale-[0.98] hover:brightness-110"
              style={{ background: `linear-gradient(90deg, ${tone.accent}, ${tone.accent}cc)` }}
            >
              {t('reaction.dismiss')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
