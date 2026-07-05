import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { useLeagueData } from '../hooks/useLeagueData';
import { useFlash } from '../hooks/useFlash';
import { useT } from '../lib/i18n';
import { TAUNT_EMOTES, tauntEmoteUnlockLevel } from '../lib/tauntEmotes';

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
  const [localEmote, setLocalEmote] = useState<string | null>(null);
  const current = localEmote ?? me?.user?.tauntEmote ?? TAUNT_EMOTES[0];

  async function save(emote: string) {
    setLocalEmote(emote);
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
      <div className={`grid ${compact ? 'grid-cols-5' : 'grid-cols-5 sm:grid-cols-10'} gap-2`}>
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
    </div>
  );
}
