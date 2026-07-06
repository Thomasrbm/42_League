import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Store, Coins, Plus, Pencil, Trash2, Save, X, Gift, Gem, Search, ChevronRight, BadgeCheck, Zap, Palette } from 'lucide-react';
import {
  api,
  type BattlePassTierAdmin,
  type ShopCategory,
  type ShopItemData,
  type ShopItemInput,
  type ShopUserRow,
} from '../lib/api';

/** « Prénom Nom » si dispo, sinon le login. */
function nameOf(u: { firstName: string | null; lastName: string | null; login: string }): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.login;
}
import { RARITY, resolveRarity } from '../lib/rarity';
// Formulaire de cosmétique + primitives extraits (réutilisés par la récompense de tournoi).
import {
  Input,
  Toggle,
  CATEGORY_LABEL,
  ItemFormFields,
  ItemPreview,
  buildInput,
  emptyForm,
  formFromItem,
  type FormState,
} from '../components/shop/CosmeticForm';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useServerEvents } from '../hooks/useServerEvents';
import type { ShopProposal, ProposalRewardKind, CosmeticRequest } from '../lib/api';

type Role = 'ADMIN' | 'SUPERADMIN';

// ── Primitives locales (langage visuel GODPage) ─────────────────────────────

function Btn({
  onClick,
  variant = 'default',
  disabled,
  children,
  className = '',
  type = 'button',
}: {
  onClick?: () => void;
  variant?: 'default' | 'danger' | 'success' | 'warn' | 'ghost';
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const base = 'px-2 py-1 text-xs rounded font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1';
  const variants = {
    default: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100',
    danger: 'bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30',
    success: 'bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 border border-emerald-500/30',
    warn: 'bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-400 border border-yellow-500/30',
    ghost: 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2 px-1">{title}</div>
      {children}
    </div>
  );
}

const CATEGORY_BADGE: Record<ShopCategory, string> = {
  title: 'bg-amber-400/15 text-amber-400',
  badge: 'bg-fuchsia-400/15 text-fuchsia-400',
  banner: 'bg-violet-400/15 text-violet-400',
  avatar_frame: 'bg-sky-400/15 text-sky-400',
  sticker: 'bg-pink-400/15 text-pink-400',
  win_emote: 'bg-orange-400/15 text-orange-400',
  mystery_box: 'bg-purple-400/15 text-purple-400',
  consumable: 'bg-teal-400/15 text-teal-400',
};

function CategoryBadge({ category }: { category: ShopCategory }) {
  return (
    <span className={`px-1.5 py-0.5 text-xs rounded font-mono tracking-wide ${CATEGORY_BADGE[category]}`}>
      {CATEGORY_LABEL[category]}
    </span>
  );
}

function CoinIcon() {
  return <img src="/42coin.webp" alt="League Coin" className="w-4 h-4 inline-block align-text-bottom" />;
}

// ── Modal d'édition d'un item ───────────────────────────────────────────────

function EditItemModal({
  item,
  onClose,
  onSaved,
}: {
  item: ShopItemData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => formFromItem(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Échap ferme la modale (montée uniquement quand ouverte → active = true).
  useEscapeKey(true, onClose);

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  }, []);

  async function handleSave() {
    setError('');
    let input: ShopItemInput;
    try {
      input = buildInput(form);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      return;
    }
    setSaving(true);
    try {
      await api.adminUpdateShopItem(item.id, input);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-[48rem] max-w-full max-h-[88vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-mono text-zinc-300">
            Modifier — <span className="text-zinc-100 font-bold">{item.name}</span>
          </div>
          <Btn variant="ghost" onClick={onClose}><X className="w-3.5 h-3.5" /></Btn>
        </div>
        <ItemFormFields form={form} set={set} />
        {error && <div className="mt-3 text-xs text-red-400 font-mono">{error}</div>}
        <div className="mt-5 flex gap-2 justify-end">
          <Btn onClick={onClose} variant="ghost">Annuler</Btn>
          <Btn onClick={handleSave} disabled={saving} variant="success">
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Section 1 : gestion des items ───────────────────────────────────────────

function ItemsSection({ onItemsChanged }: { onItemsChanged?: (items: ShopItemData[]) => void }) {
  const [items, setItems] = useState<ShopItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShopItemData | null>(null);

  // Formulaire de création.
  const [createForm, setCreateForm] = useState<FormState>(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createOk, setCreateOk] = useState('');

  const setCreate = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setCreateForm((prev) => ({ ...prev, [k]: v }));
  }, []);

  const load = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      api.adminShopItems()
        .then((list) => {
          const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
          setItems(sorted);
          onItemsChanged?.(sorted);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
        .finally(() => setLoading(false));
    },
    [onItemsChanged],
  );

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setCreateError('');
    setCreateOk('');
    let input: ShopItemInput;
    try {
      input = buildInput(createForm);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Erreur');
      return;
    }
    setCreating(true);
    try {
      const created = await api.adminCreateShopItem(input);
      setCreateOk(`Cosmétique « ${created.name} » créé.`);
      setCreateForm(emptyForm());
      load(true);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(it: ShopItemData) {
    setPendingId(it.id);
    setError('');
    try {
      await api.adminUpdateShopItem(it.id, { active: !it.active });
      load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(it: ShopItemData) {
    if (!confirm(`Supprimer définitivement « ${it.name} » ? Cette action est irréversible.`)) return;
    setPendingId(it.id);
    setError('');
    try {
      await api.adminDeleteShopItem(it.id);
      load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="p-4">
      {editing && (
        <EditItemModal item={editing} onClose={() => setEditing(null)} onSaved={() => load(true)} />
      )}

      {/* Formulaire de création */}
      <Section title="Créer un cosmétique">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <ItemFormFields form={createForm} set={setCreate} />
          {createError && <div className="mt-3 text-xs text-red-400 font-mono">{createError}</div>}
          {createOk && <div className="mt-3 text-xs text-emerald-400 font-mono">{createOk}</div>}
          <div className="mt-4 flex justify-end">
            <Btn onClick={handleCreate} disabled={creating} variant="success" className="px-3 py-1.5">
              <Plus className="w-3.5 h-3.5" />
              {creating ? 'Création…' : 'Créer un cosmétique'}
            </Btn>
          </div>
        </div>
      </Section>

      {/* Liste des items */}
      <Section title="Items de la boutique">
        <div className="mb-3 flex items-center gap-3">
          <Btn onClick={() => load()} variant="ghost">↻ Recharger</Btn>
          <span className="text-zinc-600 text-xs font-mono">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        </div>
        {error && <div className="mb-3 text-xs text-red-400 font-mono">{error}</div>}
        {loading ? (
          <div className="text-zinc-500 text-sm font-mono">Chargement…</div>
        ) : items.length === 0 ? (
          <div className="text-zinc-600 text-sm font-mono">Aucun item — créez-en un ci-dessus.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="text-left py-2 px-3">Nom</th>
                  <th className="text-left py-2 px-3">Catégorie</th>
                  <th className="text-left py-2 px-3">Rareté</th>
                  <th className="text-right py-2 px-3">Prix</th>
                  <th className="text-right py-2 px-3">Ordre</th>
                  <th className="text-center py-2 px-3">Actif</th>
                  <th className="text-right py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={it.id}
                    className={`border-b border-zinc-800/40 hover:bg-zinc-900/60 transition-colors ${it.active ? '' : 'opacity-45'}`}
                  >
                    <td className="py-2 px-3 text-zinc-100">
                      <span className="inline-flex items-center gap-2">
                        {it.color && (
                          <span className="w-3 h-3 rounded-full border border-zinc-600" style={{ background: it.color }} />
                        )}
                        {it.name}
                      </span>
                      {it.description && (
                        <span className="block text-[10px] text-zinc-500 max-w-xs truncate" title={it.description}>{it.description}</span>
                      )}
                    </td>
                    <td className="py-2 px-3"><CategoryBadge category={it.category} /></td>
                    <td className="py-2 px-3">
                      {(() => {
                        const r = resolveRarity(it);
                        return (
                          <span
                            className="inline-flex items-center gap-1 text-xs tracking-wide"
                            style={{ color: RARITY[r].hex }}
                            title={it.rarity ? 'Rareté explicite' : 'Déduite du prix'}
                          >
                            <Gem className="w-3 h-3" strokeWidth={2.5} />
                            {RARITY[r].label}
                            {!it.rarity && <span className="text-zinc-600">~</span>}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-amber-400">
                      <span className="inline-flex items-center gap-1 justify-end">
                        {it.price} <CoinIcon />
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-400">{it.sortOrder}</td>
                    <td className="py-2 px-3">
                      <div className="flex justify-center">
                        <Toggle on={it.active} onToggle={() => toggleActive(it)} />
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Btn onClick={() => setEditing(it)} variant="default" disabled={pendingId === it.id}>
                          <Pencil className="w-3.5 h-3.5" /> Éditer
                        </Btn>
                        <Btn onClick={() => handleDelete(it)} variant="danger" disabled={pendingId === it.id} className="border border-red-500/40">
                          <Trash2 className="w-3.5 h-3.5" /> Suppr
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Section 2 : créditer des League Coins ───────────────────────────────────

function GrantCoinsSection() {
  const [login, setLogin] = useState('');
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleGrant() {
    const l = login.trim();
    const amt = Number(amount);
    setError('');
    setSuccess('');
    if (!l) {
      setError('Le login du joueur est obligatoire.');
      return;
    }
    if (!Number.isFinite(amt) || amt === 0) {
      setError('Le montant doit être un nombre non nul (négatif pour retirer).');
      return;
    }
    setPending(true);
    try {
      const res = await api.adminGrantCoins(l, amt);
      setSuccess(`@${res.login} a désormais ${res.coins} League Coin${res.coins !== 1 ? 's' : ''}.`);
      setAmount('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur (login inconnu ?)');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="p-4">
      <Section title="Créditer des League Coins">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Login du joueur</span>
            <Input value={login} onChange={setLogin} placeholder="ex. throbert" className="w-48" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Montant (négatif = retrait)</span>
            <Input type="number" value={amount} onChange={setAmount} placeholder="ex. 100" className="w-40" />
          </div>
          <Btn onClick={handleGrant} disabled={pending} variant="success" className="px-3 py-1.5">
            <Coins className="w-3.5 h-3.5" />
            {pending ? 'En cours…' : 'Créditer'}
          </Btn>
          <span className="text-[10px] text-zinc-600 font-mono w-full">
            Utilisez un montant négatif pour retirer des League Coins à un joueur.
          </span>
          {error && <div className="w-full text-xs text-red-400 font-mono">{error}</div>}
          {success && <div className="w-full text-xs text-emerald-400 font-mono">{success}</div>}
        </div>
      </Section>
    </div>
  );
}

// ── Section 3 : donner un cosmétique à un joueur ─────────────────────────────

function GrantItemSection({ items }: { items: ShopItemData[] }) {
  const [login, setLogin] = useState('');
  const [itemId, setItemId] = useState('');
  const [equip, setEquip] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleGrant() {
    const l = login.trim();
    setError('');
    setSuccess('');
    if (!l) {
      setError('Le login du joueur est obligatoire.');
      return;
    }
    if (!itemId) {
      setError('Choisis un cosmétique à donner.');
      return;
    }
    setPending(true);
    try {
      await api.adminGrantItem(l, itemId, equip);
      const it = items.find((i) => i.id === itemId);
      setSuccess(`« ${it?.name ?? itemId} » donné à @${l}${equip ? ' et équipé' : ''}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur (login/objet inconnu ?)');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="p-4">
      <Section title="Donner un cosmétique à un joueur">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Login du joueur</span>
            <Input value={login} onChange={setLogin} placeholder="ex. throbert" className="w-48" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Cosmétique</span>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500 w-64"
            >
              <option value="">— choisir —</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  [{CATEGORY_LABEL[it.category]}] {it.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Équiper</span>
            <div className="h-[34px] flex items-center">
              <Toggle on={equip} onToggle={() => setEquip(!equip)} label={equip ? 'Auto-équipé' : 'Inventaire seul'} />
            </div>
          </div>
          <Btn onClick={handleGrant} disabled={pending} variant="success" className="px-3 py-1.5">
            <Gift className="w-3.5 h-3.5" />
            {pending ? 'En cours…' : 'Donner'}
          </Btn>
          {error && <div className="w-full text-xs text-red-400 font-mono">{error}</div>}
          {success && <div className="w-full text-xs text-emerald-400 font-mono">{success}</div>}
        </div>
      </Section>
    </div>
  );
}

// ── Section : ÉDITEUR DE PASSE DE COMBAT ────────────────────────────────────
// Pour CHAQUE palier (niveau) 1..100, l'admin choisit librement la récompense :
// aucune / coins / consommable (4 types) / cosmétique (n'importe quel item de la
// boutique). S'appuie sur l'API admin déjà en place (GET/PUT/DELETE
// /admin/battlepass/tiers). Sauvegarde palier par palier (bouton actif seulement
// si la ligne a changé). « Aucune » supprime la config du palier (piste factice).

const BP_MAX_TIERS = 100;

const BP_CONSUMABLES: Array<[string, string]> = [
  ['anti_ops', 'Anti-OPS'],
  ['elo_mult', 'ELO ×2 (En feu)'],
  ['force_duel', 'Main du Destin'],
  ['mini_ops', 'Mini-OPS'],
];

type BpKind = 'none' | 'coins' | 'consumable' | 'item';
interface BpDraft {
  rewardKind: BpKind;
  itemId: string;
  coins: string;
  consumableKind: string;
}

function bpEmptyDraft(): BpDraft {
  return { rewardKind: 'none', itemId: '', coins: '150', consumableKind: 'anti_ops' };
}
function bpDraftFrom(a: BattlePassTierAdmin): BpDraft {
  return {
    rewardKind: a.rewardKind,
    itemId: a.itemId ?? '',
    coins: a.coins != null ? String(a.coins) : '150',
    consumableKind: a.consumableKind ?? 'anti_ops',
  };
}
function bpSameDraft(a: BpDraft, b: BpDraft): boolean {
  if (a.rewardKind !== b.rewardKind) return false;
  if (a.rewardKind === 'item') return a.itemId === b.itemId;
  if (a.rewardKind === 'coins') return a.coins === b.coins;
  if (a.rewardKind === 'consumable') return a.consumableKind === b.consumableKind;
  return true;
}
function bpCloneMap(m: Record<number, BpDraft>): Record<number, BpDraft> {
  const out: Record<number, BpDraft> = {};
  for (const [k, v] of Object.entries(m)) out[Number(k)] = { ...v };
  return out;
}

function BattlePassSection({ items }: { items: ShopItemData[] }) {
  const [drafts, setDrafts] = useState<Record<number, BpDraft>>({});
  const [saved, setSaved] = useState<Record<number, BpDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ tier: number; msg: string; ok: boolean } | null>(null);
  const [onlyConfigured, setOnlyConfigured] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.adminBattlePassTiers();
      const base: Record<number, BpDraft> = {};
      for (let tier = 1; tier <= BP_MAX_TIERS; tier++) base[tier] = bpEmptyDraft();
      for (const r of rows) if (r.tier >= 1 && r.tier <= BP_MAX_TIERS) base[r.tier] = bpDraftFrom(r);
      setDrafts(base);
      setSaved(bpCloneMap(base));
    } catch {
      /* silencieux : l'éditeur n'est pas critique */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function patch(tier: number, p: Partial<BpDraft>) {
    setDrafts((prev) => ({ ...prev, [tier]: { ...prev[tier]!, ...p } }));
  }

  async function save(tier: number) {
    const d = drafts[tier]!;
    if (d.rewardKind === 'item' && !d.itemId) {
      setFlash({ tier, msg: 'Choisis un cosmétique.', ok: false });
      return;
    }
    if (d.rewardKind === 'coins' && (d.coins === '' || Number(d.coins) < 0 || !Number.isFinite(Number(d.coins)))) {
      setFlash({ tier, msg: 'Montant de coins invalide.', ok: false });
      return;
    }
    setSaving(tier);
    setFlash(null);
    try {
      if (d.rewardKind === 'none') {
        await api.adminDeleteBattlePassTier(tier);
      } else {
        await api.adminSetBattlePassTier(tier, {
          rewardKind: d.rewardKind,
          itemId: d.rewardKind === 'item' ? d.itemId : null,
          coins: d.rewardKind === 'coins' ? Math.floor(Number(d.coins)) : null,
          consumableKind: d.rewardKind === 'consumable' ? d.consumableKind : null,
        });
      }
      setSaved((prev) => ({ ...prev, [tier]: { ...d } }));
      setFlash({ tier, msg: 'Enregistré ✓', ok: true });
    } catch (e) {
      setFlash({ tier, msg: e instanceof Error ? e.message : 'Erreur', ok: false });
    } finally {
      setSaving(null);
    }
  }

  const configuredCount = Object.values(drafts).filter((d) => d.rewardKind !== 'none').length;
  const rows = [];
  for (let tier = 1; tier <= BP_MAX_TIERS; tier++) {
    if (onlyConfigured && drafts[tier]?.rewardKind === 'none') continue;
    rows.push(tier);
  }

  return (
    <div className="p-4">
      <Section title="Passe de combat — récompense par palier">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="text-xs font-mono text-zinc-400">
              <span className="text-amber-400 font-bold">{configuredCount}</span> / {BP_MAX_TIERS} paliers configurés
            </span>
            <span className="text-[10px] text-zinc-600 font-mono">
              « Aucune » = palier laissé à la piste factice (auto-générée).
            </span>
            <div className="ml-auto flex items-center gap-3">
              <Toggle on={onlyConfigured} onToggle={() => setOnlyConfigured(!onlyConfigured)} label="Configurés seulement" />
              <Btn onClick={() => void load()} variant="ghost">
                Recharger
              </Btn>
            </div>
          </div>

          {loading ? (
            <div className="text-xs text-zinc-500 font-mono py-6 text-center">Chargement…</div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto pr-1 divide-y divide-zinc-800/60">
              {rows.map((tier) => {
                const d = drafts[tier]!;
                const dirty = !bpSameDraft(d, saved[tier] ?? bpEmptyDraft());
                return (
                  <div key={tier} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="w-14 shrink-0 text-xs font-mono font-bold text-zinc-300">Niv {tier}</span>
                    <select
                      value={d.rewardKind}
                      onChange={(e) => patch(tier, { rewardKind: e.target.value as BpKind })}
                      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
                    >
                      <option value="none">Aucune</option>
                      <option value="coins">Coins</option>
                      <option value="consumable">Consommable</option>
                      <option value="item">Cosmétique</option>
                    </select>

                    {d.rewardKind === 'coins' && (
                      <div className="flex items-center gap-1">
                        <Input type="number" value={d.coins} onChange={(v) => patch(tier, { coins: v })} className="w-24" />
                        <span className="text-[10px] text-zinc-500 font-mono">coins</span>
                      </div>
                    )}
                    {d.rewardKind === 'consumable' && (
                      <select
                        value={d.consumableKind}
                        onChange={(e) => patch(tier, { consumableKind: e.target.value })}
                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
                      >
                        {BP_CONSUMABLES.map(([k, label]) => (
                          <option key={k} value={k}>{label}</option>
                        ))}
                      </select>
                    )}
                    {d.rewardKind === 'item' && (
                      <select
                        value={d.itemId}
                        onChange={(e) => patch(tier, { itemId: e.target.value })}
                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-500 max-w-[16rem]"
                      >
                        <option value="">— choisir un cosmétique —</option>
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>
                            [{CATEGORY_LABEL[it.category]}] {it.name}
                          </option>
                        ))}
                      </select>
                    )}

                    <Btn onClick={() => void save(tier)} disabled={!dirty || saving === tier} variant="success" className="px-2 py-1">
                      <Save className="w-3 h-3" />
                      {saving === tier ? '…' : 'Enregistrer'}
                    </Btn>
                    {flash?.tier === tier && (
                      <span className={`text-[10px] font-mono ${flash.ok ? 'text-emerald-400' : 'text-red-400'}`}>{flash.msg}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

// ── Section 0 : suivi des joueurs (liste cliquable → fiche détaillée) ────────

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return <img src={url} alt="" className="w-7 h-7 rounded-full object-cover border border-zinc-700" />;
  }
  return (
    <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-400 uppercase">
      {name.slice(0, 2)}
    </div>
  );
}

type PlayerSortKey = 'name' | 'coins' | 'itemsOwned' | 'txCount';

// En-tête de colonne triable (clic pour trier ; flèche sur la colonne active).
function SortTh({
  label,
  k,
  sort,
  onSort,
  align,
}: {
  label: string;
  k: PlayerSortKey;
  sort: { key: PlayerSortKey; dir: 'asc' | 'desc' };
  onSort: (k: PlayerSortKey) => void;
  align: 'left' | 'right';
}) {
  const active = sort.key === k;
  return (
    <th className={`py-2 px-3 ${align === 'left' ? 'text-left' : 'text-right'}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-zinc-200 ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${active ? 'text-zinc-200' : 'text-zinc-500'}`}
      >
        <span>{label}</span>
        <span className="text-[9px] w-2">{active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
}

function PlayersSection() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ShopUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  // Tri par colonne (clic sur l'en-tête). Défaut : les plus riches en premier.
  const [sort, setSort] = useState<{ key: PlayerSortKey; dir: 'asc' | 'desc' }>({
    key: 'coins',
    dir: 'desc',
  });
  const toggleSort = (key: PlayerSortKey) =>
    setSort((p) =>
      p.key === key
        ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
  const sortedRows = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sort.key === 'name') cmp = nameOf(a).localeCompare(nameOf(b));
      else cmp = (a[sort.key] ?? 0) - (b[sort.key] ?? 0);
      if (cmp === 0) cmp = b.coins - a.coins; // départage stable par solde
      return cmp * dir;
    });
  }, [rows, sort]);

  // Recherche débounced côté serveur (login / prénom / nom).
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      api.adminShopUsers(search.trim() || undefined)
        .then((list) => { if (!cancelled) setRows(list); })
        .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [search]);

  return (
    <div className="p-4">
      <Section title="Suivi des joueurs — solde &amp; historique">
        <div className="mb-3 flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un joueur…"
              className="bg-zinc-800 border border-zinc-700 rounded pl-8 pr-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500 w-64"
            />
          </div>
          <span className="text-zinc-600 text-xs font-mono">
            {loading ? '…' : `${rows.length} joueur${rows.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        {error && <div className="mb-3 text-xs text-red-400 font-mono">{error}</div>}
        {loading && rows.length === 0 ? (
          <div className="text-zinc-500 text-sm font-mono">Chargement…</div>
        ) : rows.length === 0 ? (
          <div className="text-zinc-600 text-sm font-mono">Aucun joueur trouvé.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                  <SortTh label="Joueur" k="name" sort={sort} onSort={toggleSort} align="left" />
                  <SortTh label="Solde" k="coins" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Objets" k="itemsOwned" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Mouvements" k="txCount" sort={sort} onSort={toggleSort} align="right" />
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((u) => (
                  <tr
                    key={u.login}
                    onClick={() => navigate(`/shop-god/u/${encodeURIComponent(u.login)}`)}
                    className="border-b border-zinc-800/40 hover:bg-zinc-900/60 transition-colors cursor-pointer"
                  >
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center gap-2.5">
                        <Avatar url={u.imageUrl} name={nameOf(u)} />
                        <span className="flex flex-col leading-tight">
                          <span className="text-zinc-100">{nameOf(u)}</span>
                          <span className="text-[10px] text-zinc-500">@{u.login}</span>
                        </span>
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-amber-400">
                      <span className="inline-flex items-center gap-1 justify-end">
                        {u.coins} <CoinIcon />
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-400">{u.itemsOwned}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-zinc-400">{u.txCount}</td>
                    <td className="py-2 px-3 text-right">
                      <ChevronRight className="w-4 h-4 text-zinc-600 inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Page principale (self-guard admin) ──────────────────────────────────────

// ── Section : propositions de cosmétiques des joueurs (relecture) ───────────

/** Construit un FormState minimal depuis une proposition pour l'aperçu (ItemPreview). */
function formFromProposal(p: ShopProposal): FormState {
  const payload = (p.payload ?? {}) as Record<string, unknown>;
  return {
    ...emptyForm(),
    name: p.name,
    category: p.category,
    color: p.color ?? '#ffc94a',
    titleText: typeof payload.title === 'string' ? payload.title : '',
    bannerImage: typeof payload.image === 'string' ? payload.image : '',
    winEmoteGlyph: typeof payload.emoji === 'string' ? payload.emoji : '',
    winEmotePhrase: typeof payload.phrase === 'string' ? payload.phrase : '',
  };
}

// Récompense éditable par l'admin pour une proposition (init = demande du joueur).
type RewardDraft = { kind: ProposalRewardKind; amount: string; price: string };
const REWARD_KINDS: { v: ProposalRewardKind; label: string; Icon: typeof Gift }[] = [
  { v: 'credit', label: 'Attribution', Icon: BadgeCheck },
  { v: 'coins', label: 'Coins', Icon: Coins },
  { v: 'xp', label: 'XP', Icon: Zap },
  { v: 'none', label: 'Rien', Icon: Gift },
];
const REWARD_LABEL: Record<ProposalRewardKind, string> = {
  credit: 'son nom sur l’objet',
  coins: 'des coins',
  xp: 'de l’XP',
  none: 'rien',
};

function ProposalsSection() {
  const [proposals, setProposals] = useState<ShopProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Brouillon de récompense par proposition (édité par l'admin avant validation).
  const [drafts, setDrafts] = useState<Record<string, RewardDraft>>({});

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.adminShopProposals()
      .then((list) => {
        setProposals(list);
        // Initialise chaque brouillon avec la demande du joueur.
        setDrafts((prev) => {
          const next = { ...prev };
          for (const p of list) {
            if (!next[p.id]) {
              next[p.id] = {
                kind: p.rewardKind ?? 'credit',
                amount: p.rewardAmount != null ? String(p.rewardAmount) : '',
                price: '',
              };
            }
          }
          return next;
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Rafraîchit en temps réel quand un joueur soumet une proposition.
  useServerEvents(() => load(true), ['shop:proposal']);

  function patchDraft(id: string, patch: Partial<RewardDraft>) {
    setDrafts((prev) => {
      const base: RewardDraft = prev[id] ?? { kind: 'credit', amount: '', price: '' };
      return { ...prev, [id]: { ...base, ...patch } };
    });
  }

  async function decide(p: ShopProposal, action: 'accept' | 'reject') {
    setPendingId(p.id);
    setError('');
    try {
      if (action === 'accept') {
        const d = drafts[p.id] ?? { kind: 'credit', amount: '', price: '' };
        const needsAmount = d.kind === 'coins' || d.kind === 'xp';
        await api.acceptShopProposal(p.id, {
          rewardKind: d.kind,
          rewardAmount: needsAmount ? Math.max(0, Math.round(Number(d.amount) || 0)) : null,
          price: Math.max(0, Math.round(Number(d.price) || 0)),
        });
      } else {
        await api.rejectShopProposal(p.id);
      }
      setProposals((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      load(true);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="p-4">
      <Section
        title={`Propositions boutique${proposals.length ? ` — ${proposals.length} en attente` : ''}`}
      >
        {loading ? (
          <div className="text-xs text-zinc-500 font-mono px-1">Chargement…</div>
        ) : proposals.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-xs text-zinc-500 font-mono">
            Aucune proposition en attente.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {proposals.map((p) => {
              const d = drafts[p.id] ?? { kind: 'credit', amount: '', price: '' };
              const needsAmount = d.kind === 'coins' || d.kind === 'xp';
              return (
              <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${CATEGORY_BADGE[p.category]}`}>
                      {CATEGORY_LABEL[p.category]}
                    </span>
                    <span className="text-sm text-zinc-100 font-bold truncate">{p.name}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono shrink-0">par {p.proposerLogin}</span>
                </div>
                <ItemPreview form={formFromProposal(p)} />

                {/* Récompense DEMANDÉE par le joueur (rappel). */}
                <div className="text-[11px] text-zinc-400 font-mono">
                  Demande : <span className="text-zinc-200">{REWARD_LABEL[p.rewardKind ?? 'credit']}</span>
                  {(p.rewardKind === 'coins' || p.rewardKind === 'xp') && p.rewardAmount != null && (
                    <span className="text-zinc-200"> ({p.rewardAmount})</span>
                  )}
                </div>

                {/* Récompense EFFECTIVE (ajustable). */}
                <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
                  <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Récompenser le créateur</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {REWARD_KINDS.map(({ v, label, Icon }) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => patchDraft(p.id, { kind: v })}
                        className={`inline-flex flex-col items-center gap-1 px-1 py-1.5 rounded text-[10px] font-mono border transition-colors ${
                          d.kind === v
                            ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                            : 'border-zinc-800 text-zinc-500 hover:text-zinc-200'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {needsAmount && (
                      <label className="flex-1 flex flex-col gap-0.5">
                        <span className="text-[9px] text-zinc-600 font-mono uppercase">Montant {d.kind}</span>
                        <Input value={d.amount} onChange={(v) => patchDraft(p.id, { amount: v.replace(/[^0-9]/g, '') })} placeholder="0" />
                      </label>
                    )}
                    <label className="flex-1 flex flex-col gap-0.5">
                      <span className="text-[9px] text-zinc-600 font-mono uppercase">Prix boutique</span>
                      <Input value={d.price} onChange={(v) => patchDraft(p.id, { price: v.replace(/[^0-9]/g, '') })} placeholder="0 (gratuit)" />
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Btn variant="success" disabled={pendingId === p.id} onClick={() => decide(p, 'accept')}>
                    Accepter
                  </Btn>
                  <Btn variant="danger" disabled={pendingId === p.id} onClick={() => decide(p, 'reject')}>
                    Refuser
                  </Btn>
                </div>
              </div>
              );
            })}
          </div>
        )}
        {error && <div className="mt-3 text-xs text-red-400 font-mono px-1">{error}</div>}
      </Section>
    </div>
  );
}

// ── Validation des cosmétiques personnalisés (items « Choisissez… ») ──────────
function CosmeticRequestsSection() {
  const [requests, setRequests] = useState<CosmeticRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.adminCosmeticRequests()
      .then(setRequests)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useServerEvents(() => load(true), ['cosmetic:request']);

  async function decide(r: CosmeticRequest, action: 'accept' | 'reject') {
    setPendingId(r.id);
    setError('');
    try {
      if (action === 'accept') await api.acceptCosmeticRequest(r.id);
      else await api.rejectCosmeticRequest(r.id);
      setRequests((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      load(true);
    } finally {
      setPendingId(null);
    }
  }

  function previewForm(r: CosmeticRequest): FormState {
    const payload = (r.payload ?? {}) as Record<string, unknown>;
    return {
      ...emptyForm(),
      name: r.itemName ?? '',
      category: r.category,
      color: typeof payload.color === 'string' ? payload.color : '#ffc94a',
      titleText: typeof payload.title === 'string' ? payload.title : '',
      bannerImage: typeof payload.image === 'string' ? payload.image : '',
      winEmoteGlyph: typeof payload.emoji === 'string' ? payload.emoji : '',
      winEmotePhrase: typeof payload.phrase === 'string' ? payload.phrase : '',
    };
  }

  return (
    <div className="p-4">
      <Section
        title={`Cosmétiques personnalisés à valider${requests.length ? ` — ${requests.length} en attente` : ''}`}
      >
        {loading ? (
          <div className="text-xs text-zinc-500 font-mono px-1">Chargement…</div>
        ) : requests.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-xs text-zinc-500 font-mono">
            Aucune création d’acheteur en attente.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {requests.map((r) => (
              <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${CATEGORY_BADGE[r.category]}`}>
                      {CATEGORY_LABEL[r.category]}
                    </span>
                    <span className="text-sm text-zinc-100 font-bold truncate">
                      <Palette className="w-3.5 h-3.5 inline -mt-0.5 mr-1 text-pink-400" />
                      {r.itemName ?? 'Cosmétique'}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono shrink-0">par {r.userLogin}</span>
                </div>
                <ItemPreview form={previewForm(r)} />
                <div className="flex justify-end gap-2">
                  <Btn variant="success" disabled={pendingId === r.id} onClick={() => decide(r, 'accept')}>
                    Valider
                  </Btn>
                  <Btn variant="danger" disabled={pendingId === r.id} onClick={() => decide(r, 'reject')}>
                    Refuser
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}
        {error && <div className="mt-3 text-xs text-red-400 font-mono px-1">{error}</div>}
      </Section>
    </div>
  );
}

// Coquille commune des pages GOD (auth admin + header + zone scrollable). Partagée
// par la page principale et la sous-page « Suivi des joueurs ».
function GodChrome({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [myLogin, setMyLogin] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    api.me()
      .then((data) => {
        const role = data.role;
        if (role === 'ADMIN' || role === 'SUPERADMIN') {
          setMyLogin(data.login);
          setMyRole(role);
        } else {
          setMyRole(null);
        }
      })
      .catch(() => setMyRole(null))
      .finally(() => setAuthLoading(false));
  }, []);

  if (authLoading) {
    return (
      <div className="h-screen bg-zinc-950 flex items-center justify-center overflow-hidden">
        <span className="text-zinc-500 font-mono text-sm">Vérification des droits…</span>
      </div>
    );
  }

  if (!myRole || !myLogin) {
    return (
      <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 overflow-hidden">
        <span className="text-red-400 font-mono text-2xl font-bold">403</span>
        <span className="text-zinc-400 font-mono text-sm">Accès refusé. Admins uniquement.</span>
        <button onClick={() => navigate('/')} className="text-zinc-500 font-mono text-xs hover:text-zinc-300 transition-colors cursor-pointer">
          ← Retour
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 font-mono flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              aria-label="Retour à l'application"
              className="flex items-center justify-center w-8 h-8 -ml-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
            </button>
            <img src="/42coin.webp" alt="League Coin" className="w-6 h-6" />
            <div className="flex flex-col leading-tight">
              <span className="text-zinc-200 font-bold tracking-widest text-sm flex items-center gap-1.5">
                <Store className="w-4 h-4 text-amber-400" /> SHOP GOD
              </span>
              <span className="text-[10px] text-zinc-500">Gestion de la boutique — cosmétiques &amp; League Coins</span>
            </div>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-400 text-xs">{myLogin}</span>
          </div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-zinc-500 text-xs hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
            Retour app
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-screen-2xl mx-auto">{children}</div>
      </div>
    </div>
  );
}

export function ShopGODPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ShopItemData[]>([]);
  return (
    <GodChrome>
      {/* Suivi des joueurs → sous-page dédiée (sortie du flux principal, trop lourde en tête). */}
      <div className="p-4 pb-0">
        <button
          onClick={() => navigate('/shop-god/players')}
          className="w-full flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900 hover:border-zinc-700 transition-colors px-4 py-3 cursor-pointer text-left"
        >
          <span className="flex items-center gap-2 text-zinc-200 text-sm font-bold">
            <Search className="w-4 h-4 text-amber-400" /> Suivi des joueurs — solde &amp; historique
          </span>
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        </button>
      </div>
      <ProposalsSection />
      <CosmeticRequestsSection />
      <GrantCoinsSection />
      <GrantItemSection items={items} />
      <BattlePassSection items={items} />
      <ItemsSection onItemsChanged={setItems} />
    </GodChrome>
  );
}

// Sous-page séparée : le tableau « Suivi des joueurs » (solde + historique + accès au
// ledger par joueur). Atteinte depuis le bouton dédié de la page principale.
export function ShopGODPlayersPage() {
  const navigate = useNavigate();
  return (
    <GodChrome>
      <div className="p-4 pb-0">
        <button
          onClick={() => navigate('/shop-god')}
          className="inline-flex items-center gap-1 text-zinc-500 text-xs hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} /> Retour Shop GOD
        </button>
      </div>
      <PlayersSection />
    </GodChrome>
  );
}

export default ShopGODPage;
