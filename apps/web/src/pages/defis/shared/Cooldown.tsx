import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { fmtCountdown } from '../../../lib/format';

/** Délai (heures) avant l'échéance — doit rester aligné sur le back (48h). */
export const ACCEPT_COOLDOWN_HOURS = 48;

/** Échéance = `from` (createdAt / declaredAt) + 48h, en ISO. */
export function cooldownDeadline(fromIso: string, hours = ACCEPT_COOLDOWN_HOURS): string {
  return new Date(new Date(fromIso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

interface CooldownProps {
  /** Date de départ (ISO) à laquelle s'ajoutent les 48h — createdAt d'un défi, declaredAt d'un match. */
  from: string;
  /** Texte devant le compte à rebours (ex. « Expire dans », « Auto-validé dans »). */
  label: string;
  /** Texte affiché une fois l'échéance passée (le balayage serveur règle le reste sous peu). */
  expiredLabel: string;
  hours?: number;
  className?: string;
}

/**
 * Badge de compte à rebours « cooldown 48h ». Visible sur les défis reçus (avant
 * expiration) et les matchs déclarés à confirmer (avant auto-validation). Se
 * rafraîchit chaque seconde sous 1h, sinon chaque minute. Vire à l'ambre puis au
 * rouge à l'approche de l'échéance pour matérialiser l'urgence.
 */
export function Cooldown({ from, label, expiredLabel, hours = ACCEPT_COOLDOWN_HOURS, className = '' }: CooldownProps) {
  const deadline = cooldownDeadline(from, hours);
  const remaining = new Date(deadline).getTime() - Date.now();
  // Rafraîchissement fin sous la dernière heure (les secondes bougent), large sinon.
  const [, setTick] = useState(0);
  useEffect(() => {
    const everyMs = remaining > 60 * 60 * 1000 ? 60_000 : 1_000;
    const id = setInterval(() => setTick((n) => n + 1), everyMs);
    return () => clearInterval(id);
  }, [remaining]);

  const expired = remaining <= 0;
  // Palette d'urgence : muted (>12h), ambre (≤12h), rouge (≤2h ou expiré).
  const tone = expired || remaining <= 2 * 60 * 60 * 1000
    ? 'bg-red-500/15 text-red-300 ring-red-500/30'
    : remaining <= 12 * 60 * 60 * 1000
      ? 'bg-amber-500/15 text-amber-300 ring-amber-500/30'
      : 'bg-white/5 text-muted ring-white/10';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${tone} ${className}`}
      title={`${label} ${expired ? expiredLabel : fmtCountdown(deadline)}`}
    >
      <Clock className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">
        {expired ? expiredLabel : `${label} ${fmtCountdown(deadline)}`}
      </span>
    </span>
  );
}
