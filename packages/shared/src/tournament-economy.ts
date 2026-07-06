// ─────────────────────────────────────────────────────────────────────────────
// Économie des tournois : multiplicateur de pari progressif + cash-prize par palier.
// Logique PURE (aucun accès DB) → testable et partagée backend/front.
//
// Principe commun : tout est indexé sur le NOMBRE DE TOURS GAGNÉS par le sujet
// (joueur/équipe) dans le bracket à élimination directe.
//   - 0 tour gagné            → rien (mise de pari perdue, cash-prize nul) ;
//   - `totalRounds` tours     → champion (gain maximal) ;
//   - paliers intermédiaires  → interpolés linéairement.
//
// `totalRounds` = nombre de tours du bracket (8 équipes → 3, 16 → 4, 32 → 5…).
// ─────────────────────────────────────────────────────────────────────────────

/** Multiplicateur final par défaut d'un pari sur le vainqueur (amicaux). */
export const DEFAULT_BET_FINAL_MULT = 2;

/**
 * Multiplicateur de gain d'un pari, selon les tours franchis par le pronostic.
 *
 *   mult(k) = 1 + (finalMult − 1) · k / totalRounds     (k ≥ 1)
 *   mult(0) = 0  → mise perdue (« pas de gain si tu passes aucun tour »).
 *
 * Le champion (k = totalRounds) atteint exactement `finalMult`. Ex. bracket de
 * 16 (4 tours), final ×2 : 1 tour → ×1.25, 2 → ×1.5, 3 → ×1.75, 4 → ×2.
 */
export function betMultiplier(roundsWon: number, totalRounds: number, finalMult: number): number {
  if (roundsWon <= 0 || totalRounds <= 0) return 0;
  const k = Math.min(roundsWon, totalRounds);
  return 1 + (finalMult - 1) * (k / totalRounds);
}

/** Gain (coins) d'un pari de mise `stake` pour un pronostic ayant franchi `roundsWon` tours. */
export function betPayout(
  stake: number,
  roundsWon: number,
  totalRounds: number,
  finalMult: number,
): number {
  return Math.round(stake * betMultiplier(roundsWon, totalRounds, finalMult));
}

/**
 * Cash-prize (coins) d'un participant selon les tours franchis — proportionnel au
 * tour atteint, le champion touchant `base` :
 *
 *   prize(k) = round(base · k / totalRounds)      (k ≥ 1)
 *   prize(0) = 0
 *
 * Ex. base 10000 sur un bracket de 16 (4 tours) : champion 10000, finaliste 7500,
 * demi-finaliste 5000, éliminé au 1er tour gagné 2500, sorti d'entrée 0.
 */
export function cashPrizeForRounds(roundsWon: number, totalRounds: number, base: number): number {
  if (roundsWon <= 0 || totalRounds <= 0 || base <= 0) return 0;
  const k = Math.min(roundsWon, totalRounds);
  return Math.round(base * (k / totalRounds));
}

/**
 * Bonus d'Elo (points) du champion d'un tournoi, selon son type (`Tournament.kind`).
 * Versé une seule fois à la finale. Les officiels « comptent double » : un tournoi
 * officiel rapporte 100 au vainqueur, un amical seulement 50. Les paliers inférieurs
 * sont interpolés sur ce plafond → ils se répartissent en conséquence (cf.
 * `tournamentEloReward`).
 */
export const TOURNAMENT_ELO_WINNER_OFFICIAL = 100;
export const TOURNAMENT_ELO_WINNER_FRIENDLY = 50;

/** Plafond d'Elo (gain du champion) d'un tournoi selon son `kind`. */
export function tournamentEloMax(kind: string): number {
  return kind === 'official' ? TOURNAMENT_ELO_WINNER_OFFICIAL : TOURNAMENT_ELO_WINNER_FRIENDLY;
}

/** @deprecated Utiliser `tournamentEloMax(kind)`. Conservé = plafond officiel (100). */
export const TOURNAMENT_ELO_WINNER = TOURNAMENT_ELO_WINNER_OFFICIAL;

/**
 * Bonus d'Elo gagné par un participant au terme d'un tournoi, selon le palier
 * atteint. Le champion touche `max` (100 par défaut), un joueur sorti dès la
 * phase de qualification touche 0, et les paliers intermédiaires sont interpolés
 * linéairement jusqu'au champion.
 *
 * La « phase de qualification » dépend du format (cf. schéma `Tournament.format`) :
 *   - `elimination` : le 1er tour du bracket EST la qualif. 0 tour gagné → 0 ;
 *     champion (`totalBracketRounds` tours) → `max`. bonus = round(max · k / R).
 *   - `pools` / `league` : franchir les poules / la phase de ligue est un palier à
 *     part entière. Non qualifié (absent du bracket) → 0. Sinon le palier de
 *     qualification compte comme un tour, et le total devient `R + 1` :
 *     bonus = round(max · (1 + k) / (R + 1)) — un qualifié sorti au 1er tour de
 *     bracket touche donc déjà max/(R+1), et le champion `max`.
 *
 * @param qualified présent dans le bracket (a franchi poules/ligue) — ignoré en
 *   élimination directe où tout le monde démarre dans le bracket.
 * @param bracketRoundsWon tours de bracket gagnés (byes compris), borné à `R`.
 */
export function tournamentEloReward(params: {
  format: string;
  qualified: boolean;
  bracketRoundsWon: number;
  totalBracketRounds: number;
  max?: number;
}): number {
  const max = params.max ?? TOURNAMENT_ELO_WINNER;
  const R = params.totalBracketRounds;
  if (R <= 0 || max <= 0) return 0;
  const k = Math.max(0, Math.min(params.bracketRoundsWon, R));
  if (params.format === 'pools' || params.format === 'league') {
    if (!params.qualified) return 0;
    return Math.round((max * (1 + k)) / (R + 1));
  }
  // Élimination directe : pas de palier de qualification distinct.
  return Math.round((max * k) / R);
}

// ─── Gains d'Elo par PLACEMENT final ──────────────────────────────────────────
// Nouveau barème (remplace l'interpolation par tour pour le versement) : seuls les
// QUATRE premiers du tournoi touchent un bonus d'Elo, fixe et identique pour tous
// les types de tournois (amical comme officiel). En 2v2, CHAQUE membre de l'équipe
// touche le montant plein.
//   1er → 100 · 2e → 75 · 3e → 50 · 4e → 25 · au-delà → 0

/** Barème d'Elo par placement (index 0 = 1er). */
export const TOURNAMENT_ELO_PLACEMENTS = [100, 75, 50, 25] as const;

/** Bonus d'Elo d'un placement (1-indexé) : 1 → 100, 2 → 75, 3 → 50, 4 → 25, sinon 0. */
export function tournamentEloForPlacement(rank: number): number {
  return TOURNAMENT_ELO_PLACEMENTS[rank - 1] ?? 0;
}

// ─── Gains d'XP (passe de combat) par PLACEMENT final ────────────────────────
// Gros buff de fin de tournoi, exprimé en NIVEAUX du passe gagnés d'un coup (l'XP
// réelle est dérivée serveur selon le niveau courant du joueur, cf. index.ts).
// Seuls les QUATRE premiers touchent de l'XP ; au-delà → rien. Même dégressivité
// que l'Elo ([1, ¾, ½, ¼] du montant du 1er) :
//   • Officiel  → 1er 6 niveaux · 2e 4,5 · 3e 3 · 4e 1,5
//   • Amical    → 1er 2 niveaux · 2e 1,5 · 3e 1 · 4e 0,5
// En 2v2, CHAQUE membre de l'équipe touche le montant plein.
export const TOURNAMENT_XP_LEVELS_OFFICIAL = [6, 4.5, 3, 1.5] as const;
export const TOURNAMENT_XP_LEVELS_CASUAL = [2, 1.5, 1, 0.5] as const;

/**
 * Nombre de niveaux du passe offerts pour un placement (1-indexé) selon que le
 * tournoi est officiel ou amical. Au-delà du 4e → 0.
 */
export function tournamentXpLevelsForPlacement(rank: number, official: boolean): number {
  const scale = official ? TOURNAMENT_XP_LEVELS_OFFICIAL : TOURNAMENT_XP_LEVELS_CASUAL;
  return scale[rank - 1] ?? 0;
}

/** Sous-ensemble d'un match de bracket nécessaire au calcul des placements. */
export interface PlacementMatch {
  round: number;
  playerALogin: string | null;
  playerBLogin: string | null;
  winnerLogin: string | null;
}

/**
 * Placements finaux [1er, 2e, 3e, 4e] (logins capitaines, null si indéterminé)
 * dérivés des matchs de BRACKET d'un tournoi terminé :
 *   - 1er = vainqueur de la finale ; 2e = son adversaire ;
 *   - 3e = le demi-finaliste battu par le CHAMPION (il a buté sur le futur
 *     vainqueur — convention sans petite finale) ; 4e = l'autre demi-finaliste.
 * Bracket à 2 joueurs (1 round) → pas de 3e/4e. Byes → cases null tolérées.
 */
export function tournamentPlacements(
  bracket: PlacementMatch[],
): [string | null, string | null, string | null, string | null] {
  if (bracket.length === 0) return [null, null, null, null];
  const maxRound = Math.max(...bracket.map((m) => m.round));
  const final = bracket.find((m) => m.round === maxRound && m.winnerLogin) ?? null;
  const first = final?.winnerLogin ?? null;
  const second =
    final && first ? (final.playerALogin === first ? final.playerBLogin : final.playerALogin) : null;

  // Demi-finales : perdant = l'autre joueur du match (absent sur un bye).
  const semis = bracket.filter((m) => m.round === maxRound - 1 && m.winnerLogin);
  const losers = semis
    .map((m) => ({
      winner: m.winnerLogin!,
      loser: m.playerALogin === m.winnerLogin ? m.playerBLogin : m.playerALogin,
    }))
    .filter((x) => !!x.loser);
  let third: string | null = null;
  let fourth: string | null = null;
  if (losers.length === 1) {
    third = losers[0]!.loser;
  } else if (losers.length >= 2) {
    const vsChampion = losers.find((x) => x.winner === first);
    const other = losers.find((x) => x !== vsChampion) ?? null;
    third = vsChampion?.loser ?? losers[0]!.loser;
    fourth = (vsChampion ? other?.loser : losers[1]!.loser) ?? null;
  }
  return [first, second, third, fourth];
}
