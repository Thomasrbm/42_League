import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { api, type XpLeaderboardEntry } from '../../lib/api';
import { Avatar } from '../../components/Avatar';
import { PlayerLink } from '../../components/PlayerLink';
import { Skeleton } from '../../mobile/primitives/Skeleton';

/** Couleurs des 3 premières places (or / argent / bronze). */
const PODIUM_COLORS = ['#ffbf20', '#c9d2e0', '#d68a4a'];

/**
 * Ladder XP cross-jeux — le même quel que soit l'univers courant. L'XP est
 * créditée à chaque match joué (défaite comprise, gain réduit), d'où la note
 * pédagogique sous l'en-tête. Utilisé par le classement desktop ET mobile.
 */
export function XpLeaderboard({ myLogin }: { myLogin?: string | null }) {
  const [entries, setEntries] = useState<XpLeaderboardEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .xpLeaderboard()
      .then((rows) => { if (alive) setEntries(rows); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  const fmt = (n: number) => n.toLocaleString('fr-FR');

  return (
    <div>
      <p className="text-[11px] text-muted-2/90 mb-3 leading-snug">
        XP gagnée à chaque match joué — victoire <span className="text-gold font-bold">ou défaite</span> —
        toutes disciplines confondues. Même barème dans tous les univers.
      </p>

      {error ? (
        <div className="text-center text-muted-2 py-10">Impossible de charger le ladder XP.</div>
      ) : entries === null ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center text-muted-2 py-10">
          Personne n'a encore gagné d'XP — joue un match pour inaugurer le ladder !
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => {
            const isMe = myLogin != null && e.login === myLogin;
            const podium = e.rank <= 3 ? PODIUM_COLORS[e.rank - 1] : null;
            return (
              <div
                key={e.login}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors ${
                  isMe
                    ? 'border-gold/50 bg-gold/10'
                    : podium
                      ? 'border-border bg-bg-2/70'
                      : 'border-border/60 bg-bg-1/60 hover:bg-bg-2/60'
                }`}
                style={podium ? { boxShadow: `inset 3px 0 0 ${podium}` } : undefined}
              >
                <span
                  className="w-7 text-center font-display font-black tabular-nums text-sm"
                  style={{ color: podium ?? undefined }}
                >
                  {e.rank}
                </span>
                <Avatar login={e.login} imageUrl={e.imageUrl} size="sm" />
                <span className="flex-1 min-w-0 truncate">
                  <PlayerLink login={e.login} className={`text-sm font-bold ${isMe ? 'text-gold' : 'text-text'}`}>
                    {e.login}
                  </PlayerLink>
                </span>
                <span
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-extrabold uppercase tracking-wide"
                  style={{
                    color: podium ?? '#2cc3ff',
                    borderColor: `${podium ?? '#2cc3ff'}55`,
                    background: `${podium ?? '#2cc3ff'}14`,
                  }}
                >
                  <Zap className="w-3 h-3" strokeWidth={2.5} />
                  Niv. {e.level}
                </span>
                <span className="shrink-0 w-24 text-right font-display font-extrabold tabular-nums text-sm text-text-strong">
                  {fmt(e.xp)} <span className="text-[10px] text-muted-2 font-bold">XP</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
