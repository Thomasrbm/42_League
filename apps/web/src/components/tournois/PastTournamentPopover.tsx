import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '../Avatar';
import { api, type Tournament, type TournamentMatch } from '../../lib/api';

/**
 * Synthèse d'un tournoi TERMINÉ déduite de ses matchs de bracket :
 * vainqueur (+ nb de victoires), finale et demi-finales (l'« arbre de qualif »
 * des demi-finalistes vers la finale). null si pas de phase à élimination.
 */
function summarize(t: Tournament): {
  winner: string | null;
  winnerWins: number;
  final: TournamentMatch | null;
  semis: TournamentMatch[];
} | null {
  const bracket = (t.matches ?? []).filter((m) => (m.stage ?? 'bracket') === 'bracket');
  if (bracket.length === 0) return null;
  const maxRound = Math.max(...bracket.map((m) => m.round));
  const final = bracket.find((m) => m.round === maxRound) ?? null;
  const semis = bracket.filter((m) => m.round === maxRound - 1).sort((a, b) => a.slot - b.slot);
  const winner = t.winnerLogin ?? final?.winnerLogin ?? null;
  const winnerWins = winner ? bracket.filter((m) => m.winnerLogin === winner).length : 0;
  return { winner, winnerWins, final, semis };
}

/** Ligne de match compacte « A  score  B », vainqueur surligné. */
function MatchLine({ m }: { m: TournamentMatch }) {
  const aWon = !!m.winnerLogin && m.winnerLogin === m.playerALogin;
  const bWon = !!m.winnerLogin && m.winnerLogin === m.playerBLogin;
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className={`flex items-center gap-1 min-w-0 flex-1 justify-end ${aWon ? 'text-gold font-bold' : 'text-muted-2'}`}>
        <span className="truncate">{m.playerALogin ?? '—'}</span>
        <Avatar login={m.playerALogin ?? ''} imageUrl={null} size="xs" />
      </span>
      <span className="font-mono tabular-nums text-text-strong shrink-0">
        {m.scoreA ?? '-'}–{m.scoreB ?? '-'}
      </span>
      <span className={`flex items-center gap-1 min-w-0 flex-1 ${bWon ? 'text-gold font-bold' : 'text-muted-2'}`}>
        <Avatar login={m.playerBLogin ?? ''} imageUrl={null} size="xs" />
        <span className="truncate">{m.playerBLogin ?? '—'}</span>
      </span>
    </div>
  );
}

/**
 * Enveloppe une carte de tournoi TERMINÉ : au survol (desktop), charge le détail
 * du tournoi (la liste n'embarque pas les matchs) et affiche une carte riche
 * (vainqueur + arbre demi-finales → finale) via un PORTAL positionné au-dessus
 * (ou en dessous si trop haut) de la carte → jamais rogné. Le clic passe à
 * travers (pointer-events-none) et atterrit sur le Link de la carte (page détail).
 */
export function PastTournamentHover({ t, children }: { t: Tournament; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Tournament | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);

  const onEnter = () => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const below = r.top < 320; // pas assez de place au-dessus → on ouvre dessous
      setPos({ left: r.left + r.width / 2, top: below ? r.bottom : r.top, below });
    }
    setOpen(true);
    if (!detail) api.tournament(t.id).then(setDetail).catch(() => {});
  };

  const s = detail ? summarize(detail) : null;

  return (
    <div ref={ref} className="relative" onMouseEnter={onEnter} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && s && s.winner && pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[2147483600] w-72 rounded-xl border border-gold/30 bg-bg-0/98 backdrop-blur-sm shadow-2xl shadow-black/60 p-3"
            style={{
              left: pos.left,
              top: pos.top,
              transform: pos.below ? 'translate(-50%, 8px)' : 'translate(-50%, calc(-100% - 8px))',
            }}
          >
            <div className="text-[11px] font-extrabold text-text-strong truncate mb-2">{t.name}</div>

            <div className="flex items-center gap-2 mb-2.5 rounded-lg bg-gold/10 border border-gold/25 px-2 py-1.5">
              <span className="text-base leading-none">🏆</span>
              <Avatar login={s.winner} imageUrl={null} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-gold truncate">{s.winner}</span>
                <span className="block text-[9px] text-muted-2 uppercase tracking-wider">
                  Vainqueur · {s.winnerWins} victoire{s.winnerWins > 1 ? 's' : ''}
                </span>
              </span>
            </div>

            {s.semis.length > 0 && (
              <div className="mb-2">
                <div className="text-[9px] uppercase tracking-wider text-muted font-bold mb-1">Demi-finales</div>
                <div className="space-y-1">
                  {s.semis.map((m) => (
                    <MatchLine key={m.id} m={m} />
                  ))}
                </div>
              </div>
            )}
            {s.final && (
              <div className="mb-2">
                <div className="text-[9px] uppercase tracking-wider text-gold/80 font-bold mb-1">Finale</div>
                <MatchLine m={s.final} />
              </div>
            )}

            <div className="text-[9px] text-muted-2 text-center pt-1 border-t border-border/50">
              Cliquer pour voir le détail →
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
