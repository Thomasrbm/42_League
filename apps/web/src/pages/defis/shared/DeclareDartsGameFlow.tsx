import { useCallback, useMemo, useState } from 'react';
import { Trophy, X } from 'lucide-react';
import { Button } from '../../../components/Button';
import { api, type LeaderboardEntry } from '../../../lib/api';
import { useFlash } from '../../../hooks/useFlash';
import { useT } from '../../../lib/i18n';
import { haptic } from '../../../mobile/feedback/useHaptic';
import { PlayerSearch } from './PlayerSearch';

const DARTS_MIN_PLAYERS = 2;
const DARTS_MAX_PLAYERS = 8;
const START_SCORES = [301, 501] as const;
type StartScore = (typeof START_SCORES)[number];

/** Un participant de la manche — soit moi, soit un joueur sélectionné. */
interface Entrant {
  login: string;
  elo: number;
  imageUrl?: string | null;
  isMe: boolean;
  /** Points restants à la fin (0 = vainqueur). */
  remaining: number;
}

interface DeclareDartsGameFlowProps {
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

const ACCENT = '#14b8a6';

function Avatar({ entrant }: { entrant: Entrant }) {
  return (
    <div
      className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border-2"
      style={{ borderColor: 'rgba(20,184,166,0.5)' }}
    >
      {entrant.imageUrl ? (
        <img src={entrant.imageUrl} alt={entrant.login} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center text-xs font-display font-black text-[#022]"
          style={{ background: 'linear-gradient(135deg, #2dd4bf 0%, #0d9488 50%, #14b8a6 100%)' }}
        >
          {entrant.login[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}

/**
 * Flow de déclaration d'une manche de fléchettes (301/501, 2 à 8 joueurs).
 *
 * Le déclarant choisit les joueurs (lui inclus), le mode (301/501), puis saisit
 * les POINTS RESTANTS de chacun à la fin (le vainqueur = 0). Le classement est
 * dérivé du reste (0 = 1er, puis du plus petit reste au plus grand). L'ELO bouge
 * selon la marge ; chaque autre joueur confirmera ENSUITE son propre reste.
 *
 * Strictement fléchettes.
 */
export function DeclareDartsGameFlow({
  others,
  recentOpponents,
  opponentCounts,
  myLogin,
  myElo,
  locations,
  onSubmitted,
  variant = 'desktop',
}: DeclareDartsGameFlowProps) {
  const flash = useFlash();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [startScore, setStartScore] = useState<StartScore>(501);

  // Démarre avec moi seul, supposé vainqueur (reste 0) par défaut.
  const [players, setPlayers] = useState<Entrant[]>(() =>
    myLogin ? [{ login: myLogin, elo: myElo ?? 1000, isMe: true, remaining: 0 }] : [],
  );

  const pickedLogins = useMemo(() => new Set(players.map((e) => e.login)), [players]);
  const pool = useMemo(() => others.filter((p) => !pickedLogins.has(p.login)), [others, pickedLogins]);
  const recentPool = useMemo(
    () => recentOpponents.filter((p) => !pickedLogins.has(p.login)),
    [recentOpponents, pickedLogins],
  );

  const addPlayer = (p: LeaderboardEntry) => {
    if (players.length >= DARTS_MAX_PLAYERS) return;
    haptic('light');
    // Nouveau joueur : reste = score de départ par défaut (perdant à ajuster).
    setPlayers((o) => [...o, { login: p.login, elo: p.elo, imageUrl: p.imageUrl, isMe: false, remaining: startScore }]);
  };

  const removePlayer = (login: string) => {
    haptic('warning');
    setPlayers((o) => o.filter((e) => e.login !== login));
  };

  const setRemaining = (login: string, value: number) => {
    const clamped = Math.max(0, Math.min(startScore, Math.round(value || 0)));
    setPlayers((o) => o.map((e) => (e.login === login ? { ...e, remaining: clamped } : e)));
  };

  // Le bouton « 🏆 » d'une ligne met ce joueur à 0 (vainqueur) — pratique.
  const markWinner = (login: string) => {
    haptic('light');
    setPlayers((o) => o.map((e) => ({ ...e, remaining: e.login === login ? 0 : e.remaining })));
  };

  const changeStartScore = (s: StartScore) => {
    haptic('light');
    setStartScore(s);
    // Re-borne les restes au nouveau plafond.
    setPlayers((o) => o.map((e) => ({ ...e, remaining: Math.min(e.remaining, s) })));
  };

  // Classement dérivé (reste croissant) pour l'aperçu.
  const ranked = useMemo(
    () => [...players].sort((a, b) => a.remaining - b.remaining),
    [players],
  );
  const winners = players.filter((e) => e.remaining === 0).length;

  const canSubmit =
    players.length >= DARTS_MIN_PLAYERS &&
    players.length <= DARTS_MAX_PLAYERS &&
    winners === 1;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await api.declareDarts(
        startScore,
        players.map((e) => ({ login: e.login, remaining: e.remaining })),
      );
      flash.show(t('darts.toast.declared'));
      haptic('success');
      await onSubmitted();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      haptic('error');
    } finally {
      setBusy(false);
    }
  }, [canSubmit, startScore, players, flash, onSubmitted, t]);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Mode 301 / 501 ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-2">
        {START_SCORES.map((s) => {
          const on = startScore === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => changeStartScore(s)}
              className={`px-5 py-2 rounded-xl text-sm font-display font-black tabular-nums transition-colors border ${
                on ? 'text-[#022]' : 'text-muted-2 border-border/60 hover:text-text'
              }`}
              style={on ? { background: ACCENT, borderColor: ACCENT } : undefined}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* ── Ajout de joueurs ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'rgba(20,184,166,0.25)', background: 'rgba(20,184,166,0.04)' }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
            {t('darts.players')}
          </span>
          <span className="text-[10px] font-mono tabular-nums text-muted-2">
            {players.length}/{DARTS_MAX_PLAYERS}
          </span>
        </div>

        {players.length < DARTS_MAX_PLAYERS ? (
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
          <div className="text-[11px] text-muted-2 text-center py-1.5 font-medium">{t('darts.maxReached')}</div>
        )}
      </div>

      {/* ── Saisie des restes ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
            {t('darts.remainingLabel')}
          </span>
          <span className="text-[9px] text-muted-2 font-medium">{t('darts.remainingHint')}</span>
        </div>

        <div className="space-y-1.5">
          {players.map((e) => {
            const isWinner = e.remaining === 0;
            return (
              <div
                key={e.login}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl border"
                style={
                  isWinner
                    ? { borderColor: 'rgba(20,184,166,0.5)', background: 'rgba(20,184,166,0.08)' }
                    : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }
                }
              >
                <Avatar entrant={e} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-extrabold text-text-strong truncate">
                    {e.login}
                    {e.isMe && <span className="ms-1.5 text-[9px] uppercase tracking-wider" style={{ color: ACCENT }}>· {t('darts.you')}</span>}
                  </div>
                  <div className="text-[10px] text-muted font-mono tabular-nums">{e.elo} ELO</div>
                </div>

                {/* Bouton vainqueur (reste 0) */}
                <button
                  type="button"
                  aria-label={t('darts.markWinner')}
                  title={t('darts.markWinner')}
                  onClick={() => markWinner(e.login)}
                  className="w-7 h-7 flex items-center justify-center rounded-full transition-colors shrink-0"
                  style={{ color: isWinner ? ACCENT : 'rgba(255,255,255,0.3)' }}
                >
                  <Trophy className="w-4 h-4" strokeWidth={2.5} />
                </button>

                {/* Reste */}
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9px] uppercase tracking-wide text-muted-2">{t('darts.rest')}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={startScore}
                    value={e.remaining}
                    onChange={(ev) => setRemaining(e.login, ev.target.valueAsNumber)}
                    className="w-16 px-2 py-1 rounded-lg bg-bg-0 border border-border/60 text-end text-sm font-mono tabular-nums text-text-strong focus:outline-none focus:border-[#14b8a6]"
                  />
                </div>

                {!e.isMe && (
                  <button
                    type="button"
                    aria-label={t('darts.remove')}
                    onClick={() => removePlayer(e.login)}
                    className="w-7 h-7 flex items-center justify-center rounded-full text-muted hover:text-red hover:bg-red/10 transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" strokeWidth={2.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Aperçu du classement dérivé */}
        {players.length >= DARTS_MIN_PLAYERS && winners === 1 && (
          <div className="mt-3 rounded-xl border border-border/40 bg-white/[0.02] px-3 py-2">
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-2 font-extrabold mb-1">{t('darts.previewRanking')}</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {ranked.map((e, i) => (
                <span key={e.login} className="text-[11px] font-medium text-text">
                  <span className="font-display font-black tabular-nums" style={{ color: ACCENT }}>{i + 1}.</span>{' '}
                  {e.login}
                  <span className="text-muted-2 font-mono"> ({e.remaining})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {players.length < DARTS_MIN_PLAYERS && (
          <p className="text-[11px] text-muted-2 text-center mt-2 font-medium">{t('darts.minPlayers')}</p>
        )}
        {players.length >= DARTS_MIN_PLAYERS && winners !== 1 && (
          <p className="text-[11px] text-amber-400/90 text-center mt-2 font-medium">{t('darts.needOneWinner')}</p>
        )}
      </div>

      {/* ── Envoi ─────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Button
          size="md"
          loading={busy}
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="w-full py-3.5 text-sm font-bold shadow-lg text-[#022]"
          style={{ background: ACCENT }}
        >
          {t('darts.send')}
        </Button>
        <p className="text-[10px] text-muted/70 leading-relaxed text-center font-medium">{t('darts.recap')}</p>
      </div>
    </div>
  );
}
