import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Flame,
  Gem,
  Ghost,
  Gift,
  Lock,
  Medal,
  Music2,
  Palette,
  Rocket,
  ShieldBan,
  Snowflake,
  Sparkles,
  Star,
  Swords,
  Wand2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Skeleton } from '../../mobile/primitives/Skeleton';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFlash } from '../../hooks/useFlash';
import { useT } from '../../lib/i18n';
import { useIsLite } from '../../hooks/usePerf';
import { api, type BattlePassResponse, type BattlePassTierView } from '../../lib/api';
import { resolveRarity, type Rarity } from '../../lib/rarity';

// ─────────────────────────────────────────────────────────────────────────────
// PASSE DE COMBAT — refonte « vrai Fortnite ».
//
// D.A. volontairement DÉTACHÉE du reste du site : fond bleu nuit profond,
// typo condensée italique penchée, boutons jaunes massifs, tuiles de
// récompense XXL teintées par rareté (palette Fortnite : gris / bleu /
// violet / orange, or pour les coins, turquoise pour les consommables).
//
// Les paliers sont présentés en PAGES de 10 tuiles (5×2 en desktop) comme le
// passe Fortnite, avec navigation par flèches. Un palier atteint mais non
// récupéré affiche un liseré jaune pulsé + ruban « RÉCUPÉRER » ; un bouton
// « TOUT RÉCUPÉRER » en tête de page enchaîne toutes les récompenses avec la
// cinématique de claim (rayons rotatifs + zoom de l'objet).
//
// La récupération est RÉELLE : POST /me/battlepass/claim/:tier et
// /me/battlepass/claim-all (la récompense n'est plus auto-accordée côté
// serveur). Les paliers sans récompense configurée affichent une récompense
// FACTICE (visuel seulement) mais leur claim est enregistré pareil.
// ─────────────────────────────────────────────────────────────────────────────

const YELLOW = '#ffe234';

/**
 * Échelle de rareté Fortnite (couleurs ET libellés FR du jeu) :
 * gris Commun → vert Atypique → bleu Rare → violet Épique → orange Légendaire.
 * Locale à la page — la boutique garde sa propre échelle à 4 niveaux.
 */
type FnRarity = 'commun' | 'atypique' | 'rare' | 'epique' | 'legendaire';

const FN: Record<FnRarity, { hex: string; label: string }> = {
  commun: { hex: '#b1b1b1', label: 'Commun' },
  atypique: { hex: '#87e339', label: 'Atypique' },
  rare: { hex: '#41bfff', label: 'Rare' },
  epique: { hex: '#c359ff', label: 'Épique' },
  legendaire: { hex: '#ea8d23', label: 'Légendaire' },
};

/** Rareté boutique (4 niveaux) → échelle Fortnite de la page. */
const SHOP_TO_FN: Record<Rarity, FnRarity> = {
  common: 'commun',
  rare: 'rare',
  epic: 'epique',
  legendary: 'legendaire',
};

const CONSUMABLE_ICON: Record<string, LucideIcon> = {
  anti_ops: ShieldBan,
  elo_mult: Zap,
  force_duel: Sparkles,
  mini_ops: ShieldBan,
};

/** Largeur d'une tuile de la piste (une seule ligne, scroll horizontal). */
const TILE_W = 208;

/**
 * Scroll par glisser-déposer (souris) + molette verticale → défilement
 * horizontal. Le tactile garde le scroll natif.
 */
function useDragScroll(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let down = false;
    let startX = 0;
    let startLeft = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
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

// ─── Récompenses factices (le temps que les vraies soient configurées) ──────

interface FakeReward {
  kind: 'item' | 'coins' | 'consumable';
  name: string;
  rarity: FnRarity;
  coins?: number;
  consumableKind?: string;
  Icon: LucideIcon;
}

const FAKE_LEGENDARY: Array<[string, LucideIcon]> = [
  ['Aura Solaire', Flame],
  ['Couronne du GOAT', Crown],
  ['Cadre Holographique', Star],
  ['Titre : Légende du Cluster', Medal],
  ['Bannière Supernova', Rocket],
];
const FAKE_EPIC: Array<[string, LucideIcon]> = [
  ['Traînée Néon', Wand2],
  ['Emote « GG EZ »', Music2],
  ['Bannière Spectre', Ghost],
  ['Palette Synthwave', Palette],
  ['Épées Croisées', Swords],
];
const FAKE_COMMON_RARE: Array<[string, LucideIcon]> = [
  ['Sticker 42', Star],
  ['Bannière Givre', Snowflake],
  ['Titre : Padawan', Medal],
  ['Emote Pouce Levé', Music2],
  ['Fond de Profil Circuit', Palette],
  ['Sticker Flamme', Flame],
];

/**
 * Récompense factice, déterministe par numéro de palier (aucun aléatoire).
 * Balaye toute l'échelle de rareté : légendaire tous les 10 paliers, épique
 * tous les 5, bleu (coins) tous les 3, vert (conso/objet) sinon, gris au début.
 */
function fakeRewardFor(tier: number): FakeReward {
  if (tier % 10 === 0) {
    const [name, Icon] = FAKE_LEGENDARY[(tier / 10 - 1 + FAKE_LEGENDARY.length * 10) % FAKE_LEGENDARY.length]!;
    return { kind: 'item', name, rarity: 'legendaire', Icon };
  }
  if (tier % 5 === 0) {
    const [name, Icon] = FAKE_EPIC[Math.floor(tier / 5) % FAKE_EPIC.length]!;
    return { kind: 'item', name, rarity: 'epique', Icon };
  }
  if (tier % 3 === 0) {
    return { kind: 'coins', name: `${100 + (tier % 4) * 50}`, rarity: 'rare', coins: 100 + (tier % 4) * 50, Icon: Gem };
  }
  if (tier % 4 === 0) {
    const kinds = ['anti_ops', 'elo_mult', 'force_duel', 'mini_ops'] as const;
    const consumableKind = kinds[Math.floor(tier / 4) % kinds.length]!;
    return { kind: 'consumable', name: consumableKind, rarity: 'atypique', consumableKind, Icon: CONSUMABLE_ICON[consumableKind] ?? Zap };
  }
  const [name, Icon] = FAKE_COMMON_RARE[tier % FAKE_COMMON_RARE.length]!;
  return { kind: 'item', name, rarity: tier % 2 === 0 ? 'atypique' : 'commun', Icon };
}

// ─── Modèle d'affichage d'une tuile ──────────────────────────────────────────

interface TileView {
  tier: number;
  xpRequired: number;
  unlocked: boolean;
  claimed: boolean;
  claimable: boolean;
  name: string;
  /** Libellé de rareté / type affiché sous le nom. */
  tag: string;
  hex: string;
  Icon: LucideIcon | 'coin';
}

function buildTiles(data: BattlePassResponse, t: (k: string) => string): TileView[] {
  // Aucun palier configuré → piste 100% factice de 60 paliers pour la démo.
  const source: BattlePassTierView[] =
    data.tiers.length > 0
      ? data.tiers
      : Array.from({ length: 60 }, (_, i) => ({
          tier: i + 1,
          xpRequired: (i + 1) * 100,
          rewardKind: 'none' as const,
          unlocked: i + 1 <= data.level,
          claimedAt: null,
        }));

  return source.map((tier) => {
    const hasReal = tier.rewardKind !== 'none' && !(tier.rewardKind === 'item' && !tier.item);
    if (hasReal) {
      if (tier.rewardKind === 'coins') {
        const claimed = !!tier.claimedAt;
        return {
          tier: tier.tier,
          xpRequired: tier.xpRequired,
          unlocked: tier.unlocked,
          claimed,
          claimable: tier.unlocked && !claimed,
          name: `${tier.coins ?? 0}`,
          tag: t('battlepass.reward.coins'),
          hex: FN.rare.hex,
          Icon: 'coin',
        };
      }
      if (tier.rewardKind === 'consumable' && tier.consumableKind) {
        const claimed = !!tier.claimedAt;
        return {
          tier: tier.tier,
          xpRequired: tier.xpRequired,
          unlocked: tier.unlocked,
          claimed,
          claimable: tier.unlocked && !claimed,
          name: t(`battlepass.consumable.${tier.consumableKind}`),
          tag: t('battlepass.reward.consumable'),
          hex: FN.atypique.hex,
          Icon: CONSUMABLE_ICON[tier.consumableKind] ?? Zap,
        };
      }
      // item
      const fn = FN[SHOP_TO_FN[resolveRarity(tier.item!)]];
      const claimed = !!tier.claimedAt;
      return {
        tier: tier.tier,
        xpRequired: tier.xpRequired,
        unlocked: tier.unlocked,
        claimed,
        claimable: tier.unlocked && !claimed,
        name: tier.item!.name,
        tag: fn.label,
        hex: fn.hex,
        Icon: Gem,
      };
    }

    // Palier sans récompense configurée → visuel factice, mais claim réel.
    const fk = fakeRewardFor(tier.tier);
    const claimed = !!tier.claimedAt;
    const isCoins = fk.kind === 'coins';
    const isConsumable = fk.kind === 'consumable';
    return {
      tier: tier.tier,
      xpRequired: tier.xpRequired,
      unlocked: tier.unlocked,
      claimed,
      claimable: tier.unlocked && !claimed,
      name: isConsumable ? t(`battlepass.consumable.${fk.consumableKind}`) : fk.name,
      tag: isCoins
        ? t('battlepass.reward.coins')
        : isConsumable
          ? t('battlepass.reward.consumable')
          : FN[fk.rarity].label,
      hex: FN[fk.rarity].hex,
      Icon: isCoins ? 'coin' : fk.Icon,
    };
  });
}

// ─── Icône de récompense (objet Lucide ou pièce 42) ─────────────────────────

function RewardIcon({
  tile,
  className,
  color,
}: {
  tile: TileView;
  className: string;
  /** Couleur de l'icône — blanc sur les tuiles pleines, rareté sur fond sombre. */
  color?: string;
}) {
  if (tile.Icon === 'coin') {
    return <img src="/42coin.webp" alt="" className={`${className} object-contain drop-shadow`} />;
  }
  const Icon = tile.Icon;
  return <Icon className={className} strokeWidth={2} style={{ color: color ?? tile.hex }} />;
}

// ─── Cinématique de claim (rayons rotatifs + zoom, façon Fortnite) ──────────

function ClaimFx({
  tile,
  queueLen,
  lite,
  onDone,
  t,
}: {
  tile: TileView;
  queueLen: number;
  lite: boolean;
  onDone: () => void;
  t: (k: string) => string;
}) {
  const doneRef = useRef(false);
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  // Claim unitaire : ~1.5 s. « Tout récupérer » : cadence accélérée.
  const duration = lite ? 500 : queueLen > 3 ? 850 : 1500;
  useEffect(() => {
    const id = setTimeout(finish, duration);
    return () => clearTimeout(id);
  }, [finish, duration]);
  // Échap = passer (même geste que le clic).
  useEscapeKey(true, finish);

  // 14 particules déterministes projetées en étoile.
  const sparks = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    const radius = 150 + (i % 3) * 55;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, s: 4 + (i % 3) * 3 };
  });

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[120] flex items-center justify-center cursor-pointer select-none"
      style={{ background: 'radial-gradient(90% 90% at 50% 45%, rgba(9,16,38,0.82), rgba(4,8,20,0.95))' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onPointerDown={finish}
    >
      {/* Rayons rotatifs (rotation linéaire → boucle invisible) */}
      {!lite && (
        <div
          className="absolute w-[160vmax] h-[160vmax] pointer-events-none"
          style={{
            background: `repeating-conic-gradient(from 0deg, ${tile.hex}2e 0deg 9deg, transparent 9deg 24deg)`,
            WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 62%)',
            maskImage: 'radial-gradient(circle, black 0%, transparent 62%)',
            animation: 'bpSpin 16s linear infinite',
          }}
        />
      )}

      {/* Onde de choc unique à l'apparition */}
      {!lite && (
        <motion.span
          className="absolute rounded-full border-4 pointer-events-none"
          style={{ borderColor: tile.hex, width: 180, height: 180 }}
          initial={{ scale: 0.4, opacity: 0.9 }}
          animate={{ scale: 3.2, opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      )}

      {/* Particules projetées */}
      {!lite &&
        sparks.map((p, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{ width: p.s, height: p.s, background: i % 3 === 0 ? YELLOW : tile.hex }}
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ x: p.x, y: p.y, opacity: 0 }}
            transition={{ duration: 0.75, ease: 'easeOut', delay: 0.05 }}
          />
        ))}

      <div className="relative flex flex-col items-center gap-5 px-6">
        <motion.div
          className="font-gaming font-black italic uppercase text-[15px] sm:text-lg tracking-[0.22em] text-white/90"
          style={{ transform: 'skewX(-8deg)', textShadow: `0 0 24px ${tile.hex}` }}
          initial={{ y: -26, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.08, duration: 0.3, ease: 'easeOut' }}
        >
          {t('battlepass.rewardClaimed')}
        </motion.div>

        {/* L'objet : gros médaillon teinté rareté, zoom avec rebond */}
        <motion.div
          className="relative w-44 h-44 sm:w-56 sm:h-56 rounded-2xl flex items-center justify-center"
          style={{
            background: `radial-gradient(90% 75% at 50% 25%, ${tile.hex}59, #0c1731 78%)`,
            border: `3px solid ${tile.hex}`,
            boxShadow: `0 0 60px -6px ${tile.hex}, 0 0 140px -30px ${tile.hex}, inset 0 0 40px -14px ${tile.hex}`,
          }}
          initial={{ scale: 0.15, rotate: -10, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 15, delay: 0.05 }}
        >
          <RewardIcon tile={tile} className="w-24 h-24 sm:w-32 sm:h-32" />
          <span
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1 text-[11px] font-gaming font-black italic uppercase tracking-[0.18em] text-[#0a1228] whitespace-nowrap"
            style={{ background: tile.hex, transform: 'translateX(-50%) skewX(-8deg)', boxShadow: `0 0 18px ${tile.hex}` }}
          >
            {tile.tag}
          </span>
        </motion.div>

        <motion.div
          className="text-center"
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.16, duration: 0.3, ease: 'easeOut' }}
        >
          <div className="font-gaming font-black italic uppercase text-2xl sm:text-3xl text-white leading-tight" style={{ transform: 'skewX(-6deg)' }}>
            {tile.Icon === 'coin' ? `${tile.name} COINS` : tile.name}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.2em] font-bold" style={{ color: tile.hex }}>
            {t('battlepass.tier')} {tile.tier}
          </div>
        </motion.div>

        <div className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-bold">{t('battlepass.tapToSkip')}</div>
      </div>
    </motion.div>,
    document.body,
  );
}

// ─── Tuile de récompense (XXL, teintée rareté) ──────────────────────────────

function TierTile({
  tile,
  lite,
  onClaim,
  t,
}: {
  tile: TileView;
  lite: boolean;
  onClaim: (tile: TileView) => void;
  t: (k: string) => string;
}) {
  const { unlocked, claimed, claimable, hex } = tile;

  return (
    <motion.button
      type="button"
      disabled={!claimable}
      onClick={() => claimable && onClaim(tile)}
      className="relative w-full aspect-[4/5] rounded-xl overflow-hidden text-left disabled:cursor-default"
      whileHover={lite || !claimable ? undefined : { scale: 1.045, zIndex: 10 }}
      whileTap={claimable ? { scale: 0.97 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 24 }}
      style={{
        // Fond façon Fortnite : la CASE est remplie de sa couleur de rareté
        // (pleine en haut, fondu vers la nuit en bas où vit le texte). Les
        // paliers verrouillés gardent une teinte résiduelle de leur rareté.
        background: unlocked
          ? `radial-gradient(140% 110% at 50% 0%, ${hex} 0%, ${hex}b0 42%, #0e1c3d 100%)`
          : `radial-gradient(140% 110% at 50% 0%, ${hex}3d 0%, #0b152e 72%)`,
        border: claimable ? '2px solid transparent' : `2px solid ${unlocked ? hex : '#1d2b4d'}`,
        boxShadow: unlocked && !claimable ? `0 10px 26px -14px ${hex}, inset 0 1px 0 rgba(255,255,255,0.18)` : undefined,
        // Liseré jaune pulsé (animation CSS alternate → boucle parfaitement fluide).
        animation: claimable && !lite ? 'bpPulse 1.1s ease-in-out infinite alternate' : undefined,
        ...(claimable && lite ? { border: `2px solid ${YELLOW}` } : null),
      }}
    >
      {/* Lueur blanche derrière l'icône (la couleur, c'est déjà la case) */}
      {unlocked && (
        <span
          className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-3/4 aspect-square rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.38), transparent 66%)', filter: 'blur(7px)' }}
        />
      )}

      {/* Numéro de palier : plaque sombre penchée en haut à gauche (lisible sur case colorée) */}
      <span
        className="absolute top-0 left-0 px-3 py-1 font-gaming font-black italic text-base sm:text-lg tabular-nums leading-none"
        style={{
          background: unlocked ? 'rgba(8,15,36,0.82)' : '#22335c',
          color: unlocked ? '#ffffff' : '#7d8db4',
          clipPath: 'polygon(0 0, 100% 0, 82% 100%, 0 100%)',
          paddingRight: 18,
        }}
      >
        {tile.tier}
      </span>

      {/* Verrou (palier non atteint) */}
      {!unlocked && (
        <span className="absolute top-2 right-2 w-7 h-7 rounded-md bg-[#16234a] border border-[#2a3d6e] flex items-center justify-center">
          <Lock className="w-3.5 h-3.5 text-[#7d8db4]" strokeWidth={2.4} />
        </span>
      )}

      {/* Coche (récupéré) */}
      {claimed && (
        <span
          className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: YELLOW, boxShadow: `0 0 14px ${YELLOW}88` }}
        >
          <Check className="w-4 h-4 text-[#0a1228]" strokeWidth={3.4} />
        </span>
      )}

      {/* Icône de récompense, flottement doux (alternate → sans à-coup) */}
      <span
        className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
        style={{
          animation: unlocked && !claimed && !lite ? 'bpFloat 2.4s ease-in-out infinite alternate' : undefined,
          filter: unlocked ? undefined : 'grayscale(0.9) brightness(0.55)',
          opacity: claimed ? 0.55 : 1,
        }}
      >
        <RewardIcon
          tile={tile}
          className="w-14 h-14 sm:w-16 sm:h-16"
          color={unlocked ? '#ffffff' : tile.hex}
        />
      </span>

      {/* Bas de tuile : rareté + nom */}
      <span className={`absolute inset-x-0 bottom-0 px-2.5 ${claimable ? 'pb-8' : 'pb-2.5'} flex flex-col gap-0.5`}>
        <span
          className="text-[9px] font-gaming font-black italic uppercase tracking-[0.16em]"
          style={{ color: unlocked ? 'rgba(255,255,255,0.92)' : '#54648c', textShadow: unlocked ? '0 1px 3px rgba(0,0,0,0.6)' : undefined }}
        >
          {tile.tag}
        </span>
        <span
          className={`text-[12px] sm:text-[13px] font-bold leading-tight line-clamp-2 ${
            unlocked ? 'text-white' : 'text-[#7d8db4]'
          } ${claimed ? 'opacity-60' : ''}`}
        >
          {tile.Icon === 'coin' ? `${tile.name} Coins` : tile.name}
        </span>
        {!unlocked && (
          <span className="text-[9px] font-bold tabular-nums text-[#54648c] uppercase tracking-wide">
            {tile.xpRequired} {t('battlepass.xp')}
          </span>
        )}
      </span>

      {/* Ruban RÉCUPÉRER */}
      {claimable && (
        <span
          className="absolute inset-x-0 bottom-0 h-7 flex items-center justify-center gap-1 font-gaming font-black italic uppercase text-[11px] tracking-[0.14em] text-[#0a1228]"
          style={{ background: YELLOW }}
        >
          <Gift className="w-3.5 h-3.5" strokeWidth={2.6} />
          {t('battlepass.claim')}
        </span>
      )}

      {/* Voile sombre sur les tuiles récupérées (façon Fortnite « owned ») */}
      {claimed && <span className="absolute inset-0 bg-[#060b1c]/45 pointer-events-none" />}
    </motion.button>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function PassePage() {
  const t = useT();
  const lite = useIsLite();
  const { show } = useFlash();
  const [data, setData] = useState<BattlePassResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentTileRef = useRef<HTMLDivElement | null>(null);

  useDragScroll(scrollerRef);

  // File de la cinématique de claim (claim unitaire = 1 élément).
  const [fxQueue, setFxQueue] = useState<TileView[]>([]);
  // Verrou pendant l'appel API de claim (évite le double-clic).
  const claiming = useRef(false);

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

  const tiles = useMemo(() => (data ? buildTiles(data, t) : []), [data, t]);

  // À l'arrivée : centrer la piste sur le palier du niveau courant.
  useEffect(() => {
    if (loading) return;
    requestAnimationFrame(() => {
      const sc = scrollerRef.current;
      const nd = currentTileRef.current;
      if (!sc || !nd) return;
      const target = nd.offsetLeft - sc.clientWidth / 2 + nd.offsetWidth / 2;
      sc.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    });
    // volontairement déclenché une seule fois, données prêtes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  /** Fait défiler la piste d'environ un écran (flèches). */
  const scrollByPage = useCallback((delta: number) => {
    const sc = scrollerRef.current;
    if (!sc) return;
    sc.scrollBy({ left: delta * sc.clientWidth * 0.85, behavior: 'smooth' });
  }, []);

  // Position de scroll de la piste (0..1) + part visible — pilote la barre du bas.
  const [scrollPos, setScrollPos] = useState({ pos: 0, size: 1 });
  const onTrackScroll = useCallback(() => {
    const sc = scrollerRef.current;
    if (!sc || sc.scrollWidth === 0) return;
    setScrollPos({ pos: sc.scrollLeft / sc.scrollWidth, size: sc.clientWidth / sc.scrollWidth });
  }, []);
  useEffect(() => {
    onTrackScroll();
    window.addEventListener('resize', onTrackScroll);
    return () => window.removeEventListener('resize', onTrackScroll);
  }, [onTrackScroll, loading]);

  const claimables = useMemo(() => tiles.filter((tl) => tl.claimable), [tiles]);

  /** Claim unitaire : API d'abord, cinématique uniquement si le serveur accepte. */
  const claimOne = useCallback(
    async (tile: TileView) => {
      if (claiming.current) return;
      claiming.current = true;
      try {
        await api.battlePassClaimTier(tile.tier);
        setFxQueue([tile]);
      } catch (err) {
        show(err instanceof Error ? err.message : t('battlepass.claim'), 'error');
      } finally {
        claiming.current = false;
        void load();
      }
    },
    [load, show, t],
  );

  /** Claim groupé : le serveur réclame tout, la cinématique enchaîne les paliers acceptés. */
  const claimAll = useCallback(async () => {
    if (claiming.current || claimables.length === 0) return;
    claiming.current = true;
    try {
      const res = await api.battlePassClaimAll();
      const ok = new Set(res.tiers);
      const played = claimables.filter((tl) => ok.has(tl.tier));
      if (played.length > 0) setFxQueue(played);
    } catch (err) {
      show(err instanceof Error ? err.message : t('battlepass.claimAll'), 'error');
    } finally {
      claiming.current = false;
      void load();
    }
  }, [claimables, load, show, t]);

  const onFxDone = useCallback(() => {
    setFxQueue((q) => q.slice(1));
  }, []);

  const pct =
    data && data.xpForNextLevel > 0
      ? Math.min(1, Math.max(0, data.xpIntoLevel / data.xpForNextLevel))
      : 0;

  const claimedCount = useMemo(() => tiles.filter((tl) => tl.claimed).length, [tiles]);
  const fxCurrent = fxQueue[0];

  return (
    <div className="relative space-y-4">
      {/* Keyframes locales — alternate/linéaire uniquement : boucles sans à-coup */}
      <style>{`
        @keyframes bpPulse {
          from { border-color: ${YELLOW}77; box-shadow: 0 0 0 1px ${YELLOW}44, 0 0 14px -2px ${YELLOW}55; }
          to   { border-color: ${YELLOW};   box-shadow: 0 0 0 3px ${YELLOW}88, 0 0 26px 0px ${YELLOW}77; }
        }
        @keyframes bpFloat { from { transform: translate(-50%, -46%); } to { transform: translate(-50%, -56%); } }
        @keyframes bpSpin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Fond de scène : nuit Fortnite (bleu profond + bandes diagonales) ── */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden" style={{ background: 'linear-gradient(175deg, #0a1430 0%, #0d1c44 45%, #131040 100%)' }}>
        <div
          className="absolute -inset-x-1/4 top-[-20%] h-[70%] opacity-40"
          style={{
            background: 'linear-gradient(115deg, transparent 30%, rgba(58,92,196,0.35) 42%, transparent 50%, rgba(114,74,222,0.28) 62%, transparent 72%)',
            transform: 'skewY(-6deg)',
          }}
        />
        <div className="absolute -bottom-40 left-[15%] w-[42rem] h-[42rem] rounded-full blur-3xl" style={{ background: 'rgba(44,113,246,0.14)' }} />
        <div className="absolute -top-24 right-[5%] w-[34rem] h-[34rem] rounded-full blur-3xl" style={{ background: 'rgba(146,66,255,0.13)' }} />
      </div>

      {/* ── En-tête : titre + niveau + XP + TOUT RÉCUPÉRER ─────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl p-5 sm:p-6"
        style={{
          background: 'linear-gradient(120deg, #0e1c42 0%, #142757 55%, #1a1b52 100%)',
          border: '1px solid #27407c',
          boxShadow: 'inset 0 1px 0 rgba(140,170,255,0.15), 0 18px 50px -22px rgba(0,0,0,0.8)',
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none opacity-25"
          style={{ background: 'repeating-linear-gradient(115deg, transparent 0 26px, rgba(120,150,255,0.07) 26px 30px)' }}
        />

        <div className="relative flex flex-wrap items-center gap-x-5 gap-y-4">
          {/* Plaque niveau, penchée façon Fortnite */}
          <div
            className="shrink-0 flex flex-col items-center justify-center w-20 h-20 sm:w-24 sm:h-24"
            style={{
              background: `linear-gradient(160deg, ${YELLOW}, #ffb200)`,
              clipPath: 'polygon(8% 0, 100% 0, 92% 100%, 0 100%)',
              boxShadow: `0 10px 34px -10px ${YELLOW}aa`,
            }}
          >
            <span className="text-[9px] font-gaming font-black italic uppercase tracking-[0.14em] text-[#0a1228]/70 leading-none">
              {t('battlepass.level')}
            </span>
            <span className="font-gaming font-black italic text-4xl sm:text-5xl text-[#0a1228] tabular-nums leading-none" style={{ transform: 'skewX(-6deg)' }}>
              {loading || !data ? '–' : data.level}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <h1
              className="font-gaming font-black italic uppercase text-2xl sm:text-[34px] leading-none text-white"
              style={{ transform: 'skewX(-8deg)', textShadow: '0 3px 0 #0a1228, 0 0 34px rgba(80,130,255,0.55)' }}
            >
              {t('battlepass.title')}
            </h1>
            <div className="mt-0.5 text-[10px] sm:text-[11px] font-gaming font-bold italic uppercase tracking-[0.3em] text-[#7fa4ff]">
              42 League — {t('battlepass.season')} 1
            </div>

            {/* Barre d'XP : bleu électrique, crantée, reflet continu */}
            <div className="mt-3 max-w-xl">
              <div className="relative h-4 rounded-sm overflow-hidden" style={{ background: '#0a1430', border: '1px solid #27407c', transform: 'skewX(-8deg)' }}>
                <motion.div
                  className="h-full relative"
                  style={{ background: 'linear-gradient(90deg, #1a86ff, #2cc3ff 70%, #7fe7ff)', boxShadow: '0 0 16px rgba(44,195,255,0.8)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct * 100}%` }}
                  transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
                />
                {/* Crans */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: 'repeating-linear-gradient(90deg, transparent 0 10%, rgba(8,14,34,0.85) 10% calc(10% + 2px))' }}
                />
              </div>
              {!loading && data && (
                <div className="mt-1.5 flex items-center gap-2 text-[11px] font-bold tabular-nums text-[#9db8f5]">
                  <span className="text-[#2cc3ff]">{data.xpIntoLevel}</span>/{data.xpForNextLevel} {t('battlepass.xp')}
                  <span className="opacity-40">·</span>
                  <span className="opacity-80">
                    {t('battlepass.xpToNext')} : {Math.max(0, data.xpForNextLevel - data.xpIntoLevel)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* TOUT RÉCUPÉRER */}
          {claimables.length > 0 && (
            <button
              type="button"
              onClick={claimAll}
              className="group shrink-0 relative px-5 sm:px-7 py-3 font-gaming font-black italic uppercase text-sm sm:text-base tracking-[0.1em] text-[#0a1228] transition-transform hover:scale-105 active:scale-95"
              style={{
                background: `linear-gradient(160deg, ${YELLOW}, #ffc400)`,
                clipPath: 'polygon(6% 0, 100% 0, 94% 100%, 0 100%)',
                boxShadow: `0 12px 34px -10px ${YELLOW}`,
                animation: lite ? undefined : 'bpPulse 1.1s ease-in-out infinite alternate',
                border: '2px solid transparent',
              }}
            >
              <span className="inline-flex items-center gap-2">
                <Gift className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.6} />
                {t('battlepass.claimAll')}
                <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-[#0a1228] text-[12px] text-white tabular-nums not-italic">
                  {claimables.length}
                </span>
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ── Piste des récompenses : UNE ligne, scroll horizontal ───────────── */}
      {loading ? (
        <div className="grid grid-rows-2 grid-flow-col gap-3 overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ width: TILE_W }}>
              <Skeleton className="w-full aspect-[4/5] rounded-xl" />
            </div>
          ))}
        </div>
      ) : tiles.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ background: '#0c1731', border: '1px solid #27407c' }}>
          <Sparkles className="w-8 h-8 text-[#54648c] mx-auto mb-3" strokeWidth={1.8} />
          <p className="text-sm text-[#9db8f5] font-medium">{t('battlepass.empty')}</p>
        </div>
      ) : (
        <div className="relative">
          {/* Compteur global, centré au-dessus de la piste */}
          <div
            className="text-center mb-2 font-gaming font-black italic uppercase text-lg sm:text-xl text-white tracking-[0.1em] tabular-nums"
            style={{ transform: 'skewX(-8deg)' }}
          >
            <span className="text-[#2cc3ff]">{claimedCount}</span>
            <span className="text-[#54648c]">/{tiles.length}</span>{' '}
            <span className="text-[13px] sm:text-[15px] text-[#7fa4ff]">{t('battlepass.claimed')}</span>
          </div>

          {/* Flèches par-dessus les bords, façon sélecteur Fortnite */}
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            className="absolute left-0 top-1/2 z-30 -translate-y-1/2 w-11 h-14 flex items-center justify-center text-white transition-transform hover:scale-110 active:scale-95"
            style={{ background: '#16234acc', border: '1px solid #2a3d6e', clipPath: 'polygon(22% 0, 100% 0, 78% 100%, 0 100%)', backdropFilter: 'blur(4px)' }}
            aria-label="reculer"
          >
            <ChevronLeft className="w-6 h-6" strokeWidth={3} />
          </button>
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            className="absolute right-0 top-1/2 z-30 -translate-y-1/2 w-11 h-14 flex items-center justify-center text-white transition-transform hover:scale-110 active:scale-95"
            style={{ background: '#16234acc', border: '1px solid #2a3d6e', clipPath: 'polygon(22% 0, 100% 0, 78% 100%, 0 100%)', backdropFilter: 'blur(4px)' }}
            aria-label="avancer"
          >
            <ChevronRight className="w-6 h-6" strokeWidth={3} />
          </button>

          {/* Fondus latéraux */}
          <div className="pointer-events-none absolute left-0 inset-y-0 w-10 z-20" style={{ background: 'linear-gradient(90deg, #0b1836, transparent)' }} />
          <div className="pointer-events-none absolute right-0 inset-y-0 w-10 z-20" style={{ background: 'linear-gradient(270deg, #0b1836, transparent)' }} />

          {/* 2 lignes, remplissage colonne par colonne. Le padding intérieur
              laisse la place au zoom du hover (plus de tuile rognée aux bords). */}
          <div
            ref={scrollerRef}
            onScroll={onTrackScroll}
            className="grid grid-rows-2 grid-flow-col gap-3 overflow-x-auto overflow-y-hidden snap-x scroll-px-6 px-4 py-4 cursor-grab scrollbar-none select-none"
          >
            {tiles.map((tile) => (
              <div
                key={tile.tier}
                ref={data && tile.tier === data.level ? (el) => (currentTileRef.current = el) : undefined}
                className="snap-start"
                style={{ width: TILE_W }}
              >
                <TierTile tile={tile} lite={lite} onClaim={claimOne} t={t} />
              </div>
            ))}
          </div>

          {/* Barre de position du scroll (part visible + avancement) */}
          <div
            className="mt-1 mx-1 h-2 rounded-full overflow-hidden"
            style={{ background: '#101f42', border: '1px solid #27407c' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, scrollPos.size * 100)}%`,
                marginLeft: `${Math.min(100, scrollPos.pos * 100)}%`,
                background: 'linear-gradient(90deg, #1a86ff, #2cc3ff)',
                boxShadow: '0 0 10px rgba(44,195,255,0.75)',
              }}
            />
          </div>
        </div>
      )}

      {/* ── Cinématique de claim ───────────────────────────────────────────── */}
      <AnimatePresence>
        {fxCurrent && (
          <ClaimFx
            key={fxCurrent.tier}
            tile={fxCurrent}
            queueLen={fxQueue.length}
            lite={lite}
            onDone={onFxDone}
            t={t}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
