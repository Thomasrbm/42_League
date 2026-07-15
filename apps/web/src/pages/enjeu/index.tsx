import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Clock, Trophy, X } from 'lucide-react';
import { api, type LeaderboardEntry, type StakeMatchDTO, type StakeMatchesResponse } from '../../lib/api';
import type { Game } from '../../lib/gameMode';
import { GAME_META } from '../../lib/gameMeta';
import { CoinAmount } from '../../components/bets/BetPrimitives';
import { useLeagueData } from '../../hooks/useLeagueData';
import { PlayerSearch } from '../defis/shared/PlayerSearch';
import { useDefisLogic } from '../defis/shared/useDefisLogic';
import { STAKE_MIN, STAKE_BET_MAX, stakeBetMultiplier } from '@42-league/shared';

const GAMES_LIST = Object.keys(GAME_META) as Game[];

/** Presets rapides de délai avant le coup d'envoi. */
const TIME_PRESETS: { label: string; min: number }[] = [
  { label: '15 min', min: 15 },
  { label: '30 min', min: 30 },
  { label: '45 min', min: 45 },
  { label: '1 h', min: 60 },
  { label: '2 h', min: 120 },
  { label: '3 h', min: 180 },
];

/** Libellé de compte à rebours jusqu'au coup d'envoi. */
function countdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'coup d’envoi imminent';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `dans ${min} min`;
  const h = Math.floor(min / 60);
  return `dans ${h} h ${min % 60} min`;
}

function fmtMult(m: number): string {
  return `×${m.toFixed(2).replace(/\.?0+$/, '')}`;
}

/** Valeur `datetime-local` par défaut : maintenant + 20 min. */
function defaultScheduled(): string {
  const d = new Date(Date.now() + 20 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function GameIcon({ game, size = 18 }: { game: Game; size?: number }) {
  return <span className="shrink-0">{GAME_META[game].icon(false, size)}</span>;
}

function Avatar({ src, login }: { src: string | null; login: string }) {
  return src ? (
    <img src={src} alt={login} className="w-8 h-8 rounded-full object-cover border border-border/60" />
  ) : (
    <span className="w-8 h-8 rounded-full bg-bg-3 border border-border/60 flex items-center justify-center text-[11px] font-bold text-muted-2">
      {login.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Données + actions des matchs à enjeu, partagées entre la page /enjeu et la section Défis. */
export function useStakeMatches() {
  const [data, setData] = useState<StakeMatchesResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await api.stakeMatches());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'erreur');
    }
  }, []);

  useEffect(() => {
    void reload();
    const iv = setInterval(() => void reload(), 15000);
    return () => clearInterval(iv);
  }, [reload]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setErr(null);
      try {
        await fn();
        await reload();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'erreur');
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  return { data, err, busy, reload, run };
}

export function EnjeuPage() {
  const { data, err, busy, run } = useStakeMatches();

  if (!data) {
    return <div className="max-w-2xl mx-auto p-6 text-muted-2 text-sm">Chargement…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-gold" strokeWidth={2.4} />
          <h1 className="font-gaming text-lg font-extrabold uppercase tracking-wide text-text-strong">
            Matchs à enjeu
          </h1>
        </div>
        <span className="text-sm font-bold">
          <CoinAmount value={data.coins} />
        </span>
      </header>
      <p className="text-[12px] text-muted-2 leading-snug">
        Déclare un duel à gros enjeu : chaque participant mise gros, et toute la ligue peut parier sur
        l’issue. Plus tu mises gros sur toi, plus la cote de tes parieurs grimpe. 1 match à enjeu par jour.
      </p>

      {err && (
        <div className="rounded-lg border border-red/40 bg-red/10 text-red text-[12px] px-3 py-2">{err}</div>
      )}

      {data.incoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-gold">Défis reçus</h2>
          {data.incoming.map((m) => (
            <IncomingCard key={m.id} m={m} coins={data.coins} busy={busy} run={run} />
          ))}
        </section>
      )}

      {data.outgoing.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-muted-2">
            En attente d’acceptation
          </h2>
          {data.outgoing.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-border bg-bg-2/40 px-3 py-2.5 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <GameIcon game={m.game} />
                <span className="text-sm truncate">
                  vs <span className="font-semibold text-text-strong">{m.playerB.login}</span> · ta mise{' '}
                  <CoinAmount value={m.stakeA} />
                </span>
              </div>
              <button
                disabled={busy}
                onClick={() => void run(() => api.cancelStakeMatch(m.id))}
                className="shrink-0 text-[11px] font-semibold text-muted-2 hover:text-red border border-border/60 rounded-lg px-2 py-1"
              >
                Annuler
              </button>
            </div>
          ))}
        </section>
      )}

      <DeclareForm canDeclare={data.canDeclareToday} coins={data.coins} busy={busy} run={run} />

      <section className="space-y-2">
        <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-gold flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5" /> Matchs annoncés
        </h2>
        {data.announced.length === 0 ? (
          <p className="text-[12px] text-muted-2">Aucun match à enjeu annoncé pour le moment.</p>
        ) : (
          data.announced.map((m) => (
            <AnnouncedCard key={m.id} m={m} coins={data.coins} busy={busy} run={run} />
          ))
        )}
      </section>
    </div>
  );
}

/**
 * Section compacte des matchs à enjeu pour la page Défis : défis reçus (à
 * accepter/refuser) + accès rapide pour en lancer un. La déclaration complète et
 * les paris se font sur /enjeu.
 */
export function StakeMatchDefisSection({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const { data, busy, run } = useStakeMatches();
  if (!data) return null;
  const hasAny = data.incoming.length > 0 || data.announced.length > 0;
  return (
    <div className={`space-y-2 ${variant === 'mobile' ? 'px-3' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-gold flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5" /> Matchs à enjeu
        </h3>
        <Link
          to="/enjeu"
          className={
            data.canDeclareToday
              ? 'inline-flex items-center gap-1.5 rounded-lg bg-gold text-bg-0 font-extrabold text-[12px] px-3 py-1.5 shadow-[0_2px_12px_rgba(255,191,32,0.4)] hover:brightness-110 active:scale-[0.98] transition'
              : 'inline-flex items-center gap-1.5 rounded-lg border border-gold/50 text-gold font-bold text-[12px] px-3 py-1.5 hover:bg-gold/10 hover:brightness-110 transition'
          }
        >
          <Zap className="w-3.5 h-3.5" />
          {data.canDeclareToday ? 'Lancer un défi à enjeu' : 'Voir les matchs à enjeu'}
        </Link>
      </div>
      {data.incoming.map((m) => (
        <IncomingCard key={m.id} m={m} coins={data.coins} busy={busy} run={run} />
      ))}
      {data.announced.length > 0 && (
        <Link
          to="/enjeu"
          className="block rounded-xl border border-gold/40 bg-gold/[0.05] px-3 py-2 text-[12px] text-muted-2 hover:brightness-110"
        >
          <span className="text-gold font-bold">{data.announced.length}</span> match(s) annoncé(s) — mise tes
          coins avant le coup d’envoi →
        </Link>
      )}
      {!hasAny && (
        <Link
          to="/enjeu"
          className="flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/[0.06] px-3 py-3 hover:bg-gold/10 hover:brightness-110 transition"
        >
          <span className="text-[12px] text-muted-2 leading-snug">
            Aucun match à enjeu en cours. Défie un joueur et fais parier toute la ligue.
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gold text-bg-0 font-extrabold text-[12px] px-3 py-1.5 shadow-[0_2px_12px_rgba(255,191,32,0.4)]">
            <Zap className="w-3.5 h-3.5" />
            {data.canDeclareToday ? 'Lancer' : 'Voir'}
          </span>
        </Link>
      )}
    </div>
  );
}

function IncomingCard({
  m,
  coins,
  busy,
  run,
}: {
  m: StakeMatchDTO;
  coins: number;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [stake, setStake] = useState(String(Math.max(STAKE_MIN, m.stakeA)));
  const val = Number(stake);
  const ok = Number.isFinite(val) && val >= STAKE_MIN && val <= coins;
  return (
    <div className="rounded-xl border border-gold/40 bg-gold/[0.05] px-3 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <GameIcon game={m.game} />
        <span className="text-sm">
          <span className="font-semibold text-text-strong">{m.playerA.login}</span> te défie —{' '}
          {countdown(m.scheduledAt)}
        </span>
      </div>
      <div className="text-[12px] text-muted-2">
        Sa mise : <CoinAmount value={m.stakeA} />. Pose la tienne (min {STAKE_MIN}) pour annoncer le match.
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={STAKE_MIN}
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          className="w-28 rounded-lg bg-bg-2 border border-border px-2 py-1.5 text-sm"
        />
        <button
          disabled={busy || !ok}
          onClick={() => void run(() => api.acceptStakeMatch(m.id, val))}
          className="rounded-lg bg-gold text-bg-0 font-extrabold text-[12px] px-3 py-1.5 disabled:opacity-40"
        >
          Accepter & miser
        </button>
        <button
          disabled={busy}
          onClick={() => void run(() => api.declineStakeMatch(m.id))}
          className="text-[12px] text-muted-2 hover:text-red font-semibold px-2 py-1.5"
        >
          Refuser
        </button>
      </div>
    </div>
  );
}

function DeclareForm({
  canDeclare,
  coins,
  busy,
  run,
}: {
  canDeclare: boolean;
  coins: number;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { locations } = useLeagueData();
  const { others, recentOpponents, opponentCounts } = useDefisLogic();

  const [game, setGame] = useState<Game>('babyfoot');
  const [opponent, setOpponent] = useState<LeaderboardEntry | null>(null);
  const [stake, setStake] = useState(String(STAKE_MIN));

  // Heure : mode rapide (délai en min/h, presets) ou date précise.
  const [timeMode, setTimeMode] = useState<'quick' | 'precise'>('quick');
  const [amount, setAmount] = useState('15');
  const [unit, setUnit] = useState<'min' | 'h'>('min');
  const [precise, setPrecise] = useState(defaultScheduled());

  const quickMinutes = Math.round((Number(amount) || 0) * (unit === 'h' ? 60 : 1));
  const timeValid =
    timeMode === 'precise'
      ? !!precise && new Date(precise).getTime() >= Date.now() + 15 * 60 * 1000
      : quickMinutes >= 15;

  const val = Number(stake);
  const ok =
    canDeclare && !!opponent && Number.isFinite(val) && val >= STAKE_MIN && val <= coins && timeValid;

  const setPreset = (min: number) => {
    if (min >= 60 && min % 60 === 0) {
      setUnit('h');
      setAmount(String(min / 60));
    } else {
      setUnit('min');
      setAmount(String(min));
    }
  };

  const submit = () =>
    run(async () => {
      const scheduledAt =
        timeMode === 'precise' ? new Date(precise) : new Date(Date.now() + quickMinutes * 60 * 1000);
      await api.declareStakeMatch({
        game,
        opponentLogin: opponent!.login,
        scheduledAt: scheduledAt.toISOString(),
        stake: val,
      });
      setOpponent(null);
      setStake(String(STAKE_MIN));
    });

  return (
    <section className="rounded-2xl border border-border bg-bg-2/40 p-4 space-y-3">
      <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-text-strong">
        Déclarer un match à enjeu
      </h2>
      {!canDeclare && (
        <div className="text-[12px] text-amber-400/90">
          Tu as déjà un match à enjeu aujourd’hui (1 par jour).
        </div>
      )}

      {/* Adversaire — recherche dynamique parmi les inscrits */}
      <div>
        <div className="text-[11px] text-muted-2 mb-1">Adversaire</div>
        <PlayerSearch
          players={others}
          recentPlayers={recentOpponents}
          opponentCounts={opponentCounts}
          selected={opponent}
          onSelect={setOpponent}
          onClear={() => setOpponent(null)}
          locations={locations}
        />
      </div>

      {/* Discipline + mise */}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-muted-2 flex flex-col gap-1">
          Discipline
          <select
            value={game}
            onChange={(e) => setGame(e.target.value as Game)}
            className="rounded-lg bg-bg-2 border border-border px-2 py-1.5 text-sm text-text-strong"
          >
            {GAMES_LIST.map((g) => (
              <option key={g} value={g}>
                {GAME_META[g].label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted-2 flex flex-col gap-1">
          Ta mise (min {STAKE_MIN})
          <input
            type="number"
            min={STAKE_MIN}
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            className="rounded-lg bg-bg-2 border border-border px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {/* Heure — presets rapides + manuel + date précise */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-2">Coup d’envoi</span>
          <div className="ml-auto inline-flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setTimeMode('quick')}
              className={`px-2 py-1 text-[11px] font-semibold ${timeMode === 'quick' ? 'bg-gold text-bg-0' : 'text-muted-2'}`}
            >
              Rapide
            </button>
            <button
              type="button"
              onClick={() => setTimeMode('precise')}
              className={`px-2 py-1 text-[11px] font-semibold ${timeMode === 'precise' ? 'bg-gold text-bg-0' : 'text-muted-2'}`}
            >
              Date précise
            </button>
          </div>
        </div>

        {timeMode === 'quick' ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {TIME_PRESETS.map((p) => {
                const active = quickMinutes === p.min;
                return (
                  <button
                    key={p.min}
                    type="button"
                    onClick={() => setPreset(p.min)}
                    className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold ${
                      active ? 'border-gold bg-gold/15 text-gold' : 'border-border text-muted-2 hover:border-gold/40'
                    }`}
                  >
                    dans {p.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-2">ou dans</span>
              <input
                type="number"
                min={unit === 'h' ? 1 : 15}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-20 rounded-lg bg-bg-2 border border-border px-2 py-1.5 text-sm"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'min' | 'h')}
                className="rounded-lg bg-bg-2 border border-border px-2 py-1.5 text-sm"
              >
                <option value="min">minutes</option>
                <option value="h">heures</option>
              </select>
            </div>
            {!timeValid && <div className="text-[11px] text-red">15 minutes minimum à l’avance.</div>}
          </div>
        ) : (
          <div className="space-y-1">
            <input
              type="datetime-local"
              value={precise}
              onChange={(e) => setPrecise(e.target.value)}
              className="rounded-lg bg-bg-2 border border-border px-2 py-1.5 text-sm w-full"
            />
            {!timeValid && (
              <div className="text-[11px] text-red">Choisis une heure au moins 15 min à l’avance.</div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-2">
          Cote de tes parieurs : <span className="text-gold font-bold">{fmtMult(stakeBetMultiplier(val || 0))}</span>
        </span>
        <button
          disabled={busy || !ok}
          onClick={submit}
          className="rounded-lg bg-gold text-bg-0 font-extrabold text-[12px] px-4 py-2 disabled:opacity-40"
        >
          Lancer le défi
        </button>
      </div>
    </section>
  );
}

function AnnouncedCard({
  m,
  coins,
  busy,
  run,
}: {
  m: StakeMatchDTO;
  coins: number;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const closed = new Date(m.scheduledAt).getTime() <= Date.now();
  const maxBet = Math.min(coins, STAKE_BET_MAX);
  const [choice, setChoice] = useState<string | null>(null);
  const [betStake, setBetStake] = useState('');
  const [winner, setWinner] = useState<string | null>(null);

  const sides = useMemo(
    () => [
      { login: m.playerA.login, img: m.playerA.imageUrl, stake: m.stakeA, mult: m.multA, pool: m.poolA },
      { login: m.playerB.login, img: m.playerB.imageUrl, stake: m.stakeB, mult: m.multB, pool: m.poolB },
    ],
    [m],
  );

  const betVal = Number(betStake);
  const betOk = !!choice && Number.isFinite(betVal) && betVal >= 1 && betVal <= maxBet;

  return (
    <div className="rounded-xl border border-border bg-bg-2/40 overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-border/40">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-2">
          <GameIcon game={m.game} size={15} />
          {GAME_META[m.game].label}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-2">
          <Clock className="w-3 h-3" /> {closed ? 'paris fermés' : countdown(m.scheduledAt)}
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border/40">
        {sides.map((s) => (
          <div key={s.login} className="p-2.5 flex flex-col items-center gap-1 text-center">
            <Avatar src={s.img} login={s.login} />
            <span className="text-[13px] font-semibold text-text-strong truncate max-w-full">{s.login}</span>
            <span className="text-[10px] text-muted-2">
              mise <CoinAmount value={s.stake} />
            </span>
            <span className="text-[11px] font-bold text-gold">cote {fmtMult(s.mult)}</span>
            <span className="text-[10px] text-muted-2">
              parié <CoinAmount value={s.pool} />
            </span>
          </div>
        ))}
      </div>

      <div className="p-2.5 border-t border-border/40">
        {m.isParticipant ? (
          closed ? (
            <div className="space-y-2">
              <div className="text-[11px] text-muted-2">Déclare le vainqueur (les deux doivent concorder) :</div>
              <div className="flex items-center gap-2">
                {sides.map((s) => (
                  <button
                    key={s.login}
                    onClick={() => setWinner(s.login)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[12px] font-semibold ${
                      winner === s.login ? 'border-gold bg-gold/15 text-gold' : 'border-border text-muted-2'
                    }`}
                  >
                    {s.login}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={busy || !winner}
                  onClick={() => winner && void run(() => api.reportStakeMatch(m.id, winner))}
                  className="flex-1 rounded-lg bg-gold text-bg-0 font-extrabold text-[12px] px-3 py-1.5 disabled:opacity-40 flex items-center justify-center gap-1"
                >
                  <Trophy className="w-3.5 h-3.5" /> Valider le résultat
                </button>
                <button
                  disabled={busy}
                  onClick={() => void run(() => api.cancelStakeMatch(m.id))}
                  className="rounded-lg border border-border text-[12px] text-muted-2 hover:text-red px-2 py-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-2">Ton match — les autres parient sur toi.</span>
              <button
                disabled={busy}
                onClick={() => void run(() => api.cancelStakeMatch(m.id))}
                className="text-[11px] text-muted-2 hover:text-red border border-border/60 rounded-lg px-2 py-1"
              >
                Annuler
              </button>
            </div>
          )
        ) : m.myBet ? (
          <div className="text-[12px] text-center text-muted-2">
            Tu as parié <CoinAmount value={m.myBet.stake} /> sur{' '}
            <span className="text-text-strong font-semibold">{m.myBet.choiceLogin}</span>.
          </div>
        ) : closed ? (
          <div className="text-[12px] text-center text-muted-2">Paris fermés.</div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {sides.map((s) => (
                <button
                  key={s.login}
                  onClick={() => setChoice(s.login)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-[12px] font-semibold ${
                    choice === s.login ? 'border-gold bg-gold/15 text-gold' : 'border-border text-muted-2'
                  }`}
                >
                  {s.login} · {fmtMult(s.mult)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={maxBet}
                placeholder={`mise (max ${maxBet})`}
                value={betStake}
                onChange={(e) => setBetStake(e.target.value)}
                className="flex-1 rounded-lg bg-bg-2 border border-border px-2 py-1.5 text-sm"
              />
              <button
                disabled={busy || !betOk}
                onClick={() => choice && void run(() => api.placeStakeBet(m.id, choice, betVal))}
                className="rounded-lg bg-gold text-bg-0 font-extrabold text-[12px] px-3 py-1.5 disabled:opacity-40"
              >
                Parier
              </button>
            </div>
            {choice && betOk && (
              <div className="text-[11px] text-muted-2 text-center">
                Gain potentiel :{' '}
                <span className="text-gold font-bold">
                  <CoinAmount value={Math.round(betVal * (choice === m.playerA.login ? m.multA : m.multB))} />
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
