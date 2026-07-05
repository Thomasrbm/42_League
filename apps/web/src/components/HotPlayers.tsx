import { useCallback, useEffect, useMemo, useState } from 'react';
import { Flame, Loader2 } from 'lucide-react';
import { Avatar } from './Avatar';
import { PlayerLink } from './PlayerLink';
import { useFlash } from '../hooks/useFlash';
import { useGameMode } from '../hooks/useGameMode';
import { useLeagueData } from '../hooks/useLeagueData';
import { useServerEvents } from '../hooks/useServerEvents';
import { api, type HotPlayer } from '../lib/api';
import { GAME_META } from '../lib/gameMeta';
import { useT } from '../lib/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// « Je suis chaud » — bien plus léger que le matchmaking bloquant : un bouton
// te met 30 min dans une liste visible de tous (avec le jeu), et c'est tout.
// Les matchs spontanés naissent au cluster. Liste poussée en SSE (hot:update).
// ─────────────────────────────────────────────────────────────────────────────

export function HotPlayers({ className = '' }: { className?: string }) {
  const t = useT();
  const { me } = useLeagueData();
  const { game } = useGameMode();
  const { show } = useFlash();
  const [list, setList] = useState<HotPlayer[]>([]);
  const [busy, setBusy] = useState(false);
  // Tick minute : fait vivre les compteurs et purge les expirés côté client.
  const [, setTick] = useState(0);

  const load = useCallback(() => {
    api.hotList().then(setList).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [load]);

  useServerEvents(load, ['hot:update'], { debounceMs: 200 });

  const now = Date.now();
  const alive = useMemo(() => list.filter((h) => +new Date(h.until) > now), [list, now]);
  const myLogin = me?.login ?? null;
  const mine = alive.find((h) => h.login === myLogin);

  const toggle = useCallback(async () => {
    setBusy(true);
    try {
      if (mine) {
        await api.hotClear();
      } else {
        await api.hotSet(game);
        show(t('hot.on'));
      }
      load();
    } catch (err) {
      show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  }, [mine, game, load, show, t]);

  const minutesLeft = (until: string) => Math.max(1, Math.ceil((+new Date(until) - now) / 60_000));

  return (
    <div className={`card-hud rounded-2xl px-4 py-3.5 ${className}`} style={{ borderColor: 'rgba(255,122,24,0.3)' }}>
      <div className="flex items-center gap-2 mb-2.5">
        <Flame className="w-4 h-4 text-[#ff7a18]" strokeWidth={2.4} />
        <span className="font-gaming text-xs font-extrabold uppercase tracking-[0.14em] text-text-strong flex-1">
          {t('hot.title')}
          {alive.length > 0 && (
            <span className="ml-1.5 text-[#ff7a18] tabular-nums">{alive.length}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wide transition-all disabled:opacity-50 ${
            mine
              ? 'bg-[#ff7a18]/15 border border-[#ff7a18]/50 text-[#ff7a18]'
              : 'text-bg-0'
          }`}
          style={mine ? undefined : { background: 'linear-gradient(160deg, #ff7a18, #e05a00)' }}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.5} />
          ) : (
            <Flame className="w-3.5 h-3.5" strokeWidth={2.6} />
          )}
          {mine ? t('hot.stop') : t('hot.me')}
        </button>
      </div>

      {alive.length === 0 ? (
        <p className="text-xs text-muted-2">{t('hot.empty')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {alive.map((h) => {
            const gm = GAME_META[h.game];
            return (
              <PlayerLink
                key={h.login}
                login={h.login}
                className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-bg-2/60 border transition-colors hover:border-[#ff7a18]/50"
                // couleur du jeu en liseré : on voit direct qui veut jouer à quoi
              >
                <Avatar login={h.login} imageUrl={h.imageUrl} size="xs" />
                <span className="text-xs font-semibold text-text">{h.login}</span>
                <span
                  className="text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
                  style={{ color: gm?.color, background: gm ? `${gm.color}1a` : undefined }}
                >
                  {gm?.shortLabel ?? h.game}
                </span>
                <span className="text-[9px] text-muted tabular-nums">{minutesLeft(h.until)} min</span>
              </PlayerLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
