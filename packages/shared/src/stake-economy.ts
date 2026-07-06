// ─────────────────────────────────────────────────────────────────────────────
// Économie des « matchs à enjeu » (matchs à parier).
//
// Un match à enjeu oppose deux participants qui misent CHACUN une grosse somme.
// La mise d'un participant fixe la COTE (multiplicateur, « audace ») des parieurs
// extérieurs qui misent sur LUI : plus il ose gros, plus ses parieurs gagnent —
// plafonnée pour borner l'inflation (les gains parieurs sont payés par la banque,
// cote fixe connue au moment du pari).
//
// - Parieur extérieur qui gagne : mise × cote du vainqueur (cote figée à l'annonce).
// - Participant gagnant : récupère SA mise + la mise de l'adversaire + un petit
//   bonus sur sa mise (toujours < cote des parieurs). Le perdant perd sa mise.
//
// Logique PURE (aucun accès DB) → testable et partagée backend/front.
// ─────────────────────────────────────────────────────────────────────────────

/** Mise minimale d'un participant (« grosse somme »). */
export const STAKE_MIN = 200;
/** Base du multiplicateur « audace » : cote = 1 + mise / BASE. */
export const STAKE_MULT_BASE = 250;
/** Plafond de la cote parieur (garde-fou anti-inflation, la banque paie). */
export const STAKE_MULT_CAP = 5;
/** Bonus du participant gagnant, en fraction de SA mise (×1.25 → 0.25). */
export const STAKE_PARTICIPANT_BONUS = 0.25;
/** Plafond de la mise d'un parieur extérieur (borne l'exposition de la banque). */
export const STAKE_BET_MAX = 1000;
/** Délai minimal entre la déclaration et le coup d'envoi (15 min). */
export const STAKE_LEAD_MIN_MS = 15 * 60 * 1000;

/**
 * Cote (multiplicateur) des parieurs qui misent sur un participant, dérivée de SA
 * mise (« audace ») et plafonnée :
 *
 *   cote(s) = min(CAP, 1 + s / BASE)
 *
 * Ex. BASE 250, CAP 5 : mise 250 → ×2, 500 → ×3, 1000 → ×5 (plafond), 2000 → ×5.
 */
export function stakeBetMultiplier(stake: number): number {
  if (stake <= 0) return 0;
  return Math.min(STAKE_MULT_CAP, 1 + stake / STAKE_MULT_BASE);
}

/** Gain (coins) d'un parieur extérieur de mise `bet` misée sur le vainqueur (cote fixe). */
export function stakeBetPayout(bet: number, winnerStake: number): number {
  if (bet <= 0) return 0;
  return Math.round(bet * stakeBetMultiplier(winnerStake));
}

/**
 * Gain (coins) crédité au PARTICIPANT gagnant : sa propre mise récupérée + la mise
 * de l'adversaire raflée + un petit bonus sur sa mise.
 *
 *   payout = ownStake + opponentStake + round(ownStake · BONUS)
 *
 * Gain NET du gagnant = opponentStake + round(ownStake · BONUS) (sa mise ayant été
 * séquestrée au départ). Le perdant, lui, perd toute sa mise.
 */
export function stakeWinnerPayout(ownStake: number, opponentStake: number): number {
  const own = Math.max(0, ownStake);
  const opp = Math.max(0, opponentStake);
  return own + opp + Math.round(own * STAKE_PARTICIPANT_BONUS);
}
