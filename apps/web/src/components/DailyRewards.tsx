import { useCallback, useState } from 'react';
import { Check, Flame, Gift } from 'lucide-react';
import { api, type DailyClaimView, type StreakView } from '../lib/api';
import { trackEvent } from '../lib/analytics';

/** Petit montant en coins avec l'icône 42coin. */
function Coins({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {value}
      <img src="/42coin.webp" alt="coins" className="w-3.5 h-3.5" />
    </span>
  );
}

/**
 * Carte « Série d'assiduité » (ranked) : jours consécutifs AVEC un match classé,
 * bonus ELO +10% dès 3 jours, prochain palier de coins. Récompense le JEU.
 * (Déplacée du shop vers l'accueil.)
 */
export function StreakCard({ streak }: { streak: StreakView }) {
  const { current, best, eloActive, next } = streak;
  const pct = next.day > 0 ? Math.min(100, Math.round((current / next.day) * 100)) : 0;
  const toBonus = Math.max(0, 3 - current);
  const hint = eloActive
    ? `Bonus +10% d'ELO actif sur tes gains. Continue jusqu'à J${next.day} → +${next.coins} coins.`
    : current > 0
      ? `Encore ${toBonus} jour${toBonus > 1 ? 's' : ''} de matchs classés pour activer le +10% d'ELO.`
      : 'Joue un match classé chaque jour : +10% d\'ELO dès 3 jours d\'affilée, et des paliers de coins.';
  return (
    <div className="rounded-2xl border border-orange-400/20 bg-gradient-to-br from-orange-500/[0.08] to-bg-1/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Flame
            className={`w-7 h-7 shrink-0 ${current > 0 ? 'text-orange-400' : 'text-muted-2'}`}
            fill={current > 0 ? 'currentColor' : 'none'}
            strokeWidth={2}
          />
          <div className="min-w-0">
            <div className="font-extrabold text-text-strong text-sm flex items-center gap-2">
              Série d'assiduité
              {eloActive && (
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-300 bg-orange-500/15 border border-orange-400/30 rounded px-1.5 py-0.5">
                  +10% ELO
                </span>
              )}
            </div>
            <div className="text-[12px] text-muted-2 mt-0.5">
              {current > 0 ? `${current} jour${current > 1 ? 's' : ''} de matchs classés` : 'Aucune série en cours'}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-extrabold tabular-nums text-orange-400 leading-none">{current}</div>
          <div className="text-[10px] text-muted-2 mt-1">record {best}</div>
        </div>
      </div>

      {/* Progression vers le prochain palier de coins */}
      <div className="mt-3 flex items-center gap-3">
        <div className="relative h-2 flex-1 rounded-full bg-bg-2/80 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] font-mono text-muted-2 tabular-nums shrink-0 inline-flex items-center gap-1">
          J{next.day} · +{next.coins}
          <img src="/42coin.webp" alt="" className="w-3 h-3" />
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-2 leading-snug">{hint}</p>
    </div>
  );
}

/**
 * Carte « Récolte du jour » : récompense légère (XP + coins) à réclamer 1×/jour
 * juste en venant sur le site — indépendante des matchs. Le montant grimpe avec
 * les jours consécutifs. `onClaimed` recharge l'état (solde + me) après succès.
 */
export function DailyClaimCard({
  daily,
  onClaimed,
}: {
  daily: DailyClaimView;
  onClaimed?: () => void;
}) {
  const [claiming, setClaiming] = useState(false);
  const { streak, claimedToday, reward, next } = daily;

  const claim = useCallback(async () => {
    if (claiming || claimedToday) return;
    setClaiming(true);
    try {
      await api.claimDaily();
      trackEvent('daily.claim');
      onClaimed?.();
    } catch {
      // 409 (déjà pris) ou erreur réseau : on recharge pour resynchroniser l'état.
      onClaimed?.();
    } finally {
      setClaiming(false);
    }
  }, [claiming, claimedToday, onClaimed]);

  return (
    <div className="rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/[0.10] to-bg-1/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Gift className={`w-7 h-7 shrink-0 ${claimedToday ? 'text-muted-2' : 'text-gold'}`} strokeWidth={2} />
          <div className="min-w-0">
            <div className="font-extrabold text-text-strong text-sm">Récolte du jour</div>
            <div className="text-[12px] text-muted-2 mt-0.5">
              {streak > 0 ? `Jour ${streak} d'affilée` : 'Première récolte'}
              {claimedToday ? ' · déjà prise ✓' : ''}
            </div>
          </div>
        </div>
        {/* Récompense du jour : XP + coins, mise en avant. */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="inline-flex items-center gap-1 rounded-md bg-[#2cc3ff]/15 border border-[#2cc3ff]/30 px-1.5 py-0.5 text-[#7fe0ff] text-[11px] font-black tabular-nums">
            +{reward.xp} XP
          </span>
          <span className="text-gold font-extrabold text-sm inline-flex items-center gap-1">
            +<Coins value={reward.coins} />
          </span>
        </div>
      </div>

      {/* Tick box / action de récolte */}
      <button
        type="button"
        disabled={claimedToday || claiming}
        onClick={claim}
        className={`mt-3 w-full h-10 rounded-xl text-xs font-extrabold uppercase tracking-[0.14em] tap-transparent transition-colors flex items-center justify-center gap-2 ${
          claimedToday
            ? 'border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 cursor-default'
            : 'border border-gold/45 bg-gold/15 text-gold hover:bg-gold/25'
        }`}
      >
        {claimedToday ? (
          <>
            <Check className="w-4 h-4" strokeWidth={3} />
            Récoltée · reviens demain
          </>
        ) : (
          <>{claiming ? 'Récolte…' : 'Récolter'}</>
        )}
      </button>

      <p className="mt-1.5 text-[11px] text-muted-2 leading-snug">
        Reviens chaque jour : la récompense grimpe tant que tu ne sautes pas plus d'un jour.
        {' '}Demain (jour {streak + 1}) : +{next.xp} XP · +{next.coins} coins.
      </p>
    </div>
  );
}
