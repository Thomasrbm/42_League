import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Eye,
  Flame,
  Gem,
  Gift,
  Image as ImageIcon,
  Lock,
  Medal,
  Music2,
  Palette,
  PartyPopper,
  ShieldBan,
  Sparkles,
  Star,
  Swords,
  Wand2,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Skeleton } from '../../mobile/primitives/Skeleton';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFlash } from '../../hooks/useFlash';
import { useT } from '../../lib/i18n';
import { useIsLite } from '../../hooks/usePerf';
import { api, type BattlePassResponse, type BattlePassTierView, type ShopItemData } from '../../lib/api';
import { resolveRarity, type Rarity } from '../../lib/rarity';
import { TAUNT_EMOTES, FREE_TAUNT_EMOTES, TAUNT_EMOTE_LEVEL_STEP } from '../../lib/tauntEmotes';

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
  commun: { hex: '#c9d2e0', label: 'Commun' },
  atypique: { hex: '#7ef23e', label: 'Atypique' },
  rare: { hex: '#2fb9ff', label: 'Rare' },
  epique: { hex: '#c94bff', label: 'Épique' },
  legendaire: { hex: '#ff9e1b', label: 'Légendaire' },
};

/**
 * Version assombrie d'une couleur hex `#rrggbb` (facteur 0..1).
 * Sert à fondre le bas des tuiles vers une nuit teintée de LEUR rareté
 * (et non plus vers le bleu nuit générique qui éteignait les couleurs).
 */
function darkenHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Rareté boutique (4 niveaux) → échelle Fortnite de la page. */
const SHOP_TO_FN: Record<Rarity, FnRarity> = {
  common: 'commun',
  rare: 'rare',
  epic: 'epique',
  legendary: 'legendaire',
};

/** Échelle de la page → rareté boutique (pour choisir un vrai item cohérent). */
const FN_TO_SHOP: Record<FnRarity, Rarity> = {
  commun: 'common',
  atypique: 'rare',
  rare: 'rare',
  epique: 'epic',
  legendaire: 'legendary',
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
  /** Émote de victoire (emoji) quand la récompense factice EST une émote. */
  emote?: string;
  /** Palier « bannière » dédié : buildTiles y pose une VRAIE bannière boutique
   *  (foot en premier), avec repli en consommable si le stock est épuisé. */
  slot?: 'banner';
  Icon: LucideIcon;
}

// Les BANNIÈRES ne figurent plus dans ces pools factices : elles ont désormais
// leurs propres paliers dédiés, répartis régulièrement sur toute la longueur du
// passe et remplis par de VRAIES bannières boutique (cf. slot 'banner' +
// buildTiles). Ces pools ne contiennent donc que des cosmétiques NON-bannière.
const FAKE_LEGENDARY: Array<[string, LucideIcon]> = [
  ['Aura Solaire', Flame],
  ['Couronne du GOAT', Crown],
  ['Cadre Holographique', Star],
  ['Titre : Légende du Cluster', Medal],
  ['Aura Prismatique', Sparkles],
];
const FAKE_EPIC: Array<[string, LucideIcon]> = [
  ['Traînée Néon', Wand2],
  ['Emote « GG EZ »', Music2],
  ['Palette Synthwave', Palette],
  ['Épées Croisées', Swords],
  ['Cadre Néon', Star],
];
const FAKE_COMMON_RARE: Array<[string, LucideIcon]> = [
  ['Sticker 42', Star],
  ['Titre : Padawan', Medal],
  ['Emote Pouce Levé', Music2],
  ['Sticker Néon', Sparkles],
  ['Sticker Flamme', Flame],
];

/** Consommable factice déterministe (cycle des 4 types) pour un palier donné. */
function fakeConsumable(tier: number, step: number): FakeReward {
  const kinds = ['anti_ops', 'elo_mult', 'force_duel', 'mini_ops'] as const;
  const consumableKind = kinds[Math.floor(tier / step) % kinds.length]!;
  return { kind: 'consumable', name: consumableKind, rarity: 'atypique', consumableKind, Icon: CONSUMABLE_ICON[consumableKind] ?? Zap };
}

/**
 * Récompense factice, déterministe par numéro de palier (aucun aléatoire).
 * Cadence harmonisée, gagnable régulièrement sur TOUTE la longueur du passe :
 *  - émote réelle tous les 7 paliers (économie backend) ;
 *  - BANNIÈRE tous les 12 paliers dès le n°3 (foot en premier, vraie bannière
 *    boutique posée par buildTiles) — répartie du début à la fin du passe ;
 *  - légendaire tous les 10, épique tous les 5, coins tous les 3 ;
 *  - consommable sur les paliers pairs restants (comblent les anciens slots de
 *    fausses bannières « Givre ») ; petit cosmétique sur les impairs restants.
 */
function fakeRewardFor(tier: number): FakeReward {
  // Émotes de victoire : déblocage RÉEL tous les 7 niveaux (économie partagée
  // avec le backend, cf. lib/tauntEmotes.ts) — affichées sur la piste.
  if (tier % TAUNT_EMOTE_LEVEL_STEP === 0) {
    const emote = TAUNT_EMOTES[FREE_TAUNT_EMOTES + tier / TAUNT_EMOTE_LEVEL_STEP - 1];
    if (emote) return { kind: 'item', name: `Émote ${emote}`, rarity: 'epique', emote, Icon: PartyPopper };
  }
  // Bannière — palier dédié régulier (1 tous les 12, dès le 3e). Rempli par une
  // VRAIE bannière boutique dans buildTiles (foot en premier), repli consommable.
  if (tier % 12 === 3) {
    return { kind: 'item', slot: 'banner', name: 'Bannière', rarity: 'epique', Icon: ImageIcon };
  }
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
  // Paliers pairs restants → consommables (bien plus fréquents qu'avant).
  if (tier % 2 === 0) {
    return fakeConsumable(tier, 2);
  }
  // Paliers impairs restants → petit cosmétique (sticker / titre, substitué par
  // un vrai item boutique si dispo).
  const [name, Icon] = FAKE_COMMON_RARE[tier % FAKE_COMMON_RARE.length]!;
  return { kind: 'item', name, rarity: 'commun', Icon };
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
  /** Vrai cosmétique de boutique → rendu de son visuel réel (titre/bannière/badge). */
  item?: ShopItemData;
  /** Émote de victoire (emoji) → rendu du glyphe réel. */
  emote?: string;
}

// Ordre des bannières sur le passe : « foot en premier », puis les autres
// disciplines, puis le reste. Basé sur des mots-clés du NOM de la bannière
// (les bannières boutique sont nommées par thème). Rang bas = tôt sur le passe.
const BANNER_GAME_KW: Array<[RegExp, number]> = [
  // Foot (« Supporter assidu » & co) : rang 0 → TOUJOURS en tête du passe.
  [/baby|foot|supporter|assidu/i, 0],
  [/smash/i, 1],
  [/chess|[ée]chec/i, 2],
  [/street|fighter|\bsf\b/i, 3],
  [/fl[ée]ch|dart/i, 4],
  [/coding|\bcode\b/i, 5],
  [/pok[ée]mon/i, 6],
];
function bannerGameRank(name: string): number {
  for (const [re, rank] of BANNER_GAME_KW) if (re.test(name)) return rank;
  return 50;
}
/** Une bannière foot (rang 0) ? Toutes passent sur le passe, en premier. */
function isFootBanner(name: string): boolean {
  return bannerGameRank(name) === 0;
}
/** Combien de bannières NON-foot au maximum sur le passe (vers la fin). Les
 *  slots de bannière restants retombent en consommable. → « toutes les foot,
 *  mais pas toutes les autres ». Ajuste ce nombre pour en montrer plus/moins. */
const MAX_OTHER_BANNERS = 3;

function buildTiles(
  data: BattlePassResponse,
  t: (k: string) => string,
  realPool: ShopItemData[],
): TileView[] {
  // Les BANNIÈRES sont mises à part : elles alimentent les paliers « bannière »
  // dédiés (répartis régulièrement), triées « foot en premier » puis par prix.
  // Le reste (titres / badges) alimente les autres slots d'objet, rangé par
  // rareté. Ainsi les bannières ne se retrouvent JAMAIS piochées au hasard sur un
  // slot générique, et inversement.
  // Bannières : TOUTES les foot (en premier), puis seulement les MAX_OTHER_BANNERS
  // premières bannières des autres disciplines (par prix). Les foot occupent donc
  // les premiers slots de bannière du passe, les autres arrivent vers la fin, et
  // le surplus d'« autres » n'apparaît pas (repli consommable).
  const allBanners = realPool.filter((it) => it.category === 'banner');
  const footBanners = allBanners
    .filter((it) => isFootBanner(it.name))
    .sort((a, b) => a.price - b.price);
  const otherBanners = allBanners
    .filter((it) => !isFootBanner(it.name))
    .sort((a, b) => bannerGameRank(a.name) - bannerGameRank(b.name) || a.price - b.price)
    .slice(0, MAX_OTHER_BANNERS);
  const realBanners = [...footBanners, ...otherBanners];
  const realOther = realPool.filter((it) => it.category !== 'banner');
  const byRarity: Record<Rarity, ShopItemData[]> = { common: [], rare: [], epic: [], legendary: [] };
  for (const it of realOther) byRarity[resolveRarity(it)].push(it);
  // Dédup : chaque cosmétique réel n'apparaît qu'UNE fois sur toute la piste. On
  // pré-marque les items déjà posés par les paliers configurés, puis realItemFor
  // (titres/badges) et realBannerNext (bannières) ne piochent que des items JAMAIS
  // utilisés ; épuisé → null (repli sur le visuel factice / consommable).
  const usedItemIds = new Set<string>();
  for (const ti of data.tiers) if (ti.rewardKind === 'item' && ti.item) usedItemIds.add(ti.item.id);
  function realItemFor(_tier: number, fn: FnRarity): ShopItemData | null {
    if (realOther.length === 0) return null;
    const want = FN_TO_SHOP[fn];
    const bucket = byRarity[want].length > 0 ? byRarity[want] : realOther;
    const pick =
      bucket.find((it) => !usedItemIds.has(it.id)) ??
      realOther.find((it) => !usedItemIds.has(it.id)) ??
      null;
    if (pick) usedItemIds.add(pick.id);
    return pick;
  }
  // Prochaine VRAIE bannière encore libre (ordre foot-first déjà appliqué).
  function realBannerNext(): ShopItemData | null {
    const pick = realBanners.find((it) => !usedItemIds.has(it.id)) ?? null;
    if (pick) usedItemIds.add(pick.id);
    return pick;
  }

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
        item: tier.item!,
      };
    }

    // Palier sans récompense configurée → visuel factice, mais claim réel.
    const fk = fakeRewardFor(tier.tier);
    const claimed = !!tier.claimedAt;
    const isCoins = fk.kind === 'coins';
    const isConsumable = fk.kind === 'consumable';

    // Palier BANNIÈRE dédié → vraie bannière boutique (foot en premier). Quand
    // le stock de bannières réelles est épuisé, on retombe sur un CONSOMMABLE
    // (jamais une fausse « Bannière Givre »).
    if (fk.slot === 'banner') {
      const real = realBannerNext();
      if (real) {
        const fn = FN[SHOP_TO_FN[resolveRarity(real)]];
        return {
          tier: tier.tier,
          xpRequired: tier.xpRequired,
          unlocked: tier.unlocked,
          claimed,
          claimable: tier.unlocked && !claimed,
          name: real.name,
          tag: fn.label,
          hex: fn.hex,
          Icon: Gem,
          item: real,
        };
      }
      const ck = (['anti_ops', 'elo_mult', 'force_duel', 'mini_ops'] as const)[tier.tier % 4]!;
      return {
        tier: tier.tier,
        xpRequired: tier.xpRequired,
        unlocked: tier.unlocked,
        claimed,
        claimable: tier.unlocked && !claimed,
        name: t(`battlepass.consumable.${ck}`),
        tag: t('battlepass.reward.consumable'),
        hex: FN.atypique.hex,
        Icon: CONSUMABLE_ICON[ck] ?? Zap,
      };
    }

    // Remplace les faux cosmétiques (titres inventés) par de VRAIS items de la
    // boutique qui existent (≤ 2000 coins). On ne touche PAS aux émotes
    // (déblocage réel), ni aux coins/consommables, ni aux bannières (ci-dessus).
    if (fk.kind === 'item' && !fk.name.startsWith('Émote ')) {
      const real = realItemFor(tier.tier, fk.rarity);
      if (real) {
        const fn = FN[SHOP_TO_FN[resolveRarity(real)]];
        return {
          tier: tier.tier,
          xpRequired: tier.xpRequired,
          unlocked: tier.unlocked,
          claimed,
          claimable: tier.unlocked && !claimed,
          name: real.name,
          tag: fn.label,
          hex: fn.hex,
          Icon: Gem,
          item: real,
        };
      }
    }
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
      emote: fk.emote,
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

// ─── Visuel RÉEL d'une récompense (émote / titre / bannière), sinon icône ────
// Rend l'objet exactement comme en boutique, mais en petit pour rentrer dans la
// tuile : glyphe emoji pour une émote, texte stylisé (dans sa couleur, rainbow
// géré par CSS) pour un titre, image pour une bannière. Repli sur RewardIcon
// (pièce / Lucide) pour les coins, consommables et récompenses factices restantes.
function RewardVisual({
  tile,
  unlocked,
  size = 'sm',
}: {
  tile: TileView;
  unlocked: boolean;
  size?: 'sm' | 'lg';
}) {
  const big = size === 'lg';
  if (tile.emote) {
    return (
      <span
        className="leading-none select-none"
        style={{ fontSize: big ? 'clamp(4.5rem, 16vw, 6.5rem)' : 'clamp(2.4rem, 9vw, 3.2rem)' }}
      >
        {tile.emote}
      </span>
    );
  }
  const item = tile.item;
  if (item) {
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    if (item.category === 'banner' && typeof payload.image === 'string') {
      return (
        <img
          src={payload.image}
          alt=""
          className={`object-cover rounded-lg border border-white/25 shadow-md ${
            big ? 'w-28 h-28 sm:w-36 sm:h-36' : 'w-[4.2rem] h-[4.2rem] sm:w-[4.8rem] sm:h-[4.8rem]'
          }`}
        />
      );
    }
    if (item.category === 'title') {
      const title = (typeof payload.title === 'string' && payload.title) || item.name;
      const rainbow = item.color === 'rainbow';
      return (
        <span
          className={`text-center font-black italic leading-tight line-clamp-3 ${
            big ? 'max-w-[10rem] text-lg sm:text-2xl' : 'max-w-[5.5rem] text-[13px]'
          } ${rainbow ? 'title-rainbow' : ''}`}
          style={{ color: rainbow ? undefined : item.color ?? '#ffc94a' }}
        >
          ❝{title}❞
        </span>
      );
    }
  }
  return (
    <RewardIcon
      tile={tile}
      className={big ? 'w-24 h-24 sm:w-32 sm:h-32' : 'w-14 h-14 sm:w-16 sm:h-16'}
      color={unlocked ? '#ffffff' : tile.hex}
    />
  );
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
          <RewardVisual tile={tile} unlocked size="lg" />
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

/** Une tuile porte-t-elle un cosmétique réel qui vaut le coup d'être prévisualisé
 *  en grand ? (émote, bannière, titre) — pas les coins / consommables. */
function isPreviewable(tile: TileView): boolean {
  return !!tile.emote || (!!tile.item && tile.item.category !== 'badge');
}

function TierTile({
  tile,
  lite,
  onClaim,
  onPreview,
  t,
}: {
  tile: TileView;
  lite: boolean;
  onClaim: (tile: TileView) => void;
  onPreview: (tile: TileView) => void;
  t: (k: string) => string;
}) {
  const { unlocked, claimed, claimable, hex } = tile;
  const previewable = isPreviewable(tile);

  return (
    <motion.button
      type="button"
      disabled={!claimable}
      onClick={() => claimable && onClaim(tile)}
      className="relative w-full aspect-[4/5] rounded-xl overflow-hidden text-left disabled:cursor-default"
      animate={claimable ? { scale: 1.03 } : { scale: 1 }}
      whileHover={lite || !claimable ? undefined : { scale: 1.08, zIndex: 10 }}
      whileTap={claimable ? { scale: 0.97 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 24 }}
      style={{
        // Fond façon Fortnite : la CASE est remplie de sa couleur de rareté,
        // PLEINE sur les 3/4 hauts puis fondue vers une nuit teintée de la
        // MÊME rareté (plus de bleu nuit générique qui éteignait la teinte).
        // Les paliers verrouillés gardent une teinte franche de leur rareté.
        background: unlocked
          ? `radial-gradient(140% 120% at 50% 0%, ${hex} 0%, ${hex} 70%, ${darkenHex(hex, 0.3)} 100%)`
          : `radial-gradient(140% 120% at 50% 0%, ${hex}66 0%, ${hex}2e 62%, ${darkenHex(hex, 0.22)} 100%)`,
        border: claimable ? '2px solid transparent' : `2px solid ${unlocked ? hex : `${hex}88`}`,
        // Glow de la couleur de rareté sur toute tuile déverrouillée (le
        // pulse jaune du claimable prend le dessus quand il est animé).
        boxShadow: unlocked
          ? `0 0 18px ${hex}66, 0 10px 26px -14px ${hex}, inset 0 1px 0 rgba(255,255,255,0.22)`
          : undefined,
        // Liseré jaune pulsé (animation CSS alternate → boucle parfaitement fluide).
        animation: claimable && !lite ? 'bpPulse 1.1s ease-in-out infinite alternate' : undefined,
        ...(claimable && lite ? { border: `2px solid ${YELLOW}`, boxShadow: `0 0 0 3px ${YELLOW}88, 0 0 22px ${YELLOW}77` } : null),
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

      {/* Cluster haut-droite : bouton « prévisualiser » (cosmétiques), verrou, coche. */}
      <span className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
        {previewable && (
          <span
            role="button"
            tabIndex={0}
            aria-label={t('battlepass.preview')}
            title={t('battlepass.preview')}
            // stopPropagation partout : ne PAS déclencher le claim de la tuile ni
            // le drag-scroll de la piste. Ouvre juste l'aperçu plein écran.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onPreview(tile);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onPreview(tile);
              }
            }}
            className="w-7 h-7 rounded-md bg-[#0a1228]/80 border border-white/25 flex items-center justify-center cursor-pointer hover:bg-[#0a1228] hover:border-white/50 transition-colors"
          >
            <Eye className="w-4 h-4 text-white" strokeWidth={2.2} />
          </span>
        )}

        {/* Verrou (palier non atteint) */}
        {!unlocked && (
          <span className="w-7 h-7 rounded-md bg-[#16234a] border border-[#2a3d6e] flex items-center justify-center">
            <Lock className="w-3.5 h-3.5 text-[#7d8db4]" strokeWidth={2.4} />
          </span>
        )}

        {/* Coche (récupéré) */}
        {claimed && (
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: YELLOW, boxShadow: `0 0 14px ${YELLOW}88` }}
          >
            <Check className="w-4 h-4 text-[#0a1228]" strokeWidth={3.4} />
          </span>
        )}
      </span>

      {/* Icône de récompense, flottement doux (alternate → sans à-coup) */}
      <span
        className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
        style={{
          animation: unlocked && !claimed && !lite ? 'bpFloat 2.4s ease-in-out infinite alternate' : undefined,
          filter: unlocked ? undefined : 'grayscale(0.35) brightness(0.8)',
          opacity: claimed ? 0.85 : 1,
        }}
      >
        <RewardVisual tile={tile} unlocked={unlocked} />
      </span>

      {/* Bas de tuile : rareté + nom */}
      <span className={`absolute inset-x-0 bottom-0 px-2.5 ${claimable ? 'pb-8' : 'pb-2.5'} flex flex-col gap-0.5`}>
        <span
          className="text-[9px] font-gaming font-black italic uppercase tracking-[0.16em]"
          style={{ color: unlocked ? 'rgba(255,255,255,0.95)' : hex, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
        >
          {tile.tag}
        </span>
        <span
          className={`text-[12px] sm:text-[13px] font-bold leading-tight line-clamp-2 ${
            unlocked ? 'text-white' : 'text-[#a8b8dc]'
          } ${claimed ? 'opacity-85' : ''}`}
        >
          {tile.Icon === 'coin' ? `${tile.name} Coins` : tile.name}
        </span>
        {!unlocked && (
          <span className="text-[9px] font-bold tabular-nums text-[#8fa2cc] uppercase tracking-wide">
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

      {/* Voile sombre LÉGER sur les tuiles récupérées (la rareté doit rester lisible) */}
      {claimed && <span className="absolute inset-0 bg-[#060b1c]/20 pointer-events-none" />}
    </motion.button>
  );
}

// ─── Aperçu plein écran d'une récompense ─────────────────────────────────────
// Ouvert par le bouton « œil » d'une tuile : montre le cosmétique en GRAND
// (visuel réel via RewardVisual size=lg), son nom, sa rareté et le n° de palier.
// Fermeture au clic sur le fond, sur la croix, ou avec Échap.
function TilePreviewModal({
  tile,
  onClose,
  t,
}: {
  tile: TileView;
  onClose: () => void;
  t: (k: string) => string;
}) {
  useEscapeKey(true, onClose);
  return createPortal(
    <motion.div
      className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-[#060b1c]/85 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative w-full max-w-sm rounded-2xl px-6 py-8 flex flex-col items-center text-center"
        initial={{ scale: 0.9, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: `radial-gradient(140% 120% at 50% 0%, ${tile.hex} 0%, ${tile.hex} 55%, ${darkenHex(tile.hex, 0.28)} 100%)`,
          border: `2px solid ${tile.hex}`,
          boxShadow: `0 0 40px ${tile.hex}66, 0 24px 60px -24px ${tile.hex}`,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('battlepass.close') || 'Fermer'}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#0a1228]/70 border border-white/25 flex items-center justify-center text-white hover:bg-[#0a1228] transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={2.6} />
        </button>

        <span className="font-gaming font-black italic text-xs uppercase tracking-[0.16em] text-white/90">
          {t('battlepass.tier')} {tile.tier}
        </span>

        <span className="my-6 flex items-center justify-center min-h-[9rem]">
          <RewardVisual tile={tile} unlocked size="lg" />
        </span>

        <span
          className="font-gaming font-black italic text-[10px] uppercase tracking-[0.18em]"
          style={{ color: 'rgba(255,255,255,0.95)', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
        >
          {tile.tag}
        </span>
        <span className="mt-1 text-lg font-bold leading-tight text-white">
          {tile.Icon === 'coin' ? `${tile.name} Coins` : tile.name}
        </span>
      </motion.div>
    </motion.div>,
    document.body,
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
  const barRef = useRef<HTMLDivElement>(null);

  useDragScroll(scrollerRef);

  // File de la cinématique de claim (claim unitaire = 1 élément).
  const [fxQueue, setFxQueue] = useState<TileView[]>([]);
  // Tuile en cours d'aperçu plein écran (bouton « œil »), sinon null.
  const [previewTile, setPreviewTile] = useState<TileView | null>(null);
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

  // Catalogue réel de la boutique (cosmétiques ≤ 2000 coins) — sert à remplacer
  // les faux items du passe par de vrais items achetables qui existent.
  const [realCosmetics, setRealCosmetics] = useState<ShopItemData[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .shop()
      .then((r) => {
        if (!alive) return;
        const pool = r.items
          .filter(
            (it) =>
              (it.category === 'title' || it.category === 'banner' || it.category === 'badge') &&
              it.active &&
              it.price <= 2000,
          )
          .sort((a, b) => a.price - b.price);
        setRealCosmetics(pool);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const tiles = useMemo(
    () => (data ? buildTiles(data, t, realCosmetics) : []),
    [data, t, realCosmetics],
  );

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

  // Barre de position INTERACTIVE : molette pour défiler la piste, et drag/clic
  // sur la barre pour se déplacer directement à un endroit du passe (souris ET
  // tactile). Listeners natifs (wheel non-passif) façon useDragScroll.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const seek = (clientX: number) => {
      const sc = scrollerRef.current;
      if (!sc) return;
      const rect = bar.getBoundingClientRect();
      const ratio = rect.width > 0 ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0;
      sc.scrollLeft = ratio * (sc.scrollWidth - sc.clientWidth);
    };
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      seek(e.clientX);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (dragging) seek(e.clientX);
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      const sc = scrollerRef.current;
      if (!sc) return;
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      sc.scrollLeft += delta;
      e.preventDefault();
    };
    bar.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    bar.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      bar.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      bar.removeEventListener('wheel', onWheel);
    };
  }, [loading]);

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
          from { border-color: ${YELLOW}aa; box-shadow: 0 0 0 2px ${YELLOW}55, 0 0 18px 0px ${YELLOW}66; }
          to   { border-color: ${YELLOW};   box-shadow: 0 0 0 4px ${YELLOW}cc, 0 0 38px 6px ${YELLOW}99; }
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
        <div className="relative flex flex-wrap items-center gap-x-5 gap-y-4">
          {/* Plaque niveau, penchée façon Fortnite */}
          <div
            className="shrink-0 flex flex-col items-center justify-center w-20 h-20 sm:w-24 sm:h-24"
            style={{
              background: `linear-gradient(160deg, #fff566 0%, ${YELLOW} 45%, #ff9500 100%)`,
              clipPath: 'polygon(8% 0, 100% 0, 92% 100%, 0 100%)',
              boxShadow: `0 0 28px -2px ${YELLOW}cc, 0 12px 38px -10px #ff9500`,
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
                  style={{ background: 'linear-gradient(90deg, #1a86ff, #2cc3ff 60%, #8ff3ff)', boxShadow: '0 0 22px rgba(44,195,255,1), 0 0 44px -4px rgba(127,231,255,0.85)' }}
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
                background: `linear-gradient(160deg, #fff566, #ffae00)`,
                clipPath: 'polygon(6% 0, 100% 0, 94% 100%, 0 100%)',
                boxShadow: `0 0 26px -2px ${YELLOW}bb, 0 12px 34px -10px ${YELLOW}`,
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

      {/* ── Comment gagner de l'XP ─────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl p-4 sm:p-5"
        style={{ background: '#0c1731', border: '1px solid #27407c' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-[#2cc3ff]" strokeWidth={2.6} fill="currentColor" />
          <h2 className="font-gaming font-black italic uppercase text-sm sm:text-base tracking-[0.12em] text-white">
            Comment gagner de l'XP
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <XpSource
            icon={Swords}
            color="#2cc3ff"
            title="Jouer un match"
            desc="Victoire +100 · défaite +70 · nulle +85 XP. Bonus d'écart en 1v1 (jusqu'à +50 pour un large gagnant, +25 pour une défaite serrée). On gagne TOUJOURS de l'XP, même en perdant."
          />
          <XpSource
            icon={Star}
            color="#ffc94a"
            title="Quêtes"
            desc="Objectifs (jouer 5 matchs, gagner 3 fois, toucher à plusieurs modes…) : +300 à +500 XP chacune."
          />
          <XpSource
            icon={Medal}
            color="#ff4d6d"
            title="Gagner un tournoi officiel"
            desc="ÉNORME buff : 🥇 +6 niveaux d'un coup · 🥈 +4,5 · 🥉 +3 · 4e +1,5. Rien au-delà du top 4."
            highlight
          />
          <XpSource
            icon={Crown}
            color="#7fa4ff"
            title="Gagner un tournoi amical"
            desc="Gros buff aussi : 🥇 +2 niveaux · 🥈 +1,5 · 🥉 +1 · 4e +0,5. Rien au-delà du top 4."
          />
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
                <TierTile tile={tile} lite={lite} onClaim={claimOne} onPreview={setPreviewTile} t={t} />
              </div>
            ))}
          </div>

          {/* Barre de position du scroll (part visible + avancement) —
              INTERACTIVE : molette pour défiler, drag/clic pour se déplacer. */}
          <div
            ref={barRef}
            className="mt-1 mx-1 h-2.5 rounded-full overflow-hidden cursor-pointer touch-none select-none"
            style={{ background: '#101f42', border: '1px solid #27407c' }}
          >
            <div
              className="h-full rounded-full pointer-events-none"
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

      {/* ── Aperçu plein écran d'une récompense (bouton « œil ») ────────────── */}
      <AnimatePresence>
        {previewTile && (
          <TilePreviewModal
            key={previewTile.tier}
            tile={previewTile}
            onClose={() => setPreviewTile(null)}
            t={t}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Carte « source d'XP » (encart pédagogique sous la barre de progression) ──
function XpSource({
  icon: Icon,
  color,
  title,
  desc,
  highlight = false,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  desc: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl p-3"
      style={{
        background: highlight ? `${color}14` : '#0a1430',
        border: `1px solid ${highlight ? `${color}66` : '#20315c'}`,
      }}
    >
      <span
        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: `${color}1f`, border: `1px solid ${color}55`, color }}
      >
        <Icon className="w-4 h-4" strokeWidth={2.4} />
      </span>
      <div className="min-w-0">
        <div className="font-gaming font-bold uppercase tracking-wide text-[12px]" style={{ color }}>
          {title}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-[#9db8f5]">{desc}</p>
      </div>
    </div>
  );
}
