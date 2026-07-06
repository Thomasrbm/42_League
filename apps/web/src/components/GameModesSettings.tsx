import { useState } from 'react';
import { api, type Game } from '../lib/api';
import { useLeagueData } from '../hooks/useLeagueData';
import { useFlash } from '../hooks/useFlash';
import { useT } from '../lib/i18n';

const GAMES: { id: Game; accent: string }[] = [
  { id: 'babyfoot', accent: '#ffc94a' },
  { id: 'smash', accent: '#ff4d5c' },
  { id: 'chess', accent: '#56c46e' },
  { id: 'streetfighter', accent: '#ff7a18' },
  { id: 'flechettes', accent: '#14b8a6' },
  { id: 'coding', accent: '#58a6ff' },
  { id: 'pokemon', accent: '#ff4d4d' },
];

/**
 * Réglage « modes de jeu » : ajouter / retirer les disciplines auxquelles on
 * adhère. On ne peut pas tout retirer (au moins un mode actif).
 */
export function GameModesSettings() {
  const t = useT();
  const { me, refresh } = useLeagueData();
  const flash = useFlash();
  const current = new Set<Game>((me?.user?.games as Game[] | undefined) ?? ['babyfoot']);
  const [busy, setBusy] = useState<Game | null>(null);

  const apply = async (next: Game[]) => {
    if (next.length === 0) {
      flash.show(t('settings.gameModes.minOne'), 'error');
      return;
    }
    try {
      await api.setGames(next);
      await refresh();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const toggle = async (g: Game) => {
    const next = new Set(current);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    setBusy(g);
    await apply([...next]);
    setBusy(null);
  };

  return (
    <div className="border-t border-gold/20 pt-5">
      <div className="font-gaming text-xs font-extrabold uppercase tracking-[0.18em] text-gold mb-1 flex items-center gap-2">
        <span className="inline-block w-1 h-3 bg-gradient-to-b from-gold to-gold-dim rounded-sm" />
        {t('settings.gameModes.title')}
      </div>
      <p className="text-[11px] text-muted-2 mb-3">
        {t('settings.gameModes.hint')}
      </p>
      <div className="flex flex-col gap-2">
        {GAMES.map((g) => {
          const active = current.has(g.id);
          return (
            <button
              key={g.id}
              type="button"
              disabled={busy === g.id}
              onClick={() => toggle(g.id)}
              style={active ? { borderColor: g.accent, background: `${g.accent}1a`, color: g.accent } : undefined}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border-2 transition-all disabled:opacity-50 ${
                active ? '' : 'border-border bg-bg-2/40 text-muted-2'
              }`}
            >
              <span className="text-sm font-extrabold uppercase tracking-wide">{t(`game.${g.id}`)}</span>
              <span
                className="relative w-10 h-5 rounded-full transition-colors"
                style={{ background: active ? g.accent : '#26303f' }}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                    active ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
