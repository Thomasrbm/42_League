import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  clearRewardUnlock,
  getRewardUnlock,
  subscribeRewardUnlock,
  triggerRewardUnlock,
  type RewardTier,
  type RewardUnlock,
} from '../lib/battlePassFx';
import { useServerEvents } from '../hooks/useServerEvents';
import { useLeagueData } from '../hooks/useLeagueData';
import { useT } from '../lib/i18n';
import { resolveRarity, RARITY } from '../lib/rarity';
import { haptic } from '../mobile/feedback/useHaptic';

// ─────────────────────────────────────────────────────────────────────────────
// Cinématique « RÉCOMPENSE DÉBLOQUÉE » (passe de combat).
//
// Le backend émet l'event SSE `battlepass:tier` { payload: { tiers: [...] } }
// quand un ou plusieurs paliers viennent d'être accordés. On l'écoute via le
// même mécanisme que les autres events (useServerEvents → flux /events), on
// rafraîchit les données de la league, et on révèle la/les récompense(s) sous
// forme de cartes animées (sobre, ~2.4 s, skippable au clic).
// ─────────────────────────────────────────────────────────────────────────────

const GOLD = '#ffc94a';
const TOTAL_MS = 2600;

interface TierEventPayload {
  tiers?: RewardTier[];
}

export function RewardUnlockOverlay() {
  const { refresh } = useLeagueData();

  const onEvent = useCallback(
    (event?: { type: string; data: unknown }) => {
      // Refresh des données (XP/level/inventaire/coins) à chaque palier accordé.
      void refresh();
      const data = event?.data as { payload?: TierEventPayload } | undefined;
      const tiers = data?.payload?.tiers;
      if (Array.isArray(tiers) && tiers.length > 0) {
        triggerRewardUnlock(tiers);
        haptic('heavy');
      }
    },
    [refresh],
  );

  // `fireOnReopen: false` → l'overlay ne se rejoue PAS au simple retour au premier
  // plan (effet visible), seulement sur un vrai event `battlepass:tier`.
  useServerEvents(onEvent, ['battlepass:tier'], { fireOnReopen: false, debounceMs: 100 });

  const reward = useSyncExternalStore(subscribeRewardUnlock, getRewardUnlock, getRewardUnlock);
  return (
    <AnimatePresence>
      {reward && <RewardScene key={reward.nonce} reward={reward} />}
    </AnimatePresence>
  );
}

function RewardScene({ reward }: { reward: RewardUnlock }) {
  const t = useT();
  const dismissed = useRef(false);

  function done() {
    if (dismissed.current) return;
    dismissed.current = true;
    clearRewardUnlock();
  }

  useEffect(() => {
    const close = setTimeout(done, TOTAL_MS);
    return () => clearTimeout(close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[2147483646] flex items-center justify-center overflow-hidden px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      transition={{ duration: 0.15 }}
      onClick={done}
      role="dialog"
      aria-modal="true"
      style={{ cursor: 'pointer' }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 46%, ${GOLD}22, rgba(3,3,7,0.9) 60%), rgba(4,4,8,0.92)`,
        }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          className="font-display text-[11px] font-black uppercase tracking-[0.34em] md:text-sm"
          style={{ color: GOLD }}
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 240, damping: 18 }}
        >
          {t('battlepass.rewardUnlocked')}
        </motion.div>

        <div className="mt-5 flex flex-wrap items-stretch justify-center gap-3">
          {reward.tiers.slice(0, 4).map((tier, i) => (
            <RewardCard key={tier.tier} tier={tier} index={i} t={t} />
          ))}
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}

function RewardCard({
  tier,
  index,
  t,
}: {
  tier: RewardTier;
  index: number;
  t: (key: string) => string;
}) {
  const accent = tier.rewardKind === 'item' && tier.item
    ? RARITY[resolveRarity(tier.item)].hex
    : GOLD;

  let kindLabel = t('battlepass.reward.none');
  let mainLabel = '';
  if (tier.rewardKind === 'item' && tier.item) {
    kindLabel = t(`shop.rarity.${resolveRarity(tier.item)}`);
    mainLabel = tier.item.name;
  } else if (tier.rewardKind === 'coins') {
    kindLabel = t('battlepass.reward.coins');
    mainLabel = `+${tier.coins ?? 0}`;
  } else if (tier.rewardKind === 'consumable') {
    kindLabel = t('battlepass.reward.consumable');
    mainLabel = tier.consumableKind
      ? t(`battlepass.consumable.${tier.consumableKind}`)
      : t('battlepass.reward.consumable');
  }

  return (
    <motion.div
      className="flex min-w-[150px] max-w-[200px] flex-col items-center rounded-2xl px-4 py-4 text-center"
      style={{
        background: `linear-gradient(180deg, ${accent}1f 0%, rgba(255,255,255,0.03) 100%)`,
        border: `1.5px solid ${accent}`,
        boxShadow: `0 0 28px -6px ${accent}99, inset 0 0 24px ${accent}1f`,
      }}
      // Carte qui se révèle : flip + scale.
      initial={{ rotateY: 90, scale: 0.7, opacity: 0 }}
      animate={{ rotateY: 0, scale: 1, opacity: 1 }}
      transition={{ delay: 0.25 + index * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="font-display text-[9px] font-black uppercase tracking-[0.2em] text-muted-2">
        {t('battlepass.tier')} {tier.tier}
      </div>
      <div className="my-1 text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: accent }}>
        {kindLabel}
      </div>
      {tier.rewardKind === 'coins' && (
        <img src="/42coin.webp" alt="" className="my-1 h-7 w-7" />
      )}
      <div
        className="font-display text-lg font-black leading-tight"
        style={{ color: tier.rewardKind === 'item' ? accent : '#fff', textShadow: `0 0 14px ${accent}66` }}
      >
        {mainLabel}
      </div>
    </motion.div>
  );
}
