import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Crown,
  Lock,
  Check,
  Gem,
  Zap,
  ShieldBan,
  Trophy,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { Panel } from '../../components/Panel';
import { Skeleton } from '../../mobile/primitives/Skeleton';
import { useFlash } from '../../hooks/useFlash';
import { useT } from '../../lib/i18n';
import { useIsLite } from '../../hooks/usePerf';
import { api, type BattlePassResponse, type BattlePassTierView } from '../../lib/api';
import { RARITY, resolveRarity } from '../../lib/rarity';

const BLUE = '#38bdf8';
const GOLD = '#ffc94a';
const TIER_W = 190;

/** Icône de chaque consommable (mêmes accents que la boutique). */
const CONSUMABLE_ICON: Record<string, LucideIcon> = {
  anti_ops: ShieldBan,
  elo_mult: Zap,
  force_duel: Sparkles,
  mini_ops: ShieldBan,
};

/**
 * Scroll par glisser-déposer (souris) + molette verticale → défilement horizontal.
 * Le tactile garde le scroll natif. Donne la sensation « piste » d'un passe de combat.
 */
function useDragScroll(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let down = false;
    let startX = 0;
    let startLeft = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return; // laisse le scroll tactile natif
      down = true;
      startX = e.clientX;
      startLeft = el.scrollLeft;
      el.classList.add('cursor-grabbing');
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      el.scrollLeft = startLeft - (e.clientX - startX);
    };
    const onUp = () => {
      down = false;
      el.classList.remove('cursor-grabbing');
    };
    const onWheel = (e: WheelEvent) => {
      const delta = e.deltaY;
      if (delta === 0 || el.scrollWidth <= el.clientWidth) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      // En butée, on rend la main au scroll vertical de la page.
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;
      e.preventDefault();
      el.scrollLeft += delta;
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [ref]);
}

/** Compte à rebours animé d'un nombre 0 → target (cubic ease-out). */
function useCountUp(target: number, active: boolean, durationMs = 900) {
  const [val, setVal] = useState(active ? 0 : target);
  useEffect(() => {
    if (!active) {
      setVal(target);
      return;
    }
    let raf = 0;
    let startTs = 0;
    const tick = (now: number) => {
      if (!startTs) startTs = now;
      const p = Math.min(1, (now - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durationMs]);
  return val;
}

/** Métadonnées d'affichage de la récompense d'un palier (icône + libellé + couleur). */
function rewardView(tier: BattlePassTierView, t: (k: string) => string) {
  if (tier.rewardKind === 'item' && tier.item) {
    const rk = RARITY[resolveRarity(tier.item)];
    return {
      hex: rk.hex,
      tag: rk.label,
      name: tier.item.name,
      icon: <Gem className="w-8 h-8" strokeWidth={2.2} style={{ color: rk.hex }} />,
    };
  }
  if (tier.rewardKind === 'coins') {
    return {
      hex: GOLD,
      tag: 'Coins',
      name: `${tier.coins ?? 0}`,
      icon: <img src="/42coin.webp" alt="" className="w-8 h-8 drop-shadow" />,
    };
  }
  if (tier.rewardKind === 'consumable' && tier.consumableKind) {
    const Icon = CONSUMABLE_ICON[tier.consumableKind] ?? Zap;
    return {
      hex: '#5eead4',
      tag: t('battlepass.reward.consumable'),
      name: t(`battlepass.consumable.${tier.consumableKind}`),
      icon: <Icon className="w-8 h-8 text-teal-300" strokeWidth={2} />,
    };
  }
  return {
    hex: '#6b6453',
    tag: '—',
    name: t('battlepass.reward.none'),
    icon: <Gem className="w-8 h-8 text-muted/40" strokeWidth={1.8} />,
  };
}

/**
 * Une colonne de la frise (= un palier), look « passe de combat Fortnite » :
 * grosse carte-récompense sertie d'une bordure lumineuse et d'un halo de rareté,
 * numéro de palier en filigrane, nœud circulaire épais posé sur un rail néon, et
 * balisage spectaculaire (anneaux pulsés + étincelles) sur le palier courant.
 */
function TierColumn({
  tier,
  index,
  t,
  isCurrent,
  lite,
  colRef,
}: {
  tier: BattlePassTierView;
  index: number;
  t: (k: string) => string;
  isCurrent: boolean;
  lite: boolean;
  colRef?: (el: HTMLDivElement | null) => void;
}) {
  const claimed = !!tier.claimedAt;
  const unlocked = tier.unlocked;
  const rw = rewardView(tier, t);
  // Couleur du nœud : or pour le palier courant, bleu néon pour les débloqués.
  const nodeHex = isCurrent ? GOLD : BLUE;
  // Délai d'entrée plafonné : les paliers lointains n'attendent pas une éternité.
  const delay = lite ? 0 : Math.min(index * 0.018, 0.5);

  return (
    <motion.div
      ref={colRef}
      className="group relative shrink-0 snap-center flex flex-col items-center pt-4 select-none"
      style={{ width: TIER_W }}
      initial={lite ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: 'easeOut' }}
    >
      {/* Badge doré « palier actuel » flottant */}
      {isCurrent && (
        <motion.div
          className="absolute -top-1 z-30 flex flex-col items-center"
          initial={lite ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + 0.2 }}
        >
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-display font-extrabold uppercase tracking-[0.16em] text-bg-0"
            style={{
              background: `linear-gradient(135deg, ${GOLD}, #ffe6a3)`,
              boxShadow: `0 0 18px ${GOLD}, 0 4px 12px -4px ${GOLD}`,
            }}
          >
            <Crown className="w-3 h-3" strokeWidth={2.8} />
            {t('battlepass.jumpToCurrent')}
          </span>
        </motion.div>
      )}

      {/* Récompense (carte au-dessus du rail) */}
      <div className="w-full px-2" style={{ marginTop: isCurrent ? 20 : 0 }}>
        <motion.div
          className="shine relative rounded-3xl border-2 p-3.5 flex flex-col items-center gap-2 text-center min-h-[172px] justify-center overflow-hidden"
          whileHover={lite ? undefined : { y: -8, scale: 1.05 }}
          transition={{ type: 'spring', stiffness: 360, damping: 22 }}
          style={{
            borderColor: unlocked ? `${rw.hex}cc` : `${rw.hex}33`,
            background: unlocked
              ? `linear-gradient(160deg, ${rw.hex}33 0%, ${rw.hex}12 55%, rgba(12,10,8,0.55) 100%)`
              : 'rgba(21,18,14,0.6)',
            boxShadow: unlocked
              ? `0 10px 32px -12px ${rw.hex}, 0 0 22px -8px ${rw.hex}, inset 0 1px 0 rgba(255,255,255,0.08)`
              : 'none',
            opacity: unlocked ? 1 : 0.55,
          }}
        >
          {/* Numéro de palier en filigrane */}
          <span
            className="absolute -bottom-3 right-1 font-display font-black leading-none pointer-events-none select-none tabular-nums"
            style={{
              fontSize: 78,
              color: unlocked ? `${rw.hex}1f` : 'rgba(125,115,95,0.08)',
              textShadow: unlocked ? `0 0 20px ${rw.hex}22` : 'none',
            }}
          >
            {tier.tier}
          </span>

          {/* Liseré de rareté en haut */}
          <span
            className="absolute top-0 left-0 right-0 h-[4px]"
            style={{
              background: unlocked
                ? `linear-gradient(90deg, transparent, ${rw.hex}, transparent)`
                : `${rw.hex}44`,
            }}
          />
          {/* Halo de rareté derrière la carte */}
          {unlocked && !lite && (
            <span
              className="absolute -top-8 left-1/2 -translate-x-1/2 w-28 h-28 rounded-full blur-3xl pointer-events-none"
              style={{ background: `${rw.hex}55` }}
            />
          )}

          {/* Médaillon d'icône */}
          <span
            className="relative w-16 h-16 rounded-2xl flex items-center justify-center border-2"
            style={{
              borderColor: unlocked ? `${rw.hex}88` : `${rw.hex}44`,
              background: `radial-gradient(circle at 50% 35%, ${rw.hex}33, ${rw.hex}0d)`,
              boxShadow: unlocked
                ? `0 0 22px -4px ${rw.hex}, inset 0 0 14px -6px ${rw.hex}`
                : 'none',
            }}
          >
            {rw.icon}
          </span>

          <span
            className="relative text-[9px] font-display font-extrabold uppercase tracking-[0.14em]"
            style={{ color: unlocked ? rw.hex : '#8a7d65' }}
          >
            {rw.tag}
          </span>
          <span className="relative text-[12.5px] font-bold text-text-strong leading-tight line-clamp-2">
            {rw.name}
          </span>

          {claimed && (
            <span
              className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: GOLD, boxShadow: `0 0 14px ${GOLD}` }}
            >
              <Check className="w-3.5 h-3.5 text-bg-0" strokeWidth={3.5} />
            </span>
          )}
        </motion.div>
      </div>

      {/* Rail + nœud */}
      <div className="relative w-full h-16 flex items-center justify-center my-1">
        {/* Ligne de base (toujours présente, terne) */}
        <div
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[6px] rounded-full"
          style={{ background: 'rgba(125,115,95,0.2)' }}
        />
        {/* Remplissage néon animé (paliers débloqués), bleu → or, jointif */}
        {unlocked && (
          <motion.div
            className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[6px] rounded-full origin-left"
            style={{
              background: `linear-gradient(90deg, #0ea5e9, ${BLUE} 45%, ${GOLD})`,
              boxShadow: `0 0 14px rgba(56,189,248,0.7), 0 0 10px ${GOLD}55`,
            }}
            initial={lite ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay, duration: 0.5, ease: 'easeOut' }}
          />
        )}

        {/* Palier courant : 3 anneaux pulsés + 6 étincelles */}
        {isCurrent && !lite && (
          <>
            {[0, 0.5, 1].map((d, i) => (
              <motion.span
                key={`ring-${i}`}
                className="absolute z-0 w-14 h-14 rounded-full border-2"
                style={{ borderColor: GOLD }}
                animate={{ scale: [1, 2.1], opacity: [0.6, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: d }}
              />
            ))}
            {Array.from({ length: 6 }).map((_, i) => {
              const angle = (i / 6) * Math.PI * 2;
              return (
                <motion.span
                  key={`spark-${i}`}
                  className="absolute z-0 rounded-full"
                  style={{ width: 4, height: 4, background: GOLD, boxShadow: `0 0 6px ${GOLD}` }}
                  animate={{
                    x: [0, Math.cos(angle) * 34],
                    y: [0, Math.sin(angle) * 34],
                    opacity: [0.9, 0],
                    scale: [1, 0.2],
                  }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut', delay: i * 0.12 }}
                />
              );
            })}
          </>
        )}

        {/* Nœud */}
        <motion.span
          className="relative z-10 inline-flex items-center justify-center w-14 h-14 rounded-full border-[3px] font-display text-lg font-extrabold tabular-nums"
          initial={lite ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.12, type: 'spring', stiffness: 420, damping: 18 }}
          style={
            unlocked
              ? {
                  borderColor: nodeHex,
                  background: claimed
                    ? `linear-gradient(160deg, ${nodeHex}66, ${nodeHex}1f)`
                    : `radial-gradient(circle at 50% 35%, ${nodeHex}3d, ${nodeHex}14)`,
                  color: isCurrent ? '#fff4d6' : '#e0f2fe',
                  boxShadow: `0 0 22px -2px ${nodeHex}, inset 0 0 12px -4px ${nodeHex}`,
                }
              : {
                  borderColor: 'rgba(125,115,95,0.4)',
                  background: 'rgba(12,10,8,0.85)',
                  color: '#a89880',
                }
          }
        >
          {claimed ? (
            <Check className="w-6 h-6" strokeWidth={3} />
          ) : unlocked ? (
            tier.tier
          ) : (
            <Lock className="w-5 h-5" strokeWidth={2.4} />
          )}
        </motion.span>
      </div>

      {/* XP requise + état */}
      <div className="flex flex-col items-center gap-1.5 pb-1">
        <span className="font-gaming text-[11px] text-muted-2 tabular-nums">
          {tier.xpRequired} <span className="text-[#7dd3fc]/70">{t('battlepass.xp')}</span>
        </span>
        {claimed ? (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide border"
            style={{ background: `${GOLD}26`, borderColor: `${GOLD}66`, color: GOLD }}
          >
            <Check className="w-2.5 h-2.5" strokeWidth={3} />
            {t('battlepass.claimed')}
          </span>
        ) : unlocked ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-emerald-500/15 border border-emerald-400/40 text-emerald-300">
            <Check className="w-2.5 h-2.5" strokeWidth={3} />
            {t('battlepass.unlocked')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-bg-1/80 border border-border/60 text-muted-2">
            <Lock className="w-2.5 h-2.5" strokeWidth={2.5} />
            {t('battlepass.locked')}
          </span>
        )}
      </div>
    </motion.div>
  );
}

export function PassePage() {
  const t = useT();
  const lite = useIsLite();
  const { show } = useFlash();
  const [data, setData] = useState<BattlePassResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement | null>(null);

  useDragScroll(scrollerRef);

  const load = useCallback(async () => {
    try {
      const res = await api.battlePass();
      setData(res);
    } catch (err) {
      show(err instanceof Error ? err.message : t('battlepass.title'), 'error');
    } finally {
      setLoading(false);
    }
  }, [show, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const scrollToCurrent = useCallback((smooth = true) => {
    const sc = scrollerRef.current;
    const nd = currentRef.current;
    if (!sc || !nd) return;
    const target = nd.offsetLeft - sc.clientWidth / 2 + nd.offsetWidth / 2;
    sc.scrollTo({ left: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Auto-centrage de la frise sur le palier courant une fois les données prêtes.
  useEffect(() => {
    if (!loading) requestAnimationFrame(() => scrollToCurrent(true));
  }, [loading, data, scrollToCurrent]);

  // Progression dans le niveau courant (0..1), clampée.
  const pct =
    data && data.xpForNextLevel > 0
      ? Math.min(1, Math.max(0, data.xpIntoLevel / data.xpForNextLevel))
      : 0;

  const ready = !loading && !!data;
  const levelCount = useCountUp(data?.level ?? 1, ready, 800);
  const intoCount = useCountUp(data?.xpIntoLevel ?? 0, ready, 900);
  const totalCount = useCountUp(data?.totalXp ?? 0, ready, 1000);

  return (
    <div className="relative space-y-5">
      {/* ── Fond de scène (halos or / bleu / violet + grille) ──────────────── */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-mesh-grid opacity-[0.18]" style={{ backgroundSize: '32px 32px' }} />
        <div className="absolute -top-24 left-[8%] w-[36rem] h-[36rem] rounded-full bg-gold/10 blur-3xl" />
        <div className="absolute top-[30%] right-[4%] w-[30rem] h-[30rem] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute -bottom-32 left-[30%] w-[34rem] h-[34rem] rounded-full bg-violet-600/12 blur-3xl" />
      </div>

      {/* ── En-tête : barre d'XP spectaculaire ─────────────────────────────── */}
      <Panel title={t('battlepass.title')}>
        <div className="relative overflow-hidden rounded-3xl p-6 border-2 border-gold/30 bg-gradient-to-br from-violet-700/25 via-bg-2 to-bg-0">
          <div className="absolute inset-0 hud-diag pointer-events-none opacity-25" />
          <div className="absolute -left-10 -top-12 w-52 h-52 rounded-full bg-gold/18 blur-3xl pointer-events-none" />
          <div className="absolute right-0 -bottom-16 w-60 h-60 rounded-full bg-violet-500/20 blur-3xl pointer-events-none" />
          {/* Étincelles flottantes */}
          {!lite &&
            ready &&
            [0, 1, 2, 3, 4].map((i) => (
              <motion.span
                key={i}
                className="absolute rounded-full"
                style={{
                  width: 3,
                  height: 3,
                  left: `${14 + i * 18}%`,
                  top: '62%',
                  background: i % 2 ? GOLD : '#bae6fd',
                }}
                animate={{ y: [-2, -28, -2], opacity: [0, 0.9, 0] }}
                transition={{ duration: 2.6 + i * 0.4, repeat: Infinity, delay: i * 0.5, ease: 'easeInOut' }}
              />
            ))}

          <div className="relative flex items-center gap-5">
            {/* Médaillon niveau (84px) */}
            <motion.div
              className="relative shrink-0 w-[84px] h-[84px] rounded-3xl bg-gradient-to-br from-gold/40 to-violet-500/15 border-2 border-gold/50 flex flex-col items-center justify-center shadow-gold-glow overflow-hidden"
              initial={lite ? false : { scale: 0.6, rotate: -8, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            >
              <Crown className="w-6 h-6 text-gold drop-shadow" strokeWidth={2.2} />
              <span className="font-display text-3xl font-black text-text-strong tabular-nums leading-none">
                {loading ? '–' : levelCount}
              </span>
              {!lite && (
                <div className="absolute inset-y-0 -left-1/2 w-1/2 bg-white/20 blur-md animate-gold-sweep pointer-events-none" />
              )}
            </motion.div>

            <div className="relative min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[11px] uppercase tracking-[0.22em] font-display font-extrabold text-gold/90">
                  {t('battlepass.level')} {loading ? '' : levelCount}
                </div>
                {!loading && data && (
                  <div className="text-[12px] font-bold text-muted-2 tabular-nums">
                    <span className="text-[#7dd3fc]">{intoCount}</span> / {data.xpForNextLevel}{' '}
                    <span className="uppercase tracking-wide text-[#7dd3fc]/70">{t('battlepass.xp')}</span>
                  </div>
                )}
              </div>

              {/* Barre de progression deep-blue → cyan → or, reflet qui balaie */}
              <div className="shine relative mt-2.5 h-5 w-full rounded-full bg-bg-0/80 border border-gold/20 overflow-hidden">
                <motion.div
                  className="h-full rounded-full relative overflow-hidden"
                  style={{
                    background: `linear-gradient(90deg, #0369a1 0%, ${BLUE} 45%, #7dd3fc 70%, ${GOLD} 100%)`,
                    boxShadow: `0 0 18px rgba(56,189,248,0.6), 0 0 12px ${GOLD}55`,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct * 100}%` }}
                  transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
                >
                  {!lite && pct > 0 && (
                    <motion.span
                      className="absolute inset-y-0 w-1/3"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)' }}
                      animate={{ x: ['-120%', '320%'] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1 }}
                    />
                  )}
                </motion.div>
              </div>

              {!loading && data && (
                <div className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-2 font-medium">
                  <Trophy className="w-3.5 h-3.5 text-gold/70" strokeWidth={2.4} />
                  <span className="tabular-nums">{totalCount}</span>
                  <span className="uppercase tracking-wide text-[10px]">{t('battlepass.xp')}</span>
                  <span className="opacity-60">·</span>
                  <span>{t('battlepass.xpToNext')}: </span>
                  <span className="tabular-nums text-text">
                    {Math.max(0, data.xpForNextLevel - data.xpIntoLevel)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Frise des paliers (scroll horizontal, façon passe de combat) ──── */}
      {loading ? (
        <div className="card-hud rounded-3xl p-4 overflow-hidden">
          <div className="flex gap-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="shrink-0 px-2" style={{ width: TIER_W }}>
                <Skeleton className="h-[172px] rounded-3xl" />
              </div>
            ))}
          </div>
        </div>
      ) : !data || data.tiers.length === 0 ? (
        <div className="rounded-3xl border border-border/50 bg-bg-2/50 p-12 text-center">
          <Sparkles className="w-8 h-8 text-muted/50 mx-auto mb-3" strokeWidth={1.8} />
          <p className="text-sm text-muted-2 font-medium">{t('battlepass.empty')}</p>
        </div>
      ) : (
        <div className="card-hud rounded-3xl p-4 pt-3">
          {/* Sous-titre piste + indice de scroll */}
          <div className="flex items-center justify-between px-1 mb-2">
            <div className="font-display text-[11px] uppercase tracking-[0.18em] text-gold/85 font-extrabold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.4} />
              {t('battlepass.rewardsTrack')}
            </div>
            <div className="hidden sm:block text-[10px] text-muted-2/70 italic">{t('battlepass.dragHint')}</div>
          </div>

          <div className="relative">
            {/* Fondus + indicateurs de défilement sur les bords */}
            <div className="pointer-events-none absolute left-0 inset-y-0 w-12 z-20 bg-gradient-to-r from-bg-1 to-transparent flex items-center">
              <ChevronLeft className="w-6 h-6 text-muted-2/70" strokeWidth={2.5} />
            </div>
            <div className="pointer-events-none absolute right-0 inset-y-0 w-12 z-20 bg-gradient-to-l from-bg-1 to-transparent flex items-center justify-end">
              <ChevronRight className="w-6 h-6 text-muted-2/70" strokeWidth={2.5} />
            </div>

            <div
              ref={scrollerRef}
              className="relative overflow-x-auto overflow-y-hidden snap-x scroll-px-6 px-1 pb-1 cursor-grab scrollbar-none"
            >
              <div className="flex min-w-max pt-3">
                {data.tiers.map((tier, i) => {
                  const isCurrent = tier.tier === data.level;
                  return (
                    <TierColumn
                      key={tier.tier}
                      tier={tier}
                      index={i}
                      t={t}
                      isCurrent={isCurrent}
                      lite={lite}
                      colRef={isCurrent ? (el) => (currentRef.current = el) : undefined}
                    />
                  );
                })}
              </div>
            </div>

            {/* Bouton « revenir au palier actuel » */}
            <button
              type="button"
              onClick={() => scrollToCurrent(true)}
              className="absolute -bottom-2 right-2 z-30 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-display font-extrabold uppercase tracking-wide text-bg-0 shadow-lg transition-transform hover:scale-105 active:scale-95"
              style={{ background: `linear-gradient(135deg, ${GOLD}, #ffe6a3)`, boxShadow: `0 4px 18px -4px ${GOLD}` }}
            >
              <Crown className="w-3.5 h-3.5" strokeWidth={2.6} />
              {t('battlepass.jumpToCurrent')}
            </button>
          </div>
        </div>
      )}

      {/* ── Section bonus « Passe Premium » (décorative) ───────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-gold/25 bg-gradient-to-br from-gold/10 via-bg-2 to-bg-0 p-5">
        <div className="absolute inset-0 hud-diag pointer-events-none opacity-20" />
        <div className="absolute -right-8 -top-10 w-48 h-48 rounded-full bg-gold/15 blur-3xl pointer-events-none" />
        {!lite &&
          [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute"
              style={{ left: `${20 + i * 28}%`, top: '30%', color: GOLD }}
              animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.8, 1.1, 0.8] }}
              transition={{ duration: 2.4 + i * 0.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
            >
              <Star className="w-3 h-3 fill-current" strokeWidth={0} />
            </motion.span>
          ))}

        <div className="relative flex items-center gap-4">
          <div
            className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center border-2"
            style={{
              borderColor: `${GOLD}66`,
              background: `radial-gradient(circle at 50% 35%, ${GOLD}33, ${GOLD}0d)`,
              boxShadow: `0 0 22px -6px ${GOLD}`,
            }}
          >
            <Crown className="w-7 h-7 text-gold drop-shadow" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-black uppercase tracking-[0.14em] text-gold">
              Passe Premium
            </div>
            <p className="text-[12px] text-muted-2 mt-0.5 leading-snug">
              Débloque des paliers exclusifs, des skins rares et des multiplicateurs d'XP.
              <span className="text-gold/80 font-semibold"> Bientôt disponible.</span>
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-display font-extrabold uppercase tracking-wide text-bg-0 shrink-0"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #ffe6a3)`, boxShadow: `0 4px 16px -4px ${GOLD}` }}
          >
            <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
            Premium
          </span>
        </div>
      </div>
    </div>
  );
}
