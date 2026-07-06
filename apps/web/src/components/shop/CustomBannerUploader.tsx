import { useState } from 'react';
import { X, Upload, ImageIcon, ShieldCheck, Type, Laugh } from 'lucide-react';
import { api } from '../../lib/api';
import { useFlash } from '../../hooks/useFlash';
import { BannerDropzone, BANNER_W, BANNER_H, Input } from './CosmeticForm';

/**
 * Modal d'upload d'image personnalisée pour une bannière customisable.
 * S'ouvre depuis la boutique, l'inventaire ou le profil.
 * `onSaved(dataUrl, pending)` : `pending=true` si la création part en validation admin.
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
  onSaved: (dataUrl: string, pending: boolean) => void;
}) {
  const { show } = useFlash();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await api.uploadCustomBannerImage(itemId, draft);
      const pending = res?.pending === true;
      show(pending ? 'Envoyé ! Un admin doit valider ta bannière.' : 'Image sauvegardée !');
      onSaved(draft, pending);
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

          {/* Modèle d'obtention : validation admin (anti-abus). */}
          <div className="flex items-start gap-2 rounded-lg border border-sky-400/25 bg-sky-400/5 px-3 py-2">
            <ShieldCheck className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" strokeWidth={2.2} />
            <p className="text-[11px] text-sky-100/80 leading-relaxed">
              Ta bannière sera <b>relue par un admin</b> avant d’apparaître sur ton profil (anti-abus).
            </p>
          </div>

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
              {saving ? 'Sauvegarde…' : 'Envoyer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal de choix d'un titre personnalisé (item « Choisis ton titre »).
 * Texte + couleur, envoyés en validation admin. `onSaved(pending)`.
 */
export function CustomTitleChooserModal({
  itemId,
  itemName,
  currentTitle,
  currentColor,
  onClose,
  onSaved,
}: {
  itemId: string;
  itemName: string;
  currentTitle: string | null;
  currentColor: string | null;
  onClose: () => void;
  onSaved: (pending: boolean) => void;
}) {
  const { show } = useFlash();
  const [title, setTitle] = useState(currentTitle ?? '');
  const [color, setColor] = useState(currentColor ?? '#ffc94a');
  const [saving, setSaving] = useState(false);

  async function save() {
    const t = title.trim();
    if (!t) {
      show('Écris le texte de ton titre.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.submitCustomTitle(itemId, t, color);
      const pending = res?.pending === true;
      show(pending ? 'Envoyé ! Un admin doit valider ton titre.' : 'Titre enregistré !');
      onSaved(pending);
      onClose();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Erreur lors de l\'envoi', 'error');
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
        className="w-full max-w-md rounded-2xl border border-gold/30 bg-bg-1 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gold/15 border border-gold/40 flex items-center justify-center">
              <Type className="w-4 h-4 text-gold" strokeWidth={2} />
            </div>
            <div>
              <h3 className="font-gaming text-sm font-extrabold text-text-strong uppercase tracking-wide leading-none">
                Mon titre
              </h3>
              <p className="text-[10px] text-muted-2 mt-0.5">{itemName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-text-strong transition-colors p-1">
            <X className="w-4 h-4" strokeWidth={2.4} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-2 uppercase tracking-wider font-bold">Texte du titre</span>
            <Input value={title} onChange={(v) => setTitle(v.slice(0, 40))} placeholder="ex. Roi du Cluster" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-2 uppercase tracking-wider font-bold">Couleur</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-9 h-9 rounded bg-zinc-800 border border-zinc-700 cursor-pointer"
              />
              <Input value={color} onChange={setColor} placeholder="#ffc94a" className="w-28" />
            </div>
          </label>

          {/* Aperçu */}
          {title.trim() && (
            <div className="rounded-lg border border-border/60 bg-bg-0 px-3 py-2.5">
              <span className="text-[10px] text-muted-2 uppercase tracking-wider font-bold">Aperçu</span>
              <div className="mt-1 font-gaming text-lg font-extrabold" style={{ color }}>
                {title.trim()}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-sky-400/25 bg-sky-400/5 px-3 py-2">
            <ShieldCheck className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" strokeWidth={2.2} />
            <p className="text-[11px] text-sky-100/80 leading-relaxed">
              Ton titre sera <b>relu par un admin</b> avant d’apparaître (anti-abus).
            </p>
          </div>

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
              disabled={!title.trim() || saving}
              onClick={() => void save()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wide bg-gradient-to-r from-gold to-gold-dim text-bg-0 hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Upload className="w-3.5 h-3.5" strokeWidth={2.5} />
              {saving ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal de personnalisation d'une ÉMOTE DE VICTOIRE (narguage) : l'acheteur choisit
 * son emoji + sa punchline. Comme les titres/bannières perso, la création part en
 * validation admin avant d'être appliquée (anti-abus sur le texte).
 */
export function CustomWinEmoteChooserModal({
  itemId,
  itemName,
  currentEmoji,
  currentPhrase,
  onClose,
  onSaved,
}: {
  itemId: string;
  itemName: string;
  currentEmoji: string | null;
  currentPhrase: string | null;
  onClose: () => void;
  onSaved: (pending: boolean) => void;
}) {
  const { show } = useFlash();
  const [emoji, setEmoji] = useState(currentEmoji ?? '');
  const [phrase, setPhrase] = useState(currentPhrase ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    const e = emoji.trim();
    const p = phrase.trim();
    if (!e) {
      show('Choisis un emoji.', 'error');
      return;
    }
    if ([...e].length > 4) {
      show('Un seul emoji.', 'error');
      return;
    }
    if (!p) {
      show('Écris ta punchline de narguage.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.submitCustomWinEmote(itemId, e, p);
      const pending = res?.pending === true;
      show(pending ? 'Envoyé ! Un admin doit valider ton émote.' : 'Émote de victoire enregistrée !');
      onSaved(pending);
      onClose();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Erreur lors de l\'envoi', 'error');
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
        className="w-full max-w-md rounded-2xl border border-gold/30 bg-bg-1 shadow-2xl overflow-hidden"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gold/15 border border-gold/40 flex items-center justify-center">
              <Laugh className="w-4 h-4 text-gold" strokeWidth={2} />
            </div>
            <div>
              <h3 className="font-gaming text-sm font-extrabold text-text-strong uppercase tracking-wide leading-none">
                Mon émote de victoire
              </h3>
              <p className="text-[10px] text-muted-2 mt-0.5">{itemName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-text-strong transition-colors p-1">
            <X className="w-4 h-4" strokeWidth={2.4} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-[auto_1fr] gap-3 items-end">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-2 uppercase tracking-wider font-bold">Emoji</span>
              <Input value={emoji} onChange={(v) => setEmoji(v.slice(0, 8))} placeholder="🔥" className="w-20 text-center text-lg" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-2 uppercase tracking-wider font-bold">Punchline ({'{winner}'} = le vainqueur)</span>
              <Input value={phrase} onChange={(v) => setPhrase(v.slice(0, 80))} placeholder="ex. {winner} t'a réduit en cendres" />
            </label>
          </div>

          {/* Aperçu */}
          {(emoji.trim() || phrase.trim()) && (
            <div className="rounded-lg border border-border/60 bg-bg-0 px-3 py-3 flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted-2 uppercase tracking-wider font-bold self-start">Aperçu</span>
              <span className="text-3xl leading-none">{emoji.trim() || '🏆'}</span>
              <span className="italic text-sm font-bold text-gold text-center">
                {(phrase.trim() || 'Ta punchline…').replace(/\{winner\}/g, 'toi')}
              </span>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-sky-400/25 bg-sky-400/5 px-3 py-2">
            <ShieldCheck className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" strokeWidth={2.2} />
            <p className="text-[11px] text-sky-100/80 leading-relaxed">
              Ton émote sera <b>relue par un admin</b> avant d’apparaître (anti-abus).
            </p>
          </div>

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
              disabled={!emoji.trim() || !phrase.trim() || saving}
              onClick={() => void save()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wide bg-gradient-to-r from-gold to-gold-dim text-bg-0 hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Upload className="w-3.5 h-3.5" strokeWidth={2.5} />
              {saving ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
