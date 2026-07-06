import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Lock,
  Check,
  Image as ImageIcon,
  Swords,
  Target,
  Dices,
  Gem,
  PackageOpen,
  Eye,
  ShieldBan,
  Zap,
  Upload,
  Crown,
  Lightbulb,
  ChevronRight,
  Sticker as StickerIcon,
  Laugh,
  Type,
  Clock,
  BadgeCheck,
  type LucideIcon,
} from 'lucide-react';
import { TiltCard } from '../components/TiltCard';
import { Avatar } from '../components/Avatar';
import { ProfilePreviewModal } from '../components/shop/ProfilePreviewModal';
import { MysteryRevealModal } from '../components/shop/MysteryRevealModal';
import { QuestsPanel } from './profil/QuestsPanel';
import { BetsPanel } from './profil/BetsPanel';
import { InventoryPanel } from './profil/InventoryPanel';
import { Panel } from '../components/Panel';
import { CoinCount } from '../components/CoinCount';
import { Skeleton } from '../mobile/primitives/Skeleton';
import { badgeIcon } from '../lib/badgeIcons';
import { useLeagueData } from '../hooks/useLeagueData';
import { useConfirm } from '../hooks/useConfirm';
import { useFlash } from '../hooks/useFlash';
import { useT } from '../lib/i18n';
import {
  api,
  type InventoryEntry,
  type MysteryReward,
  type ShopCategory,
  type ShopItemData,
} from '../lib/api';
import { CustomBannerUploaderModal, CustomTitleChooserModal, CustomWinEmoteChooserModal } from '../components/shop/CustomBannerUploader';
import { trackEvent } from '../lib/analytics';
import { RARITY, RARITY_ORDER, resolveRarity, type Rarity } from '../lib/rarity';

/** Catégories pour lesquelles « équiper » a du sens (titre / bannière actifs). */
const EQUIPPABLE: ShopCategory[] = ['title', 'banner', 'avatar_frame', 'sticker', 'win_emote'];

/** Ordre d'affichage stable des catégories dans la barre de filtres. */
const CATEGORY_ORDER: ShopCategory[] = ['title', 'banner', 'avatar_frame', 'sticker', 'win_emote', 'consumable', 'mystery_box'];

/** Catégories masquées de la boutique (achat impossible). */
const HIDDEN_CATS: ShopCategory[] = ['badge'];

const PLACEHOLDER_CATS: ShopCategory[] = ['banner', 'title', 'badge'];

/** Icône et libellé de chaque catégorie pour les séparateurs de section. */
const CAT_META: Record<ShopCategory, { Icon: LucideIcon; label: string }> = {
  title:        { Icon: Crown,       label: 'Titres' },
  banner:       { Icon: ImageIcon,   label: 'Bannières' },
  avatar_frame: { Icon: Sparkles,    label: 'Ornements' },
  sticker:      { Icon: StickerIcon, label: 'Stickers' },
  win_emote:    { Icon: Laugh,       label: 'Émotes de victoire' },
  consumable:   { Icon: Zap,         label: 'Consommables' },
  mystery_box:  { Icon: PackageOpen, label: 'Boîtes Mystère' },
  badge:        { Icon: Gem,         label: 'Badges' },
};

function isSheldonItem(item: ShopItemData): boolean {
  return item.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes('sheldon');
}

/* ─────────────────────────────────────────────────────────────────────────
 * Système de rareté — désormais un champ EXPLICITE de l'objet (choisi dans
 * Shop GOD), avec repli sur une déduction par le prix pour les objets antérieurs.
 * Couleurs, halos et libellés sont partagés via `lib/rarity` (source unique).
 * ──────────────────────────────────────────────────────────────────────── */

function CoinAmount({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
      <img src="/42coin.webp" alt="" className="w-4 h-4" />
      {value}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Guide « comment gagner des coins » — 3 méthodes claires, chacune avec son
 * accent de couleur, sa grosse valeur chiffrée et une explication courte.
 * C'est la pièce maîtresse pédagogique de la page.
 * ──────────────────────────────────────────────────────────────────────── */
interface EarnMethod {
  key: 'match' | 'quests' | 'bets';
  icon: LucideIcon;
  /** Valeur mise en avant (chiffre ou ×2). */
  value: string;
  /** Affiche l'icône 42coin avant la valeur (vrai pour des montants de coins). */
  coin: boolean;
  /** Jeu de classes Tailwind statiques propre à la méthode (couleurs figées
   *  pour rester compatibles avec le JIT — pas de classe construite à la volée). */
  ring: string;
  tile: string;
  iconColor: string;
  valueColor: string;
  glow: string;
}

const EARN_METHODS: EarnMethod[] = [
  {
    key: 'match',
    icon: Swords,
    value: '20–50',
    coin: true,
    ring: 'border-gold/30 hover:border-gold/55',
    tile: 'bg-gold/12 border-gold/35',
    iconColor: 'text-gold',
    valueColor: 'text-gold',
    glow: 'from-gold/12',
  },
  {
    key: 'quests',
    icon: Target,
    value: '850',
    coin: true,
    ring: 'border-violet-400/30 hover:border-violet-400/55',
    tile: 'bg-violet-500/14 border-violet-400/35',
    iconColor: 'text-violet-300',
    valueColor: 'text-violet-200',
    glow: 'from-violet-500/12',
  },
  {
    key: 'bets',
    icon: Dices,
    value: '×2',
    coin: false,
    ring: 'border-emerald-400/30 hover:border-emerald-400/55',
    tile: 'bg-emerald-500/14 border-emerald-400/35',
    iconColor: 'text-emerald-300',
    valueColor: 'text-emerald-200',
    glow: 'from-emerald-500/12',
  },
];

function EarnGuide({ onPick }: { onPick: (key: string) => void }) {
  const t = useT();
  return (
    <section className="relative overflow-hidden rounded-2xl p-5 border border-gold/25 bg-gradient-to-br from-bg-3/80 via-bg-2/70 to-bg-1/80">
      <div className="absolute inset-0 hud-diag pointer-events-none opacity-40" />
      {/* Lueur supérieure douce pour décoller du fond sombre */}
      <div className="absolute -top-16 left-1/4 w-80 h-32 rounded-full bg-gold/10 blur-3xl pointer-events-none" />

      {/* En-tête du guide */}
      <header className="relative flex items-center gap-3">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-gold/15 border border-gold/40 flex items-center justify-center shadow-gold-glow">
          <Sparkles className="w-5 h-5 text-gold" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <h3 className="font-gaming text-sm font-extrabold uppercase tracking-[0.14em] text-text-strong leading-tight">
            {t('shop.howToEarn.title')}
          </h3>
          <p className="text-[11px] text-muted-2 font-medium tracking-wide">
            {t('shop.howToEarn.subtitle')}
          </p>
        </div>
      </header>

      {/* Trois méthodes */}
      <div className="relative mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {EARN_METHODS.map((m, i) => {
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onPick(m.key)}
              className={`group relative overflow-hidden rounded-2xl border bg-bg-2/70 p-4 flex flex-col gap-3 text-left transition-colors cursor-pointer hover:brightness-110 active:scale-[0.99] ${m.ring}`}
            >
              {/* Lueur de fond propre à la méthode */}
              <div
                className={`absolute -inset-px bg-gradient-to-br ${m.glow} via-transparent to-transparent opacity-70 pointer-events-none`}
              />
              {/* Numéro d'étape */}
              <span className="absolute top-3 right-3 font-display text-2xl font-extrabold leading-none text-white/5 select-none">
                {i + 1}
              </span>

              <div
                className={`relative shrink-0 w-11 h-11 rounded-xl border flex items-center justify-center ${m.tile}`}
              >
                <Icon className={`w-6 h-6 ${m.iconColor}`} strokeWidth={2.1} />
              </div>

              <div className="relative">
                <div className="font-gaming text-[13px] font-extrabold uppercase tracking-wide text-text-strong leading-tight">
                  {t(`shop.earn.${m.key}.title`)}
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span
                    className={`font-display text-2xl font-extrabold tabular-nums leading-none flex items-center gap-1 ${m.valueColor}`}
                  >
                    {m.coin && <img src="/42coin.webp" alt="" className="w-5 h-5" />}
                    {m.value}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-2">
                    {t(`shop.earn.${m.key}.unit`)}
                  </span>
                </div>
              </div>

              <p className="relative text-[11.5px] text-muted-2 leading-relaxed">
                {t(`shop.earn.${m.key}.desc`)}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Lit le payload d'un item de façon sûre (objet simple, jamais un tableau). */
function payloadOf(item: ShopItemData): Record<string, unknown> {
  return item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
    ? (item.payload as Record<string, unknown>)
    : {};
}

/** Aperçu visuel de ce qu'on achète, selon la catégorie (bannière = image,
 *  titre = texte coloré, badge = icône+label coloré).
 *  Hauteur fixe, fond clair teinté par la rareté pour un rendu « vitrine ». */
function ShopItemVisual({ item, rarityHex }: { item: ShopItemData; rarityHex: string }) {
  const p = payloadOf(item);
  const color = item.color || '#ffc94a';
  const image = typeof p.image === 'string' ? p.image : null;
  const titleText = typeof p.title === 'string' ? p.title : item.name;
  const winEmoji = typeof p.emoji === 'string' ? p.emoji : null;
  const winPhrase = typeof p.phrase === 'string' ? p.phrase : null;
  const badgeLabel = typeof p.label === 'string' ? p.label : item.name;
  const Icon = badgeIcon(typeof p.icon === 'string' ? p.icon : null);

  return (
    <div
      className="relative h-28 w-full shrink-0 overflow-hidden rounded-xl border flex items-center justify-center px-3"
      style={{
        borderColor: `${rarityHex}4a`,
        background: `linear-gradient(160deg, ${rarityHex}33 0%, rgba(72,63,50,0.62) 45%, rgba(48,42,33,0.7) 100%)`,
      }}
    >
      {/* Halo de rareté derrière l'aperçu */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 35%, ${rarityHex}2e, transparent 70%)` }}
      />
      <div className="absolute inset-0 hud-diag pointer-events-none opacity-20" />

      {item.category === 'banner' &&
        (image ? (
          <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : p.allowUpload === true ? (
          <div className="relative flex flex-col items-center gap-1.5 px-3 text-center">
            <Upload className="w-6 h-6 text-gold/60" strokeWidth={1.8} />
            <span className="text-[10px] text-gold/60 font-bold uppercase tracking-wide">Image personnalisée</span>
          </div>
        ) : (
          <ImageIcon className="relative w-7 h-7 text-muted-2" strokeWidth={1.8} />
        ))}

      {item.category === 'avatar_frame' && (
        <div className="relative">
          <Avatar
            login={item.name || 'aperçu'}
            imageUrl={null}
            size="xl"
            noRing
            fx={false}
            frame={image}
            frameAnimated={typeof p.animated === 'string' ? p.animated : null}
          />
        </div>
      )}

      {item.category === 'sticker' &&
        (image ? (
          <img
            src={image}
            alt=""
            className="relative w-16 h-16 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
            style={{ transform: 'rotate(-8deg)' }}
          />
        ) : (
          <StickerIcon className="relative w-7 h-7 text-muted-2" strokeWidth={1.8} />
        ))}

      {item.category === 'title' && (
        <span className="relative inline-flex items-center gap-1.5 text-center text-[15px]">
          <span style={{ color }} className="opacity-70 leading-none">❝</span>
          <span style={{ color }} className="italic font-bold tracking-wide line-clamp-2 drop-shadow">
            {titleText}
          </span>
          <span style={{ color }} className="opacity-70 leading-none">❞</span>
        </span>
      )}

      {item.category === 'badge' && (
        <span
          className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border shadow-lg"
          style={{
            color,
            borderColor: `${color}55`,
            background: `linear-gradient(110deg, ${color}14 0%, ${color}33 45%, ${color}14 70%)`,
          }}
        >
          <Icon className="w-4 h-4" strokeWidth={2.5} />
          {badgeLabel}
        </span>
      )}

      {item.category === 'win_emote' &&
        (p.allowUpload === true ? (
          <div className="relative flex flex-col items-center gap-1.5 px-3 text-center">
            <Laugh className="w-7 h-7 text-gold/70" strokeWidth={1.8} />
            <span className="text-[10px] text-gold/60 font-bold uppercase tracking-wide">Émote personnalisée</span>
          </div>
        ) : (
          <div className="relative flex flex-col items-center gap-1 px-2 text-center">
            <span className="text-3xl leading-none drop-shadow">{winEmoji ?? '🏆'}</span>
            {winPhrase && (
              <span style={{ color }} className="italic text-[11px] font-bold leading-tight line-clamp-2">
                {winPhrase.replace(/\{winner\}/g, 'toi')}
              </span>
            )}
          </div>
        ))}

      {item.category === 'mystery_box' && (
        <div className="relative flex flex-col items-center gap-2">
          <PackageOpen className="w-10 h-10 text-purple-300 drop-shadow" strokeWidth={1.6} />
        </div>
      )}

      {item.category === 'consumable' && (
        <div className="relative flex flex-col items-center gap-2">
          {p.kind === 'anti_ops' ? (
            <ShieldBan className="w-10 h-10 text-teal-300 drop-shadow" strokeWidth={1.6} />
          ) : (
            <Zap className="w-10 h-10 text-teal-300 drop-shadow" strokeWidth={1.6} />
          )}
        </div>
      )}
    </div>
  );
}

/** Carte « à venir » : emplacement vide et verrouillé, juste pour montrer la
 *  mise en page tant qu'aucun cosmétique réel n'est en boutique. */
function PlaceholderCard({ category, label, soon }: { category: ShopCategory; label: string; soon: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-4 flex flex-col gap-3 opacity-55 select-none border border-border/50 bg-gradient-to-br from-bg-2/60 to-bg-1/70">
      <div className="absolute inset-0 hud-diag pointer-events-none opacity-30" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3.5 w-2/3 rounded bg-muted/15" />
          <div className="h-2.5 w-full rounded bg-muted/10" />
          <div className="h-2.5 w-1/2 rounded bg-muted/10" />
        </div>
        <span className="shrink-0 px-2 py-0.5 rounded-full bg-muted/10 border border-border/50 text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-2">
          {label}
        </span>
      </div>
      {/* Emplacement visuel (vide tant qu'aucun item réel) */}
      <div className="relative h-28 w-full shrink-0 rounded-xl border border-border/40 bg-bg-1/40 flex items-center justify-center">
        <ImageIcon className="w-6 h-6 text-muted/40" strokeWidth={1.8} />
      </div>
      <div className="relative mt-auto flex items-center justify-between gap-2 pt-1">
        <CoinAmount value={0} className="font-gaming text-base font-extrabold text-muted-2 blur-[1.5px]" />
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-wide bg-bg-1 border border-border/60 text-muted-2">
          <Lock className="w-3.5 h-3.5" strokeWidth={2.5} />
          {soon}
        </span>
      </div>
      {/* Catégorie cachée mais conservée pour clarté du code / futurs styles. */}
      <span className="sr-only">{category}</span>
    </div>
  );
}

/**
 * Cache du dernier état chargé de la boutique. Sert à un affichage *instantané*
 * à la réouverture : on réhydrate l'UI depuis ce snapshot puis on rafraîchit en
 * arrière-plan (stale-while-revalidate), au lieu de repartir d'un skeleton.
 *
 * Persisté dans `localStorage` (et pas seulement en mémoire de module) pour que
 * l'affichage reste instantané même après un rechargement complet de la page
 * (F5, premier rendu, navigation directe) — pas seulement entre navigations SPA.
 */
type ShopSnapshot = {
  coins: number;
  items: ShopItemData[];
  owned: string[];
  equipped: string[];
  monthly: Record<string, { used: number; cap: number }>;
};

const SHOP_CACHE_KEY = 'shop:snapshot:v1';

/** Lit le snapshot persisté (localStorage). Tolère l'absence/corruption. */
function readShopCache(): ShopSnapshot | null {
  try {
    const raw = localStorage.getItem(SHOP_CACHE_KEY);
    return raw ? (JSON.parse(raw) as ShopSnapshot) : null;
  } catch {
    return null;
  }
}

/** Persiste le snapshot. Échec silencieux (quota, mode privé…). */
function writeShopCache(snap: ShopSnapshot): void {
  try {
    localStorage.setItem(SHOP_CACHE_KEY, JSON.stringify(snap));
  } catch {
    /* non bloquant : le cache n'est qu'une optimisation d'affichage */
  }
}

let shopCache: ShopSnapshot | null = readShopCache();

export function ShopPage() {
  const t = useT();
  const navigate = useNavigate();
  const { show } = useFlash();
  const confirm = useConfirm();
  const { me, refresh } = useLeagueData();
  // Onglets du shop : boutique (cosmétiques) · quêtes hebdo · paris. Les quêtes et
  // paris vivent désormais ici (hub des League Coins), plus sur le profil.
  const [tab, setTab] = useState<'shop' | 'inventory' | 'quests' | 'bets'>('shop');
  // Tri de la vitrine : catégorie « épinglée » remontée en tête du rangement.
  // null = ordre par défaut (CATEGORY_ORDER). Re-cliquer la puce active la remet à null.
  const [firstCat, setFirstCat] = useState<ShopCategory | null>(null);
  // Filtre par rareté (null = toutes) et tri par prix (none = ordre rareté par défaut).
  const [rarityFilter, setRarityFilter] = useState<Rarity | null>(null);
  const [priceSort, setPriceSort] = useState<'none' | 'asc' | 'desc'>('none');
  // Cible des cartes « comment gagner » : matchs → page Défis ; quêtes/paris →
  // onglet correspondant (sans quitter le shop).
  const pickEarn = useCallback(
    (key: string) => {
      if (key === 'match') navigate('/defis');
      else if (key === 'quests') setTab('quests');
      else if (key === 'bets') setTab('bets');
    },
    [navigate],
  );

  const [coins, setCoins] = useState<number>(shopCache?.coins ?? me?.coins ?? 0);
  const [items, setItems] = useState<ShopItemData[]>(shopCache?.items ?? []);
  const [owned, setOwned] = useState<Set<string>>(new Set(shopCache?.owned ?? []));
  const [equipped, setEquipped] = useState<Set<string>>(new Set(shopCache?.equipped ?? []));
  // Entrées d'inventaire complètes — nécessaires pour lire userPayload des bannières custom.
  const [inventoryEntries, setInventoryEntries] = useState<InventoryEntry[]>([]);
  // Skeleton uniquement au tout premier chargement (cache vide). Si on a déjà un
  // snapshot, on affiche le catalogue connu immédiatement, sans clignotement.
  const [loading, setLoading] = useState(!shopCache);
  const [busy, setBusy] = useState<string | null>(null);
  // Objet en cours de prévisualisation sur la carte de profil (modal).
  const [preview, setPreview] = useState<ShopItemData | null>(null);
  // Bannière custom en cours d'upload (itemId → ouvre le modal d'upload).
  const [uploadingBannerId, setUploadingBannerId] = useState<string | null>(null);
  // Titre custom en cours de choix (itemId → ouvre le modal de titre).
  const [choosingTitleId, setChoosingTitleId] = useState<string | null>(null);
  // Émote de victoire custom en cours de choix (itemId → ouvre le modal d'émote).
  const [choosingWinEmoteId, setChoosingWinEmoteId] = useState<string | null>(null);
  // Items « Choisissez… » dont MA création est en attente de validation admin.
  const [pendingCustom, setPendingCustom] = useState<Set<string>>(new Set());
  // Révélation de Boîte Mystère : { reward } pendant l'animation, null = fermé.
  const [reveal, setReveal] = useState<{ reward: MysteryReward | null } | null>(null);
  // État mensuel des consommables (kind → achats restants ce mois). Décrémente à
  // l'achat (rechargé après chaque buy), reset au 1er du mois (clé mois côté serveur).
  const [monthly, setMonthly] = useState<Record<string, { used: number; cap: number }>>(
    shopCache?.monthly ?? {},
  );

  const load = useCallback(async () => {
    try {
      const [shop, inventory, consumables, pending] = await Promise.all([
        api.shop(),
        api.inventory().catch(() => [] as InventoryEntry[]),
        api.consumables().catch(() => null),
        api.myPendingCosmetics().catch(() => ({ pendingItemIds: [] as string[] })),
      ]);
      setPendingCustom(new Set(pending.pendingItemIds));
      const snap: ShopSnapshot = {
        coins: shop.coins ?? 0,
        items: shop.items ?? [],
        owned: shop.owned ?? [],
        equipped: inventory.filter((e) => e.equipped).map((e) => e.itemId),
        monthly: Object.fromEntries(
          (consumables?.items ?? []).map((c) => [c.kind, { used: c.monthlyUsed, cap: c.monthlyCap }]),
        ),
      };
      shopCache = snap;
      writeShopCache(snap);
      setCoins(snap.coins);
      setItems(snap.items);
      setOwned(new Set(snap.owned));
      setEquipped(new Set(snap.equipped));
      setInventoryEntries(inventory);
      setMonthly(snap.monthly);
    } catch (err) {
      show(err instanceof Error ? err.message : t('shop.error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [show, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const buy = useCallback(
    async (item: ShopItemData) => {
      // Dépenser des coins mérite une confirmation : le tap direct achetait
      // sans filet (mauvais tap mobile = coins envolés).
      const ok = await confirm({
        title: t('shop.confirm.title'),
        message: `${item.name} — ${item.price} coins`,
        confirmLabel: t('shop.confirm.buy'),
        cancelLabel: t('shop.confirm.cancel'),
      });
      if (!ok) return;
      setBusy(item.id);
      try {
        const res = await api.buyShopItem(item.id);
        setCoins(res.coins);
        trackEvent('shop.buy');
        if (item.category === 'mystery_box') {
          // Boîte Mystère : on révèle le lot via une animation dédiée (et on
          // n'ajoute rien à `owned` — la boîte est un consommable).
          setReveal({ reward: res.reward ?? null });
        } else {
          setOwned((prev) => new Set(prev).add(item.id));
          show(t('shop.bought'));
        }
        void refresh();
        void load();
      } catch (err) {
        show(err instanceof Error ? err.message : t('shop.error'), 'error');
      } finally {
        setBusy(null);
      }
    },
    [confirm, show, t, refresh, load],
  );

  const toggleEquip = useCallback(
    async (item: ShopItemData) => {
      const next = !equipped.has(item.id);
      setBusy(item.id);
      try {
        await api.equipItem(item.id, next);
        setEquipped((prev) => {
          const s = new Set(prev);
          if (next) s.add(item.id);
          else s.delete(item.id);
          return s;
        });
        show(next ? t('shop.equipDone') : t('shop.unequipDone'));
        void refresh();
      } catch (err) {
        show(err instanceof Error ? err.message : t('shop.error'), 'error');
      } finally {
        setBusy(null);
      }
    },
    [equipped, show, t, refresh],
  );

  const rarityLabel = (r: Rarity) => t(`shop.rarity.${r}`);

  const visibleItems = items.filter((it) => !HIDDEN_CATS.includes(it.category));

  const sortByRarity = (a: ShopItemData, b: ShopItemData) => {
    const rd = RARITY_ORDER.indexOf(resolveRarity(b)) - RARITY_ORDER.indexOf(resolveRarity(a));
    return rd !== 0 ? rd : a.name.localeCompare(b.name);
  };
  // Tri effectif d'une section : par prix si demandé, sinon par rareté décroissante.
  const sortItems = (a: ShopItemData, b: ShopItemData) => {
    if (priceSort === 'asc') return a.price - b.price || a.name.localeCompare(b.name);
    if (priceSort === 'desc') return b.price - a.price || a.name.localeCompare(b.name);
    return sortByRarity(a, b);
  };
  // Filtre par rareté appliqué au catalogue affiché (sections + « Autre »).
  const filteredItems = rarityFilter
    ? visibleItems.filter((it) => resolveRarity(it) === rarityFilter)
    : visibleItems;

  /** mystery_box et Sheldon vont dans "Autre" — exclus des sections normales. */
  const presentCats = CATEGORY_ORDER.filter(
    (c) => c !== 'mystery_box' && filteredItems.some((it) => it.category === c && !isSheldonItem(it)),
  );

  const itemsByCategory = Object.fromEntries(
    presentCats.map((cat) => [
      cat,
      filteredItems.filter((it) => it.category === cat && !isSheldonItem(it)).sort(sortItems),
    ]),
  ) as Record<ShopCategory, ShopItemData[]>;

  // Ordre d'affichage des sections : la catégorie épinglée (barre de tri) passe en
  // tête, le reste conserve l'ordre par défaut. Sans épingle → CATEGORY_ORDER.
  const orderedCats =
    firstCat && presentCats.includes(firstCat)
      ? [firstCat, ...presentCats.filter((c) => c !== firstCat)]
      : presentCats;

  /** Section "Autre" : mystery_box + items Apôtre de Sheldon. */
  const autreItems = [
    ...filteredItems.filter((it) => it.category === 'mystery_box'),
    ...filteredItems.filter((it) => it.category === 'title' && isSheldonItem(it)),
  ].sort(sortItems);

  return (
    <div className="space-y-5">
      {/* ── En-tête + carte solde ──────────────────────────────────────── */}
      <Panel title={t('shop.title')} sub={t('shop.sub')}>
        <div className="relative overflow-hidden rounded-2xl p-5 flex items-center gap-4 border border-gold/30 bg-gradient-to-br from-violet-500/20 via-bg-2 to-bg-1">
          <div className="absolute inset-0 hud-diag pointer-events-none opacity-30" />
          {/* Lueurs colorées pour réchauffer et éclaircir le bandeau */}
          <div className="absolute -left-8 -top-10 w-40 h-40 rounded-full bg-gold/18 blur-3xl pointer-events-none" />
          <div className="absolute right-0 -bottom-12 w-44 h-44 rounded-full bg-violet-500/18 blur-3xl pointer-events-none" />
          {/* Pièce avec reflet doré qui balaie */}
          <div className="relative shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-gold/35 to-violet-500/15 border border-gold/45 flex items-center justify-center shadow-gold-glow overflow-hidden">
            <img src="/42coin.webp" alt="League Coin" className="relative w-10 h-10 drop-shadow" />
            <div className="absolute inset-y-0 -left-1/2 w-1/2 bg-white/25 blur-md animate-gold-sweep pointer-events-none" />
          </div>
          <div className="relative min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] font-extrabold text-muted-2">
              {t('shop.balance')}
            </div>
            <div className="font-display text-[2.1rem] font-extrabold text-text-strong tabular-nums leading-tight flex items-baseline gap-2">
              <CoinCount login={me?.login} value={coins} />
              <span className="text-sm text-violet-200 font-bold tracking-wide">League Coin</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Onglets : Boutique · Quêtes · Paris ────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl bg-bg-2/60 border border-border/40">
        {([
          { v: 'shop' as const, label: t('shop.title'), Icon: Gem },
          { v: 'inventory' as const, label: 'Inventaire', Icon: PackageOpen },
          { v: 'quests' as const, label: t('profil.tab.quests'), Icon: Target },
          { v: 'bets' as const, label: t('profil.tab.bets'), Icon: Dices },
        ]).map(({ v, label, Icon }) => (
          <button
            key={v}
            type="button"
            onClick={() => setTab(v)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-extrabold uppercase tracking-[0.1em] transition-all ${
              tab === v
                ? 'bg-gold/10 border border-gold/30 text-gold shadow-[inset_0_1px_0_rgba(255,215,120,0.12)]'
                : 'text-muted-2 hover:text-text'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {tab === 'inventory' && <InventoryPanel />}
      {tab === 'quests' && <QuestsPanel />}
      {tab === 'bets' && <BetsPanel />}

      {tab === 'shop' && (
        <>
      {/* ── Proposer un item : petite carte en évidence → éditeur de proposition ── */}
      <button
        type="button"
        onClick={() => navigate('/shop/propose')}
        className="w-full flex items-center gap-3 rounded-xl border border-violet-400/40 bg-gradient-to-r from-violet-500/15 to-transparent px-4 py-3 text-left hover:from-violet-500/25 transition-all"
      >
        <span className="shrink-0 w-9 h-9 rounded-lg bg-violet-500/20 border border-violet-400/40 flex items-center justify-center">
          <Lightbulb className="w-5 h-5 text-violet-200" strokeWidth={2.2} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-extrabold text-text-strong">{t('shop.propose.cta')}</span>
          <span className="block text-[11px] text-muted-2 leading-snug">{t('shop.propose.hint')}</span>
        </span>
        <ChevronRight className="w-5 h-5 text-violet-300 shrink-0" strokeWidth={2.5} />
      </button>

      {/* ── Guide « comment gagner des coins » ─────────────────────────── */}
      <EarnGuide onPick={pickEarn} />

      {/* ── Barre de tri : épingle une catégorie en tête du rangement ──── */}
      {!loading && presentCats.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 no-scrollbar">
          <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-2">
            Trier
          </span>
          {presentCats.map((cat) => {
            const meta = CAT_META[cat];
            const ChipIcon = meta.Icon;
            const active = firstCat === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setFirstCat((prev) => (prev === cat ? null : cat))}
                aria-pressed={active}
                title={active ? `${meta.label} en tête — cliquer pour rétablir` : `Afficher « ${meta.label} » en premier`}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide transition-all ${
                  active
                    ? 'bg-gold/15 border-gold/45 text-gold shadow-[inset_0_1px_0_rgba(255,215,120,0.15)]'
                    : 'bg-bg-1/70 border-border/50 text-muted-2 hover:text-text hover:border-gold/30'
                }`}
              >
                <ChipIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Filtres : rareté + tri par prix ────────────────────────────── */}
      {!loading && visibleItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-2">
            Filtrer
          </span>
          {/* Rareté */}
          <button
            type="button"
            onClick={() => setRarityFilter(null)}
            aria-pressed={rarityFilter === null}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide transition-all ${
              rarityFilter === null
                ? 'bg-gold/15 border-gold/45 text-gold'
                : 'bg-bg-1/70 border-border/50 text-muted-2 hover:text-text hover:border-gold/30'
            }`}
          >
            Toutes
          </button>
          {RARITY_ORDER.map((r) => {
            const active = rarityFilter === r;
            const hex = RARITY[r].hex;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRarityFilter((prev) => (prev === r ? null : r))}
                aria-pressed={active}
                className="shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide transition-all"
                style={
                  active
                    ? { color: hex, borderColor: `${hex}99`, background: `${hex}22` }
                    : { color: `${hex}b0`, borderColor: `${hex}3a`, background: 'transparent' }
                }
              >
                {RARITY[r].label}
              </button>
            );
          })}
          {/* Séparateur */}
          <span className="shrink-0 w-px h-4 bg-border/60 mx-0.5" />
          {/* Tri par prix : cycle aucun → croissant → décroissant */}
          <button
            type="button"
            onClick={() => setPriceSort((p) => (p === 'none' ? 'asc' : p === 'asc' ? 'desc' : 'none'))}
            aria-pressed={priceSort !== 'none'}
            title="Trier par prix"
            className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide transition-all ${
              priceSort !== 'none'
                ? 'bg-gold/15 border-gold/45 text-gold'
                : 'bg-bg-1/70 border-border/50 text-muted-2 hover:text-text hover:border-gold/30'
            }`}
          >
            Prix {priceSort === 'asc' ? '↑' : priceSort === 'desc' ? '↓' : ''}
          </button>
        </div>
      )}

      {/* Aucun objet pour le filtre courant. */}
      {!loading && rarityFilter && orderedCats.length === 0 && autreItems.length === 0 && (
        <div className="rounded-xl border border-border/50 bg-bg-1/50 px-4 py-8 text-center text-sm text-muted-2">
          Aucun objet {RARITY[rarityFilter].label.toLowerCase()} en boutique pour l'instant.
        </div>
      )}

      {/* ── Catalogue groupé par catégorie ─────────────────────────────── */}
      {loading ? (
        <div className="space-y-6">
          {[3, 2, 2].map((count, si) => (
            <div key={si} className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {Array.from({ length: count }).map((_, i) => (
                  <Skeleton key={i} className="h-56" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {orderedCats.map((cat) => {
            const catItems = itemsByCategory[cat] ?? [];
            const meta = CAT_META[cat];
            const CatIcon = meta.Icon;
            return (
              <section key={cat}>
                {/* Séparateur de catégorie — style SectionHeader profil */}
                <div className="flex items-center gap-2 mb-4 px-0.5">
                  <span className="inline-block w-1 h-3.5 bg-gradient-to-b from-gold to-gold-dim rounded-sm flex-shrink-0" />
                  <CatIcon className="w-3.5 h-3.5 text-gold/80 flex-shrink-0" strokeWidth={2.4} />
                  <span className="font-gaming text-[11px] uppercase tracking-[0.2em] font-extrabold text-gold/90">
                    {meta.label}
                  </span>
                  <span className="font-mono text-[10px] text-muted tabular-nums">· {catItems.length}</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-gold/30 via-gold/15 to-transparent ml-1" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {catItems.map((item, idx) => {
                    const isOwned = owned.has(item.id);
                    const canAfford = coins >= item.price;
                    const isEquipped = equipped.has(item.id);
                    const showEquip = isOwned && EQUIPPABLE.includes(item.category);
                    const isCustomBanner = isOwned && item.category === 'banner' && payloadOf(item).allowUpload === true;
                    const isCustomTitle = isOwned && item.category === 'title' && payloadOf(item).allowUpload === true;
                    const isCustomWinEmote = isOwned && item.category === 'win_emote' && payloadOf(item).allowUpload === true;
                    const invEntry = (isCustomBanner || isCustomTitle || isCustomWinEmote) ? inventoryEntries.find((e) => e.itemId === item.id) : undefined;
                    const userBannerImg = typeof invEntry?.userPayload?.image === 'string' ? invEntry.userPayload.image : null;
                    const userTitleText = typeof invEntry?.userPayload?.title === 'string' ? invEntry.userPayload.title : null;
                    const userWinEmoji = typeof invEntry?.userPayload?.emoji === 'string' ? invEntry.userPayload.emoji : null;
                    // Création envoyée en validation admin (encore en attente).
                    const isPendingCustom = pendingCustom.has(item.id);
                    const itemBusy = busy === item.id;
                    const consKind =
                      item.category === 'consumable' && typeof payloadOf(item).kind === 'string'
                        ? (payloadOf(item).kind as string)
                        : null;
                    const consMonthly = consKind ? monthly[consKind] : undefined;
                    const consRemaining = consMonthly ? Math.max(0, consMonthly.cap - consMonthly.used) : null;
                    const consExhausted = consRemaining !== null && consRemaining <= 0;
                    const rarity = resolveRarity(item);
                    const rk = RARITY[rarity];

                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, delay: idx * 0.04 }}
                      >
                        <TiltCard
                          glowHex={rk.hex}
                          className="card-hud h-full overflow-hidden rounded-xl flex flex-col"
                          style={{ boxShadow: `0 0 0 1px ${rk.hex}22, 0 6px 24px -8px ${rk.hex}30` }}
                        >
                          {/* Liseré de rareté */}
                          <div
                            className="absolute top-0 inset-x-0 h-[1.5px] pointer-events-none"
                            style={{ background: `linear-gradient(90deg, transparent, ${rk.hex}cc, transparent)` }}
                          />
                          {/* Halo de rareté en fond */}
                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{ background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${rk.hex}18 0%, transparent 70%)` }}
                          />

                          <div className="relative flex flex-col gap-3 p-4 h-full">
                            {/* En-tête : nom + badge possédé */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="font-gaming text-sm font-extrabold text-text-strong leading-tight truncate">
                                  {item.name}
                                </div>
                                <span
                                  className="mt-0.5 inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-[0.14em]"
                                  style={{ color: rk.hex }}
                                >
                                  <Gem className="w-2.5 h-2.5" strokeWidth={2.5} />
                                  {rarityLabel(rarity)}
                                </span>
                              </div>
                              {isOwned && (
                                <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-gold/10 border border-gold/30 text-gold">
                                  <Check className="w-2.5 h-2.5" strokeWidth={3} />
                                  Possédé
                                </span>
                              )}
                            </div>

                            {/* Aperçu visuel */}
                            <ShopItemVisual item={item} rarityHex={rk.hex} />

                            {/* Description */}
                            {item.description && (
                              <p className="text-[11px] text-muted-2 leading-relaxed line-clamp-2 -mt-0.5">
                                {item.description}
                              </p>
                            )}

                            {/* Attribution : cosmétique proposé par un joueur. */}
                            {item.creatorLogin && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-gold/80">
                                <BadgeCheck className="w-3 h-3" strokeWidth={2.5} />
                                Créé par {item.creatorLogin}
                              </span>
                            )}

                            {/* Modèle d'obtention « Choisissez… » — annoncé AVANT achat (anti-abus). */}
                            {!isOwned && payloadOf(item).allowUpload === true && (
                              <span className="inline-flex items-start gap-1 text-[10px] text-sky-300/80 leading-snug">
                                <ShieldBan className="w-3 h-3 mt-0.5 shrink-0" strokeWidth={2.5} />
                                Après achat : tu crées {item.category === 'title' ? 'ton titre' : item.category === 'win_emote' ? 'ton émote de victoire' : 'ta bannière'}, validé(e) par un admin.
                              </span>
                            )}

                            {/* Cap mensuel consommables */}
                            {consRemaining !== null && (
                              <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide tabular-nums">
                                <span className={consExhausted ? 'text-red-400' : 'text-teal-300'}>
                                  {consRemaining}/{consMonthly!.cap}
                                </span>
                                <span className="text-muted-2 font-medium">par mois</span>
                              </div>
                            )}

                            {/* En attente de validation admin (bannière, titre ou émote perso). */}
                            {(isCustomBanner || isCustomTitle || isCustomWinEmote) && isPendingCustom && (
                              <div className="w-full rounded-lg border border-sky-400/30 bg-sky-400/5 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-sky-300 flex items-center justify-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
                                En attente de validation
                              </div>
                            )}

                            {/* Bannière custom : upload (validation admin) */}
                            {isCustomBanner && !isPendingCustom && (
                              <button
                                type="button"
                                onClick={() => setUploadingBannerId(item.id)}
                                className="w-full rounded-lg border border-dashed border-gold/30 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-gold/70 hover:border-gold/60 hover:text-gold transition-colors flex items-center justify-center gap-1.5"
                              >
                                <Upload className="w-3.5 h-3.5" strokeWidth={2.5} />
                                {userBannerImg ? 'Changer ma bannière' : 'Choisir ma bannière'}
                              </button>
                            )}

                            {/* Titre custom : choix texte + couleur (validation admin) */}
                            {isCustomTitle && !isPendingCustom && (
                              <button
                                type="button"
                                onClick={() => setChoosingTitleId(item.id)}
                                className="w-full rounded-lg border border-dashed border-gold/30 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-gold/70 hover:border-gold/60 hover:text-gold transition-colors flex items-center justify-center gap-1.5"
                              >
                                <Type className="w-3.5 h-3.5" strokeWidth={2.5} />
                                {userTitleText ? 'Changer mon titre' : 'Choisir mon titre'}
                              </button>
                            )}

                            {/* Émote de victoire custom : choix emoji + punchline (validation admin) */}
                            {isCustomWinEmote && !isPendingCustom && (
                              <button
                                type="button"
                                onClick={() => setChoosingWinEmoteId(item.id)}
                                className="w-full rounded-lg border border-dashed border-gold/30 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-gold/70 hover:border-gold/60 hover:text-gold transition-colors flex items-center justify-center gap-1.5"
                              >
                                <Laugh className="w-3.5 h-3.5" strokeWidth={2.5} />
                                {userWinEmoji ? 'Changer mon émote' : 'Choisir mon émote'}
                              </button>
                            )}

                            {/* Pied : prix + actions */}
                            <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-white/5">
                              {item.price === 0 ? (
                                <span className="inline-flex items-center gap-1 font-gaming text-sm font-extrabold text-emerald-400">
                                  <img src="/42coin.webp" alt="" className="w-4 h-4" />
                                  +300
                                </span>
                              ) : (
                                <CoinAmount value={item.price} className="font-gaming text-base font-extrabold text-text-strong" />
                              )}

                              <div className="flex items-center gap-1.5">
                                {EQUIPPABLE.includes(item.category) && item.category !== 'win_emote' && (
                                  <button
                                    type="button"
                                    onClick={() => setPreview(item)}
                                    title={t('shop.preview.title')}
                                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wide border border-border/50 bg-bg-1/80 text-muted-2 hover:text-gold hover:border-gold/40 transition-colors"
                                  >
                                    <Eye className="w-3.5 h-3.5" strokeWidth={2.5} />
                                    <span className="hidden sm:inline">{t('shop.preview')}</span>
                                  </button>
                                )}

                                {isOwned ? (
                                  showEquip ? (
                                    <button
                                      type="button"
                                      disabled={itemBusy}
                                      onClick={() => void toggleEquip(item)}
                                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wide transition-all disabled:opacity-60 ${
                                        isEquipped
                                          ? 'bg-gold/15 border border-gold/40 text-gold'
                                          : 'bg-bg-1/80 border border-border/50 text-muted-2 hover:text-text hover:border-gold/30'
                                      }`}
                                    >
                                      {isEquipped && <Check className="w-3 h-3" strokeWidth={3} />}
                                      {isEquipped ? t('shop.equipped') : t('shop.equip')}
                                    </button>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wide bg-gold/10 border border-gold/25 text-gold/80">
                                      <Check className="w-3 h-3" strokeWidth={3} />
                                      {t('shop.owned')}
                                    </span>
                                  )
                                ) : (
                                  <button
                                    type="button"
                                    disabled={!canAfford || itemBusy || consExhausted}
                                    onClick={() => void buy(item)}
                                    className={`inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wide transition-all disabled:opacity-60 ${
                                      canAfford && !consExhausted
                                        ? 'bg-gradient-to-r from-gold to-gold-dim text-bg-0 hover:shadow-gold-glow hover:brightness-110 active:scale-95'
                                        : 'bg-bg-1/80 border border-border/50 text-muted cursor-not-allowed'
                                    }`}
                                  >
                                    {(!canAfford || consExhausted) && <Lock className="w-3 h-3" strokeWidth={2.5} />}
                                    {itemBusy
                                      ? t('shop.buying')
                                      : consExhausted
                                        ? 'Épuisé'
                                        : canAfford
                                          ? t('shop.buy')
                                          : t('shop.insufficient')}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </TiltCard>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {/* ── Section "Autre" : mystery_box + Apôtre de Sheldon ── */}
          {autreItems.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4 px-0.5">
                <span className="inline-block w-1 h-3.5 bg-gradient-to-b from-gold to-gold-dim rounded-sm flex-shrink-0" />
                <Sparkles className="w-3.5 h-3.5 text-gold/80 flex-shrink-0" strokeWidth={2.4} />
                <span className="font-gaming text-[11px] uppercase tracking-[0.2em] font-extrabold text-gold/90">
                  Autre
                </span>
                <span className="font-mono text-[10px] text-muted tabular-nums">· {autreItems.length}</span>
                <div className="flex-1 h-px bg-gradient-to-r from-gold/30 via-gold/15 to-transparent ml-1" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {autreItems.map((item, idx) => {
                  const isOwned = owned.has(item.id);
                  const canAfford = coins >= item.price;
                  const isEquipped = equipped.has(item.id);
                  const showEquip = isOwned && EQUIPPABLE.includes(item.category);
                  const itemBusy = busy === item.id;
                  const rarity = resolveRarity(item);
                  const rk = RARITY[rarity];
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, delay: idx * 0.04 }}
                    >
                      <TiltCard
                        glowHex={rk.hex}
                        className="card-hud h-full overflow-hidden rounded-xl flex flex-col"
                        style={{ boxShadow: `0 0 0 1px ${rk.hex}22, 0 6px 24px -8px ${rk.hex}30` }}
                      >
                        <div className="absolute top-0 inset-x-0 h-[1.5px] pointer-events-none"
                          style={{ background: `linear-gradient(90deg, transparent, ${rk.hex}cc, transparent)` }} />
                        <div className="absolute inset-0 pointer-events-none"
                          style={{ background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${rk.hex}18 0%, transparent 70%)` }} />
                        <div className="relative flex flex-col gap-3 p-4 h-full">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-gaming text-sm font-extrabold text-text-strong leading-tight truncate">{item.name}</div>
                              <span className="mt-0.5 inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-[0.14em]" style={{ color: rk.hex }}>
                                <Gem className="w-2.5 h-2.5" strokeWidth={2.5} />{rarityLabel(rarity)}
                              </span>
                            </div>
                            {isOwned && (
                              <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-gold/10 border border-gold/30 text-gold">
                                <Check className="w-2.5 h-2.5" strokeWidth={3} />Possédé
                              </span>
                            )}
                          </div>
                          <ShopItemVisual item={item} rarityHex={rk.hex} />
                          {item.description && (
                            <p className="text-[11px] text-muted-2 leading-relaxed line-clamp-2 -mt-0.5">{item.description}</p>
                          )}
                          <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-white/5">
                            {item.price === 0 ? (
                              <span className="inline-flex items-center gap-1 font-gaming text-sm font-extrabold text-emerald-400">
                                <img src="/42coin.webp" alt="" className="w-4 h-4" />+300
                              </span>
                            ) : (
                              <CoinAmount value={item.price} className="font-gaming text-base font-extrabold text-text-strong" />
                            )}
                            <div className="flex items-center gap-1.5">
                              {EQUIPPABLE.includes(item.category) && (
                                <button type="button" onClick={() => setPreview(item)} title={t('shop.preview.title')}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wide border border-border/50 bg-bg-1/80 text-muted-2 hover:text-gold hover:border-gold/40 transition-colors">
                                  <Eye className="w-3.5 h-3.5" strokeWidth={2.5} />
                                  <span className="hidden sm:inline">{t('shop.preview')}</span>
                                </button>
                              )}
                              {isOwned ? (
                                showEquip ? (
                                  <button type="button" disabled={itemBusy} onClick={() => void toggleEquip(item)}
                                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wide transition-all disabled:opacity-60 ${isEquipped ? 'bg-gold/15 border border-gold/40 text-gold' : 'bg-bg-1/80 border border-border/50 text-muted-2 hover:text-text hover:border-gold/30'}`}>
                                    {isEquipped && <Check className="w-3 h-3" strokeWidth={3} />}
                                    {isEquipped ? t('shop.equipped') : t('shop.equip')}
                                  </button>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wide bg-gold/10 border border-gold/25 text-gold/80">
                                    <Check className="w-3 h-3" strokeWidth={3} />{t('shop.owned')}
                                  </span>
                                )
                              ) : (
                                <button type="button" disabled={!canAfford || itemBusy} onClick={() => void buy(item)}
                                  className={`inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wide transition-all disabled:opacity-60 ${canAfford ? 'bg-gradient-to-r from-gold to-gold-dim text-bg-0 hover:shadow-gold-glow hover:brightness-110 active:scale-95' : 'bg-bg-1/80 border border-border/50 text-muted cursor-not-allowed'}`}>
                                  {!canAfford && <Lock className="w-3 h-3" strokeWidth={2.5} />}
                                  {itemBusy ? t('shop.buying') : canAfford ? t('shop.buy') : t('shop.insufficient')}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </TiltCard>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          )}

          {presentCats.length === 0 && autreItems.length === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {Array.from({ length: 3 }).map((_, i) => {
                const cat = PLACEHOLDER_CATS[i % PLACEHOLDER_CATS.length]!;
                return (
                  <PlaceholderCard
                    key={`ph-${i}`}
                    category={cat}
                    label={CAT_META[cat]?.label ?? cat}
                    soon={t('shop.howToEarn.soon')}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
        </>
      )}

      {/* Upload image personnalisée d'une bannière custom */}
      {uploadingBannerId && (() => {
        const entry = inventoryEntries.find((e) => e.itemId === uploadingBannerId);
        const item = items.find((it) => it.id === uploadingBannerId);
        return entry && item ? (
          <CustomBannerUploaderModal
            itemId={uploadingBannerId}
            itemName={item.name}
            currentImage={typeof entry.userPayload?.image === 'string' ? entry.userPayload.image : null}
            onClose={() => setUploadingBannerId(null)}
            onSaved={(dataUrl, pending) => {
              if (pending) {
                // En attente de validation : on n'applique rien, on marque « en attente ».
                setPendingCustom((prev) => new Set(prev).add(uploadingBannerId));
              } else {
                setInventoryEntries((prev) =>
                  prev.map((e) => e.itemId === uploadingBannerId ? { ...e, userPayload: { image: dataUrl } } : e),
                );
              }
              setUploadingBannerId(null);
              void refresh();
            }}
          />
        ) : null;
      })()}

      {/* Choix d'un titre personnalisé (item « Choisis ton titre ») */}
      {choosingTitleId && (() => {
        const entry = inventoryEntries.find((e) => e.itemId === choosingTitleId);
        const item = items.find((it) => it.id === choosingTitleId);
        return item ? (
          <CustomTitleChooserModal
            itemId={choosingTitleId}
            itemName={item.name}
            currentTitle={typeof entry?.userPayload?.title === 'string' ? entry.userPayload.title : null}
            currentColor={typeof entry?.userPayload?.color === 'string' ? entry.userPayload.color : item.color}
            onClose={() => setChoosingTitleId(null)}
            onSaved={(pending) => {
              if (pending) setPendingCustom((prev) => new Set(prev).add(choosingTitleId));
              setChoosingTitleId(null);
              void refresh();
            }}
          />
        ) : null;
      })()}

      {choosingWinEmoteId && (() => {
        const entry = inventoryEntries.find((e) => e.itemId === choosingWinEmoteId);
        const item = items.find((it) => it.id === choosingWinEmoteId);
        return item ? (
          <CustomWinEmoteChooserModal
            itemId={choosingWinEmoteId}
            itemName={item.name}
            currentEmoji={typeof entry?.userPayload?.emoji === 'string' ? entry.userPayload.emoji : null}
            currentPhrase={typeof entry?.userPayload?.phrase === 'string' ? entry.userPayload.phrase : null}
            onClose={() => setChoosingWinEmoteId(null)}
            onSaved={(pending) => {
              if (pending) setPendingCustom((prev) => new Set(prev).add(choosingWinEmoteId));
              setChoosingWinEmoteId(null);
              void refresh();
            }}
          />
        ) : null;
      })()}

      {/* Aperçu du cosmétique appliqué sur la carte de profil */}
      {preview && me && (
        <ProfilePreviewModal item={preview} me={me} onClose={() => setPreview(null)} />
      )}

      {/* Révélation animée d'une Boîte Mystère */}
      {reveal && <MysteryRevealModal reward={reveal.reward} onClose={() => setReveal(null)} />}
    </div>
  );
}
