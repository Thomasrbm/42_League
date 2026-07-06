import type { Game } from './api';

/**
 * Source minimale de stats par discipline. Structurel → compatible aussi bien
 * avec `MeResponse['user']` (mon profil) qu'avec `UserProfile['user']` (fiche
 * d'un autre joueur) : les deux exposent l'ELO global + les colonnes par-jeu.
 */
export interface RatingSource {
  elo: number;
  matchesPlayed: number;
  tournamentsWon: number;
  eloSmash?: number;
  matchesPlayedSmash?: number;
  tournamentsWonSmash?: number;
  eloChess?: number;
  matchesPlayedChess?: number;
  tournamentsWonChess?: number;
  eloSf?: number;
  matchesPlayedSf?: number;
  tournamentsWonSf?: number;
  eloFlechettes?: number;
  matchesPlayedFlechettes?: number;
  tournamentsWonFlechettes?: number;
  eloCoding?: number;
  matchesPlayedCoding?: number;
  tournamentsWonCoding?: number;
  eloPokemon?: number;
  matchesPlayedPokemon?: number;
  tournamentsWonPokemon?: number;
  // Babyfoot 2v2 : rating personnel distinct du 1v1.
  eloBabyfoot2v2?: number;
  matchesPlayed2v2?: number;
}

/** Rating + compteurs du joueur pour une discipline donnée. */
export function pickRating(
  user: RatingSource,
  game: Game,
): { elo: number; matchesPlayed: number; tournamentsWon: number } {
  if (game === 'smash') {
    return {
      elo: user.eloSmash ?? 1000,
      matchesPlayed: user.matchesPlayedSmash ?? 0,
      tournamentsWon: user.tournamentsWonSmash ?? 0,
    };
  }
  if (game === 'chess') {
    return {
      elo: user.eloChess ?? 1000,
      matchesPlayed: user.matchesPlayedChess ?? 0,
      tournamentsWon: user.tournamentsWonChess ?? 0,
    };
  }
  if (game === 'streetfighter') {
    return {
      elo: user.eloSf ?? 1000,
      matchesPlayed: user.matchesPlayedSf ?? 0,
      tournamentsWon: user.tournamentsWonSf ?? 0,
    };
  }
  if (game === 'flechettes') {
    return {
      elo: user.eloFlechettes ?? 1000,
      matchesPlayed: user.matchesPlayedFlechettes ?? 0,
      tournamentsWon: user.tournamentsWonFlechettes ?? 0,
    };
  }
  if (game === 'coding') {
    return {
      elo: user.eloCoding ?? 1000,
      matchesPlayed: user.matchesPlayedCoding ?? 0,
      tournamentsWon: user.tournamentsWonCoding ?? 0,
    };
  }
  if (game === 'pokemon') {
    return {
      elo: user.eloPokemon ?? 1000,
      matchesPlayed: user.matchesPlayedPokemon ?? 0,
      tournamentsWon: user.tournamentsWonPokemon ?? 0,
    };
  }
  return {
    elo: user.elo,
    matchesPlayed: user.matchesPlayed,
    tournamentsWon: user.tournamentsWon,
  };
}
