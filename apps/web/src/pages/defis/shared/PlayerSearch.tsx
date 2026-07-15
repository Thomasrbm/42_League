import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { LeaderboardEntry } from '../../../lib/api';
import { useT } from '../../../lib/i18n';

interface PlayerSearchProps {
  players: LeaderboardEntry[];
  recentPlayers: LeaderboardEntry[];
  opponentCounts: Record<string, number>;
  selected: LeaderboardEntry | null;
  onSelect: (p: LeaderboardEntry) => void;
  onClear: () => void;
  /** login → hôte 42 pour afficher les users connectés à l'école */
  locations?: Map<string, string>;
  /** En mode mobile, on autofocus et on remonte les résultats au-dessus du clavier. */
  variant?: 'desktop' | 'mobile';
}

const GOLD_BG_STYLE = {
  background:
    'linear-gradient(135deg, #d4a04a 0%, #8a5e10 50%, #c79122 100%)',
} as const;

/**
 * Combobox de recherche d'adversaire, partagé Desktop/Mobile.
 */
export function PlayerSearch({
  players,
  recentPlayers,
  opponentCounts,
  selected,
  onSelect,
  onClear,
  locations,
  variant = 'desktop',
}: PlayerSearchProps) {
  const t = useT();
  const isMobileVariant = variant === 'mobile';
  const [query, setQuery] = useState('');
  // Sur mobile, on ouvre la liste des adversaires d'emblée (sans focus ni clavier)
  // pour que les suggestions soient visibles sans avoir à scroller.
  const [open, setOpen] = useState(isMobileVariant);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizedQuery = query.trim().toLowerCase();

  // Tri : online first, puis matchesPlayed desc
  const sortByOnline = (list: LeaderboardEntry[]) =>
    [...list].sort((a, b) => {
      const aOn = locations?.has(a.login) ? 1 : 0;
      const bOn = locations?.has(b.login) ? 1 : 0;
      if (aOn !== bOn) return bOn - aOn;
      return b.matchesPlayed - a.matchesPlayed;
    });

  const visibleList = useMemo(() => {
    if (normalizedQuery) {
      const filtered = players.filter((p) => p.login.toLowerCase().includes(normalizedQuery));
      return sortByOnline(filtered);
    }
    const recentLogins = new Set(recentPlayers.map((p) => p.login));
    const sortedRecents = sortByOnline(recentPlayers);
    const sortedRest = sortByOnline(players.filter((p) => !recentLogins.has(p.login)));
    return [...sortedRecents, ...sortedRest];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedQuery, players, recentPlayers, locations]);

  const commit = useCallback(
    (p: LeaderboardEntry) => {
      onSelect(p);
      setQuery('');
      setOpen(false);
      setActiveIdx(0);
    },
    [onSelect],
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key !== 'Escape') setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, visibleList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = visibleList[activeIdx];
      if (pick) commit(pick);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  if (selected) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-bg-1 border-2 border-gold/50 rounded-xl animate-pop shadow-[0_0_20px_rgba(255,201,74,0.18),inset_0_1px_0_rgba(255,215,120,0.12)]">
        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 border-2 border-gold/60 shadow-sm">
          {selected.imageUrl ? (
            <img src={selected.imageUrl} alt={selected.login} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-sm font-display font-black text-[#1a1100]"
              style={GOLD_BG_STYLE}
            >
              {selected.login[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <span className="font-extrabold text-base text-text-strong flex-1 truncate">{selected.login}</span>
        <span className="text-gold text-sm font-extrabold bg-gold/10 px-2 py-1 rounded-md font-mono tabular-nums border border-gold/20">{selected.elo}</span>
        <button
          type="button"
          aria-label={t('defis.changeOpponent')}
          onClick={() => {
            onClear();
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="ms-1 text-muted hover:text-red transition-colors w-7 h-7 flex items-center justify-center rounded-full hover:bg-red/10 tap-transparent"
        >
          <X className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </div>
    );
  }

  const showingRecents = !normalizedQuery && recentPlayers.length > 0;
  const isMobile = variant === 'mobile';

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" strokeWidth={2.5} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); setOpen(true); }}
          onFocus={() => {
            setOpen(true);
            // Mobile : remonte l'input en haut de la sheet pour laisser un maximum
            // de place aux suggestions au-dessus du clavier.
            if (isMobile) {
              setTimeout(
                () => inputRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
                80,
              );
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('defis.searchPlaceholder')}
          aria-label={t('defis.searchAria')}
          className="w-full ps-11 pe-4 py-3.5 bg-bg-1 border-2 border-border rounded-xl text-base font-medium focus:border-gold outline-none text-text-strong placeholder:text-muted transition-all shadow-sm focus:shadow-[0_0_16px_rgba(255,201,74,0.18)] tap-transparent allow-select"
        />
      </div>

      {open && visibleList.length > 0 && (
        <div
          className={`${isMobile ? 'relative w-full mt-3' : 'absolute z-50 w-full mt-2'} card-hud rounded-xl shadow-2xl overflow-hidden animate-pop`}
        >
          {showingRecents && (
            <div className="flex items-center justify-between px-4 py-2 bg-bg-2/50 border-b border-gold/15">
              <span className="text-[10px] uppercase tracking-wider text-gold font-extrabold">
                {t('defis.yourOpponents')}
              </span>
              <span className="text-[10px] text-muted-2 font-mono">
                {recentPlayers.length} {t('defis.playedSuffix')}
              </span>
            </div>
          )}
          <div className={`${isMobile ? 'max-h-[34vh]' : 'max-h-72'} overflow-y-auto custom-scrollbar`}>
            {visibleList.map((p, i) => {
              const count = opponentCounts[p.login] ?? 0;
              const played = count > 0;
              return (
                <button
                  key={p.login}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); commit(p); }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-start transition-colors tap-transparent ${
                    i === activeIdx
                      ? 'bg-gold/10 text-text-strong border-s-2 border-gold'
                      : 'hover:bg-bg-2 text-muted-2 border-s-2 border-transparent'
                  }`}
                >
                  <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border border-gold/30 shadow-sm">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.login} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-sm font-display font-black text-[#1a1100]"
                        style={GOLD_BG_STYLE}
                      >
                        {p.login[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold truncate">
                        <HighlightMatch text={p.login} query={query} />
                      </span>
                    </div>
                    <div className="text-[11px] text-muted font-medium">
                      {played ? (
                        <span className="text-gold/80">
                          {count} {count > 1 ? t('defis.gamePlural') : t('defis.gameSingular')} {count > 1 ? t('defis.playedFemPlural') : t('defis.playedFemSingular')}
                        </span>
                      ) : (
                        <span>{t('defis.neverPlayed')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0 font-mono">
                    <span className="text-sm text-gold font-extrabold leading-none tabular-nums">{p.elo}</span>
                    <span className="text-[10px] text-muted font-medium leading-none tabular-nums">#{p.rank}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {open && normalizedQuery.length > 0 && visibleList.length === 0 && (
        <div className="absolute z-50 w-full mt-2 card-hud rounded-xl shadow-2xl px-4 py-4 text-sm text-muted font-medium text-center animate-pop">
          {t('defis.noPlayerFound')}
        </div>
      )}
    </div>
  );
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-gold">{text.slice(idx, idx + trimmed.length)}</span>
      {text.slice(idx + trimmed.length)}
    </>
  );
}
