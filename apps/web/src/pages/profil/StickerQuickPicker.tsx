import { useEffect, useState } from 'react';
import { X, Check, Loader2, Sticker as StickerIcon } from 'lucide-react';
import { api, type InventoryEntry } from '../../lib/api';
import { useFlash } from '../../hooks/useFlash';
import { useLeagueData } from '../../hooks/useLeagueData';

/**
 * Sélecteur RAPIDE de stickers, ouvert depuis le petit bouton « crayon » de la
 * carte profil. Même logique d'équipement que `StickersSection` (inventaire) —
 * un seul sticker à la fois côté serveur — mais présenté en modale pour changer
 * son autocollant sans quitter le profil.
 */
export function StickerQuickPicker({ onClose }: { onClose: () => void }) {
  const { show } = useFlash();
  const { refresh } = useLeagueData();
  const [stickers, setStickers] = useState<InventoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [equipping, setEquipping] = useState<string | null>(null);

  useEffect(() => {
    api
      .inventory()
      .then((rows) => setStickers(rows.filter((r) => r.item.category === 'sticker')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggleEquip(entry: InventoryEntry) {
    setEquipping(entry.itemId);
    try {
      await api.equipItem(entry.itemId, !entry.equipped);
      setStickers((prev) =>
        prev.map((b) => ({
          ...b,
          // Un seul sticker équipé : on active l'item touché (s'il ne l'était pas)
          // et on désactive tous les autres.
          equipped: b.itemId === entry.itemId ? !entry.equipped : false,
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
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-pink-400/30 bg-bg-1 p-4 flex flex-col gap-3 shadow-[0_20px_60px_-15px_rgba(244,114,182,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 font-gaming text-sm font-extrabold uppercase tracking-[0.14em] text-text-strong">
            <StickerIcon className="w-4 h-4 text-pink-400" strokeWidth={2.4} />
            Stickers
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-muted-2 hover:text-text-strong transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-pink-400/70" strokeWidth={2.5} />
          </div>
        ) : stickers.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-muted-2 leading-relaxed">
            Tu ne possèdes aucun sticker.
            <br />
            Rends-toi à la boutique pour en obtenir un.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {stickers.map((b) => {
              const p = b.item.payload as Record<string, unknown> | null;
              const img = typeof p?.image === 'string' ? p.image : null;
              return (
                <button
                  key={b.itemId}
                  type="button"
                  disabled={equipping === b.itemId}
                  onClick={() => void toggleEquip(b)}
                  title={b.equipped ? `${b.item.name} — équipé` : `Équiper ${b.item.name}`}
                  className="relative rounded-xl border transition-colors flex flex-col items-center gap-1.5 p-2 tap-transparent"
                  style={{
                    borderColor: b.equipped ? 'rgba(244,114,182,0.65)' : 'rgba(255,255,255,0.08)',
                    boxShadow: b.equipped ? '0 0 14px -4px rgba(244,114,182,0.5)' : undefined,
                  }}
                >
                  {img ? (
                    <img
                      src={img}
                      alt=""
                      className="w-14 h-14 object-contain drop-shadow"
                      style={{ transform: 'rotate(-8deg)' }}
                    />
                  ) : (
                    <StickerIcon className="w-10 h-10 text-white/40" strokeWidth={1.6} />
                  )}
                  <span className="font-gaming text-[10px] font-extrabold text-white/90 drop-shadow truncate max-w-full">
                    {b.item.name}
                  </span>
                  {b.equipped && (
                    <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-pink-400 flex items-center justify-center shadow">
                      <Check className="w-3 h-3 text-[#1a0410]" strokeWidth={3.5} />
                    </span>
                  )}
                  {equipping === b.itemId && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/45 rounded-xl">
                      <Loader2 className="w-4 h-4 animate-spin text-white" strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <p className="text-[10px] text-muted-2 text-center leading-snug">
          L'autocollant apparaît au survol de ta carte profil. Retape-le pour le retirer.
        </p>
      </div>
    </div>
  );
}
