import { K } from './elo.js';
import type { EloUpdate, Winner } from './elo.js';
import { ELO_HARD_FLOOR } from './rank.js';

// ─── Babyfoot 2v2 — ELO utilitaires ─────────────────────────────────────────
//
// Ce module est STRICTEMENT réservé au mode 2v2 du Babyfoot.
// Les autres jeux (smash, chess, babyfoot 1v1) ne touchent pas ces fonctions.
//
// Deux calculs sont effectués à chaque match :
//   Calcul A (Équipe)      — les ELO des entités BabyfootTeam s'affrontent.
//   Calcul B (Individuel)  — chaque joueur est évalué face à la MOYENNE adverse
//                            pour éviter le « carry » sans pénalité.

// ─── Initialisation de l'ELO d'un nouveau duo ────────────────────────────────

/** Poids du joueur le plus fort dans l'ELO initial du duo. */
export const TEAM_ELO_STRONG_WEIGHT = 0.65;
/** Poids du joueur le plus faible dans l'ELO initial du duo. */
export const TEAM_ELO_WEAK_WEIGHT = 0.35;

/**
 * Calcule l'ELO initial d'un duo Babyfoot selon la règle « Pondération Carry » :
 *
 *   ELO_Team = MAX(ELO_J1, ELO_J2) × 0.65 + MIN(ELO_J1, ELO_J2) × 0.35
 *
 * Le joueur fort a plus d'impact car au babyfoot le meilleur des deux pilote
 * davantage le résultat (attaque / vitesse d'exécution).
 */
export function initTeamElo(elo1: number, elo2: number): number {
  const strong = Math.max(elo1, elo2);
  const weak = Math.min(elo1, elo2);
  return Math.round(strong * TEAM_ELO_STRONG_WEIGHT + weak * TEAM_ELO_WEAK_WEIGHT);
}

// ─── Calcul A : affrontement des entités BabyfootTeam ────────────────────────

/**
 * Calcul A — Formule ELO classique (K=32, pas de bonus d'upset ni de
 * multiplicateur de marge) appliquée aux ELO des entités BabyfootTeam.
 *
 * Résultat utilisé pour mettre à jour `BabyfootTeam.elo`.
 */
export function calculateTeamElo(
  teamAElo: number,
  teamBElo: number,
  winner: Winner,
): EloUpdate {
  const pA = 1 / (1 + Math.pow(10, (teamBElo - teamAElo) / 400));
  const pB = 1 - pA;

  const scoreA = winner === 'A' ? 1 : 0;
  const scoreB = 1 - scoreA;

  const deltaA = Math.round(K * (scoreA - pA));
  const deltaB = Math.round(K * (scoreB - pB));

  return {
    newA: teamAElo + deltaA,
    newB: teamBElo + deltaB,
    deltaA,
    deltaB,
  };
}

// ─── Calcul B : ELO individuel « Anti-Carry » ────────────────────────────────

/**
 * Calcul B — Met à jour l'ELO PERSONNEL d'un joueur en le confrontant à la
 * MOYENNE des ELO adverses, indépendamment de son coéquipier.
 *
 * Étape 1 : Moyenne_Adv = (ELO_Opp1 + ELO_Opp2) / 2
 * Étape 2 : P_A = 1 / (1 + 10^((Moyenne_Adv − ELO_A) / 400))
 * Étape 3 : Nouvel_ELO_A = ELO_A + K × (Score_Réel − P_A)
 *
 * Propriétés garanties :
 *   • Victoire → joueur faible gagne beaucoup, joueur fort gagne peu.
 *   • Défaite  → joueur fort perd beaucoup, joueur faible perd peu.
 *
 * @param playerElo      ELO personnel du joueur avant le match.
 * @param avgOpponentElo Moyenne des ELO des deux adversaires.
 * @param won            true si l'équipe du joueur a gagné.
 */
export function calculateIndividualEloIn2v2(
  playerElo: number,
  avgOpponentElo: number,
  won: boolean,
): { newElo: number; delta: number } {
  const p = 1 / (1 + Math.pow(10, (avgOpponentElo - playerElo) / 400));
  const score = won ? 1 : 0;
  // Plancher absolu : l'ELO personnel ne descend jamais sous ELO_HARD_FLOOR.
  const delta = Math.max(Math.round(K * (score - p)), ELO_HARD_FLOOR - playerElo);
  return { newElo: playerElo + delta, delta };
}

// ─── Point d'entrée unique pour un match 2v2 complet ─────────────────────────

export interface Team2v2Input {
  /** ELO de l'entité BabyfootTeam (Calcul A). */
  teamElo: number;
  /** ELO personnel du premier joueur de l'équipe (Calcul B). */
  player1Elo: number;
  /** ELO personnel du second joueur de l'équipe (Calcul B). */
  player2Elo: number;
}

export interface Match2v2EloResult {
  /** Deltas pour les entités BabyfootTeam (Calcul A). */
  team: {
    deltaA: number;
    deltaB: number;
    newTeamAElo: number;
    newTeamBElo: number;
  };
  /**
   * Deltas individuels des 4 joueurs (Calcul B — Anti-Carry).
   * A1/A2 = joueurs de l'équipe A, B1/B2 = joueurs de l'équipe B.
   */
  individual: {
    deltaA1: number; newEloA1: number;
    deltaA2: number; newEloA2: number;
    deltaB1: number; newEloB1: number;
    deltaB2: number; newEloB2: number;
  };
}

/**
 * Calcule tous les deltas ELO pour un match 2v2 de Babyfoot en une seule passe.
 *
 * Enchaîne :
 *   • Calcul A — `calculateTeamElo` sur les ELO d'équipe.
 *   • Calcul B — `calculateIndividualEloIn2v2` pour chacun des 4 joueurs.
 */
export function calculate2v2BabyfootElo(
  teamA: Team2v2Input,
  teamB: Team2v2Input,
  winner: Winner,
): Match2v2EloResult {
  // ── Calcul A ──────────────────────────────────────────────────────────────
  const teamUpdate = calculateTeamElo(teamA.teamElo, teamB.teamElo, winner);

  // ── Calcul B ──────────────────────────────────────────────────────────────
  const teamAWon = winner === 'A';
  // Moyenne adverse vue par les joueurs A  →  ELO de l'équipe B individuelle
  const avgB = (teamB.player1Elo + teamB.player2Elo) / 2;
  // Moyenne adverse vue par les joueurs B
  const avgA = (teamA.player1Elo + teamA.player2Elo) / 2;

  const a1 = calculateIndividualEloIn2v2(teamA.player1Elo, avgB, teamAWon);
  const a2 = calculateIndividualEloIn2v2(teamA.player2Elo, avgB, teamAWon);
  const b1 = calculateIndividualEloIn2v2(teamB.player1Elo, avgA, !teamAWon);
  const b2 = calculateIndividualEloIn2v2(teamB.player2Elo, avgA, !teamAWon);

  return {
    team: {
      deltaA: teamUpdate.deltaA,
      deltaB: teamUpdate.deltaB,
      newTeamAElo: teamUpdate.newA,
      newTeamBElo: teamUpdate.newB,
    },
    individual: {
      deltaA1: a1.delta, newEloA1: a1.newElo,
      deltaA2: a2.delta, newEloA2: a2.newElo,
      deltaB1: b1.delta, newEloB1: b1.newElo,
      deltaB2: b2.delta, newEloB2: b2.newElo,
    },
  };
}
