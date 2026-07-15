import { useCallback, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, X, Plus } from 'lucide-react';
import { Button } from '../../../components/Button';
import { api, type LeaderboardEntry } from '../../../lib/api';
import { trackEvent } from '../../../lib/analytics';
import { useFlash } from '../../../hooks/useFlash';
import { useT } from '../../../lib/i18n';
import { haptic } from '../../../mobile/feedback/useHaptic';
import { PlayerSearch } from './PlayerSearch';

const FFA_MIN_PLAYERS = 3;
const FFA_MAX_PLAYERS = 8;

/** Un participant du FFA — soit moi, soit un joueur sélectionné. */
interface Entrant {
  login: string;
  elo: number;
  imageUrl?: string | null;
  isMe: boolean;
}

interface DeclareFfaGameFlowProps {
  others: LeaderboardEntry[];
  recentOpponents: LeaderboardEntry[];
  opponentCounts: Record<string, number>;
  myLogin: string | undefined;
  myElo?: number;
  locations?: Map<string, string>;
  /** Appelé après un POST réussi. */
  onSubmitted: () => Promise<void> | void;
  variant?: 'desktop' | 'mobile';
}

function Avatar({ entrant }: { entrant: Entrant }) {
  return (
    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border-2 border-gold/50">
      {entrant.imageUrl ? (
        <img src={entrant.imageUrl} alt={entrant.login} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center text-xs font-display font-black text-[#1a1100]"
          style={{ background: 'linear-gradient(135deg, #d4a04a 0%, #8a5e10 50%, #c79122 100%)' }}
        >
          {entrant.login[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}

/**
 * Flow de déclaration d'un FFA Smash (Free-For-All, 3 à 8 joueurs).
 *
 * Le déclarant choisit les joueurs (lui inclus) puis ordonne le classement final
 * (1er en haut → dernier en bas). Les positions sont dérivées de l'ordre. L'ELO
 * de chacun bougera selon son rang ; chaque autre joueur confirmera SA position.
 *
 * Strictement Smash.
 */
export function DeclareFfaGameFlow({
  others,
  recentOpponents,
  opponentCounts,
  myLogin,
  myElo,
  locations,
  onSubmitted,
  variant = 'desktop',
}: DeclareFfaGameFlowProps) {
  const flash = useFlash();
  const t = useT();
  const [busy, setBusy] = useState(false);

  // Classement ordonné : 1er en tête. Démarre avec moi seul.
  const [order, setOrder] = useState<Entrant[]>(() =>
    myLogin ? [{ login: myLogin, elo: myElo ?? 1000, isMe: true }] : [],
  );

  const pickedLogins = useMemo(() => new Set(order.map((e) => e.login)), [order]);

  const pool = useMemo(
    () => others.filter((p) => !pickedLogins.has(p.login)),
    [others, pickedLogins],
  );
  const recentPool = useMemo(
    () => recentOpponents.filter((p) => !pickedLogins.has(p.login)),
    [recentOpponents, pickedLogins],
  );

  const addPlayer = (p: LeaderboardEntry) => {
    if (order.length >= FFA_MAX_PLAYERS) return;
    haptic('light');
    setOrder((o) => [...o, { login: p.login, elo: p.elo, imageUrl: p.imageUrl, isMe: false }]);
  };

  const removePlayer = (login: string) => {
    haptic('warning');
    setOrder((o) => o.filter((e) => e.login !== login));
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    haptic('light');
    setOrder((o) => {
      const next = [...o];
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
  };

  const canSubmit = order.length >= FFA_MIN_PLAYERS && order.length <= FFA_MAX_PLAYERS;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await api.declareFfa(order.map((e) => e.login));
      trackEvent('match.declare', 'smash');
      flash.show(t('ffa.toast.declared'));
      haptic('success');
      await onSubmitted();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      haptic('error');
    } finally {
      setBusy(false);
    }
  }, [canSubmit, order, flash, onSubmitted, t]);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Ajout de joueurs ─────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border border-red/25 p-4 space-y-3"
        style={{ background: 'rgba(255,83,102,0.04)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-red">
            {t('ffa.players')}
          </span>
          <span className="text-[10px] font-mono tabular-nums text-muted-2">
            {order.length}/{FFA_MAX_PLAYERS}
          </span>
        </div>

        {order.length < FFA_MAX_PLAYERS ? (
          <div className="relative z-30">
            <PlayerSearch
              variant={variant}
              players={pool}
              recentPlayers={recentPool}
              opponentCounts={opponentCounts}
              selected={null}
              onSelect={addPlayer}
              onClear={() => {}}
              locations={locations}
            />
          </div>
        ) : (
          <div className="text-[11px] text-muted-2 text-center py-1.5 font-medium">
            {t('ffa.maxReached')}
          </div>
        )}
      </div>

      {/* ── Classement final (ordonnable) ────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-gold">
            {t('ffa.ranking')}
          </span>
          <span className="inline-flex items-center gap-1 text-[9px] text-muted-2 font-medium">
            <Plus className="w-3 h-3" /> {t('ffa.rankingHint')}
          </span>
        </div>

        <div className="space-y-1.5">
          {order.map((e, i) => (
            <div
              key={e.login}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${
                e.isMe ? 'border-gold/40 bg-gold/[0.06]' : 'border-border/60 bg-white/[0.02]'
              }`}
            >
              <span className="w-6 text-center font-display font-black tabular-nums text-gold text-sm shrink-0">
                {i + 1}
              </span>
              <Avatar entrant={e} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-extrabold text-text-strong truncate">
                  {e.login}
                  {e.isMe && <span className="ms-1.5 text-[9px] uppercase tracking-wider text-gold/70">· {t('ffa.you')}</span>}
                </div>
                <div className="text-[10px] text-muted font-mono tabular-nums">{e.elo} ELO</div>
              </div>
              {/* Flèches de réordonnancement */}
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label={t('ffa.moveUp')}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="w-6 h-4 flex items-center justify-center text-muted-2 hover:text-gold disabled:opacity-25 disabled:hover:text-muted-2 transition-colors"
                >
                  <ChevronUp className="w-4 h-4" strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  aria-label={t('ffa.moveDown')}
                  disabled={i === order.length - 1}
                  onClick={() => move(i, 1)}
                  className="w-6 h-4 flex items-center justify-center text-muted-2 hover:text-gold disabled:opacity-25 disabled:hover:text-muted-2 transition-colors"
                >
                  <ChevronDown className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>
              {/* Retrait (sauf moi) */}
              {!e.isMe && (
                <button
                  type="button"
                  aria-label={t('ffa.remove')}
                  onClick={() => removePlayer(e.login)}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-muted hover:text-red hover:bg-red/10 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" strokeWidth={2.5} />
                </button>
              )}
            </div>
          ))}
        </div>

        {order.length < FFA_MIN_PLAYERS && (
          <p className="text-[11px] text-muted-2 text-center mt-2 font-medium">{t('ffa.minPlayers')}</p>
        )}
      </div>

      {/* ── Envoi ─────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Button
          size="md"
          variant="danger"
          loading={busy}
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="w-full py-3.5 text-sm font-bold shadow-lg"
        >
          {t('ffa.send')}
        </Button>
        <p className="text-[10px] text-muted/70 leading-relaxed text-center font-medium">
          {t('ffa.recap')}
        </p>
      </div>
    </div>
  );
}
