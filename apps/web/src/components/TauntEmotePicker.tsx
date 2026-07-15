import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Zap, Ban, HelpCircle } from 'lucide-react';
import { api, type TauntEmotesData } from '../lib/api';
import { useLeagueData } from '../hooks/useLeagueData';
import { useFlash } from '../hooks/useFlash';
import { useT } from '../lib/i18n';
import { TAUNT_EMOTES, tauntEmoteUnlockLevel } from '../lib/tauntEmotes';
import { TauntEmotePreview } from './TauntEmotePreview';

/**
 * Sélecteur d'émote de victoire (narguage post-1v1), avec l'économie du passe :
 * la première est le défaut, deux autres sont gratuites, le reste se débloque
 * tous les 7 niveaux du passe de combat. Utilisé dans Réglages ET dans le
 * Profil (le choix doit être visible sans fouiller les réglages).
 */
export function TauntEmotePicker({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const flash = useFlash();
  const { me, refresh } = useLeagueData();

  const level = me?.level ?? 1;
  // localEmote : null = pas encore touché ; '' = « aucune » choisie ; sinon l'émote.
  const [localEmote, setLocalEmote] = useState<string | null>(null);
  // Émote dont on joue l'aperçu animé (déclenché à la sélection).
  const [preview, setPreview] = useState<string | null>(null);
  const current = localEmote ?? me?.user?.tauntEmote ?? TAUNT_EMOTES[0];
  const noneSelected = current === '';

  // Émotes SECRÈTES (easter eggs) — état de déblocage calculé serveur. La condition
  // reste cachée tant que verrouillée : tuile « ? », emoji non révélé.
  const [eggs, setEggs] = useState<TauntEmotesData['eggs']>([]);
  useEffect(() => {
    let alive = true;
    api.tauntEmotes().then((d) => { if (alive) setEggs(d.eggs); }).catch(() => {});
    return () => { alive = false; };
  }, [me?.user?.tauntEmote]);

  async function save(emote: string) {
    setLocalEmote(emote);
    // Rejoue l'aperçu même si on re-sélectionne la même émote — sauf « aucune ».
    setPreview(null);
    if (emote) requestAnimationFrame(() => setPreview(emote));
    try {
      await api.setTauntEmote(emote);
      flash.show(t('settings.tauntEmote.saved'));
      void refresh();
    } catch {
      setLocalEmote(null);
      flash.show(t('settings.tauntEmote.error'));
    }
  }

  return (
    <div>
      <TauntEmotePreview emote={preview} onDone={() => setPreview(null)} />
      {/* Liste scrollable : borne la hauteur pour rester compacte même avec beaucoup d'émotes. */}
      <div className={`grid ${compact ? 'grid-cols-5' : 'grid-cols-5 sm:grid-cols-10'} gap-2 max-h-56 overflow-y-auto pe-1`}>
        {/* « Aucune » — le joueur ne nargue pas quand il gagne. */}
        <button
          type="button"
          onClick={() => save('')}
          aria-pressed={noneSelected}
          title="Ne rien montrer quand tu gagnes"
          className={`relative aspect-square rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-all ${
            noneSelected
              ? 'border-gold bg-gold/15 shadow-gold-glow scale-105'
              : 'border-border bg-bg-1/70 hover:border-gold/50 hover:bg-bg-2'
          }`}
        >
          <Ban className="w-5 h-5 text-muted-2" strokeWidth={2.2} />
          <span className="text-[8px] font-extrabold uppercase tracking-wide text-muted-2">Aucune</span>
        </button>
        {TAUNT_EMOTES.map((e) => {
          const required = tauntEmoteUnlockLevel(e);
          const unlocked = level >= required;
          const selected = current === e;
          return (
            <button
              key={e}
              type="button"
              disabled={!unlocked}
              onClick={() => unlocked && save(e)}
              title={unlocked ? undefined : `Se débloque au niveau ${required} du passe`}
              aria-pressed={selected}
              className={`relative aspect-square rounded-xl border text-2xl flex items-center justify-center transition-all ${
                selected
                  ? 'border-gold bg-gold/15 shadow-gold-glow scale-105'
                  : unlocked
                    ? 'border-border bg-bg-1/70 hover:border-gold/50 hover:bg-bg-2'
                    : 'border-border/50 bg-bg-0/60 cursor-not-allowed'
              }`}
            >
              <span className={unlocked ? '' : 'opacity-35 grayscale'}>{e}</span>
              {!unlocked && (
                <span className="absolute inset-x-0 bottom-1 flex items-center justify-center gap-0.5 text-[8.5px] font-extrabold text-muted-2 uppercase tracking-wide">
                  <Lock className="w-2.5 h-2.5" strokeWidth={2.6} />
                  {required}
                </span>
              )}
            </button>
          );
        })}
        {/* Émotes SECRÈTES : verrouillées = « ? » (ni emoji ni condition révélés) ;
            débloquées = emoji sélectionnable, avec le haut-fait en info-bulle. */}
        {eggs.map((egg) => {
          const selected = egg.unlocked && current === egg.emote;
          return (
            <button
              key={egg.id}
              type="button"
              disabled={!egg.unlocked}
              onClick={() => egg.unlocked && egg.emote && save(egg.emote)}
              title={egg.unlocked ? `Émote secrète débloquée — ${egg.hint ?? ''}` : 'Émote secrète — à toi de trouver comment la débloquer'}
              aria-pressed={selected}
              className={`relative aspect-square rounded-xl border text-2xl flex items-center justify-center transition-all ${
                selected
                  ? 'border-gold bg-gold/15 shadow-gold-glow scale-105'
                  : egg.unlocked
                    ? 'border-violet-400/60 bg-violet-500/10 hover:border-violet-300 hover:bg-violet-500/20'
                    : 'border-border/50 bg-bg-0/60 cursor-not-allowed'
              }`}
            >
              {egg.unlocked ? (
                <span>{egg.emote}</span>
              ) : (
                <HelpCircle className="w-6 h-6 text-muted-2/70" strokeWidth={2.2} />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-2 leading-snug flex items-center gap-1.5 flex-wrap">
        <Zap className="w-3 h-3 text-gold shrink-0" strokeWidth={2.4} />
        <span>
          3 émotes gratuites — les autres se débloquent{' '}
          <Link to="/passe" className="text-gold font-bold hover:underline">
            avec le passe de combat
          </Link>{' '}
          (une tous les 7 niveaux). Tu es niveau <span className="font-bold text-text">{level}</span>.
        </span>
      </p>
      {eggs.some((e) => !e.unlocked) && (
        <p className="mt-1 text-[11px] text-violet-300/80 leading-snug flex items-center gap-1.5">
          <HelpCircle className="w-3 h-3 shrink-0" strokeWidth={2.4} />
          <span>Des émotes <span className="font-bold">secrètes</span> se débloquent en jouant… à toi de trouver comment.</span>
        </p>
      )}
    </div>
  );
}
