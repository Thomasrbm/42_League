import { useCallback, useState } from 'react';
import { Type, Image as ImageIcon, BadgeCheck, Coins, Zap, Gift, Laugh } from 'lucide-react';
import { Panel } from '../components/Panel';
import { useFlash } from '../hooks/useFlash';
import { api, type ProposalRewardKind } from '../lib/api';
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

type ProposeCategory = 'title' | 'banner' | 'win_emote';

// Récompenses proposables par le créateur si son cosmétique est retenu.
const REWARD_OPTIONS: { v: ProposalRewardKind; label: string; Icon: typeof Gift; hasAmount: boolean }[] = [
  { v: 'credit', label: 'Mon nom dessus', Icon: BadgeCheck, hasAmount: false },
  { v: 'coins', label: 'Des coins', Icon: Coins, hasAmount: true },
  { v: 'xp', label: 'De l’XP', Icon: Zap, hasAmount: true },
  { v: 'none', label: 'Rien', Icon: Gift, hasAmount: false },
];

export function ProposeItemPage() {
  const { show } = useFlash();
  const [form, setForm] = useState<FormState>(() => ({ ...emptyForm(), category: 'banner' }));
  const [submitting, setSubmitting] = useState(false);
  // Récompense souhaitée par le créateur (l'admin reste libre de l'ajuster).
  const [rewardKind, setRewardKind] = useState<ProposalRewardKind>('credit');
  const [rewardAmount, setRewardAmount] = useState('');

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  }, []);

  const category = form.category as ProposeCategory;
  const rewardHasAmount = REWARD_OPTIONS.find((r) => r.v === rewardKind)?.hasAmount ?? false;

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
    } else if (category === 'win_emote') {
      const emoji = form.winEmoteGlyph.trim();
      const phrase = form.winEmotePhrase.trim();
      if (!emoji) {
        show('Choisis un emoji pour ton émote de victoire.', 'error');
        return;
      }
      if ([...emoji].length > 4) {
        show('Un seul emoji.', 'error');
        return;
      }
      if (!phrase) {
        show('Écris la punchline de narguage.', 'error');
        return;
      }
      payload = { emoji, phrase };
      color = form.color || null;
    } else {
      if (!form.bannerImage) {
        show('Dépose une image de bannière.', 'error');
        return;
      }
      payload = { image: form.bannerImage };
    }

    const amount = rewardHasAmount ? Math.max(0, Math.round(Number(rewardAmount) || 0)) : null;
    if (rewardHasAmount && (!amount || amount <= 0)) {
      show('Indique le montant que tu souhaites.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await api.submitShopProposal({ category, name, color, payload, rewardKind, rewardAmount: amount });
      show('Proposition envoyée ! Un admin va la relire.');
      setForm({ ...emptyForm(), category });
      setRewardKind('credit');
      setRewardAmount('');
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
          Imagine une bannière, un titre ou une émote de victoire pour la boutique.
          Les admins le relisent et l&apos;ajoutent s&apos;il est validé.
        </p>

        {/* Choix restreint : titre, bannière ou émote de victoire */}
        <div className="flex gap-2 mb-5">
          {([
            { v: 'banner' as const, label: 'Bannière', Icon: ImageIcon },
            { v: 'title' as const, label: 'Titre', Icon: Type },
            { v: 'win_emote' as const, label: 'Émote victoire', Icon: Laugh },
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

            {category === 'win_emote' && (
              <>
                <div className="grid grid-cols-[auto_1fr] gap-3 items-end">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Emoji *</span>
                    <Input value={form.winEmoteGlyph} onChange={(v) => set('winEmoteGlyph', v)} placeholder="🔥" className="w-20 text-center text-lg" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Punchline * ({'{winner}'} = le vainqueur)</span>
                    <Input value={form.winEmotePhrase} onChange={(v) => set('winEmotePhrase', v)} placeholder="ex. {winner} t'a réduit en cendres" />
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Couleur de la punchline</span>
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

        {/* Récompense souhaitée par le créateur (choix multiple + montant). */}
        <div className="mt-6 pt-5 border-t border-border/40">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
            Ce que je veux si c’est validé
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
            {REWARD_OPTIONS.map(({ v, label, Icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => setRewardKind(v)}
                className={`inline-flex flex-col items-center justify-center gap-1 px-2 py-2.5 rounded-lg text-[11px] font-extrabold uppercase tracking-[0.06em] transition-all border ${
                  rewardKind === v
                    ? 'bg-gold/10 border-gold/30 text-gold'
                    : 'border-border/40 text-muted-2 hover:text-text'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={2.5} />
                <span className="text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
          {rewardHasAmount && (
            <label className="flex flex-col gap-1 mt-3 max-w-[200px]">
              <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
                Montant en {rewardKind === 'coins' ? 'coins' : 'XP'}
              </span>
              <Input
                value={rewardAmount}
                onChange={(v) => setRewardAmount(v.replace(/[^0-9]/g, ''))}
                placeholder="ex. 500"
              />
            </label>
          )}
          <p className="text-[11px] text-muted-2 mt-2 leading-relaxed">
            L’admin reste libre d’ajuster ou de refuser cette récompense au moment de valider.
          </p>
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
