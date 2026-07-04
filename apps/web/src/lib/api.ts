import { getApiBase } from './config';
import { clearToken, getToken } from './storage';
import { fireContestRage } from './contestRage';
import type { Game } from './gameMode';

export type { Game };

/** Champs d'un résultat de match, communs à la déclaration et à l'enregistrement. */
export interface MatchResultInput {
  scoreSelf: number;
  scoreOpponent: number;
  game?: Game;
  // Smash uniquement :
  bestOf?: 3 | 5;
  charSelf?: string;
  charOpponent?: string;
  stocks?: number;
}

export interface LeaderboardEntry {
  rank: number;
  login: string;
  firstName?: string | null;
  lastName?: string | null;
  elo: number;
  matchesPlayed: number;
  campus: string | null;
  imageUrl: string | null;
  title?: string | null;
  /** Couleur du titre équipé (item boutique). Le titre se rend dans CETTE couleur,
   *  indépendamment du mode de jeu (qui remappe `--accent-gold`). Repli : doré fixe. */
  titleColor?: string | null;
  /** Fin de la fenêtre de boost ELO ×2 « EN FEU » (ISO) — null/passé = pas boosté.
   *  Déjà exposé publiquement par le backend (cf. toPublicUser) : alimente l'anneau
   *  cosmétique des avatars dans le classement et partout ailleurs. */
  eloMultUntil?: string | null;
  dodgeCount?: number;
  tournamentsWon?: number;
  /** Codes de badges de catalogue (cf. lib/badges.ts) — dont 'goat' pour le #1
   *  du classement G.O.A.T de la discipline. Sert à afficher le badge dans les
   *  listes (classement, hover) sans appel par joueur. */
  badges?: string[];
  /** Persos favoris du joueur (épinglés en haut du picker de déclaration). */
  favSmash?: string[];
  favSf?: string[];
}

export interface PendingMatch {
  id: string;
  declarerLogin: string;
  opponentLogin: string;
  scoreDeclarer: number;
  scoreOpponent: number;
  declaredAt: string;
  game?: Game;
  bestOf?: number | null;
  charDeclarer?: string | null;
  charOpponent?: string | null;
  stocks?: number | null;
  /** '2v2' pour les matchs en mode équipe Babyfoot. */
  mode?: '2v2' | null;
  /** Coéquipier du déclarant (équipe 1) — présent uniquement en 2v2. */
  partner1Login?: string | null;
  /** Coéquipier de l'adversaire (équipe 2) — présent uniquement en 2v2. */
  partner2Login?: string | null;
  // Confirmations progressives 2v2 — null = n/a (match 1v1).
  partner1Confirmed?: boolean | null;
  opp1Confirmed?: boolean | null;
  opp2Confirmed?: boolean | null;
}

export interface Challenge {
  id: string;
  challengerLogin: string;
  opponentLogin: string;
  status: 'pending' | 'accepted' | 'declined' | 'recorded' | 'cancelled' | 'expired';
  scheduledAt: string;
  createdAt: string;
  decidedAt: string | null;
  game?: Game;
  /** '2v2' pour un défi en équipe Babyfoot. */
  mode?: '2v2' | null;
  /** Coéquipier du challenger — présent uniquement en 2v2. */
  partnerLogin?: string | null;
  /** Coéquipier de l'adversaire — présent uniquement en 2v2. */
  opponentPartnerLogin?: string | null;
  /** Timestamps d'acceptation des 2 adversaires (2v2). */
  opponentAcceptedAt?: string | null;
  opponentPartnerAcceptedAt?: string | null;
  /** Annulation à l'amiable (défi accepté) : login du demandeur, null si aucune. */
  cancelRequestBy?: string | null;
  cancelRequestAt?: string | null;
  /** Logins de l'équipe adverse ayant déjà accepté l'annulation (joints par ','). */
  cancelAcceptedBy?: string | null;
}

export interface PlayedMatch {
  id: string;
  playerALogin: string;
  playerBLogin: string;
  scoreA: number;
  scoreB: number;
  // 'draw' = match nul (échecs uniquement). Score 0-0.
  winner: 'A' | 'B' | 'draw';
  playedAt: string;
  countedForElo: boolean;
  deltaA: number;
  deltaB: number;
  game?: Game;
  /** Saison à laquelle ce match est rattaché. null = matchs d'avant le tagging (BETA). */
  seasonId?: string | null;
  bestOf?: number | null;
  charA?: string | null;
  charB?: string | null;
  stocksA?: number | null;
  stocksB?: number | null;
  /** '2v2' pour les matchs en mode équipe Babyfoot, null/absent pour les 1v1. */
  mode?: '2v2' | null;
  /** Coéquipier de l'équipe A (2v2). */
  playerA2Login?: string | null;
  /** Coéquipier de l'équipe B (2v2). */
  playerB2Login?: string | null;
  /** Variation ELO du coéquipier de A (2v2). */
  deltaA2?: number | null;
  /** Variation ELO du coéquipier de B (2v2). */
  deltaB2?: number | null;
  /** Équipe A (2v2). */
  teamAId?: string | null;
  /** Équipe B (2v2). */
  teamBId?: string | null;
  /** Daté = match AUTO-VALIDÉ après 48h sans réponse de l'adversaire (contestable a posteriori). */
  autoConfirmedAt?: string | null;
  /** Login du déclarant au moment de l'auto-validation (perspective déclarant/adversaire). */
  autoConfirmDeclarerLogin?: string | null;
  /** Daté quand un litige a déjà été ouvert sur ce match auto-validé. */
  contestedAt?: string | null;
}

// ─── Smash FFA (Free-For-All) ─────────────────────────────────────────────────

export interface FfaParticipant {
  login: string;
  /** 1 = 1er … N = dernier (classement proposé par le déclarant). */
  position: number;
  /** Le joueur a validé SA position / son reste. */
  confirmed: boolean;
  /** Fléchettes uniquement : points restants (0 = vainqueur). null pour le Smash FFA. */
  remaining?: number | null;
}

export interface PendingFfa {
  id: string;
  declarerLogin: string;
  game: Game;
  /** Fléchettes uniquement : score de départ (301/501). null pour le Smash FFA. */
  startScore?: number | null;
  declaredAt: string;
  participants: FfaParticipant[];
}

export interface PlayedFfaParticipant {
  login: string;
  position: number;
  /** Fléchettes uniquement : points restants à la fin (0 = vainqueur). */
  remaining?: number | null;
  ratingBefore: number;
  delta: number;
  ratingAfter: number;
}

export interface PlayedFfa {
  id: string;
  game: Game;
  startScore?: number | null;
  playedAt: string;
  seasonId: string | null;
  countedForElo: boolean;
  participants: PlayedFfaParticipant[];
}

// ─── Fléchettes (301/501, 2-8 joueurs) ───────────────────────────────────────
// Réutilise le modèle FFA (PendingFfa/PlayedFfa avec game='flechettes',
// startScore + remaining). Un participant darts = {login, remaining}.
export interface DartsDeclareParticipant {
  login: string;
  remaining: number;
}

// ─── Babyfoot 2v2 ─────────────────────────────────────────────────────────────

export interface BabyfootTeam {
  id: string;
  player1Login: string;
  player2Login: string;
  elo: number;
  name: string | null;
  createdAt: string;
}

export interface BabyfootTeamEntry extends BabyfootTeam {
  rank: number;
  wins: number;
  losses: number;
  /** Avatar du joueur 1 (dénormalisé depuis users pour affichage). */
  player1ImageUrl?: string | null;
  player2ImageUrl?: string | null;
  /** Campus des deux joueurs — cloisonnement du classement d'équipes par campus. */
  player1Campus?: string | null;
  player2Campus?: string | null;
}

export interface Declare2v2Response {
  id: string;
  status: 'pending';
  /** True si le duo déclarant est créé pour la première fois. */
  myTeamIsNew: boolean;
  /** Id de l'équipe du déclarant — créée dès la déclaration (jamais vide). */
  myTeamId: string;
  /** ELO d'équipe réel (pondéré 65/35) calculé côté back. */
  myTeamElo?: number;
}

/** Un point de l'historique ELO d'une équipe. */
export interface TeamEloPoint {
  elo: number;
  delta: number;
  playedAt: string;
  won: boolean;
  scoreTeam: number;
  scoreOpponent: number;
  opponentPlayer1Login: string;
  opponentPlayer2Login: string;
}

/** Profil complet d'une BabyfootTeam avec historique ELO et avatars. */
export interface TeamProfile extends BabyfootTeamEntry {
  player1ImageUrl: string | null;
  player2ImageUrl: string | null;
  eloHistory: TeamEloPoint[];
}

// ─── League Coin · Boutique ───────────────────────────────────────────────────

export type ShopCategory = 'title' | 'banner' | 'badge' | 'mystery_box' | 'consumable'; // 'badge' conservé pour rétrocompatibilité inventaire

/** Type de consommable (cf. ConsumableInventory backend). */
export type ConsumableKind = 'anti_ops' | 'elo_mult' | 'force_duel' | 'mini_ops';

/** État d'un consommable pour le joueur courant (stock + cap mensuel). */
export interface ConsumableState {
  kind: ConsumableKind;
  quantity: number;
  lastUsedAt: string | null;
  monthlyCap: number;
  monthlyUsed: number;
  /** Cooldown d'achat en ms (mini_ops) — null si l'objet n'en a pas. */
  buyCooldownMs?: number | null;
  /** Date (ISO) à partir de laquelle un nouvel achat est permis — null si achetable. */
  buyableAt?: string | null;
}

export interface ConsumablesResponse {
  /** Fin de la fenêtre de boost « EN FEU » (ISO) — null/passé = pas en feu. */
  eloMultUntil: string | null;
  /** True si l'activation hebdomadaire du boost a déjà été consommée cette semaine. */
  eloMultWeekTaken: boolean;
  items: ConsumableState[];
}

/** État consommables + badges + titre d'un joueur, vu par un admin (/GOD). */
export interface AdminUserItems {
  login: string;
  title: string | null;
  /** Fin de la fenêtre de boost « EN FEU » du joueur (ISO) — null = pas en feu. */
  eloMultUntil: string | null;
  consumables: { kind: ConsumableKind; quantity: number; lastUsedAt: string | null }[];
  badges: EquippedBadge[];
}

// ── Suivi des coins (Shop GOD) ──────────────────────────────────────────────

/** Source d'un mouvement de coins (cf. journal CoinTransaction côté backend). */
export type CoinTxType =
  | 'match'
  | 'quest'
  | 'streak'
  | 'bet_place'
  | 'bet_win'
  | 'bet_refund'
  | 'bet_reversal'
  | 'tournament_prize'
  | 'shop_purchase'
  | 'shop_consumable'
  | 'mystery_box'
  | 'sheldon_reward'
  | 'trophy_income'
  | 'admin_grant';

/** Lot tiré dans une Boîte Mystère (objet gagné) — null si rien de nouveau. */
export interface MysteryReward {
  id: string;
  name: string;
  category: string;
  color: string | null;
  rarity: string | null;
}

/** Une ligne de l'annuaire « suivi des coins » (liste cliquable de Shop GOD). */
export interface ShopUserRow {
  login: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  title: string | null;
  coins: number;
  itemsOwned: number;
  txCount: number;
}

/** Un mouvement de coins (gain/perte) journalisé pour un joueur. */
export interface CoinTransaction {
  id: string;
  /** Delta réel appliqué au solde (signé : + gain, − perte). */
  amount: number;
  balanceAfter: number;
  type: CoinTxType;
  refId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

/** Fiche complète « suivi des coins » d'un joueur (solde + histo + inventaire). */
export interface ShopUserDetail {
  login: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  title: string | null;
  coins: number;
  eloMultUntil: string | null;
  summary: {
    earned: number;
    spent: number;
    earnedCount: number;
    spentCount: number;
    byType: { type: CoinTxType; total: number; count: number }[];
  };
  inventory: {
    cosmetics: {
      itemId: string;
      name: string;
      category: ShopCategory;
      rarity: ShopRarity | null;
      color: string | null;
      price: number;
      equipped: boolean;
      acquiredAt: string;
    }[];
    consumables: { kind: ConsumableKind; quantity: number; lastUsedAt: string | null }[];
  };
  transactions: CoinTransaction[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** Rareté d'un objet — pilote la couleur de sa carte (cf. lib/rarity.ts). */
export type ShopRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface ShopItemData {
  id: string;
  name: string;
  description: string | null;
  category: ShopCategory;
  /** Couleur d'accent (hex #rrggbb) — titres & badges. */
  color: string | null;
  /** Rareté explicite — null = déduite du prix (objets antérieurs). */
  rarity: ShopRarity | null;
  price: number;
  payload: Record<string, unknown> | null;
  active: boolean;
  sortOrder: number;
}

export interface ShopItemInput {
  name: string;
  description?: string | null;
  category: ShopCategory;
  color?: string | null;
  rarity?: ShopRarity | null;
  price: number;
  payload?: Record<string, unknown> | null;
  active?: boolean;
  sortOrder?: number;
}

/** Badge cosmétique acheté & équipé (def inline renvoyée par /me et /users). */
export interface EquippedBadge {
  code: string;
  label: string;
  icon: string;
  color: string | null;
}

export interface InventoryEntry {
  itemId: string;
  item: ShopItemData;
  equipped: boolean;
  acquiredAt: string;
  userPayload?: Record<string, unknown> | null;
}

export interface ShopResponse {
  coins: number;
  items: ShopItemData[];
  owned: string[];
}

// ─── Passe de combat (XP) ──────────────────────────────────────────────────────

/** Un palier du passe vu par le joueur (cf. GET /me/battlepass). */
export interface BattlePassTierView {
  tier: number;
  /** XP cumulée requise pour atteindre ce palier (cumulativeXpForTier). */
  xpRequired: number;
  rewardKind: 'item' | 'coins' | 'consumable' | 'none';
  /** Présent si rewardKind==='item'. */
  item?: ShopItemData | null;
  coins?: number | null;
  consumableKind?: string | null;
  /** True si level >= tier. */
  unlocked: boolean;
  /** Date d'octroi (BattlePassClaim.grantedAt) si la récompense a été accordée. */
  claimedAt?: string | null;
}
export interface BattlePassResponse {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  tiers: BattlePassTierView[];
}
/** Palier du passe côté admin (édition de la récompense, cf. /admin/battlepass/tiers). */
export interface BattlePassTierAdmin {
  tier: number;
  rewardKind: 'item' | 'coins' | 'consumable' | 'none';
  itemId?: string | null;
  coins?: number | null;
  consumableKind?: string | null;
}

/** Titre cosmétique possédé par un joueur (dérivé des accomplissements). */
export interface OwnedTitle {
  key: string;
  label: string;
}

/** Adversaire d'un appariement matchmaking (champs d'affichage). */
export interface MatchmakingOpponent {
  login: string;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl: string | null;
}

export type AnnouncementKind = 'info' | 'important' | 'event';

/** Annonce générale (cf. /GOD onglet Annonces + popup + page À propos). */
export interface AnnouncementData {
  id: string;
  title: string;
  body: string;
  kind: AnnouncementKind;
  active: boolean;
  createdBy?: string | null;
  createdAt: string;
  /** Présent uniquement sur la liste admin : nombre de joueurs ayant vu l'annonce. */
  seenCount?: number;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  kind?: AnnouncementKind;
  active?: boolean;
}

/** Série d'assiduité ranked d'un joueur (vue front, cf. /me). */
export interface StreakView {
  /** Jours consécutifs avec ≥1 match classé (0 si la série est rompue). */
  current: number;
  /** Record perso de série (flex). */
  best: number;
  /** True si le +10% d'ELO sur les gains est actif (série ≥ 3 jours). */
  eloActive: boolean;
  /** Prochain palier de coins à atteindre. */
  next: { day: number; coins: number };
}

export interface MeResponse {
  login: string;
  isAdmin?: boolean;
  role?: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPERADMIN';
  /**
   * Permissions accordées si role === 'MODERATOR' ({} si aucune), null sinon.
   * Pilote les sections visibles du panneau /moodo.
   */
  moderatorPermissions?: Partial<Record<ModeratorPermissionKey, boolean>> | null;
  /** Solde de League Coins de l'utilisateur (défaut 0). */
  coins?: number;
  /** Passe de combat (XP cumulative à vie) — niveau & progression au niveau racine. */
  xp?: number;
  level?: number;
  xpIntoLevel?: number;
  xpForNextLevel?: number;
  /** Palier de passe atteint (== level). */
  tier?: number;
  /** Réputation litiges : nb de litiges perdus (marque visible sur le profil). */
  disputesLost?: number;
  /** Fin du cooldown de sanction de litige (ISO) — déclaration & paris bloqués tant qu'elle est future. Null si aucune. */
  penaltyCooldownUntil?: string | null;
  /** Série d'assiduité ranked : série courante, record, bonus ELO, prochain palier. */
  streak?: StreakView;
  /** True si l'utilisateur n'a pas (encore) consenti à la version courante de la politique. */
  consentRequired?: boolean;
  /** True si le login est autorisé sur l'env staging (cf. STAGING_ALLOWED backend). */
  stagingAllowed?: boolean;
  sfAdmin?: boolean;
  /** Version de la politique de confidentialité en vigueur côté serveur. */
  termsVersion?: string;
  /** Codes de badges (cf. catalogue front lib/badges.ts). */
  badges?: string[];
  /** Badges « libres » attribués via /GOD (rendu inline comme les badges boutique). */
  customBadges?: EquippedBadge[];
  /** Titres que le joueur POSSÈDE (sélecteur de titre, cf. setMyTitle). */
  ownedTitles?: OwnedTitle[];
  /** Couleur du titre équipé (item boutique) — applique une teinte au titre affiché. */
  titleColor?: string | null;
  /** Badge acheté & équipé (boutique) — affiché en plus des badges d'accomplissement. */
  equippedBadge?: EquippedBadge | null;
  /** Bannière équipée (data-URL) — fond de la carte profil. */
  equippedBanner?: string | null;
  /** Palmarès par saison. */
  palmares?: PalmaresEntry[];
  /** Annonces générales non encore vues — affichées en popup à la connexion. */
  unseenAnnouncements?: AnnouncementData[];
  user: {
    login: string;
    firstName?: string | null;
    lastName?: string | null;
    elo: number;
    matchesPlayed: number;
    campus: string | null;
    imageUrl: string | null;
    title: string | null;
    dodgeCount: number;
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
    // Babyfoot 2v2 : rating personnel distinct du 1v1 (cf. eloBabyfoot2v2 backend).
    eloBabyfoot2v2?: number;
    matchesPlayed2v2?: number;
    games?: Game[];
    favSmash?: string[];
    favSf?: string[];
    onboardedAt?: string | null;
    /** Fin de la fenêtre de boost « EN FEU » (ELO ×2) — null/passé = pas en feu. */
    eloMultUntil?: string | null;
    /** Réputation litiges : nb de litiges perdus (marque publique sur le profil). */
    disputesLost?: number;
  } | null;
}

export const MODERATOR_PERMISSION_KEYS = [
  'canBan', 'canEditStats', 'canDeleteMatches', 'canEditMatches',
  'canDeletePendingMatches', 'canDeleteRejectedMatches', 'canDeleteChallenges',
  'canDeleteOps', 'canResetOpsCooldown', 'canDeleteTournaments', 'canViewSuspicious', 'canViewAuditLog', 'canViewHistory',
  'canViewStats',
] as const;

export type ModeratorPermissionKey = (typeof MODERATOR_PERMISSION_KEYS)[number];

export const MODERATOR_PERMISSION_LABELS: Record<ModeratorPermissionKey, string> = {
  canBan: 'Bannir / Débannir',
  canEditStats: 'Modifier stats',
  canDeleteMatches: 'Supprimer matchs',
  canEditMatches: 'Modifier matchs',
  canDeletePendingMatches: 'Supprimer matchs en attente',
  canDeleteRejectedMatches: 'Voir + supprimer rejets',
  canDeleteChallenges: 'Supprimer défis',
  canDeleteOps: 'Supprimer OPS',
  canResetOpsCooldown: 'Réinitialiser cooldown OPS',
  canDeleteTournaments: 'Supprimer tournois',
  canViewSuspicious: 'Voir alertes',
  canViewAuditLog: 'Voir audit log',
  canViewHistory: 'Voir historique complet',
  canViewStats: 'Voir stats',
};

export interface AdminUser {
  login: string;
  /** Null = faux compte créé manuellement (jamais passé par OAuth 42) → supprimable. */
  ftId: number | null;
  role: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPERADMIN';
  stagingAllowed?: boolean;
  moderatorPermissions?: Partial<Record<ModeratorPermissionKey, boolean>> | null;
  elo: number;
  matchesPlayed: number;
  dodgeCount: number;
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
  // Babyfoot 2v2 : rating personnel distinct du 1v1 (cf. eloBabyfoot2v2 backend).
  eloBabyfoot2v2?: number;
  matchesPlayed2v2?: number;
  games?: Game[];
  favSmash?: string[];
  favSf?: string[];
  title: string | null;
  imageUrl: string | null;
  campus: string | null;
  bannedAt: string | null;
  createdAt: string;
}

export interface RejectedMatch {
  id: string;
  declarerLogin: string;
  opponentLogin: string;
  scoreDeclarer: number;
  scoreOpponent: number;
  contestReason: string;
  contestMessage: string;
  rejectedAt: string;
  /** Discipline du match contesté. */
  game?: string;
  /** Arbitrage : 'open' | 'resolved' | 'dismissed' (historique). */
  status?: string;
  /** Verdict : 'declarer_wrong' | 'contester_wrong' | 'dismissed'. */
  resolution?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
}

/** Verdict d'arbitrage d'un litige. */
export type DisputeVerdict = 'declarer_wrong' | 'contester_wrong' | 'dismiss';

export interface ModerationStats {
  user: AdminUser;
  recentMatches: PlayedMatch[];
  topOpponents: { login: string; count: number }[];
  rejectionsEmitted: RejectedMatch[];
  rejectionsReceived: RejectedMatch[];
  /** Permissions accordées si l'utilisateur est MODERATOR, null sinon. */
  moderatorPermissions?: Partial<Record<ModeratorPermissionKey, boolean>> | null;
  availablePermissions?: readonly ModeratorPermissionKey[];
}

export interface FeatureRequestWithAuthor {
  id: string;
  text: string;
  status: string;
  authorId: string;
  createdAt: string;
  author: { login: string; imageUrl: string | null };
}

export interface BugReportWithAuthor {
  id: string;
  text: string;
  status: string;
  authorId: string;
  createdAt: string;
  author: { login: string; imageUrl: string | null };
}

export interface SuspiciousFlag {
  type: 'pair_domination' | 'recent_farming' | 'elo_spike' | 'victim_pattern';
  severity: 'low' | 'medium' | 'high';
  players: string[];
  detail: string;
  matchCount?: number;
  winRate?: number;
  eloGain?: number;
}

export type AdminAuditAction =
  | 'SET_ROLE'
  | 'BAN_USER'
  | 'UNBAN_USER'
  | 'EDIT_STATS'
  | 'EDIT_TITLE'
  | 'DELETE_MATCH'
  | 'EDIT_MATCH'
  | 'REFRESH_IMAGES'
  | 'DELETE_CHALLENGE'
  | 'DELETE_PENDING_MATCH'
  | 'DELETE_REJECTED_MATCH'
  | 'DELETE_OPS'
  | 'DELETE_TOURNAMENT'
  | 'IMPERSONATE_TESTER'
  | 'SYNC_ELO_FROM_PROD'
  | 'RESET_DATABASE';

export interface AdminAuditEntry {
  id: string;
  actorLogin: string;
  actorRole: 'USER' | 'ADMIN' | 'SUPERADMIN';
  action: AdminAuditAction;
  targetLogin: string | null;
  payload: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface Ops {
  id: string;
  ownerLogin: string;
  targetLogin: string;
  declaredAt: string;
  expiresAt: string;
  /** Nombre de matchs forcés déjà consommés (joués ou refusés). Max 3. */
  forcedUsed: number;
  owner?: { login: string; imageUrl: string | null };
  target?: { login: string; imageUrl: string | null };
}

/** Nombre de matchs que la cible doit encore affronter sans pouvoir refuser. */
export const OPS_FORCED_MATCHES = 3;

export interface OpsMeResponse {
  current: Ops | null;
  targetedBy: Ops | null;
  canDeclareAt: string | null;
}

export interface OpsUserResponse {
  owns: Ops | null;
  targetedBy: Ops | null;
}

export interface UserProfile {
  user: {
    login: string;
    firstName?: string | null;
    lastName?: string | null;
    elo: number;
    matchesPlayed: number;
    campus: string | null;
    imageUrl: string | null;
    title: string | null;
    dodgeCount: number;
    tournamentsWon: number;
    // Stats par discipline (renvoyées par le backend ; permettent d'isoler la
    // fiche d'un joueur par jeu, comme le profil perso).
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
    // Babyfoot 2v2 : rating personnel distinct du 1v1 (cf. eloBabyfoot2v2 backend).
    eloBabyfoot2v2?: number;
    matchesPlayed2v2?: number;
    /** Disciplines auxquelles le joueur a adhéré (badges cross-jeux de la carte héro). */
    games?: Game[];
    favSmash?: string[];
    favSf?: string[];
    createdAt: string;
    /** Fin de la fenêtre de boost « EN FEU » (ELO ×2) — null/passé = pas en feu. */
    eloMultUntil?: string | null;
  };
  rank: number | null;
  wins: number;
  losses: number;
  recent: PlayedMatch[];
  /** Codes de badges (cf. catalogue front lib/badges.ts). */
  badges?: string[];
  /** Badges « libres » attribués via /GOD (rendu inline comme les badges boutique). */
  customBadges?: EquippedBadge[];
  /** Réseau du joueur consulté : ceux qu'il suit (bloc « following »). */
  followingList?: FollowEdge[];
  /** Réseau du joueur consulté : ceux qui le suivent (bloc « followers »). */
  followersList?: FollowEdge[];
  /** Le visiteur suit-il ce joueur ? (null/false si soi-même ou non suivi) */
  following?: boolean;
  /** Préférences de notif pour ce suivi (null si non suivi). */
  followPrefs?: FollowPrefs | null;
  /** Palmarès par saison (classements finaux). */
  palmares?: PalmaresEntry[];
  /** Solde de League Coins du joueur — visible de tous. */
  coins?: number;
  /** Couleur du titre équipé (item boutique) — teinte le titre sur la fiche. */
  titleColor?: string | null;
  /** Badge acheté & équipé (boutique) — affiché en plus des badges d'accomplissement. */
  equippedBadge?: EquippedBadge | null;
  /** Bannière équipée (data-URL) — fond de la carte profil, visible de tous. */
  equippedBanner?: string | null;
}

export interface FollowPrefs {
  notifyTournament: boolean;
  notifyTop3: boolean;
  notifyTrophy: boolean;
  notifyOps: boolean;
}

/** Arête de suivi : `followee` rempli côté /follows, `follower` côté /followers. */
export interface FollowEdge {
  id: string;
  followerLogin: string;
  followeeLogin: string;
  createdAt: string;
  follower?: { login: string; imageUrl: string | null; elo: number };
  followee?: { login: string; imageUrl: string | null; elo: number };
}

export interface Season {
  id: string;
  name: string;
  isActive: boolean;
  startedAt: string;
  endedAt: string | null;
  /** Clôture programmée (ISO) — bascule auto vers `nextSeasonName` à cette date. */
  scheduledEndAt?: string | null;
  nextSeasonName?: string | null;
}

export interface SeasonStanding {
  id: string;
  seasonId: string;
  login: string;
  rank: number;
  elo: number;
  wins: number;
  losses: number;
  /** Campus figé au snapshot. Null sur les anciens snapshots → restent globaux. */
  campus?: string | null;
}

export interface PalmaresEntry {
  seasonId: string;
  seasonName: string;
  rank: number;
  elo: number;
  wins: number;
  losses: number;
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  stage?: 'pool' | 'bracket' | 'league';
  // stage='pool' : index de poule ; stage='league' : n° de journée.
  poolIndex?: number | null;
  round: number;
  slot: number;
  playerALogin: string | null;
  playerBLogin: string | null;
  scoreA: number | null;
  scoreB: number | null;
  winnerLogin: string | null;
  recordedByLogin: string | null;
  recordedAt: string | null;
  confirmedAt: string | null;
  /** Paris fermés depuis cette date (posée au 1er score saisi, jamais remise à null). */
  betsLockedAt?: string | null;
  // Pile-ou-face + avantage du duel (cérémonie de tournoi).
  tossWinnerLogin?: string | null;
  tossSide?: 'heads' | 'tails' | null;
  advantagePick?: string | null;
  tossAt?: string | null;
}

export interface TournamentEntry {
  tournamentId: string;
  login: string;
  /** 2v2 : coéquipier du capitaine (`login`). Null/absent en 1v1. */
  partnerLogin?: string | null;
  /** 2v2 : nom d'équipe optionnel (affiché à la place de « @cap & @partner »). */
  teamName?: string | null;
  joinedAt: string;
  user?: { login: string; imageUrl: string | null; elo: number };
  /** 2v2 : utilisateur coéquipier résolu (avatar/elo) pour l'affichage des paires. */
  partner?: { login: string; imageUrl: string | null; elo: number } | null;
}

export interface TournamentInvite {
  id: string;
  tournamentId?: string;
  inviterLogin: string;
  inviteeLogin: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface Tournament {
  id: string;
  name: string;
  kind: 'friendly' | 'official';
  isPrivate?: boolean;
  imageUrl?: string | null;
  capacity: number;
  /** '1v1' classique | '2v2' (babyfoot doubles : chaque entrée = une paire). */
  mode?: '1v1' | '2v2';
  format?: 'elimination' | 'pools' | 'league';
  game?: Game;
  status: 'registration' | 'in_progress' | 'finished' | 'cancelled';
  createdByLogin: string;
  /** Co-organisateurs : tous les droits d'organisation, comme le créateur. */
  coOrganizers?: string[];
  winnerLogin: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  // Match désigné « en cours » par l'organisateur (« match suivant ») : déclenche
  // l'écran VERSUS et le badge « EN COURS » dans l'arbre. null aux échecs.
  activeMatchId?: string | null;
  entries?: TournamentEntry[];
  matches?: TournamentMatch[];
  winner?: { login: string; imageUrl: string | null } | null;
  invites?: TournamentInvite[];
  // Récompense du vainqueur (tournois officiels). 'cosmetic' → `prizeItem` résolu.
  prizeKind?: 'none' | 'coins' | 'cosmetic';
  prizeCoins?: number | null;
  prizeItemId?: string | null;
  prizeItem?: ShopItemData | null;
  /** Multiplicateur final d'un pari sur le vainqueur (amicaux 2 ; officiels 2..10). */
  betFinalMult?: number;
  /** Cash-prize (coins) du champion d'un officiel ; paliers dérivés. null = aucun. */
  cashPrizeBase?: number | null;
  /** Ligue : nb d'équipes qualifiées en phase finale (persistant, modifiable). null = défaut UI. */
  leagueQualifyCount?: number | null;
}

/**
 * Tournoi enrichi pour l'écran TV live (`GET /tournaments/:id/live`) : ajoute la
 * cagnotte des paris « vainqueur du tournoi » agrégée par login (`betPool`), d'où la
 * page dérive la « HYPE » de chaque duel.
 */
export interface LiveTournament extends Tournament {
  betPool?: Record<string, number>;
  betTotalCoins?: number;
  bets?: LiveBet[];
}

/** Une mise affichée dans le bandeau défilant de l'écran TV. */
export interface LiveBet {
  id: string;
  bettor: string;
  bettorImageUrl: string | null;
  choice: string;
  stake: number;
  status: BetStatus;
  createdAt: string;
}

/** Récompense passée à la création d'un tournoi officiel (cf. backend). */
export type TournamentPrize =
  | { kind: 'none' }
  | { kind: 'coins'; coins: number }
  | { kind: 'existingItem'; itemId: string }
  | { kind: 'newCosmetic'; cosmetic: ShopItemInput };

export type AllHistoryEventType = 'challenge' | 'pending_match' | 'played_match' | 'rejected_match' | 'ops';

export interface AllHistoryEvent {
  id: string;
  type: AllHistoryEventType;
  at: string;
  game?: Game;
  playerA: string;
  playerB: string;
  status?: string;
  scoreA?: number;
  scoreB?: number;
  winner?: string;
  deltaA?: number;
  deltaB?: number;
  countedForElo?: boolean;
  contestReason?: string;
  contestMessage?: string;
  forcedUsed?: number;
  scheduledAt?: string;
  decidedAt?: string | null;
  expiresAt?: string;
}

// ── SF Club Sessions ──────────────────────────────────────────────────────

export interface SfSession {
  id: string;
  startTime: string;
  endTime: string | null;
  organizerLogin: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  organizer: {
    login: string;
    firstName: string | null;
    lastName: string | null;
    imageUrl: string | null;
  };
}

export interface SfSessionCurrent {
  session: SfSession | null;
  status: 'active' | 'upcoming' | 'none';
}

export class AuthError extends Error {}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { auth?: boolean } = { auth: true },
): Promise<T> {
  const headers = new Headers(init.headers);
  if (options.auth !== false) {
    const token = getToken();
    if (!token) throw new AuthError('not authenticated');
    headers.set('authorization', `Bearer ${token}`);
  }
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  if (res.status === 401) {
    // On ne purge la session QUE si la requête était authentifiée. Un 401 sur un
    // endpoint public (auth:false) — p.ex. /sf-session/current bloqué par la
    // staging-gate — ne doit JAMAIS déconnecter un utilisateur déjà valide.
    if (options.auth !== false) clearToken();
    throw new AuthError('session expired');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
  }
  return (await res.json()) as T;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  /** Jeu d'origine : couleur de fond + emoji de la cloche, bascule de mode au clic. */
  game: Game | null;
  read: boolean;
  createdAt: string;
}

// ── Économie de coins : quêtes hebdomadaires + paris ────────────────────────

/** Une quête hebdo telle que renvoyée par GET /quests (progression bornée à la cible). */
export interface QuestView {
  id: string;
  reward: number;
  target: number;
  progress: number;
  claimed: boolean;
  claimable: boolean;
}
export interface QuestsResponse {
  weekKey: string;
  coins: number;
  quests: QuestView[];
}

export type BetStatus = 'open' | 'won' | 'lost' | 'refunded';
export interface MyBet {
  id: string;
  targetType: 'tournament' | 'match' | 'ops';
  tournamentId: string | null;
  tournamentName: string | null;
  game: Game | null;
  matchId: string | null;
  /** Ops auquel appartient le duel parié (targetType='ops'). */
  opsId: string | null;
  /** Duel (défi forcé) précis parié (targetType='ops'). */
  challengeId: string | null;
  opsOwnerLogin: string | null;
  opsTargetLogin: string | null;
  choiceLogin: string;
  /** Pronostic de score exact (paris match uniquement, null sinon). */
  predictedScoreA: number | null;
  predictedScoreB: number | null;
  stake: number;
  status: BetStatus;
  payout: number;
  createdAt: string;
  settledAt: string | null;
}
export interface OpenBetTournament {
  id: string;
  name: string;
  game: Game;
  status: string;
  /** '1v1' | '2v2'. En 2v2 chaque participant est une ÉQUIPE (capitaine + coéquipier). */
  mode: string;
  /** Logins des CAPITAINES = valeur pariée (clé canonique de l'équipe). */
  entrants: string[];
  /** Capitaine → login du coéquipier (null en 1v1) — sert à afficher le duo. */
  partners: Record<string, string | null>;
}
/**
 * Duel d'ops ouvert aux paris (traqueur ⚔️ cible). `id` = id du DUEL (le défi
 * forcé) ; chaque duel d'un ops est un marché distinct.
 */
export interface OpenOpsDuel {
  id: string;
  opsId: string | null;
  ownerLogin: string;
  targetLogin: string;
  ownerImageUrl: string | null;
  targetImageUrl: string | null;
  game: Game;
  expiresAt: string | null;
}
export interface BetsResponse {
  coins: number;
  myBets: MyBet[];
  openTournaments: OpenBetTournament[];
  openOpsDuels: OpenOpsDuel[];
}
/** On ne parie plus que sur le vainqueur d'un tournoi (plus de paris par match). */
export interface PlaceBetInput {
  targetType: 'tournament';
  tournamentId: string;
  choiceLogin: string;
  stake: number;
}
/** Pari sur l'issue d'un duel d'ops précis : `challengeId` = le duel, pronostic = traqueur ou cible. */
export interface PlaceOpsBetInput {
  challengeId: string;
  choiceLogin: string;
  stake: number;
}
/**
 * Valeur sentinelle de `choiceLogin` pour parier sur le NUL d'un match (ligue
 * uniquement). Doit rester identique à DRAW_CHOICE côté backend.
 */
export const DRAW_CHOICE = '__draw__';
/** Pari sur l'issue d'un MATCH de tournoi : `choiceLogin` = un joueur ou DRAW_CHOICE (nul). */
export interface PlaceMatchBetInput {
  matchId: string;
  choiceLogin: string;
  stake: number;
  /**
   * Pronostic de SCORE EXACT (les deux ensemble, alignés sur playerA/playerB) :
   * optionnel pour un parieur extérieur (gain ×4 si pile au lieu de ×2),
   * OBLIGATOIRE pour un joueur qui parie sur son propre match (gagné ssi pile).
   */
  predictedScoreA?: number;
  predictedScoreB?: number;
}

/** Stats de contributions git d'un membre (lignes ajoutées / supprimées / net). */
export interface ContributorStat {
  added: number;
  deleted: number;
  net: number;
}

// ── Analytics : tableau de bord d'usage (onglet STATS du panneau GOD) ─────────

/** Un événement à journaliser : page vue (chemin) ou interaction (id d'action). */
export interface TrackEventInput {
  type: 'pageview' | 'event';
  name: string;
  game?: Game | null;
}
/** Une entrée de classement (page ou action) avec son nombre d'occurrences. */
export interface StatCount {
  name: string;
  count: number;
}
/** Métriques d'usage agrégées d'une discipline. */
export interface PerGameStat {
  game: Game;
  /** Inscrits ayant opté pour cette discipline (games[]). */
  registered: number;
  /** Joueurs distincts ayant réellement joué sur la fenêtre. */
  activePlayers: number;
  /** Matchs joués (1v1/2v2 + FFA) sur la fenêtre. */
  matches: number;
}
/** Un point de timeline journalière (jour ISO `YYYY-MM-DD` + valeur). */
export interface DayPoint {
  day: string;
  count: number;
}
export interface StatsOverview {
  days: number;
  game: Game | null;
  totals: {
    /** Tous les comptes (faux joueurs inclus). */
    registered: number;
    /** Comptes 42 réels uniquement (ftId non nul). */
    registeredReal: number;
    /** Logins distincts actifs sur la fenêtre. */
    activeUsers: number;
  };
  topPages: StatCount[];
  topEvents: StatCount[];
  perGame: PerGameStat[];
  signupTimeline: DayPoint[];
  activityTimeline: DayPoint[];
}

export const api = {
  me: () => request<MeResponse>('/me'),
  // Sélection de titre self-service : `null`/'' retire le titre. Le serveur
  // vérifie que le titre est bien possédé (cf. MeResponse.ownedTitles).
  setMyTitle: (title: string | null) =>
    request<{ login: string; title: string | null }>('/me/title', {
      method: 'PUT',
      body: JSON.stringify({ title }),
    }),
  // ── Matchmaking ─────────────────────────────────────────────────────────
  queueJoin: (game: Game) =>
    request<{ matched: boolean; game?: Game; opponent?: MatchmakingOpponent | null }>(
      '/queue/join',
      { method: 'POST', body: JSON.stringify({ game }) },
    ),
  // game omis = quitte toutes les files (cleanup au logout).
  queueLeave: (game?: Game) =>
    request<{ ok: boolean }>('/queue/leave', { method: 'POST', body: JSON.stringify(game ? { game } : {}) }),
  // Statut multi-modes : `queued` = files où je suis en attente ; `matches` =
  // appariements récents non encore affichés (consommés une seule fois côté serveur).
  queueStatus: () =>
    request<{
      queued: Game[];
      matches: Array<{ game: Game; opponent: MatchmakingOpponent | null }>;
    }>('/queue/status'),
  // RGPD / CGU 42 — enregistre (accept=true) ou refuse (accept=false, supprime le compte)
  // le consentement de l'utilisateur final.
  consent: (accept: boolean) =>
    request<{ ok: boolean; accepted: boolean; deleted?: boolean }>('/me/consent', {
      method: 'POST',
      body: JSON.stringify({ accept }),
    }),
  setGames: (games: Game[]) =>
    request<{ games: Game[]; onboardedAt: string | null }>('/me/games', {
      method: 'PATCH',
      body: JSON.stringify({ games }),
    }),
  // Persos favoris par jeu de combat. PATCH partiel : seules les clés fournies
  // sont écrites (ex. ne mettre à jour que `smash`).
  setFavorites: (input: { smash?: string[]; streetfighter?: string[] }) =>
    request<{ favSmash: string[]; favSf: string[] }>('/me/favorites', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  leaderboard: (game?: Game) =>
    request<LeaderboardEntry[]>(
      `/leaderboard${game && game !== 'babyfoot' ? `?game=${game}` : ''}`,
    ),
  // Token éphémère (scope SSE) à passer en ?token= pour ouvrir le flux /events,
  // afin de ne jamais exposer le Bearer 30 jours dans une URL (logs / Referer).
  streamToken: () => request<{ token: string }>('/auth/stream-token'),
  notifications: () => request<{ notifications: AppNotification[]; unread: number }>('/notifications'),
  markNotificationsRead: (ids?: string[]) =>
    request<{ ok: true }>('/notifications/read', {
      method: 'POST',
      body: JSON.stringify(ids ? { ids } : {}),
    }),
  // Liste des joueurs que JE suis (following).
  follows: () => request<FollowEdge[]>('/follows'),
  // Liste des joueurs qui ME suivent (followers).
  followers: () => request<FollowEdge[]>('/followers'),
  follow: (login: string) =>
    request<unknown>('/follows', { method: 'POST', body: JSON.stringify({ login }) }),
  unfollow: (login: string) =>
    request<{ ok: true }>(`/follows/${encodeURIComponent(login)}`, { method: 'DELETE' }),
  updateFollowPrefs: (login: string, prefs: Partial<FollowPrefs>) =>
    request<unknown>(`/follows/${encodeURIComponent(login)}`, {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    }),
  seasons: () => request<Season[]>('/seasons'),
  currentSeason: () => request<Season | null>('/seasons/current'),
  seasonStandings: (id: string, game?: Game) =>
    request<SeasonStanding[]>(
      `/seasons/${encodeURIComponent(id)}/standings${game && game !== 'babyfoot' ? `?game=${game}` : ''}`,
    ),
  // Démarre une nouvelle saison ; si une saison est active, elle est clôturée +
  // reset au plancher de grade dans la même opération (`previous` la décrit).
  createSeason: (name: string) =>
    request<Season & { previous: { seasonName: string; champion: string | null; players: number } | null }>(
      '/seasons',
      { method: 'POST', body: JSON.stringify({ name }) },
    ),
  // Programme la clôture auto de la saison active : à `endAt` (ISO), bascule
  // automatique vers une nouvelle saison nommée `nextName`. Les coins persistent.
  scheduleSeasonEnd: (endAt: string, nextName: string) =>
    request<Season>('/seasons/schedule', {
      method: 'POST',
      body: JSON.stringify({ endAt, nextName }),
    }),
  // Annule une clôture programmée.
  cancelSeasonSchedule: () =>
    request<Season>('/seasons/schedule/cancel', { method: 'POST' }),
  // Réactive / bascule la saison active (basculement de vue, sans reset d'ELO).
  activateSeason: (id: string) =>
    request<Season>(`/seasons/${encodeURIComponent(id)}/activate`, { method: 'POST' }),
  deleteSeason: (id: string) =>
    request<{ deleted: true }>(`/seasons/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // Synchro ELO/stats prod → staging (staging only, superadmin). Copie aussi les
  // tournois en cours/passés (inscrits + matchs). Renvoie les compteurs de comptes
  // mis à jour / créés / sautés + tournois synchronisés.
  syncEloFromProd: () =>
    request<{
      prodCount: number;
      updated: number;
      created: number;
      skipped: string[];
      tournamentsSynced: number;
      tournamentsSkipped: string[];
      seasonSwitched: string | null;
    }>('/admin/seasons/sync-elo-from-prod', { method: 'POST' }),
  pendingMatches: () => request<PendingMatch[]>('/matches/pending'),
  playedMatches: () => request<PlayedMatch[]>('/matches'),
  declareMatch: (input: { opponentLogin: string } & MatchResultInput) =>
    request<{ id: string; status: 'pending' }>('/matches', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  confirmMatch: (
    id: string,
    scoreSelf: number,
    scoreOpponent: number,
    extra?: { game?: Game; bestOf?: 3 | 5 },
  ) =>
    request<PlayedMatch>(`/matches/${encodeURIComponent(id)}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ scoreSelf, scoreOpponent, ...extra }),
    }),

  /**
   * Confirme un match 2v2 (pas de re-saisie de score — juste la présence).
   * Renvoie `{ status: 'waiting', confirmed: N, total: 3 }` si d'autres joueurs
   * n'ont pas encore validé, ou le `PlayedMatch` dès que tous ont confirmé.
   */
  confirm2v2Match: (id: string) =>
    request<
      | { status: 'waiting'; confirmed: number; total: 3 }
      | (PlayedMatch & { status?: never })
    >(`/matches/${encodeURIComponent(id)}/confirm`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  rejectMatch: (
    id: string,
    contestReason: 'never_played' | 'wrong_score',
    contestMessage: string,
  ) =>
    request<{ id: string; status: 'rejected' }>(
      `/matches/${encodeURIComponent(id)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ contestReason, contestMessage }),
      },
    ).then((r) => {
      fireContestRage('sender');
      return r;
    }),
  // Annulation de sa propre déclaration (réservé au déclarant, tant que pending).
  cancelMatch: (id: string) =>
    request<{ id: string; status: 'cancelled' }>(
      `/matches/${encodeURIComponent(id)}/cancel`,
      { method: 'POST' },
    ),

  // ── Contestation a posteriori d'un match AUTO-VALIDÉ (48h sans réponse) ──
  /** Matchs auto-validés que je peux encore contester (camp adverse, non contestés). */
  contestableMatches: () => request<PlayedMatch[]>('/matches/contestable'),
  /** Ouvre un litige sur un match auto-validé déjà compté (pas d'annulation d'ELO automatique). */
  contestPlayedMatch: (
    id: string,
    contestReason: 'never_played' | 'wrong_score',
    contestMessage: string,
  ) =>
    request<{ id: string; status: 'contested' }>(
      `/matches/played/${encodeURIComponent(id)}/contest`,
      { method: 'POST', body: JSON.stringify({ contestReason, contestMessage }) },
    ).then((r) => {
      fireContestRage('sender');
      return r;
    }),

  // ── Smash FFA (Free-For-All) ──
  pendingFfas: () => request<PendingFfa[]>('/matches/ffa/pending'),
  playedFfas: () => request<PlayedFfa[]>('/matches/ffa'),
  /** `ranking[0]` = 1er … dernier élément = dernier. */
  declareFfa: (ranking: string[]) =>
    request<{ id: string; status: 'pending' }>('/matches/ffa', {
      method: 'POST',
      body: JSON.stringify({ game: 'smash', ranking }),
    }),
  confirmFfaPosition: (id: string, position: number) =>
    request<PlayedFfa | { id: string; status: 'pending'; confirmed: number; total: number }>(
      `/matches/ffa/${encodeURIComponent(id)}/confirm`,
      { method: 'POST', body: JSON.stringify({ position }) },
    ),
  contestFfa: (id: string, claimedPosition: number, message?: string) =>
    request<{ id: string; status: 'cancelled' }>(
      `/matches/ffa/${encodeURIComponent(id)}/contest`,
      { method: 'POST', body: JSON.stringify({ claimedPosition, message }) },
    ).then((r) => {
      fireContestRage('sender');
      return r;
    }),
  cancelFfa: (id: string) =>
    request<{ id: string; status: 'cancelled' }>(
      `/matches/ffa/${encodeURIComponent(id)}/cancel`,
      { method: 'POST' },
    ),

  // ── Fléchettes (301/501, 2-8 joueurs) ──
  pendingDarts: () => request<PendingFfa[]>('/matches/darts/pending'),
  playedDarts: () => request<PlayedFfa[]>('/matches/darts'),
  /** `participants` = {login, remaining} ; le vainqueur a remaining=0. */
  declareDarts: (startScore: 301 | 501, participants: DartsDeclareParticipant[]) =>
    request<{ id: string; status: 'pending' }>('/matches/darts', {
      method: 'POST',
      body: JSON.stringify({ game: 'flechettes', startScore, participants }),
    }),
  confirmDarts: (id: string, remaining: number) =>
    request<PlayedFfa | { id: string; status: 'pending'; confirmed: number; total: number }>(
      `/matches/darts/${encodeURIComponent(id)}/confirm`,
      { method: 'POST', body: JSON.stringify({ remaining }) },
    ),
  contestDarts: (id: string, claimedRemaining: number, message?: string) =>
    request<{ id: string; status: 'cancelled' }>(
      `/matches/darts/${encodeURIComponent(id)}/contest`,
      { method: 'POST', body: JSON.stringify({ claimedRemaining, message }) },
    ).then((r) => {
      fireContestRage('sender');
      return r;
    }),
  cancelDarts: (id: string) =>
    request<{ id: string; status: 'cancelled' }>(
      `/matches/darts/${encodeURIComponent(id)}/cancel`,
      { method: 'POST' },
    ),

  challenges: () => request<Challenge[]>('/challenges'),
  createChallenge: (input: { opponentLogin: string; scheduledAt: string; game?: Game }) =>
    request<Challenge>('/challenges', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  /** Défi 2v2 Babyfoot : challenger + coéquipier contre 2 adversaires. */
  createChallenge2v2: (input: {
    partnerLogin: string;
    opponentLogin: string;
    opponentPartnerLogin: string;
    scheduledAt: string;
  }) =>
    request<Challenge>('/challenges/2v2', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  acceptChallenge: (id: string) =>
    request<Challenge>(`/challenges/${encodeURIComponent(id)}/accept`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  declineChallenge: (id: string) =>
    request<{ id: string; status: string; eloPenalty: number; isOps: boolean }>(
      `/challenges/${encodeURIComponent(id)}/decline`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  /** Propose une annulation à l'amiable d'un défi accepté (sans perte d'ELO si accepté). */
  requestCancelChallenge: (id: string) =>
    request<{ id: string; status: 'cancel_requested' }>(
      `/challenges/${encodeURIComponent(id)}/cancel-request`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  /** Accepte une demande d'annulation à l'amiable (équipe adverse). */
  acceptCancelChallenge: (id: string) =>
    request<{ id: string; status: 'cancelled' | 'cancel_waiting' }>(
      `/challenges/${encodeURIComponent(id)}/cancel-accept`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  /** Refuse une demande d'annulation à l'amiable → le défi reste à jouer. */
  refuseCancelChallenge: (id: string) =>
    request<{ id: string; status: 'accepted' }>(
      `/challenges/${encodeURIComponent(id)}/cancel-refuse`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  recordChallengeResult: (id: string, result: MatchResultInput) =>
    request<{ pendingId: string; status: 'pending_confirmation' }>(
      `/challenges/${encodeURIComponent(id)}/record`,
      {
        method: 'POST',
        body: JSON.stringify(result),
      },
    ),
  userProfile: (login: string) =>
    request<UserProfile>(`/users/${encodeURIComponent(login)}`),
  // Photos de l'équipe (page About) résolues par login depuis l'API 42, sans créer
  // de comptes joueurs côté serveur. Voir GET /team/photos.
  teamPhotos: (logins: string[]) =>
    request<{ photos: Record<string, string | null> }>(
      `/team/photos?logins=${encodeURIComponent(logins.join(','))}`,
    ),
  // Stats de contributions git (lignes ajout/suppr/net) par login. Voir GET
  // /contributors/stats. Se rafraîchit naturellement (live en dev, au build en prod).
  contributorStats: () =>
    request<{ stats: Record<string, ContributorStat> }>('/contributors/stats'),
  opsList: () => request<Ops[]>('/ops'),
  opsMe: () => request<OpsMeResponse>('/ops/me'),
  opsForUser: (login: string) =>
    request<OpsUserResponse>(`/ops/user/${encodeURIComponent(login)}`),
  declareOps: (targetLogin: string) =>
    request<Ops>('/ops', {
      method: 'POST',
      body: JSON.stringify({ targetLogin }),
    }),
  setUserTitle: (login: string, title: string | null) =>
    request<{ login: string; title: string | null }>(
      `/admin/users/${encodeURIComponent(login)}/title`,
      {
        method: 'POST',
        body: JSON.stringify({ title }),
      },
    ),
  tournaments: (game?: Game) =>
    request<Tournament[]>(`/tournaments${game && game !== 'babyfoot' ? `?game=${game}` : ''}`),
  tournament: (id: string) =>
    request<Tournament>(`/tournaments/${encodeURIComponent(id)}`),
  // Variante « écran TV / live » : tournoi + cagnotte des paris agrégée par participant.
  tournamentLive: (id: string) =>
    request<LiveTournament>(`/tournaments/${encodeURIComponent(id)}/live`),
  // Remontée d'une erreur client (page live) vers Discord. Best-effort : 204 attendu.
  reportClientError: (payload: { message: string; context?: string; stack?: string }) =>
    request<void>('/client-errors', { method: 'POST', body: JSON.stringify(payload) }),
  createTournament: (input: {
    name: string;
    capacity: number;
    kind: 'friendly' | 'official';
    mode?: '1v1' | '2v2';
    partnerLogin?: string;
    selfJoin?: boolean;
    format?: 'elimination' | 'pools' | 'league';
    game?: Game;
    private?: boolean;
    imageUrl?: string;
    prize?: TournamentPrize;
    betFinalMult?: number;
    cashPrizeBase?: number;
  }) =>
    request<Tournament>('/tournaments', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  // En 2v2, `partnerLogin` engage la paire (joueur + coéquipier) ; `teamName` optionnel.
  joinTournament: (id: string, partnerLogin?: string, teamName?: string) =>
    request<{ id: string; status: string }>(
      `/tournaments/${encodeURIComponent(id)}/join`,
      {
        method: 'POST',
        body: JSON.stringify({
          ...(partnerLogin ? { partnerLogin } : {}),
          ...(teamName ? { teamName } : {}),
        }),
      },
    ),
  leaveTournament: (id: string) =>
    request<{ id: string; left: true }>(
      `/tournaments/${encodeURIComponent(id)}/leave`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  // Organisateur/admin : envoie une invitation (le joueur doit accepter).
  inviteTournamentPlayer: (id: string, login: string) =>
    request<TournamentInvite>(
      `/tournaments/${encodeURIComponent(id)}/invite`,
      { method: 'POST', body: JSON.stringify({ login }) },
    ),
  acceptTournamentInvite: (tournamentId: string, inviteId: string) =>
    request<{ id: string; inviteId: string; status: string }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/invites/${encodeURIComponent(inviteId)}/accept`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  declineTournamentInvite: (tournamentId: string, inviteId: string) =>
    request<{ id: string; inviteId: string; status: string }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/invites/${encodeURIComponent(inviteId)}/decline`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  // Organisateur/admin : ajoute directement un joueur (1v1) ou une paire (2v2).
  addTournamentPlayer: (id: string, login: string, partnerLogin?: string, teamName?: string) =>
    request<{ id: string; added: string; status: string }>(
      `/tournaments/${encodeURIComponent(id)}/add-player`,
      {
        method: 'POST',
        body: JSON.stringify({
          login,
          ...(partnerLogin ? { partnerLogin } : {}),
          ...(teamName ? { teamName } : {}),
        }),
      },
    ),
  // 2v2 : (re)nomme une équipe (capitaine = `login`). Membre/organisateur/admin.
  setTournamentTeamName: (id: string, login: string, teamName: string) =>
    request<{ id: string; login: string; teamName: string | null }>(
      `/tournaments/${encodeURIComponent(id)}/team-name`,
      { method: 'POST', body: JSON.stringify({ login, teamName }) },
    ),
  // Créateur/admin : ajoute ou retire un co-organisateur (tous les droits).
  manageTournamentOrganizer: (id: string, login: string, action: 'add' | 'remove') =>
    request<{ id: string; coOrganizers: string[] }>(
      `/tournaments/${encodeURIComponent(id)}/organizers`,
      { method: 'POST', body: JSON.stringify({ login, action }) },
    ),
  // Organisateur/admin : retire un inscrit (en 2v2 = tout le duo) pendant l'inscription.
  removeTournamentPlayer: (id: string, login: string) =>
    request<{ id: string; removed: string }>(
      `/tournaments/${encodeURIComponent(id)}/remove-player`,
      { method: 'POST', body: JSON.stringify({ login }) },
    ),
  // Officiant : revient en phase d'inscription depuis une ligue en cours (si aucun
  // match démarré ni bracket généré). Efface les affiches, rembourse les paris.
  reopenLeagueRegistration: (id: string) =>
    request<{ id: string; reopened: true }>(
      `/tournaments/${encodeURIComponent(id)}/league/reopen`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  startTournament: (id: string) =>
    request<{ id: string; started: true }>(
      `/tournaments/${encodeURIComponent(id)}/start`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  reshuffleTournament: (id: string) =>
    request<{ id: string; reshuffled: true }>(
      `/tournaments/${encodeURIComponent(id)}/reshuffle`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  // Officiant : échange deux joueurs dans le bracket (drag-and-drop). Validé tant
  // qu'aucun des deux matchs n'est confirmé.
  swapBracketPlayers: (id: string, loginA: string, loginB: string) =>
    request<{ id: string; swapped: true }>(
      `/tournaments/${encodeURIComponent(id)}/bracket/swap`,
      { method: 'POST', body: JSON.stringify({ loginA, loginB }) },
    ),
  cancelTournament: (id: string) =>
    request<{ id: string; cancelled: true }>(
      `/tournaments/${encodeURIComponent(id)}/cancel`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  recordTournamentMatch: (
    tournamentId: string,
    matchId: string,
    scoreA: number,
    scoreB: number,
  ) =>
    request<{ id: string; status: string }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/record`,
      { method: 'POST', body: JSON.stringify({ scoreA, scoreB }) },
    ),
  confirmTournamentMatch: (
    tournamentId: string,
    matchId: string,
    scoreA: number,
    scoreB: number,
  ) =>
    request<{ id: string; winnerLogin: string; finished: boolean }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/confirm`,
      { method: 'POST', body: JSON.stringify({ scoreA, scoreB }) },
    ),
  tossTournamentMatch: (tournamentId: string, matchId: string) =>
    request<TournamentMatch>(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/toss`,
      { method: 'POST' },
    ),
  pickTournamentAdvantage: (tournamentId: string, matchId: string, pick: string) =>
    request<TournamentMatch>(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/advantage`,
      { method: 'POST', body: JSON.stringify({ pick }) },
    ),
  rejectTournamentMatch: (tournamentId: string, matchId: string) =>
    request<{ id: string; rejected: true }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/reject`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  // « Match suivant » : l'organisateur désigne le duel en cours → écran VERSUS
  // chez tous les spectateurs + badge « EN COURS » dans l'arbre.
  announceTournamentMatch: (tournamentId: string, matchId: string) =>
    request<{ id: string; activeMatchId: string | null }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/announce`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  // ── Phase de ligue (admin/officiant) ─────────────────────────────────────────
  // Compose une affiche (équipe A vs équipe B, logins capitaines). `leg` = manche :
  // 0 = aller (défaut), 1 = retour (autorisé seulement si l'aller existe déjà).
  addLeagueMatch: (tournamentId: string, playerALogin: string, playerBLogin: string, leg: 0 | 1 = 0) =>
    request<TournamentMatch>(
      `/tournaments/${encodeURIComponent(tournamentId)}/league/matches`,
      { method: 'POST', body: JSON.stringify({ playerALogin, playerBLogin, leg }) },
    ),
  // Édite le score d'un match de ligue DÉJÀ CONFIRMÉ (correction admin/officiant).
  editLeagueScore: (tournamentId: string, matchId: string, scoreA: number, scoreB: number) =>
    request<{ id: string; edited: true }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/league/matches/${encodeURIComponent(matchId)}/edit-score`,
      { method: 'POST', body: JSON.stringify({ scoreA, scoreB }) },
    ),
  // Supprime une affiche de ligue non confirmée.
  deleteLeagueMatch: (tournamentId: string, matchId: string) =>
    request<{ id: string; deleted: true }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/league/matches/${encodeURIComponent(matchId)}`,
      { method: 'DELETE' },
    ),
  // Bascule la ligue en élimination directe : les `qualifyCount` premiers au goal
  // average (nombre LIBRE ≥ 2 — le bracket gère les byes). Autorisée même si tous les
  // matchs ne sont pas joués (les non-joués sont ignorés du classement).
  finalizeLeague: (tournamentId: string, qualifyCount: number) =>
    request<{ id: string; finalized: true; qualifyCount: number }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/league/finalize`,
      { method: 'POST', body: JSON.stringify({ qualifyCount }) },
    ),
  // Persiste le nombre d'équipes qualifiées en phase finale (modifiable au fil de la ligue).
  setLeagueQualifyCount: (tournamentId: string, qualifyCount: number) =>
    request<{ id: string; leagueQualifyCount: number }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/league/qualify-count`,
      { method: 'POST', body: JSON.stringify({ qualifyCount }) },
    ),
  // (Re)génère les affiches aller manquantes du round-robin (idempotent).
  generateLeagueSchedule: (tournamentId: string) =>
    request<{ id: string; created: number }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/league/generate`,
      { method: 'POST' },
    ),
  // Annule la bascule en phase finale et rouvre la ligue (si le bracket n'a pas commencé).
  undoFinalizeLeague: (tournamentId: string) =>
    request<{ id: string; undone: true }>(
      `/tournaments/${encodeURIComponent(tournamentId)}/league/undo-finalize`,
      { method: 'POST' },
    ),
  locations: () => request<Record<string, string>>('/locations'),
  health: () => request<{ ok: boolean }>('/health', {}, { auth: false }),

  // ── Admin ──────────────────────────────────────────────────────────────────
  adminUsers: () => request<AdminUser[]>('/admin/users'),
  // Staging : un admin récupère un token du compte `tester` (rôle USER) pour
  // tester l'app en mode utilisateur (cf. composant TesterSwitch).
  impersonateTester: () =>
    request<{ token: string; login: string }>('/admin/impersonate-tester', {
      method: 'POST',
    }),
  // Staging : crée un compte tester TOUT NEUF (login unique) et renvoie son token,
  // pour revivre l'arrivée d'un joueur fraîchement créé (onboarding, stats vierges).
  impersonateFreshTester: () =>
    request<{ token: string; login: string }>('/admin/impersonate-fresh-tester', {
      method: 'POST',
    }),
  setStagingAccess: (login: string, grant: boolean) =>
    request<{ login: string; role: string; stagingAllowed: boolean }>(
      `/admin/users/${encodeURIComponent(login)}/staging-access`,
      { method: 'POST', body: JSON.stringify({ grant }) },
    ),
  setUserRole: (login: string, role: 'USER' | 'MODERATOR' | 'ADMIN') =>
    request<{ login: string; role: string }>(
      `/admin/users/${encodeURIComponent(login)}/role`,
      { method: 'POST', body: JSON.stringify({ role }) },
    ),
  adminSetStats: (
    login: string,
    stats: {
      elo?: number;
      matchesPlayed?: number;
      dodgeCount?: number;
      tournamentsWon?: number;
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
      games?: Game[];
    },
  ) =>
    request<AdminUser>(`/admin/users/${encodeURIComponent(login)}/stats`, {
      method: 'PATCH',
      body: JSON.stringify(stats),
    }),
  adminBanUser: (login: string) =>
    request<{ login: string; bannedAt: string }>(`/admin/users/${encodeURIComponent(login)}/ban`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  adminUnbanUser: (login: string) =>
    request<{ login: string; bannedAt: null }>(`/admin/users/${encodeURIComponent(login)}/unban`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  adminModerationStats: (login: string) =>
    request<ModerationStats>(`/admin/users/${encodeURIComponent(login)}/moderation`),
  setModeratorPermissions: (login: string, permissions: Partial<Record<ModeratorPermissionKey, boolean>>) =>
    request<{ login: string; moderatorPermissions: Record<string, boolean> }>(
      `/admin/users/${encodeURIComponent(login)}/moderator-permissions`,
      { method: 'PATCH', body: JSON.stringify(permissions) },
    ),
  adminDeleteMatch: (id: string) =>
    request<{ id: string; deleted: true }>(`/admin/matches/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  adminEditMatch: (
    id: string,
    input: { scoreA: number; scoreB: number; playerALogin?: string; playerBLogin?: string },
  ) =>
    request<PlayedMatch>(`/admin/matches/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  // SUPERADMIN : créer un faux joueur, supprimer un faux joueur, forcer un résultat.
  adminCreateUser: (login: string, opts?: { campus?: string; elo?: number }) =>
    request<AdminUser>('/admin/users', {
      method: 'POST',
      body: JSON.stringify({ login, ...opts }),
    }),
  adminDeleteUser: (login: string) =>
    request<{ login: string; deleted: true }>(`/admin/users/${encodeURIComponent(login)}`, {
      method: 'DELETE',
    }),
  // SUPERADMIN : reset total de la ligue. `confirm` doit valoir la phrase exacte.
  adminResetDatabase: (confirm: string) =>
    request<{ reset: true; removedUsers: number; resetUsers: number }>('/admin/reset-database', {
      method: 'POST',
      body: JSON.stringify({ confirm }),
    }),
  adminForceResult: (playerA: string, playerB: string, scoreA: number, scoreB: number) =>
    request<PlayedMatch>('/admin/matches/force-result', {
      method: 'POST',
      body: JSON.stringify({ playerA, playerB, scoreA, scoreB }),
    }),
  // SUPERADMIN : forcer la résolution d'un match en attente (validation ou annulation).
  adminForceConfirmMatch: (id: string) =>
    request<PlayedMatch>(`/admin/matches/${encodeURIComponent(id)}/force-confirm`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  adminForceCancelMatch: (id: string) =>
    request<{ id: string; status: 'cancelled' }>(`/admin/matches/${encodeURIComponent(id)}/force-cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  adminRejectedMatches: () => request<RejectedMatch[]>('/admin/rejected-matches'),
  /** File d'arbitrage des litiges (status: 'open' par défaut, 'all' pour l'historique). */
  adminDisputes: (status: 'open' | 'all' = 'open') =>
    request<RejectedMatch[]>(`/admin/disputes?status=${status}`),
  /** Tranche un litige : applique le malus au fautif (sauf 'dismiss'). */
  adminResolveDispute: (id: string, verdict: DisputeVerdict) =>
    request<{ id: string; status: 'resolved'; verdict: DisputeVerdict; culprit: string | null; malus: { tier: number; elo: number; coins: number; cooldownUntil: string } | null }>(
      `/admin/disputes/${encodeURIComponent(id)}/resolve`,
      { method: 'POST', body: JSON.stringify({ verdict }) },
    ),
  adminSuspicious: () => request<SuspiciousFlag[]>('/admin/suspicious'),
  adminAuditLog: (filters?: { actor?: string; target?: string; action?: AdminAuditAction; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.actor) params.set('actor', filters.actor);
    if (filters?.target) params.set('target', filters.target);
    if (filters?.action) params.set('action', filters.action);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return request<AdminAuditEntry[]>(`/admin/audit-log${qs ? `?${qs}` : ''}`);
  },
  adminDeleteChallenge: (id: string) =>
    request<{ id: string; deleted: true }>(`/admin/challenges/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminDeletePendingMatch: (id: string) =>
    request<{ id: string; deleted: true }>(`/admin/pending-matches/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminDeleteRejectedMatch: (id: string) =>
    request<{ id: string; deleted: true }>(`/admin/rejected-matches/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminDeleteOps: (id: string) =>
    request<{ id: string; deleted: true }>(`/admin/ops/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminResetOpsCooldown: (login: string) =>
    request<{ login: string; cooldownReset: true; resetAt: string | null }>(
      `/admin/ops/${encodeURIComponent(login)}/reset-cooldown`,
      { method: 'POST' },
    ),
  adminDeleteTournament: (id: string) =>
    request<{ id: string; deleted: true }>(`/admin/tournaments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminForceTournamentAccept: (tournamentId: string, inviteId: string) =>
    request<{ id: string; inviteId: string; status: string; started: boolean }>(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/invites/${encodeURIComponent(inviteId)}/force-accept`,
      { method: 'POST' },
    ),
  adminForceTournamentMatch: (
    tournamentId: string,
    matchId: string,
    scoreA: number,
    scoreB: number,
  ) =>
    request<{ id: string; winnerLogin: string | null; finished: boolean; bracketGenerated: boolean }>(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/force-result`,
      { method: 'POST', body: JSON.stringify({ scoreA, scoreB }) },
    ),
  adminCancelTournamentInvite: (tournamentId: string, inviteId: string) =>
    request<{ id: string; inviteId: string; cancelled: true }>(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/invites/${encodeURIComponent(inviteId)}/cancel`,
      { method: 'POST' },
    ),
  adminRemoveTournamentEntry: (tournamentId: string, login: string) =>
    request<{ id: string; removed: string }>(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/entries/${encodeURIComponent(login)}/remove`,
      { method: 'POST' },
    ),
  adminAddTournamentPlayer: (tournamentId: string, login: string) =>
    request<{ id: string; invited: string; inviteId: string; status: string }>(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/players`,
      { method: 'POST', body: JSON.stringify({ login }) },
    ),
  adminStartTournament: (tournamentId: string) =>
    request<{ id: string; started: boolean; players: number }>(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/start`,
      { method: 'POST' },
    ),
  adminUpdateTournament: (
    tournamentId: string,
    patch: {
      name?: string;
      kind?: 'friendly' | 'official';
      isPrivate?: boolean;
      capacity?: number;
      format?: 'elimination' | 'pools' | 'league';
    },
  ) =>
    request<{ id: string; updated: true }>(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ),
  adminAllHistory: (filters?: { login?: string; type?: AllHistoryEventType; game?: Game; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.login) params.set('login', filters.login);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.game) params.set('game', filters.game);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return request<AllHistoryEvent[]>(`/admin/all-history${qs ? `?${qs}` : ''}`);
  },
  createFeatureRequest: (text: string) =>
    request<{ id: string; text: string; status: string; createdAt: string }>(
      '/feature-requests',
      { method: 'POST', body: JSON.stringify({ text }) },
    ),
  featureRequests: () => request<FeatureRequestWithAuthor[]>('/feature-requests'),
  setFeatureRequestStatus: (id: string, status: 'pending' | 'accepted' | 'rejected') =>
    request<FeatureRequestWithAuthor>(`/feature-requests/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  createBugReport: (text: string) =>
    request<{ id: string; text: string; status: string; createdAt: string }>(
      '/bug-reports',
      { method: 'POST', body: JSON.stringify({ text }) },
    ),
  bugReports: () => request<BugReportWithAuthor[]>('/bug-reports'),
  setBugReportStatus: (id: string, status: 'open' | 'resolved' | 'closed') =>
    request<BugReportWithAuthor>(`/bug-reports/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // ─── Babyfoot 2v2 ───────────────────────────────────────────────────────────

  declare2v2Match: (input: {
    partnerLogin: string;
    opponentLogin: string;
    opponent2Login: string;
    scoreSelf: number;
    scoreOpponent: number;
  }) =>
    request<Declare2v2Response>('/matches/2v2', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  nameTeam: (teamId: string, name: string) =>
    request<BabyfootTeam>(`/teams/${encodeURIComponent(teamId)}/name`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  teamLeaderboard: () => request<BabyfootTeamEntry[]>('/teams/leaderboard'),

  teamProfile: (teamId: string) =>
    request<TeamProfile>(`/teams/${encodeURIComponent(teamId)}`),

  /** Toutes les équipes auxquelles appartient un joueur donné. */
  myTeams: (login: string) =>
    request<BabyfootTeamEntry[]>(`/teams?login=${encodeURIComponent(login)}`),

  // ─── League Coin · Boutique ────────────────────────────────────────────────

  shop: () => request<ShopResponse>('/shop'),
  buyShopItem: (id: string) =>
    request<{ ok: true; coins: number; reward?: MysteryReward | null }>(`/shop/${encodeURIComponent(id)}/buy`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  inventory: () => request<InventoryEntry[]>('/me/inventory'),
  equipItem: (id: string, equipped: boolean) =>
    request<{ ok: true }>(`/me/inventory/${encodeURIComponent(id)}/equip`, {
      method: 'POST',
      body: JSON.stringify({ equipped }),
    }),
  uploadCustomBannerImage: (id: string, image: string) =>
    request<{ ok: true }>(`/me/inventory/${encodeURIComponent(id)}/banner-image`, {
      method: 'POST',
      body: JSON.stringify({ image }),
    }),
  // ── Consommables ───────────────────────────────────────────────────────────
  consumables: () => request<ConsumablesResponse>('/me/consumables'),
  useConsumable: (
    kind: ConsumableKind,
    // force_duel : { player1, player2 } · mini_ops : { target } · autres : aucun.
    body?: { player1: string; player2: string; game?: Game } | { target: string; game?: Game },
  ) =>
    request<{ ok: true; until?: string; cancelled?: boolean; forced?: boolean; challengeId?: string }>(
      `/me/consumables/${encodeURIComponent(kind)}/use`,
      { method: 'POST', body: JSON.stringify(body ?? {}) },
    ),
  // ── Annonces générales ────────────────────────────────────────────────────
  announcements: () => request<AnnouncementData[]>('/announcements'),
  markAnnouncementsSeen: (ids: string[]) =>
    request<{ ok: true }>('/announcements/seen', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  adminAnnouncements: () => request<AnnouncementData[]>('/admin/announcements'),
  adminCreateAnnouncement: (input: AnnouncementInput) =>
    request<AnnouncementData>('/admin/announcements', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  adminDeleteAnnouncement: (id: string) =>
    request<{ ok: true }>(`/admin/announcements/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  adminShopItems: () => request<ShopItemData[]>('/admin/shop/items'),
  adminCreateShopItem: (input: ShopItemInput) =>
    request<ShopItemData>('/admin/shop/items', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  adminUpdateShopItem: (id: string, patch: Partial<ShopItemInput>) =>
    request<ShopItemData>(`/admin/shop/items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  adminDeleteShopItem: (id: string) =>
    request<{ ok: true }>(`/admin/shop/items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  adminGrantCoins: (login: string, amount: number) =>
    request<{ ok: true; login: string; coins: number }>('/admin/shop/grant', {
      method: 'POST',
      body: JSON.stringify({ login, amount }),
    }),
  // ── Passe de combat (XP) ────────────────────────────────────────────────────
  battlePass: () => request<BattlePassResponse>('/me/battlepass'),
  adminBattlePassTiers: () => request<BattlePassTierAdmin[]>('/admin/battlepass/tiers'),
  adminSetBattlePassTier: (tier: number, input: Omit<BattlePassTierAdmin, 'tier'>) =>
    request<BattlePassTierAdmin>(`/admin/battlepass/tiers/${tier}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  adminDeleteBattlePassTier: (tier: number) =>
    request<{ ok: true }>(`/admin/battlepass/tiers/${tier}`, {
      method: 'DELETE',
    }),
  // ── Suivi des coins (Shop GOD) ────────────────────────────────────────────
  /** Annuaire des joueurs avec leur solde (tri solde décroissant, recherche optionnelle). */
  adminShopUsers: (search?: string) =>
    request<ShopUserRow[]>(
      `/admin/shop/users${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ),
  /** Fiche détaillée d'un joueur : solde + récap + inventaire + journal paginé. */
  adminShopUser: (
    login: string,
    opts?: { limit?: number; offset?: number; type?: string },
  ) => {
    const qs = new URLSearchParams();
    if (opts?.limit != null) qs.set('limit', String(opts.limit));
    if (opts?.offset != null) qs.set('offset', String(opts.offset));
    if (opts?.type) qs.set('type', opts.type);
    const q = qs.toString();
    return request<ShopUserDetail>(
      `/admin/shop/users/${encodeURIComponent(login)}${q ? `?${q}` : ''}`,
    );
  },
  /** Donne un cosmétique (item boutique) à un joueur, avec auto-équipement optionnel. */
  adminGrantItem: (login: string, itemId: string, equip?: boolean) =>
    request<{ ok: true; login: string; itemId: string; equipped: boolean }>(
      '/admin/shop/grant-item',
      { method: 'POST', body: JSON.stringify({ login, itemId, equip }) },
    ),
  // ── GOD : consommables & badges d'un joueur ───────────────────────────────
  /** État consommables + badges + titre d'un joueur (vue admin). */
  adminUserItems: (login: string) =>
    request<AdminUserItems>(`/admin/users/${encodeURIComponent(login)}/items`),
  /** Ajuste (±) le stock d'un consommable d'un joueur. */
  adminGrantConsumable: (login: string, kind: ConsumableKind, amount: number) =>
    request<{ ok: true; login: string; kind: ConsumableKind; quantity: number }>(
      '/admin/consumables/grant',
      { method: 'POST', body: JSON.stringify({ login, kind, amount }) },
    ),
  /** Force l'effet d'un consommable (ignore cap/cooldown/stock). */
  adminForceConsumable: (login: string, kind: ConsumableKind) =>
    request<{ ok: true; login: string; kind: ConsumableKind; armed?: boolean; hunter?: string | null }>(
      '/admin/consumables/force-use',
      { method: 'POST', body: JSON.stringify({ login, kind }) },
    ),
  /** Attribue un badge « libre » (code + icône Lucide + label + couleur) à un joueur. */
  adminGrantBadge: (
    login: string,
    badge: { code: string; label: string; icon: string; color?: string; game?: string },
  ) =>
    request<{ ok: true; login: string; code: string }>(
      `/admin/users/${encodeURIComponent(login)}/badges`,
      { method: 'POST', body: JSON.stringify(badge) },
    ),
  /** Retire un badge d'un joueur. */
  adminRemoveBadge: (login: string, code: string, game = '') =>
    request<{ ok: true; login: string; code: string }>(
      `/admin/users/${encodeURIComponent(login)}/badges/${encodeURIComponent(code)}?game=${encodeURIComponent(game)}`,
      { method: 'DELETE' },
    ),
  // ── Économie de coins : quêtes hebdo + paris ──────────────────────────────
  quests: () => request<QuestsResponse>('/quests'),
  claimQuest: (id: string) =>
    request<{ id: string; reward: number; coins: number }>(
      `/quests/${encodeURIComponent(id)}/claim`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  bets: () => request<BetsResponse>('/bets'),
  placeBet: (input: PlaceBetInput) =>
    request<{ bet: { id: string }; coins: number }>('/bets', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  placeOpsBet: (input: PlaceOpsBetInput) =>
    request<{ bet: { id: string }; coins: number }>('/bets/ops', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  placeMatchBet: (input: PlaceMatchBetInput) =>
    request<{ bet: { id: string }; coins: number }>('/bets/match', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // ── SF Club Sessions ──────────────────────────────────────────────────────

  getSfSessionCurrent: (): Promise<SfSessionCurrent> =>
    request<SfSessionCurrent>('/sf-session/current', {}, { auth: false }),

  adminListSfSessions: (): Promise<SfSession[]> =>
    request<SfSession[]>('/admin/sf-sessions'),

  adminCreateSfSession: (data: {
    startTime: string;
    endTime?: string;
    durationHours?: number;
    description?: string;
  }): Promise<SfSession> =>
    request<SfSession>('/admin/sf-sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  adminUpdateSfSession: (
    id: string,
    data: { endTime?: string | null; isActive?: boolean; description?: string },
  ): Promise<SfSession> =>
    request<SfSession>(`/admin/sf-sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  adminDeleteSfSession: (id: string): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>(`/admin/sf-sessions/${id}`, { method: 'DELETE' }),

  adminSetSfAdmin: (login: string, sfAdmin: boolean): Promise<{ ok: boolean; sfAdmin: boolean }> =>
    request<{ ok: boolean; sfAdmin: boolean }>(
      `/admin/users/${login}/sf-admin`,
      { method: 'POST', body: JSON.stringify({ sfAdmin }) },
    ),

  // ── Analytics : ingestion d'usage (best-effort) + vue d'ensemble GOD ────────
  /** Envoie un lot d'événements d'usage. Best-effort : on ignore les erreurs. */
  trackAnalytics: (events: TrackEventInput[]) =>
    request<void>('/analytics/track', {
      method: 'POST',
      body: JSON.stringify({ events }),
    }).catch(() => undefined),
  adminStatsOverview: (params?: { days?: number; game?: Game }) => {
    const qs = new URLSearchParams();
    if (params?.days) qs.set('days', String(params.days));
    if (params?.game) qs.set('game', params.game);
    const q = qs.toString();
    return request<StatsOverview>(`/admin/stats/overview${q ? `?${q}` : ''}`);
  },
};
