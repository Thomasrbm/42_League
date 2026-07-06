import { useCallback, useState } from 'react';
import { Type, Image as ImageIcon } from 'lucide-react';
import { Panel } from '../components/Panel';
import { useFlash } from '../hooks/useFlash';
import { api } from '../lib/api';
import {
  emptyForm,
  Input,
  BannerDropzone,
  ItemPreview,
  type FormState,
} from '../components/shop/CosmeticForm';

// ─────────────────────────────────────────────────────────────────────────────
// ProposeItemPage — un joueur normal propose un cosmétique pour la boutique.
// Restreint à TITRE ou BANNIÈRE (pas de badge/consumable). Réutilise les
// primitives du formulaire GOD (emptyForm/FormState/ItemPreview/BannerDropzone)
// mais avec un choix de catégorie limité et sans les champs réservés à l'admin
// (prix, rareté, actif…). La soumission crée une PROPOSITION relue par un admin.
// ─────────────────────────────────────────────────────────────────────────────

type ProposeCategory = 'title' | 'banner';

export function ProposeItemPage() {
  const { show } = useFlash();
  const [form, setForm] = useState<FormState>(() => ({ ...emptyForm(), category: 'banner' }));
  const [submitting, setSubmitting] = useState(false);

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  }, []);

  const category = form.category as ProposeCategory;

  async function handleSubmit() {
    const name = form.name.trim();
    if (!name) {
      show('Donne un nom à ta proposition.', 'error');
      return;
    }
    let payload: Record<string, unknown>;
    let color: string | null = null;
    if (category === 'title') {
      const title = form.titleText.trim();
      if (!title) {
        show('Écris le texte du titre.', 'error');
        return;
      }
      payload = { title };
      color = form.color || null;
    } else {
      if (!form.bannerImage) {
        show('Dépose une image de bannière.', 'error');
        return;
      }
      payload = { image: form.bannerImage };
    }

    setSubmitting(true);
    try {
      await api.submitShopProposal({ category, name, color, payload });
      show('Proposition envoyée ! Un admin va la relire.');
      setForm({ ...emptyForm(), category });
    } catch (e) {
      show(e instanceof Error ? e.message : 'Erreur lors de l’envoi.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Panel title="Proposer un item" sub="Boutique">
        <p className="text-sm text-muted mb-5 leading-relaxed">
          Imagine une bannière ou un titre pour la boutique. Les admins le relisent
          et l&apos;ajoutent s&apos;il est validé.
        </p>

        {/* Choix restreint : titre ou bannière uniquement */}
        <div className="flex gap-2 mb-5">
          {([
            { v: 'banner' as const, label: 'Bannière', Icon: ImageIcon },
            { v: 'title' as const, label: 'Titre', Icon: Type },
          ]).map(({ v, label, Icon }) => (
            <button
              key={v}
              type="button"
              onClick={() => set('category', v)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-extrabold uppercase tracking-[0.1em] transition-all border ${
                category === v
                  ? 'bg-gold/10 border-gold/30 text-gold'
                  : 'border-border/40 text-muted-2 hover:text-text'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Nom *</span>
              <Input value={form.name} onChange={(v) => set('name', v)} placeholder="ex. Pionnier" />
            </label>

            {category === 'title' && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Texte du titre *</span>
                  <Input value={form.titleText} onChange={(v) => set('titleText', v)} placeholder="ex. sans éclat." />
                </label>
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
              </>
            )}

            {category === 'banner' && (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Image de bannière *</span>
                <BannerDropzone value={form.bannerImage} onChange={(v) => set('bannerImage', v)} />
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <ItemPreview form={form} />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-extrabold uppercase tracking-[0.1em] bg-gold/15 border border-gold/40 text-gold hover:bg-gold/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? 'Envoi…' : 'Envoyer ma proposition'}
          </button>
        </div>
      </Panel>
    </div>
  );
}

export default ProposeItemPage;
