/**
 * Paliers de classement (RANKED TIER) par ELO.
 *
 * Framework-free (TS pur, pas de React) : importable côté backend comme côté front.
 *
 * Échelle (croissante) — resserrée pour que les grades soient plus accessibles :
 *   975–999      → Étain   (975 = plancher ABSOLU : l'ELO ne descend jamais dessous)
 *   1000–1049    → Bronze
 *   1050–1099    → Argent
 *   1100–1199    → Or
 *   >=1200       → Diamant
 *
 * `floor` = seuil minimal du palier. En fin de saison chacun repart au plancher
 * du grade JUSTE EN DESSOUS du sien (Or → Argent), sauf Bronze et Étain qui
 * restent à leur propre plancher (cf. seasonResetElo).
 */
export type RankTierKey = 'etain' | 'bronze' | 'argent' | 'or' | 'diamant' | 'grandmaster';

export interface RankTier {
  key: RankTierKey;
  /** Libellé français du palier. */
  label: string;
  /** ELO minimal (inclus) pour atteindre ce palier. */
  min: number;
  /** Plancher du palier = cible de reset (seuil minimal du grade). */
  floor: number;
  /** Couleur hex associée au palier (texte / bordure / fond léger). */
  color: string;
}

/**
 * Plancher ELO absolu : quel que soit le match, un joueur ne descend jamais
 * sous 975. Appliqué dans les moteurs Elo (cf. elo.ts) — et battre un joueur
 * dans la zone plancher ne rapporte presque rien (anti-farm).
 */
export const ELO_HARD_FLOOR = 975;

// Étain : le plus bas palier — gris ardoise sombre et terne (métal pauvre),
// délibérément éloigné de l'Argent (#dfe4ea, clair et brillant) pour qu'on
// distingue les deux bagues au premier coup d'œil.
const ETAIN: RankTier = { key: 'etain', label: 'Étain', min: 0, floor: ELO_HARD_FLOOR, color: '#565b61' };

/** Table des paliers, ordonnée par ELO croissant. */
export const RANK_TIERS: readonly RankTier[] = [
  ETAIN,
  { key: 'bronze', label: 'Bronze', min: 1000, floor: 1000, color: '#cd7f32' },
  { key: 'argent', label: 'Argent', min: 1050, floor: 1050, color: '#dfe4ea' },
  { key: 'or', label: 'Or', min: 1100, floor: 1100, color: '#ffc94a' },
  { key: 'diamant', label: 'Diamant', min: 1200, floor: 1200, color: '#5fd0e0' },
];

/**
 * Palier d'un ELO : le palier le plus élevé dont `min` <= elo.
 * Étain pour tout ELO < 1000.
 */
export function rankTier(elo: number): RankTier {
  let tier: RankTier = ETAIN;
  for (const t of RANK_TIERS) {
    if (elo >= t.min) tier = t;
    else break;
  }
  return tier;
}

/**
 * Grand Master : grade d'élite POSITIONNEL (et non un seuil ELO) attribué au
 * top {@link GRANDMASTER_TOP_N} de chaque classement (chaque discipline). Délibérément
 * HORS de {@link RANK_TIERS} pour ne pas perturber le barème ELO (frise, planchers,
 * reset de saison). `min` = Infinity : il n'est jamais atteint par l'ELO seul.
 */
export const GRANDMASTER_TOP_N = 5;

export const GRANDMASTER: RankTier = {
  key: 'grandmaster',
  label: 'Grand Master',
  min: Infinity,
  floor: 1200,
  color: '#c084fc',
};

/**
 * ELO minimal pour prétendre au Grand Master : il faut DÉJÀ être Diamant.
 * Le top {@link GRANDMASTER_TOP_N} ne suffit pas si l'on n'a pas atteint ce palier.
 */
export const GRANDMASTER_MIN_ELO =
  RANK_TIERS.find((t) => t.key === 'diamant')?.min ?? 1200;

/**
 * Palier d'un joueur en tenant compte de sa POSITION dans le classement de sa
 * discipline : top {@link GRANDMASTER_TOP_N} **ET** déjà Diamant
 * (ELO >= {@link GRANDMASTER_MIN_ELO}) → Grand Master, sinon palier ELO classique.
 *
 * @param elo  score ELO du joueur dans la discipline.
 * @param rank position (1 = 1er) ; null/0/absent = non classé → palier ELO seul.
 */
export function rankTierForRank(elo: number, rank?: number | null): RankTier {
  if (
    rank != null &&
    rank >= 1 &&
    rank <= GRANDMASTER_TOP_N &&
    elo >= GRANDMASTER_MIN_ELO
  )
    return GRANDMASTER;
  return rankTier(elo);
}

/**
 * Plancher du palier dans lequel se trouve l'ELO (cible de reset).
 *   rankFloor(1500) === 1400
 *   rankFloor(1350) === 1200
 *   rankFloor(1050) === 1000
 *   rankFloor(950)  === 900
 */
export function rankFloor(elo: number): number {
  return rankTier(elo).floor;
}

/**
 * ELO cible après reset de fin de saison : SOFT RESET d'un grade.
 *
 * On ne garde pas son grade : chacun repart au plancher du grade JUSTE EN
 * DESSOUS du sien (Or → Argent, Diamant → Or…). Exceptions du bas d'échelle :
 * Bronze reste à 1000 et Étain reste à son plancher (pas de grade en dessous).
 *   seasonResetElo(1300) === 1100  (Diamant → plancher Or)
 *   seasonResetElo(1150) === 1050  (Or      → plancher Argent)
 *   seasonResetElo(1060) === 1000  (Argent  → plancher Bronze)
 *   seasonResetElo(1020) === 1000  (Bronze  → reste à 1000)
 *   seasonResetElo(980)  === 975   (Étain   → plancher Étain)
 */
export function seasonResetElo(elo: number): number {
  const tier = rankTier(elo);
  const idx = RANK_TIERS.findIndex((t) => t.key === tier.key);
  const below = idx > 0 ? RANK_TIERS[idx - 1] : undefined;
  // Bronze ne descend PAS en Étain : il reste à son propre plancher (1000).
  if (tier.key === 'bronze' || !below) return tier.floor;
  return below.floor;
}
