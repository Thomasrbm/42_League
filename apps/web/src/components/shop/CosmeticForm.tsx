import { useState, useCallback, useRef, useEffect } from 'react';
import { UploadCloud, Gem, Crop, X } from 'lucide-react';
import { type ShopCategory, type ShopItemData, type ShopItemInput, type ShopRarity } from '../../lib/api';
import { BADGE_ICON_NAMES, badgeIcon } from '../../lib/badgeIcons';
import { RARITY, RARITY_ORDER, rarityOf } from '../../lib/rarity';

// ─────────────────────────────────────────────────────────────────────────────
// CosmeticForm — formulaire de création/édition de cosmétique, EXTRAIT de
// ShopGODPage pour être réutilisé tel quel par la récompense de tournoi officiel
// (cosmétique custom créé inline). Mêmes champs, même aperçu, mêmes validations.
// ─────────────────────────────────────────────────────────────────────────────

// Dimensions de SORTIE d'une bannière (fond de la carte profil). Une image déposée
// qui ne fait pas pile cette taille n'est plus refusée : on ouvre un recadreur
// (zoom + déplacement) qui produit exactement BANNER_W×BANNER_H.
export const BANNER_W = 1024;
export const BANNER_H = 512;
// Cap d'octets côté client (le serveur revérifie) — évite les data-URL énormes.
export const BANNER_MAX_BYTES = 700_000;

export const CATEGORIES: ShopCategory[] = ['title', 'banner', 'badge'];

export const CATEGORY_LABEL: Record<ShopCategory, string> = {
  title: 'TITRE',
  badge: 'BADGE',
  banner: 'BANNIÈRE',
  mystery_box: 'BOÎTE MYSTÈRE',
  consumable: 'CONSOMMABLE',
};

// ── Primitives partagées (langage visuel GODPage) ───────────────────────────

export function Input({
  value,
  onChange,
  placeholder,
  className = '',
  type = 'text',
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 ${className}`}
    />
  );
}

// Petit toggle réutilisable (style GODPage SudoBar).
export function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 text-xs font-mono cursor-pointer select-none"
    >
      <span className={`relative w-9 h-5 rounded-full transition-colors ${on ? 'bg-emerald-500/70' : 'bg-zinc-700'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      {label && <span className={on ? 'text-emerald-400' : 'text-zinc-500'}>{label}</span>}
    </button>
  );
}

// ── État du formulaire (guidé, par catégorie — plus de JSON brut) ────────────

export interface FormState {
  name: string;
  description: string;
  category: ShopCategory;
  color: string; // hex #rrggbb (titres & badges)
  rarity: ShopRarity; // pilote la couleur de la carte en vitrine
  price: string;
  active: boolean;
  sortOrder: string;
  titleText: string; // catégorie title
  badgeCode: string; // catégorie badge
  badgeLabel: string; // catégorie badge
  badgeIconName: string; // catégorie badge (nom lucide)
  bannerImage: string; // catégorie banner (data-URL)
  bannerAllowUpload: boolean; // bannière personnalisable par le joueur
  consumableKind: string; // catégorie consumable ('anti_ops' | 'elo_mult')
}

export function emptyForm(): FormState {
  return {
    name: '',
    description: '',
    category: 'title',
    color: '#ffc94a',
    rarity: 'common',
    price: '0',
    active: true,
    sortOrder: '0',
    titleText: '',
    badgeCode: '',
    badgeLabel: '',
    badgeIconName: 'Crown',
    bannerImage: '',
    bannerAllowUpload: false,
    consumableKind: '',
  };
}

function asRecord(p: ShopItemData['payload']): Record<string, unknown> {
  return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
}

export function formFromItem(it: ShopItemData): FormState {
  const p = asRecord(it.payload);
  return {
    name: it.name,
    description: it.description ?? '',
    category: it.category,
    color: it.color ?? '#ffc94a',
    rarity: it.rarity ?? rarityOf(it.price),
    price: String(it.price),
    active: it.active,
    sortOrder: String(it.sortOrder),
    titleText: typeof p.title === 'string' ? p.title : '',
    badgeCode: typeof p.code === 'string' ? p.code : '',
    badgeLabel: typeof p.label === 'string' ? p.label : '',
    badgeIconName: typeof p.icon === 'string' ? p.icon : 'Crown',
    bannerImage: typeof p.image === 'string' ? p.image : '',
    bannerAllowUpload: p.allowUpload === true,
    consumableKind: typeof p.kind === 'string' ? p.kind : '',
  };
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'badge';
}

/** Construit un ShopItemInput depuis le formulaire guidé (lève une Error explicite). */
export function buildInput(f: FormState): ShopItemInput {
  const name = f.name.trim();
  if (!name) throw new Error('Le nom est obligatoire.');
  let payload: Record<string, unknown> | undefined;
  let color: string | null = null;

  switch (f.category) {
    case 'title': {
      if (!f.titleText.trim()) throw new Error('Le texte du titre est obligatoire.');
      payload = { title: f.titleText.trim() };
      color = f.color || null;
      break;
    }
    case 'badge': {
      if (!f.badgeLabel.trim()) throw new Error('Le label du badge est obligatoire.');
      payload = {
        code: f.badgeCode.trim() || slugify(f.badgeLabel),
        label: f.badgeLabel.trim(),
        icon: f.badgeIconName || 'Award',
      };
      color = f.color || null;
      break;
    }
    case 'banner': {
      if (f.bannerAllowUpload) {
        payload = { allowUpload: true };
      } else {
        if (!f.bannerImage) throw new Error('Dépose une image de bannière à la bonne taille.');
        payload = { image: f.bannerImage };
      }
      break;
    }
    case 'consumable': {
      // Le type de consommable est figé (les consommables sont seedés) — on
      // préserve simplement payload.kind pour ne pas le perdre à l'édition.
      if (
        f.consumableKind !== 'anti_ops' &&
        f.consumableKind !== 'elo_mult' &&
        f.consumableKind !== 'force_duel' &&
        f.consumableKind !== 'mini_ops'
      ) {
        throw new Error('Type de consommable invalide.');
      }
      payload = { kind: f.consumableKind };
      break;
    }
  }

  return {
    name,
    description: f.description.trim() || undefined,
    category: f.category,
    color,
    rarity: f.rarity,
    price: Number(f.price) || 0,
    active: f.active,
    sortOrder: Number(f.sortOrder) || 0,
    payload,
  };
}

// ── Recadreur bannière (zoom + déplacement → sortie BANNER_W×BANNER_H) ────────

// Cap large pour le fichier source lu en mémoire (la sortie est recompressée
// ensuite sous BANNER_MAX_BYTES). Évite de charger des fichiers démesurés.
const BANNER_SRC_MAX_BYTES = 30_000_000;

/**
 * Modal de recadrage : l'admin déplace (drag) et zoome l'image source dans un
 * cadre 2:1 ; on exporte la portion visible en JPEG BANNER_W×BANNER_H, en
 * baissant la qualité jusqu'à passer sous le cap d'octets.
 */
function BannerCropper({ src, onCancel, onConfirm }: { src: string; onCancel: () => void; onConfirm: (dataUrl: string) => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [frameW, setFrameW] = useState(0);
  const [zoom, setZoom] = useState(1); // multiplicateur au-dessus du scale "cover"
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // px affichés (coin haut-gauche image vs cadre)
  const [err, setErr] = useState('');

  // Mesure la largeur réelle du cadre (l'aspect-ratio fixe la hauteur).
  useEffect(() => {
    const measure = () => setFrameW(frameRef.current?.clientWidth ?? 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Charge l'image source pour connaître sa taille naturelle.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgElRef.current = img;
      setNat({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => setErr('Image illisible.');
    img.src = src;
  }, [src]);

  const frameH = frameW / 2; // cadre 2:1
  const baseScale = nat && frameW ? Math.max(frameW / nat.w, frameH / nat.h) : 1; // "cover"
  const scale = baseScale * zoom;
  const dispW = nat ? nat.w * scale : 0;
  const dispH = nat ? nat.h * scale : 0;

  // Contraint l'offset pour que l'image couvre toujours tout le cadre.
  const clamp = useCallback(
    (o: { x: number; y: number }) => ({
      x: Math.min(0, Math.max(frameW - dispW, o.x)),
      y: Math.min(0, Math.max(frameH - dispH, o.y)),
    }),
    [frameW, frameH, dispW, dispH],
  );

  // Recentre à l'ouverture / au resize (réinitialise aussi le zoom).
  useEffect(() => {
    if (!nat || !frameW) return;
    const bs = Math.max(frameW / nat.w, frameH / nat.h);
    setOffset({ x: (frameW - nat.w * bs) / 2, y: (frameH - nat.h * bs) / 2 });
    setZoom(1);
  }, [nat, frameW, frameH]);

  // Reclamp dès que le zoom change (l'image grandit/rétrécit).
  useEffect(() => {
    setOffset((o) => clamp(o));
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset(clamp({ x: d.ox + (e.clientX - d.px), y: d.oy + (e.clientY - d.py) }));
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const handleConfirm = () => {
    const img = imgElRef.current;
    if (!img || !nat || !frameW) return;
    const canvas = document.createElement('canvas');
    canvas.width = BANNER_W;
    canvas.height = BANNER_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setErr('Canvas indisponible.');
      return;
    }
    const k = BANNER_W / frameW; // px cadre → px canvas
    ctx.drawImage(img, offset.x * k, offset.y * k, dispW * k, dispH * k);
    // Export sous le cap d'octets : JPEG à qualité dégressive.
    let q = 0.92;
    let out = canvas.toDataURL('image/jpeg', q);
    while (out.length > BANNER_MAX_BYTES && q > 0.4) {
      q -= 0.12;
      out = canvas.toDataURL('image/jpeg', q);
    }
    if (out.length > BANNER_MAX_BYTES) {
      setErr('Image trop lourde même après compression — réduis le zoom ou choisis une autre image.');
      return;
    }
    onConfirm(out);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-widest text-zinc-300">Recadrer la bannière</span>
          <button type="button" onClick={onCancel} className="text-zinc-500 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 select-none touch-none cursor-grab active:cursor-grabbing"
          style={{ aspectRatio: `${BANNER_W} / ${BANNER_H}` }}
        >
          {nat && (
            <img
              src={src}
              alt=""
              draggable={false}
              style={{ position: 'absolute', left: offset.x, top: offset.y, width: dispW, height: dispH, maxWidth: 'none' }}
            />
          )}
        </div>

        <label className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          Zoom
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-violet-400"
          />
        </label>

        <span className="text-[10px] text-zinc-600 font-mono">
          Glisse pour déplacer, le curseur pour zoomer. Sortie {BANNER_W}×{BANNER_H}px.
        </span>
        {err && <div className="text-xs text-red-400 font-mono">{err}</div>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 border border-zinc-700"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded px-3 py-1.5 text-xs font-mono text-white bg-violet-600 hover:bg-violet-500"
          >
            Valider le recadrage
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dropzone bannière (recadrage si la taille ne tombe pas pile) ──────────────

export function BannerDropzone({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [cropSrc, setCropSrc] = useState(''); // source en cours de recadrage (ouvre le modal)
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      setError('');
      if (!file.type.startsWith('image/')) {
        setError('Fichier non-image refusé.');
        return;
      }
      if (file.size > BANNER_SRC_MAX_BYTES) {
        setError(`Fichier trop lourd (max ~${Math.round(BANNER_SRC_MAX_BYTES / 1_000_000)} Mo).`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        const img = new Image();
        img.onload = () => {
          // Taille pile bonne ET pas trop lourde → on garde l'image telle quelle.
          if (img.naturalWidth === BANNER_W && img.naturalHeight === BANNER_H && dataUrl.length <= BANNER_MAX_BYTES) {
            onChange(dataUrl);
            return;
          }
          // Sinon (trop grande, mauvais ratio, trop lourde) → recadrage.
          setCropSrc(dataUrl);
        };
        img.onerror = () => setError('Image illisible.');
        img.src = dataUrl;
      };
      reader.onerror = () => setError('Lecture du fichier impossible.');
      reader.readAsDataURL(file);
    },
    [onChange],
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 cursor-pointer transition-colors ${
          dragging ? 'border-violet-400 bg-violet-400/10' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800/40'
        }`}
      >
        <UploadCloud className="w-6 h-6 text-zinc-400" />
        <span className="text-xs text-zinc-400 font-mono text-center">
          Glisse une image (toute taille) ou clique pour choisir
        </span>
        <span className="text-[10px] text-zinc-600 font-mono">
          Si elle ne fait pas {BANNER_W}×{BANNER_H}px, tu pourras la recadrer.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {error && <div className="text-xs text-red-400 font-mono">{error}</div>}
      {value && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-emerald-400 font-mono">✓ Image prête ({BANNER_W}×{BANNER_H}).</span>
          <button
            type="button"
            onClick={() => setCropSrc(value)}
            className="inline-flex items-center gap-1 text-[10px] font-mono text-violet-300 hover:text-violet-200"
          >
            <Crop className="w-3 h-3" />
            Recadrer
          </button>
        </div>
      )}
      {cropSrc && (
        <BannerCropper
          src={cropSrc}
          onCancel={() => setCropSrc('')}
          onConfirm={(dataUrl) => {
            onChange(dataUrl);
            setCropSrc('');
          }}
        />
      )}
    </div>
  );
}

// ── Aperçu live de l'objet en cours d'édition ────────────────────────────────

export function ItemPreview({ form }: { form: FormState }) {
  const Icon = badgeIcon(form.badgeIconName);
  const color = form.color || '#ffc94a';
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 flex flex-col items-center justify-center gap-2 min-h-[120px]">
      <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest self-start">Aperçu</span>
      {form.category === 'title' && (
        <span className="inline-flex items-center gap-1.5">
          <span style={{ color }} className="opacity-70 text-base leading-none">❝</span>
          <span style={{ color }} className="italic text-base font-bold tracking-wide">
            {form.titleText || 'Titre…'}
          </span>
          <span style={{ color }} className="opacity-70 text-base leading-none">❞</span>
        </span>
      )}
      {form.category === 'badge' && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border"
          style={{
            color,
            borderColor: `${color}55`,
            background: `linear-gradient(110deg, ${color}14 0%, ${color}33 45%, ${color}14 70%)`,
          }}
        >
          <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
          {form.badgeLabel || 'Badge…'}
        </span>
      )}
      {form.category === 'banner' &&
        (form.bannerImage ? (
          <div
            className="w-full rounded-lg border border-zinc-700"
            style={{
              aspectRatio: `${BANNER_W} / ${BANNER_H}`,
              backgroundImage: `url(${form.bannerImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ) : form.bannerAllowUpload ? (
          <div className="w-full rounded-lg border border-dashed border-violet-500/40 flex items-center justify-center py-4" style={{ aspectRatio: `${BANNER_W} / ${BANNER_H}` }}>
            <span className="text-[10px] text-violet-400 font-mono text-center px-2">Le joueur uploadera sa propre image</span>
          </div>
        ) : (
          <span className="text-xs text-zinc-600 font-mono">Dépose une image pour l'aperçu.</span>
        ))}
    </div>
  );
}

// Champs partagés du formulaire (création & édition) — guidés par catégorie.
export function ItemFormFields({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) {
  const showColor = form.category === 'title' || form.category === 'badge';
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Nom *</span>
          <Input value={form.name} onChange={(v) => set('name', v)} placeholder="ex. Pionnier" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Catégorie</span>
          {CATEGORIES.includes(form.category) ? (
            <select
              value={form.category}
              onChange={(e) => set('category', e.target.value as ShopCategory)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          ) : (
            // Catégorie non créable (consommable / boîte mystère) : verrouillée en
            // édition pour ne pas casser le type — seuls prix, rareté, etc. changent.
            <div className="bg-zinc-800/60 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-400">
              {CATEGORY_LABEL[form.category]}
              {form.category === 'consumable' && form.consumableKind && (
                <span className="ml-2 text-teal-400">· {form.consumableKind === 'anti_ops' ? 'Anti-OPS' : form.consumableKind === 'force_duel' ? 'Main du Destin' : form.consumableKind === 'mini_ops' ? 'Mini-OPS' : 'x2 ELO'}</span>
              )}
            </div>
          )}
        </label>

        {/* Champs spécifiques à la catégorie */}
        {form.category === 'title' && (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Texte du titre *</span>
            <Input value={form.titleText} onChange={(v) => set('titleText', v)} placeholder="ex. sans éclat." />
          </label>
        )}
        {form.category === 'badge' && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Label du badge *</span>
              <Input value={form.badgeLabel} onChange={(v) => set('badgeLabel', v)} placeholder="ex. Légende" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Icône</span>
              <select
                value={form.badgeIconName}
                onChange={(e) => set('badgeIconName', e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-zinc-500"
              >
                {BADGE_ICON_NAMES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Code (optionnel — auto depuis le label)</span>
              <Input value={form.badgeCode} onChange={(v) => set('badgeCode', v)} placeholder="ex. legend" />
            </label>
          </>
        )}
        {form.category === 'banner' && (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Image de bannière *</span>
              <Toggle
                on={form.bannerAllowUpload}
                onToggle={() => set('bannerAllowUpload', !form.bannerAllowUpload)}
                label="Personnalisable par le joueur"
              />
            </div>
            {form.bannerAllowUpload ? (
              <div className="rounded-lg border border-dashed border-violet-500/40 bg-violet-500/5 px-4 py-3 text-[11px] text-violet-300 font-mono">
                Le joueur pourra uploader sa propre image depuis la boutique, son inventaire ou son profil.
              </div>
            ) : (
              <BannerDropzone value={form.bannerImage} onChange={(v) => set('bannerImage', v)} />
            )}
          </div>
        )}

        {showColor && (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Couleur</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.color}
                onChange={(e) => set('color', e.target.value)}
                className="w-9 h-9 rounded bg-zinc-800 border border-zinc-700 cursor-pointer"
              />
              <Input value={form.color} onChange={(v) => set('color', v)} placeholder="#ffc94a" className="w-28" />
            </div>
          </label>
        )}

        {/* Rareté — détermine la couleur de la carte en vitrine (Shop). */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Rareté</span>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded border"
              style={{ color: RARITY[form.rarity].hex, borderColor: `${RARITY[form.rarity].hex}66`, background: `${RARITY[form.rarity].hex}18` }}
            >
              <Gem className="w-4 h-4" strokeWidth={2.4} />
            </span>
            <select
              value={form.rarity}
              onChange={(e) => set('rarity', e.target.value as ShopRarity)}
              className="flex-1 bg-zinc-800 border rounded px-3 py-1.5 text-sm font-mono focus:outline-none"
              style={{ color: RARITY[form.rarity].hex, borderColor: `${RARITY[form.rarity].hex}55` }}
            >
              {RARITY_ORDER.map((r) => (
                <option key={r} value={r} className="text-zinc-100 bg-zinc-800">{RARITY[r].label}</option>
              ))}
            </select>
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Prix (League Coins)</span>
          <Input type="number" value={form.price} onChange={(v) => set('price', v)} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Description</span>
          <Input value={form.description} onChange={(v) => set('description', v)} placeholder="Optionnelle" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Ordre d'affichage</span>
          <Input type="number" value={form.sortOrder} onChange={(v) => set('sortOrder', v)} />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Actif</span>
          <div className="h-[34px] flex items-center">
            <Toggle on={form.active} onToggle={() => set('active', !form.active)} label={form.active ? 'Visible' : 'Masqué'} />
          </div>
        </div>
      </div>

      <div className="lg:col-span-1">
        <ItemPreview form={form} />
      </div>
    </div>
  );
}
