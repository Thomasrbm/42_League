import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { ShieldBan, Swords, Flame, Loader2, Check, X, Crosshair, Upload, ImageIcon, type LucideProps } from 'lucide-react';
import { api, type ConsumablesResponse, type ConsumableKind, type ConsumableState, type InventoryEntry } from '../../lib/api';
import { useFlash } from '../../hooks/useFlash';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useEloBoostRemaining } from '../../components/EloBoost';
import { CustomBannerUploaderModal } from '../../components/shop/CustomBannerUploader';
import { SectionHeader } from './shared/SectionHeader';
import { getGame, type Game } from '../../lib/gameMode';
import { GAMES, GAME_META } from '../../lib/gameMeta';

/**
 * Inventaire des consommables du joueur (profil). Affiche le stock, le cap mensuel
 * et un bouton « utiliser » par type, avec gestion du cooldown (anti-OPS) et de
 * l'état « armé » (multiplicateur d'ELO). La « Main du Destin » (force_duel) ouvre
 * un sélecteur de deux joueurs + une discipline à imposer plutôt qu'un effet immédiat.
 */
const META: Record<ConsumableKind, { label: string; desc: string; Icon: ComponentType<LucideProps>; color: string }> = {
  anti_ops: {
    label: 'Anti-OPS',
    desc: "Annule l'OPS qui te vise. 2 sem. de cooldown entre deux usages.",
    Icon: ShieldBan,
    color: '#2dd4bf',
  },
  elo_mult: {
    label: 'ELO ×2 — EN FEU',
    desc: 'À utiliser quand tu es en feu : 6 h où chaque score compte double (gain ×2, perte ×2). 1 activation / semaine.',
    Icon: Flame,
    color: '#ff7a18',
  },
  force_duel: {
    label: 'Main du Destin',
    desc: 'Désigne deux joueurs et la discipline, et force-les à un duel inéluctable.',
    Icon: Swords,
    color: '#b07bff',
  },
  mini_ops: {
    label: 'Mini-OPS',
    desc: 'Désigne une cible : un duel inéluctable t’oppose à elle, impossible à refuser.',
    Icon: Crosshair,
    color: '#ff5d73',
  },
};

const COOLDOWN_MS: Partial<Record<ConsumableKind, number>> = {
  anti_ops: 14 * 24 * 60 * 60 * 1000,
};

function cooldownLeft(c: ConsumableState): number {
  const cd = COOLDOWN_MS[c.kind];
  if (!cd || !c.lastUsedAt) return 0;
  return Math.max(0, new Date(c.lastUsedAt).getTime() + cd - Date.now());
}

function fmtLeft(ms: number): string {
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days >= 2) return `${days} j`;
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  return `${hours} h`;
}

function BannersSection() {
  const { show } = useFlash();
  const { refresh } = useLeagueData();
  const [banners, setBanners] = useState<InventoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadTarget, setUploadTarget] = useState<InventoryEntry | null>(null);
  const [equipping, setEquipping] = useState<string | null>(null);

  useEffect(() => {
    api.inventory()
      .then((rows) => setBanners(rows.filter((r) => r.item.category === 'banner')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (banners.length === 0) return null;

  async function toggleEquip(entry: InventoryEntry) {
    setEquipping(entry.itemId);
    try {
      await api.equipItem(entry.itemId, !entry.equipped);
      setBanners((prev) =>
        prev.map((b) => ({
          ...b,
          equipped: b.item.category === 'banner' ? b.itemId === entry.itemId && !entry.equipped : b.equipped,
        })),
      );
      void refresh();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setEquipping(null);
    }
  }

  return (
    <section>
      <SectionHeader title="Bannières" />
      <div className="space-y-2">
        {banners.map((b) => {
          const p = b.item.payload as Record<string, unknown> | null;
          const isCustom = p?.allowUpload === true;
          const userImg = typeof b.userPayload?.image === 'string' ? b.userPayload.image : null;
          const itemImg = typeof p?.image === 'string' ? p.image : null;
          const displayImg = userImg ?? itemImg;

          return (
            <div
              key={b.itemId}
              className="relative card-hud rounded-2xl overflow-hidden"
              style={{ borderColor: b.equipped ? 'rgba(255,201,74,0.35)' : undefined }}
            >
              {/* Aperçu bannière */}
              <div className="relative w-full" style={{ aspectRatio: '1024 / 256' }}>
                {displayImg ? (
                  <img src={displayImg} alt={b.item.name} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-bg-2">
                    <ImageIcon className="w-6 h-6 text-muted/30" strokeWidth={1.5} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <span className="absolute bottom-2 left-3 font-gaming text-sm font-extrabold text-white drop-shadow">
                  {b.item.name}
                </span>
                {b.equipped && (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold text-[#1a0d00] text-[9px] font-extrabold uppercase tracking-wide">
                    <Check className="w-3 h-3" strokeWidth={3} />
                    Équipée
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  disabled={equipping === b.itemId}
                  onClick={() => void toggleEquip(b)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                    b.equipped
                      ? 'bg-gold/15 border border-gold/40 text-gold'
                      : 'bg-bg-1 border border-border/60 text-muted-2 hover:text-text'
                  }`}
                >
                  {equipping === b.itemId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.5} />
                  ) : b.equipped ? (
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  ) : null}
                  {b.equipped ? 'Équipée' : 'Équiper'}
                </button>

                {isCustom && (
                  <button
                    type="button"
                    onClick={() => setUploadTarget(b)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-wide border border-dashed border-gold/30 text-gold/70 hover:border-gold/60 hover:text-gold transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" strokeWidth={2.5} />
                    {userImg ? 'Changer' : 'Uploader'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {uploadTarget && (
        <CustomBannerUploaderModal
          itemId={uploadTarget.itemId}
          itemName={uploadTarget.item.name}
          currentImage={typeof uploadTarget.userPayload?.image === 'string' ? uploadTarget.userPayload.image : null}
          onClose={() => setUploadTarget(null)}
          onSaved={(dataUrl) => {
            setBanners((prev) =>
              prev.map((b) => b.itemId === uploadTarget.itemId ? { ...b, userPayload: { image: dataUrl } } : b),
            );
            setUploadTarget(null);
            void refresh();
          }}
        />
      )}
    </section>
  );
}

export function InventoryPanel() {
  const { show } = useFlash();
  const { refresh, leaderboard, me } = useLeagueData();
  const [data, setData] = useState<ConsumablesResponse | null>(null);
  const [busy, setBusy] = useState<ConsumableKind | null>(null);
  // Sélecteur « Main du Destin » : null = fermé, sinon les deux logins + la
  // discipline imposée en cours de saisie.
  const [duelPicker, setDuelPicker] = useState<{ p1: string; p2: string; game: Game } | null>(null);
  // Sélecteur « Mini-OPS » : null = fermé, sinon la cible + la discipline imposée.
  const [miniPicker, setMiniPicker] = useState<{ target: string; game: Game } | null>(null);
  // Fenêtre de boost « EN FEU » en cours (décompte vivant) pour le multiplicateur d'ELO.
  const boost = useEloBoostRemaining(data?.eloMultUntil ?? null);

  const myLogin = me?.login ?? null;
  const others = useMemo(
    () => leaderboard.filter((u) => u.login !== myLogin),
    [leaderboard, myLogin],
  );

  const load = useCallback(async () => {
    try {
      setData(await api.consumables());
    } catch {
      /* silencieux : l'inventaire n'est pas critique */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const use = useCallback(
    async (kind: ConsumableKind) => {
      setBusy(kind);
      try {
        await api.useConsumable(kind);
        show(kind === 'anti_ops' ? 'OPS annulé !' : 'Tu es EN FEU ! ELO ×2 pendant 6 h.');
        await load();
        void refresh();
      } catch (err) {
        show(err instanceof Error ? err.message : 'Action impossible', 'error');
      } finally {
        setBusy(null);
      }
    },
    [show, load, refresh],
  );

  const launchDuel = useCallback(async () => {
    if (!duelPicker) return;
    const { p1, p2, game } = duelPicker;
    if (!p1 || !p2 || p1 === p2) {
      show('Choisis deux joueurs différents.', 'error');
      return;
    }
    setBusy('force_duel');
    try {
      await api.useConsumable('force_duel', { player1: p1, player2: p2, game });
      show(`Le destin a parlé : @${p1} vs @${p2} en ${GAME_META[game].label}.`);
      setDuelPicker(null);
      await load();
      void refresh();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Action impossible', 'error');
    } finally {
      setBusy(null);
    }
  }, [duelPicker, show, load, refresh]);

  const launchMini = useCallback(async () => {
    if (!miniPicker) return;
    const { target, game } = miniPicker;
    if (!target) {
      show('Choisis une cible.', 'error');
      return;
    }
    setBusy('mini_ops');
    try {
      await api.useConsumable('mini_ops', { target, game });
      show(`Mini-OPS scellé : tu affrontes @${target} en ${GAME_META[game].label}.`);
      setMiniPicker(null);
      await load();
      void refresh();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Action impossible', 'error');
    } finally {
      setBusy(null);
    }
  }, [miniPicker, show, load, refresh]);

  if (!data) return null;

  return (
    <>
    <BannersSection />
    <section>
      <SectionHeader title="Consommables" />
      <div className="space-y-2.5">
        {data.items.map((c) => {
          const meta = META[c.kind];
          const Icon = meta.Icon;
          const left = cooldownLeft(c);
          const isElo = c.kind === 'elo_mult';
          const boosted = isElo && boost.active;
          const weekTaken = isElo && data.eloMultWeekTaken;
          const empty = c.quantity < 1;
          const disabled = busy === c.kind || empty || left > 0 || boosted || weekTaken;
          return (
            <div
              key={c.kind}
              className="relative card-hud rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ borderColor: `${meta.color}33` }}
            >
              <div
                className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border"
                style={{ color: meta.color, background: `${meta.color}14`, borderColor: `${meta.color}40` }}
              >
                <Icon className="w-6 h-6" strokeWidth={2.1} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-gaming text-sm font-extrabold text-text-strong truncate">{meta.label}</span>
                  <span
                    className="shrink-0 font-mono text-[11px] font-extrabold tabular-nums px-1.5 py-0.5 rounded-md"
                    style={{ color: meta.color, background: `${meta.color}1a` }}
                  >
                    ×{c.quantity}
                  </span>
                </div>
                <p className="text-[11px] text-muted-2 leading-snug mt-0.5 line-clamp-2">{meta.desc}</p>
                <div className="text-[10px] text-muted mt-0.5 font-medium tabular-nums">
                  <span style={{ color: meta.color }} className="font-bold">
                    {Math.max(0, c.monthlyCap - c.monthlyUsed)}/{c.monthlyCap}
                  </span>{' '}
                  par mois
                  {boosted && <span className="ml-2 font-bold tabular-nums" style={{ color: meta.color }}>· EN FEU {boost.hms}</span>}
                  {!boosted && weekTaken && <span className="ml-2 text-muted font-bold">· activé cette semaine</span>}
                  {left > 0 && <span className="ml-2 text-red font-bold">· cooldown {fmtLeft(left)}</span>}
                </div>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  c.kind === 'force_duel'
                    ? setDuelPicker({ p1: '', p2: '', game: getGame() })
                    : c.kind === 'mini_ops'
                      ? setMiniPicker({ target: '', game: getGame() })
                      : void use(c.kind)
                }
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wide transition-all disabled:opacity-40 ${
                  disabled ? 'bg-bg-1 border border-border/60 text-muted' : 'text-bg-0'
                }`}
                style={disabled ? undefined : { background: meta.color }}
              >
                {busy === c.kind ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.5} />
                ) : boosted ? (
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                ) : null}
                {boosted ? 'En feu' : weekTaken ? 'Cette semaine' : 'Utiliser'}
              </button>
            </div>
          );
        })}
      </div>

      {duelPicker && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => busy !== 'force_duel' && setDuelPicker(null)}
        >
          <div
            className="w-full max-w-sm card-hud rounded-2xl p-5"
            style={{ borderColor: `${META.force_duel.color}55` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <Swords className="w-5 h-5" style={{ color: META.force_duel.color }} strokeWidth={2.2} />
              <h3 className="font-gaming text-base font-extrabold text-text-strong flex-1">Main du Destin</h3>
              <button
                type="button"
                onClick={() => setDuelPicker(null)}
                disabled={busy === 'force_duel'}
                className="text-muted hover:text-text-strong disabled:opacity-40"
              >
                <X className="w-5 h-5" strokeWidth={2.4} />
              </button>
            </div>
            <p className="text-[11px] text-muted-2 leading-snug mb-4">
              Désigne deux joueurs et la discipline : un duel inéluctable apparaîtra dans leurs défis. Ils ne pourront pas le refuser.
            </p>
            <div className="mb-3">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wide">Discipline</span>
              <div className="mt-1 grid grid-cols-5 gap-1.5">
                {GAMES.map((g) => {
                  const gm = GAME_META[g];
                  const on = duelPicker.game === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setDuelPicker((d) => (d ? { ...d, game: g } : d))}
                      title={gm.label}
                      aria-pressed={on}
                      className="flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-all"
                      style={{
                        borderColor: on ? gm.color : 'rgba(255,255,255,0.10)',
                        background: on ? gm.bgColor : 'transparent',
                        boxShadow: on ? `0 0 0 1px ${gm.color}55` : undefined,
                      }}
                    >
                      <span style={{ color: gm.color }}>{gm.icon(on, 22)}</span>
                      <span
                        className="text-[9px] font-bold leading-none truncate w-full text-center"
                        style={{ color: on ? gm.color : '#7d6e54' }}
                      >
                        {gm.shortLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-3">
              {(['p1', 'p2'] as const).map((slot, i) => (
                <label key={slot} className="block">
                  <span className="text-[11px] font-bold text-muted uppercase tracking-wide">
                    Joueur {i + 1}
                  </span>
                  <select
                    value={duelPicker[slot]}
                    onChange={(e) => setDuelPicker((d) => (d ? { ...d, [slot]: e.target.value } : d))}
                    className="mt-1 w-full rounded-lg bg-bg-1 border border-border/70 px-3 py-2 text-sm text-text-strong focus:outline-none focus:border-[--c]"
                    style={{ ['--c' as string]: META.force_duel.color }}
                  >
                    <option value="">— choisir —</option>
                    {others.map((u) => (
                      <option key={u.login} value={u.login} disabled={u.login === duelPicker[slot === 'p1' ? 'p2' : 'p1']}>
                        {u.login}
                        {u.firstName ? ` (${u.firstName})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void launchDuel()}
              disabled={busy === 'force_duel' || !duelPicker.p1 || !duelPicker.p2 || duelPicker.p1 === duelPicker.p2}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-extrabold uppercase tracking-wide text-bg-0 transition-all disabled:opacity-40"
              style={{ background: META.force_duel.color }}
            >
              {busy === 'force_duel' ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
              ) : (
                <Swords className="w-4 h-4" strokeWidth={2.4} />
              )}
              Sceller le duel
            </button>
          </div>
        </div>
      )}

      {miniPicker && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => busy !== 'mini_ops' && setMiniPicker(null)}
        >
          <div
            className="w-full max-w-sm card-hud rounded-2xl p-5"
            style={{ borderColor: `${META.mini_ops.color}55` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <Crosshair className="w-5 h-5" style={{ color: META.mini_ops.color }} strokeWidth={2.2} />
              <h3 className="font-gaming text-base font-extrabold text-text-strong flex-1">Mini-OPS</h3>
              <button
                type="button"
                onClick={() => setMiniPicker(null)}
                disabled={busy === 'mini_ops'}
                className="text-muted hover:text-text-strong disabled:opacity-40"
              >
                <X className="w-5 h-5" strokeWidth={2.4} />
              </button>
            </div>
            <p className="text-[11px] text-muted-2 leading-snug mb-4">
              Désigne ta cible et la discipline : un duel inéluctable t’opposera à elle. Elle ne pourra pas le refuser.
            </p>
            <div className="mb-3">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wide">Discipline</span>
              <div className="mt-1 grid grid-cols-5 gap-1.5">
                {GAMES.map((g) => {
                  const gm = GAME_META[g];
                  const on = miniPicker.game === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setMiniPicker((d) => (d ? { ...d, game: g } : d))}
                      title={gm.label}
                      aria-pressed={on}
                      className="flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-all"
                      style={{
                        borderColor: on ? gm.color : 'rgba(255,255,255,0.10)',
                        background: on ? gm.bgColor : 'transparent',
                        boxShadow: on ? `0 0 0 1px ${gm.color}55` : undefined,
                      }}
                    >
                      <span style={{ color: gm.color }}>{gm.icon(on, 22)}</span>
                      <span
                        className="text-[9px] font-bold leading-none truncate w-full text-center"
                        style={{ color: on ? gm.color : '#7d6e54' }}
                      >
                        {gm.shortLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="block">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wide">Cible</span>
              <select
                value={miniPicker.target}
                onChange={(e) => setMiniPicker((d) => (d ? { ...d, target: e.target.value } : d))}
                className="mt-1 w-full rounded-lg bg-bg-1 border border-border/70 px-3 py-2 text-sm text-text-strong focus:outline-none focus:border-[--c]"
                style={{ ['--c' as string]: META.mini_ops.color }}
              >
                <option value="">— choisir —</option>
                {others.map((u) => (
                  <option key={u.login} value={u.login}>
                    {u.login}
                    {u.firstName ? ` (${u.firstName})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void launchMini()}
              disabled={busy === 'mini_ops' || !miniPicker.target}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-extrabold uppercase tracking-wide text-bg-0 transition-all disabled:opacity-40"
              style={{ background: META.mini_ops.color }}
            >
              {busy === 'mini_ops' ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
              ) : (
                <Crosshair className="w-4 h-4" strokeWidth={2.4} />
              )}
              Lancer le Mini-OPS
            </button>
          </div>
        </div>
      )}
    </section>
    </>
  );
}
