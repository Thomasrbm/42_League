import type { PalmaresEntry } from '../lib/api';

function medal(rank: number): string {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
}

/**
 * Palmarès d'un joueur : ses positions finales par saison.
 */
export function Palmares({ entries }: { entries: PalmaresEntry[] }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="card-hud rounded-xl p-4 border-gold/20">
      <div className="font-gaming text-[10px] uppercase tracking-[0.18em] text-gold/80 font-extrabold mb-3 flex items-center gap-2">
        <span className="inline-block w-1 h-2.5 bg-gradient-to-b from-gold/80 to-gold-dim/80 rounded-sm" />
        Palmarès
        <div className="flex-1 h-px bg-gradient-to-r from-gold/20 to-transparent ms-1" />
      </div>
      <div className="space-y-1">
        {entries.map((e) => (
          <div
            key={e.seasonId}
            className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-sm ${e.rank <= 3 ? '' : 'font-mono text-muted-2 text-xs'}`}>
                {medal(e.rank)}
              </span>
              <span className="font-semibold text-text-strong text-sm truncate">{e.seasonName}</span>
              {e.rank === 1 && (
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-gold bg-gold/10 border border-gold/30 rounded-full px-1.5 py-0.5">
                  Champion
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 text-xs font-mono tabular-nums">
              <span className="text-gold font-bold">{e.elo}</span>
              <span className="text-muted-2">
                {e.wins}-{e.losses}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
