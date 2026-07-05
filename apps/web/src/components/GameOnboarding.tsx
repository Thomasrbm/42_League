import { useCallback, useState } from 'react';
import { Check, X } from 'lucide-react';
import { api, type Game } from '../lib/api';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useLeagueData } from '../hooks/useLeagueData';
import { useFlash } from '../hooks/useFlash';
import { setGame as setActiveGame } from '../lib/gameMode';
import { TournamentCup } from './TournamentCup';
import { SmashTrophy } from './SmashTrophy';
import { ChessTrophy } from './ChessTrophy';
import { Button } from './Button';
import { useT } from '../lib/i18n';

// Le nom est un nom propre (marque) → non traduit ; la tagline est une clé i18n
// résolue au rendu (les constantes module n'ont pas accès à `t`).
const GAMES: { id: Game; name: string; taglineKey: string }[] = [
  { id: 'babyfoot', name: 'Babyfoot', taglineKey: 'onboarding.tagline.babyfoot' },
  { id: 'smash', name: 'Smash Bros', taglineKey: 'onboarding.tagline.smash' },
  { id: 'chess', name: 'Échecs', taglineKey: 'onboarding.tagline.chess' },
  { id: 'streetfighter', name: 'Street Fighter', taglineKey: 'onboarding.tagline.streetfighter' },
  { id: 'flechettes', name: 'Fléchettes', taglineKey: 'onboarding.tagline.flechettes' },
];

function GameTrophy({ game, accent, className }: { game: Game; accent: string; className?: string }) {
  if (game === 'smash' || game === 'streetfighter') return <SmashTrophy accent={accent} className={className} />;
  if (game === 'chess') return <ChessTrophy accent={accent} className={className} />;
  return <TournamentCup accent={accent} className={className} />;
}

const ACCENT: Record<Game, string> = { babyfoot: '#ffc94a', smash: '#ff4d5c', chess: '#56c46e', streetfighter: '#ff7a18', flechettes: '#14b8a6' };

/** Grosse croix rouge en haut à droite de la modale : skip pour qui s'en fiche. */
function CloseX({
  onClick,
  disabled,
  t,
}: {
  onClick: () => void;
  disabled: boolean;
  t: (key: string) => string;
}) {
  return (
    <button
      type="button"
      aria-label={t('onboarding.skip.aria')}
      title={t('onboarding.skip.title')}
      onClick={onClick}
      disabled={disabled}
      className="absolute -top-3 -right-3 z-10 grid place-items-center w-10 h-10 rounded-full bg-red text-white shadow-lg shadow-red/40 ring-2 ring-bg-1 hover:brightness-110 active:scale-90 transition-transform disabled:opacity-50"
    >
      <X className="w-5 h-5" strokeWidth={3} />
    </button>
  );
}

/**
 * Onboarding au 1er login : choix des modes de jeu auxquels on adhère. On
 * n'apparaît dans les classements/stats que des modes choisis. Affiché tant que
 * `onboardedAt` est nul.
 */
export function GameOnboarding() {
  const { me, refresh } = useLeagueData();
  const flash = useFlash();
  const t = useT();
  const [sel, setSel] = useState<Set<Game>>(new Set<Game>(['babyfoot']));
  const [busy, setBusy] = useState(false);

  // Échap = même fermeture que la croix rouge (skip de l'onboarding). Appelé
  // avant tout return anticipé (règles des hooks) ; la modale n'est montée que
  // si elle est visible → active = true. Le wrapper useCallback diffère l'appel
  // à `skipOnboarding` (défini plus bas), évitant la zone morte temporelle.
  const onEscape = useCallback(() => {
    void skipOnboarding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEscapeKey(true, onEscape);

  // Affiché uniquement si le compte existe et n'a pas encore choisi ses modes.
  if (!me?.user || me.user.onboardedAt) return null;

  const toggle = (g: Game) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  // Enregistre les modes (pose onboardedAt) puis refresh → fermeture. Le choix
  // des persos favoris (Smash/SF) ne se fait plus ici : il reste disponible sur
  // la page profil.
  const submit = async () => {
    const games = [...sel];
    if (games.length === 0) {
      flash.show(t('onboarding.pickAtLeastOne'), 'error');
      return;
    }
    setBusy(true);
    try {
      await api.setGames(games);
      // Bascule sur le 1er mode choisi (ordre babyfoot → smash → échecs).
      const order: Game[] = ['babyfoot', 'smash', 'chess', 'streetfighter', 'flechettes'];
      const first = order.find((g) => sel.has(g));
      if (first) setActiveGame(first);
      await refresh();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  // Skip total (croix rouge en haut à droite) : pour ceux que l'onboarding
  // n'intéresse pas. On les inscrit à leur sélection courante (ou babyfoot par
  // défaut si rien), on pose onboardedAt et on ferme — sinon la modale reviendrait.
  const skipOnboarding = async () => {
    setBusy(true);
    try {
      const games: Game[] = sel.size > 0 ? [...sel] : ['babyfoot'];
      await api.setGames(games);
      const order: Game[] = ['babyfoot', 'smash', 'chess', 'streetfighter', 'flechettes'];
      const first = order.find((g) => games.includes(g)) ?? 'babyfoot';
      setActiveGame(first);
      await refresh();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-black/80 backdrop-blur-md">
      <div className="flex min-h-full items-center justify-center p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-gold/30 bg-bg-1 p-6 shadow-2xl">
        <CloseX onClick={skipOnboarding} disabled={busy} t={t} />
        <div className="text-center mb-5">
          <div className="font-display text-2xl font-black text-text-strong">{t('onboarding.welcome.title')}</div>
          <p className="text-sm text-muted-2 mt-1">{t('onboarding.welcome.desc')}</p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {GAMES.map((g) => {
            const active = sel.has(g.id);
            const accent = ACCENT[g.id];
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => toggle(g.id)}
                style={active ? { borderColor: accent, background: `${accent}1a` } : undefined}
                className={`relative flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                  active ? '' : 'border-border bg-bg-2/40 opacity-70 hover:opacity-100'
                }`}
              >
                <GameTrophy game={g.id} accent={accent} className="w-12 h-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-text-strong">{g.name}</div>
                  <div className="text-[11px] text-muted-2">{t(g.taglineKey)}</div>
                </div>
                <span
                  className="grid place-items-center w-6 h-6 rounded-full border-2"
                  style={
                    active
                      ? { background: accent, borderColor: accent, color: '#06160c' }
                      : { borderColor: '#26303f', color: 'transparent' }
                  }
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </span>
              </button>
            );
          })}
        </div>

        <Button loading={busy} onClick={submit} className="w-full mt-5 py-3" disabled={sel.size === 0}>
          {t('onboarding.start')}
        </Button>
      </div>
      </div>
    </div>
  );
}
