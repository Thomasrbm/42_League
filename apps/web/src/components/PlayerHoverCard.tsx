import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flame, Snowflake } from 'lucide-react';
import { Avatar } from './Avatar';
import { OnlineBadge } from './OnlineBadge';
import { RankedBadge } from './RankedBadge';
import { BadgeChip } from './Badges';
import { useLeagueData } from '../hooks/useLeagueData';
import { computePlayerStats } from '../lib/playerStats';

const CARD_W = 264;
const GAP = 8;

/**
 * Carte d'aperçu d'un joueur, rendue dans un portail (document.body) pour
 * échapper aux `overflow:hidden` des conteneurs. Positionnée près de l'élément
 * ancre avec retournement (flip) si trop proche d'un bord.
 *
 * Les stats sont calculées côté client depuis le contexte LeagueData — aucune
 * requête réseau supplémentaire.
 */
export function PlayerHoverCard({ login, anchorRect }: { login: string; anchorRect: DOMRect }) {
  const { leaderboard, matches, locations } = useLeagueData();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const entry = leaderboard.find((u) => u.login === login);
  const stats = useMemo(() => computePlayerStats(login, matches), [login, matches]);
  const onlineHost = locations.get(login);
  const realName = entry?.firstName && entry?.lastName ? `${entry.firstName} ${entry.lastName}` : null;

  // Positionnement : sous l'ancre par défaut, au-dessus si pas de place ;
  // clampé horizontalement dans le viewport.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 220;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = anchorRect.bottom + GAP;
    if (top + h + GAP > vh) {
      const above = anchorRect.top - GAP - h;
      top = above >= GAP ? above : Math.max(GAP, vh - h - GAP);
    }
    const left = Math.min(Math.max(GAP, anchorRect.left), vw - CARD_W - GAP);
    setPos({ top, left });
  }, [anchorRect]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: CARD_W,
        opacity: pos ? 1 : 0,
        // Fond opaque (pas de transparence) pour une lecture nette par-dessus
        // n'importe quel contenu.
        background: 'linear-gradient(180deg, #1b1d26 0%, #14151c 100%)',
      }}
      className="z-[120] rounded-xl p-3.5 border border-gold/25 shadow-2xl pointer-events-none animate-pop"
    >
      {/* Titre équipé — bannière dorée centrée en HAUT de la carte. */}
      {entry?.title && (
        <div className="mb-2.5 flex justify-center">
          <span
            className={`inline-flex items-center gap-1 max-w-full italic text-xs font-bold truncate ${
              entry.titleColor === 'rainbow' ? 'title-rainbow' : ''
            }`}
            style={entry.titleColor === 'rainbow' ? undefined : { color: entry.titleColor ?? '#ffc94a' }}
          >
            <span className="opacity-70 leading-none">❝</span>
            <span className="truncate">{entry.title}</span>
            <span className="opacity-70 leading-none">❞</span>
          </span>
        </div>
      )}

      {/* En-tête : avatar + identité */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex-shrink-0">
          <Avatar login={login} imageUrl={entry?.imageUrl ?? null} size="md" className="ring-1 ring-gold/30" />
          {onlineHost && (
            <OnlineBadge host={onlineHost} compact className="absolute bottom-0 right-0" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-extrabold text-text-strong text-sm truncate">
              {realName ?? <span className="font-mono text-muted-2">@{login}</span>}
            </span>
            {entry?.badges?.includes('goat') && <BadgeChip code="goat" size="xs" iconOnly />}
          </div>
          {realName && <div className="text-[10px] text-muted-2 truncate">@{login}</div>}
          {onlineHost && <OnlineBadge host={onlineHost} className="mt-0.5" />}
        </div>
      </div>

      {/* Stats clés */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="ELO" value={entry ? String(entry.elo) : '—'} badge />
        <Stat label="Winrate" value={stats.games ? `${stats.winRate}%` : '—'} />
        <Stat label="V-D" value={`${stats.wins}-${stats.losses}`} />
      </div>

      {/* Série en cours */}
      <div className="mt-2 flex items-center justify-center gap-1.5 text-xs font-bold">
        {stats.streak > 0 ? (
          <span className="inline-flex items-center gap-1 text-[#ff8c3a]">
            <Flame className="w-3.5 h-3.5" strokeWidth={2.5} fill="currentColor" /> {stats.streak} de suite
          </span>
        ) : stats.streak < 0 ? (
          <span className="inline-flex items-center gap-1 text-[#5fb4ff]">
            <Snowflake className="w-3.5 h-3.5" strokeWidth={2.5} /> {Math.abs(stats.streak)} de suite
          </span>
        ) : (
          <span className="text-muted-2">Pas de série</span>
        )}
      </div>

      {/* 3 derniers matchs */}
      {stats.recent.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-border/40">
          <div className="text-[9px] uppercase tracking-wider text-muted-2 font-bold mb-1.5">
            Derniers matchs
          </div>
          <div className="space-y-1">
            {stats.recent.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span
                  className={`w-4 h-4 rounded flex items-center justify-center font-black text-[9px] ${
                    m.won ? 'bg-[#7fd66e]/15 text-[#7fd66e]' : 'bg-red/15 text-red'
                  }`}
                >
                  {m.won ? 'V' : 'D'}
                </span>
                <span className="font-mono tabular-nums text-text">
                  {m.scoreFor}-{m.scoreAgainst}
                </span>
                <span className="text-muted-2 truncate">vs {m.opponent}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function Stat({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-display font-black text-sm text-text-strong tabular-nums leading-none">
        {value}
      </span>
      <span className="text-[8px] uppercase tracking-wider text-muted-2 font-bold flex items-center gap-1">
        {label}
        {badge && <RankedBadge size="xs" />}
      </span>
    </div>
  );
}
