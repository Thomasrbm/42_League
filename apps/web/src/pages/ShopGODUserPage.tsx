import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  Store,
  Coins,
  Package,
  Swords,
  Target,
  Dices,
  Trophy,
  ShoppingBag,
  Gift,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
} from 'lucide-react';
import { api, type CoinTxType, type CoinTransaction, type ShopUserDetail } from '../lib/api';
import { RARITY, resolveRarity } from '../lib/rarity';

type Role = 'ADMIN' | 'SUPERADMIN';

// ── Libellés & icônes par type de mouvement ─────────────────────────────────

const TYPE_LABEL: Record<CoinTxType, string> = {
  match: 'Match',
  quest: 'Quête hebdo',
  streak: 'Série d’assiduité',
  bet_place: 'Pari placé',
  bet_win: 'Pari gagné',
  bet_refund: 'Pari remboursé',
  bet_reversal: 'Pari annulé',
  tournament_prize: 'Prix de tournoi',
  shop_purchase: 'Achat boutique',
  shop_consumable: 'Achat consommable',
  mystery_box: 'Mystery box',
  sheldon_reward: 'Cadeau Sheldon',
  trophy_income: 'Revenu de trophée',
  admin_grant: 'Don admin',
};

function TypeIcon({ type }: { type: CoinTxType }) {
  const cls = 'w-3.5 h-3.5';
  switch (type) {
    case 'match':
      return <Swords className={cls} />;
    case 'quest':
      return <Target className={cls} />;
    case 'streak':
      return <Flame className={cls} />;
    case 'bet_place':
    case 'bet_win':
    case 'bet_refund':
    case 'bet_reversal':
      return <Dices className={cls} />;
    case 'tournament_prize':
      return <Trophy className={cls} />;
    case 'shop_purchase':
    case 'shop_consumable':
      return <ShoppingBag className={cls} />;
    case 'mystery_box':
      return <Package className={cls} />;
    case 'sheldon_reward':
      return <Gift className={cls} />;
    case 'trophy_income':
      return <Trophy className={cls} />;
    case 'admin_grant':
      return <Shield className={cls} />;
  }
}

const CONSUMABLE_LABEL: Record<string, string> = {
  anti_ops: 'Anti-OPS',
  elo_mult: 'ELO ×2 (EN FEU)',
  force_duel: 'Duel forcé',
};

const GAME_LABEL: Record<string, string> = {
  babyfoot: 'Babyfoot',
  smash: 'Smash',
  chess: 'Échecs',
  streetfighter: 'Street Fighter',
  flechettes: 'Fléchettes',
};

/** Contexte lisible d'un mouvement, déduit de meta. */
function describe(t: CoinTransaction): string {
  const m = (t.meta ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof m[k] === 'string' ? (m[k] as string) : undefined);
  switch (t.type) {
    case 'match': {
      const game = s('game');
      const g = game ? GAME_LABEL[game] ?? game : 'match';
      return m.won ? `${g} — victoire` : `${g} — participation`;
    }
    case 'quest':
      return `Récompense de quête${s('questId') ? ` (${s('questId')})` : ''}`;
    case 'streak':
      return `Palier de série — ${typeof m.streak === 'number' ? m.streak : '?'} jours`;
    case 'bet_place': {
      const tt = s('targetType');
      const target = tt === 'tournament' ? 'un tournoi' : tt === 'match' ? 'un match' : tt === 'ops' ? 'un duel d’OPS' : 'un pari';
      return `Mise sur ${target}${s('choiceLogin') && s('choiceLogin') !== '__draw__' ? ` (@${s('choiceLogin')})` : ''}`;
    }
    case 'bet_win':
      return `Gain de pari${s('choiceLogin') && s('choiceLogin') !== '__draw__' ? ` (@${s('choiceLogin')})` : ''}`;
    case 'bet_refund':
      return m.reason === 'cancelled' ? 'Remboursement (pari annulé)' : 'Remboursement (nul)';
    case 'bet_reversal':
      return 'Annulation de gain (correction de score)';
    case 'tournament_prize':
      return m.kind === 'champion' ? 'Prix du champion' : 'Cash-prize de tournoi';
    case 'shop_purchase':
      return `Achat : ${s('name') ?? 'objet'}`;
    case 'shop_consumable':
      return `Achat : ${s('name') ?? CONSUMABLE_LABEL[s('kind') ?? ''] ?? 'consommable'}`;
    case 'mystery_box':
      return `Mystery box : ${s('name') ?? 'boîte mystère'}`;
    case 'sheldon_reward':
      return `Cadeau « ${s('name') ?? 'Apôtre de Sheldon'} »`;
    case 'trophy_income':
      return `Revenu de trophée${s('name') ? ` (${s('name')})` : ''}`;
    case 'admin_grant':
      return s('by') ? `Ajustement manuel par @${s('by')}` : 'Ajustement manuel';
  }
}

// ── Primitives visuelles (langage GODPage) ──────────────────────────────────

function CoinIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return <img src="/42coin.png" alt="LC" className={`${className} inline-block align-text-bottom`} />;
}

function Btn({
  onClick,
  variant = 'default',
  disabled,
  children,
  className = '',
}: {
  onClick?: () => void;
  variant?: 'default' | 'success' | 'ghost';
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const base = 'px-2 py-1 text-xs rounded font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1';
  const variants = {
    default: 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100',
    success: 'bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 border border-emerald-500/30',
    ghost: 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200',
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

function nameOf(u: { firstName: string | null; lastName: string | null; login: string }): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.login;
}

function StatCard({ label, value, tone }: { label: string; value: ReactNode; tone?: 'up' | 'down' | 'neutral' }) {
  const color = tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-red-400' : 'text-zinc-100';
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 flex flex-col gap-1 min-w-[8rem]">
      <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{label}</span>
      <span className={`text-lg font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

// ── Encart « ajuster le solde » (réutilise /admin/shop/grant) ────────────────

function QuickGrant({ login, onDone }: { login: string; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(sign: 1 | -1) {
    const amt = Math.abs(Number(amount)) * sign;
    setMsg('');
    if (!Number.isFinite(amt) || amt === 0) {
      setMsg('Montant invalide.');
      return;
    }
    setPending(true);
    try {
      const res = await api.adminGrantCoins(login, amt);
      setMsg(`Nouveau solde : ${res.coins} LC.`);
      setAmount('');
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="montant"
        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500 w-28"
      />
      <Btn variant="success" disabled={pending} onClick={() => submit(1)}>
        <Coins className="w-3.5 h-3.5" /> Créditer
      </Btn>
      <Btn variant="default" disabled={pending} onClick={() => submit(-1)}>
        Retirer
      </Btn>
      {msg && <span className="text-[11px] text-zinc-400 font-mono">{msg}</span>}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

const PAGE = 50;

export function ShopGODUserPage() {
  const navigate = useNavigate();
  const { login = '' } = useParams<{ login: string }>();

  const [role, setRole] = useState<Role | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [detail, setDetail] = useState<ShopUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Journal paginé (séparé du reste pour le filtre par type + « charger plus »).
  const [txList, setTxList] = useState<CoinTransaction[]>([]);
  const [txOffset, setTxOffset] = useState(0);
  const [txTotal, setTxTotal] = useState(0);
  const [txHasMore, setTxHasMore] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    api.me()
      .then((d) => setRole(d.role === 'ADMIN' || d.role === 'SUPERADMIN' ? d.role : null))
      .catch(() => setRole(null))
      .finally(() => setAuthLoading(false));
  }, []);

  // Chargement initial (et rechargement après ajustement de solde).
  const loadDetail = useCallback(() => {
    setLoading(true);
    api.adminShopUser(login, { limit: PAGE, offset: 0, type: typeFilter || undefined })
      .then((d) => {
        setDetail(d);
        setTxList(d.transactions);
        setTxOffset(d.transactions.length);
        setTxTotal(d.total);
        setTxHasMore(d.hasMore);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
    // typeFilter volontairement inclus : changer de filtre recharge la 1re page.
  }, [login, typeFilter]);

  useEffect(() => { if (role) loadDetail(); }, [role, loadDetail]);

  function loadMore() {
    setTxLoading(true);
    api.adminShopUser(login, { limit: PAGE, offset: txOffset, type: typeFilter || undefined })
      .then((d) => {
        setTxList((prev) => [...prev, ...d.transactions]);
        setTxOffset((o) => o + d.transactions.length);
        setTxHasMore(d.hasMore);
        setTxTotal(d.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setTxLoading(false));
  }

  if (authLoading) {
    return (
      <div className="h-screen bg-zinc-950 flex items-center justify-center">
        <span className="text-zinc-500 font-mono text-sm">Vérification des droits…</span>
      </div>
    );
  }
  if (!role) {
    return (
      <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <span className="text-red-400 font-mono text-2xl font-bold">403</span>
        <span className="text-zinc-400 font-mono text-sm">Accès refusé. Admins uniquement.</span>
        <button onClick={() => navigate('/shop-god')} className="text-zinc-500 font-mono text-xs hover:text-zinc-300 cursor-pointer">
          ← Shop GOD
        </button>
      </div>
    );
  }

  const net = detail ? detail.summary.earned + detail.summary.spent : 0;
  const enFeu = detail?.eloMultUntil && new Date(detail.eloMultUntil).getTime() > Date.now();

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 font-mono flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/shop-god')}
            aria-label="Retour à Shop GOD"
            className="flex items-center justify-center w-8 h-8 -ml-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
          </button>
          <img src="/42coin.png" alt="League Coin" className="w-6 h-6" />
          <div className="flex flex-col leading-tight">
            <span className="text-zinc-200 font-bold tracking-widest text-sm flex items-center gap-1.5">
              <Store className="w-4 h-4 text-amber-400" /> SHOP GOD
            </span>
            <span className="text-[10px] text-zinc-500">Fiche joueur — solde, historique &amp; inventaire</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-screen-2xl mx-auto p-4">
          {loading && !detail ? (
            <div className="text-zinc-500 text-sm">Chargement…</div>
          ) : error && !detail ? (
            <div className="text-red-400 text-sm">{error}</div>
          ) : detail ? (
            <>
              {/* Identité + solde + ajustement */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {detail.imageUrl ? (
                    <img src={detail.imageUrl} alt="" className="w-12 h-12 rounded-full object-cover border border-zinc-700" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm text-zinc-400 uppercase">
                      {nameOf(detail).slice(0, 2)}
                    </div>
                  )}
                  <div className="flex flex-col leading-tight">
                    <span className="text-zinc-100 font-bold text-base flex items-center gap-2">
                      {nameOf(detail)}
                      {enFeu && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-orange-400 bg-orange-500/10 border border-orange-500/30 rounded px-1.5 py-0.5">
                          <Flame className="w-3 h-3" /> EN FEU
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-zinc-500">@{detail.login}{detail.title ? ` · ${detail.title}` : ''}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-2xl font-bold text-amber-400 tabular-nums inline-flex items-center gap-2">
                    {detail.coins} <CoinIcon className="w-6 h-6" />
                  </span>
                  <QuickGrant login={detail.login} onDone={loadDetail} />
                </div>
              </div>

              {/* Récap chiffré */}
              <div className="flex flex-wrap gap-3 mb-6">
                <StatCard label="Total gagné" tone="up" value={<span className="inline-flex items-center gap-1"><ArrowUpRight className="w-4 h-4" />{detail.summary.earned} LC</span>} />
                <StatCard label="Total dépensé" tone="down" value={<span className="inline-flex items-center gap-1"><ArrowDownRight className="w-4 h-4" />{detail.summary.spent} LC</span>} />
                <StatCard label="Solde net" tone={net >= 0 ? 'up' : 'down'} value={`${net >= 0 ? '+' : ''}${net} LC`} />
                <StatCard label="Mouvements" value={txTotal} />
              </div>

              {/* Répartition par type */}
              {detail.summary.byType.length > 0 && (
                <div className="mb-6">
                  <div className="text-xs text-zinc-500 uppercase tracking-widest mb-2 px-1">Répartition par source</div>
                  <div className="flex flex-wrap gap-2">
                    {detail.summary.byType
                      .slice()
                      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
                      .map((r) => (
                        <span key={r.type} className="inline-flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs">
                          <TypeIcon type={r.type} />
                          <span className="text-zinc-300">{TYPE_LABEL[r.type]}</span>
                          <span className={`tabular-nums ${r.total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {r.total >= 0 ? '+' : ''}{r.total}
                          </span>
                          <span className="text-zinc-600">×{r.count}</span>
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* Inventaire */}
              <div className="mb-6">
                <div className="text-xs text-zinc-500 uppercase tracking-widest mb-2 px-1 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> Inventaire
                </div>
                {detail.inventory.cosmetics.length === 0 && detail.inventory.consumables.every((c) => c.quantity === 0) ? (
                  <div className="text-zinc-600 text-sm px-1">Aucun objet possédé.</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {detail.inventory.cosmetics.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {detail.inventory.cosmetics.map((it) => {
                          const r = resolveRarity(it);
                          return (
                            <span
                              key={it.itemId}
                              className="inline-flex items-center gap-2 bg-zinc-900 border rounded px-2.5 py-1.5 text-xs"
                              style={{ borderColor: `${RARITY[r].hex}55` }}
                            >
                              {it.color && <span className="w-3 h-3 rounded-full border border-zinc-600" style={{ background: it.color }} />}
                              <span className="text-zinc-100">{it.name}</span>
                              <span style={{ color: RARITY[r].hex }}>{RARITY[r].label}</span>
                              {it.equipped && <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-1">équipé</span>}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {detail.inventory.consumables.filter((c) => c.quantity > 0).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {detail.inventory.consumables
                          .filter((c) => c.quantity > 0)
                          .map((c) => (
                            <span key={c.kind} className="inline-flex items-center gap-1.5 bg-zinc-900 border border-teal-500/30 rounded px-2.5 py-1.5 text-xs">
                              <span className="text-teal-300">{CONSUMABLE_LABEL[c.kind] ?? c.kind}</span>
                              <span className="text-zinc-400 tabular-nums">×{c.quantity}</span>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Journal des mouvements */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="text-xs text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5" /> Historique des gains &amp; pertes
                  </div>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
                  >
                    <option value="">Tous les types</option>
                    {(Object.keys(TYPE_LABEL) as CoinTxType[]).map((t) => (
                      <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                </div>
                {txList.length === 0 ? (
                  <div className="text-zinc-600 text-sm px-1">Aucun mouvement{typeFilter ? ' pour ce type' : ''}.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm font-mono border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                          <th className="text-left py-2 px-3">Date</th>
                          <th className="text-left py-2 px-3">Type</th>
                          <th className="text-left py-2 px-3">Détail</th>
                          <th className="text-right py-2 px-3">Montant</th>
                          <th className="text-right py-2 px-3">Solde après</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txList.map((t) => (
                          <tr key={t.id} className="border-b border-zinc-800/40 hover:bg-zinc-900/60 transition-colors">
                            <td className="py-2 px-3 text-zinc-500 whitespace-nowrap text-xs">
                              {new Date(t.createdAt).toLocaleString('fr-FR', {
                                day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
                              })}
                            </td>
                            <td className="py-2 px-3">
                              <span className="inline-flex items-center gap-1.5 text-zinc-300 text-xs">
                                <TypeIcon type={t.type} />
                                {TYPE_LABEL[t.type]}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-zinc-400 text-xs max-w-md truncate" title={describe(t)}>
                              {describe(t)}
                            </td>
                            <td className={`py-2 px-3 text-right tabular-nums font-bold ${t.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {t.amount >= 0 ? '+' : ''}{t.amount}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-amber-400/80">{t.balanceAfter}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-3 flex items-center gap-3">
                      {txHasMore ? (
                        <Btn onClick={loadMore} disabled={txLoading}>
                          {txLoading ? 'Chargement…' : 'Charger plus'}
                        </Btn>
                      ) : (
                        <span className="text-[11px] text-zinc-600">— fin de l’historique —</span>
                      )}
                      <span className="text-[11px] text-zinc-600">{txList.length} / {txTotal}</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default ShopGODUserPage;
