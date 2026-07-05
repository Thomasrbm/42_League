/**
 * Économie des émotes de victoire (narguage) — MÊME liste et MÊMES règles que
 * le backend (TAUNT_EMOTES / tauntEmoteUnlockLevel dans apps/backend/src/index.ts),
 * à garder en synchro :
 *  - index 0        : émote par défaut de tout le monde ;
 *  - index 1-2      : gratuites ;
 *  - index 3 et +   : débloquées par le passe de combat, une tous les 7 niveaux
 *                     (niveau 7, 14, 21, … 49).
 */
export const TAUNT_EMOTES = ['😂', '💀', '🤡', '😎', '🥱', '🐐', '🔥', '🕺', '🧂', '😭'] as const;

export const DEFAULT_TAUNT_EMOTE = TAUNT_EMOTES[0];

/** Nombre d'émotes gratuites (défaut inclus) en tête de liste. */
export const FREE_TAUNT_EMOTES = 3;

/** Une émote payante se débloque tous les N niveaux de passe. */
export const TAUNT_EMOTE_LEVEL_STEP = 7;

/** Niveau de passe requis pour équiper l'émote (0 = gratuite). */
export function tauntEmoteUnlockLevel(emote: string): number {
  const idx = (TAUNT_EMOTES as readonly string[]).indexOf(emote);
  if (idx < FREE_TAUNT_EMOTES) return 0;
  return (idx - FREE_TAUNT_EMOTES + 1) * TAUNT_EMOTE_LEVEL_STEP;
}
