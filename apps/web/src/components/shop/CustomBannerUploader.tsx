import { useState } from 'react';
import { X, Upload, ImageIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { useFlash } from '../../hooks/useFlash';
import { BannerDropzone, BANNER_W, BANNER_H } from './CosmeticForm';

/**
 * Modal d'upload d'image personnalisée pour une bannière customisable.
 * S'ouvre depuis la boutique, l'inventaire ou le profil.
 */
export function CustomBannerUploaderModal({
  itemId,
  itemName,
  currentImage,
  onClose,
  onSaved,
}: {
  itemId: string;
  itemName: string;
  currentImage: string | null;
  onClose: () => void;
  onSaved: (dataUrl: string) => void;
}) {
  const { show } = useFlash();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await api.uploadCustomBannerImage(itemId, draft);
      show('Image sauvegardée !');
      onSaved(draft);
      onClose();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Erreur lors de l\'upload', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-gold/30 bg-bg-1 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gold/15 border border-gold/40 flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-gold" strokeWidth={2} />
            </div>
            <div>
              <h3 className="font-gaming text-sm font-extrabold text-text-strong uppercase tracking-wide leading-none">
                Ma bannière
              </h3>
              <p className="text-[10px] text-muted-2 mt-0.5">{itemName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-text-strong transition-colors p-1"
          >
            <X className="w-4 h-4" strokeWidth={2.4} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Aperçu actuel si pas encore de draft */}
          {currentImage && !draft && (
            <div>
              <span className="text-[10px] text-muted-2 uppercase tracking-wider font-bold">Image actuelle</span>
              <div
                className="mt-1.5 relative w-full rounded-lg overflow-hidden border border-border/60"
                style={{ aspectRatio: `${BANNER_W} / ${BANNER_H}` }}
              >
                <img src={currentImage} alt="Bannière actuelle" className="absolute inset-0 w-full h-full object-cover" />
              </div>
            </div>
          )}

          {/* Dropzone */}
          <div>
            <span className="text-[10px] text-muted-2 uppercase tracking-wider font-bold">
              {currentImage ? 'Changer l\'image' : 'Uploader ton image'}
            </span>
            <div className="mt-1.5">
              <BannerDropzone value={draft} onChange={setDraft} />
            </div>
          </div>

          {/* Aperçu du draft */}
          {draft && (
            <div>
              <span className="text-[10px] text-muted-2 uppercase tracking-wider font-bold">Aperçu</span>
              <div
                className="mt-1.5 relative w-full rounded-lg overflow-hidden border border-gold/30"
                style={{ aspectRatio: `${BANNER_W} / ${BANNER_H}` }}
              >
                <img src={draft} alt="Aperçu" className="absolute inset-0 w-full h-full object-cover" />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wide border border-border/60 text-muted-2 hover:text-text transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={!draft || saving}
              onClick={() => void save()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wide bg-gradient-to-r from-gold to-gold-dim text-bg-0 hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Upload className="w-3.5 h-3.5" strokeWidth={2.5} />
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
