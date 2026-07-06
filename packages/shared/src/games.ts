import {
  calculateBabyfootElo,
  calculateChessElo,
  calculateSmashElo,
  type EloUpdate,
  type Winner,
} from './elo.js';
import type { Game } from './schemas.js';

/**
 * ─── Game Registry ───────────────────────────────────────────────────────────
 *
 * Source de vérité UNIQUE et partagée (front + back) décrivant chaque discipline.
 * Toute la logique « par jeu » (variation d'Elo, nature du score, présence de
 * nulle, rendu d'un résultat) est centralisée ici plutôt qu'éparpillée en
 * ternaires `isSmash ? … : isChess ? … : …`.
 *
 * 👉 Ajouter un jeu = ajouter UNE entrée à `GAMES` (+ sa fonction d'Elo dans
 *    elo.ts). Le cœur de l'application n'a pas à être touché.
 */

export type GameId = Game;

/** Nature du score d'une discipline. */
export type ScoringKind =
  | 'goals' // babyfoot : buts, un camp atteint 10
  | 'sets' // smash : games d'un set Bo3/Bo5
  | 'binary' // échecs : victoire / défaite (/ nulle)
  | 'darts'; // fléchettes : 301/501 multijoueur, classement par points restants

/**
 * Résultat brut d'un match, champs communs à toutes les disciplines. Les champs
 * optionnels ne concernent que certains jeux (smash : bestOf + vies du gagnant).
 */
export interface MatchOutcome {
  scoreA: number;
  scoreB: number;
  bestOf?: number | null;
  /** Vies (stocks) restantes du gagnant au game décisif — smash uniquement. */
  winnerStocks?: number | null;
}

/** Point de vue d'un joueur sur un résultat, pour l'affichage. */
export type Perspective = 'win' | 'loss' | 'draw';

export interface GameDef {
  id: GameId;
  /** Libellé affichable de la discipline. */
  label: string;
  /** Nature du score (pilote la saisie + l'affichage). */
  scoring: ScoringKind;
  /** La discipline autorise-t-elle la nulle ? (échecs) */
  hasDraw: boolean;
  /** Format de set par défaut (smash). */
  defaultBestOf?: number;
  /** Variation d'Elo de la discipline — signature uniforme, pilotée par le registry. */
  elo(ratingA: number, ratingB: number, winner: Winner, outcome: MatchOutcome): EloUpdate;
  /** Rendu court d'un score « du point de vue A » : "10-4" | "2-1" | "1-0" | "½-½". */
  formatScore(scoreA: number, scoreB: number): string;
  /** Libellé d'un résultat selon le point de vue (gagné / perdu / nul). */
  outcomeLabel(perspective: Perspective): string;
  /**
   * Avantage tiré au pile-ou-face avant un duel de tournoi : le gagnant du toss
   * choisit une option adaptée au jeu (balle/terrain, couleur, stage, commencer).
   * `complementary` → l'option NON choisie revient automatiquement à l'adversaire.
   */
  advantage?: {
    /** Intro affichée (ex « Le gagnant choisit la balle ou le terrain »). */
    label: string;
    options: { key: string; label: string; icon: string }[];
    complementary: boolean;
  };
}

export const GAMES: Record<GameId, GameDef> = {
  babyfoot: {
    id: 'babyfoot',
    label: 'Babyfoot',
    scoring: 'goals',
    hasDraw: false,
    elo: (a, b, w, o) => calculateBabyfootElo(a, b, w, o.scoreA, o.scoreB),
    formatScore: (a, b) => `${a}-${b}`,
    outcomeLabel: (p) => (p === 'win' ? 'Victoire' : p === 'loss' ? 'Défaite' : 'Nul'),
    advantage: {
      label: 'Le gagnant choisit son avantage',
      options: [
        { key: 'ball', label: 'La balle', icon: '⚽' },
        { key: 'terrain', label: 'Le terrain', icon: '🥅' },
      ],
      complementary: true,
    },
  },
  smash: {
    id: 'smash',
    label: 'Smash',
    scoring: 'sets',
    hasDraw: false,
    defaultBestOf: 3,
    elo: (a, b, w, o) =>
      calculateSmashElo(a, b, w, o.scoreA, o.scoreB, o.bestOf ?? 3, o.winnerStocks ?? 1),
    formatScore: (a, b) => `${a}-${b}`,
    outcomeLabel: (p) => (p === 'win' ? 'Victoire' : p === 'loss' ? 'Défaite' : 'Nul'),
    advantage: {
      label: 'Le gagnant choisit le stage',
      options: [{ key: 'stage', label: 'Choisir le stage', icon: '🎮' }],
      complementary: false,
    },
  },
  chess: {
    id: 'chess',
    label: 'Échecs',
    scoring: 'binary',
    hasDraw: true,
    elo: (a, b, w) => calculateChessElo(a, b, w),
    // Score binaire stocké 1-0 / 0-1 ; la nulle (futur) se rend "½-½".
    formatScore: (a, b) => (a === b ? '½-½' : a > b ? '1-0' : '0-1'),
    outcomeLabel: (p) => (p === 'win' ? 'Victoire' : p === 'loss' ? 'Défaite' : 'Nulle'),
    advantage: {
      label: 'Le gagnant choisit sa couleur',
      options: [
        { key: 'white', label: 'Les Blancs', icon: '♔' },
        { key: 'black', label: 'Les Noirs', icon: '♚' },
      ],
      complementary: true,
    },
  },
  // Street Fighter == Smash mécaniquement (set Bo3/Bo5, persos, même Elo), mais
  // discipline distincte (rating + roster + branding propres).
  streetfighter: {
    id: 'streetfighter',
    label: 'Street Fighter',
    scoring: 'sets',
    hasDraw: false,
    defaultBestOf: 3,
    elo: (a, b, w, o) =>
      calculateSmashElo(a, b, w, o.scoreA, o.scoreB, o.bestOf ?? 3, o.winnerStocks ?? 1),
    formatScore: (a, b) => `${a}-${b}`,
    outcomeLabel: (p) => (p === 'win' ? 'Victoire' : p === 'loss' ? 'Défaite' : 'Nul'),
    advantage: {
      label: 'Le gagnant choisit le stage',
      options: [{ key: 'stage', label: 'Choisir le stage', icon: '🥊' }],
      complementary: false,
    },
  },
  // Fléchettes : discipline MULTIJOUEUR (2..8, 301/501). L'Elo réel est calculé
  // par `calculateDartsElo` sur le chemin de règlement dédié (cf. settle darts),
  // pas via ce `elo()` 2-joueurs — qui n'est ici qu'un repli binaire inutilisé.
  flechettes: {
    id: 'flechettes',
    label: 'Fléchettes',
    scoring: 'darts',
    hasDraw: false,
    elo: (a, b, w) => calculateChessElo(a, b, w),
    formatScore: (a, b) => `${a}-${b}`,
    outcomeLabel: (p) => (p === 'win' ? 'Victoire' : p === 'loss' ? 'Défaite' : 'Nul'),
    advantage: {
      label: 'Le gagnant commence',
      options: [{ key: 'first', label: 'Commencer', icon: '🎯' }],
      complementary: false,
    },
  },
  // Coding : discipline BINAIRE (gagné / perdu, pas de nulle). Mécaniquement calquée
  // sur les échecs (même Elo), sans nulle. Le lien d'invitation éventuel est une
  // métadonnée du défi, sans effet sur l'Elo (identique quel que soit le site).
  coding: {
    id: 'coding',
    label: 'Coding',
    scoring: 'binary',
    hasDraw: false,
    elo: (a, b, w) => calculateChessElo(a, b, w),
    formatScore: (a, b) => (a > b ? '1-0' : '0-1'),
    outcomeLabel: (p) => (p === 'win' ? 'Victoire' : p === 'loss' ? 'Défaite' : 'Nul'),
    advantage: {
      label: 'Le gagnant commence',
      options: [{ key: 'first', label: 'Commencer', icon: '💻' }],
      complementary: false,
    },
  },
  // Pokémon : discipline BINAIRE (gagné / perdu, pas de nulle), calquée sur les
  // échecs (même Elo) sans la nulle.
  pokemon: {
    id: 'pokemon',
    label: 'Pokémon',
    scoring: 'binary',
    hasDraw: false,
    elo: (a, b, w) => calculateChessElo(a, b, w),
    formatScore: (a, b) => (a > b ? '1-0' : '0-1'),
    outcomeLabel: (p) => (p === 'win' ? 'Victoire' : p === 'loss' ? 'Défaite' : 'Nul'),
    advantage: {
      label: 'Le gagnant commence',
      options: [{ key: 'first', label: 'Commencer', icon: '🔴' }],
      complementary: false,
    },
  },
};

/** Toutes les disciplines, dans l'ordre d'affichage. */
export const GAME_IDS = Object.keys(GAMES) as GameId[];

/** Discipline par défaut (et valeur « legacy » des données antérieures au multi-jeu). */
export const DEFAULT_GAME: GameId = 'babyfoot';

/** Normalise une valeur quelconque en GameId (babyfoot par défaut). */
export function parseGameId(value: unknown): GameId {
  return value === 'smash' ||
    value === 'chess' ||
    value === 'streetfighter' ||
    value === 'flechettes' ||
    value === 'coding' ||
    value === 'pokemon'
    ? value
    : 'babyfoot';
}

/** Récupère la définition d'une discipline (retombe sur babyfoot si inconnue). */
export function getGameDef(game: GameId): GameDef {
  return GAMES[game] ?? GAMES.babyfoot;
}

/** Avantage de pile-ou-face d'une discipline (fallback générique si non défini). */
export function getGameAdvantage(game: GameId): NonNullable<GameDef['advantage']> {
  return (
    getGameDef(game).advantage ?? {
      label: 'Le gagnant choisit',
      options: [{ key: 'choice', label: 'Choisir', icon: '🎲' }],
      complementary: false,
    }
  );
}

/**
 * Variation d'Elo pilotée par le registry — point d'entrée unique, toutes
 * disciplines. Remplace le `isSmash ? calculateSmashElo : …` historique.
 */
export function applyGameElo(
  game: GameId,
  ratingA: number,
  ratingB: number,
  winner: Winner,
  outcome: MatchOutcome,
): EloUpdate {
  return getGameDef(game).elo(ratingA, ratingB, winner, outcome);
}

/**
 * Valide la forme d'un score de match de TOURNOI selon la discipline. Les
 * tournois ne stockent pas bestOf/persos : on valide uniquement la cohérence du
 * score. Renvoie un message d'erreur, ou `null` si valide. Le bracket impose un
 * vainqueur (pas de nul).
 */
export function validateTournamentScore(
  game: GameId,
  scoreA: number,
  scoreB: number,
  opts?: { freeGoals?: boolean; allowDraw?: boolean },
): string | null {
  const scoring = getGameDef(game).scoring;
  // Le nul n'est autorisé qu'avec allowDraw (phase de ligue, classement au goal
  // average) ET en discipline « aux buts ». Partout ailleurs il faut un vainqueur :
  // en élimination directe pour propager, et en sets/binaire le format est décisif.
  if (scoreA === scoreB && !(scoring === 'goals' && opts?.allowDraw)) {
    return 'il faut un vainqueur (pas de match nul)';
  }
  const hi = Math.max(scoreA, scoreB);
  const lo = Math.min(scoreA, scoreB);
  switch (scoring) {
    case 'goals':
      // Score libre des deux camps (freeGoals : ligue ET phase finale) — on exige
      // seulement des buts positifs (un éventuel nul est déjà filtré ci-dessus selon
      // allowDraw). Sinon (poules) le vainqueur atteint 10 (le perdant borné -10..9).
      if (opts?.freeGoals) return lo >= 0 ? null : 'score de buts négatif invalide';
      return hi === 10 ? null : 'un camp doit atteindre 10 buts';
    case 'binary':
      // Échecs : 1-0.
      return hi === 1 && lo === 0 ? null : 'résultat binaire attendu (1-0)';
    case 'sets':
      // Smash : vainqueur 1 à 3 games gagnés, perdant strictement moins.
      if (lo < 0) return 'score de set invalide';
      return hi >= 1 && hi <= 3 ? null : 'score de set invalide (1 à 3 games gagnés)';
    case 'darts':
      // Fléchettes : multijoueur, pas de format tournoi.
      return 'les fléchettes ne se jouent pas en tournoi';
  }
}
