import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Pencil, Check, X, Upload } from 'lucide-react';
import { api, type InventoryEntry } from '../lib/api';
import { useLeagueData } from '../hooks/useLeagueData';
import { CustomBannerUploaderModal } from './shop/CustomBannerUploader';

/**
 * Petit crayon (profil perso) pour choisir/retirer sa BANNIÈRE (fond de la carte
 * profil) parmi celles POSSÉDÉES (achetées en boutique). Les bannières ne sont pas
 * créées ici — seulement appliquées. Un seul équipé par catégorie (géré serveur).
 */
export function BannerPicker({ className }: { className?: string }) {
  const { refresh } = useLeagueData();
  const [open, setOpen] = useState(false);
  const [banners, setBanners] = useState<InventoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<InventoryEntry | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Charge l'inventaire à l'ouverture (bannières uniquement).
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .inventory()
      .then((rows) => setBanners(rows.filter((r) => r.item.category === 'banner')))
      .catch(() => setBanners([]))
      .finally(() => setLoading(false));
  }, [open]);

  // Fermeture au clic extérieur / Échap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function applyBanner(entry: InventoryEntry | null) {
    setSaving(true);
    try {
      if (entry) {
        await api.equipItem(entry.itemId, true);
      } else {
        // Retirer : déséquipe la bannière actuellement équipée.
        const current = banners.find((b) => b.equipped);
        if (current) await api.equipItem(current.itemId, false);
      }
      await refresh();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function isCustomBanner(entry: InventoryEntry): boolean {
    const p = entry.item.payload;
    return p !== null && typeof p === 'object' && !Array.isArray(p) && (p as Record<string, unknown>).allowUpload === true;
  }

  function getUserImage(entry: InventoryEntry): string | null {
    return typeof entry.userPayload?.image === 'string' ? entry.userPayload.image : null;
  }

  return (
    <div ref={rootRef} className={`inline-block ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        aria-label="Choisir ta bannière"
        className="inline-flex items-center justify-center rounded-full border border-gold/40 bg-bg-1/60 p-1 text-gold transition hover:border-gold/70 hover:bg-bg-1/80 disabled:opacity-50"
      >
        <Pencil className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-xl border border-gold/30 shadow-2xl"
            style={{ background: 'linear-gradient(180deg, #1b1d26 0%, #14151c 100%)' }}
          >
            <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider font-bold text-muted-2 border-b border-border/40">
              Ta bannière
            </div>
            <div className="max-h-64 overflow-y-auto p-2 space-y-2">
              {/* Option « aucune » */}
              <button
                type="button"
                onClick={() => void applyBanner(null)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-muted-2 italic hover:bg-gold/10"
              >
                <X className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.5} />
                Aucune (retirer)
              </button>

              {loading ? (
                <div className="px-2 py-2 text-[11px] text-muted-2 font-mono">Chargement…</div>
              ) : banners.length === 0 ? (
                <div className="px-2 py-2 text-[11px] text-muted-2">
                  Aucune bannière possédée — achète-en dans la boutique.
                </div>
              ) : (
                banners.map((b) => {
                  const custom = isCustomBanner(b);
                  const userImg = getUserImage(b);
                  const itemImg =
                    b.item.payload && typeof b.item.payload === 'object' && !Array.isArray(b.item.payload)
                      ? (b.item.payload as Record<string, unknown>).image
                      : undefined;
                  const displayImg = userImg ?? (typeof itemImg === 'string' ? itemImg : null);
                  return (
                    <div key={b.itemId} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => void applyBanner(b)}
                        className="relative block w-full overflow-hidden rounded-lg border border-border hover:border-gold/60 transition-colors"
                        style={{ aspectRatio: '1024 / 512' }}
                      >
                        {displayImg ? (
                          <img src={displayImg} alt={b.item.name} className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-2 italic">
                            Aucune image
                          </span>
                        )}
                        <span className="absolute inset-0 bg-black/30" />
                        <span className="absolute bottom-1 left-1.5 text-[10px] font-bold text-white drop-shadow">
                          {b.item.name}
                        </span>
                        {b.equipped && (
                          <span className="absolute top-1 right-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold text-[#1a0d00]">
                            <Check className="w-3.5 h-3.5" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                      {custom && (
                        <button
                          type="button"
                          onClick={() => setUploading(b)}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gold/30 py-1 text-[10px] font-bold text-gold/70 hover:border-gold/60 hover:text-gold transition-colors"
                        >
                          <Upload className="w-3 h-3" strokeWidth={2.5} />
                          {userImg ? 'Changer mon image' : 'Uploader mon image'}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {uploading && (
        <CustomBannerUploaderModal
          itemId={uploading.itemId}
          itemName={uploading.item.name}
          currentImage={getUserImage(uploading)}
          onClose={() => setUploading(null)}
          onSaved={(dataUrl) => {
            setBanners((prev) =>
              prev.map((b) =>
                b.itemId === uploading.itemId ? { ...b, userPayload: { image: dataUrl } } : b,
              ),
            );
            void refresh();
          }}
        />
      )}
    </div>
  );
}
