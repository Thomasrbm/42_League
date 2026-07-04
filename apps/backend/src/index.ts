import { Hono, type Context, type Next } from 'hono';
import { serve } from '@hono/node-server';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import {
  DeclareMatchSchema,
  ConfirmMatchSchema,
  RejectMatchSchema,
  CreateChallengeSchema,
  RecordResultSchema,
  CreateTournamentSchema,
  ShopItemCreateSchema,
  ShopRaritySchema,
  MAX_BANNER_DATAURL_LEN,
  AnnouncementCreateSchema,
  betPayout,
  cashPrizeForRounds,
  tournamentPlacements,
  tournamentEloForPlacement,
  DEFAULT_BET_FINAL_MULT,
  BET_FINAL_MULT_MIN,
  BET_FINAL_MULT_MAX,
  TournamentRecordSchema,
  TournamentForceResultSchema,
  LeagueMatchCreateSchema,
  TournamentEditScoreSchema,
  LeagueFinalizeSchema,
  LeagueQualifyCountSchema,
  SetTitleSchema,
  DeclareOpsSchema,
  FeatureRequestSchema,
  BugReportSchema,
  SetBugReportStatusSchema,
  SetRoleSchema,
  SetFeatureRequestStatusSchema,
  FavoritesUpdateSchema,
  Declare2v2MatchSchema,
  Confirm2v2MatchSchema,
  CreateChallenge2v2Schema,
  DeclareFfaSchema,
  ConfirmFfaPositionSchema,
  ContestFfaSchema,
  DeclareDartsSchema,
  ConfirmDartsSchema,
  ContestDartsSchema,
  CreateSfSessionSchema,
  UpdateSfSessionSchema,
  calculateBabyfootElo,
  calculateFfaElo,
  calculateDartsElo,
  shouldCountForElo,
  sameDayPriorCount,
  farmingDecayFactor,
  applyFarmingDecay,
  estimatedEloLoss,
  OPS_DURATION_MS,
  OPS_FORCED_MATCHES,
  OPS_REFUSE_MULTIPLIER,
  seasonResetElo,
  rankTierForRank,
  GRANDMASTER_MIN_ELO,
  ownedTitles,
  computeGoat,
  trophyCountsByLogin,
  type GameBoards,
  type TrophyMatch,
} from '@42-league/shared';
import {
  GAME_IDS,
  applyGameElo,
  eloAllGames,
  eloDelta,
  eloOrderBy,
  getGameAdvantage,
  getGameDef,
  parseGameId,
  playedFilter,
  projectStats,
  ratingUpdate,
  readElo,
  tournamentsWonDelta,
  validateTournamentScore,
  type GameId,
} from './games.js';
import { prisma } from './db.js';
import {
  canonicalTeamLogins,
  upsertBabyfootTeam,
  applyElo2v2,
  type Side2v2,
} from './babyfoot2v2.js';
import { seedStaging } from './staging-seed.js';
import type { Prisma } from '@prisma/client';
// Valeur runtime (Prisma.DbNull) pour stocker un JSON NULL en base — distinct du
// `import type` ci-dessus qui, lui, ne sert qu'aux annotations de type.
import { Prisma as PrismaRuntime, PrismaClient } from '@prisma/client';
import {
  createAuthRouter,
  getAllowedWebOrigins,
  getSessionLogin,
  isTrusted42Origin,
  type FtProfile,
} from './auth.js';
import { backfillMissingProfiles, fetchAndSavePublicUser, fetchPublicUserImage } from './ft-api.js';
import { getContributorStats } from './contributor-stats.js';
import { getCampusLocations } from './locations.js';
import {
  advanceWinner,
  generateBracket,
  generatePools,
  qualifiersFromPools,
  leagueQualifiers,
} from './tournament.js';
import { isAdmin } from './admins.js';
import { streamSSE } from 'hono/streaming';
import { bodyLimit } from 'hono/body-limit';
import { registerSse, emit, broadcast, type SseEvent } from './sse.js';
import { issueStreamToken, issueToken, verifyStreamToken, verifyToken } from './tokens.js';
import { logAdminAction, notifyClientError, notifyDiscordDispute } from './audit.js';
import { rateLimit, clientIp, clearPenalty, getPenaltyInfo } from './rate-limit.js';

// Hardcoded — immutable. No API can grant or revoke this.
const SUPERADMINS = new Set(['abidaux', 'throbert']);

// Logins autorisés à basculer « Tester en mode user » (staging only). Volontairement
// restreint à ces deux logins — les autres admins n'y ont PAS droit.
const TESTER_SWITCH_LOGINS = new Set(['throbert', 'jagharra']);

// Compte de test générique (rôle USER, cf. staging-seed.ts) sur lequel un admin
// peut basculer pour vivre l'expérience d'un joueur lambda (POST /admin/impersonate-tester).
const TESTER_LOGIN = 'tester';
// Comptes tester éphémères créés à la volée (bouton « nouveau compte tester ») :
// login unique préfixé `tester-…`. Reconnus comme comptes de test pour la staging
// gate, afin qu'un compte fraîchement créé puisse naviguer sans liste blanche.
const FRESH_TESTER_PREFIX = `${TESTER_LOGIN}-`;
const isTesterLogin = (login: string) =>
  login === TESTER_LOGIN || login.startsWith(FRESH_TESTER_PREFIX);

// Backdoor de dev : le header `x-dev-login` permet de se faire passer pour
// n'importe quel utilisateur SANS OAuth. Il est donc STRICTEMENT réservé au dev
// local et n'est honoré que si ALLOW_DEV_LOGIN=true est explicitement positionné.
// Fail-secure : par défaut (prod) le flag est absent → le header est ignoré.
// DURCISSEMENT : même si un .env de dev (ALLOW_DEV_LOGIN=true) était copié par
// erreur sur le serveur, la backdoor reste DÉSACTIVÉE en production — la garde
// `NODE_ENV !== 'production'` est codée en dur, indépendante du flag.
const ALLOW_DEV_LOGIN =
  process.env.ALLOW_DEV_LOGIN === 'true' && process.env.NODE_ENV !== 'production';

// En-têtes CORS autorisés. `x-dev-login` n'est annoncé QUE si la backdoor dev est
// réellement active (donc jamais en prod) — on n'invite pas à l'usurpation.
const ALLOW_HEADERS = `Authorization, Content-Type${ALLOW_DEV_LOGIN ? ', x-dev-login' : ''}`;

// =========================================================================
// CONSENTEMENT RGPD — preuve + version (CGU API 42, Art. 4.2 et Art. 3.1)
// =========================================================================
// Les CGU 42 exigent le consentement explicite de l'utilisateur final AVANT
// tout traitement de ses Données personnelles. On versionne la politique : si
// elle évolue, on bumpe CURRENT_TERMS_VERSION → tous les utilisateurs doivent
// re-consentir. La preuve (date + version) est stockée sur la ligne User.
// Format : 'YYYY-MM-DD' (date de la dernière révision de la politique affichée).
export const CURRENT_TERMS_VERSION = '2026-05-31';

/** Un consentement est requis si jamais donné, ou donné pour une version périmée. */
function consentRequired(user: { termsAcceptedAt: Date | null; termsVersion: string | null } | null): boolean {
  if (!user) return false; // pas encore en base → géré par l'auth, pas par la gate
  return !user.termsAcceptedAt || user.termsVersion !== CURRENT_TERMS_VERSION;
}

// Chemins exemptés de la consent-gate : ils DOIVENT fonctionner avant consentement
// (découverte de l'état, prise/retrait du consentement, droits RGPD, auth, SSE).
const CONSENT_EXEMPT_PATHS = new Set(['/health', '/me', '/me/consent', '/me/export', '/me/account', '/events']);
function isConsentExempt(path: string): boolean {
  return CONSENT_EXEMPT_PATHS.has(path) || path.startsWith('/auth/');
}

// =========================================================================
// PERMISSIONS MODÉRATEUR
// =========================================================================
// Clé → route(s) débloquée(s). ADMIN/SUPERADMIN passent partout sans vérification.
const MODERATOR_PERMISSIONS = [
  'canBan',                  // ban / unban users
  'canEditStats',            // PATCH /admin/users/:login/stats
  'canDeleteMatches',        // DELETE /admin/matches/:id
  'canEditMatches',          // PATCH  /admin/matches/:id
  'canDeletePendingMatches', // DELETE /admin/pending-matches/:id
  'canDeleteRejectedMatches',// GET + DELETE /admin/rejected-matches
  'canDeleteChallenges',     // DELETE /admin/challenges/:id
  'canDeleteOps',            // DELETE /admin/ops/:id
  'canResetOpsCooldown',     // POST   /admin/ops/:login/reset-cooldown
  'canDeleteTournaments',    // DELETE /admin/tournaments/:id
  'canViewSuspicious',       // GET /admin/suspicious
  'canViewAuditLog',         // GET /admin/audit-log
  'canViewHistory',          // GET /admin/all-history
  'canViewStats',            // GET /admin/stats/overview (onglet STATS du /moodo)
] as const;

type ModeratorPermission = (typeof MODERATOR_PERMISSIONS)[number];
type ModeratorPermissions = Partial<Record<ModeratorPermission, boolean>>;

async function getUserRole(login: string): Promise<'USER' | 'MODERATOR' | 'ADMIN' | 'SUPERADMIN'> {
  if (SUPERADMINS.has(login.toLowerCase())) return 'SUPERADMIN';
  const u = await prisma.user.findUnique({ where: { login }, select: { role: true } });
  return (u?.role as 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPERADMIN') ?? 'USER';
}

// ── Détection des comptes admin (cache court, 30 s) ──────────────────────────
// Partagé par le rate-limit, le body-limit et le flux SSE : les admins sont
// EXEMPTÉS des garde-fous anti-abus pour pouvoir tester librement le site
// (multi-onglets, scripts, gros payloads, nombreuses connexions temps réel).
let adminLoginCache: Set<string> | null = null;
let adminCacheExpiry = 0;
async function getAdminLogins(): Promise<Set<string>> {
  const now = Date.now();
  if (adminLoginCache && now < adminCacheExpiry) return adminLoginCache;
  const rows = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
    select: { login: true },
  });
  const set = new Set(rows.map((r) => r.login.toLowerCase()));
  for (const s of SUPERADMINS) set.add(s.toLowerCase());
  adminLoginCache = set;
  adminCacheExpiry = now + 30_000;
  return set;
}

/** Vrai si ce login est admin/superadmin (via le cache court). */
async function isAdminLogin(login: string): Promise<boolean> {
  if (SUPERADMINS.has(login.toLowerCase())) return true;
  return (await getAdminLogins()).has(login.toLowerCase());
}

/** Vrai si la requête porte un Bearer SIGNÉ d'un admin (exemption anti-abus). */
async function isAdminRequest(c: Context): Promise<boolean> {
  const auth = c.req.header('authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const login = verifyToken(auth.slice(7), secret);
  if (!login) return false;
  return isAdminLogin(login);
}

async function requireSuperAdmin(login: string): Promise<void> {
  // Garde-fou absolu : SUPERADMIN est uniquement abidaux et throbert (hardcodé).
  // Aucune route API ne peut accorder ce statut.
  if (!SUPERADMINS.has(login.toLowerCase())) {
    throw new HTTPException(403, { message: 'superadmins only' });
  }
}

async function requireAdmin(login: string): Promise<void> {
  const role = await getUserRole(login);
  if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
    throw new HTTPException(403, { message: 'admins only' });
  }
}

/** Tout admin ou modérateur (pour les routes de consultation basique). */
async function requireAdminOrModerator(login: string): Promise<void> {
  const role = await getUserRole(login);
  if (role !== 'ADMIN' && role !== 'SUPERADMIN' && role !== 'MODERATOR') {
    throw new HTTPException(403, { message: 'admins only' });
  }
}

async function requireSfAdminOrAdmin(login: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { login }, select: { sfAdmin: true, role: true } });
  if (!user) throw new HTTPException(403, { message: 'forbidden' });
  if (user.sfAdmin || user.role === 'ADMIN' || user.role === 'SUPERADMIN') return;
  throw new HTTPException(403, { message: 'sf admin or admin required' });
}

/**
 * Vérifie qu'un login a la permission demandée :
 * - ADMIN/SUPERADMIN → toujours autorisé
 * - MODERATOR → autorisé si la permission est dans moderatorPermissions
 * - USER → toujours refusé
 */
async function requirePerm(login: string, perm: ModeratorPermission): Promise<void> {
  const role = await getUserRole(login);
  if (role === 'ADMIN' || role === 'SUPERADMIN') return;
  if (role === 'MODERATOR') {
    const u = await prisma.user.findUnique({ where: { login }, select: { moderatorPermissions: true } });
    const perms = u?.moderatorPermissions as ModeratorPermissions | null;
    if (perms?.[perm]) return;
  }
  throw new HTTPException(403, { message: 'insufficient permissions' });
}

async function assertNotBanned(login: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { login }, select: { bannedAt: true } });
  if (user?.bannedAt) {
    throw new HTTPException(403, { message: 'account suspended' });
  }
}

// Un compte « hors-jeu » — banni, désactivé (suppression RGPD programmée) ou
// anonymisé — ne peut plus être défié ni ciblé par un OPS. À appeler AVANT tout
// getOrCreateUser sur la cible : l'upsert remettrait sinon deletionScheduledAt à
// null et réactiverait par mégarde un compte désactivé.
async function assertTargetable(login: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { login },
    select: { bannedAt: true, anonymizedAt: true, deletionScheduledAt: true },
  });
  if (!user || user.bannedAt || user.anonymizedAt || user.deletionScheduledAt) {
    throw new HTTPException(403, { message: 'ce joueur n’est plus disponible' });
  }
}

// Quand un compte sort du jeu (ban, désactivation, anonymisation), ses tournois
// disparaissent : ceux qu'il a CRÉÉS sont supprimés intégralement (cascade →
// entries + matches) et sa place est libérée dans ceux où il n'était qu'inscrit
// et encore en phase d'inscription (retirer une entrée d'un bracket en cours le
// corromprait). Renvoie true si quelque chose a changé (→ broadcast utile).
async function purgeUserFromTournaments(
  tx: Prisma.TransactionClient,
  login: string,
): Promise<boolean> {
  // Rembourse les paris ouverts (d'autrui) sur les tournois de ce joueur AVANT
  // le cascade delete — sinon la mise des parieurs serait perdue.
  const createdTours = await tx.tournament.findMany({
    where: { createdByLogin: login },
    select: { id: true },
  });
  await refundOpenBetsForTournamentsTx(tx, createdTours.map((t) => t.id));
  const created = await tx.tournament.deleteMany({ where: { createdByLogin: login } });
  const freed = await tx.tournamentEntry.deleteMany({
    where: { login, tournament: { status: 'registration' } },
  });
  return created.count > 0 || freed.count > 0;
}

// Annule les défis « en cours » (en attente ou acceptés) impliquant un compte
// qui sort du jeu (ban / désactivation / anonymisation) : il ne doit plus avoir
// de duel actif. Renvoie true si au moins un défi a été annulé.
async function cancelUserChallenges(
  tx: Prisma.TransactionClient,
  login: string,
): Promise<boolean> {
  const res = await tx.challenge.updateMany({
    where: {
      OR: [{ challengerLogin: login }, { opponentLogin: login }],
      status: { in: ['pending', 'accepted'] },
    },
    data: { status: 'cancelled', decidedAt: new Date() },
  });
  return res.count > 0;
}

// Supprime les FFA Smash EN ATTENTE impliquant un compte qui sort du jeu (ban /
// désactivation / anonymisation) — qu'il en soit le déclarant ou un participant.
// Cascade : la suppression d'un PendingFfa retire ses participants. Renvoie true
// si au moins un FFA en attente a été annulé.
async function cancelUserFfas(tx: Prisma.TransactionClient, login: string): Promise<boolean> {
  const res = await tx.pendingFfa.deleteMany({
    where: { OR: [{ declarerLogin: login }, { participants: { some: { login } } }] },
  });
  return res.count > 0;
}

// Filtre Prisma des comptes VISIBLES (en jeu) : ni bannis, ni désactivés
// (suppression RGPD programmée), ni anonymisés. Utilisé pour le classement et
// les listes publiques de joueurs.
const VISIBLE_USER_WHERE = {
  bannedAt: null,
  anonymizedAt: null,
  deletionScheduledAt: null,
} as const;

// Borne dure des listes publiques (anti-DoS : pas de findMany non borné). Très
// large pour une ligue mono-campus → aucun impact sur l'usage normal.
const MAX_PUBLIC_LIST = 1000;

// Champs SENSIBLES jamais exposés sur les routes PUBLIQUES (/users, /users/:login,
// /leaderboard). Réservés aux routes /admin/* (GOD panel, qui lit l'objet complet)
// et à /me (données de l'appelant lui-même). On retire : l'identifiant pivot intra
// 42 (ftId), la carte des permissions de modération, le flag d'accès staging et
// les horodatages RGPD internes. `role` reste exposé (badge admin/couronne au front).
const PUBLIC_USER_OMIT = [
  'ftId',
  'moderatorPermissions',
  'stagingAllowed',
  'bannedAt',
  'anonymizedAt',
  'deletionScheduledAt',
  'termsAcceptedAt',
  'termsVersion',
  // Semaine d'activation du boost ELO ×2 — interne (la limite hebdo). `eloMultUntil`
  // reste public : les autres voient qu'un joueur est « en feu » sur sa fiche.
  'eloMultWeekKey',
  // Fin du cooldown de sanction de litige — interne (seul /me l'expose). La MARQUE
  // `disputesLost`, elle, RESTE publique (transparence sociale).
  'penaltyCooldownUntil',
] as const;

/** Retire les champs sensibles d'un objet User avant sérialisation publique. */
function toPublicUser<T extends Record<string, unknown>>(
  user: T,
): Omit<T, (typeof PUBLIC_USER_OMIT)[number]> {
  const clone = { ...user };
  for (const k of PUBLIC_USER_OMIT) delete (clone as Record<string, unknown>)[k];
  return clone as Omit<T, (typeof PUBLIC_USER_OMIT)[number]>;
}

// ── Notifications in-app ──────────────────────────────────────────────────
// Crée une notification et pousse un signal SSE 'notification' pour rafraîchir
// la cloche instantanément (le front poll aussi toutes les 30s en secours).
// Tolérant aux erreurs : une notif ratée ne doit jamais casser l'action métier.
interface NotifInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
  /** Jeu d'origine (couleur/emoji + bascule de mode au clic). Absent = transverse. */
  game?: string;
  /** Entité liée (pendingMatch / playedMatch / challenge) → marquage auto-lu. */
  refId?: string;
}

async function notify(to: string, n: NotifInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: { id: randomUUID(), recipientLogin: to, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null, game: n.game ?? null, refId: n.refId ?? null },
    });
    emit([to], { type: 'notification', payload: {} });
  } catch {
    /* noop — best effort */
  }
}

async function notifyMany(tos: string[], n: NotifInput): Promise<void> {
  if (tos.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: tos.map((to) => ({ id: randomUUID(), recipientLogin: to, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null, game: n.game ?? null, refId: n.refId ?? null })),
    });
    emit(tos, { type: 'notification', payload: {} });
  } catch {
    /* noop */
  }
}

// Marque « lues » toutes les notifs cloche liées à une entité (refId) pour les
// destinataires donnés — appelé dès que l'action est traitée (score validé /
// contesté, défi accepté / refusé) pour ne pas laisser de doublon non-lu dans
// la cloche alors que le popup + la section Défis l'ont déjà géré.
async function markNotifsReadByRef(logins: string | string[], refId: string): Promise<void> {
  const list = (Array.isArray(logins) ? logins : [logins]).filter(Boolean);
  if (list.length === 0) return;
  try {
    const res = await prisma.notification.updateMany({
      where: { recipientLogin: { in: list }, refId, read: false },
      data: { read: true },
    });
    if (res.count > 0) emit(list, { type: 'notification', payload: {} });
  } catch {
    /* noop */
  }
}

// Notifie chaque joueur d'un match réglé du résultat (cloche), teinté à la
// discipline. Orienté par joueur : « Victoire / Défaite / Match nul » + score
// dans son sens. refId = id du match (informationnel, pas d'action à traiter).
async function notifyMatchResult(match: {
  id: string;
  game: string;
  scoreA: number;
  scoreB: number;
  winner: string;
  playerALogin: string;
  playerBLogin: string;
  playerA2Login?: string | null;
  playerB2Login?: string | null;
}): Promise<void> {
  const teamA = [match.playerALogin, match.playerA2Login].filter(Boolean) as string[];
  const teamB = [match.playerBLogin, match.playerB2Login].filter(Boolean) as string[];
  for (const login of [...teamA, ...teamB]) {
    const onA = teamA.includes(login);
    const outcome =
      match.winner === 'draw' ? 'Match nul' : (match.winner === 'A') === onA ? 'Victoire' : 'Défaite';
    const score = onA ? `${match.scoreA}–${match.scoreB}` : `${match.scoreB}–${match.scoreA}`;
    void notify(login, {
      type: 'match_result',
      title: outcome,
      body: `${score} · ELO mis à jour`,
      link: `/challenges?game=${encodeURIComponent(match.game)}`,
      game: match.game,
      // Suffixe `:result` : le match réglé réutilise l'id du pending, or l'auto-lecture
      // cible ce même id — sans suffixe, le résultat tout juste créé serait marqué lu.
      refId: `${match.id}:result`,
    });
  }
}

// Jeu d'un tournoi (best-effort) — pour teinter les notifs liées à un tournoi.
async function tournamentGame(id: string): Promise<string | undefined> {
  const t = await prisma.tournament
    .findUnique({ where: { id }, select: { game: true } })
    .catch(() => null);
  return t?.game ?? undefined;
}

// Annonce un nouveau joueur à tous les membres visibles de la league.
async function announceNewPlayer(login: string): Promise<void> {
  try {
    const others = await prisma.user.findMany({
      where: { ...VISIBLE_USER_WHERE, login: { not: login } },
      select: { login: true },
    });
    await notifyMany(others.map((u) => u.login), {
      type: 'new_player',
      title: `Nouveau joueur : @${login}`,
      body: `${login} a rejoint la league`,
      link: `/player/${encodeURIComponent(login)}`,
    });
  } catch {
    /* noop */
  }
}

// ── Followers : notifie les abonnés d'un joueur selon leurs préférences ──────
type FollowPref = 'notifyTournament' | 'notifyTop3' | 'notifyTrophy' | 'notifyOps';

async function notifyFollowers(followee: string, pref: FollowPref, n: NotifInput): Promise<void> {
  try {
    const follows = await prisma.follow.findMany({
      where: { followeeLogin: followee, [pref]: true },
      select: { followerLogin: true },
    });
    await notifyMany(follows.map((f) => f.followerLogin), n);
  } catch {
    /* noop */
  }
}

// Notifie les abonnés quand un joueur ENTRE dans le top 3 (transition only).
async function maybeNotifyTop3(login: string, delta: number): Promise<void> {
  if (delta <= 0) return; // pas de montée → rien
  try {
    const users = await prisma.user.findMany({ where: VISIBLE_USER_WHERE, select: { login: true, elo: true } });
    const self = users.find((u) => u.login === login);
    if (!self) return;
    const others = users.filter((u) => u.login !== login);
    const newRank = others.filter((u) => u.elo > self.elo).length + 1;
    const oldRank = others.filter((u) => u.elo > self.elo - delta).length + 1;
    if (oldRank > 3 && newRank <= 3) {
      await notifyFollowers(login, 'notifyTop3', {
        type: 'follow_top3',
        title: `@${login} entre dans le top 3`,
        body: `#${newRank} au classement`,
        link: '/leaderboard',
        game: 'babyfoot',
      });
    }
  } catch {
    /* noop */
  }
}

// G.O.A.T (meilleur joueur all-time) d'une discipline : #1 du classement pondéré
// (cf. @42-league/shared computeGoat — calcul identique à la page GOAT du front).
// Balaie tout l'historique des matchs du jeu → mis en cache (TTL court) car
// interrogé pour chaque rendu de profil/fiche/classement.
const GOAT_TOP1_TTL_MS = 60_000;
const goatTop1Cache = new Map<string, { login: string | null; at: number }>();
async function goatTop1ForGame(game: string): Promise<string | null> {
  const cached = goatTop1Cache.get(game);
  const now = Date.now();
  if (cached && now - cached.at < GOAT_TOP1_TTL_MS) return cached.login;
  // Ensemble des candidats = classement courant de la discipline (joueurs visibles).
  const [candidates, matches, tournaments] = await Promise.all([
    prisma.user.findMany({
      where: { ...VISIBLE_USER_WHERE, games: { has: game } },
      select: { login: true },
    }),
    prisma.playedMatch.findMany({
      where: { game },
      select: {
        countedForElo: true,
        playerALogin: true,
        playerBLogin: true,
        deltaA: true,
        deltaB: true,
        winner: true,
        scoreA: true,
        scoreB: true,
        playedAt: true,
      },
    }),
    prisma.tournament.findMany({
      where: { game, status: 'finished', winnerLogin: { not: null } },
      select: { status: true, winnerLogin: true, kind: true },
    }),
  ]);
  const ranking = computeGoat(candidates, matches, tournaments);
  const top = ranking[0]?.entry.login ?? null;
  goatTop1Cache.set(game, { login: top, at: now });
  return top;
}

// Badges d'un joueur : badges par défaut dérivés du rôle (admin/superadmin) et
// du fondateur (throbert), suivis des badges gagnés (stockés en base), plus le
// badge G.O.A.T auto-attribué au #1 du classement GOAT de sa discipline principale.
// Assemble les codes de badges de catalogue d'un joueur (source unique, partagée
// par badgesFor et badgesForUsers pour éviter toute divergence de règles).
// `earnedCodes` = codes des UserBadge SANS label (les badges « libres » à label
// sont rendus à part via customBadgesFor). `isGoat` = #1 du classement GOAT de sa
// discipline principale (remplace l'ancien titre « G.O.A.T »).
function assembleBadgeCodes(login: string, role: string, earnedCodes: string[], isGoat: boolean): string[] {
  const out: string[] = [];
  if (['throbert', 'abidaux'].includes(login.toLowerCase())) out.push('founder');
  if (role === 'ADMIN') out.push('admin');
  out.push(...earnedCodes);
  if (isGoat) out.push('goat');
  return [...new Set(out)];
}

async function badgesFor(login: string, role: string, games?: string[]): Promise<string[]> {
  const earned = await prisma.userBadge.findMany({
    where: { userLogin: login },
    select: { code: true, label: true },
    orderBy: { awardedAt: 'asc' },
  });
  const earnedCodes = earned.filter((e) => !e.label).map((e) => e.code);
  const isGoat = (await goatTop1ForGame(parseGameId(games?.[0]))) === login;
  return assembleBadgeCodes(login, role, earnedCodes, isGoat);
}

// Variante batchée pour les listes (classement) : 1 seule requête UserBadge pour
// tous les logins, et un classement GOAT calculé (caché) une fois par discipline
// distincte. Renvoie une Map login → codes de badges de catalogue.
async function badgesForUsers(
  users: { login: string; role: string; games: string[] }[],
): Promise<Map<string, string[]>> {
  const logins = users.map((u) => u.login);
  const earned = await prisma.userBadge.findMany({
    where: { userLogin: { in: logins } },
    select: { userLogin: true, code: true, label: true },
    orderBy: { awardedAt: 'asc' },
  });
  const earnedByLogin = new Map<string, string[]>();
  for (const e of earned) {
    if (e.label) continue;
    const arr = earnedByLogin.get(e.userLogin) ?? [];
    arr.push(e.code);
    earnedByLogin.set(e.userLogin, arr);
  }
  const out = new Map<string, string[]>();
  for (const u of users) {
    const isGoat = (await goatTop1ForGame(parseGameId(u.games?.[0]))) === u.login;
    out.set(u.login, assembleBadgeCodes(u.login, u.role, earnedByLogin.get(u.login) ?? [], isGoat));
  }
  return out;
}

// Badges « libres » attribués via le /GOD : métadonnées d'affichage portées par la
// ligne (rendus comme les badges boutique, via la prop `extra` côté front).
async function customBadgesFor(
  login: string,
): Promise<{ code: string; label: string; icon: string; color: string | null }[]> {
  const rows = await prisma.userBadge.findMany({
    where: { userLogin: login, label: { not: null } },
    orderBy: { awardedAt: 'asc' },
  });
  return rows.map((r) => ({
    code: r.code,
    label: r.label ?? r.code,
    icon: r.icon ?? 'Award',
    color: r.color ?? null,
  }));
}

// Palmarès d'un joueur : ses classements finaux par saison (récents d'abord).
async function palmaresFor(login: string): Promise<
  { seasonId: string; seasonName: string; rank: number; elo: number; wins: number; losses: number }[]
> {
  // Palmarès = classements babyfoot (un par saison) pour éviter les doublons
  // multi-jeux dans la liste du profil.
  const standings = await prisma.seasonStanding.findMany({ where: { login, game: 'babyfoot' } });
  if (!standings.length) return [];
  const seasons = await prisma.season.findMany({
    where: { id: { in: standings.map((s) => s.seasonId) } },
    select: { id: true, name: true, startedAt: true },
  });
  const byId = new Map(seasons.map((s) => [s.id, s]));
  return standings
    .map((s) => ({
      seasonId: s.seasonId,
      seasonName: byId.get(s.seasonId)?.name ?? 'Saison',
      rank: s.rank,
      elo: s.elo,
      wins: s.wins,
      losses: s.losses,
      _t: byId.get(s.seasonId)?.startedAt?.getTime() ?? 0,
    }))
    .sort((a, b) => b._t - a._t)
    .map(({ _t, ...rest }) => rest);
}

// Titres POSSÉDÉS par un joueur (dérivés de ses accomplissements). On agrège
// ses badges, le total de tournois gagnés (toutes disciplines) et son rang dans
// sa discipline principale, puis on délègue la dérivation au module pur
// `ownedTitles` (@42-league/shared/titles), partagé avec le frontend.
async function ownedTitlesFor(
  login: string,
  role: string,
  user: { tournamentsWon: number; tournamentsWonSmash: number; tournamentsWonChess: number; tournamentsWonSf: number; tournamentsWonFlechettes: number; games: string[] } | null,
): Promise<{ key: string; label: string }[]> {
  if (!user) return [];
  const badges = await badgesFor(login, role, user.games);
  const tournamentsWon =
    user.tournamentsWon + user.tournamentsWonSmash + user.tournamentsWonChess + user.tournamentsWonSf + user.tournamentsWonFlechettes;
  return ownedTitles({ login, badges, tournamentsWon });
}

async function getOrCreateUser(login: string, profile?: FtProfile) {
  const forceSuperAdmin = SUPERADMINS.has(login.toLowerCase());
  // Sert à détecter un tout nouveau compte (pour notifier la league).
  const existed = await prisma.user.findUnique({ where: { login }, select: { login: true } });
  const user = await prisma.user.upsert({
    where: { login },
    update: {
      ...(profile
        ? {
            ftId: profile.ftId,
            campus: profile.campus,
            firstName: profile.firstName,
            lastName: profile.lastName,
            imageUrl: profile.imageUrl,
          }
        : {}),
      // Always re-enforce SUPERADMIN role on login — no one can downgrade it
      ...(forceSuperAdmin ? { role: 'SUPERADMIN' } : {}),
      // RGPD Art. 17 — période de grâce : se reconnecter annule une suppression
      // programmée et restaure intégralement le compte (elo + historique).
      deletionScheduledAt: null,
    },
    create: {
      login,
      ftId: profile?.ftId ?? null,
      campus: profile?.campus ?? null,
      imageUrl: profile?.imageUrl ?? null,
      role: forceSuperAdmin ? 'SUPERADMIN' : 'USER',
      // Pécule de bienvenue : tout nouvel inscrit démarre avec 300 League Coins.
      leagueCoins: 300,
    },
  });
  if (!user.imageUrl) {
    // background fetch — fire and forget, in-flight dedup inside ft-api
    fetchAndSavePublicUser(login).catch(() => {});
  }
  // Nouveau membre → on prévient le reste de la league (fire-and-forget).
  if (!existed) {
    void announceNewPlayer(login);
  }
  return user;
}

function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function getCurrentLogin(c: Context): Promise<string> {
  const sessionLogin = await getSessionLogin(c);
  if (sessionLogin) return sessionLogin;
  const devLogin = c.req.header('x-dev-login');
  if (ALLOW_DEV_LOGIN && devLogin) return devLogin;
  throw new HTTPException(401, {
    message: 'not authenticated — call /auth/login',
  });
}

// Variante pour le flux SSE : EventSource ne peut pas envoyer de header
// Authorization, on autorise donc en plus l'auth via ?token=... en query param.
async function getStreamLogin(c: Context): Promise<string> {
  const sessionLogin = await getSessionLogin(c);
  if (sessionLogin) return sessionLogin;
  const secret = process.env.SESSION_SECRET;
  const queryToken = c.req.query('token');
  if (secret && queryToken) {
    // Uniquement un token de scope 'sse' (éphémère) — surtout pas le Bearer
    // complet : la query string fuite dans les logs / l'historique / le Referer.
    const login = verifyStreamToken(queryToken, secret);
    if (login) return login;
  }
  const devLogin = c.req.header('x-dev-login');
  if (ALLOW_DEV_LOGIN && devLogin) return devLogin;
  throw new HTTPException(401, { message: 'not authenticated' });
}

const WEB_APP_ORIGINS = new Set(getAllowedWebOrigins());

export const app = new Hono();
// =========================================================================
// MIDDLEWARE CORS + PNA BLINDÉ
// =========================================================================
app.use('*', async (c, next) => {
  const reqOrigin = c.req.header('origin') || c.req.header('Origin');
  
  // Autoriser l'origine si elle est dans la liste WEB_APP_ORIGINS (chargée depuis .env) 
  // ou si c'est l'intra 42
  const isAllowed = !!reqOrigin && (WEB_APP_ORIGINS.has(reqOrigin) || isTrusted42Origin(reqOrigin));
  const allowedOrigin = isAllowed ? reqOrigin : 'https://profile.intra.42.fr';

  c.header('Access-Control-Allow-Origin', allowedOrigin);
  // L'ACAO est calculé dynamiquement selon l'Origin → `Vary: Origin` pour qu'aucun
  // cache intermédiaire ne serve une réponse avec l'ACAO d'une AUTRE origine.
  c.header('Vary', 'Origin');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', ALLOW_HEADERS);
  c.header('Access-Control-Allow-Private-Network', 'true');

  if (c.req.method === 'OPTIONS') {
    c.status(204);
    return c.body(null);
  }

  await next();
});

// =========================================================================
// LIMITE DE TAILLE DE CORPS — anti-DoS mémoire
// =========================================================================
// Hono ne borne pas le corps par défaut : un POST de plusieurs centaines de Mo
// serait entièrement bufferisé en mémoire (c.req.json()) AVANT tout contrôle, au
// risque de faire saturer/OOM le process. On plafonne à 1 Mo (très large pour des
// bodies JSON). Désactivé sous NODE_ENV=test ; les admins sont exemptés.
if (process.env.NODE_ENV !== 'test') {
  const limiter = bodyLimit({
    maxSize: 1024 * 1024, // 1 Mo
    onError: (c) => c.json({ message: 'payload too large' }, 413),
  });
  app.use('*', async (c, next) => {
    if (await isAdminRequest(c)) return next();
    return limiter(c, next);
  });
}

// =========================================================================
// RATE-LIMITING — garde-fou anti-abus pour la bêta
// =========================================================================
// NB : le middleware CORS ci-dessus court-circuite déjà les requêtes OPTIONS
// (preflight) sans appeler next(), donc les limiteurs ne les comptent pas.
// Désactivé sous NODE_ENV=test : les tests d'intégration partagent tous l'IP
// `unknown` (pas de X-Forwarded-For via app.request) et trébucheraient sur le
// plafond. Le middleware lui-même est couvert par rate-limit.test.ts.
if (process.env.NODE_ENV !== 'test') {
  const isMutation = (c: Context) =>
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(c.req.method);

  // Les admins (Bearer SIGNÉ d'un rôle ADMIN/SUPERADMIN) contournent le rate-limit :
  // ils doivent pouvoir générer beaucoup de requêtes (onglets dev, SSE, modération,
  // scripts de test). Détection via isAdminRequest (module-scope, cache 30 s).
  const orAdmin = (base?: (c: Context) => boolean) => async (c: Context) =>
    (await isAdminRequest(c)) || (base ? base(c) : false);

  // Clé de comptage : par utilisateur (login signé) quand authentifié, sinon par
  // IP. Tout le campus 42 sort derrière une seule IP publique (NAT) ; compter par
  // IP additionnerait les requêtes de tous les joueurs et déclencherait le
  // backstop alors que chacun navigue normalement. Le login vient du Bearer signé,
  // donc non falsifiable. Fallback IP pour les requêtes pré-auth (OAuth).
  const bySubject = (c: Context): string => {
    const auth = c.req.header('authorization');
    const secret = process.env.SESSION_SECRET;
    if (auth?.startsWith('Bearer ') && secret) {
      const login = verifyToken(auth.slice(7), secret);
      if (login) return `user:${login.toLowerCase()}`;
    }
    return `ip:${clientIp(c)}`;
  };

  // Backstop global (600/min par joueur). Les admins sont exemptés. Pas de
  // pénalité progressive : un burst de navigation ne doit jamais déclencher un
  // ban croissant — au pire un 429 qui se purge à la fin de la fenêtre de 60 s.
  // Le plafond compte TOUT (GET inclus), or un seul refresh = ~12 requêtes
  // parallèles (/me + 11 domaines), +3 à chaque switch de jeu, + pollers/SSE :
  // 120/min se vidait en quelques refreshs et verrouillait l'app entière pendant
  // 60 s. 12 000/min (plafond très large) laisse passer tout usage humain, même
  // intense/multi-onglets, et ne sert plus que de garde-fou anti-flood (script/DoS).
  // L'escalade reste sur l'auth (brute-force) et les écritures (spam de mutations).
  app.use('*', rateLimit({ name: 'global', windowMs: 60_000, max: 12_000, key: bySubject, progressive: false, skip: orAdmin() }));

  // Auth : protège l'échange OAuth contre le brute-force. Pré-auth → clé par IP.
  app.use('/auth/*', rateLimit({
    name: 'auth', windowMs: 15 * 60_000, max: 1000,
    skip: (c) => c.req.path === '/auth/stream-token',
  }));

  // Quotas par action — fenêtres HORAIRES (et non 24 h) : un joueur actif peut
  // enchaîner plusieurs matchs par heure dans différents jeux, et le quota se
  // recharge en ≤ 1 h au lieu de verrouiller pour le reste de la journée. Le
  // plafond reste un garde-fou anti-spam (déclarations bidon qui faussent l'Elo),
  // avec pénalité progressive si on le pulvérise. Par joueur (sinon le quota
  // serait partagé par tout le campus derrière le NAT). Admins exemptés.
  // NB : `/matches` couvre TOUS les 1v1 (babyfoot/smash/chess/sf) → plafond large.
  app.use('/matches',     rateLimit({ name: 'matches-declare',   windowMs: 3600_000, max: 800, key: bySubject, skip: orAdmin((c) => !isMutation(c)) }));
  // `/matches` est un matcher EXACT → ne couvre pas `/matches/ffa`. Quota dédié à
  // la déclaration FFA (la liste GET est exemptée via `!isMutation`).
  app.use('/matches/ffa', rateLimit({ name: 'ffa-declare',       windowMs: 3600_000, max: 800, key: bySubject, skip: orAdmin((c) => !isMutation(c)) }));
  app.use('/challenges',  rateLimit({ name: 'challenges-create', windowMs: 3600_000, max: 600, key: bySubject, skip: orAdmin((c) => !isMutation(c)) }));
  app.use('/tournaments', rateLimit({ name: 'tournaments-create',windowMs: 3600_000, max: 300, key: bySubject, skip: orAdmin((c) => !isMutation(c)) }));

  // Écriture générale (mutations restantes), par joueur. Admins exemptés.
  const writeLimiter = rateLimit({ name: 'write', windowMs: 60_000, max: 1200, key: bySubject, skip: orAdmin((c) => !isMutation(c)) });
  for (const path of ['/matches/*', '/challenges/*', '/tournaments/*', '/ops', '/feature-requests', '/bug-reports']) {
    app.use(path, writeLimiter);
  }
  // Télémétrie d'usage : envois groupés et peu fréquents (cf. lib/analytics côté web),
  // mais on borne quand même les abus. Les admins sont exemptés (tests).
  app.use('/analytics/*', rateLimit({ name: 'analytics', windowMs: 60_000, max: 1200, key: bySubject, skip: orAdmin((c) => !isMutation(c)) }));
  // Remontée d'erreurs client (écran TV live surtout) → Discord. Bornée serré pour
  // éviter qu'une boucle d'erreur ne spamme le webhook. Pas d'exemption admin (la TV
  // est souvent connectée en admin et c'est justement là qu'on veut limiter).
  app.use('/client-errors', rateLimit({ name: 'client-errors', windowMs: 60_000, max: 30, key: bySubject }));
}

// =========================================================================
// STAGING GATE — accès réservé à une liste blanche (APP_ENV=staging)
// =========================================================================
// Sur l'environnement de staging UNIQUEMENT, toute l'API est réservée aux logins
// de STAGING_ALLOWED. On exempte la santé, tout le flux d'auth/OAuth (sinon
// impossible de se connecter) et /me (le front le lit pour afficher l'écran
// « accès réservé » côté non-autorisé). Défense en profondeur : même un appel API
// direct par un login non autorisé est refusé ici, pas seulement masqué côté front.
//
// throbert & abidaux sont superadmins ; jagharra est invité pour les tests
// (rôle ADMIN, jamais superadmin — cf. staging-seed.ts) ; tester est le compte
// USER générique de l'impersonation (cf. POST /admin/impersonate-tester).
const STAGING_ALLOWED = new Set([...SUPERADMINS, 'jagharra', TESTER_LOGIN]);
if (process.env.APP_ENV === 'staging') {
  app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();
    const p = c.req.path;
    if (p === '/health' || p.startsWith('/auth') || p === '/me' || p.startsWith('/me/')) {
      return next();
    }
    // Le flux SSE (/events) s'ouvre via EventSource, qui ne peut PAS envoyer de
    // header Authorization : il s'authentifie par le token éphémère ?token=… (scope
    // 'sse'). On le résout donc comme le handler /events lui-même, sinon le gate le
    // refuserait en 401 avant même d'atteindre la route. Voir getStreamLogin.
    const login =
      p === '/events'
        ? await getStreamLogin(c).catch(() => null)
        : await getSessionLogin(c);
    if (!login) throw new HTTPException(401, { message: 'staging: connexion requise' });
    if (!STAGING_ALLOWED.has(login.toLowerCase()) && !isTesterLogin(login.toLowerCase())) {
      // Vérifie le flag stagingAllowed en base (accordé via /admin/users/:login/staging-access).
      // Basé sur APP_ENV (var serveur) + DB → non falsifiable par un header client.
      const user = await prisma.user.findUnique({ where: { login }, select: { stagingAllowed: true } });
      if (!user?.stagingAllowed) {
        throw new HTTPException(403, { message: 'staging: accès réservé' });
      }
    }
    return next();
  });
}

// =========================================================================
// CONSENT-GATE — application côté serveur du consentement RGPD
// =========================================================================
// Défense en profondeur : la modale frontend peut être contournée (appel direct
// à l'API, client modifié…). Cette gate garantit qu'AUCUNE donnée 42 n'est lue ni
// écrite tant que l'utilisateur n'a pas consenti — conformément aux CGU 42 qui
// interdisent tout traitement sans consentement explicite préalable.
//
// Logique fail-safe :
//  - Requête non authentifiée → on laisse passer (la route renverra 401 elle-même).
//  - Chemin exempté (auth, /me, consentement, droits RGPD, SSE) → on laisse passer.
//  - Sinon, on vérifie le consentement en base ; s'il manque → 403 consent_required.
app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  if (isConsentExempt(c.req.path)) return next();

  const login = await getSessionLogin(c);
  if (!login && !(ALLOW_DEV_LOGIN && c.req.header('x-dev-login'))) return next();
  const effectiveLogin = login ?? c.req.header('x-dev-login');
  if (!effectiveLogin) return next();

  const user = await prisma.user.findUnique({
    where: { login: effectiveLogin },
    select: { termsAcceptedAt: true, termsVersion: true },
  });
  if (consentRequired(user)) {
    throw new HTTPException(403, { message: 'consent_required' });
  }
  return next();
});

// =========================================================================
// TEMPS RÉEL — events SSE ciblés
// =========================================================================
// Stratégie :
//  - Les changements qui ne concernent que certains joueurs (défis, matchs, ops)
//    sont émis EN CIBLÉ directement dans les handlers via emit([logins], …).
//  - Les changements GLOBAUX visibles par tous (classement, tournois) sont diffusés
//    à tous les clients connectés via les middlewares par domaine ci-dessous.
// Dans tous les cas le front ne ré-interroge QUE la tranche de données concernée
// (et non les 8 endpoints).
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Diffuse `event` à tous les clients après une mutation réussie sur ce préfixe. */
function broadcastOnMutation(event: SseEvent) {
  return async (c: Context, next: Next) => {
    await next();
    if (!MUTATING_METHODS.has(c.req.method)) return;
    if (c.res.status < 200 || c.res.status >= 300) return;
    broadcast(event);
  };
}

// Tournois : liste + bracket sont publics → tout le monde rafraîchit les tournois.
app.use('/tournaments', broadcastOnMutation({ type: 'tournament:update', payload: {} }));
app.use('/tournaments/*', broadcastOnMutation({ type: 'tournament:update', payload: {} }));
// Admin : peut toucher stats / matchs / bans (rare) → refresh complet par sécurité.
app.use('/admin/*', broadcastOnMutation({ type: 'data:update', payload: {} }));

// GOD panel : déclarations / confirmations / rejets de matchs, défis et idées
// ne sont émis qu'EN CIBLÉ aux joueurs concernés → un admin qui regarde le panel
// ne les verrait jamais. On diffuse donc un `panel:update` léger que SEUL le
// front du panel écoute ; les autres clients n'ont pas de listener pour ce type
// → l'event est ignoré côté navigateur, aucun re-fetch inutile.
const panelUpdate = broadcastOnMutation({ type: 'panel:update', payload: {} });
app.use('/matches', panelUpdate);
app.use('/matches/*', panelUpdate);
app.use('/challenges', panelUpdate);
app.use('/challenges/*', panelUpdate);
app.use('/feature-requests', panelUpdate);
app.use('/feature-requests/*', panelUpdate);
app.use('/bug-reports', panelUpdate);
app.use('/bug-reports/*', panelUpdate);

// Gestionnaire d'erreurs global (pour que le CORS soit là même sur une erreur 401 !)
app.onError((err, c) => {
  const reqOrigin = c.req.header('origin') || c.req.header('Origin');
  // Même validation stricte que le middleware CORS (hostname exact, pas de
  // sous-chaîne) — et on reflète aussi les origines de l'app web pour qu'elle
  // puisse lire le corps des erreurs (401/403…).
  const allowedOrigin =
    reqOrigin && (WEB_APP_ORIGINS.has(reqOrigin) || isTrusted42Origin(reqOrigin))
      ? reqOrigin
      : 'https://profile.intra.42.fr';

  c.header('Access-Control-Allow-Origin', allowedOrigin);
  c.header('Vary', 'Origin');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', ALLOW_HEADERS);
  c.header('Access-Control-Allow-Private-Network', 'true');

  const status = err instanceof HTTPException ? err.status : 500;
  return c.json({ message: err.message || 'Internal Server Error' }, status);
});


app.get('/health', (c) => c.json({ ok: true }));

app.get('/locations', async (c) => {
  await getCurrentLogin(c);
  const map = await getCampusLocations();
  return c.json(Object.fromEntries(map));
});

app.post('/admin/refresh-images', async (c) => {
  const me = await getCurrentLogin(c);
  if (!isAdmin(me)) {
    throw new HTTPException(403, { message: 'admins only' });
  }
  const n = await backfillMissingProfiles();
  return c.json({ scheduled: n });
});

app.post('/admin/users/:login/title', async (c) => {
  const me = await getCurrentLogin(c);
  if (!isAdmin(me)) {
    throw new HTTPException(403, { message: 'admins only' });
  }
  const login = c.req.param('login');
  const body = await c.req.json().catch(() => null);
  const parsed = SetTitleSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const cleaned = parsed.data.title?.trim() || null;
  const before = await prisma.user.findUnique({ where: { login }, select: { title: true } });
  const user = await prisma.user.update({
    where: { login },
    data: { title: cleaned },
  });
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_TITLE',
    target: login,
    payload: { from: before?.title ?? null, to: cleaned },
  });
  return c.json({ login: user.login, title: user.title });
});

app.route(
  '/auth',
  createAuthRouter(async (profile) => {
    await getOrCreateUser(profile.login, profile);
  }),
);

// Cosmétiques actuellement ÉQUIPÉS par un joueur (achetés en boutique) : couleur
// du titre, badge acheté (rendu via une def inline côté front), et image de bannière
// (fond de la carte profil). Renvoyés par /me et /users/:login pour l'affichage profil.
interface EquippedCosmetics {
  titleColor: string | null;
  equippedBadge: { code: string; label: string; icon: string; color: string | null } | null;
  equippedBanner: string | null;
}
async function equippedCosmetics(login: string): Promise<EquippedCosmetics> {
  const rows = await prisma.shopInventory.findMany({
    where: { userLogin: login, equipped: true, item: { category: { in: ['title', 'badge', 'banner'] } } },
    include: { item: true },
  });
  const out: EquippedCosmetics = { titleColor: null, equippedBadge: null, equippedBanner: null };
  for (const r of rows) {
    const it = r.item;
    const payload =
      it.payload && typeof it.payload === 'object' && !Array.isArray(it.payload)
        ? (it.payload as Record<string, unknown>)
        : {};
    if (it.category === 'title') {
      out.titleColor = it.color ?? null;
    } else if (it.category === 'badge') {
      out.equippedBadge = {
        code: typeof payload.code === 'string' ? payload.code : it.id,
        label: typeof payload.label === 'string' ? payload.label : it.name,
        icon: typeof payload.icon === 'string' ? payload.icon : 'Award',
        color: it.color ?? null,
      };
    } else if (it.category === 'banner') {
      // Bannière personnalisable : image uploadée par le joueur prioritaire sur l'image de l'item.
      const up = r.userPayload && typeof r.userPayload === 'object' && !Array.isArray(r.userPayload)
        ? (r.userPayload as Record<string, unknown>)
        : null;
      const userImg = up && typeof up.image === 'string' ? up.image : null;
      out.equippedBanner = userImg ?? (typeof payload.image === 'string' ? payload.image : null);
    }
  }
  return out;
}

app.get('/me', async (c) => {
  const login = await getCurrentLogin(c);
  // S'assure que le compte existe (1er login) → permet l'onboarding des modes.
  await getOrCreateUser(login);
  const user = await prisma.user.findUnique({ where: { login } });
  const role = await getUserRole(login);
  const badges = user ? await badgesFor(login, role, user.games) : [];
  const customBadges = user ? await customBadgesFor(login) : [];
  const palmares = user ? await palmaresFor(login) : [];
  const ownedTitlesList = await ownedTitlesFor(login, role, user);
  const cosmetics = await equippedCosmetics(login);
  // Annonces générales non encore vues par ce joueur → popup « une seule fois ».
  // On ne montre que celles postées APRÈS la création du compte (un nouvel
  // inscrit n'a pas à se taper l'historique d'annonces antérieures à son arrivée).
  const unseenAnnouncements = user
    ? (
        await prisma.announcement.findMany({
          where: {
            active: true,
            createdAt: { gt: user.createdAt },
            seenBy: { none: { userLogin: login } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      ).map(serializeAnnouncement)
    : [];
  return c.json({
    login,
    user,
    role,
    // Titres que le joueur POSSÈDE (dérivés des accomplissements) — sert au
    // sélecteur de titre côté front (cf. PUT /me/title).
    ownedTitles: ownedTitlesList,
    // Cosmétiques équipés (boutique) : couleur titre, badge acheté, bannière de fond.
    titleColor: cosmetics.titleColor,
    equippedBadge: cosmetics.equippedBadge,
    equippedBanner: cosmetics.equippedBanner,
    // Solde « League Coin » du joueur (porte-monnaie boutique).
    coins: user?.leagueCoins ?? 0,
    // XP & passe de combat : total à vie + niveau/progression dérivés (autorité serveur).
    xp: user?.xp ?? 0,
    level: levelFromXp(user?.xp ?? 0).level,
    xpIntoLevel: levelFromXp(user?.xp ?? 0).xpIntoLevel,
    xpForNextLevel: levelFromXp(user?.xp ?? 0).xpForNextLevel,
    tier: levelFromXp(user?.xp ?? 0).level,
    // Réputation litiges : marque (nb de litiges perdus) + fin du cooldown de
    // sanction (déclaration/paris bloqués tant qu'elle est future).
    disputesLost: user?.disputesLost ?? 0,
    penaltyCooldownUntil: user?.penaltyCooldownUntil ? user.penaltyCooldownUntil.toISOString() : null,
    // Série d'assiduité ranked : série courante, record, bonus ELO actif, prochain palier.
    streak: streakView(user),
    isAdmin: isAdmin(login),
    // Permissions de modération (MODERATOR uniquement, {} si aucune accordée) —
    // pilote les sections visibles du panneau /moodo côté front.
    moderatorPermissions:
      role === 'MODERATOR' ? ((user?.moderatorPermissions as ModeratorPermissions | null) ?? {}) : null,
    // Autorisé à accéder au staging (cf. STAGING_ALLOWED) — le front s'en sert
    // pour la barrière staging sans dupliquer la liste blanche.
    stagingAllowed: STAGING_ALLOWED.has(login.toLowerCase()) || isTesterLogin(login.toLowerCase()),
    badges,
    customBadges,
    palmares,
    // Pilote la consent-gate côté frontend (cf. AuthenticatedShell).
    consentRequired: consentRequired(user),
    sfAdmin: user?.sfAdmin ?? false,
    termsVersion: CURRENT_TERMS_VERSION,
    // Annonces générales à montrer en popup (cf. AnnouncementPopup côté front).
    unseenAnnouncements,
  });
});

// ── Sélection de titre (self-service) ──────────────────────────────────────
// Le joueur choisit lui-même un titre parmi ceux qu'il POSSÈDE (dérivés de ses
// accomplissements, cf. ownedTitlesFor). `title: null` retire le titre. Pour
// rester permissif avec les titres accordés par un admin (route admin distincte
// inchangée), on autorise aussi la conservation du titre actuellement porté.
app.put('/me/title', async (c) => {
  const login = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => null);
  const raw = body && typeof body.title === 'string' ? body.title.trim() : null;

  await getOrCreateUser(login);
  const user = await prisma.user.findUnique({ where: { login } });
  if (!user) throw new HTTPException(404, { message: 'user not found' });

  // Retrait du titre.
  if (!raw) {
    const updated = await prisma.user.update({ where: { login }, data: { title: null } });
    return c.json({ login: updated.login, title: updated.title });
  }

  // Bloque le changement si l'Apôtre de Sheldon est encore dans sa semaine d'exposition.
  const nowTitle = new Date();
  const equippedItems = await prisma.shopInventory.findMany({
    where: { userLogin: login, equipped: true },
    include: { item: true },
  });
  const activeSheldon = equippedItems.find(
    (r) =>
      isSheldonApostle(r.item) &&
      r.equippedAt != null &&
      r.equippedAt.getTime() + SHELDON_LOCK_MS > nowTitle.getTime(),
  );
  if (activeSheldon) {
    const until = new Date(activeSheldon.equippedAt!.getTime() + SHELDON_LOCK_MS).toISOString();
    throw new HTTPException(409, {
      message: `impossible de changer de titre tant que l'Apôtre de Sheldon est équipé (jusqu'au ${until})`,
    });
  }

  const role = await getUserRole(login);
  const owned = await ownedTitlesFor(login, role, user);
  const allowed = new Set(owned.map((o) => o.label));
  // Tolère le titre déjà porté (potentiellement accordé par un admin).
  if (user.title) allowed.add(user.title);

  if (!allowed.has(raw)) {
    throw new HTTPException(403, { message: 'titre non débloqué' });
  }

  const updated = await prisma.user.update({ where: { login }, data: { title: raw } });
  return c.json({ login: updated.login, title: updated.title });
});

// ── RGPD / CGU 42 Art. 4.2 — Consentement explicite préalable ──
// Enregistre (accept=true) ou refuse (accept=false) le consentement de l'utilisateur
// final. La preuve = date + version stockées sur la ligne User. Sur refus, le compte
// est supprimé/anonymisé immédiatement (aucune donnée conservée sans consentement).
const ConsentSchema = z.object({ accept: z.boolean() });
app.post('/me/consent', async (c) => {
  const login = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => null);
  const parsed = ConsentSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  if (parsed.data.accept) {
    await getOrCreateUser(login);
    await prisma.user.update({
      where: { login },
      data: { termsAcceptedAt: new Date(), termsVersion: CURRENT_TERMS_VERSION },
    });
    return c.json({ ok: true, accepted: true });
  }

  // Refus → on ne conserve aucune donnée. Un superadmin ne peut pas s'auto-supprimer.
  if (SUPERADMINS.has(login.toLowerCase())) {
    throw new HTTPException(400, { message: 'superadmin accounts cannot be deleted' });
  }
  const existing = await prisma.user.findUnique({
    where: { login },
    select: { matchesPlayed: true, termsAcceptedAt: true },
  });
  // Compte vierge (jamais consenti, aucun match) → suppression sèche, propre et complète.
  // Sinon (re-consentement refusé après évolution de la politique) → anonymisation
  // pour préserver l'intégrité de l'historique des matchs déjà joués.
  const isPristine = !!existing && existing.matchesPlayed === 0 && !existing.termsAcceptedAt;
  if (isPristine) {
    await prisma.user.delete({ where: { login } }).catch(async () => {
      // Garde-fou : si une FK inattendue bloque la suppression, on bascule sur l'anonymisation.
      await anonymizeAccount(login);
    });
  } else if (existing) {
    await anonymizeAccount(login);
  }
  return c.json({ ok: true, accepted: false, deleted: true });
});

// Adhésion aux modes de jeu (onboarding + réglages). Un joueur n'apparaît dans
// les classements/stats d'un mode que s'il y adhère. Côté back, les ratings de
// tous les modes existent pour tout le monde (colonnes par défaut).
app.patch('/me/games', async (c) => {
  const login = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => ({}));
  const raw = Array.isArray(body.games) ? body.games : [];
  const games = [
    ...new Set(raw.filter((g: unknown) => g === 'babyfoot' || g === 'smash' || g === 'chess' || g === 'streetfighter' || g === 'flechettes')),
  ] as string[];
  if (games.length === 0) {
    throw new HTTPException(400, { message: 'choisis au moins un mode de jeu' });
  }
  await getOrCreateUser(login);
  const user = await prisma.user.update({
    where: { login },
    data: { games, onboardedAt: new Date() },
  });
  emit([login], { type: 'leaderboard:update', payload: {} });
  return c.json({ games: user.games, onboardedAt: user.onboardedAt });
});

// Personnages favoris (« mains ») par jeu de combat (Smash / Street Fighter).
// PATCH partiel : seules les clés fournies sont écrites. Dédup + cap de sécurité.
app.patch('/me/favorites', async (c) => {
  const login = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = FavoritesUpdateSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const dedup = (arr?: string[]) => (arr ? [...new Set(arr)] : undefined);
  const data: { favSmash?: string[]; favSf?: string[] } = {};
  const smash = dedup(parsed.data.smash);
  const sf = dedup(parsed.data.streetfighter);
  if (smash !== undefined) data.favSmash = smash;
  if (sf !== undefined) data.favSf = sf;

  await getOrCreateUser(login);
  const user = await prisma.user.update({ where: { login }, data });
  emit([login], { type: 'leaderboard:update', payload: {} });
  return c.json({ favSmash: user.favSmash, favSf: user.favSf });
});

// ── RGPD Art. 20 — Droit à la portabilité : export de toutes les données personnelles ──
app.get('/me/export', async (c) => {
  const login = await getCurrentLogin(c);
  const [user, matches, challenges, tournamentEntries, featureRequests, bugReports, ops] = await Promise.all([
    prisma.user.findUnique({ where: { login } }),
    prisma.playedMatch.findMany({
      where: { OR: [{ playerALogin: login }, { playerBLogin: login }] },
      orderBy: { playedAt: 'desc' },
    }),
    prisma.challenge.findMany({
      where: { OR: [{ challengerLogin: login }, { opponentLogin: login }] },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tournamentEntry.findMany({
      where: { login },
      include: { tournament: { select: { id: true, name: true, status: true, createdAt: true } } },
    }),
    prisma.featureRequest.findMany({
      where: { authorId: login },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.bugReport.findMany({
      where: { authorId: login },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.ops.findMany({
      where: { OR: [{ ownerLogin: login }, { targetLogin: login }] },
      orderBy: { declaredAt: 'desc' },
    }),
  ]);

  c.header('Content-Disposition', `attachment; filename="42league-export-${login}.json"`);
  return c.json({
    exportDate: new Date().toISOString(),
    profile: user,
    matchHistory: matches,
    challenges,
    tournaments: tournamentEntries,
    featureRequests,
    bugReports,
    ops,
  });
});

// ── RGPD Art. 17 — Droit à l'effacement : suppression avec période de grâce ──
// La suppression ne fait que PROGRAMMER l'effacement (deletionScheduledAt) :
// le compte disparaît immédiatement des vues publiques mais ses données sont
// conservées. L'anonymisation définitive et irréversible n'a lieu qu'après
// ACCOUNT_GRACE_DAYS jours (job quotidien). Se reconnecter avant l'échéance
// annule la suppression et restaure intégralement le compte — voir
// getOrCreateUser (remise à null de deletionScheduledAt à la connexion).
const ACCOUNT_GRACE_DAYS = Number(process.env.ACCOUNT_GRACE_DAYS ?? 30);

// Anonymisation définitive d'un compte : renomme le login (cascade vers toutes
// les FK ON UPDATE CASCADE), purge les PII et marque anonymizedAt. Réutilisée
// par le job de suppression différée.
async function anonymizeAccount(login: string): Promise<void> {
  const anonLogin =
    'anon_' + createHash('sha256').update(login + Date.now().toString()).digest('hex').slice(0, 8);

  await prisma.$transaction(async (tx) => {
    // Un compte anonymisé est définitivement hors-jeu : on purge ses tournois
    // et ses défis avant de renommer le login (la désactivation l'a
    // normalement déjà fait).
    await purgeUserFromTournaments(tx, login);
    await cancelUserChallenges(tx, login);
    await cancelUserFfas(tx, login);
    // Mise à jour du login (cascade automatique vers toutes les FK ON UPDATE CASCADE)
    await tx.user.update({
      where: { login },
      data: {
        login: anonLogin,
        ftId: null,
        campus: null,
        imageUrl: null,
        title: null,
        anonymizedAt: new Date(),
        deletionScheduledAt: null,
      },
    });
    // Tables sans FK déclarée : mise à jour manuelle
    await tx.adminAuditLog.updateMany({ where: { actorLogin: login }, data: { actorLogin: anonLogin } });
    await tx.adminAuditLog.updateMany({ where: { targetLogin: login }, data: { targetLogin: anonLogin } });
    await tx.tournamentMatch.updateMany({ where: { recordedByLogin: login }, data: { recordedByLogin: anonLogin } });
  });
}

app.delete('/me/account', async (c) => {
  const login = await getCurrentLogin(c);

  if (SUPERADMINS.has(login.toLowerCase())) {
    throw new HTTPException(400, { message: 'superadmin accounts cannot be anonymized' });
  }

  const tournamentsChanged = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { login },
      data: { deletionScheduledAt: new Date() },
    });
    // Un compte désactivé sort du jeu : ses tournois disparaissent, sa place est
    // libérée là où il était inscrit, et ses défis en cours sont annulés.
    const t = await purgeUserFromTournaments(tx, login);
    await cancelUserChallenges(tx, login);
    await cancelUserFfas(tx, login);
    return t;
  });

  if (tournamentsChanged) broadcast({ type: 'tournament:update', payload: {} });
  // Rafraîchit les listes (classement + défis des adversaires concernés).
  broadcast({ type: 'data:update', payload: {} });
  return c.json({ ok: true, graceDays: ACCOUNT_GRACE_DAYS });
});

// Échange le credential complet (Bearer / session) contre un token éphémère
// dédié au SSE. Le front l'appelle juste avant d'ouvrir l'EventSource — et à
// chaque reconnexion — pour ne jamais mettre le Bearer 30 jours en query string.
app.get('/auth/stream-token', async (c) => {
  const me = await getCurrentLogin(c);
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new HTTPException(500, { message: 'server misconfigured: SESSION_SECRET missing' });
  }
  return c.json({ token: issueStreamToken(me, secret) });
});

app.get('/events', async (c) => {
  // EventSource ne peut pas envoyer de header Authorization → on accepte aussi
  // un token éphémère de scope 'sse' en query param (?token=...), en plus de la
  // session/cookie habituels. Voir GET /auth/stream-token.
  const me = await getStreamLogin(c);
  // Admins non plafonnés (tests multi-onglets / outils) ; users normaux bornés à
  // MAX_SSE_PER_LOGIN flux simultanés (cf. sse.ts) — anti-DoS connexions.
  const unlimited = await isAdminLogin(me).catch(() => false);
  return streamSSE(c, async (stream) => {
    const cleanup = registerSse(me, stream, { unlimited });
    let alive = true;
    stream.onAbort(() => {
      alive = false;
      cleanup();
    });
    await stream.writeSSE({ event: 'connected', data: JSON.stringify({ login: me }) });
    while (alive) {
      await stream.sleep(25_000);
      if (!alive) break;
      try {
        await stream.writeSSE({ event: 'ping', data: String(Date.now()) });
      } catch {
        alive = false;
      }
    }
    cleanup();
  });
});

// ── RGPD Art. 25 — Privacy by design : toutes les données utilisateurs exigent une auth ──

app.get('/users', async (c) => {
  await getCurrentLogin(c);
  // Comptes hors-jeu (bannis / désactivés / anonymisés) masqués des vues publiques.
  const users = await prisma.user.findMany({
    where: VISIBLE_USER_WHERE,
    orderBy: { elo: 'desc' },
    take: MAX_PUBLIC_LIST,
  });
  // Allow-list publique : pas d'exposition de ftId / permissions de modération /
  // flag staging / horodatages RGPD à un simple utilisateur connecté.
  return c.json(users.map(toPublicUser));
});

// Photos de l'équipe (page About / Team) — résolues depuis l'API 42 PAR LOGIN, avec
// cache mémoire. On ne crée AUCUN compte joueur : ces membres « crédits » ne sont pas
// forcément des joueurs inscrits et ne doivent pas apparaître au classement (raison
// pour laquelle /users/:login échouait en 404 pour eux). Voir fetchPublicUserImage.
const TEAM_PHOTO_TTL_MS = 6 * 3600_000; // 6 h (succès)
// TTL négatif court : un fetch 42 raté (token pas encore prêt au boot, hoquet
// réseau, 404 transitoire) ne doit PAS rester collé 6 h — sinon la photo d'un
// membre (ex. rbardet-) disparaît jusqu'à expiration. On retente au bout de 5 min.
const TEAM_PHOTO_NEG_TTL_MS = 5 * 60_000; // 5 min (échec)
const teamPhotoCache = new Map<string, { url: string | null; expiresAt: number }>();

app.get('/team/photos', async (c) => {
  await getCurrentLogin(c);
  const logins = (c.req.query('logins') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30); // garde-fou anti-abus
  const now = Date.now();
  const entries = await Promise.all(
    logins.map(async (login) => {
      // 1) joueur déjà connu avec une photo en base → on la sert directement.
      const user = await prisma.user.findUnique({ where: { login }, select: { imageUrl: true } });
      if (user?.imageUrl) return [login, user.imageUrl] as const;
      // 2) cache mémoire (évite de retaper l'API 42 à chaque visite).
      const hit = teamPhotoCache.get(login);
      if (hit && hit.expiresAt > now) return [login, hit.url] as const;
      // 3) fetch 42 par login, sans écrire en base. On cache longuement un succès,
      // brièvement un échec (retry rapide — un null stické 6 h masquerait la photo).
      const url = await fetchPublicUserImage(login);
      teamPhotoCache.set(login, {
        url,
        expiresAt: now + (url ? TEAM_PHOTO_TTL_MS : TEAM_PHOTO_NEG_TTL_MS),
      });
      return [login, url] as const;
    }),
  );
  return c.json({ photos: Object.fromEntries(entries) });
});

// Stats de contributions git (lignes ajout/suppr/net) des membres fondateurs,
// affichées sur leur carte « À propos ». Public (la page équipe est visible
// déconnecté). Live via git en dev, valeurs injectées au build en prod.
app.get('/contributors/stats', async (c) => {
  const stats = await getContributorStats();
  return c.json({ stats });
});

app.get('/users/:login', async (c) => {
  const me = await getCurrentLogin(c);
  const login = c.req.param('login');
  const user = await prisma.user.findUnique({ where: { login } });
  if (!user || user.deletionScheduledAt) {
    // Compte inexistant ou en cours de suppression → traité comme absent.
    throw new HTTPException(404, { message: 'user not found' });
  }
  // Compte banni / anonymisé : masqué comme partout ailleurs (RGPD), SAUF pour un
  // admin (qui peut légitimement consulter la fiche via le panel de modération).
  if ((user.bannedAt || user.anonymizedAt) && !(await isAdminLogin(me))) {
    throw new HTTPException(404, { message: 'user not found' });
  }
  if (!user.imageUrl) {
    // Photo jamais renseignée (compte seedé / jamais connecté) : on rattrape
    // depuis l'intra 42 en tâche de fond — même logique qu'au login. La fiche se
    // répare d'elle-même au prochain affichage (ex. carrousel « About / Team »).
    fetchAndSavePublicUser(login).catch(() => {});
  }
  const [allUsers, played, followingRows, followersRows] = await Promise.all([
    prisma.user.findMany({
      where: VISIBLE_USER_WHERE,
      select: { login: true, elo: true },
      orderBy: { elo: 'desc' },
    }),
    prisma.playedMatch.findMany({
      where: {
        OR: [{ playerALogin: login }, { playerBLogin: login }],
      },
      orderBy: { playedAt: 'desc' },
      take: 50,
    }),
    // Réseau du joueur consulté (comme le bloc « following / followers » du profil perso).
    prisma.follow.findMany({
      where: { followerLogin: login },
      include: { followee: { select: { login: true, imageUrl: true, elo: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.follow.findMany({
      where: { followeeLogin: login },
      include: { follower: { select: { login: true, imageUrl: true, elo: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const rank = allUsers.findIndex((u) => u.login === login) + 1;
  const wins = played.filter((m) => {
    const isA = m.playerALogin === login;
    return (isA && m.winner === 'A') || (!isA && m.winner === 'B');
  }).length;
  const draws = played.filter((m) => m.winner === 'draw').length;
  const losses = played.length - wins - draws;
  const badges = await badgesFor(login, user.role, user.games);
  const customBadges = await customBadgesFor(login);
  // Statut de suivi du visiteur vis-à-vis de ce profil.
  const follow =
    me === login
      ? null
      : await prisma.follow.findUnique({
          where: { followerLogin_followeeLogin: { followerLogin: me, followeeLogin: login } },
        });
  const palmares = await palmaresFor(login);
  const cosmetics = await equippedCosmetics(login);
  return c.json({
    user: toPublicUser(user),
    rank: rank || null,
    wins,
    losses,
    draws,
    recent: played,
    badges,
    customBadges,
    palmares,
    // Solde de League Coins — visible de tous sur la fiche d'un joueur.
    coins: user.leagueCoins ?? 0,
    // Cosmétiques équipés (pour afficher couleur titre / badge / bannière sur la fiche).
    titleColor: cosmetics.titleColor,
    equippedBadge: cosmetics.equippedBadge,
    equippedBanner: cosmetics.equippedBanner,
    followingList: followingRows,
    followersList: followersRows,
    following: !!follow,
    followPrefs: follow
      ? {
          notifyTournament: follow.notifyTournament,
          notifyTop3: follow.notifyTop3,
          notifyTrophy: follow.notifyTrophy,
          notifyOps: follow.notifyOps,
        }
      : null,
  });
});

// Normalise le paramètre de jeu (babyfoot par défaut). Délègue au registry partagé.
const parseGame = parseGameId;

app.get('/leaderboard', async (c) => {
  await getCurrentLogin(c);
  // Classement par jeu : trie sur l'Elo de la discipline et expose ses compteurs
  // sous les mêmes clés (elo / matchesPlayed / tournamentsWon) pour un front unifié.
  const game = parseGame(c.req.query('game'));
  // N'apparaissent au classement d'un mode que les joueurs qui y adhèrent (games)
  // et qui ont disputé au moins un match (évite le vide entre 1001 et 999 ELO).
  const users = await prisma.user.findMany({
    where: { ...VISIBLE_USER_WHERE, games: { has: game }, ...playedFilter(game) },
    orderBy: eloOrderBy(game),
    take: MAX_PUBLIC_LIST,
  });
  // Badges de catalogue par joueur (dont le badge G.O.A.T du #1 de chaque
  // discipline) — calculés en batch pour éviter N requêtes.
  const badgesByLogin = await badgesForUsers(users.map((u) => ({ login: u.login, role: u.role, games: u.games })));
  // Couleur du titre équipé (item boutique) par joueur — batché pour éviter N
  // requêtes. Permet d'afficher le titre dans SA couleur propre (et non la teinte
  // du mode de jeu courant) dans le classement et les survols.
  const titleRows = await prisma.shopInventory.findMany({
    where: { userLogin: { in: users.map((u) => u.login) }, equipped: true, item: { category: 'title' } },
    include: { item: { select: { color: true } } },
  });
  const titleColorByLogin = new Map(titleRows.map((r) => [r.userLogin, r.item.color ?? null]));
  return c.json(
    users.map((u, i) => ({
      rank: i + 1,
      ...toPublicUser(u),
      ...projectStats(u, game),
      badges: badgesByLogin.get(u.login) ?? [],
      titleColor: titleColorByLogin.get(u.login) ?? null,
    })),
  );
});

// ── Helpers équipes Babyfoot 2v2 ──────────────────────────────────────────────
// Inclusions communes pour enrichir une BabyfootTeam : avatars dénormalisés +
// matchs 2v2 validés (bilan wins/losses). Partagé par le classement, la liste
// « mes équipes » et le profil d'un duo.
const TEAM_ENTRY_INCLUDE = {
  player1: { select: { imageUrl: true, campus: true } },
  player2: { select: { imageUrl: true, campus: true } },
  matchesAsTeamA: { where: { mode: '2v2', countedForElo: true }, select: { winner: true } },
  matchesAsTeamB: { where: { mode: '2v2', countedForElo: true }, select: { winner: true } },
} satisfies Prisma.BabyfootTeamInclude;

type TeamWithCounts = Prisma.BabyfootTeamGetPayload<{ include: typeof TEAM_ENTRY_INCLUDE }>;

/** Transforme une BabyfootTeam (avec inclusions) en entrée enrichie, sans rang. */
function enrichTeamEntry(t: TeamWithCounts) {
  const wins =
    t.matchesAsTeamA.filter((m) => m.winner === 'A').length +
    t.matchesAsTeamB.filter((m) => m.winner === 'B').length;
  const total = t.matchesAsTeamA.length + t.matchesAsTeamB.length;
  return {
    id: t.id,
    player1Login: t.player1Login,
    player2Login: t.player2Login,
    elo: t.elo,
    name: t.name,
    createdAt: t.createdAt,
    wins,
    losses: total - wins,
    player1ImageUrl: t.player1.imageUrl,
    player2ImageUrl: t.player2.imageUrl,
    // Campus des deux joueurs : permet au front de cloisonner le classement
    // d'équipes par campus (un duo « de campus » = ses deux joueurs du campus).
    player1Campus: t.player1.campus,
    player2Campus: t.player2.campus,
  };
}

/**
 * Construit la table teamId → rang : duos classés par ELO décroissant, ceux
 * sans aucun match validé exclus (cohérent avec le classement public).
 */
async function loadTeamRankMap(): Promise<Map<string, number>> {
  const all = await prisma.babyfootTeam.findMany({ take: MAX_PUBLIC_LIST, include: TEAM_ENTRY_INCLUDE });
  const ranked = all
    .map(enrichTeamEntry)
    .filter((t) => t.wins + t.losses > 0)
    .sort((a, b) => b.elo - a.elo);
  return new Map(ranked.map((t, i) => [t.id, i + 1]));
}

// ── Classement des équipes Babyfoot 2v2 ───────────────────────────────────────
// Renvoie tous les duos avec leur bilan 2v2 (elo / wins / losses / rang), enrichi
// des avatars des deux joueurs. Alimente le classement équipes + les trophées 2v2.
app.get('/teams/leaderboard', async (c) => {
  await getCurrentLogin(c);
  const teams = await prisma.babyfootTeam.findMany({ take: MAX_PUBLIC_LIST, include: TEAM_ENTRY_INCLUDE });
  const enriched = teams
    .map(enrichTeamEntry)
    // Exclut les duos sans aucun match validé (créés à la déclaration, pas encore
    // joués) — ils ne polluent pas le classement tant qu'ils n'ont rien disputé.
    .filter((t) => t.wins + t.losses > 0);
  enriched.sort((a, b) => b.elo - a.elo);
  return c.json(enriched.map((t, i) => ({ rank: i + 1, ...t })));
});

// ── Mes équipes : tous les duos auxquels appartient un joueur ──────────────────
// Inclut les duos fraîchement créés (0 match) — c'est CE qui permet à la page
// /teams d'afficher une équipe dès qu'un 2v2 est déclaré. Les duos non classés
// (sans match validé) reçoivent un rang fictif les plaçant en fin de liste.
app.get('/teams', async (c) => {
  await getCurrentLogin(c);
  const login = c.req.query('login');
  if (!login) throw new HTTPException(400, { message: 'login query param required' });
  const [mine, rankMap] = await Promise.all([
    prisma.babyfootTeam.findMany({
      where: { OR: [{ player1Login: login }, { player2Login: login }] },
      include: TEAM_ENTRY_INCLUDE,
    }),
    loadTeamRankMap(),
  ]);
  const unrankedRank = rankMap.size + 1;
  const entries = mine
    .map(enrichTeamEntry)
    .map((t) => ({ rank: rankMap.get(t.id) ?? unrankedRank, ...t }))
    .sort((a, b) => a.rank - b.rank);
  return c.json(entries);
});

// ── Profil d'un duo : bilan + historique ELO d'équipe ─────────────────────────
app.get('/teams/:teamId', async (c) => {
  await getCurrentLogin(c);
  const teamId = c.req.param('teamId');
  const team = await prisma.babyfootTeam.findUnique({ where: { id: teamId }, include: TEAM_ENTRY_INCLUDE });
  if (!team) throw new HTTPException(404, { message: 'team not found' });

  const base = enrichTeamEntry(team);
  const rankMap = await loadTeamRankMap();
  const rank = rankMap.get(team.id) ?? rankMap.size + 1;

  // Historique ELO d'équipe : reconstruit à partir des deltas d'équipe persistés.
  // On part de l'ELO courant et on remonte la somme des deltas pour retrouver le
  // point de départ, puis on rejoue en avant. Les matchs antérieurs à la
  // persistance des deltas (team_delta_* NULL) comptent pour 0 — trajectoire
  // intermédiaire dégradée, mais le dernier point égale toujours l'ELO réel.
  const matches = await prisma.playedMatch.findMany({
    where: { mode: '2v2', countedForElo: true, OR: [{ teamAId: team.id }, { teamBId: team.id }] },
    orderBy: { playedAt: 'asc' },
    select: {
      playedAt: true, winner: true, scoreA: true, scoreB: true, teamAId: true,
      playerALogin: true, playerA2Login: true, playerBLogin: true, playerB2Login: true,
      teamDeltaA: true, teamDeltaB: true,
    },
  });
  const totalDelta = matches.reduce(
    (s, m) => s + ((m.teamAId === team.id ? m.teamDeltaA : m.teamDeltaB) ?? 0),
    0,
  );
  let running = base.elo - totalDelta;
  const eloHistory = matches.map((m) => {
    const isA = m.teamAId === team.id;
    const delta = (isA ? m.teamDeltaA : m.teamDeltaB) ?? 0;
    running += delta;
    return {
      elo: running,
      delta,
      playedAt: m.playedAt,
      won: isA ? m.winner === 'A' : m.winner === 'B',
      scoreTeam: isA ? m.scoreA : m.scoreB,
      scoreOpponent: isA ? m.scoreB : m.scoreA,
      opponentPlayer1Login: isA ? m.playerBLogin : m.playerALogin,
      opponentPlayer2Login: (isA ? m.playerB2Login : m.playerA2Login) ?? '',
    };
  });

  return c.json({ rank, ...base, eloHistory });
});

// ── Renommer un duo (réservé aux deux membres) ────────────────────────────────
const TeamNameSchema = z.object({ name: z.string().trim().min(1).max(30) });
app.patch('/teams/:teamId/name', async (c) => {
  const me = await getCurrentLogin(c);
  const teamId = c.req.param('teamId');
  const parsed = TeamNameSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const team = await prisma.babyfootTeam.findUnique({ where: { id: teamId } });
  if (!team) throw new HTTPException(404, { message: 'team not found' });
  if (team.player1Login !== me && team.player2Login !== me) {
    throw new HTTPException(403, { message: 'seuls les membres du duo peuvent le renommer' });
  }
  const updated = await prisma.babyfootTeam.update({
    where: { id: teamId },
    data: { name: parsed.data.name },
    select: { id: true, player1Login: true, player2Login: true, elo: true, name: true, createdAt: true },
  });
  return c.json(updated);
});

// ── Notifications in-app ──────────────────────────────────────────────────
app.get('/notifications', async (c) => {
  const me = await getCurrentLogin(c);
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientLogin: me },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    prisma.notification.count({ where: { recipientLogin: me, read: false } }),
  ]);
  return c.json({ notifications, unread });
});

// Marque comme lues : tout par défaut, ou seulement les `ids` fournis.
app.post('/notifications/read', async (c) => {
  const me = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).filter((x): x is string => typeof x === 'string')
    : null;
  await prisma.notification.updateMany({
    where: { recipientLogin: me, read: false, ...(ids ? { id: { in: ids } } : {}) },
    data: { read: true },
  });
  return c.json({ ok: true });
});

// ── Matchmaking ─────────────────────────────────────────────────────────────
// File d'attente per-login (cf. modèle MatchmakingQueue). /queue/join insère mon
// entrée puis tente d'apparier avec le plus ancien autre joueur de la même
// discipline. L'appariement crée un défi (Challenge) et notifie LES DEUX joueurs.
// Le joueur apparié "à distance" (par le join de l'autre) découvre le match via
// /queue/status (polling).
const MATCH_NOTIF_WINDOW_MS = 90_000;

interface QueueOpponent {
  login: string;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl: string | null;
}

async function fetchQueueOpponent(login: string): Promise<QueueOpponent | null> {
  const u = await prisma.user.findUnique({
    where: { login },
    select: { login: true, imageUrl: true },
  });
  if (!u) return null;
  return { login: u.login, imageUrl: u.imageUrl };
}

app.post('/queue/join', async (c) => {
  const me = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => ({}));
  const game = parseGameId(body?.game);
  await getOrCreateUser(me);
  await assertNotBanned(me);

  // Transaction : (re)pose mon entrée puis cherche le plus ancien autre joueur de
  // la même discipline. Si trouvé, on retire les DEUX entrées atomiquement pour
  // éviter le double-appariement (deux joins concurrents ne peuvent pas saisir le
  // même partenaire — le second ne le retrouvera plus dans la file).
  const paired = await prisma.$transaction(async (tx) => {
    await tx.matchmakingQueue.upsert({
      where: { login_game: { login: me, game } },
      update: { joinedAt: new Date() },
      create: { login: me, game },
    });
    const candidates = await tx.matchmakingQueue.findMany({
      where: { game, login: { not: me } },
      orderBy: { joinedAt: 'asc' },
    });
    for (const cand of candidates) {
      // Exclut les comptes hors-jeu (bannis/désactivés/anonymisés).
      const u = await tx.user.findUnique({
        where: { login: cand.login },
        select: { bannedAt: true, anonymizedAt: true, deletionScheduledAt: true },
      });
      if (!u || u.bannedAt || u.anonymizedAt || u.deletionScheduledAt) {
        await tx.matchmakingQueue
          .delete({ where: { login_game: { login: cand.login, game } } })
          .catch(() => {});
        continue;
      }
      // Appariement : on retire les deux entrées de CE mode uniquement (chacun
      // peut rester en file pour d'autres modes en parallèle).
      await tx.matchmakingQueue.deleteMany({ where: { game, login: { in: [me, cand.login] } } });
      return cand.login as string;
    }
    return null;
  });

  if (!paired) {
    return c.json({ matched: false });
  }

  const opponentLogin = paired;
  // Défi entre les deux joueurs, créé DIRECTEMENT en `accepted` : les deux ont
  // explicitement rejoint la file, donc pas d'étape « accepter/refuser ». Le duel
  // atterrit immédiatement dans la liste « duels à jouer » (scheduledDuels) des
  // DEUX joueurs, prêt à être joué plus tard. Best-effort : un échec ne doit pas
  // empêcher la notification d'appariement.
  await prisma.challenge
    .create({
      data: {
        id: randomUUID(),
        challengerLogin: me,
        opponentLogin,
        status: 'accepted',
        decidedAt: new Date(),
        game,
        scheduledAt: new Date(),
      },
    })
    .catch(() => {});

  // Notifie LES DEUX joueurs. Le `link` porte le login de l'adversaire afin que
  // /queue/status puisse re-récupérer l'avatar côté joueur appariné à distance.
  await notify(opponentLogin, {
    type: 'matchmaking',
    title: 'Adversaire trouvé !',
    body: `@${me} t'affronte en ${game}`,
    link: `/challenges?vs=${encodeURIComponent(me)}&game=${encodeURIComponent(game)}`,
    game,
  });
  await notify(me, {
    type: 'matchmaking',
    title: 'Adversaire trouvé !',
    body: `@${opponentLogin} t'affronte en ${game}`,
    link: `/challenges?vs=${encodeURIComponent(opponentLogin)}&game=${encodeURIComponent(game)}`,
    game,
  });
  emit([me, opponentLogin], { type: 'challenge:received', payload: {} });

  const opponent = await fetchQueueOpponent(opponentLogin);
  return c.json({ matched: true, game, opponent });
});

app.post('/queue/leave', async (c) => {
  const me = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => ({}));
  // game fourni = quitte uniquement cette file ; sinon quitte TOUTES mes files
  // (cleanup au logout / démontage du provider).
  if (body?.game !== undefined && body?.game !== null) {
    const game = parseGameId(body.game);
    await prisma.matchmakingQueue.deleteMany({ where: { login: me, game } });
  } else {
    await prisma.matchmakingQueue.deleteMany({ where: { login: me } });
  }
  return c.json({ ok: true });
});

app.get('/queue/status', async (c) => {
  const me = await getCurrentLogin(c);
  // Files où je suis encore en attente (un mode par entrée).
  const rows = await prisma.matchmakingQueue.findMany({ where: { login: me } });
  const queued = rows.map((r) => parseGameId(r.game));

  // Appariements récents (déclenchés par le join d'un autre joueur, sur un ou
  // plusieurs modes). On lit les notifs 'matchmaking' non lues dans la fenêtre
  // puis on les marque lues → chaque appariement n'est rapporté qu'une fois
  // (l'animation versus ne boucle pas). On dédoublonne par mode (dernier gagne).
  const since = new Date(Date.now() - MATCH_NOTIF_WINDOW_MS);
  const notifs = await prisma.notification.findMany({
    where: { recipientLogin: me, type: 'matchmaking', read: false, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
  });
  const seen = new Set<string>();
  const matches: Array<{ game: ReturnType<typeof parseGameId>; opponent: QueueOpponent | null }> = [];
  for (const notif of notifs) {
    await prisma.notification.update({ where: { id: notif.id }, data: { read: true } });
    const params = new URLSearchParams((notif.link ?? '').split('?')[1] ?? '');
    const vs = params.get('vs');
    const game = parseGameId(params.get('game'));
    if (seen.has(game)) continue;
    seen.add(game);
    const opponent = vs ? await fetchQueueOpponent(vs) : null;
    matches.push({ game, opponent });
  }
  return c.json({ queued, matches });
});

// ── Saisons ───────────────────────────────────────────────────────────────
app.get('/seasons', async (c) => {
  await getCurrentLogin(c);
  return c.json(await prisma.season.findMany({ orderBy: { startedAt: 'desc' } }));
});

app.get('/seasons/current', async (c) => {
  await getCurrentLogin(c);
  return c.json(await prisma.season.findFirst({ where: { isActive: true } }));
});

app.get('/seasons/:id/standings', async (c) => {
  await getCurrentLogin(c);
  const id = c.req.param('id');
  const game = parseGame(c.req.query('game'));
  return c.json(
    await prisma.seasonStanding.findMany({ where: { seasonId: id, game }, orderBy: { rank: 'asc' } }),
  );
});

const CreateSeasonSchema = z.object({ name: z.string().trim().min(2).max(40) });

// Démarre une nouvelle saison. S'il y en a une active, elle est clôturée dans la
// MÊME transaction : snapshot du classement final par discipline, badge champion
// au n°1 de chaque mode, puis reset de TOUS les ELO au PLANCHER du grade courant
// (seasonResetElo — on récompense la progression, on ne repart pas d'un plat 1000 ;
// les Étains sont remontés au plancher Bronze), compteurs de matchs à 0.
// L'historique des matchs est conservé (taggé par
// saison). Passage instantané à la saison suivante.
// Cœur du rollover de saison, réutilisable : appelé soit manuellement (POST
// /seasons), soit automatiquement par le timer de clôture programmée. Clôture la
// saison active (snapshot du classement + badge champion + reset ELO au plancher
// du grade), puis crée la saison `newName`. Les League Coins ne sont JAMAIS
// touchés — ils persistent d'une saison à l'autre. L'historique des matchs/
// tournois est conservé (tournois officiels visibles à vie).
async function performSeasonRollover(newName: string) {
  const result = await prisma.$transaction(async (tx) => {
    const active = await tx.season.findFirst({ where: { isActive: true } });
    let closed: { seasonName: string; champion: string | null; players: number } | null = null;

    if (active) {
      const allUsers = await tx.user.findMany({ where: VISIBLE_USER_WHERE });
      const matches = await tx.playedMatch.findMany({
        where: { seasonId: active.id },
        select: { playerALogin: true, playerBLogin: true, winner: true, game: true },
      });

      // Snapshot par discipline : on fige un classement distinct pour chaque jeu
      // (joueurs inscrits au mode, classés par leur Elo de ce jeu).
      // Map gameId → login du champion (pour badge avec discipline cloisonnée).
      const champions = new Map<string, string>();
      // Map gameId → logins Grand Master (top N + déjà Diamant) : au reset, ils
      // sont ramenés au plancher Diamant et non au plancher de leur ELO brut.
      const gmByGame = new Map<string, Set<string>>();
      let totalPlayers = 0;

      for (const g of GAME_IDS) {
        const users = allUsers
          .filter((u) => (u.games ?? ['babyfoot']).includes(g))
          .sort((a, b) => readElo(b, g) - readElo(a, g));
        if (users.length === 0) continue;
        totalPlayers += users.length;
        const wl = new Map<string, { w: number; l: number }>();
        for (const u of users) wl.set(u.login, { w: 0, l: 0 });
        for (const m of matches) {
          if ((m.game ?? 'babyfoot') !== g) continue;
          for (const login of [m.playerALogin, m.playerBLogin]) {
            const rec = wl.get(login);
            if (!rec) continue;
            const isA = m.playerALogin === login;
            if (m.winner === 'draw') continue; // nulle : ni V ni D au classement de saison
            const won = (isA && m.winner === 'A') || (!isA && m.winner === 'B');
            if (won) rec.w++;
            else rec.l++;
          }
        }
        const gmLogins = new Set<string>();
        let rank = 0;
        for (const u of users) {
          rank++;
          const elo = readElo(u, g);
          if (rankTierForRank(elo, rank).key === 'grandmaster') gmLogins.add(u.login);
          const s = wl.get(u.login) ?? { w: 0, l: 0 };
          await tx.seasonStanding.create({
            data: {
              id: randomUUID(),
              seasonId: active.id,
              game: g,
              login: u.login,
              rank,
              elo,
              wins: s.w,
              losses: s.l,
              campus: u.campus ?? null,
            },
          });
        }
        gmByGame.set(g, gmLogins);
        const champ = users[0]?.login;
        if (champ) champions.set(g, champ);
      }

      // Badge champion pour le n°1 de chaque discipline — cloisonné par jeu.
      for (const [game, champ] of champions) {
        await tx.userBadge.upsert({
          where: { userLogin_code_game: { userLogin: champ, code: 'season_champion', game } },
          update: { seasonId: active.id },
          create: { id: randomUUID(), userLogin: champ, code: 'season_champion', game, seasonId: active.id },
        });
      }

      // Reset de toutes les disciplines pour la prochaine ère.
      // On ne repart pas d'un plat 1000 : chaque ELO est ramené au PLANCHER de son
      // grade courant (seasonResetElo) pour récompenser la progression de la saison.
      // Exception : les Étains (< 1000) sont remontés au plancher Bronze — personne
      // ne reste coincé sous le Bronze d'une saison à l'autre.
      // Cas Grand Master (top N de la discipline) : ramené au plancher Diamant —
      // un GM repart toujours au minimum Diamant la saison suivante.
      // Les compteurs de matchs sont eux remis à zéro.
      const resetEloFor = (game: string, login: string, elo: number) =>
        gmByGame.get(game)?.has(login) ? GRANDMASTER_MIN_ELO : seasonResetElo(elo);
      for (const u of allUsers) {
        await tx.user.update({
          where: { login: u.login },
          data: {
            elo: resetEloFor('babyfoot', u.login, u.elo),
            matchesPlayed: 0,
            eloSmash: resetEloFor('smash', u.login, u.eloSmash),
            matchesPlayedSmash: 0,
            eloChess: resetEloFor('chess', u.login, u.eloChess),
            matchesPlayedChess: 0,
            eloSf: resetEloFor('streetfighter', u.login, u.eloSf),
            matchesPlayedSf: 0,
            eloFlechettes: resetEloFor('flechettes', u.login, u.eloFlechettes),
            matchesPlayedFlechettes: 0,
            // Trophées remis à zéro pour la nouvelle saison : titres de tournois par
            // discipline (compteurs « palmarès »/trophées) + dodges (trophées « hontes »).
            // L'historique des matchs/tournois n'est pas purgé → GOAT et snapshots de
            // saisons passées restent cross-saison.
            tournamentsWon: 0,
            tournamentsWonSmash: 0,
            tournamentsWonChess: 0,
            tournamentsWonSf: 0,
            tournamentsWonFlechettes: 0,
            dodgeCount: 0,
          },
        });
      }
      await tx.season.update({ where: { id: active.id }, data: { isActive: false, endedAt: new Date() } });
      const babyfootChamp =
        [...allUsers].filter((u) => (u.games ?? ['babyfoot']).includes('babyfoot')).sort((a, b) => b.elo - a.elo)[0]?.login ?? null;
      closed = { seasonName: active.name, champion: babyfootChamp, players: totalPlayers };
    }

    const season = await tx.season.create({
      data: { id: randomUUID(), name: newName, isActive: true },
    });
    return { season, closed };
  });

  if (result.closed?.champion) {
    void notify(result.closed.champion, {
      type: 'badge',
      title: '🏆 Champion de saison !',
      body: `Tu remportes ${result.closed.seasonName} — badge débloqué.`,
      link: '/profile',
      game: 'babyfoot',
    });
  }
  broadcast({ type: 'data:update', payload: {} });
  broadcast({ type: 'leaderboard:update', payload: {} });
  return result;
}

app.post('/seasons', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateSeasonSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const result = await performSeasonRollover(parsed.data.name);
  return c.json({ ...result.season, previous: result.closed }, 201);
});

// Programme la clôture automatique de la saison active : à `endAt`, le timer de
// fond bascule sur une nouvelle saison nommée `nextName`. SUPERADMIN only.
const ScheduleSeasonSchema = z.object({
  endAt: z.string().datetime(),
  nextName: z.string().trim().min(2).max(40),
});
app.post('/seasons/schedule', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const body = await c.req.json().catch(() => ({}));
  const parsed = ScheduleSeasonSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const endAt = new Date(parsed.data.endAt);
  if (endAt.getTime() <= Date.now()) {
    throw new HTTPException(400, { message: 'La date de clôture doit être dans le futur.' });
  }
  const active = await prisma.season.findFirst({ where: { isActive: true } });
  if (!active) throw new HTTPException(400, { message: 'Aucune saison active à programmer.' });
  const updated = await prisma.season.update({
    where: { id: active.id },
    data: { scheduledEndAt: endAt, nextSeasonName: parsed.data.nextName },
  });
  broadcast({ type: 'data:update', payload: {} });
  return c.json(updated);
});

// Annule une clôture programmée (chemin statique → pas de collision avec :id).
app.post('/seasons/schedule/cancel', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const active = await prisma.season.findFirst({ where: { isActive: true } });
  if (!active) throw new HTTPException(400, { message: 'Aucune saison active.' });
  const updated = await prisma.season.update({
    where: { id: active.id },
    data: { scheduledEndAt: null, nextSeasonName: null },
  });
  broadcast({ type: 'data:update', payload: {} });
  return c.json(updated);
});

// Réactive / bascule la saison active (outil admin/staging). Simple basculement
// de VUE : on cible cette saison (isActive=true, endedAt=null) et on désactive
// toute autre saison active, dans la même transaction. AUCUN reset d'ELO ni
// snapshot — on ne fait que choisir quelle saison est « la courante ». Admin only.
app.post('/seasons/:id/activate', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const id = c.req.param('id');
  const season = await prisma.$transaction(async (tx) => {
    const target = await tx.season.findUnique({ where: { id } });
    if (!target) throw new HTTPException(404, { message: 'Saison introuvable.' });
    await tx.season.updateMany({ where: { isActive: true, id: { not: id } }, data: { isActive: false } });
    return tx.season.update({ where: { id }, data: { isActive: true, endedAt: null } });
  });
  broadcast({ type: 'data:update', payload: {} });
  broadcast({ type: 'leaderboard:update', payload: {} });
  return c.json(season);
});

// =========================================================================
// SYNC ELO/STATS DEPUIS LA PROD — staging uniquement
// =========================================================================
// Recopie l'état ELO + compteurs de stats de la DB de PROD vers staging, pour
// tester sur des données réalistes (« repartir de l'état actuel de la prod »).
// Garde-fous :
//  - staging UNIQUEMENT (fail-secure sur APP_ENV — jamais exécutable en prod) ;
//  - SUPERADMIN only ;
//  - connexion à la prod en LECTURE SEULE via PROD_READONLY_URL (rôle Postgres
//    SELECT-only) → aucune écriture vers la prod n'est mécaniquement possible.
// Copie l'ELO, les compteurs (matchesPlayed*, dodgeCount, tournamentsWon*) par
// discipline, le solde League Coins ET les tournois en cours/passés (inscrits +
// matchs), puis bascule la saison active de staging sur celle de la prod. Jamais
// les rôles, permissions, flags staging, ni l'historique des matchs 1v1.
// Comptes présents UNIQUEMENT en staging (test1…, tester, jagharra) → intacts.
// Comptes présents en prod mais absents de staging → créés avec une identité
// minimale (rôle USER) pour que le classement staging reflète la prod.
// NB : la prod peut tourner sur un schéma EN RETARD sur develop. On se limite donc
// au dénominateur commun des colonnes réellement présentes en prod aujourd'hui —
// PAS de first_name/last_name ni des colonnes fléchettes (absentes en prod). Sinon
// `findMany` plante (« column users.first_name does not exist »). Les disciplines
// manquantes en prod prennent simplement leur défaut côté staging (Elo 1000).
const PROD_ELO_SELECT = {
  login: true,
  ftId: true,
  campus: true,
  imageUrl: true,
  title: true,
  games: true,
  elo: true,
  matchesPlayed: true,
  dodgeCount: true,
  tournamentsWon: true,
  eloSmash: true,
  matchesPlayedSmash: true,
  tournamentsWonSmash: true,
  eloChess: true,
  matchesPlayedChess: true,
  tournamentsWonChess: true,
  eloSf: true,
  matchesPlayedSf: true,
  tournamentsWonSf: true,
  // Solde League Coins : synchronisé aussi (cf. /admin/seasons/sync-elo-from-prod)
  // pour tester l'économie sur des données réalistes.
  leagueCoins: true,
} satisfies Prisma.UserSelect;

app.post('/admin/seasons/sync-elo-from-prod', async (c) => {
  if (process.env.APP_ENV !== 'staging') {
    throw new HTTPException(403, { message: 'staging only' });
  }
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const prodUrl = process.env.PROD_READONLY_URL;
  if (!prodUrl) {
    throw new HTTPException(503, {
      message: 'PROD_READONLY_URL non configurée sur ce serveur.',
    });
  }

  // Client Prisma dédié pointé sur la prod (datasource « db » surchargée). On
  // s'attend à une URL d'un rôle Postgres SELECT-only — défense en profondeur :
  // même un bug ne peut rien écrire en prod.
  const prod = new PrismaClient({ datasources: { db: { url: prodUrl } } });
  let updated = 0;
  let created = 0;
  let prodCount = 0;
  const skipped: string[] = [];
  let tournamentsSynced = 0;
  const tournamentsSkipped: string[] = [];
  let seasonSwitched: string | null = null;
  try {
    const prodUsers = await prod.user.findMany({
      where: VISIBLE_USER_WHERE,
      select: PROD_ELO_SELECT,
    });
    prodCount = prodUsers.length;
    // Diagnostic : si ce nombre est anormalement bas (ex. 4) alors que la prod est
    // peuplée, c'est que PROD_READONLY_URL pointe vers la mauvaise base/schéma.
    console.log(`[sync-elo-from-prod] ${prodCount} utilisateurs lus depuis la prod`);
    for (const u of prodUsers) {
      // ELO + compteurs + solde League Coins — jamais rôle/permissions.
      const stats = {
        elo: u.elo,
        matchesPlayed: u.matchesPlayed,
        dodgeCount: u.dodgeCount,
        tournamentsWon: u.tournamentsWon,
        eloSmash: u.eloSmash,
        matchesPlayedSmash: u.matchesPlayedSmash,
        tournamentsWonSmash: u.tournamentsWonSmash,
        eloChess: u.eloChess,
        matchesPlayedChess: u.matchesPlayedChess,
        tournamentsWonChess: u.tournamentsWonChess,
        eloSf: u.eloSf,
        matchesPlayedSf: u.matchesPlayedSf,
        tournamentsWonSf: u.tournamentsWonSf,
        // League Coins : recopiés depuis la prod (la prod est la source de vérité).
        leagueCoins: u.leagueCoins,
        // Fléchettes : absentes de la prod (schéma en retard) → non copiées, le
        // staging garde son défaut (Elo 1000) pour cette discipline.
      };
      try {
        const existing = await prisma.user.findUnique({
          where: { login: u.login },
          select: { login: true },
        });
        if (existing) {
          // MAJ : stats + coins recopiés. Identité/rôle préservés.
          await prisma.user.update({ where: { login: u.login }, data: stats });
          updated++;
        } else {
          await prisma.user.create({
            data: {
              login: u.login,
              ftId: u.ftId,
              // firstName/lastName absents en prod → laissés null (le nom pourra
              // être backfillé via l'API 42, cf. backfillMissingProfiles).
              campus: u.campus,
              imageUrl: u.imageUrl,
              title: u.title,
              games: u.games,
              role: 'USER',
              ...stats,
            },
          });
          created++;
        }
      } catch (e) {
        // Collision (ftId déjà pris par un autre login en staging, etc.) → on
        // saute ce joueur sans casser toute la synchro. On LOG l'erreur réelle :
        // sans ça, un échec systématique des create reste invisible.
        console.warn(`[sync-elo-from-prod] skip ${u.login}:`, e instanceof Error ? e.message : e);
        skipped.push(u.login);
      }
    }

    // ── Tournois : recopie les tournois EN COURS et PASSÉS de la prod ──────────
    // (avec inscrits + matchs) pour tester sur l'historique réel. Idempotent :
    // chaque tournoi prod remplace sa copie staging (delete + recreate — les
    // entries/matchs/invites/paris staging liés sautent en cascade, acceptable en
    // env de test). Les tournois créés UNIQUEMENT en staging sont laissés intacts.
    const prodTournaments = await prod.tournament.findMany({
      where: { status: { in: ['in_progress', 'finished'] } },
      select: {
        id: true, name: true, kind: true, isPrivate: true, imageUrl: true,
        capacity: true, mode: true, format: true, game: true, status: true,
        createdByLogin: true, coOrganizers: true, winnerLogin: true,
        createdAt: true, startedAt: true, finishedAt: true, activeMatchId: true,
        prizeKind: true, prizeCoins: true, prizeItemId: true,
        betFinalMult: true, cashPrizeBase: true, leagueQualifyCount: true,
        entries: {
          select: { login: true, partnerLogin: true, teamName: true, joinedAt: true },
        },
        matches: {
          select: {
            id: true, stage: true, poolIndex: true, round: true, slot: true,
            playerALogin: true, playerBLogin: true, scoreA: true, scoreB: true,
            winnerLogin: true, recordedByLogin: true, recordedAt: true,
            confirmedAt: true, betsLockedAt: true, tossWinnerLogin: true,
            tossSide: true, advantagePick: true, tossAt: true,
          },
        },
      },
    });
    console.log(`[sync-elo-from-prod] ${prodTournaments.length} tournois (en cours/terminés) lus depuis la prod`);
    for (const t of prodTournaments) {
      try {
        await prisma.$transaction(async (tx) => {
          // FK users : backfille en minimal les logins référencés mais absents de
          // staging (ex. compte anonymisé en prod, hors du sync utilisateurs).
          const referenced = new Set<string>([t.createdByLogin]);
          if (t.winnerLogin) referenced.add(t.winnerLogin);
          for (const e of t.entries) referenced.add(e.login);
          for (const m of t.matches) {
            if (m.playerALogin) referenced.add(m.playerALogin);
            if (m.playerBLogin) referenced.add(m.playerBLogin);
          }
          for (const login of referenced) {
            await tx.user.upsert({ where: { login }, update: {}, create: { login, role: 'USER' } });
          }
          // Récompense cosmétique : ne garde la référence que si l'objet existe en staging.
          const prizeItemId =
            t.prizeItemId &&
            (await tx.shopItem.findUnique({ where: { id: t.prizeItemId }, select: { id: true } }))
              ? t.prizeItemId
              : null;
          await tx.tournament.deleteMany({ where: { id: t.id } });
          const { entries, matches, ...fields } = t;
          await tx.tournament.create({ data: { ...fields, prizeItemId } });
          if (entries.length > 0) {
            await tx.tournamentEntry.createMany({
              data: entries.map((e) => ({ ...e, tournamentId: t.id })),
            });
          }
          if (matches.length > 0) {
            await tx.tournamentMatch.createMany({
              data: matches.map((m) => ({ ...m, tournamentId: t.id })),
            });
          }
        });
        tournamentsSynced++;
      } catch (e) {
        console.warn(`[sync-elo-from-prod] skip tournoi ${t.id} (${t.name}):`, e instanceof Error ? e.message : e);
        tournamentsSkipped.push(t.name);
      }
    }

    // ── Bascule de saison : staging passe sur la MÊME saison active que la prod ──
    // (ex. la prod est sur « Saison 1 » mais staging encore sur la Beta). On bascule
    // par NOM : on réutilise une saison staging du même nom si elle existe, sinon on
    // la crée. Les coins ne sont jamais reset (cohérent avec le rollover de saison).
    const prodSeason = await prod.season.findFirst({
      where: { isActive: true },
      select: { name: true },
    });
    if (prodSeason) {
      const stagingActive = await prisma.season.findFirst({ where: { isActive: true } });
      if (!stagingActive || stagingActive.name !== prodSeason.name) {
        await prisma.$transaction(async (tx) => {
          await tx.season.updateMany({ where: { isActive: true }, data: { isActive: false } });
          const existing = await tx.season.findFirst({ where: { name: prodSeason.name } });
          if (existing) {
            await tx.season.update({ where: { id: existing.id }, data: { isActive: true, endedAt: null } });
          } else {
            await tx.season.create({ data: { id: randomUUID(), name: prodSeason.name, isActive: true } });
          }
        });
        seasonSwitched = prodSeason.name;
        console.log(`[sync-elo-from-prod] saison staging basculée sur « ${prodSeason.name} »`);
      }
    }
  } finally {
    await prod.$disconnect();
  }

  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'SYNC_ELO_FROM_PROD',
    target: 'prod',
    payload: {
      prodCount, updated, created, skipped: skipped.length,
      tournamentsSynced, tournamentsSkipped: tournamentsSkipped.length, seasonSwitched,
    },
  });
  broadcast({ type: 'data:update', payload: {} });
  broadcast({ type: 'leaderboard:update', payload: {} });
  return c.json({ prodCount, updated, created, skipped, tournamentsSynced, tournamentsSkipped, seasonSwitched });
});

// Supprime une saison : retire le classement figé, les badges champion liés, et
// détague les matchs (seasonId → null, les matchs eux-mêmes sont conservés).
// IRRÉVERSIBLE — ne restaure pas les ELO déjà remis à zéro. Admin only.
app.delete('/seasons/:id', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const id = c.req.param('id');
  await prisma.$transaction(async (tx) => {
    const season = await tx.season.findUnique({ where: { id } });
    if (!season) throw new HTTPException(404, { message: 'Saison introuvable.' });
    // On refuse de supprimer la saison active : sinon plus aucune saison courante.
    if (season.isActive) {
      throw new HTTPException(409, {
        message: 'Impossible de supprimer la saison active : activez d\'abord une autre saison.',
      });
    }
    // Badges champion : la clé est (userLogin, code, game) — le seasonId ne pointe
    // que la DERNIÈRE saison gagnée. Avant de supprimer en masse, on regarde pour
    // chaque badge pointant cette saison si le joueur reste champion (rank 1) d'une
    // AUTRE saison encore existante, via ses snapshots de standings.
    const champBadges = await tx.userBadge.findMany({
      where: { seasonId: id, code: 'season_champion' },
    });
    if (champBadges.length > 0) {
      // Ordre des autres saisons (plus récente d'abord) pour re-pointer le badge
      // vers la dernière saison gagnée encore existante (pas de relation Prisma
      // entre standing et saison → on classe via startedAt côté code).
      const otherSeasons = await tx.season.findMany({
        where: { id: { not: id } },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      });
      const seasonOrder = new Map(otherSeasons.map((s, i) => [s.id, i]));
      for (const badge of champBadges) {
        // Snapshots rank 1 du joueur sur ce jeu, dans une autre saison existante.
        const wins = await tx.seasonStanding.findMany({
          where: { login: badge.userLogin, game: badge.game, rank: 1, seasonId: { not: id } },
          select: { seasonId: true },
        });
        // Ne garder que les saisons toujours existantes, classer par récence.
        const candidates = wins
          .map((w) => w.seasonId)
          .filter((sid) => seasonOrder.has(sid))
          .sort((a, b) => (seasonOrder.get(a)! - seasonOrder.get(b)!));
        if (candidates.length > 0) {
          // Toujours champion ailleurs : on re-pointe vers la saison la plus récente.
          await tx.userBadge.update({ where: { id: badge.id }, data: { seasonId: candidates[0] } });
        } else {
          // Plus champion nulle part : on retire le badge.
          await tx.userBadge.delete({ where: { id: badge.id } });
        }
      }
    }
    await tx.seasonStanding.deleteMany({ where: { seasonId: id } });
    await tx.playedMatch.updateMany({ where: { seasonId: id }, data: { seasonId: null } });
    await tx.season.delete({ where: { id } });
  });
  broadcast({ type: 'data:update', payload: {} });
  broadcast({ type: 'leaderboard:update', payload: {} });
  return c.json({ deleted: true });
});

// ── Followers / Following ─────────────────────────────────────────────────
const FollowPrefsSchema = z.object({
  notifyTournament: z.boolean().optional(),
  notifyTop3: z.boolean().optional(),
  notifyTrophy: z.boolean().optional(),
  notifyOps: z.boolean().optional(),
});

// Liste des joueurs que je suis (avec leurs infos + mes préférences).
app.get('/follows', async (c) => {
  const me = await getCurrentLogin(c);
  const rows = await prisma.follow.findMany({
    where: { followerLogin: me },
    include: { followee: { select: { login: true, imageUrl: true, elo: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(rows);
});

// Abonnés : les joueurs qui ME suivent (pour l'onglet « followers » du profil).
app.get('/followers', async (c) => {
  const me = await getCurrentLogin(c);
  const rows = await prisma.follow.findMany({
    where: { followeeLogin: me },
    include: { follower: { select: { login: true, imageUrl: true, elo: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(rows);
});

app.post('/follows', async (c) => {
  const me = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => ({}));
  const login = typeof body.login === 'string' ? body.login.trim() : '';
  if (!login) throw new HTTPException(400, { message: 'login requis' });
  if (login === me) throw new HTTPException(400, { message: 'tu ne peux pas te suivre toi-même' });
  // Pas de suivi d'un compte hors-jeu (banni / désactivé / anonymisé).
  await assertTargetable(login);
  const row = await prisma.follow.upsert({
    where: { followerLogin_followeeLogin: { followerLogin: me, followeeLogin: login } },
    update: {},
    create: { id: randomUUID(), followerLogin: me, followeeLogin: login },
  });
  return c.json(row, 201);
});

app.delete('/follows/:login', async (c) => {
  const me = await getCurrentLogin(c);
  const login = c.req.param('login');
  await prisma.follow.deleteMany({ where: { followerLogin: me, followeeLogin: login } });
  return c.json({ ok: true });
});

app.patch('/follows/:login', async (c) => {
  const me = await getCurrentLogin(c);
  const login = c.req.param('login');
  const body = await c.req.json().catch(() => ({}));
  const parsed = FollowPrefsSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const row = await prisma.follow
    .update({
      where: { followerLogin_followeeLogin: { followerLogin: me, followeeLogin: login } },
      data: parsed.data,
    })
    .catch(() => {
      throw new HTTPException(404, { message: 'tu ne suis pas ce joueur' });
    });
  return c.json(row);
});

app.get('/matches', async (c) => {
  await getCurrentLogin(c);
  return c.json(
    await prisma.playedMatch.findMany({ orderBy: { playedAt: 'desc' }, take: MAX_PUBLIC_LIST }),
  );
});

app.get('/matches/pending', async (c) => {
  await getCurrentLogin(c);
  return c.json(await prisma.pendingMatch.findMany({ orderBy: { declaredAt: 'desc' } }));
});

app.post('/matches', async (c) => {
  const me = await getCurrentLogin(c);
  // Sanction de litige en cours → déclaration bloquée (cf. applyDisputeMalusTx).
  await assertNotPenalized(me, 'déclarer un match');
  const body = await c.req.json().catch(() => null);
  const parsed = DeclareMatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { opponentLogin, scoreSelf, scoreOpponent, game, bestOf, charSelf, charOpponent, stocks } =
    parsed.data;
  if (opponentLogin === me) {
    throw new HTTPException(400, {
      message: 'cannot declare a match against yourself',
    });
  }
  await assertNotBanned(me);
  await getOrCreateUser(me);
  // Sécurité : l'adversaire doit exister, être un vrai utilisateur 42 et disponible.
  const opponent = await prisma.user.findUnique({ where: { login: opponentLogin } });
  if (!opponent) throw new HTTPException(404, { message: 'opponent must login first before being declared' });
  if (!opponent.ftId) throw new HTTPException(403, { message: 'opponent must be a real 42 user' });
  if (opponent.bannedAt || opponent.anonymizedAt || opponent.deletionScheduledAt) throw new HTTPException(403, { message: "ce joueur n'est plus disponible" });
  const pending = await prisma.pendingMatch.create({
    data: {
      id: randomUUID(),
      declarerLogin: me,
      opponentLogin,
      scoreDeclarer: scoreSelf,
      scoreOpponent,
      game,
      bestOf: bestOf ?? null,
      charDeclarer: charSelf ?? null,
      charOpponent: charOpponent ?? null,
      stocks: stocks ?? null,
    },
  });
  emit([opponentLogin], {
    type: 'match:pending',
    payload: { id: pending.id, declarerLogin: me, scoreDeclarer: scoreSelf, scoreOpponent },
  });
  // Notif cloche pour l'adversaire (en plus du popup + section Défis). Auto-lue
  // dès qu'il valide ou conteste (cf. /matches/:id/confirm & /reject).
  void notify(opponentLogin, {
    type: 'match_pending',
    title: `@${me} a déclaré un score`,
    body: 'Score à valider',
    link: `/challenges?game=${encodeURIComponent(game)}`,
    game,
    refId: pending.id,
  });
  return c.json({ id: pending.id, status: 'pending' }, 201);
});

// ── Déclaration d'un match 2v2 (Babyfoot uniquement) ─────────────────────────
// Le déclarant nomme les 4 joueurs (lui + son coéquipier vs 2 adversaires). Un
// PendingMatch `mode:'2v2'` est créé ; il est validé par l'un des 2 adversaires
// (cf. /matches/:id/confirm) puis réglé par settle2v2PendingAsPlayed.
app.post('/matches/2v2', async (c) => {
  const me = await getCurrentLogin(c);
  await assertNotPenalized(me, 'déclarer un match');
  const body = await c.req.json().catch(() => null);
  const parsed = Declare2v2MatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { partnerLogin, opponentLogin, opponent2Login, scoreSelf, scoreOpponent } = parsed.data;
  if ([partnerLogin, opponentLogin, opponent2Login].includes(me)) {
    throw new HTTPException(400, { message: 'cannot declare a 2v2 match involving yourself twice' });
  }
  await assertNotBanned(me);
  await getOrCreateUser(me);
  // Les 3 autres joueurs doivent être de vrais utilisateurs 42 disponibles.
  for (const login of [partnerLogin, opponentLogin, opponent2Login]) {
    const u = await prisma.user.findUnique({ where: { login } });
    if (!u) throw new HTTPException(404, { message: `${login} must login first before being declared` });
    if (!u.ftId) throw new HTTPException(403, { message: `${login} must be a real 42 user` });
    if (u.bannedAt || u.anonymizedAt || u.deletionScheduledAt)
      throw new HTTPException(403, { message: `${login} n'est plus disponible` });
  }

  const pending = await prisma.pendingMatch.create({
    data: {
      id: randomUUID(),
      declarerLogin: me,
      opponentLogin,
      scoreDeclarer: scoreSelf,
      scoreOpponent,
      game: 'babyfoot',
      mode: '2v2',
      partner1Login: partnerLogin,
      partner2Login: opponent2Login,
      // Confirmations progressives : les 3 non-déclarants partent à false.
      partner1Confirmed: false,
      opp1Confirmed: false,
      opp2Confirmed: false,
    },
  });

  // Tous les autres participants sont notifiés (le score à valider apparaît dans Défis).
  emit([partnerLogin, opponentLogin, opponent2Login], {
    type: 'match:pending',
    payload: { id: pending.id, mode: '2v2', declarerLogin: me },
  });
  // Notif cloche pour les 3 non-déclarants (auto-lue dès confirmation/contestation).
  void notifyMany([partnerLogin, opponentLogin, opponent2Login], {
    type: 'match_pending',
    title: `@${me} a déclaré un match 2v2`,
    body: 'Score à valider',
    link: '/challenges?game=babyfoot',
    game: 'babyfoot',
    refId: pending.id,
  });

  // Équipe du déclarant : matérialisée DÈS la déclaration — le duo existe
  // immédiatement (page d'équipe nommable tout de suite, célébration « nouveau
  // duo » fiable). Le duo adverse, lui, n'est créé qu'à la validation (settle).
  // L'ELO et les stats d'équipe ne comptent que les matchs VALIDÉS : une équipe
  // fraîchement créée reste hors classement tant qu'elle n'a pas joué (cf. le
  // filtre sur /teams/leaderboard).
  const [tp1, tp2] = canonicalTeamLogins(me, partnerLogin);
  const existingTeam = await prisma.babyfootTeam.findUnique({
    where: { player1Login_player2Login: { player1Login: tp1, player2Login: tp2 } },
    select: { id: true, elo: true },
  });
  let myTeam = existingTeam;
  if (!myTeam) {
    const [meUser, partnerUser] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { login: me } }),
      prisma.user.findUniqueOrThrow({ where: { login: partnerLogin } }),
    ]);
    myTeam = await upsertBabyfootTeam(
      prisma,
      me,
      readElo(meUser, 'babyfoot'),
      partnerLogin,
      readElo(partnerUser, 'babyfoot'),
    );
  }
  return c.json(
    {
      id: pending.id,
      status: 'pending',
      myTeamId: myTeam.id,
      myTeamIsNew: !existingTeam,
      myTeamElo: myTeam.elo,
    },
    201,
  );
});

// Applique un match en attente comme match joué (calcul ELO + anti-farming +
// création du PlayedMatch + suppression du pending). Partagé entre la confirmation
// normale (par l'adversaire) et la force-validation SUPERADMIN.
type PendingForSettle = {
  id: string;
  declarerLogin: string;
  opponentLogin: string;
  scoreDeclarer: number;
  scoreOpponent: number;
  declaredAt: Date;
  game?: string;
  bestOf?: number | null;
  charDeclarer?: string | null;
  charOpponent?: string | null;
  stocks?: number | null;
  // 2v2 Babyfoot — présents uniquement quand mode = '2v2'.
  mode?: string | null;
  partner1Login?: string | null;
  partner2Login?: string | null;
};

// Règlement d'un match 2v2 Babyfoot : crée/maj les BabyfootTeam, applique l'ELO
// (équipe + individuel via babyfoot2v2), supprime le pending et crée le PlayedMatch
// avec les colonnes 2v2. Anti-farming basé sur la paire de teams (indépendant de l'ordre).
async function settle2v2PendingAsPlayed(tx: Prisma.TransactionClient, p: PendingForSettle) {
  const partner1 = p.partner1Login as string; // coéquipier du déclarant
  const partner2 = p.partner2Login as string; // coéquipier de l'adversaire
  // Côté A = équipe du déclarant ; côté B = équipe adverse. On canonicalise chaque duo.
  const [a1, a2] = canonicalTeamLogins(p.declarerLogin, partner1);
  const [b1, b2] = canonicalTeamLogins(p.opponentLogin, partner2);

  const [uA1, uA2, uB1, uB2] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { login: a1 } }),
    tx.user.findUniqueOrThrow({ where: { login: a2 } }),
    tx.user.findUniqueOrThrow({ where: { login: b1 } }),
    tx.user.findUniqueOrThrow({ where: { login: b2 } }),
  ]);
  // L'init d'une entité BabyfootTeam (Calcul A) se fait sur l'ELO 1v1 babyfoot
  // (échelle de référence du duo), mais le rating PERSONNEL 2v2 (Calcul B) évolue
  // sur sa propre colonne `eloBabyfoot2v2`.
  const eA1 = readElo(uA1, 'babyfoot');
  const eA2 = readElo(uA2, 'babyfoot');
  const eB1 = readElo(uB1, 'babyfoot');
  const eB2 = readElo(uB2, 'babyfoot');

  const teamA = await upsertBabyfootTeam(tx, a1, eA1, a2, eA2);
  const teamB = await upsertBabyfootTeam(tx, b1, eB1, b2, eB2);

  const sideA: Side2v2 = { p1Login: a1, p2Login: a2, teamId: teamA.id, teamElo: teamA.elo, p1Elo: uA1.eloBabyfoot2v2, p2Elo: uA2.eloBabyfoot2v2 };
  const sideB: Side2v2 = { p1Login: b1, p2Login: b2, teamId: teamB.id, teamElo: teamB.elo, p1Elo: uB1.eloBabyfoot2v2, p2Elo: uB2.eloBabyfoot2v2 };

  // scoreA/scoreB orientés côté déclarant (équipe A).
  const scoreA = p.scoreDeclarer;
  const scoreB = p.scoreOpponent;
  const winner: 'A' | 'B' = scoreA > scoreB ? 'A' : 'B';

  // Anti-farming par paire de teams (les 2 sens), indépendant du jeu (toujours babyfoot).
  const priors = await tx.playedMatch.findMany({
    where: {
      mode: '2v2',
      OR: [
        { teamAId: teamA.id, teamBId: teamB.id },
        { teamAId: teamB.id, teamBId: teamA.id },
      ],
    },
    select: { playedAt: true, countedForElo: true },
  });
  const countsForElo = shouldCountForElo(priors, p.declaredAt);
  // Dégressivité anti-farming (même duo, même jour) appliquée aux coins/quêtes.
  const decayFactor = farmingDecayFactor(sameDayPriorCount(priors, p.declaredAt));

  let dA1 = 0, dA2 = 0, dB1 = 0, dB2 = 0;
  // Deltas des entités BabyfootTeam (Calcul A) — persistés pour l'historique du duo.
  let tdA = 0, tdB = 0;
  if (countsForElo) {
    const r = await applyElo2v2(tx, { winner, scoreA, scoreB, sideA, sideB });
    dA1 = r.individual.deltaA1;
    dA2 = r.individual.deltaA2;
    dB1 = r.individual.deltaB1;
    dB2 = r.individual.deltaB2;
    tdA = r.team.deltaA;
    tdB = r.team.deltaB;
  }

  await tx.pendingMatch.delete({ where: { id: p.id } });
  const activeSeason = await tx.season.findFirst({ where: { isActive: true }, select: { id: true } });

  const created = await tx.playedMatch.create({
    data: {
      id: p.id,
      playerALogin: a1,
      playerBLogin: b1,
      playerA2Login: a2,
      playerB2Login: b2,
      scoreA,
      scoreB,
      winner,
      playedAt: p.declaredAt,
      countedForElo: countsForElo,
      deltaA: dA1,
      deltaB: dB1,
      deltaA2: dA2,
      deltaB2: dB2,
      teamDeltaA: tdA,
      teamDeltaB: tdB,
      teamAId: teamA.id,
      teamBId: teamB.id,
      seasonId: activeSeason?.id ?? null,
      game: 'babyfoot',
      mode: '2v2',
    },
  });
  // Coins + quêtes pour les 4 joueurs — uniquement si le match compte (classé).
  if (countsForElo) {
    await awardMatchEconomyTx(
      tx,
      'babyfoot',
      [
        { login: a1, won: winner === 'A' },
        { login: a2, won: winner === 'A' },
        { login: b1, won: winner === 'B' },
        { login: b2, won: winner === 'B' },
      ],
      p.declaredAt,
      { coinFactor: decayFactor, countForQuests: decayFactor >= 1 },
    );
    // XP + paliers du passe (2v2 : pas d'écart pairwise, gagnants 100 / autres 50).
    await awardMatchExperienceTx(
      tx,
      'babyfoot',
      [
        { login: a1, won: winner === 'A' },
        { login: a2, won: winner === 'A' },
        { login: b1, won: winner === 'B' },
        { login: b2, won: winner === 'B' },
      ],
      p.declaredAt,
      { decayFactor },
    );
  }
  return created;
}

async function settlePendingAsPlayed(tx: Prisma.TransactionClient, p: PendingForSettle) {
  // 2v2 Babyfoot : chemin de règlement dédié (teams + ELO 2v2).
  if (p.mode === '2v2' && p.partner1Login && p.partner2Login) {
    return settle2v2PendingAsPlayed(tx, p);
  }
  const [a, b] = pairKey(p.declarerLogin, p.opponentLogin);
  const declarerIsA = p.declarerLogin === a;
  const scoreA = declarerIsA ? p.scoreDeclarer : p.scoreOpponent;
  const scoreB = declarerIsA ? p.scoreOpponent : p.scoreDeclarer;
  const game = parseGameId(p.game);
  // Égalité (échecs : 0-0) → 'draw' ; sinon le plus haut score gagne.
  const winner: 'A' | 'B' | 'draw' =
    scoreA === scoreB && getGameDef(game).hasDraw ? 'draw' : scoreA > scoreB ? 'A' : 'B';
  // Smash uniquement : les « stocks » (vies) sont spécifiques au Smash. Street
  // Fighter partage la mécanique de set mais n'a pas de stocks.
  const isSmash = game === 'smash';

  // Champs Smash mappés sur les côtés A/B.
  const charA = declarerIsA ? p.charDeclarer ?? null : p.charOpponent ?? null;
  const charB = declarerIsA ? p.charOpponent ?? null : p.charDeclarer ?? null;
  const winnerStocks = p.stocks ?? 1;
  const stocksA = isSmash ? (winner === 'A' ? winnerStocks : 0) : null;
  const stocksB = isSmash ? (winner === 'B' ? winnerStocks : 0) : null;

  // Anti-farming par paire ET par jeu (cooldown indépendant par discipline).
  const priors = await tx.playedMatch.findMany({
    where: { playerALogin: a, playerBLogin: b, game },
    select: { playedAt: true, countedForElo: true },
  });
  const countsForElo = shouldCountForElo(priors, p.declaredAt);
  // Dégressivité anti-farming du jour (même paire) — appliquée à l'ELO ET aux
  // coins/quêtes (cf. awardMatchEconomyTx), pour neutraliser le farming de coins
  // par rematch collusoire en boucle.
  const decayFactor = farmingDecayFactor(sameDayPriorCount(priors, p.declaredAt));

  const [userA, userB] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { login: a } }),
    tx.user.findUniqueOrThrow({ where: { login: b } }),
  ]);

  // Rating courant de la discipline (mapping des colonnes : cf. games.ts).
  const ratingA = readElo(userA, game);
  const ratingB = readElo(userB, game);

  let deltaA = 0;
  let deltaB = 0;
  if (countsForElo) {
    const update = applyGameElo(game, ratingA, ratingB, winner, {
      scoreA,
      scoreB,
      bestOf: p.bestOf,
      winnerStocks,
    });
    // Dégressivité anti-farming : chaque rematch du jour contre le même adversaire
    // vaut 1/4 de moins (×0.75ⁿ). S'applique au match entier — gain ET perte.
    deltaA = applyFarmingDecay(update.deltaA, decayFactor);
    deltaB = applyFarmingDecay(update.deltaB, decayFactor);
    // Consommable « multiplicateur d'ELO » : double le delta final (gain ET perte)
    // du joueur qui l'avait armé, puis désarme. Une seule conso par joueur réglé.
    deltaA = await applyEloMultTx(tx, a, deltaA);
    deltaB = await applyEloMultTx(tx, b, deltaB);
    await tx.user.update({ where: { login: a }, data: ratingUpdate(game, ratingA + deltaA) });
    await tx.user.update({ where: { login: b }, data: ratingUpdate(game, ratingB + deltaB) });
  }

  await tx.pendingMatch.delete({ where: { id: p.id } });

  const activeSeason = await tx.season.findFirst({ where: { isActive: true }, select: { id: true } });

  const created = await tx.playedMatch.create({
    data: {
      id: p.id,
      playerALogin: a,
      playerBLogin: b,
      scoreA,
      scoreB,
      winner,
      playedAt: p.declaredAt,
      countedForElo: countsForElo,
      deltaA,
      deltaB,
      seasonId: activeSeason?.id ?? null,
      game,
      bestOf: isSmash ? p.bestOf ?? null : null,
      charA,
      charB,
      stocksA,
      stocksB,
    },
  });
  // Gains de coins + progression des quêtes — seulement si le match est CLASSÉ
  // (pas de coins sur un rematch non-compté / dodge / match forcé). Une nulle
  // (échecs) ne crédite la victoire d'aucun des deux camps.
  if (countsForElo) {
    await awardMatchEconomyTx(
      tx,
      game,
      [
        { login: a, won: winner === 'A' },
        { login: b, won: winner === 'B' },
      ],
      p.declaredAt,
      // Coins dégressés comme l'ELO ; quêtes non créditées sur un rematch dégressé.
      { coinFactor: decayFactor, countForQuests: decayFactor >= 1 },
    );
    // XP + paliers du passe — 1v1 : on passe l'écart de score (bonus dédié).
    await awardMatchExperienceTx(
      tx,
      game,
      [
        { login: a, won: winner === 'A', scoreGap: Math.abs(scoreA - scoreB) },
        { login: b, won: winner === 'B', scoreGap: Math.abs(scoreA - scoreB) },
      ],
      p.declaredAt,
      { decayFactor, isDraw: winner === 'draw' },
    );
  }
  return created;
}

app.post('/matches/:id/confirm', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');

  // ─── Branche 2v2 : confirmation de présence (pas de re-saisie de score) ──────
  //
  // Anti-farming : les 3 non-déclarants (partner1, opp1, opp2) confirment
  // CHACUN indépendamment. Le settlement n'est déclenché que lorsque les 3
  // ont confirmé — empêche 3 joueurs de valider le match d'un 4e absent.
  {
    const modeRow = await prisma.pendingMatch.findUnique({
      where: { id },
      select: { mode: true },
    });
    if (modeRow?.mode === '2v2') {
      const r2v2 = await prisma.$transaction(async (tx) => {
        const p = await tx.pendingMatch.findUnique({ where: { id } });
        if (!p) throw new HTTPException(404, { message: 'pending match not found' });

        const isPartner1 = me === p.partner1Login;
        const isOpp1    = me === p.opponentLogin;
        const isOpp2    = me === p.partner2Login;
        if (!isPartner1 && !isOpp1 && !isOpp2) {
          throw new HTTPException(403, { message: 'you are not a participant of this 2v2 match' });
        }

        const updateData: Prisma.PendingMatchUpdateInput = {};
        if (isPartner1) updateData.partner1Confirmed = true;
        if (isOpp1)     updateData.opp1Confirmed     = true;
        if (isOpp2)     updateData.opp2Confirmed     = true;

        const updated = await tx.pendingMatch.update({ where: { id }, data: updateData });

        const allConfirmed =
          updated.partner1Confirmed === true &&
          updated.opp1Confirmed     === true &&
          updated.opp2Confirmed     === true;

        if (!allConfirmed) {
          const confirmed = [
            updated.partner1Confirmed,
            updated.opp1Confirmed,
            updated.opp2Confirmed,
          ].filter(Boolean).length;
          // Notifie les 4 participants de la progression en temps réel.
          emit(
            [p.declarerLogin, p.partner1Login, p.opponentLogin, p.partner2Login].filter(
              Boolean,
            ) as string[],
            { type: 'match:2v2_progress', payload: { id, confirmed, total: 3 } },
          );
          return { waiting: true as const, confirmed };
        }

        // Tous confirmés → settlement ELO.
        const created = await settlePendingAsPlayed(tx, p);
        return { waiting: false as const, match: created };
      });

      if (r2v2.waiting) {
        return c.json({ status: 'waiting', confirmed: r2v2.confirmed, total: 3 }, 202);
      }

      const m2v2 = r2v2.match;
      const rcp = [m2v2.playerALogin, m2v2.playerBLogin, m2v2.playerA2Login, m2v2.playerB2Login]
        .filter(Boolean) as string[];
      emit(rcp, { type: 'match:confirmed', payload: m2v2 });
      // Le « score à valider » est traité → on solde les notifs cloche associées
      // et on pousse le résultat dans la cloche des 4 joueurs.
      void markNotifsReadByRef(rcp, id);
      void notifyMatchResult(m2v2);
      broadcast({ type: 'leaderboard:update', payload: {} });
      return c.json(m2v2);
    }
  }

  // ─── Branche 1v1 : validation bilatérale par re-saisie du score ──────────────
  const body = await c.req.json().catch(() => ({}));
  const parsed = ConfirmMatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { scoreSelf: confirmedSelf, scoreOpponent: confirmedOpponent } = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    const p = await tx.pendingMatch.findUnique({ where: { id } });
    if (!p) {
      throw new HTTPException(404, { message: 'pending match not found' });
    }
    if (me !== p.opponentLogin) {
      throw new HTTPException(403, {
        message: 'only the opponent can confirm this match',
      });
    }

    if (
      confirmedSelf !== p.scoreOpponent ||
      confirmedOpponent !== p.scoreDeclarer
    ) {
      // Validation bilatérale échouée → les deux doivent recommencer : on
      // supprime le pending. ⚠️ Ne PAS `throw` ici : une exception ferait
      // rollback de la transaction et annulerait ce delete. On renvoie un
      // marqueur et on lève le 409 APRÈS le commit de la transaction.
      await tx.pendingMatch.delete({ where: { id } });
      return {
        mismatch: true as const,
        message: `Scores différents — ${p.declarerLogin} a déclaré ${p.scoreDeclarer}-${p.scoreOpponent}, tu as soumis ${confirmedOpponent}-${confirmedSelf}. Match annulé, à redéclarer.`,
      };
    }

    const created = await settlePendingAsPlayed(tx, p);

    // OPS = mécanique strictement 1v1 → ignorée pour les matchs 2v2.
    const opsBetween =
      created.mode === '2v2'
        ? null
        : await tx.ops.findFirst({
            where: {
              expiresAt: { gt: new Date() },
              forcedUsed: { lt: OPS_FORCED_MATCHES },
              OR: [
                { ownerLogin: created.playerALogin, targetLogin: created.playerBLogin },
                { ownerLogin: created.playerBLogin, targetLogin: created.playerALogin },
              ],
            },
          });
    if (opsBetween) {
      // 3ᵉ défi consommé → l'ops se termine (endedAt) : cible libérée, traqueur
      // plus en ops, cooldown 3j ancré sur maintenant.
      const willEnd = opsBetween.forcedUsed + 1 >= OPS_FORCED_MATCHES;
      await tx.ops.update({
        where: { id: opsBetween.id },
        data: { forcedUsed: { increment: 1 }, ...(willEnd ? { endedAt: new Date() } : {}) },
      });
    }
    // Paris sur CE duel d'ops (s'il en est un) : réglés ici, au confirm du match,
    // par le vainqueur du match. Nul (rare) → remboursement.
    let opsDuelCredited: string[] = [];
    if (p.challengeId) {
      const winnerLogin =
        created.winner === 'A'
          ? created.playerALogin
          : created.winner === 'B'
            ? created.playerBLogin
            : null;
      opsDuelCredited = winnerLogin
        ? await settleBetsTx(tx, { targetType: 'ops', challengeId: p.challengeId }, winnerLogin)
        : await refundBetsTx(tx, { targetType: 'ops', challengeId: p.challengeId });
    }
    return { mismatch: false as const, match: created, opsTouched: !!opsBetween, opsDuelCredited };
  });

  // Le 409 est levé hors transaction : le delete du pending est ainsi committé.
  if (result.mismatch) {
    throw new HTTPException(409, { message: result.message });
  }
  const match = result.match;

  // Destinataires temps réel : 2 joueurs en 1v1, 4 en 2v2 (avec les coéquipiers).
  const matchRecipients =
    match.mode === '2v2'
      ? ([match.playerALogin, match.playerBLogin, match.playerA2Login, match.playerB2Login].filter(
          Boolean,
        ) as string[])
      : [match.playerALogin, match.playerBLogin];

  // Résultat poussé en temps réel (section Défis + bannière) via cet event.
  emit(matchRecipients, { type: 'match:confirmed', payload: match });
  // Mon « score à valider » est traité → notif cloche soldée, puis résultat poussé
  // dans la cloche des deux joueurs.
  void markNotifsReadByRef(me, id);
  void notifyMatchResult(match);
  // L'ELO des deux joueurs a changé → le classement bouge pour tout le monde.
  broadcast({ type: 'leaderboard:update', payload: {} });
  // Paris du duel d'ops crédités → les gagnants voient leur solde bouger.
  if (result.opsDuelCredited.length) {
    emit([...new Set(result.opsDuelCredited)], { type: 'panel:update', payload: {} });
  }
  // Abonnés notifiés si un joueur entre dans le top 3.
  void maybeNotifyTop3(match.playerALogin, match.deltaA);
  void maybeNotifyTop3(match.playerBLogin, match.deltaB);
  if (result.opsTouched) {
    emit([match.playerALogin, match.playerBLogin], {
      type: 'ops:update',
      payload: { reason: 'forced_played' },
    });
    // Le perdant d'un match OPS forcé → ses abonnés sont prévenus. Pas de perdant si nulle.
    if (match.winner !== 'draw') {
      const loser = match.winner === 'A' ? match.playerBLogin : match.playerALogin;
      void notifyFollowers(loser, 'notifyOps', {
        type: 'follow_ops',
        title: `@${loser} a perdu un match OPS`,
        link: `/player/${encodeURIComponent(loser)}`,
      });
    }
  }
  return c.json(match);
});

app.post('/matches/:id/reject', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = RejectMatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }

  const { contestReason, contestMessage } = parsed.data;

  let rejectRecipients: string[] = [];
  let rejectGame = 'babyfoot';
  await prisma.$transaction(async (tx) => {
    const p = await tx.pendingMatch.findUnique({ where: { id } });
    if (!p) {
      throw new HTTPException(404, { message: 'pending match not found' });
    }
    // 1v1 : seul l'adversaire rejette. 2v2 : l'équipe adverse (opponent ou son coéquipier).
    const canReject =
      p.mode === '2v2' ? me === p.opponentLogin || me === p.partner2Login : me === p.opponentLogin;
    if (!canReject) {
      throw new HTTPException(403, {
        message: 'only the opponent can reject this match',
      });
    }
    rejectGame = p.game;
    // Le déclarant + son coéquipier (en 2v2) sont prévenus de la contestation.
    rejectRecipients = [p.declarerLogin, p.partner1Login].filter(Boolean) as string[];
    await tx.rejectedMatch.create({
      data: {
        id: randomUUID(),
        declarerLogin: p.declarerLogin,
        opponentLogin: me,
        scoreDeclarer: p.scoreDeclarer,
        scoreOpponent: p.scoreOpponent,
        contestReason,
        contestMessage,
        game: p.game,
        // Litige ouvert : part en file d'arbitrage (admin/orga tranche → malus).
        status: 'open',
      },
    });
    await tx.pendingMatch.delete({ where: { id } });
  });

  if (rejectRecipients.length > 0) {
    // Contestation poussée en temps réel via l'event `match:rejected`
    // (section Défis + bannière) + notif cloche pour le(s) déclarant(s).
    emit(rejectRecipients, { type: 'match:rejected', payload: { id, contestReason, rejectedBy: me } });
    void notifyMany(rejectRecipients, {
      type: 'match_rejected',
      title: `@${me} a contesté ton score`,
      body: contestReason === 'never_played' ? 'Match jamais joué' : 'Score incorrect',
      link: `/challenges?game=${encodeURIComponent(rejectGame)}`,
      game: rejectGame,
      refId: id,
    });
  }
  // Mon « score à valider » est traité (rejeté) → notif cloche soldée.
  void markNotifsReadByRef(me, id);
  // Litige ouvert → alerte Discord pour l'arbitrage (sans donnée personnelle).
  void notifyDiscordDispute({ game: rejectGame, kind: 'pending', reason: contestReason }).catch(
    (err) => console.error('[dispute] discord notify failed', err),
  );
  return c.json({ id, status: 'rejected', contestReason });
});

// Annulation par le déclarant lui-même.
app.post('/matches/:id/cancel', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');

  let opponentLogin: string | undefined;
  await prisma.$transaction(async (tx) => {
    const p = await tx.pendingMatch.findUnique({ where: { id } });
    if (!p) {
      throw new HTTPException(404, { message: 'pending match not found' });
    }
    if (p.declarerLogin !== me) {
      throw new HTTPException(403, {
        message: 'only the declarer can cancel this match',
      });
    }
    opponentLogin = p.opponentLogin;
    await tx.pendingMatch.delete({ where: { id } });
  });

  if (opponentLogin) {
    emit([opponentLogin], { type: 'match:cancelled', payload: { id, cancelledBy: me } });
  }
  return c.json({ id, status: 'cancelled' });
});

// ── Contestation a posteriori d'un match AUTO-VALIDÉ ─────────────────────────
// Un match déclaré confirmé automatiquement après 48h (l'adversaire absent n'a pas
// répondu) reste contestable tant qu'aucun litige n'a été ouvert. La contestation
// ouvre simplement un litige (RejectedMatch 'open') rattaché au match compté, qui
// part en file d'arbitrage (/GOD) : le résultat reste acquis tant qu'un admin n'a
// pas tranché (pas d'annulation automatique de l'ELO). Seul le camp ADVERSE du
// déclarant peut contester (le déclarant ne conteste pas son propre score).

// Logins de l'ÉQUIPE du déclarant d'un match auto-validé (le déclarant seul en 1v1,
// son duo en 2v2). Sert à n'autoriser la contestation qu'au camp adverse.
type AutoConfirmedMatch = {
  mode: string | null;
  playerALogin: string;
  playerBLogin: string;
  playerA2Login: string | null;
  playerB2Login: string | null;
  autoConfirmDeclarerLogin: string | null;
};
function declarerSideLogins(m: AutoConfirmedMatch): string[] {
  const decl = m.autoConfirmDeclarerLogin;
  if (!decl) return [];
  if (m.mode === '2v2') {
    return decl === m.playerALogin || decl === m.playerA2Login
      ? [m.playerALogin, m.playerA2Login].filter(Boolean) as string[]
      : [m.playerBLogin, m.playerB2Login].filter(Boolean) as string[];
  }
  return [decl];
}
function isContestableBy(m: AutoConfirmedMatch, me: string): boolean {
  const participants = [m.playerALogin, m.playerBLogin, m.playerA2Login, m.playerB2Login].filter(
    Boolean,
  ) as string[];
  return participants.includes(me) && !declarerSideLogins(m).includes(me);
}

// Liste des matchs auto-validés que JE peux encore contester (camp adverse, pas
// encore contestés). Alimente le bouton « Contester » côté front.
app.get('/matches/contestable', async (c) => {
  const me = await getCurrentLogin(c);
  const rows = await prisma.playedMatch.findMany({
    where: {
      autoConfirmedAt: { not: null },
      contestedAt: null,
      OR: [{ playerALogin: me }, { playerBLogin: me }, { playerA2Login: me }, { playerB2Login: me }],
    },
    orderBy: { playedAt: 'desc' },
    take: 100,
  });
  return c.json(rows.filter((m) => isContestableBy(m, me)));
});

app.post('/matches/played/:id/contest', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = RejectMatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { contestReason, contestMessage } = parsed.data;

  let info: { declarerLogin: string; game: string } | undefined;
  await prisma.$transaction(async (tx) => {
    const m = await tx.playedMatch.findUnique({ where: { id } });
    if (!m) throw new HTTPException(404, { message: 'match introuvable' });
    if (!m.autoConfirmedAt) {
      throw new HTTPException(409, { message: 'seul un match auto-validé est contestable a posteriori' });
    }
    if (m.contestedAt) throw new HTTPException(409, { message: 'match déjà contesté' });
    if (!isContestableBy(m, me)) {
      throw new HTTPException(403, { message: 'seul le camp adverse du déclarant peut contester ce match' });
    }
    const decl = m.autoConfirmDeclarerLogin!;
    // Reconstruit la perspective déclarant/adversaire : les côtés A/B suivent l'ordre
    // canonique, pas l'ordre déclarant/adversaire.
    const declSideIsA = decl === m.playerALogin || decl === m.playerA2Login;
    const scoreDeclarer = declSideIsA ? m.scoreA : m.scoreB;
    const scoreOpponent = declSideIsA ? m.scoreB : m.scoreA;
    await tx.rejectedMatch.create({
      data: {
        id: randomUUID(),
        declarerLogin: decl,
        opponentLogin: me,
        scoreDeclarer,
        scoreOpponent,
        contestReason,
        contestMessage,
        game: m.game,
        playedMatchId: m.id,
        status: 'open',
      },
    });
    await tx.playedMatch.update({ where: { id }, data: { contestedAt: new Date() } });
    info = { declarerLogin: decl, game: m.game };
  });

  if (info) {
    emit([info.declarerLogin], { type: 'match:rejected', payload: { id, contestReason, rejectedBy: me } });
    void notify(info.declarerLogin, {
      type: 'match_rejected',
      title: `@${me} a contesté ton match auto-validé`,
      body: contestReason === 'never_played' ? 'Match jamais joué' : 'Score incorrect',
      link: `/challenges?game=${encodeURIComponent(info.game)}`,
      game: info.game,
      refId: id,
    });
    // Litige ouvert → alerte Discord pour l'arbitrage (sans donnée personnelle).
    void notifyDiscordDispute({ game: info.game, kind: 'auto_validated', reason: contestReason }).catch(
      (err) => console.error('[dispute] discord notify failed', err),
    );
  }
  return c.json({ id, status: 'contested', contestReason });
});

// =========================================================================
// SMASH FFA (Free-For-All, 3+ joueurs)
// =========================================================================
// Le déclarant propose le classement final complet (position 1..N). Le déclarant
// est auto-confirmé ; chaque AUTRE participant confirme UNIQUEMENT sa propre
// position. Quand toutes les positions sont confirmées, le FFA est réglé : l'ELO
// Smash de chacun bouge selon son rang (round-robin sensible au rating, cf.
// calculateFfaElo) et `matchesPlayedSmash` +1. Une contestation annule le FFA.

type PendingFfaForSettle = {
  id: string;
  declaredAt: Date;
  participants: { login: string; position: number }[];
};

// Règle un FFA confirmé : applique l'ELO par rang, supprime le pending et crée le
// PlayedFfa + ses participants. Suppose les participants disponibles (vérifié en
// amont par le handler de confirmation). Renvoie le PlayedFfa créé (avec participants).
async function settleFfaAsPlayed(tx: Prisma.TransactionClient, p: PendingFfaForSettle) {
  // Ordre du classement final : position 1 = 1er … N = dernier.
  const ordered = [...p.participants].sort((a, b) => a.position - b.position);
  const users = await Promise.all(
    ordered.map((pp) => tx.user.findUniqueOrThrow({ where: { login: pp.login } })),
  );
  const ratings = users.map((u) => readElo(u, 'smash'));
  const deltas = calculateFfaElo(ratings);

  // Consommable x2 ELO : double le delta des participants l'ayant armé, puis désarme.
  for (let i = 0; i < ordered.length; i++) {
    deltas[i] = await applyEloMultTx(tx, ordered[i]!.login, deltas[i]!);
  }

  for (let i = 0; i < ordered.length; i++) {
    // ratingUpdate('smash', …) pose le nouvel ELO ET incrémente matchesPlayedSmash.
    await tx.user.update({
      where: { login: ordered[i]!.login },
      data: ratingUpdate('smash', ratings[i]! + deltas[i]!),
    });
  }

  await tx.pendingFfa.delete({ where: { id: p.id } });
  const activeSeason = await tx.season.findFirst({ where: { isActive: true }, select: { id: true } });

  const created = await tx.playedFfa.create({
    data: {
      id: p.id,
      game: 'smash',
      playedAt: p.declaredAt,
      seasonId: activeSeason?.id ?? null,
      countedForElo: true,
      participants: {
        create: ordered.map((pp, i) => ({
          id: randomUUID(),
          login: pp.login,
          position: pp.position,
          ratingBefore: ratings[i]!,
          delta: deltas[i]!,
          ratingAfter: ratings[i]! + deltas[i]!,
        })),
      },
    },
    include: { participants: true },
  });
  // Coins + quêtes : le 1er (position 1) touche la prime de victoire, les autres
  // la prime de participation. Un FFA compte toujours pour l'Elo.
  await awardMatchEconomyTx(
    tx,
    'smash',
    ordered.map((pp) => ({ login: pp.login, won: pp.position === 1 })),
    p.declaredAt,
  );
  // XP + paliers du passe — FFA : pas d'écart pairwise (1er = 100, autres 50).
  await awardMatchExperienceTx(
    tx,
    'smash',
    ordered.map((pp) => ({ login: pp.login, won: pp.position === 1 })),
    p.declaredAt,
  );
  return created;
}

app.get('/matches/ffa/pending', async (c) => {
  await getCurrentLogin(c);
  return c.json(
    await prisma.pendingFfa.findMany({
      where: { game: 'smash' },
      orderBy: { declaredAt: 'desc' },
      include: { participants: true },
    }),
  );
});

app.get('/matches/ffa', async (c) => {
  await getCurrentLogin(c);
  return c.json(
    await prisma.playedFfa.findMany({
      where: { game: 'smash' },
      orderBy: { playedAt: 'desc' },
      include: { participants: true },
    }),
  );
});

// Déclaration d'un FFA Smash : `ranking` est le classement final proposé
// (ranking[0] = 1er). Les positions sont dérivées de l'ordre (position = index+1).
app.post('/matches/ffa', async (c) => {
  const me = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => null);
  const parsed = DeclareFfaSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { ranking } = parsed.data;
  if (!ranking.includes(me)) {
    throw new HTTPException(400, { message: 'tu dois faire partie du FFA' });
  }
  await assertNotBanned(me);
  await getOrCreateUser(me);
  // Tous les autres participants doivent être de vrais utilisateurs 42 disponibles.
  for (const login of ranking) {
    if (login === me) continue;
    const u = await prisma.user.findUnique({ where: { login } });
    if (!u) throw new HTTPException(404, { message: `${login} must login first before being declared` });
    if (!u.ftId) throw new HTTPException(403, { message: `${login} must be a real 42 user` });
    if (u.bannedAt || u.anonymizedAt || u.deletionScheduledAt)
      throw new HTTPException(403, { message: `${login} n'est plus disponible` });
  }

  const pending = await prisma.pendingFfa.create({
    data: {
      id: randomUUID(),
      declarerLogin: me,
      game: 'smash',
      participants: {
        create: ranking.map((login, i) => ({
          id: randomUUID(),
          login,
          position: i + 1,
          // Le déclarant valide d'emblée sa propre position.
          confirmed: login === me,
        })),
      },
    },
    include: { participants: true },
  });

  const others = ranking.filter((l) => l !== me);
  emit(others, { type: 'ffa:pending', payload: { id: pending.id, declarerLogin: me } });
  // FFA = résultat « officiel » à valider par chacun → notif cloche (contrairement
  // au 1v1 qui vit seulement dans la section Défis).
  await notifyMany(others, {
    type: 'ffa_pending',
    title: `@${me} t'a placé dans un FFA Smash`,
    body: 'Confirme ta position dans le classement.',
    link: '/challenges?game=smash',
    game: 'smash',
    refId: pending.id,
  });
  return c.json({ id: pending.id, status: 'pending' }, 201);
});

// Confirmation de SA propre position. Quand toutes les positions sont confirmées,
// le FFA est réglé dans la foulée.
app.post('/matches/ffa/:id/confirm', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = ConfirmFfaPositionSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { position } = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    // Verrou de ligne : sérialise les confirmations concurrentes (le dernier
    // confirmant déclenche le règlement, on évite un double-règlement).
    await tx.$executeRaw`SELECT 1 FROM pending_ffas WHERE id = ${id} FOR UPDATE`;
    const pending = await tx.pendingFfa.findUnique({ where: { id }, include: { participants: true } });
    if (!pending) {
      // Déjà réglé ou annulé entre-temps.
      throw new HTTPException(404, { message: 'FFA introuvable (déjà réglé ou annulé)' });
    }
    const mine = pending.participants.find((pp) => pp.login === me);
    if (!mine) {
      throw new HTTPException(403, { message: 'tu ne fais pas partie de ce FFA' });
    }
    if (mine.position !== position) {
      throw new HTTPException(409, {
        message: 'le classement a changé — recharge le FFA avant de confirmer ta place',
      });
    }
    if (!mine.confirmed) {
      await tx.pendingFfaParticipant.update({ where: { id: mine.id }, data: { confirmed: true } });
    }
    const confirmedCount = pending.participants.filter((pp) => pp.confirmed || pp.login === me).length;
    const total = pending.participants.length;
    if (confirmedCount < total) {
      return { settled: false as const, id, confirmed: confirmedCount, total, recipients: pending.participants.map((pp) => pp.login) };
    }

    // Tous confirmés → règlement. Filet de sécurité : un participant devenu
    // indisponible (devrait être déjà nettoyé par l'offboarding) annule le FFA.
    const unavailable = await tx.user.findMany({
      where: {
        login: { in: pending.participants.map((pp) => pp.login) },
        OR: [{ bannedAt: { not: null } }, { anonymizedAt: { not: null } }, { deletionScheduledAt: { not: null } }],
      },
      select: { login: true },
    });
    if (unavailable.length > 0) {
      await tx.pendingFfa.delete({ where: { id } });
      return { settled: false as const, aborted: true as const, id, recipients: pending.participants.map((pp) => pp.login), unavailable: unavailable.map((u) => u.login) };
    }

    const played = await settleFfaAsPlayed(tx, pending);
    return { settled: true as const, played };
  });

  if (result.settled) {
    const played = result.played;
    const logins = played.participants.map((pp) => pp.login);
    emit(logins, { type: 'ffa:confirmed', payload: played });
    // Le FFA est réglé → notifs « score à valider » soldées, puis résultat (place +
    // ELO) poussé en cloche pour chaque participant. refId suffixé `:result` car le
    // PlayedFfa réutilise l'id du pending (sinon l'auto-lecture effacerait le résultat).
    void markNotifsReadByRef(logins, played.id);
    for (const pp of played.participants) {
      void notify(pp.login, {
        type: 'ffa_result',
        title: `FFA Smash — ${pp.position}${pp.position === 1 ? 'er' : 'e'}`,
        body: `ELO ${pp.delta >= 0 ? '+' : ''}${pp.delta}`,
        link: '/challenges?game=smash',
        game: 'smash',
        refId: `${played.id}:result`,
      });
    }
    // L'ELO Smash de plusieurs joueurs a changé → le classement bouge pour tous.
    broadcast({ type: 'leaderboard:update', payload: {} });
    for (const pp of played.participants) void maybeNotifyTop3(pp.login, pp.delta);
    return c.json(played);
  }
  if ('aborted' in result && result.aborted) {
    emit(result.recipients, { type: 'ffa:cancelled', payload: { id: result.id, reason: 'unavailable' } });
    throw new HTTPException(409, { message: 'un participant n\'est plus disponible — FFA annulé, à redéclarer' });
  }
  // Confirmation enregistrée, en attente des autres.
  emit(result.recipients, { type: 'ffa:progress', payload: { id: result.id, confirmed: result.confirmed, total: result.total } });
  return c.json({ id: result.id, status: 'pending', confirmed: result.confirmed, total: result.total });
});

// Contestation de SA position → annule tout le FFA (le déclarant est notifié).
app.post('/matches/ffa/:id/contest', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = ContestFfaSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { claimedPosition, message } = parsed.data;

  let info: { declarerLogin: string; others: string[]; proposedPosition: number } | undefined;
  await prisma.$transaction(async (tx) => {
    const pending = await tx.pendingFfa.findUnique({ where: { id }, include: { participants: true } });
    if (!pending) throw new HTTPException(404, { message: 'FFA introuvable' });
    const mine = pending.participants.find((pp) => pp.login === me);
    if (!mine) throw new HTTPException(403, { message: 'tu ne fais pas partie de ce FFA' });
    if (me === pending.declarerLogin) {
      throw new HTTPException(400, { message: 'le déclarant annule son FFA, il ne le conteste pas' });
    }
    info = {
      declarerLogin: pending.declarerLogin,
      others: pending.participants.map((pp) => pp.login).filter((l) => l !== me),
      proposedPosition: mine.position,
    };
    await tx.pendingFfa.delete({ where: { id } });
  });

  if (info) {
    emit([info.declarerLogin], {
      type: 'ffa:contested',
      payload: { id, contestedBy: me, claimedPosition, proposedPosition: info.proposedPosition },
    });
    await notify(info.declarerLogin, {
      type: 'ffa_contested',
      title: `@${me} conteste le FFA Smash`,
      body: `Position revendiquée : ${claimedPosition}${message ? ` — « ${message} »` : ''}. FFA annulé.`,
      link: '/challenges?game=smash',
      game: 'smash',
      refId: id,
    });
    // Les autres participants voient le FFA disparaître.
    emit(info.others.filter((l) => l !== info!.declarerLogin), { type: 'ffa:cancelled', payload: { id, cancelledBy: me, reason: 'contested' } });
    // Le FFA est annulé → les « score à valider » de tous les participants sont soldés.
    void markNotifsReadByRef([me, ...info.others], id);
  }
  return c.json({ id, status: 'cancelled' });
});

// Annulation par le déclarant lui-même.
app.post('/matches/ffa/:id/cancel', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');

  let others: string[] = [];
  await prisma.$transaction(async (tx) => {
    const pending = await tx.pendingFfa.findUnique({ where: { id }, include: { participants: true } });
    if (!pending) throw new HTTPException(404, { message: 'FFA introuvable' });
    if (pending.declarerLogin !== me) {
      throw new HTTPException(403, { message: 'seul le déclarant peut annuler ce FFA' });
    }
    others = pending.participants.map((pp) => pp.login).filter((l) => l !== me);
    await tx.pendingFfa.delete({ where: { id } });
  });

  if (others.length > 0) {
    emit(others, { type: 'ffa:cancelled', payload: { id, cancelledBy: me } });
    // Le déclarant annule → les « score à valider » des participants sont soldés.
    void markNotifsReadByRef(others, id);
  }
  return c.json({ id, status: 'cancelled' });
});

// =========================================================================
// FLÉCHETTES (301 / 501, 2 à 8 joueurs)
// =========================================================================
// Multijoueur, réutilise les tables FFA (game='flechettes', startScore + remaining
// par participant). Le déclarant saisit le reste de chaque joueur (vainqueur = 0) ;
// la position en découle (reste croissant). Chaque AUTRE joueur confirme SON reste.
// Au complet, l'ELO Fléchettes de chacun bouge selon la marge (calculateDartsElo)
// et `matchesPlayedFlechettes` +1. Une contestation annule la manche.

type PendingDartsForSettle = {
  id: string;
  declaredAt: Date;
  startScore: number | null;
  participants: { login: string; position: number; remaining: number | null }[];
};

// Règle une manche de fléchettes confirmée : ELO pondéré par les points réalisés,
// supprime le pending, crée le PlayedFfa (game='flechettes') + ses participants.
async function settleDartsAsPlayed(tx: Prisma.TransactionClient, p: PendingDartsForSettle) {
  const startScore = p.startScore ?? 501;
  // Classement : reste croissant (0 = vainqueur = 1er).
  const ordered = [...p.participants].sort((a, b) => (a.remaining ?? startScore) - (b.remaining ?? startScore));
  const users = await Promise.all(
    ordered.map((pp) => tx.user.findUniqueOrThrow({ where: { login: pp.login } })),
  );
  const ratings = users.map((u) => readElo(u, 'flechettes'));
  const scored = ordered.map((pp) => startScore - (pp.remaining ?? startScore));
  const deltas = calculateDartsElo(ratings, scored);

  // Consommable x2 ELO : double le delta des participants l'ayant armé, puis désarme.
  for (let i = 0; i < ordered.length; i++) {
    deltas[i] = await applyEloMultTx(tx, ordered[i]!.login, deltas[i]!);
  }

  for (let i = 0; i < ordered.length; i++) {
    await tx.user.update({
      where: { login: ordered[i]!.login },
      data: ratingUpdate('flechettes', ratings[i]! + deltas[i]!),
    });
  }

  await tx.pendingFfa.delete({ where: { id: p.id } });
  const activeSeason = await tx.season.findFirst({ where: { isActive: true }, select: { id: true } });

  const created = await tx.playedFfa.create({
    data: {
      id: p.id,
      game: 'flechettes',
      startScore,
      playedAt: p.declaredAt,
      seasonId: activeSeason?.id ?? null,
      countedForElo: true,
      participants: {
        create: ordered.map((pp, i) => ({
          id: randomUUID(),
          login: pp.login,
          position: i + 1,
          remaining: pp.remaining ?? null,
          ratingBefore: ratings[i]!,
          delta: deltas[i]!,
          ratingAfter: ratings[i]! + deltas[i]!,
        })),
      },
    },
    include: { participants: true },
  });
  // Coins + quêtes : le vainqueur (reste le plus bas = 1er du classement) touche
  // la prime de victoire, les autres la participation. Une manche compte toujours.
  await awardMatchEconomyTx(
    tx,
    'flechettes',
    ordered.map((pp, i) => ({ login: pp.login, won: i === 0 })),
    p.declaredAt,
  );
  // XP + paliers du passe — FFA fléchettes : pas d'écart pairwise (1er = 100, autres 50).
  await awardMatchExperienceTx(
    tx,
    'flechettes',
    ordered.map((pp, i) => ({ login: pp.login, won: i === 0 })),
    p.declaredAt,
  );
  return created;
}

app.get('/matches/darts/pending', async (c) => {
  await getCurrentLogin(c);
  return c.json(
    await prisma.pendingFfa.findMany({
      where: { game: 'flechettes' },
      orderBy: { declaredAt: 'desc' },
      include: { participants: true },
    }),
  );
});

app.get('/matches/darts', async (c) => {
  await getCurrentLogin(c);
  return c.json(
    await prisma.playedFfa.findMany({
      where: { game: 'flechettes' },
      orderBy: { playedAt: 'desc' },
      include: { participants: true },
    }),
  );
});

// Déclaration d'une manche de fléchettes : `participants` = {login, remaining}.
// La position est dérivée du reste (croissant). Le déclarant est auto-confirmé.
app.post('/matches/darts', async (c) => {
  const me = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => null);
  const parsed = DeclareDartsSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { startScore, participants } = parsed.data;
  const logins = participants.map((p) => p.login);
  if (!logins.includes(me)) {
    throw new HTTPException(400, { message: 'tu dois faire partie de la manche' });
  }
  await assertNotBanned(me);
  await getOrCreateUser(me);
  for (const login of logins) {
    if (login === me) continue;
    const u = await prisma.user.findUnique({ where: { login } });
    if (!u) throw new HTTPException(404, { message: `${login} must login first before being declared` });
    if (!u.ftId) throw new HTTPException(403, { message: `${login} must be a real 42 user` });
    if (u.bannedAt || u.anonymizedAt || u.deletionScheduledAt)
      throw new HTTPException(403, { message: `${login} n'est plus disponible` });
  }

  // Position dérivée du reste (croissant) ; ordre d'origine départage les égalités.
  const ordered = [...participants]
    .map((p, i) => ({ ...p, srcIndex: i }))
    .sort((a, b) => a.remaining - b.remaining || a.srcIndex - b.srcIndex);

  const pending = await prisma.pendingFfa.create({
    data: {
      id: randomUUID(),
      declarerLogin: me,
      game: 'flechettes',
      startScore,
      participants: {
        create: ordered.map((p, i) => ({
          id: randomUUID(),
          login: p.login,
          position: i + 1,
          remaining: p.remaining,
          confirmed: p.login === me,
        })),
      },
    },
    include: { participants: true },
  });

  const others = logins.filter((l) => l !== me);
  emit(others, { type: 'darts:pending', payload: { id: pending.id, declarerLogin: me } });
  await notifyMany(others, {
    type: 'darts_pending',
    title: `@${me} t'a ajouté à une manche de fléchettes`,
    body: 'Confirme tes points restants.',
    link: '/challenges?game=flechettes',
    game: 'flechettes',
    refId: pending.id,
  });
  return c.json({ id: pending.id, status: 'pending' }, 201);
});

// Confirmation de SON propre reste. Au complet, la manche est réglée dans la foulée.
app.post('/matches/darts/:id/confirm', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = ConfirmDartsSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { remaining } = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM pending_ffas WHERE id = ${id} FOR UPDATE`;
    const pending = await tx.pendingFfa.findUnique({ where: { id }, include: { participants: true } });
    if (!pending || pending.game !== 'flechettes') {
      throw new HTTPException(404, { message: 'manche introuvable (déjà réglée ou annulée)' });
    }
    const mine = pending.participants.find((pp) => pp.login === me);
    if (!mine) {
      throw new HTTPException(403, { message: 'tu ne fais pas partie de cette manche' });
    }
    // Le schéma borne à 501 ; on vérifie ici le vrai startScore de la manche (301/501).
    const startScore = pending.startScore ?? 501;
    if (remaining < 0 || remaining > startScore) {
      throw new HTTPException(400, {
        message: `reste invalide : doit être entre 0 et ${startScore}`,
      });
    }
    if (mine.remaining !== remaining) {
      throw new HTTPException(409, {
        message: 'le score a changé — recharge la manche avant de confirmer ton reste',
      });
    }
    if (!mine.confirmed) {
      await tx.pendingFfaParticipant.update({ where: { id: mine.id }, data: { confirmed: true } });
    }
    const confirmedCount = pending.participants.filter((pp) => pp.confirmed || pp.login === me).length;
    const total = pending.participants.length;
    if (confirmedCount < total) {
      return { settled: false as const, id, confirmed: confirmedCount, total, recipients: pending.participants.map((pp) => pp.login) };
    }

    const unavailable = await tx.user.findMany({
      where: {
        login: { in: pending.participants.map((pp) => pp.login) },
        OR: [{ bannedAt: { not: null } }, { anonymizedAt: { not: null } }, { deletionScheduledAt: { not: null } }],
      },
      select: { login: true },
    });
    if (unavailable.length > 0) {
      await tx.pendingFfa.delete({ where: { id } });
      return { settled: false as const, aborted: true as const, id, recipients: pending.participants.map((pp) => pp.login), unavailable: unavailable.map((u) => u.login) };
    }

    const played = await settleDartsAsPlayed(tx, pending);
    return { settled: true as const, played };
  });

  if (result.settled) {
    const played = result.played;
    const playLogins = played.participants.map((pp) => pp.login);
    emit(playLogins, { type: 'darts:confirmed', payload: played });
    void markNotifsReadByRef(playLogins, played.id);
    for (const pp of played.participants) {
      void notify(pp.login, {
        type: 'darts_result',
        title: `Fléchettes — ${pp.position}${pp.position === 1 ? 'er' : 'e'}`,
        body: `ELO ${pp.delta >= 0 ? '+' : ''}${pp.delta}`,
        link: '/challenges?game=flechettes',
        game: 'flechettes',
        refId: `${played.id}:result`,
      });
    }
    broadcast({ type: 'leaderboard:update', payload: {} });
    for (const pp of played.participants) void maybeNotifyTop3(pp.login, pp.delta);
    return c.json(played);
  }
  if ('aborted' in result && result.aborted) {
    emit(result.recipients, { type: 'darts:cancelled', payload: { id: result.id, reason: 'unavailable' } });
    throw new HTTPException(409, { message: 'un participant n\'est plus disponible — manche annulée, à redéclarer' });
  }
  emit(result.recipients, { type: 'darts:progress', payload: { id: result.id, confirmed: result.confirmed, total: result.total } });
  return c.json({ id: result.id, status: 'pending', confirmed: result.confirmed, total: result.total });
});

// Contestation de SON reste → annule toute la manche (le déclarant est notifié).
app.post('/matches/darts/:id/contest', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = ContestDartsSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { claimedRemaining, message } = parsed.data;

  let info: { declarerLogin: string; others: string[]; proposedRemaining: number | null } | undefined;
  await prisma.$transaction(async (tx) => {
    const pending = await tx.pendingFfa.findUnique({ where: { id }, include: { participants: true } });
    if (!pending || pending.game !== 'flechettes') throw new HTTPException(404, { message: 'manche introuvable' });
    const mine = pending.participants.find((pp) => pp.login === me);
    if (!mine) throw new HTTPException(403, { message: 'tu ne fais pas partie de cette manche' });
    if (me === pending.declarerLogin) {
      throw new HTTPException(400, { message: 'le déclarant annule sa manche, il ne la conteste pas' });
    }
    // Le schéma borne à 501 ; on vérifie ici le vrai startScore de la manche (301/501).
    const startScore = pending.startScore ?? 501;
    if (claimedRemaining < 0 || claimedRemaining > startScore) {
      throw new HTTPException(400, {
        message: `reste revendiqué invalide : doit être entre 0 et ${startScore}`,
      });
    }
    info = {
      declarerLogin: pending.declarerLogin,
      others: pending.participants.map((pp) => pp.login).filter((l) => l !== me),
      proposedRemaining: mine.remaining,
    };
    await tx.pendingFfa.delete({ where: { id } });
  });

  if (info) {
    emit([info.declarerLogin], {
      type: 'darts:contested',
      payload: { id, contestedBy: me, claimedRemaining, proposedRemaining: info.proposedRemaining },
    });
    await notify(info.declarerLogin, {
      type: 'darts_contested',
      title: `@${me} conteste la manche de fléchettes`,
      body: `Reste revendiqué : ${claimedRemaining}${message ? ` — « ${message} »` : ''}. Manche annulée.`,
      link: '/challenges?game=flechettes',
      game: 'flechettes',
      refId: id,
    });
    emit(info.others.filter((l) => l !== info!.declarerLogin), { type: 'darts:cancelled', payload: { id, cancelledBy: me, reason: 'contested' } });
    void markNotifsReadByRef([me, ...info.others], id);
  }
  return c.json({ id, status: 'cancelled' });
});

// Annulation par le déclarant lui-même.
app.post('/matches/darts/:id/cancel', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');

  let others: string[] = [];
  await prisma.$transaction(async (tx) => {
    const pending = await tx.pendingFfa.findUnique({ where: { id }, include: { participants: true } });
    if (!pending || pending.game !== 'flechettes') throw new HTTPException(404, { message: 'manche introuvable' });
    if (pending.declarerLogin !== me) {
      throw new HTTPException(403, { message: 'seul le déclarant peut annuler cette manche' });
    }
    others = pending.participants.map((pp) => pp.login).filter((l) => l !== me);
    await tx.pendingFfa.delete({ where: { id } });
  });

  if (others.length > 0) {
    emit(others, { type: 'darts:cancelled', payload: { id, cancelledBy: me } });
    void markNotifsReadByRef(others, id);
  }
  return c.json({ id, status: 'cancelled' });
});

// ── SUPERADMIN : forcer la résolution d'un match en attente ──────────────────

app.post('/admin/matches/:id/force-confirm', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const id = c.req.param('id');

  const match = await prisma.$transaction(async (tx) => {
    const p = await tx.pendingMatch.findUnique({ where: { id } });
    if (!p) throw new HTTPException(404, { message: 'pending match not found' });
    return settlePendingAsPlayed(tx, p);
  });

  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_MATCH',
    target: match.playerALogin,
    payload: {
      forced: 'confirm',
      matchId: id,
      playerA: match.playerALogin,
      playerB: match.playerBLogin,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
    },
  });

  emit([match.playerALogin, match.playerBLogin], { type: 'match:confirmed', payload: match });
  // Score à valider soldé pour tous les participants + résultat poussé en cloche.
  void markNotifsReadByRef(
    [match.playerALogin, match.playerBLogin, match.playerA2Login, match.playerB2Login].filter(
      Boolean,
    ) as string[],
    id,
  );
  void notifyMatchResult(match);
  broadcast({ type: 'leaderboard:update', payload: {} });
  return c.json(match);
});

app.post('/admin/matches/:id/force-cancel', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const id = c.req.param('id');

  const p = await prisma.pendingMatch.findUnique({ where: { id } });
  if (!p) throw new HTTPException(404, { message: 'pending match not found' });
  await prisma.pendingMatch.delete({ where: { id } });

  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'DELETE_MATCH',
    target: p.declarerLogin,
    payload: {
      forced: 'cancel',
      matchId: id,
      declarer: p.declarerLogin,
      opponent: p.opponentLogin,
      score: `${p.scoreDeclarer}-${p.scoreOpponent}`,
    },
  });

  emit([p.declarerLogin, p.opponentLogin], { type: 'match:expired', payload: { id } });
  return c.json({ id, status: 'cancelled' });
});

// ── SUPERADMIN : gestion des faux joueurs + forçage de résultat ──────────────

const AdminCreateUserSchema = z.object({
  login: z.string().trim().min(2).max(20).regex(/^[a-zA-Z0-9_-]+$/),
  campus: z.string().trim().max(40).optional(),
  elo: z.number().int().min(0).max(5000).optional(),
});

app.post('/admin/users', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const body = await c.req.json().catch(() => ({}));
  const parsed = AdminCreateUserSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { login, campus, elo } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { login } });
  if (existing) {
    throw new HTTPException(409, { message: `Le login "${login}" existe déjà.` });
  }

  // L'Elo attribué vaut pour TOUS les modes (pas le seul babyfoot) et le joueur
  // adhère à toutes les disciplines → il a un grade, donc un anneau de pp, partout.
  const eloVal = elo ?? 1000;
  const user = await prisma.user.create({
    data: { login, campus: campus ?? null, games: [...GAME_IDS], ...eloAllGames(eloVal) },
  });

  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_STATS',
    target: login,
    payload: { created: true, fake: true, campus: campus ?? null, elo: elo ?? 1000 },
  });

  broadcast({ type: 'leaderboard:update', payload: {} });
  return c.json(user);
});

app.delete('/admin/users/:login', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const login = c.req.param('login');

  if (SUPERADMINS.has(login.toLowerCase())) {
    throw new HTTPException(403, { message: 'Un SUPERADMIN ne peut pas être supprimé.' });
  }

  const user = await prisma.user.findUnique({ where: { login } });
  if (!user) throw new HTTPException(404, { message: 'utilisateur introuvable' });
  // En PROD, seuls les faux comptes (ftId null, créés manuellement) sont
  // supprimables — on protège les vrais comptes 42. En STAGING, les comptes
  // synchronisés depuis la prod portent un ftId réel mais ne sont que des copies
  // sandbox (la synchro est en lecture seule, aucune écriture vers la prod) → on
  // autorise leur suppression pour pouvoir nettoyer le staging.
  const isStagingEnv = process.env.APP_ENV === 'staging';
  if (user.ftId !== null && !isStagingEnv) {
    throw new HTTPException(403, {
      message: 'Seuls les faux comptes (créés manuellement, sans compte 42) peuvent être supprimés.',
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.pendingMatch.deleteMany({
      where: {
        OR: [
          { declarerLogin: login },
          { opponentLogin: login },
          // 2v2 : le joueur peut n'être que coéquipier (partner1/partner2).
          { partner1Login: login },
          { partner2Login: login },
        ],
      },
    });
    // Inclut les slots coéquipiers 2v2 (playerA2/B2) : sinon un match où le
    // joueur n'est « que » coéquipier subsiste et viole la FK. Doit précéder la
    // suppression des BabyfootTeam (PlayedMatch.teamA/B y pointent, sans cascade).
    await tx.playedMatch.deleteMany({
      where: {
        OR: [
          { playerALogin: login },
          { playerBLogin: login },
          { playerA2Login: login },
          { playerB2Login: login },
        ],
      },
    });
    // Duos 2v2 dont le joueur fait partie (FK sans cascade vers User).
    await tx.babyfootTeam.deleteMany({
      where: { OR: [{ player1Login: login }, { player2Login: login }] },
    });
    // FFA joués (Smash / Fléchettes) auxquels le joueur a participé : on supprime
    // le FFA entier (cascade → participants), sinon PlayedFfaParticipant.user
    // (FK sans cascade) bloque la suppression.
    const userFfas = await tx.playedFfaParticipant.findMany({
      where: { login },
      select: { playedId: true },
    });
    if (userFfas.length) {
      await tx.playedFfa.deleteMany({
        where: { id: { in: [...new Set(userFfas.map((p) => p.playedId))] } },
      });
    }
    await tx.challenge.deleteMany({
      where: { OR: [{ challengerLogin: login }, { opponentLogin: login }] },
    });
    // Rembourse les paris ouverts sur les duels d'ops du joueur avant le cascade.
    const userOps = await tx.ops.findMany({
      where: { OR: [{ ownerLogin: login }, { targetLogin: login }] },
      select: { id: true },
    });
    if (userOps.length) {
      await refundBetsTx(tx, { targetType: 'ops', opsId: { in: userOps.map((o) => o.id) } });
    }
    await tx.ops.deleteMany({
      where: { OR: [{ ownerLogin: login }, { targetLogin: login }] },
    });
    await tx.rejectedMatch.deleteMany({
      where: { OR: [{ declarerLogin: login }, { opponentLogin: login }] },
    });
    await tx.featureRequest.deleteMany({ where: { authorId: login } });
    await tx.bugReport.deleteMany({ where: { authorId: login } });
    await tx.tournamentEntry.deleteMany({ where: { login } });
    await tx.tournamentMatch.updateMany({ where: { playerALogin: login }, data: { playerALogin: null } });
    await tx.tournamentMatch.updateMany({ where: { playerBLogin: login }, data: { playerBLogin: null } });
    await tx.tournament.updateMany({ where: { winnerLogin: login }, data: { winnerLogin: null } });
    // Rembourse les paris ouverts sur les tournois du joueur avant le cascade.
    const createdTours = await tx.tournament.findMany({
      where: { createdByLogin: login },
      select: { id: true },
    });
    await refundOpenBetsForTournamentsTx(tx, createdTours.map((t) => t.id));
    await tx.tournament.deleteMany({ where: { createdByLogin: login } });
    // Classements de saison figés : SeasonStanding n'a pas de FK vers User (simple
    // colonne `login`) → la suppression du joueur ne les nettoie pas en cascade.
    // On les retire pour ne pas laisser le joueur supprimé hanter les palmarès.
    await tx.seasonStanding.deleteMany({ where: { login } });
    await tx.user.delete({ where: { login } });
  });

  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_STATS',
    target: login,
    payload: { deletedFakeUser: true },
  });

  broadcast({ type: 'leaderboard:update', payload: {} });
  return c.json({ login, deleted: true });
});

// Phrase de confirmation exacte exigée pour le reset total de la base.
// Doit être tapée à la main côté front (copier-coller bloqué) ET renvoyée ici.
const RESET_CONFIRM_PHRASE = 'oui je suis sure de ce que je fais';

// Reset COMPLET de la ligue (SUPERADMIN). Supprime tout l'historique de jeu
// (matchs joués/en attente, défis, ops, rejets, tournois) et remet chaque joueur
// conservé à zéro (ELO 1000, matchs/dodges/trophées 0, titre effacé). Les comptes
// supprimés/anonymisés (joueurs partis) ne sont PAS conservés. Irréversible.
app.post('/admin/reset-database', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);

  const body = await c.req.json().catch(() => ({}));
  if (typeof body.confirm !== 'string' || body.confirm.trim() !== RESET_CONFIRM_PHRASE) {
    throw new HTTPException(400, {
      message: 'Phrase de confirmation incorrecte — reset annulé.',
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Rembourse toutes les mises encore ouvertes AVANT d'effacer ops/tournois :
    // le reset ne touche pas `leagueCoins`, donc une mise non rendue serait
    // définitivement perdue du solde des joueurs conservés. À faire avant les
    // deleteMany ci-dessous, sinon le cascade efface les paris avant le rendu.
    await refundBetsTx(tx, {});
    // 1. Effacer tout l'historique de jeu.
    await tx.pendingMatch.deleteMany({});
    await tx.playedMatch.deleteMany({});
    await tx.challenge.deleteMany({});
    await tx.ops.deleteMany({});
    await tx.rejectedMatch.deleteMany({});
    await tx.tournament.deleteMany({}); // cascade → entries + tournament_matches

    // 2. Retirer définitivement les comptes désactivés / supprimés (joueurs partis),
    //    sauf les SUPERADMIN qui sont toujours préservés.
    const gone = await tx.user.findMany({
      where: { OR: [{ deletionScheduledAt: { not: null } }, { anonymizedAt: { not: null } }] },
      select: { login: true },
    });
    const removeLogins = gone
      .map((u) => u.login)
      .filter((l) => !SUPERADMINS.has(l.toLowerCase()));
    if (removeLogins.length > 0) {
      await tx.featureRequest.deleteMany({ where: { authorId: { in: removeLogins } } });
      await tx.bugReport.deleteMany({ where: { authorId: { in: removeLogins } } });
      await tx.user.deleteMany({ where: { login: { in: removeLogins } } });
    }

    // 3. Remettre tous les joueurs conservés à zéro.
    const reset = await tx.user.updateMany({
      data: { elo: 1000, matchesPlayed: 0, dodgeCount: 0, tournamentsWon: 0, title: null },
    });

    return { removedUsers: removeLogins.length, resetUsers: reset.count };
  });

  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'RESET_DATABASE',
    target: null,
    payload: result,
  });

  broadcast({ type: 'leaderboard:update', payload: {} });
  return c.json({ reset: true, ...result });
});

const AdminForceResultSchema = z
  .object({
    playerA: z.string().trim().min(1),
    playerB: z.string().trim().min(1),
    scoreA: z.number().int().min(0).max(50),
    scoreB: z.number().int().min(0).max(50),
  })
  .refine((d) => d.playerA !== d.playerB, { message: 'Les deux joueurs doivent être différents.' })
  .refine((d) => d.scoreA !== d.scoreB, { message: 'Match nul impossible — il faut un vainqueur.' });

app.post('/admin/matches/force-result', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const body = await c.req.json().catch(() => ({}));
  const parsed = AdminForceResultSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { playerA: pA, playerB: pB, scoreA: sIn, scoreB: sInB } = parsed.data;

  const match = await prisma.$transaction(async (tx) => {
    const [uA, uB] = await Promise.all([
      tx.user.findUnique({ where: { login: pA } }),
      tx.user.findUnique({ where: { login: pB } }),
    ]);
    if (!uA) throw new HTTPException(404, { message: `Joueur introuvable : ${pA}` });
    if (!uB) throw new HTTPException(404, { message: `Joueur introuvable : ${pB}` });

    const [a, b] = pairKey(pA, pB);
    const scoreA = a === pA ? sIn : sInB;
    const scoreB = a === pA ? sInB : sIn;
    const winner: 'A' | 'B' = scoreA > scoreB ? 'A' : 'B';

    const userA = a === pA ? uA : uB;
    const userB = a === pA ? uB : uA;
    const update = calculateBabyfootElo(userA.elo, userB.elo, winner, scoreA, scoreB);

    // Même dégressivité anti-farming que les matchs normaux (rematch du jour).
    const playedAt = new Date();
    const priors = await tx.playedMatch.findMany({
      where: { playerALogin: a, playerBLogin: b, game: 'babyfoot', mode: null },
      select: { playedAt: true, countedForElo: true },
    });
    const factor = farmingDecayFactor(sameDayPriorCount(priors, playedAt));
    const deltaA = applyFarmingDecay(update.deltaA, factor);
    const deltaB = applyFarmingDecay(update.deltaB, factor);

    await tx.user.update({
      where: { login: a },
      data: { elo: userA.elo + deltaA, matchesPlayed: { increment: 1 } },
    });
    await tx.user.update({
      where: { login: b },
      data: { elo: userB.elo + deltaB, matchesPlayed: { increment: 1 } },
    });

    return tx.playedMatch.create({
      data: {
        id: randomUUID(),
        playerALogin: a,
        playerBLogin: b,
        scoreA,
        scoreB,
        winner,
        playedAt,
        countedForElo: true,
        deltaA,
        deltaB,
      },
    });
  });

  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_MATCH',
    target: match.playerALogin,
    payload: {
      forcedResult: true,
      playerA: match.playerALogin,
      playerB: match.playerBLogin,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
    },
  });

  emit([match.playerALogin, match.playerBLogin], { type: 'match:confirmed', payload: match });
  void notifyMatchResult(match);
  broadcast({ type: 'leaderboard:update', payload: {} });
  return c.json(match);
});


app.get('/challenges', async (c) => {
  const me = await getCurrentLogin(c);
  const list = await prisma.challenge.findMany({
    where: {
      // 2v2 : un défi concerne aussi les coéquipiers (partner / opponentPartner).
      OR: [
        { challengerLogin: me },
        { opponentLogin: me },
        { partnerLogin: me },
        { opponentPartnerLogin: me },
      ],
      status: { in: ['pending', 'accepted'] },
    },
    orderBy: { scheduledAt: 'asc' },
  });
  return c.json(list);
});

// POST /challenges/2v2 — défi 2v2 Babyfoot. Le challenger nomme les 4 joueurs ;
// seuls les 2 adversaires doivent accepter (cf. /challenges/:id/accept).
app.post('/challenges/2v2', async (c) => {
  const me = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => null);
  const parsed = CreateChallenge2v2Schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { partnerLogin, opponentLogin, opponentPartnerLogin, scheduledAt } = parsed.data;
  if ([partnerLogin, opponentLogin, opponentPartnerLogin].includes(me)) {
    throw new HTTPException(400, { message: 'cannot challenge yourself' });
  }
  for (const login of [partnerLogin, opponentLogin, opponentPartnerLogin]) {
    await assertTargetable(login);
  }
  await getOrCreateUser(me);
  const challenge = await prisma.challenge.create({
    data: {
      id: randomUUID(),
      challengerLogin: me,
      opponentLogin,
      status: 'pending',
      scheduledAt: new Date(scheduledAt),
      game: 'babyfoot',
      mode: '2v2',
      partnerLogin,
      opponentPartnerLogin,
    },
  });
  // Les 3 autres joueurs sont notifiés (les 2 adversaires devront accepter).
  emit([opponentLogin, opponentPartnerLogin, partnerLogin], {
    type: 'challenge:received',
    payload: challenge,
  });
  for (const login of [opponentLogin, opponentPartnerLogin]) {
    void notify(login, {
      type: 'challenge_received',
      title: `@${me} t'a défié en 2v2`,
      body: 'Un nouveau défi en équipe t\'attend',
      link: `/challenges?game=babyfoot`,
      game: 'babyfoot',
      refId: challenge.id,
    });
  }
  return c.json(challenge, 201);
});

app.post('/challenges', async (c) => {
  const me = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => null);
  const parsed = CreateChallengeSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { opponentLogin, scheduledAt, game } = parsed.data;
  if (opponentLogin === me) {
    throw new HTTPException(400, { message: 'cannot challenge yourself' });
  }
  // Un adversaire banni / désactivé / anonymisé est hors-jeu : pas de défi.
  await assertTargetable(opponentLogin);
  await getOrCreateUser(me);

  // ─── OPS : défi forcé → auto-accepté ──────────────────────────────────────
  // Si JE (le traqueur) défie MA cible pendant un OPS actif et que le quota de 3
  // matchs forcés n'est pas épuisé, le défi est FORCÉ : il naît déjà 'accepted'
  // (la cible ne choisit pas, le duel a lieu — elle n'a plus qu'à le jouer). Le
  // compteur forcedUsed n'est PAS touché ici : il l'est au confirm final du match
  // (cf. /matches/:id/confirm) ou au refus forcé (cf. /challenges/:id/decline),
  // pour ne compter que les matchs réellement consommés. 1v1 uniquement.
  const now = new Date();
  const forcedOps = await prisma.ops.findFirst({
    where: {
      ownerLogin: me,
      targetLogin: opponentLogin,
      expiresAt: { gt: now },
      forcedUsed: { lt: OPS_FORCED_MATCHES },
    },
  });
  // Le quota de 3 ne se mesure PAS qu'au compteur `forcedUsed` (incrémenté seulement
  // au confirm/refus) : sinon le traqueur peut spammer N défis forcés tant qu'aucun
  // n'est encore consommé (tous nés 'accepted' → cible piégée sur > 3 matchs). On
  // compte donc aussi les défis forcés DÉJÀ EN VOL sur cet ops (créés mais pas
  // encore soldés : pending / accepted / recorded — ils consommeront un slot). Le
  // défi n'est forcé que si forcedUsed + en-vol < 3.
  const outstandingForced = forcedOps
    ? await prisma.challenge.count({
        where: { opsId: forcedOps.id, status: { in: ['pending', 'accepted', 'recorded'] } },
      })
    : 0;
  const isForced = !!forcedOps && forcedOps.forcedUsed + outstandingForced < OPS_FORCED_MATCHES;

  const challenge = await prisma.challenge.create({
    data: {
      id: randomUUID(),
      challengerLogin: me,
      opponentLogin,
      status: isForced ? 'accepted' : 'pending',
      ...(isForced ? { decidedAt: now } : {}),
      // Marque ce défi comme « duel d'ops » → pariable individuellement et réglé
      // au confirm du match (cf. POST /bets/ops, GET /bets, settlement).
      ...(isForced ? { opsId: forcedOps!.id } : {}),
      scheduledAt: new Date(scheduledAt),
      game,
    },
  });

  if (isForced) {
    // Défi déjà accepté : les deux camps doivent le voir « prêt à jouer ».
    emit([opponentLogin, me], { type: 'challenge:accepted', payload: challenge });
    void notify(opponentLogin, {
      type: 'challenge_received',
      title: `@${me} t'impose un duel`,
      body: 'Duel OPS forcé — à jouer',
      link: `/challenges?game=${encodeURIComponent(game)}`,
      game,
      refId: challenge.id,
    });
  } else {
    emit([opponentLogin], { type: 'challenge:received', payload: challenge });
    void notify(opponentLogin, {
      type: 'challenge_received',
      title: `@${me} t'a défié`,
      body: 'Un nouveau défi t\'attend',
      link: `/challenges?game=${encodeURIComponent(game)}`,
      game,
      refId: challenge.id,
    });
  }
  return c.json(challenge, 201);
});

app.post('/challenges/:id/accept', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const challenge = await prisma.$transaction(async (tx) => {
    const ch = await tx.challenge.findUnique({ where: { id } });
    if (!ch) throw new HTTPException(404, { message: 'challenge not found' });

    // ── 2v2 : seuls les DEUX adversaires acceptent ; 'accepted' quand les deux. ──
    if (ch.mode === '2v2') {
      if (me !== ch.opponentLogin && me !== ch.opponentPartnerLogin) {
        throw new HTTPException(403, { message: 'only the opponents can accept' });
      }
      if (ch.status === 'accepted') return ch; // idempotent
      if (ch.status !== 'pending') {
        throw new HTTPException(409, { message: `challenge is ${ch.status}` });
      }
      const oppAccepted = me === ch.opponentLogin ? new Date() : ch.opponentAcceptedAt;
      const oppPartnerAccepted =
        me === ch.opponentPartnerLogin ? new Date() : ch.opponentPartnerAcceptedAt;
      const bothAccepted = !!oppAccepted && !!oppPartnerAccepted;
      return tx.challenge.update({
        where: { id },
        data: {
          opponentAcceptedAt: oppAccepted,
          opponentPartnerAcceptedAt: oppPartnerAccepted,
          ...(bothAccepted ? { status: 'accepted', decidedAt: new Date() } : {}),
        },
      });
    }

    if (ch.opponentLogin !== me) {
      throw new HTTPException(403, { message: 'only the opponent can accept' });
    }
    // Idempotent : ré-accepter un défi DÉJÀ accepté (double-clic, course, UI en
    // retard sur mobile) renvoie simplement le défi, pas un 409. On ne lève le
    // 409 que pour les transitions vraiment invalides (refusé/annulé/expiré).
    if (ch.status === 'accepted') return ch;
    if (ch.status !== 'pending') {
      throw new HTTPException(409, { message: `challenge is ${ch.status}` });
    }
    return tx.challenge.update({
      where: { id },
      data: { status: 'accepted', decidedAt: new Date() },
    });
  });
  // Tous les participants doivent rafraîchir leur liste de défis (4 en 2v2).
  const acceptRecipients =
    challenge.mode === '2v2'
      ? ([
          challenge.challengerLogin,
          challenge.opponentLogin,
          challenge.partnerLogin,
          challenge.opponentPartnerLogin,
        ].filter(Boolean) as string[])
      : [challenge.challengerLogin, challenge.opponentLogin];
  emit(acceptRecipients, {
    type: 'challenge:accepted',
    payload: challenge,
  });
  // Le défi est traité → notif cloche « duel reçu » soldée pour qui accepte.
  void markNotifsReadByRef(me, challenge.id);
  // L'initiateur (+ son coéquipier en 2v2) est prévenu en cloche que le duel est prêt.
  const acceptedTargets = (
    challenge.mode === '2v2'
      ? [challenge.challengerLogin, challenge.partnerLogin]
      : [challenge.challengerLogin]
  ).filter((l) => l && l !== me) as string[];
  void notifyMany(acceptedTargets, {
    type: 'challenge_accepted',
    title: `@${me} a accepté ton défi`,
    body: 'Le duel est prêt à être joué.',
    link: `/challenges?game=${encodeURIComponent(challenge.game)}`,
    game: challenge.game,
    refId: `${challenge.id}:accepted`,
  });
  return c.json(challenge);
});

const DODGE_ELO_PENALTY = 10;

// Décompose un défi par rapport à un login : tous les participants, son équipe et
// l'équipe adverse. En 1v1 chaque « équipe » est un singleton ; en 2v2 elle compte
// le joueur et son coéquipier. Sert à l'annulation à l'amiable (l'équipe adverse au
// demandeur doit accepter au complet pour valider sans perte d'ELO).
function challengeSides(
  ch: {
    mode: string | null;
    challengerLogin: string;
    opponentLogin: string;
    partnerLogin: string | null;
    opponentPartnerLogin: string | null;
  },
  login: string,
): { participants: string[]; myTeam: string[]; otherTeam: string[] } {
  if (ch.mode === '2v2') {
    const challengerSide = [ch.challengerLogin, ch.partnerLogin].filter(Boolean) as string[];
    const opponentSide = [ch.opponentLogin, ch.opponentPartnerLogin].filter(Boolean) as string[];
    const onChallengerSide = challengerSide.includes(login);
    return {
      participants: [...challengerSide, ...opponentSide],
      myTeam: onChallengerSide ? challengerSide : opponentSide,
      otherTeam: onChallengerSide ? opponentSide : challengerSide,
    };
  }
  const participants = [ch.challengerLogin, ch.opponentLogin];
  return {
    participants,
    myTeam: [login],
    otherTeam: participants.filter((p) => p !== login),
  };
}

// ─── Annulation à l'amiable d'un défi accepté ────────────────────────────────
// Un participant qui veut se retirer d'un défi ACCEPTÉ peut, plutôt que de fuir
// (decline → pénalité d'ELO), proposer une annulation à l'amiable. Si toute
// l'équipe adverse accepte, le défi passe 'cancelled' sans perte d'ELO. En cas
// de refus, la demande est effacée et le défi reste jouable (le demandeur peut
// alors fuir s'il le souhaite).
app.post('/challenges/:id/cancel-request', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const result = await prisma.$transaction(async (tx) => {
    const ch = await tx.challenge.findUnique({ where: { id } });
    if (!ch) throw new HTTPException(404, { message: 'challenge not found' });
    const { participants, otherTeam } = challengeSides(ch, me);
    if (!participants.includes(me)) {
      throw new HTTPException(403, { message: 'not a participant' });
    }
    // Seul un défi accepté expose une pénalité ; l'amiable n'a de sens que là.
    if (ch.status !== 'accepted') {
      throw new HTTPException(409, { message: `challenge is ${ch.status}` });
    }
    if (ch.cancelRequestBy) {
      throw new HTTPException(409, { message: 'cancel already requested' });
    }
    await tx.challenge.update({
      where: { id },
      data: { cancelRequestBy: me, cancelRequestAt: new Date(), cancelAcceptedBy: null },
    });
    return { game: ch.game, otherTeam, participants };
  });
  emit(result.otherTeam, { type: 'challenge:cancel_requested', payload: { id, requestedBy: me } });
  void notifyMany(result.otherTeam, {
    type: 'challenge_cancel_requested',
    title: `@${me} demande à annuler le défi`,
    body: "Accepte pour annuler sans perte d'ELO.",
    link: `/challenges?game=${encodeURIComponent(result.game)}`,
    game: result.game,
    refId: `${id}:cancelreq`,
  });
  return c.json({ id, status: 'cancel_requested' });
});

app.post('/challenges/:id/cancel-accept', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const result = await prisma.$transaction(async (tx) => {
    const ch = await tx.challenge.findUnique({ where: { id } });
    if (!ch) throw new HTTPException(404, { message: 'challenge not found' });
    if (ch.status !== 'accepted' || !ch.cancelRequestBy) {
      throw new HTTPException(409, { message: 'no active cancel request' });
    }
    // L'équipe adverse AU DEMANDEUR (pas à moi) est celle qui doit accepter.
    const { participants, otherTeam: requesterOtherTeam } = challengeSides(ch, ch.cancelRequestBy);
    if (!requesterOtherTeam.includes(me)) {
      throw new HTTPException(403, { message: 'only the opposing team can accept' });
    }
    const accepted = new Set((ch.cancelAcceptedBy ?? '').split(',').filter(Boolean));
    accepted.add(me);
    const allAccepted = requesterOtherTeam.every((p) => accepted.has(p));
    await tx.challenge.update({
      where: { id },
      data: allAccepted
        ? { status: 'cancelled', decidedAt: new Date(), cancelAcceptedBy: [...accepted].join(',') }
        : { cancelAcceptedBy: [...accepted].join(',') },
    });
    // Duel d'ops annulé à l'amiable → remboursement de ses paris.
    const opsRefunded =
      allAccepted && ch.opsId
        ? await refundBetsTx(tx, { targetType: 'ops', challengeId: id })
        : [];
    return { finalized: allAccepted, game: ch.game, requestedBy: ch.cancelRequestBy, participants, opsRefunded };
  });
  if (result.opsRefunded.length) {
    emit([...new Set(result.opsRefunded)], { type: 'panel:update', payload: {} });
  }
  if (result.finalized) {
    const recipients = result.participants.filter((p) => p !== me);
    emit(recipients, { type: 'challenge:cancelled', payload: { id, by: me } });
    void markNotifsReadByRef(me, `${id}:cancelreq`);
    void notifyMany(recipients, {
      type: 'challenge_cancelled_amicable',
      title: 'Défi annulé à l’amiable',
      body: "Aucune perte d'ELO.",
      link: `/challenges?game=${encodeURIComponent(result.game)}`,
      game: result.game,
      refId: `${id}:cancelled`,
    });
  } else {
    // 2v2 : un adversaire a accepté, on attend encore l'autre.
    emit([result.requestedBy], { type: 'challenge:cancel_requested', payload: { id, partial: true } });
  }
  return c.json({ id, status: result.finalized ? 'cancelled' : 'cancel_waiting' });
});

app.post('/challenges/:id/cancel-refuse', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const result = await prisma.$transaction(async (tx) => {
    const ch = await tx.challenge.findUnique({ where: { id } });
    if (!ch) throw new HTTPException(404, { message: 'challenge not found' });
    if (ch.status !== 'accepted' || !ch.cancelRequestBy) {
      throw new HTTPException(409, { message: 'no active cancel request' });
    }
    const { participants, otherTeam: requesterOtherTeam } = challengeSides(ch, ch.cancelRequestBy);
    if (!requesterOtherTeam.includes(me)) {
      throw new HTTPException(403, { message: 'only the opposing team can refuse' });
    }
    const requestedBy = ch.cancelRequestBy;
    // Refus → on efface la demande ; le défi reste 'accepted' et jouable.
    await tx.challenge.update({
      where: { id },
      data: { cancelRequestBy: null, cancelRequestAt: null, cancelAcceptedBy: null },
    });
    return { game: ch.game, requestedBy, participants };
  });
  void markNotifsReadByRef(me, `${id}:cancelreq`);
  emit([result.requestedBy], { type: 'challenge:cancel_refused', payload: { id, refusedBy: me } });
  void notifyMany([result.requestedBy], {
    type: 'challenge_cancel_refused',
    title: `@${me} a refusé l’annulation`,
    body: "Le défi reste à jouer — ou fuis (perte d'ELO).",
    link: `/challenges?game=${encodeURIComponent(result.game)}`,
    game: result.game,
    refId: `${id}:cancelrefused`,
  });
  return c.json({ id, status: 'accepted' });
});

app.post('/challenges/:id/decline', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const result = await prisma.$transaction(async (tx) => {
    const ch = await tx.challenge.findUnique({ where: { id } });
    if (!ch) throw new HTTPException(404, { message: 'challenge not found' });
    // 2v2 : les 4 participants peuvent refuser/annuler. 1v1 : challenger ou opponent.
    const participants =
      ch.mode === '2v2'
        ? [ch.challengerLogin, ch.opponentLogin, ch.partnerLogin, ch.opponentPartnerLogin].filter(
            Boolean,
          )
        : [ch.challengerLogin, ch.opponentLogin];
    if (!participants.includes(me)) {
      throw new HTTPException(403, {
        message: 'only challenger (cancel) or opponent (decline) can do this',
      });
    }
    if (ch.status !== 'pending' && ch.status !== 'accepted') {
      throw new HTTPException(409, { message: `challenge is ${ch.status}` });
    }
    const wasAccepted = ch.status === 'accepted';
    // Équipe du challenger (lui + son coéquipier) qui se retire → 'cancelled' ;
    // l'équipe adverse qui refuse → 'declined'. OPS = 1v1 uniquement.
    const isChallengerSide = me === ch.challengerLogin || me === ch.partnerLogin;
    const isOpponentDeclining = ch.mode !== '2v2' && ch.opponentLogin === me;
    const newStatus = isChallengerSide ? 'cancelled' : 'declined';
    await tx.challenge.update({
      where: { id },
      data: { status: newStatus, decidedAt: new Date() },
    });

    // Duel d'ops refusé/annulé → il ne sera jamais joué : on rembourse ses paris.
    const opsRefunded = ch.opsId
      ? await refundBetsTx(tx, { targetType: 'ops', challengeId: id })
      : [];

    // ─── OPS : refus d'un match forcé ─────────────────────────────────────
    // Si la cible (me) refuse un défi de SON traqueur (le challenger) pendant
    // l'OPS actif, et que le quota de 3 matchs forcés n'est pas épuisé, la
    // pénalité est de 3× l'ELO qu'une défaite « normale » aurait coûté — bien
    // plus salée qu'un simple dodge. Vaut même pour un défi seulement "pending".
    let opsPenalty = 0;
    if (isOpponentDeclining) {
      const activeOps = await tx.ops.findFirst({
        where: {
          ownerLogin: ch.challengerLogin,
          targetLogin: me,
          expiresAt: { gt: new Date() },
        },
      });
      if (activeOps && activeOps.forcedUsed < OPS_FORCED_MATCHES) {
        const [target, hunter] = await Promise.all([
          tx.user.findUniqueOrThrow({ where: { login: me } }),
          tx.user.findUniqueOrThrow({ where: { login: ch.challengerLogin } }),
        ]);
        opsPenalty = OPS_REFUSE_MULTIPLIER * estimatedEloLoss(target.elo, hunter.elo);
        // 3ᵉ défi consommé (ici par un refus) → l'ops se termine (endedAt).
        const willEnd = activeOps.forcedUsed + 1 >= OPS_FORCED_MATCHES;
        await tx.ops.update({
          where: { id: activeOps.id },
          data: { forcedUsed: { increment: 1 }, ...(willEnd ? { endedAt: new Date() } : {}) },
        });
      }
    }

    let penalty = 0;
    if (opsPenalty > 0) {
      penalty = opsPenalty;
      await tx.user.update({
        where: { login: me },
        data: {
          elo: { decrement: penalty },
          dodgeCount: { increment: 1 },
        },
      });
    } else if (wasAccepted) {
      penalty = DODGE_ELO_PENALTY;
      await tx.user.update({
        where: { login: me },
        data: {
          elo: { decrement: penalty },
          dodgeCount: { increment: 1 },
        },
      });
    }
    return {
      status: newStatus,
      penalty,
      isOps: opsPenalty > 0,
      game: ch.game,
      challengerLogin: ch.challengerLogin,
      opponentLogin: ch.opponentLogin,
      // Tous les participants (4 en 2v2) à prévenir, hormis celui qui refuse.
      participants: participants as string[],
      opsRefunded,
    };
  });
  // Parieurs du duel remboursés (défi forcé refusé/annulé) → solde rafraîchi.
  if (result.opsRefunded.length) {
    emit([...new Set(result.opsRefunded)], { type: 'panel:update', payload: {} });
  }
  const declineRecipients = result.participants.filter((p) => p !== me);
  emit(declineRecipients, {
    type: 'challenge:declined',
    payload: { id, status: result.status, eloPenalty: result.penalty, declinedBy: me },
  });
  // Le défi est traité → notif cloche « duel reçu » soldée pour qui refuse.
  void markNotifsReadByRef(me, id);
  // L'autre camp est prévenu en cloche du refus / de l'annulation.
  void notifyMany(declineRecipients, {
    type: 'challenge_declined',
    title: result.status === 'declined' ? `@${me} a refusé ton défi` : `@${me} a annulé le défi`,
    body: result.penalty > 0 ? 'Pénalité ELO appliquée.' : 'Défi clos.',
    link: `/challenges?game=${encodeURIComponent(result.game)}`,
    game: result.game,
    refId: `${id}:declined`,
  });
  // Se désister d'un défi accepté applique une pénalité d'ELO → classement global.
  if (result.penalty > 0) {
    broadcast({ type: 'leaderboard:update', payload: {} });
  }
  // Refus d'un match forcé en OPS (1v1 uniquement) : le compteur forcedUsed a
  // bougé → les deux joueurs concernés doivent rafraîchir leur état OPS.
  if (result.isOps) {
    const otherParty =
      result.challengerLogin === me ? result.opponentLogin : result.challengerLogin;
    emit([me, otherParty], { type: 'ops:update', payload: { reason: 'forced_refused' } });
  }
  return c.json({ id, status: result.status, eloPenalty: result.penalty, isOps: result.isOps });
});

app.post('/challenges/:id/record', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = RecordResultSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { scoreSelf, scoreOpponent, bestOf, charSelf, charOpponent, stocks } = parsed.data;

  const pending = await prisma.$transaction(async (tx) => {
    const ch = await tx.challenge.findUnique({ where: { id } });
    if (!ch) throw new HTTPException(404, { message: 'challenge not found' });
    if (ch.status !== 'accepted') {
      throw new HTTPException(409, {
        message: 'challenge must be accepted before recording a result',
      });
    }

    // ── 2v2 : on crée un PendingMatch équipe orienté côté du recordeur. ──
    if (ch.mode === '2v2') {
      const challengerTeam = [ch.challengerLogin, ch.partnerLogin as string];
      const opponentTeam = [ch.opponentLogin, ch.opponentPartnerLogin as string];
      const iAmChallengerSide = challengerTeam.includes(me);
      if (!iAmChallengerSide && !opponentTeam.includes(me)) {
        throw new HTTPException(403, { message: 'not a participant' });
      }
      const myTeam = iAmChallengerSide ? challengerTeam : opponentTeam;
      const oppTeam = iAmChallengerSide ? opponentTeam : challengerTeam;
      const myTeammate = myTeam.find((l) => l !== me) as string;
      // Score babyfoot validé (un camp atteint 10) via RecordResultSchema babyfoot.
      const checked2v2 = RecordResultSchema.safeParse({ ...parsed.data, game: 'babyfoot' });
      if (!checked2v2.success) {
        throw new HTTPException(400, { message: `Score 2v2 invalide : ${checked2v2.error.message}` });
      }
      await tx.challenge.update({ where: { id }, data: { status: 'recorded' } });
      return tx.pendingMatch.create({
        data: {
          id: randomUUID(),
          declarerLogin: me,
          opponentLogin: oppTeam[0] as string,
          partner1Login: myTeammate,
          partner2Login: oppTeam[1] as string,
          scoreDeclarer: scoreSelf,
          scoreOpponent,
          game: 'babyfoot',
          mode: '2v2',
        },
      });
    }

    if (ch.challengerLogin !== me && ch.opponentLogin !== me) {
      throw new HTTPException(403, { message: 'not a participant' });
    }
    const opponentOfMe =
      ch.challengerLogin === me ? ch.opponentLogin : ch.challengerLogin;
    // Défense : on revalide le résultat selon la discipline RÉELLE du défi
    // (et non le `game` du client, qui peut être absent → défaut babyfoot).
    // Sans ça, un défi d'échecs/smash pouvait être stocké avec un score
    // babyfoot 10-0 (la cause du « 10-0 aux échecs »).
    const checked = RecordResultSchema.safeParse({ ...parsed.data, game: ch.game });
    if (!checked.success) {
      throw new HTTPException(400, {
        message: `Score invalide pour ${ch.game} : ${checked.error.message}`,
      });
    }
    await tx.challenge.update({
      where: { id },
      data: { status: 'recorded' },
    });
    // Le jeu du match en attente est celui du défi (babyfoot / smash).
    return tx.pendingMatch.create({
      data: {
        id: randomUUID(),
        declarerLogin: me,
        opponentLogin: opponentOfMe,
        scoreDeclarer: scoreSelf,
        scoreOpponent,
        game: ch.game,
        bestOf: bestOf ?? null,
        charDeclarer: charSelf ?? null,
        charOpponent: charOpponent ?? null,
        stocks: stocks ?? null,
        // Duel d'ops : on porte le défi jusqu'au confirm pour régler ses paris.
        challengeId: ch.opsId ? ch.id : null,
      },
    });
  });
  // Le défi passe en "recorded" et un match en attente apparaît : les participants
  // (4 en 2v2) doivent rafraîchir leurs défis ET leurs matchs.
  const recordRecipients = (
    pending.mode === '2v2'
      ? [pending.declarerLogin, pending.opponentLogin, pending.partner1Login, pending.partner2Login]
      : [pending.declarerLogin, pending.opponentLogin]
  ).filter(Boolean) as string[];
  emit(recordRecipients, {
    type: 'challenge:recorded',
    payload: { pendingId: pending.id },
  });
  // Le défi est joué → notif cloche « duel reçu » soldée pour qui enregistre (utile
  // surtout pour un défi OPS forcé, qui n'a jamais transité par accept/decline).
  void markNotifsReadByRef(me, id);
  return c.json({ pendingId: pending.id, status: 'pending_confirmation' }, 201);
});

/* ============ TOURNAMENTS ============ */

// ── Tournois 2v2 : résolution des paires ────────────────────────────────────
// En 2v2, chaque entrée porte un « capitaine » (entry.login = le seed du bracket)
// et son coéquipier (entry.partnerLogin). Les matchs n'enregistrent que le login
// capitaine (playerALogin/playerBLogin) ; les deux membres d'un camp sont résolus
// via la table des entrées. En 1v1, partnerLogin est null → un seul membre.

type TxOrPrisma = Prisma.TransactionClient | typeof prisma;

/** Construit la table capitaine → coéquipier d'un tournoi (partenaires null en 1v1). */
async function tournamentPartnerMap(
  tx: TxOrPrisma,
  tournamentId: string,
): Promise<Map<string, string | null>> {
  const entries = await tx.tournamentEntry.findMany({
    where: { tournamentId },
    select: { login: true, partnerLogin: true },
  });
  return new Map(entries.map((e) => [e.login, e.partnerLogin]));
}

/** Membres d'un camp (1 ou 2 logins) à partir du login capitaine. */
function teamMembersOf(captain: string | null, partners: Map<string, string | null>): string[] {
  if (!captain) return [];
  const partner = partners.get(captain) ?? null;
  return partner ? [captain, partner] : [captain];
}

/** Un login est-il déjà engagé (capitaine OU coéquipier) dans ces entrées ? */
function loginEngaged(
  entries: ReadonlyArray<{ login: string; partnerLogin: string | null }>,
  login: string,
): boolean {
  return entries.some((e) => e.login === login || e.partnerLogin === login);
}

/** Vérifie qu'un login est un vrai joueur 42 disponible (inscription 2v2). Lève sinon. */
async function assertRegisterablePartner(tx: TxOrPrisma, login: string): Promise<void> {
  const u = await tx.user.findUnique({ where: { login } });
  if (!u) throw new HTTPException(404, { message: `${login} doit se connecter au moins une fois` });
  if (!u.ftId) throw new HTTPException(403, { message: `${login} doit être un vrai joueur 42` });
  if (u.bannedAt || u.anonymizedAt || u.deletionScheduledAt) {
    throw new HTTPException(403, { message: `${login} n'est plus disponible` });
  }
}

// Ordonnance « méthode du cercle » : produit toutes les paires du round-robin
// RANGÉES PAR JOURNÉE. À chaque journée, tout le monde joue une fois (un joueur se
// repose si l'effectif est impair). Conséquence : les affiches sont ENTRELACÉES —
// on ne voit plus les 5 matchs d'un même joueur à la suite, chacun joue à son tour,
// et le « prochain match » tombe naturellement sur ceux qui n'ont pas joué depuis
// le plus longtemps. Le sens domicile/extérieur (A/B) alterne d'une journée à
// l'autre pour l'équité. Renvoie les paires dans l'ordre de programmation.
function leagueRoundRobinPairs(logins: string[]): Array<[string, string]> {
  if (logins.length < 2) return [];
  const arr = [...logins];
  const bye = arr.length % 2 === 1;
  if (bye) arr.push('__BYE__');
  const n = arr.length;
  const half = n / 2;
  const out: Array<[string, string]> = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i]!;
      const b = arr[n - 1 - i]!;
      if (a === '__BYE__' || b === '__BYE__') continue;
      out.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    // Rotation : on fige arr[0], le reste tourne d'un cran (dernier → 2e position).
    const fixed = arr[0]!;
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr.splice(0, arr.length, fixed, ...rest);
  }
  return out;
}

// Crée toutes les affiches ALLER manquantes d'un round-robin de ligue (chaque paire
// d'équipes s'affronte une fois). Idempotent : ne recrée jamais une paire déjà
// composée (peu importe le sens A/B ou la manche). En 2v2, `logins` = capitaines
// (chaque entrée est une équipe distincte → un capitaine n'affronte jamais son
// binôme, qui n'est pas un login d'entrée). Renvoie le nombre d'affiches créées.
async function ensureLeagueRoundRobin(
  tx: TxOrPrisma,
  tournamentId: string,
  logins: string[],
): Promise<number> {
  const existing = await tx.tournamentMatch.findMany({
    where: { tournamentId, stage: 'league' },
    select: { playerALogin: true, playerBLogin: true },
  });
  // Clé non-ordonnée d'une paire déjà composée (toutes manches confondues).
  const pairKey = (a: string, b: string) => [a, b].sort().join(' ');
  const seen = new Set(
    existing
      .filter((m) => m.playerALogin && m.playerBLogin)
      .map((m) => pairKey(m.playerALogin!, m.playerBLogin!)),
  );
  const agg = await tx.tournamentMatch.aggregate({
    where: { tournamentId, round: 0 },
    _max: { slot: true },
  });
  let slot = (agg._max.slot ?? -1) + 1;
  const data: Array<{
    id: string;
    tournamentId: string;
    stage: string;
    poolIndex: number;
    round: number;
    slot: number;
    playerALogin: string;
    playerBLogin: string;
  }> = [];
  // Paires rangées par journée (entrelacées) plutôt que joueur par joueur.
  for (const [a, b] of leagueRoundRobinPairs(logins)) {
    if (seen.has(pairKey(a, b))) continue;
    data.push({
      id: randomUUID(),
      tournamentId,
      stage: 'league',
      poolIndex: 0,
      round: 0,
      slot: slot++,
      playerALogin: a,
      playerBLogin: b,
    });
  }
  if (data.length) await tx.tournamentMatch.createMany({ data });
  return data.length;
}

// Génère les matchs au démarrage : phase de poules (format 'pools'), bracket à
// élimination directe (format 'elimination', byes inclus si nécessaire) ou, pour la
// ligue, le round-robin complet des affiches ALLER (proposées d'office ; l'admin
// peut en supprimer / en composer d'autres, et déclencher les retours à la main).
async function launchTournamentMatches(
  tournamentId: string,
  format: string,
  logins: string[],
): Promise<void> {
  if (format === 'league') {
    await ensureLeagueRoundRobin(prisma, tournamentId, logins);
    return;
  }
  if (format === 'pools') await generatePools(tournamentId, logins);
  else await generateBracket(tournamentId, logins);
}

// Propagation post-confirmation d'un match de tournoi, PARTAGÉE entre la
// confirmation normale (route /confirm) et le forçage admin (/force-result).
// Pré-requis : `m.winnerLogin`/`m.confirmedAt` viennent d'être posés par l'appelant
// (avec le score validé). Ici : règlement des paris du match, puis selon le stage
// → génération du bracket (poules terminées) ou avancement du gagnant (bracket),
// finale → tournoi terminé + titre + récompense + paris du tournoi.
// Renvoie le même objet de résultat que la route confirm (emits/notifs APRÈS commit).
/**
 * Crédite le bonus d'Elo de fin de tournoi PAR PLACEMENT : 1er +100, 2e +75,
 * 3e +50, 4e +25 (cf. TOURNAMENT_ELO_PLACEMENTS — identique amical/officiel).
 * Les placements se déduisent du bracket (3e = demi-finaliste battu par le
 * champion, convention sans petite finale, cf. tournamentPlacements). En 2v2,
 * CHAQUE membre de l'équipe touche le montant plein. Appelé une seule fois, au
 * settlement de la finale.
 */
async function awardTournamentElo(
  tx: Prisma.TransactionClient,
  id: string,
  game: GameId,
): Promise<void> {
  const bracket = await tx.tournamentMatch.findMany({
    where: { tournamentId: id, stage: 'bracket' },
    select: { round: true, playerALogin: true, playerBLogin: true, winnerLogin: true },
  });
  const placements = tournamentPlacements(bracket);
  for (let i = 0; i < placements.length; i++) {
    const captain = placements[i];
    if (!captain) continue;
    const reward = tournamentEloForPlacement(i + 1);
    if (reward <= 0) continue;
    const entry = await tx.tournamentEntry.findUnique({
      where: { tournamentId_login: { tournamentId: id, login: captain } },
      select: { partnerLogin: true },
    });
    const members = entry?.partnerLogin ? [captain, entry.partnerLogin] : [captain];
    for (const login of members) {
      await tx.user.update({ where: { login }, data: eloDelta(game, reward) });
    }
  }
}

async function settleConfirmedTournamentMatch(
  tx: Prisma.TransactionClient,
  id: string,
  m: {
    id: string;
    stage: string;
    round: number;
    slot: number;
    winnerLogin: string | null;
    playerALogin: string | null;
    playerBLogin: string | null;
  },
): Promise<{
  winnerLogin: string | null;
  winners: string[];
  finished: boolean;
  prizeAwarded: boolean;
  bracketGenerated: boolean;
  betWinners: string[];
}> {
  const winnerLogin = m.winnerLogin;
  // Vainqueurs du tournoi (rempli à la finale) : capitaine seul ou paire en 2v2.
  // Nul en ligue → aucun vainqueur (liste vide).
  let winners: string[] = winnerLogin ? [winnerLogin] : [];
  // Le duel désigné « match suivant » est terminé → on efface le pointeur
  // (sinon l'arbre garderait le badge « EN COURS » sur un match déjà joué).
  await tx.tournament.updateMany({
    where: { id, activeMatchId: m.id },
    data: { activeMatchId: null },
  });
  // Règlement des paris placés sur CE match (cote fixe ×2). `betWinners`
  // accumule les parieurs crédités (match + plus bas la finale) pour un emit
  // après commit. (On règle par l'id du MATCH, pas du tournoi.)
  const betWinners = await settleMatchBetsTx(tx, m.id, winnerLogin);

  // Match de phase de ligue : aucune propagation ni qualification automatique. Le
  // classement (goal average) est recalculé à l'affichage et la bascule en
  // élimination directe est déclenchée manuellement par l'admin (route
  // /league/finalize). On règle juste les paris du match (fait ci-dessus).
  if (m.stage === 'league') {
    return { winnerLogin, winners, finished: false, prizeAwarded: false, bracketGenerated: false, betWinners };
  }

  // Match de poule : pas de propagation. Quand toutes les poules sont terminées,
  // on génère le bracket des qualifiés (top 2 par poule, seeding croisé).
  if (m.stage === 'pool') {
    const remaining = await tx.tournamentMatch.count({
      where: { tournamentId: id, stage: 'pool', confirmedAt: null },
    });
    let bracketGenerated = false;
    if (remaining === 0) {
      const poolMatches = await tx.tournamentMatch.findMany({
        where: { tournamentId: id, stage: 'pool' },
        select: {
          poolIndex: true,
          playerALogin: true,
          playerBLogin: true,
          scoreA: true,
          scoreB: true,
          winnerLogin: true,
        },
      });
      const qualifiers = qualifiersFromPools(poolMatches);
      await generateBracket(id, qualifiers, { preSeeded: true });
      bracketGenerated = true;
      // Paris progressifs : les pronostics éliminés en poules (non qualifiés)
      // n'ont franchi aucun tour de bracket → perdus (mise non rendue). Sans ça,
      // leurs paris resteraient « open » à jamais (ils n'apparaîtront jamais
      // comme perdant d'un match de bracket).
      const qualSet = new Set(qualifiers);
      const allEntries = await tx.tournamentEntry.findMany({
        where: { tournamentId: id },
        select: { login: true },
      });
      for (const e of allEntries) {
        if (!qualSet.has(e.login)) {
          await settleTournamentBetsForPick(tx, id, e.login, 0, 1, DEFAULT_BET_FINAL_MULT);
        }
      }
    }
    return { winnerLogin, winners, finished: false, prizeAwarded: false, bracketGenerated, betWinners };
  }

  // En bracket, un nul est impossible (refusé à la validation) → winnerLogin défini.
  if (winnerLogin === null) {
    return { winnerLogin, winners, finished: false, prizeAwarded: false, bracketGenerated: false, betWinners };
  }

  // Match de bracket : propage le gagnant. Le nombre de rounds est calculé depuis
  // les matchs réels (byes / poules font diverger taille du bracket et capacité).
  const agg = await tx.tournamentMatch.aggregate({
    where: { tournamentId: id, stage: 'bracket' },
    _max: { round: true },
  });
  const totalBracketRounds = agg._max.round ?? 1;

  // ── Économie progressive (paris + cash-prize) ───────────────────────────────
  // Réglages du tournoi : multiplicateur final du pari + base du cash-prize.
  const econ = await tx.tournament.findUnique({
    where: { id },
    select: { kind: true, betFinalMult: true, cashPrizeBase: true },
  });
  const finalMult = econ?.betFinalMult ?? DEFAULT_BET_FINAL_MULT;
  const cashBase = econ?.kind === 'official' && econ.cashPrizeBase ? econ.cashPrizeBase : 0;
  const partners = await tournamentPartnerMap(tx, id);

  // Le PERDANT de ce match est éliminé en ayant franchi (round − 1) tours.
  // → règle ses paris au prorata (0 tour = perdu) et lui verse son palier de
  //   cash-prize (les deux coéquipiers en 2v2).
  const loserLogin = winnerLogin === m.playerALogin ? m.playerBLogin : m.playerALogin;
  const roundsWonLoser = m.round - 1;
  if (loserLogin) {
    betWinners.push(
      ...(await settleTournamentBetsForPick(tx, id, loserLogin, roundsWonLoser, totalBracketRounds, finalMult)),
    );
    if (cashBase > 0) {
      await payCashPrizeTx(tx, teamMembersOf(loserLogin, partners), roundsWonLoser, totalBracketRounds, cashBase);
    }
  }

  const adv = await advanceWinner(id, m.round, m.slot, winnerLogin, totalBracketRounds);
  let finished = false;
  let prizeAwarded = false;
  if (adv.isFinal) {
    const tour = await tx.tournament.update({
      where: { id },
      data: {
        status: 'finished',
        finishedAt: new Date(),
        winnerLogin,
      },
      select: { game: true, format: true, kind: true, prizeKind: true, prizeCoins: true, prizeItemId: true },
    });
    // Bonus d'Elo de fin de tournoi PAR PLACEMENT (1er +100, 2e +75, 3e +50,
    // 4e +25 — chaque membre en 2v2). Indépendant des coins/cosmétiques.
    await awardTournamentElo(tx, id, parseGameId(tour.game));
    // Membres de l'équipe gagnante : capitaine seul (1v1) ou + coéquipier (2v2).
    const winEntry = await tx.tournamentEntry.findUnique({
      where: { tournamentId_login: { tournamentId: id, login: winnerLogin } },
      select: { partnerLogin: true },
    });
    winners = winEntry?.partnerLogin ? [winnerLogin, winEntry.partnerLogin] : [winnerLogin];
    // Crédite le compteur de titres (selon la discipline) pour chaque vainqueur.
    for (const w of winners) {
      await tx.user.update({
        where: { login: w },
        data: tournamentsWonDelta(parseGameId(tour.game), 1),
      });
    }
    // Récompense (tournois officiels) — versée à CHAQUE membre de l'équipe gagnante.
    // Cosmétique → inventaire SANS auto-équipement.
    if (tour.kind === 'official' && tour.prizeKind === 'coins' && tour.prizeCoins) {
      for (const w of winners)
        await grantCoinsTx(tx, w, tour.prizeCoins, {
          type: 'tournament_prize',
          meta: { kind: 'champion', game: tour.game },
        });
      prizeAwarded = true;
    } else if (tour.kind === 'official' && tour.prizeKind === 'cosmetic' && tour.prizeItemId) {
      for (const w of winners) await grantItemTx(tx, w, tour.prizeItemId, false);
      prizeAwarded = true;
    }
    // Paris : le CHAMPION a franchi tous les tours → gain au multiplicateur final.
    betWinners.push(
      ...(await settleTournamentBetsForPick(tx, id, winnerLogin, totalBracketRounds, totalBracketRounds, finalMult)),
    );
    // Cash-prize du champion (palier maximal = base) aux deux coéquipiers en 2v2.
    if (cashBase > 0) {
      await payCashPrizeTx(tx, winners, totalBracketRounds, totalBracketRounds, cashBase);
    }
    finished = true;
  }
  return { winnerLogin, winners, finished, prizeAwarded, bracketGenerated: false, betWinners };
}

app.get('/tournaments', async (c) => {
  const me = await getCurrentLogin(c);
  // Tournois filtrés par discipline (mode courant) : pas de partage entre modes.
  const game = parseGame(c.req.query('game'));
  const list = await prisma.tournament.findMany({
    where: { game },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      // teamName : permet d'afficher le DUO vainqueur (nom d'équipe) sur la carte 2v2.
      entries: { select: { login: true, partnerLogin: true, teamName: true } },
      winner: { select: { login: true, imageUrl: true } },
    },
  });
  const isParticipant = (t: (typeof list)[number]) =>
    t.createdByLogin === me ||
    t.entries.some((e) => e.login === me || e.partnerLogin === me);
  const visible = list.filter((t) => {
    // Tournoi privé : visible uniquement par son créateur, ses invités ou un admin.
    if (t.isPrivate && !isParticipant(t) && !isAdmin(me)) return false;
    // Historique amical : un tournoi amical terminé/annulé n'apparaît que pour ses
    // participants. Les officiels (et tout ce qui est encore vivant) restent publics.
    if (
      t.kind !== 'official' &&
      (t.status === 'finished' || t.status === 'cancelled') &&
      !isParticipant(t) &&
      !isAdmin(me)
    ) {
      return false;
    }
    return true;
  });
  return c.json(visible);
});

// Charge un tournoi mis en forme pour un spectateur (entries + coéquipiers résolus,
// invites filtrées selon le rôle), en appliquant la règle de visibilité des tournois
// privés. Lève une HTTPException 404 si introuvable ou non visible. Partagé par
// GET /tournaments/:id et GET /tournaments/:id/live.
async function loadTournamentForViewer(me: string, id: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: {
      entries: {
        include: {
          user: { select: { login: true, imageUrl: true, elo: true } },
        },
      },
      matches: {
        orderBy: [{ round: 'asc' }, { slot: 'asc' }],
      },
      winner: { select: { login: true, imageUrl: true } },
      // Cosmétique de récompense (officiels) — pour l'afficher sur la fiche.
      prizeItem: true,
      // Invitations : l'organisateur voit toutes les invitations en attente ;
      // un joueur invité voit uniquement la sienne.
      invites: {
        where: {
          OR: [
            { status: 'pending' },
            { inviteeLogin: me },
          ],
        },
        select: {
          id: true,
          inviteeLogin: true,
          inviterLogin: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });
  if (!tournament) {
    throw new HTTPException(404, { message: 'tournament not found' });
  }
  // Tournoi privé : accessible si créateur, inscrit (capitaine OU coéquipier en
  // 2v2), invité en attente, ou admin.
  const hasInvite = tournament.invites.some((inv) => inv.inviteeLogin === me);
  if (
    tournament.isPrivate &&
    !isTournamentManager(tournament, me) &&
    !isAdmin(me) &&
    !tournament.entries.some((e) => e.login === me || e.partnerLogin === me) &&
    !hasInvite
  ) {
    throw new HTTPException(404, { message: 'tournament not found' });
  }
  // 2v2 : résout les utilisateurs coéquipiers (avatar/elo) pour l'affichage des
  // paires, et les attache à chaque entrée sous `partner`.
  let entriesOut: Array<(typeof tournament.entries)[number] & {
    partner?: { login: string; imageUrl: string | null; elo: number } | null;
  }> = tournament.entries;
  if (tournament.mode === '2v2') {
    const partnerLogins = tournament.entries
      .map((e) => e.partnerLogin)
      .filter((l): l is string => !!l);
    const partnerUsers = partnerLogins.length
      ? await prisma.user.findMany({
          where: { login: { in: partnerLogins } },
          select: { login: true, imageUrl: true, elo: true },
        })
      : [];
    const byLogin = new Map(partnerUsers.map((u) => [u.login, u]));
    entriesOut = tournament.entries.map((e) => ({
      ...e,
      partner: e.partnerLogin ? byLogin.get(e.partnerLogin) ?? null : null,
    }));
  }
  // Filtrer les invites visibles selon le rôle :
  // l'organisateur et les admins voient tout ; les autres ne voient que leur propre invite.
  const isOrganizer = isTournamentManager(tournament, me) || isAdmin(me);
  const visibleInvites = isOrganizer
    ? tournament.invites
    : tournament.invites.filter((inv) => inv.inviteeLogin === me);
  return { ...tournament, entries: entriesOut, invites: visibleInvites };
}

app.get('/tournaments/:id', async (c) => {
  const me = await getCurrentLogin(c);
  const out = await loadTournamentForViewer(me, c.req.param('id'));
  return c.json(out);
});

// Variante « écran TV / live » : même charge utile que /:id, plus la cagnotte des
// paris « vainqueur du tournoi » agrégée par participant (betPool) → la page live en
// dérive la « HYPE » de chaque duel. Tous statuts confondus (un tournoi en cours a ses
// paris figés mais le volume engagé reste un bon proxy d'engouement).
app.get('/tournaments/:id/live', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const out = await loadTournamentForViewer(me, id);
  const grouped = await prisma.bet.groupBy({
    by: ['choiceLogin'],
    where: { tournamentId: id, targetType: 'tournament' },
    _sum: { stake: true },
  });
  const betPool: Record<string, number> = {};
  let betTotalCoins = 0;
  for (const b of grouped) {
    const s = b._sum.stake ?? 0;
    betPool[b.choiceLogin] = s;
    betTotalCoins += s;
  }
  // Liste des mises pour le bandeau défilant de l'écran TV (les plus récentes
  // d'abord, bornée). Les paris de tournoi sont publics au sein de la ligue (aspect
  // social/jeu) — on n'expose que login parieur + avatar + pronostic + mise.
  const betRows = await prisma.bet.findMany({
    where: { tournamentId: id, targetType: 'tournament' },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: {
      id: true,
      stake: true,
      status: true,
      choiceLogin: true,
      createdAt: true,
      bettor: { select: { login: true, imageUrl: true } },
    },
  });
  const bets = betRows.map((b) => ({
    id: b.id,
    bettor: b.bettor.login,
    bettorImageUrl: b.bettor.imageUrl,
    choice: b.choiceLogin,
    stake: b.stake,
    status: b.status,
    createdAt: b.createdAt,
  }));
  return c.json({ ...out, betPool, betTotalCoins, bets });
});

// Créateur OU co-organisateur d'un tournoi : les co-organisateurs disposent de TOUS
// les droits d'organisation, exactement comme le créateur. (Les admins restent gérés
// à part via isAdmin/isAdminLogin.) Nécessite que `coOrganizers` soit dans le select.
function isTournamentManager(
  t: { createdByLogin: string; coOrganizers?: string[] },
  me: string,
): boolean {
  return t.createdByLogin === me || (t.coOrganizers ?? []).includes(me);
}

app.post('/tournaments', async (c) => {
  const me = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => null);
  const parsed = CreateTournamentSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const d = parsed.data;
  if (d.kind === 'official' && !isAdmin(me)) {
    throw new HTTPException(403, {
      message: 'only admins can create official tournaments',
    });
  }
  // Récompense : réservée aux admins (le schéma impose déjà le tournoi officiel).
  if (d.prize.kind !== 'none' && !isAdmin(me)) {
    throw new HTTPException(403, { message: 'only admins can attach a prize' });
  }
  await getOrCreateUser(me);
  // L'organisateur ne s'inscrit que s'il a coché « je participe ». Créer un
  // tournoi ne l'oblige pas à y jouer.
  const selfJoin = d.selfJoin;
  // 2v2 : si l'organisateur participe, il engage sa paire. Le coéquipier doit
  // être un vrai joueur disponible, différent de lui. L'entrée stocke le
  // créateur en capitaine. (Pas de coéquipier requis s'il ne participe pas.)
  const partner = selfJoin && d.mode === '2v2' ? d.partnerLogin ?? null : null;
  if (selfJoin && d.mode === '2v2') {
    if (!partner || partner === me) {
      throw new HTTPException(400, { message: 'choisis un coéquipier différent de toi' });
    }
    await assertRegisterablePartner(prisma, partner);
  }
  // Réglages d'économie (officiels) : multiplicateur final du pari (défaut 2),
  // cash-prize du champion. Les amicaux restent à 2 / sans cash-prize.
  const betFinalMult = d.kind === 'official' && d.betFinalMult ? d.betFinalMult : 2;
  const cashPrizeBase = d.kind === 'official' && d.cashPrizeBase ? d.cashPrizeBase : null;
  // Transaction : un éventuel cosmétique custom est créé en même temps que le
  // tournoi (atomicité), et masqué de la boutique (active:false).
  const tournament = await prisma.$transaction(async (tx) => {
    let prizeKind = 'none';
    let prizeCoins: number | null = null;
    let prizeItemId: string | null = null;
    const prize = d.prize;
    if (prize.kind === 'coins') {
      prizeKind = 'coins';
      prizeCoins = prize.coins;
    } else if (prize.kind === 'existingItem') {
      const item = await tx.shopItem.findUnique({ where: { id: prize.itemId }, select: { id: true } });
      if (!item) throw new HTTPException(404, { message: 'cosmétique de récompense introuvable' });
      prizeKind = 'cosmetic';
      prizeItemId = item.id;
    } else if (prize.kind === 'newCosmetic') {
      const ck = prize.cosmetic;
      const created = await tx.shopItem.create({
        data: {
          name: ck.name,
          description: ck.description ?? null,
          category: ck.category,
          color: ck.color ?? null,
          rarity: ck.rarity ?? null,
          price: ck.price,
          payload: (ck.payload ?? PrismaRuntime.DbNull) as Prisma.InputJsonValue | typeof PrismaRuntime.DbNull,
          active: false, // exclusif au tournoi → jamais en boutique
          ...(ck.sortOrder !== undefined ? { sortOrder: ck.sortOrder } : {}),
        },
        select: { id: true },
      });
      prizeKind = 'cosmetic';
      prizeItemId = created.id;
    }
    return tx.tournament.create({
      data: {
        id: randomUUID(),
        name: d.name,
        kind: d.kind,
        isPrivate: d.private,
        imageUrl: d.imageUrl ?? null,
        capacity: d.capacity,
        mode: d.mode,
        format: d.format,
        game: d.game,
        status: 'registration',
        createdByLogin: me,
        prizeKind,
        prizeCoins,
        prizeItemId,
        betFinalMult,
        cashPrizeBase,
        // L'organisateur n'est inscrit que s'il a choisi de participer.
        ...(selfJoin ? { entries: { create: { login: me, partnerLogin: partner } } } : {}),
      },
      include: { entries: { select: { login: true, partnerLogin: true } }, prizeItem: true },
    });
  });
  return c.json(tournament, 201);
});

app.post('/tournaments/:id/join', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  await getOrCreateUser(me);
  // 2v2 : le joueur nomme son coéquipier dans le corps de la requête.
  const body = await c.req.json().catch(() => ({}));
  const partnerRaw = typeof (body as { partnerLogin?: unknown })?.partnerLogin === 'string'
    ? ((body as { partnerLogin: string }).partnerLogin).trim()
    : null;
  // 2v2 : nom d'équipe optionnel (borné à 40 car.).
  const teamNameRaw = typeof (body as { teamName?: unknown })?.teamName === 'string'
    ? ((body as { teamName: string }).teamName).trim().slice(0, 40) || null
    : null;
  const result = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({
      where: { id },
      include: { entries: true },
    });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });
    if (t.status !== 'registration') {
      throw new HTTPException(409, { message: `tournament is ${t.status}` });
    }
    // Tournoi privé : pas d'inscription libre, l'organisateur invite (add-player).
    if (t.isPrivate && !isTournamentManager(t, me) && !isAdmin(me)) {
      throw new HTTPException(403, { message: 'tournoi privé — sur invitation uniquement' });
    }
    // 2v2 : valider la paire (coéquipier réel, différent, tous deux libres).
    const partner = t.mode === '2v2' ? partnerRaw : null;
    if (t.mode === '2v2') {
      if (!partner || partner === me) {
        throw new HTTPException(400, { message: 'choisis un coéquipier différent de toi' });
      }
      await assertRegisterablePartner(tx, partner);
      if (loginEngaged(t.entries, partner)) {
        throw new HTTPException(409, { message: `${partner} est déjà engagé dans ce tournoi` });
      }
    }
    if (loginEngaged(t.entries, me)) {
      throw new HTTPException(409, { message: 'already registered' });
    }
    // Ligue : la capacité est une cible indicative, pas un plafond → on peut s'inscrire
    // au-delà du nombre déclaré. Les autres formats (bracket/poules) restent plafonnés.
    if (t.format !== 'league' && t.entries.length >= t.capacity) {
      throw new HTTPException(409, { message: 'tournament is full' });
    }
    await tx.tournamentEntry.create({
      data: {
        tournamentId: id,
        login: me,
        partnerLogin: partner,
        teamName: t.mode === '2v2' ? teamNameRaw : null,
      },
    });
    // Auto-démarrage quand le tournoi est plein — sauf en ligue, démarrée MANUELLEMENT
    // par l'organisateur (il compose les affiches au fil de l'eau).
    const newCount = t.entries.length + 1;
    if (t.format !== 'league' && newCount === t.capacity) {
      const logins = [...t.entries.map((e) => e.login), me];
      await launchTournamentMatches(id, t.format, logins);
      await tx.tournament.update({
        where: { id },
        data: { status: 'in_progress', startedAt: new Date() },
      });
      // Notifier tous les membres (capitaines + coéquipiers en 2v2).
      const everyone = [
        ...t.entries.flatMap((e) => (e.partnerLogin ? [e.login, e.partnerLogin] : [e.login])),
        ...(partner ? [me, partner] : [me]),
      ];
      void notifyMany(everyone, {
        type: 'tournament',
        title: `Tournoi "${t.name}" lancé`,
        body: 'Le bracket est généré — à toi de jouer !',
        link: `/tournaments/${id}`,
      });
      return { autoStarted: true };
    }
    return { autoStarted: false };
  });
  // Abonnés notifiés que ce joueur a rejoint un tournoi.
  void notifyFollowers(me, 'notifyTournament', {
    type: 'follow_tournament',
    title: `@${me} a rejoint un tournoi`,
    link: `/tournaments/${id}`,
    game: await tournamentGame(id),
  });
  return c.json({ id, status: result.autoStarted ? 'in_progress' : 'registration' });
});

// Inviter / ajouter directement un joueur existant à un tournoi (organisateur ou
// admin), pendant la phase d'inscription. Auto-démarre si le tournoi devient plein.
// `partnerLogin` requis uniquement pour les tournois 2v2 (l'orga ajoute une paire).
const AddTournamentPlayerSchema = z.object({
  login: z.string().trim().min(1),
  partnerLogin: z.string().trim().min(1).optional(),
  teamName: z.string().trim().max(40).optional(),
});

app.post('/tournaments/:id/add-player', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = AddTournamentPlayerSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const login = parsed.data.login;
  const partnerInput = parsed.data.partnerLogin ?? null;

  const result = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({ where: { id }, include: { entries: true } });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });
    if (!isTournamentManager(t, me) && !isAdmin(me)) {
      throw new HTTPException(403, {
        message: "seul l'organisateur ou un admin peut inviter des joueurs",
      });
    }
    if (t.status !== 'registration') {
      throw new HTTPException(409, { message: `tournament is ${t.status}` });
    }
    const target = await tx.user.findUnique({ where: { login } });
    if (!target || target.bannedAt || target.anonymizedAt || target.deletionScheduledAt) {
      throw new HTTPException(404, { message: `joueur introuvable : ${login}` });
    }
    // 2v2 : une paire est requise (capitaine + coéquipier valides et distincts).
    const partner = t.mode === '2v2' ? partnerInput : null;
    if (t.mode === '2v2') {
      if (!partner || partner === login) {
        throw new HTTPException(400, { message: 'un tournoi 2v2 requiert une paire (deux joueurs distincts)' });
      }
      await assertRegisterablePartner(tx, partner);
      if (loginEngaged(t.entries, partner)) {
        throw new HTTPException(409, { message: `${partner} est déjà engagé dans ce tournoi` });
      }
    }
    if (loginEngaged(t.entries, login)) {
      throw new HTTPException(409, { message: 'joueur déjà inscrit' });
    }
    // Ligue : pas de plafond (cible indicative) → l'orga peut ajouter au-delà du nombre déclaré.
    if (t.format !== 'league' && t.entries.length >= t.capacity) {
      throw new HTTPException(409, { message: 'tournoi complet' });
    }
    await tx.tournamentEntry.create({
      data: {
        tournamentId: id,
        login,
        partnerLogin: partner,
        teamName: t.mode === '2v2' ? (parsed.data.teamName ?? null) : null,
      },
    });
    // Ligue : pas d'auto-démarrage (lancement manuel par l'organisateur).
    const newCount = t.entries.length + 1;
    if (t.format !== 'league' && newCount === t.capacity) {
      const logins = [...t.entries.map((e) => e.login), login];
      await launchTournamentMatches(id, t.format, logins);
      await tx.tournament.update({
        where: { id },
        data: { status: 'in_progress', startedAt: new Date() },
      });
      const everyone = [
        ...t.entries.flatMap((e) => (e.partnerLogin ? [e.login, e.partnerLogin] : [e.login])),
        ...(partner ? [login, partner] : [login]),
      ];
      void notifyMany(everyone, {
        type: 'tournament',
        title: `Tournoi "${t.name}" lancé`,
        body: 'Le bracket est généré — à toi de jouer !',
        link: `/tournaments/${id}`,
      });
      return { autoStarted: true };
    }
    return { autoStarted: false };
  });

  emit([login], { type: 'leaderboard:update', payload: {} });
  void notifyFollowers(login, 'notifyTournament', {
    type: 'follow_tournament',
    title: `@${login} a rejoint un tournoi`,
    link: `/tournaments/${id}`,
    game: await tournamentGame(id),
  });
  return c.json({ id, added: login, status: result.autoStarted ? 'in_progress' : 'registration' });
});

/* ─── Invitations tournoi ─────────────────────────────────────────────────── */

// Envoie une invitation à un joueur (organisateur ou admin uniquement).
// La cible recevra une notification et pourra accepter / refuser.
app.post('/tournaments/:id/invite', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { login: inviteeLogin } = z.object({ login: z.string().trim().min(1) }).parse(body);

  const result = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({ where: { id }, include: { entries: true } });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });
    if (t.mode === '2v2') {
      throw new HTTPException(400, { message: 'tournoi 2v2 : pas d\'invitations — inscris directement une paire (ajouter une équipe)' });
    }
    if (!isTournamentManager(t, me) && !isAdmin(me)) {
      throw new HTTPException(403, { message: "seul l'organisateur ou un admin peut inviter" });
    }
    if (t.status !== 'registration') {
      throw new HTTPException(409, { message: `tournament is ${t.status}` });
    }
    const target = await tx.user.findUnique({ where: { login: inviteeLogin } });
    if (!target || target.bannedAt || target.anonymizedAt || target.deletionScheduledAt) {
      throw new HTTPException(404, { message: `joueur introuvable : ${inviteeLogin}` });
    }
    if (t.entries.some((e) => e.login === inviteeLogin)) {
      throw new HTTPException(409, { message: 'joueur déjà inscrit' });
    }
    // Ligue : capacité indicative, on peut inviter au-delà du nombre déclaré.
    if (t.format !== 'league' && t.entries.length >= t.capacity) {
      throw new HTTPException(409, { message: 'tournoi complet' });
    }
    // Idempotent : si une invitation est déjà en attente, on la renvoie.
    const existing = await tx.tournamentInvite.findUnique({
      where: { tournamentId_inviteeLogin: { tournamentId: id, inviteeLogin } },
    });
    if (existing) {
      if (existing.status === 'pending') return existing;
      // Re-inviter après un refus : on remet en pending.
      return tx.tournamentInvite.update({
        where: { id: existing.id },
        data: { status: 'pending', decidedAt: null },
      });
    }
    return tx.tournamentInvite.create({
      data: { id: randomUUID(), tournamentId: id, inviterLogin: me, inviteeLogin },
    });
  });

  const invTournament = await prisma.tournament.findUnique({
    where: { id },
    select: { name: true, game: true },
  });
  void notify(inviteeLogin, {
    type: 'tournament_invite',
    title: `Invitation au tournoi "${invTournament?.name}"`,
    body: `@${me} t'invite à rejoindre le tournoi`,
    link: `/tournaments/${id}`,
    game: invTournament?.game ?? undefined,
  });
  emit([inviteeLogin], { type: 'tournament:invite', payload: { tournamentId: id, inviteId: result.id } });
  return c.json(result, 201);
});

// Le joueur invité accepte → il est ajouté comme participant (auto-start si plein).
app.post('/tournaments/:id/invites/:inviteId/accept', async (c) => {
  const me = await getCurrentLogin(c);
  const { id, inviteId } = c.req.param();

  const { autoStarted } = await prisma.$transaction(async (tx) => {
    const invite = await tx.tournamentInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.tournamentId !== id) {
      throw new HTTPException(404, { message: 'invitation introuvable' });
    }
    if (invite.inviteeLogin !== me) {
      throw new HTTPException(403, { message: 'cette invitation ne te concerne pas' });
    }
    if (invite.status !== 'pending') {
      throw new HTTPException(409, { message: `invitation déjà ${invite.status}` });
    }
    const t = await tx.tournament.findUnique({ where: { id }, include: { entries: true } });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });
    if (t.status !== 'registration') {
      throw new HTTPException(409, { message: `tournament is ${t.status}` });
    }
    // Ligue : capacité indicative, l'inscription au-delà du nombre déclaré est permise.
    if (t.format !== 'league' && t.entries.length >= t.capacity) {
      throw new HTTPException(409, { message: 'tournoi complet' });
    }
    if (t.entries.some((e) => e.login === me)) {
      // Déjà inscrit (ex. re-invite) — marquer comme accepté quand même.
      await tx.tournamentInvite.update({
        where: { id: inviteId },
        data: { status: 'accepted', decidedAt: new Date() },
      });
      return { autoStarted: false };
    }

    await tx.tournamentInvite.update({
      where: { id: inviteId },
      data: { status: 'accepted', decidedAt: new Date() },
    });
    await tx.tournamentEntry.create({ data: { tournamentId: id, login: me } });

    // Ligue : pas d'auto-démarrage (lancement manuel par l'organisateur).
    const newCount = t.entries.length + 1;
    if (t.format !== 'league' && newCount === t.capacity) {
      const logins = [...t.entries.map((e) => e.login), me];
      await launchTournamentMatches(id, t.format, logins);
      await tx.tournament.update({
        where: { id },
        data: { status: 'in_progress', startedAt: new Date() },
      });
      void notifyMany(logins, {
        type: 'tournament',
        title: `Tournoi "${t.name}" lancé`,
        body: 'Le bracket est généré — à toi de jouer !',
        link: `/tournaments/${id}`,
      });
      return { autoStarted: true };
    }
    return { autoStarted: false };
  });

  broadcast({ type: 'tournament:update', payload: {} });
  void notifyFollowers(me, 'notifyTournament', {
    type: 'follow_tournament',
    title: `@${me} a rejoint un tournoi`,
    link: `/tournaments/${id}`,
    game: await tournamentGame(id),
  });
  return c.json({ id, inviteId, status: autoStarted ? 'in_progress' : 'registration' });
});

// Le joueur invité refuse l'invitation.
app.post('/tournaments/:id/invites/:inviteId/decline', async (c) => {
  const me = await getCurrentLogin(c);
  const { id, inviteId } = c.req.param();

  const invite = await prisma.$transaction(async (tx) => {
    const inv = await tx.tournamentInvite.findUnique({ where: { id: inviteId } });
    if (!inv || inv.tournamentId !== id) {
      throw new HTTPException(404, { message: 'invitation introuvable' });
    }
    if (inv.inviteeLogin !== me) {
      throw new HTTPException(403, { message: 'cette invitation ne te concerne pas' });
    }
    if (inv.status !== 'pending') {
      throw new HTTPException(409, { message: `invitation déjà ${inv.status}` });
    }
    return tx.tournamentInvite.update({
      where: { id: inviteId },
      data: { status: 'declined', decidedAt: new Date() },
    });
  });

  emit([invite.inviterLogin], { type: 'tournament:invite_declined', payload: { tournamentId: id, inviteeLogin: me } });
  return c.json({ id, inviteId, status: 'declined' });
});

app.post('/tournaments/:id/leave', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({ where: { id } });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });
    if (t.status !== 'registration') {
      throw new HTTPException(409, {
        message: 'cannot leave once tournament started',
      });
    }
    await tx.tournamentEntry.delete({
      where: { tournamentId_login: { tournamentId: id, login: me } },
    });
  });
  return c.json({ id, left: true });
});

// Organisateur/admin : retire un inscrit (en 2v2, l'inscription EST l'équipe → tout
// le duo est retiré) en cas d'erreur de saisie. Uniquement en phase d'inscription.
// `login` = login du CAPITAINE (clé de l'inscription). Rembourse les paris ouverts
// placés sur ce pronostic (vainqueur) pour ne pas piéger une mise sur un absent.
app.post('/tournaments/:id/remove-player', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const login = typeof body?.login === 'string' ? body.login : '';
  if (!login) throw new HTTPException(400, { message: 'login requis' });
  const refunded = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({ where: { id } });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });
    if (!isTournamentManager(t, me) && !isAdmin(me)) {
      throw new HTTPException(403, { message: "seul l'organisateur ou un admin peut retirer un inscrit" });
    }
    if (t.status !== 'registration') {
      throw new HTTPException(409, { message: 'retrait possible uniquement pendant l’inscription' });
    }
    const entry = await tx.tournamentEntry.findUnique({
      where: { tournamentId_login: { tournamentId: id, login } },
    });
    if (!entry) throw new HTTPException(404, { message: 'inscrit introuvable' });
    // Rembourse les paris vainqueur ouverts placés sur cette équipe (capitaine).
    const r = await refundBetsTx(tx, {
      targetType: 'tournament',
      tournamentId: id,
      choiceLogin: login,
      status: 'open',
    });
    await tx.tournamentEntry.delete({
      where: { tournamentId_login: { tournamentId: id, login } },
    });
    return r;
  });
  if (refunded.length) emit(refunded, { type: 'panel:update', payload: {} });
  broadcast({ type: 'tournament:update', payload: {} });
  return c.json({ id, removed: login });
});

// Nom d'équipe (2v2) : un membre de l'équipe (capitaine ou coéquipier), un
// organisateur ou un admin peut (re)nommer l'équipe. Vide → efface le nom.
const SetTeamNameSchema = z.object({
  login: z.string().trim().min(1), // capitaine de l'équipe (clé de l'inscription)
  teamName: z.string().trim().max(40),
});
app.post('/tournaments/:id/team-name', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = SetTeamNameSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const { login, teamName } = parsed.data;
  await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({ where: { id } });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });
    if (t.mode !== '2v2') throw new HTTPException(400, { message: 'noms d’équipe réservés au 2v2' });
    const entry = await tx.tournamentEntry.findUnique({
      where: { tournamentId_login: { tournamentId: id, login } },
    });
    if (!entry) throw new HTTPException(404, { message: 'équipe introuvable' });
    const isMember = me === entry.login || me === entry.partnerLogin;
    if (!isMember && !isTournamentManager(t, me) && !isAdmin(me)) {
      throw new HTTPException(403, {
        message: 'seul un membre de l’équipe ou un organisateur peut la nommer',
      });
    }
    await tx.tournamentEntry.update({
      where: { tournamentId_login: { tournamentId: id, login } },
      data: { teamName: teamName || null },
    });
  });
  broadcast({ type: 'tournament:update', payload: {} });
  return c.json({ id, login, teamName: teamName || null });
});

// Co-organisateurs : le CRÉATEUR (ou un admin) ajoute/retire des co-organisateurs,
// qui obtiennent TOUS les droits d'organisation sur le tournoi (comme le créateur).
const OrganizerSchema = z.object({
  login: z.string().trim().min(1),
  action: z.enum(['add', 'remove']),
});
app.post('/tournaments/:id/organizers', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = OrganizerSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const { login, action } = parsed.data;
  const coOrganizers = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({
      where: { id },
      select: { createdByLogin: true, coOrganizers: true },
    });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });
    // Seul le créateur (ou un admin) gère la liste des co-organisateurs.
    if (t.createdByLogin !== me && !isAdmin(me)) {
      throw new HTTPException(403, { message: 'seul le créateur ou un admin gère les co-organisateurs' });
    }
    if (login === t.createdByLogin) {
      throw new HTTPException(400, { message: 'le créateur est déjà organisateur' });
    }
    if (action === 'add') {
      const target = await tx.user.findUnique({ where: { login } });
      if (!target || target.bannedAt || target.anonymizedAt || target.deletionScheduledAt) {
        throw new HTTPException(404, { message: `joueur introuvable : ${login}` });
      }
    }
    const set = new Set(t.coOrganizers);
    if (action === 'add') set.add(login);
    else set.delete(login);
    const next = [...set];
    await tx.tournament.update({ where: { id }, data: { coOrganizers: next } });
    return next;
  });
  emit([login], { type: 'panel:update', payload: {} });
  broadcast({ type: 'tournament:update', payload: {} });
  return c.json({ id, coOrganizers });
});

app.post('/tournaments/:id/start', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const result = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({
      where: { id },
      include: { entries: true },
    });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });
    if (!isTournamentManager(t, me) && !isAdmin(me)) {
      throw new HTTPException(403, { message: 'only the organizer or an admin can start' });
    }
    if (t.status !== 'registration') {
      throw new HTTPException(409, { message: `tournament is ${t.status}` });
    }
    // Ligue : démarrage dès 2 inscrits (la ligue n'a pas besoin d'être pleine,
    // l'admin compose les affiches au fil de l'eau). Autres formats : bracket plein.
    if (t.format === 'league') {
      if (t.entries.length < 2) {
        throw new HTTPException(409, {
          message: `need at least 2 players (have ${t.entries.length})`,
        });
      }
    } else if (t.entries.length !== t.capacity) {
      throw new HTTPException(409, {
        message: `need exactly ${t.capacity} players (have ${t.entries.length})`,
      });
    }
    await launchTournamentMatches(id, t.format, t.entries.map((e) => e.login));
    await tx.tournament.update({
      where: { id },
      data: { status: 'in_progress', startedAt: new Date() },
    });
    void notifyMany(t.entries.map((e) => e.login), {
      type: 'tournament',
      title: `Tournoi "${t.name}" lancé`,
      body: 'Le bracket est généré — à toi de jouer !',
      link: `/tournaments/${id}`,
      game: t.game,
    });
    return true;
  });
  return c.json({ id, started: result });
});

// ── Phase de ligue ───────────────────────────────────────────────────────────
// Officiant d'un tournoi (admin/superadmin partout, ou créateur d'un tournoi
// amical) : autorisé à composer/régler la phase de ligue. Lève sinon ; renvoie
// le tournoi (champs utiles) pour éviter un second findUnique côté appelant.
async function assertLeagueOfficiant(
  me: string,
  id: string,
): Promise<{ createdByLogin: string; kind: string; format: string; status: string; name: string; game: string }> {
  const t = await prisma.tournament.findUnique({
    where: { id },
    select: { createdByLogin: true, coOrganizers: true, kind: true, format: true, status: true, name: true, game: true },
  });
  if (!t) throw new HTTPException(404, { message: 'tournament not found' });
  const ownerIsFriendlyOrganizer = isTournamentManager(t, me) && t.kind === 'friendly';
  if (!(await isAdminLogin(me)) && !ownerIsFriendlyOrganizer) {
    throw new HTTPException(403, {
      message: 'admins or the organizer of a friendly tournament only',
    });
  }
  if (t.format !== 'league') {
    throw new HTTPException(409, { message: "ce tournoi n'est pas une phase de ligue" });
  }
  if (t.status !== 'in_progress') {
    throw new HTTPException(409, { message: `tournament is ${t.status}` });
  }
  return t;
}

// La phase de ligue est « ouverte » (éditable) tant qu'aucun match de bracket
// n'a été généré (la bascule en élimination directe est irréversible).
async function leaguePhaseClosed(tx: TxOrPrisma, id: string): Promise<boolean> {
  const bracket = await tx.tournamentMatch.count({
    where: { tournamentId: id, stage: 'bracket' },
  });
  return bracket > 0;
}

// Admin/officiant : ajoute une affiche de ligue (joueur A vs joueur B) sur une
// journée donnée. round=0 + poolIndex=journée + slot global incrémental (réutilise
// les champs des poules, jamais de collision avec le bracket round≥1).
app.post('/tournaments/:id/league/matches', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  await assertLeagueOfficiant(me, id);
  const body = await c.req.json().catch(() => null);
  const parsed = LeagueMatchCreateSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const { playerALogin, playerBLogin, leg } = parsed.data;

  const created = await prisma.$transaction(async (tx) => {
    if (await leaguePhaseClosed(tx, id)) {
      throw new HTTPException(409, { message: 'la phase de ligue est terminée (bracket généré)' });
    }
    const entries = await tx.tournamentEntry.findMany({
      where: { tournamentId: id },
      select: { login: true },
    });
    const entrySet = new Set(entries.map((e) => e.login));
    if (!entrySet.has(playerALogin) || !entrySet.has(playerBLogin)) {
      throw new HTTPException(400, { message: 'les deux participants doivent être inscrits au tournoi' });
    }
    // 2v2 : les deux camps ne doivent pas appartenir au MÊME duo (un capitaine ne
    // peut pas affronter son propre coéquipier).
    const partners = await tournamentPartnerMap(tx, id);
    if (teamMembersOf(playerALogin, partners).includes(playerBLogin)) {
      throw new HTTPException(400, { message: 'les deux camps appartiennent au même duo' });
    }
    // Affiches déjà composées entre cette paire (peu importe le sens A/B). poolIndex
    // porte la manche : 0 = aller, 1 = retour.
    const between = await tx.tournamentMatch.findMany({
      where: {
        tournamentId: id,
        stage: 'league',
        OR: [
          { playerALogin, playerBLogin },
          { playerALogin: playerBLogin, playerBLogin: playerALogin },
        ],
      },
      select: { poolIndex: true },
    });
    if (between.some((b) => (b.poolIndex ?? 0) === leg)) {
      throw new HTTPException(409, {
        message: leg === 0 ? 'cette affiche (aller) existe déjà' : 'le retour de cette affiche existe déjà',
      });
    }
    if (leg === 1 && !between.some((b) => (b.poolIndex ?? 0) === 0)) {
      throw new HTTPException(409, { message: "ajoute d'abord le match aller avant son retour" });
    }
    const agg = await tx.tournamentMatch.aggregate({
      where: { tournamentId: id, round: 0 },
      _max: { slot: true },
    });
    const slot = (agg._max.slot ?? -1) + 1;
    return tx.tournamentMatch.create({
      data: {
        id: randomUUID(),
        tournamentId: id,
        stage: 'league',
        poolIndex: leg,
        round: 0,
        slot,
        playerALogin,
        playerBLogin,
      },
    });
  });
  broadcast({ type: 'tournament:update', payload: {} });
  return c.json(created, 201);
});

// Admin/officiant : supprime une affiche de ligue NON confirmée (corrige une
// erreur de composition). Un match déjà confirmé reste dans l'historique.
app.delete('/tournaments/:id/league/matches/:matchId', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const matchId = c.req.param('matchId');
  await assertLeagueOfficiant(me, id);
  await prisma.$transaction(async (tx) => {
    const m = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!m || m.tournamentId !== id || m.stage !== 'league') {
      throw new HTTPException(404, { message: 'match not found' });
    }
    if (m.confirmedAt) {
      throw new HTTPException(409, { message: 'match déjà confirmé — non supprimable' });
    }
    await tx.tournamentMatch.delete({ where: { id: matchId } });
  });
  broadcast({ type: 'tournament:update', payload: {} });
  return c.json({ id: matchId, deleted: true });
});

// Admin/officiant : ÉDITE le score d'un match de ligue DÉJÀ CONFIRMÉ (correction
// d'une erreur de saisie). Un match de ligue ne touche pas l'ELO réel → on met
// simplement à jour score + vainqueur, et le classement se recalcule à l'affichage.
// Si le vainqueur CHANGE, les paris du match sont re-réglés : on annule les gains
// déjà versés (débit clampé à 0) puis on règle pour le nouveau vainqueur. Possible
// tant que la phase de ligue est ouverte (pas encore basculée en bracket).
app.post('/tournaments/:id/league/matches/:matchId/edit-score', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const matchId = c.req.param('matchId');
  await assertLeagueOfficiant(me, id);
  const body = await c.req.json().catch(() => null);
  const parsed = TournamentEditScoreSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const { scoreA, scoreB } = parsed.data;

  const affected = await prisma.$transaction(async (tx) => {
    if (await leaguePhaseClosed(tx, id)) {
      throw new HTTPException(409, { message: 'la phase de ligue est terminée (bracket généré)' });
    }
    const m = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!m || m.tournamentId !== id || m.stage !== 'league') {
      throw new HTTPException(404, { message: 'match not found' });
    }
    if (!m.confirmedAt) {
      throw new HTTPException(409, { message: 'match non confirmé — utilise la saisie de score' });
    }
    if (!m.playerALogin || !m.playerBLogin) {
      throw new HTTPException(409, { message: 'match sans joueurs' });
    }
    const tour = await tx.tournament.findUnique({ where: { id }, select: { game: true } });
    // Édition d'un match de ligue : score libre, nul autorisé (goal average).
    const scoreErr = validateTournamentScore(parseGameId(tour?.game), scoreA, scoreB, {
      freeGoals: true,
      allowDraw: true,
    });
    if (scoreErr) throw new HTTPException(400, { message: scoreErr });

    // Nul possible en ligue (scores égaux) → pas de vainqueur.
    const newWinner =
      scoreA === scoreB ? null : scoreA > scoreB ? m.playerALogin : m.playerBLogin;
    const winnerChanged = newWinner !== m.winnerLogin;
    // Un score corrigé sans changement de vainqueur impacte quand même les paris
    // « score exact » (×4) → on re-règle aussi dans ce cas.
    const scoreChanged = scoreA !== m.scoreA || scoreB !== m.scoreB;
    await tx.tournamentMatch.update({
      where: { id: matchId },
      data: { scoreA, scoreB, winnerLogin: newWinner, recordedByLogin: me, recordedAt: new Date() },
    });
    if (!winnerChanged && !scoreChanged) return [] as string[];
    // Reverse des paris déjà réglés sur ce match (débit du gain, retour à 'open'),
    // puis règlement pour le nouveau vainqueur. `touched` = parieurs dont le solde bouge.
    const touched = new Set<string>();
    const settled = await tx.bet.findMany({
      where: { targetType: 'match', matchId, status: { in: ['won', 'lost'] } },
    });
    for (const b of settled) {
      if (b.payout > 0) {
        await grantCoinsTx(tx, b.bettorLogin, -b.payout, {
          type: 'bet_reversal',
          refId: b.id,
          meta: { targetType: 'match', matchId: b.matchId, choiceLogin: b.choiceLogin, reason: 'score_corrected' },
        });
        touched.add(b.bettorLogin);
      }
      await tx.bet.update({ where: { id: b.id }, data: { status: 'open', payout: 0, settledAt: null } });
    }
    for (const w of await settleMatchBetsTx(tx, matchId, newWinner)) touched.add(w);
    return [...touched];
  });
  // Soldes des parieurs impactés mis à jour après commit.
  if (affected.length) emit(affected, { type: 'panel:update', payload: {} });
  broadcast({ type: 'tournament:update', payload: {} });
  broadcast({ type: 'leaderboard:update', payload: {} });
  return c.json({ id: matchId, edited: true });
});

// Admin/officiant : bascule la phase de ligue en élimination directe. Les
// `qualifyCount` premiers au goal average sont qualifiés et seedés dans un bracket
// (le 1er affronte le dernier qualifié). Calqué sur la fin de la phase de poules
// dans settleConfirmedTournamentMatch : les non-qualifiés voient leurs paris
// « vainqueur du tournoi » réglés perdants (mise non rendue).
app.post('/tournaments/:id/league/finalize', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const t = await assertLeagueOfficiant(me, id);
  const body = await c.req.json().catch(() => null);
  const parsed = LeagueFinalizeSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const { qualifyCount } = parsed.data;

  await prisma.$transaction(async (tx) => {
    if (await leaguePhaseClosed(tx, id)) {
      throw new HTTPException(409, { message: 'la phase de ligue est déjà terminée' });
    }
    const leagueMatches = await tx.tournamentMatch.findMany({
      where: { tournamentId: id, stage: 'league' },
      select: {
        poolIndex: true,
        playerALogin: true,
        playerBLogin: true,
        scoreA: true,
        scoreB: true,
        winnerLogin: true,
        confirmedAt: true,
      },
    });
    if (leagueMatches.length === 0) {
      throw new HTTPException(409, { message: 'aucun match de ligue à classer' });
    }
    // Bascule anticipée autorisée : on n'exige PAS que tous les matchs soient joués.
    // Les affiches non confirmées sont simplement IGNORÉES du classement (elles
    // restent dans l'historique de ligue, marquées « non joué »). Il faut juste
    // qu'au moins une confrontation ait été tranchée pour pouvoir classer.
    if (!leagueMatches.some((m) => m.confirmedAt)) {
      throw new HTTPException(409, { message: 'aucun match de ligue confirmé à classer' });
    }
    const qualifiers = leagueQualifiers(leagueMatches, qualifyCount);
    if (qualifiers.length < qualifyCount) {
      throw new HTTPException(409, {
        message: `seulement ${qualifiers.length} joueurs classés (qualifiés demandés : ${qualifyCount})`,
      });
    }
    await generateBracket(id, qualifiers, { preSeeded: true });
    // Mémorise le nombre de qualifiés effectivement utilisé (cohérent avec la
    // surbrillance du classement et une éventuelle re-finalisation après undo).
    await tx.tournament.update({ where: { id }, data: { leagueQualifyCount: qualifyCount } });
    // Paris progressifs : les non-qualifiés n'ont franchi aucun tour de bracket →
    // perdus (sinon leurs paris resteraient « open » à jamais).
    const qualSet = new Set(qualifiers);
    const allEntries = await tx.tournamentEntry.findMany({
      where: { tournamentId: id },
      select: { login: true },
    });
    for (const e of allEntries) {
      if (!qualSet.has(e.login)) {
        await settleTournamentBetsForPick(tx, id, e.login, 0, 1, DEFAULT_BET_FINAL_MULT);
      }
    }
  });

  void notifyMany(
    (await prisma.tournamentEntry.findMany({ where: { tournamentId: id }, select: { login: true } })).map(
      (p) => p.login,
    ),
    {
      type: 'tournament',
      title: 'Phase de ligue terminée',
      body: 'Le bracket des qualifiés est prêt — place à l’élimination directe !',
      link: `/tournaments/${id}`,
      game: t.game,
    },
  );
  broadcast({ type: 'tournament:update', payload: {} });
  void logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_MATCH',
    target: t.createdByLogin,
    payload: { forced: 'league-finalize', tournamentId: id, qualifyCount },
  });
  return c.json({ id, finalized: true, qualifyCount });
});

// Admin/officiant : règle le nombre d'équipes qualifiées pour la phase finale et le
// PERSISTE sur le tournoi (modifiable à tout moment tant que la ligue est ouverte).
// La surbrillance du classement (côté front) le reflète en direct. Nombre libre ≥ 2.
app.post('/tournaments/:id/league/qualify-count', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  await assertLeagueOfficiant(me, id);
  const body = await c.req.json().catch(() => null);
  const parsed = LeagueQualifyCountSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const { qualifyCount } = parsed.data;
  await prisma.$transaction(async (tx) => {
    if (await leaguePhaseClosed(tx, id)) {
      throw new HTTPException(409, { message: 'la phase de ligue est terminée (bracket généré)' });
    }
    await tx.tournament.update({ where: { id }, data: { leagueQualifyCount: qualifyCount } });
  });
  broadcast({ type: 'tournament:update', payload: {} });
  return c.json({ id, leagueQualifyCount: qualifyCount });
});

// Admin/officiant : (re)génère les affiches ALLER manquantes du round-robin. Sert de
// filet si des affiches ont été supprimées par erreur (idempotent — ne touche pas
// aux affiches existantes ni aux scores). Sans objet une fois le bracket généré.
app.post('/tournaments/:id/league/generate', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  await assertLeagueOfficiant(me, id);
  const created = await prisma.$transaction(async (tx) => {
    if (await leaguePhaseClosed(tx, id)) {
      throw new HTTPException(409, { message: 'la phase de ligue est terminée (bracket généré)' });
    }
    const entries = await tx.tournamentEntry.findMany({
      where: { tournamentId: id },
      select: { login: true },
    });
    return ensureLeagueRoundRobin(tx, id, entries.map((e) => e.login));
  });
  broadcast({ type: 'tournament:update', payload: {} });
  return c.json({ id, created });
});

// Admin/officiant : ANNULE la bascule en phase finale et revient à la phase de ligue
// (correction d'une erreur de qualifiés). N'est possible QUE tant qu'aucun match de
// bracket n'a vraiment commencé (pas de score saisi, ni pile-ou-face, ni match
// désigné « suivant ») — les byes auto-confirmés à la génération ne comptent pas.
// On efface tout le bracket et on rouvre la ligue (les affiches de ligue, joués comme
// non joués, sont intactes) ; les paris « vainqueur du tournoi » réglés perdants à la
// finalisation repassent « open » (mise re-immobilisée, aucun débit puisque payout 0).
app.post('/tournaments/:id/league/undo-finalize', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const t = await assertLeagueOfficiant(me, id);
  const reopened = await prisma.$transaction(async (tx) => {
    const bracket = await tx.tournamentMatch.findMany({
      where: { tournamentId: id, stage: 'bracket' },
      select: {
        id: true,
        playerALogin: true,
        playerBLogin: true,
        scoreA: true,
        confirmedAt: true,
        tossWinnerLogin: true,
      },
    });
    if (bracket.length === 0) {
      throw new HTTPException(409, { message: 'aucune phase finale à annuler' });
    }
    // Un match « entamé » = un duel (2 joueurs présents) avec score saisi, confirmé,
    // ou pile-ou-face lancé. Les byes (un seul joueur, confirmés d'office) sont exclus.
    const started = bracket.some(
      (m) =>
        m.playerALogin != null &&
        m.playerBLogin != null &&
        (m.scoreA != null || m.confirmedAt != null || m.tossWinnerLogin != null),
    );
    const tour = await tx.tournament.findUnique({
      where: { id },
      select: { activeMatchId: true, status: true },
    });
    if (started || tour?.activeMatchId || tour?.status !== 'in_progress') {
      throw new HTTPException(409, {
        message: 'la phase finale a déjà commencé — impossible de revenir en arrière',
      });
    }
    await tx.tournamentMatch.deleteMany({ where: { tournamentId: id, stage: 'bracket' } });
    // Rouvre les paris « vainqueur du tournoi » réglés à la finalisation (non-qualifiés
    // marqués perdants → 'open'). Débit clampé du payout éventuel (0 ici par construction).
    const settled = await tx.bet.findMany({
      where: { targetType: 'tournament', tournamentId: id, status: { in: ['won', 'lost'] } },
    });
    const touched = new Set<string>();
    for (const b of settled) {
      if (b.payout > 0) {
        await grantCoinsTx(tx, b.bettorLogin, -b.payout, {
          type: 'bet_reversal',
          refId: b.id,
          meta: { targetType: 'tournament', tournamentId: b.tournamentId, choiceLogin: b.choiceLogin, reason: 'final_reopened' },
        });
        touched.add(b.bettorLogin);
      }
      await tx.bet.update({
        where: { id: b.id },
        data: { status: 'open', payout: 0, settledAt: null },
      });
    }
    return [...touched];
  });
  if (reopened.length) emit(reopened, { type: 'panel:update', payload: {} });
  void notifyMany(
    (await prisma.tournamentEntry.findMany({ where: { tournamentId: id }, select: { login: true } })).map(
      (p) => p.login,
    ),
    {
      type: 'tournament',
      title: 'Phase finale annulée',
      body: 'Retour à la phase de ligue — le classement et les affiches sont rouverts.',
      link: `/tournaments/${id}`,
      game: t.game,
    },
  );
  broadcast({ type: 'tournament:update', payload: {} });
  broadcast({ type: 'leaderboard:update', payload: {} });
  void logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_MATCH',
    target: t.createdByLogin,
    payload: { forced: 'league-undo-finalize', tournamentId: id },
  });
  return c.json({ id, undone: true });
});

// Re-tirage du bracket — le créateur OU un admin relance le tirage au sort tant
// que le premier match n'a pas démarré : aucun duel (2 joueurs) avec score saisi,
// confirmé ou pile-ou-face entamé, et aucun match désigné « suivant » (activeMatchId).
// Les byes du 1er tour (auto-confirmés à la génération) ne comptent pas. On efface
// les matchs et on régénère depuis les inscrits avec un nouveau mélange aléatoire.
// La diffusion `tournament:update` est assurée par le middleware sur /tournaments/*.
// Officiant : REVENIR EN PHASE D'INSCRIPTION depuis une ligue en cours (corriger la
// composition des inscrits). Possible UNIQUEMENT si aucun match n'a démarré (aucun
// score saisi/confirmé, aucun toss) et que la phase finale (bracket) n'a pas été
// générée. Supprime toutes les affiches, rembourse les paris ouverts, repasse en
// 'registration' (on pourra ajouter/retirer des inscrits puis relancer).
app.post('/tournaments/:id/league/reopen', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  await assertLeagueOfficiant(me, id); // ligue + in_progress + droits (admin/orga amical)
  const refunded = await prisma.$transaction(async (tx) => {
    if (await leaguePhaseClosed(tx, id)) {
      throw new HTTPException(409, {
        message: 'la phase finale est déjà générée — reviens d’abord en arrière sur la finale',
      });
    }
    const started = await tx.tournamentMatch.count({
      where: {
        tournamentId: id,
        OR: [{ confirmedAt: { not: null } }, { recordedAt: { not: null } }, { tossAt: { not: null } }],
      },
    });
    if (started > 0) {
      throw new HTTPException(409, {
        message: 'des matchs ont déjà commencé — impossible de revenir à l’inscription',
      });
    }
    // La compo va changer → on rembourse tous les paris ouverts (vainqueur + matchs)
    // puis on efface les affiches et on rouvre les inscriptions.
    const r = await refundOpenBetsForTournamentTx(tx, id);
    await tx.tournamentMatch.deleteMany({ where: { tournamentId: id } });
    await tx.tournament.update({
      where: { id },
      data: { status: 'registration', startedAt: null, activeMatchId: null },
    });
    return r;
  });
  if (refunded.length) emit(refunded, { type: 'panel:update', payload: {} });
  broadcast({ type: 'tournament:update', payload: {} });
  return c.json({ id, reopened: true });
});

app.post('/tournaments/:id/reshuffle', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: { entries: { select: { login: true } } },
  });
  if (!t) throw new HTTPException(404, { message: 'tournament not found' });
  if (!isTournamentManager(t, me) && !isAdmin(me)) {
    throw new HTTPException(403, { message: 'only the organizer or an admin can reshuffle' });
  }
  if (t.status !== 'in_progress') {
    throw new HTTPException(409, { message: `tournament is ${t.status}` });
  }
  if (t.activeMatchId) {
    throw new HTTPException(409, { message: 'le premier match a déjà été lancé' });
  }
  const started = await prisma.tournamentMatch.count({
    where: {
      tournamentId: id,
      playerALogin: { not: null },
      playerBLogin: { not: null },
      OR: [{ confirmedAt: { not: null } }, { recordedAt: { not: null } }, { tossAt: { not: null } }],
    },
  });
  if (started > 0) {
    throw new HTTPException(409, { message: 'des matchs ont déjà commencé — re-tirage impossible' });
  }
  // generateBracket/generatePools écrivent via le client global → on supprime puis
  // régénère hors transaction (même contrainte que /start). Action manuelle et rare.
  // Les affiches étant régénérées, on rembourse d'abord les paris match ouverts.
  const reBettors = await prisma.$transaction((tx) =>
    refundBetsTx(tx, { targetType: 'match', tournamentId: id, status: 'open' }),
  );
  if (reBettors.length) emit(reBettors, { type: 'panel:update', payload: {} });
  await prisma.tournamentMatch.deleteMany({ where: { tournamentId: id } });
  await launchTournamentMatches(id, t.format, t.entries.map((e) => e.login));
  return c.json({ id, reshuffled: true });
});

// Officiant : ÉCHANGE deux joueurs dans le bracket (drag-and-drop côté front).
// Possible tant qu'aucun des deux matchs concernés n'est confirmé. On localise
// chaque joueur à sa position COURANTE (le round le plus avancé où il figure — un
// vainqueur apparaît aussi dans son match précédent, déjà confirmé), on intervertit,
// et comme la composition change on remet à zéro l'état transitoire des matchs
// touchés (score saisi non confirmé, pile-ou-face) et on rembourse les paris ouverts.
app.post('/tournaments/:id/bracket/swap', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const owner = await prisma.tournament.findUnique({
    where: { id },
    select: { createdByLogin: true, coOrganizers: true, kind: true, activeMatchId: true },
  });
  if (!owner) throw new HTTPException(404, { message: 'tournament not found' });
  const ownerIsFriendlyOrganizer = isTournamentManager(owner, me) && owner.kind === 'friendly';
  if (!(await isAdminLogin(me)) && !ownerIsFriendlyOrganizer) {
    throw new HTTPException(403, { message: 'admins or the organizer of a friendly tournament only' });
  }
  const body = await c.req.json().catch(() => null);
  const loginA = typeof body?.loginA === 'string' ? body.loginA : '';
  const loginB = typeof body?.loginB === 'string' ? body.loginB : '';
  if (!loginA || !loginB || loginA === loginB) {
    throw new HTTPException(400, { message: 'deux joueurs distincts requis' });
  }

  const result = await prisma.$transaction(async (tx) => {
    const matches = await tx.tournamentMatch.findMany({
      where: {
        tournamentId: id,
        stage: 'bracket',
        OR: [
          { playerALogin: { in: [loginA, loginB] } },
          { playerBLogin: { in: [loginA, loginB] } },
        ],
      },
    });
    type Pos = { matchId: string; round: number; side: 'A' | 'B'; confirmed: boolean };
    const locate = (login: string): Pos | null => {
      let best: Pos | null = null;
      for (const m of matches) {
        const side = m.playerALogin === login ? 'A' : m.playerBLogin === login ? 'B' : null;
        if (!side) continue;
        if (!best || m.round > best.round) {
          best = { matchId: m.id, round: m.round, side, confirmed: !!m.confirmedAt };
        }
      }
      return best;
    };
    const a = locate(loginA);
    const b = locate(loginB);
    if (!a || !b) throw new HTTPException(404, { message: 'joueur introuvable dans le bracket' });
    if (a.matchId === b.matchId) {
      throw new HTTPException(409, { message: 'les deux joueurs sont déjà dans le même match' });
    }
    if (a.confirmed || b.confirmed) {
      throw new HTTPException(409, { message: 'un des matchs est déjà confirmé — échange impossible' });
    }
    // État transitoire caduc (la composition change) : score saisi non confirmé,
    // pile-ou-face, et réouverture du marché de paris.
    const reset = {
      scoreA: null, scoreB: null, recordedByLogin: null, recordedAt: null, winnerLogin: null,
      tossWinnerLogin: null, tossSide: null, advantagePick: null, tossAt: null, betsLockedAt: null,
    };
    await tx.tournamentMatch.update({
      where: { id: a.matchId },
      data: a.side === 'A' ? { ...reset, playerALogin: loginB } : { ...reset, playerBLogin: loginB },
    });
    await tx.tournamentMatch.update({
      where: { id: b.matchId },
      data: b.side === 'A' ? { ...reset, playerALogin: loginA } : { ...reset, playerBLogin: loginA },
    });
    // Un des matchs touchés était « en cours » → on retire l'écran VERSUS partagé.
    if (owner.activeMatchId === a.matchId || owner.activeMatchId === b.matchId) {
      await tx.tournament.update({ where: { id }, data: { activeMatchId: null } });
    }
    const bettors = await refundBetsTx(tx, {
      targetType: 'match',
      matchId: { in: [a.matchId, b.matchId] },
    });
    return { bettors };
  });

  if (result.bettors.length) emit(result.bettors, { type: 'panel:update', payload: {} });
  broadcast({ type: 'tournament:update', payload: {} });
  void logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_MATCH',
    target: `${loginA} <> ${loginB}`,
    payload: { forced: 'bracket-swap', tournamentId: id, loginA, loginB },
  });
  return c.json({ id, swapped: true });
});

// Annulation par l'organisateur (ou un admin) : le tournoi est supprimé pour de bon
// et disparaît des listes (cascade → entries + matchs). Pas de statut « annulé ».
app.post('/tournaments/:id/cancel', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const refunded = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({ where: { id } });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });
    if (!isTournamentManager(t, me) && !isAdmin(me)) {
      throw new HTTPException(403, {
        message: 'only the organizer can cancel',
      });
    }
    if (t.status === 'finished') {
      throw new HTTPException(409, { message: 'tournament is finished' });
    }
    // Rembourse les paris ouverts AVANT la suppression (sinon le cascade les
    // efface et la mise est perdue).
    const r = await refundOpenBetsForTournamentTx(tx, id);
    await cleanupOrphanPrizeTx(tx, t);
    await tx.tournament.delete({ where: { id } });
    return r;
  });
  // Parieurs remboursés notifiés (solde mis à jour) après commit.
  if (refunded.length) emit(refunded, { type: 'panel:update', payload: {} });
  return c.json({ id, cancelled: true, deleted: true });
});

app.post('/tournaments/:id/matches/:matchId/record', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const matchId = c.req.param('matchId');
  const body = await c.req.json().catch(() => null);
  const parsed = TournamentRecordSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { scoreA, scoreB } = parsed.data;
  await prisma.$transaction(async (tx) => {
    const m = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!m || m.tournamentId !== id) {
      throw new HTTPException(404, { message: 'match not found' });
    }
    if (!m.playerALogin || !m.playerBLogin) {
      throw new HTTPException(409, {
        message: 'match has no players yet (previous round pending)',
      });
    }
    if (m.confirmedAt) {
      throw new HTTPException(409, { message: 'match already confirmed' });
    }
    // Participant = membre d'un des deux camps (les deux coéquipiers en 2v2).
    const partners = await tournamentPartnerMap(tx, id);
    const teamA = teamMembersOf(m.playerALogin, partners);
    const teamB = teamMembersOf(m.playerBLogin, partners);
    if (!teamA.includes(me) && !teamB.includes(me)) {
      throw new HTTPException(403, { message: 'not a participant' });
    }
    // Validation du score selon la discipline du tournoi (échecs 1-0, smash set,
    // babyfoot 10-x) — empêche le « 10-0 » sur une finale d'échecs/smash.
    const tour = await tx.tournament.findUnique({ where: { id }, select: { game: true } });
    const scoreErr = validateTournamentScore(parseGameId(tour?.game), scoreA, scoreB, {
      freeGoals: m.stage === 'league' || m.stage === 'bracket',
      allowDraw: m.stage === 'league',
    });
    if (scoreErr) throw new HTTPException(400, { message: scoreErr });
    await tx.tournamentMatch.update({
      where: { id: matchId },
      data: {
        scoreA,
        scoreB,
        recordedByLogin: me,
        recordedAt: new Date(),
        winnerLogin: null,
        confirmedAt: null,
        // Ferme définitivement les paris dès la 1re saisie (le score est exposé).
        // Posé une seule fois → un reject/mismatch ultérieur ne rouvre pas le marché.
        betsLockedAt: m.betsLockedAt ?? new Date(),
      },
    });
  });
  return c.json({ id: matchId, status: 'pending_confirmation' });
});

app.post('/tournaments/:id/matches/:matchId/confirm', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const matchId = c.req.param('matchId');
  const body = await c.req.json().catch(() => null);
  const parsed = TournamentRecordSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { scoreA, scoreB } = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    const m = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!m || m.tournamentId !== id) {
      throw new HTTPException(404, { message: 'match not found' });
    }
    if (!m.recordedByLogin || m.scoreA == null || m.scoreB == null) {
      throw new HTTPException(409, { message: 'no score recorded yet' });
    }
    if (m.confirmedAt) {
      throw new HTTPException(409, { message: 'match already confirmed' });
    }
    // Camps résolus (2 coéquipiers en 2v2). Le confirmeur doit être un participant
    // du CAMP ADVERSE à celui qui a saisi le score (pas de validation par sa propre équipe).
    const partners = await tournamentPartnerMap(tx, id);
    const teamA = teamMembersOf(m.playerALogin, partners);
    const teamB = teamMembersOf(m.playerBLogin, partners);
    const myTeam = teamA.includes(me) ? teamA : teamB.includes(me) ? teamB : null;
    if (!myTeam) {
      throw new HTTPException(403, { message: 'not a participant' });
    }
    if (myTeam.includes(m.recordedByLogin)) {
      throw new HTTPException(403, {
        message: "you can't confirm your own score",
      });
    }
    if (m.scoreA !== scoreA || m.scoreB !== scoreB) {
      // Reset score → both must redo
      await tx.tournamentMatch.update({
        where: { id: matchId },
        data: {
          scoreA: null,
          scoreB: null,
          recordedByLogin: null,
          recordedAt: null,
        },
      });
      throw new HTTPException(409, {
        message: `Scores différents — saisi ${m.scoreA}-${m.scoreB}, tu as soumis ${scoreA}-${scoreB}. Score reset, à ressaisir.`,
      });
    }
    // Nul possible en ligue (scores égaux) → pas de vainqueur.
    const winnerLogin =
      scoreA === scoreB ? null : scoreA > scoreB ? m.playerALogin! : m.playerBLogin!;
    await tx.tournamentMatch.update({
      where: { id: matchId },
      data: { winnerLogin, confirmedAt: new Date() },
    });
    // Propagation partagée avec /force-result (paris, bracket, finale, récompense).
    return settleConfirmedTournamentMatch(tx, id, {
      id: m.id,
      stage: m.stage,
      round: m.round,
      slot: m.slot,
      winnerLogin,
      playerALogin: m.playerALogin,
      playerBLogin: m.playerBLogin,
    });
  });
  // Push live au vainqueur APRÈS commit (jamais d'emit dans la transaction).
  if (result.finished && result.prizeAwarded && result.winnerLogin) {
    emit([result.winnerLogin], { type: 'panel:update', payload: {} });
  }
  // Parieurs gagnants notifiés du crédit (solde mis à jour).
  if (result.betWinners.length) {
    emit(result.betWinners, { type: 'panel:update', payload: {} });
  }
  if (result.bracketGenerated) {
    const players = await prisma.tournamentEntry.findMany({
      where: { tournamentId: id },
      select: { login: true },
    });
    void notifyMany(players.map((p) => p.login), {
      type: 'tournament',
      title: 'Phase de poules terminée',
      body: 'Le bracket des qualifiés est prêt — place à l’élimination directe !',
      link: `/tournaments/${id}`,
      game: await tournamentGame(id),
    });
  }
  return c.json({ id: matchId, ...result });
});

app.post('/tournaments/:id/matches/:matchId/reject', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const matchId = c.req.param('matchId');
  await prisma.$transaction(async (tx) => {
    const m = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!m || m.tournamentId !== id) {
      throw new HTTPException(404, { message: 'match not found' });
    }
    if (m.confirmedAt) {
      throw new HTTPException(409, { message: 'match already confirmed' });
    }
    if (m.playerALogin !== me && m.playerBLogin !== me) {
      throw new HTTPException(403, { message: 'not a participant' });
    }
    await tx.tournamentMatch.update({
      where: { id: matchId },
      data: {
        scoreA: null,
        scoreB: null,
        recordedByLogin: null,
        recordedAt: null,
      },
    });
  });
  return c.json({ id: matchId, rejected: true });
});

// Pile-ou-face d'avant-duel : tire au sort le gagnant (résultat partagé via la
// base → identique sur les 2 écrans). Le gagnant choisira ensuite son avantage.
app.post('/tournaments/:id/matches/:matchId/toss', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const matchId = c.req.param('matchId');
  const updated = await prisma.$transaction(async (tx) => {
    const m = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!m || m.tournamentId !== id) {
      throw new HTTPException(404, { message: 'match not found' });
    }
    if (m.stage !== 'bracket' && m.stage !== 'league') {
      throw new HTTPException(409, { message: 'le pile-ou-face concerne le bracket et la ligue' });
    }
    if (!m.playerALogin || !m.playerBLogin) {
      throw new HTTPException(409, {
        message: 'match has no players yet (previous round pending)',
      });
    }
    if (m.confirmedAt) {
      throw new HTTPException(409, { message: 'match already confirmed' });
    }
    // Participant OU officiant (admin/superadmin partout, créateur d'un tournoi
    // amical) — l'officiant peut lancer la pièce sans jouer le match.
    const tour = await tx.tournament.findUnique({
      where: { id },
      select: { createdByLogin: true, coOrganizers: true, kind: true },
    });
    const isParticipant = m.playerALogin === me || m.playerBLogin === me;
    const canOfficiate =
      (await isAdminLogin(me)) ||
      (!!tour && isTournamentManager(tour, me) && tour.kind === 'friendly');
    if (!isParticipant && !canOfficiate) {
      throw new HTTPException(403, { message: 'not a participant' });
    }
    if (m.tossWinnerLogin) {
      throw new HTTPException(400, { message: 'tirage déjà effectué' });
    }
    // Aléatoire côté backend (résultat figé en base, partagé aux 2 joueurs).
    const heads = Math.random() < 0.5;
    const tossWinnerLogin = heads ? m.playerALogin : m.playerBLogin;
    return tx.tournamentMatch.update({
      where: { id: matchId },
      data: {
        tossWinnerLogin,
        tossSide: heads ? 'heads' : 'tails',
        tossAt: new Date(),
      },
    });
  });
  return c.json(updated);
});

const TournamentAdvantageSchema = z.object({
  pick: z.string().trim().min(1).max(20),
});

// Le gagnant du toss choisit son avantage (clé d'option propre au jeu). Seul lui
// peut appeler ; l'option complémentaire (le cas échéant) revient à l'adversaire.
app.post('/tournaments/:id/matches/:matchId/advantage', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const matchId = c.req.param('matchId');
  const body = await c.req.json().catch(() => null);
  const parsed = TournamentAdvantageSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { pick } = parsed.data;
  const updated = await prisma.$transaction(async (tx) => {
    const m = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!m || m.tournamentId !== id) {
      throw new HTTPException(404, { message: 'match not found' });
    }
    if (m.confirmedAt) {
      throw new HTTPException(409, { message: 'match already confirmed' });
    }
    if (m.tossWinnerLogin !== me) {
      throw new HTTPException(403, { message: 'not the toss winner' });
    }
    if (m.advantagePick) {
      throw new HTTPException(400, { message: 'avantage déjà choisi' });
    }
    // L'option choisie doit appartenir au jeu du tournoi (pas n'importe quelle chaîne).
    const tour = await tx.tournament.findUnique({
      where: { id },
      select: { game: true },
    });
    const allowed = getGameAdvantage(parseGameId(tour?.game)).options.map((o) => o.key);
    if (!allowed.includes(pick)) {
      throw new HTTPException(400, { message: 'option d’avantage invalide' });
    }
    return tx.tournamentMatch.update({
      where: { id: matchId },
      data: { advantagePick: pick },
    });
  });
  return c.json(updated);
});

// « Match suivant » : l'organisateur (ou un admin) désigne le duel à jouer
// maintenant. On le mémorise sur le tournoi (activeMatchId) → l'écran VERSUS se
// déclenche chez tous les spectateurs et le match passe « EN COURS » dans
// l'arbre. Sans objet aux échecs (matchs en parallèle, pas de tour imposé).
app.post('/tournaments/:id/matches/:matchId/announce', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const matchId = c.req.param('matchId');
  const updated = await prisma.$transaction(async (tx) => {
    const tour = await tx.tournament.findUnique({
      where: { id },
      select: { createdByLogin: true, coOrganizers: true, status: true, game: true },
    });
    if (!tour) throw new HTTPException(404, { message: 'tournament not found' });
    if (!isTournamentManager(tour, me) && !isAdmin(me)) {
      throw new HTTPException(403, { message: 'only the organizer can announce a match' });
    }
    if (tour.status !== 'in_progress') {
      throw new HTTPException(409, { message: `tournament is ${tour.status}` });
    }
    if (tour.game === 'chess') {
      throw new HTTPException(409, { message: 'les échecs se jouent en parallèle (pas de match suivant)' });
    }
    const m = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!m || m.tournamentId !== id) {
      throw new HTTPException(404, { message: 'match not found' });
    }
    if (m.stage !== 'bracket' && m.stage !== 'league') {
      throw new HTTPException(409, { message: 'on ne peut désigner qu’un match de bracket ou de ligue' });
    }
    if (!m.playerALogin || !m.playerBLogin) {
      throw new HTTPException(409, { message: 'match has no players yet (previous round pending)' });
    }
    if (m.confirmedAt) {
      throw new HTTPException(409, { message: 'match already confirmed' });
    }
    return tx.tournament.update({
      where: { id },
      data: { activeMatchId: matchId },
      select: { id: true, activeMatchId: true },
    });
  });
  return c.json(updated);
});

/* ============ ADMIN — ROLE MANAGEMENT ============ */

// Only SUPERADMINS can promote/demote. SUPERADMIN itself is immutable (hardcoded).
app.post('/admin/users/:login/role', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const targetLogin = c.req.param('login');
  if (SUPERADMINS.has(targetLogin.toLowerCase())) {
    throw new HTTPException(400, { message: 'cannot change role of a superadmin' });
  }
  const target = await prisma.user.findUnique({ where: { login: targetLogin } });
  if (!target) {
    throw new HTTPException(404, { message: 'user not found' });
  }
  const body = await c.req.json().catch(() => null);
  const parsed = SetRoleSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const updated = await prisma.user.update({
    where: { login: targetLogin },
    data: { role: parsed.data.role },
  });
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'SET_ROLE',
    target: targetLogin,
    payload: { from: target.role, to: parsed.data.role },
  });
  return c.json({ login: updated.login, role: updated.role });
});

// Accorde ou retire l'accès staging à un utilisateur (flag stagingAllowed, indépendant du rôle).
// BUG CORRIGÉ : l'ancienne version accordait SUPERADMIN, ce qui était dangereux.
// Désormais : le rôle DB n'est PAS modifié — USER reste USER, ADMIN reste ADMIN, etc.
// Seul le flag `stagingAllowed` change. Le SUPERADMIN reste exclusivement abidaux/throbert.
app.post('/admin/users/:login/staging-access', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const targetLogin = c.req.param('login');
  if (SUPERADMINS.has(targetLogin.toLowerCase())) {
    throw new HTTPException(400, { message: 'cannot modify a hardcoded superadmin' });
  }
  const target = await prisma.user.findUnique({ where: { login: targetLogin } });
  if (!target) throw new HTTPException(404, { message: 'user not found' });
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ grant: z.boolean() }).safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  // On modifie UNIQUEMENT stagingAllowed — le rôle est préservé.
  const updated = await prisma.user.update({
    where: { login: targetLogin },
    data: { stagingAllowed: parsed.data.grant },
  });
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'SET_ROLE',
    target: targetLogin,
    payload: { stagingAccess: parsed.data.grant },
  });
  return c.json({ login: updated.login, role: updated.role, stagingAllowed: updated.stagingAllowed });
});

// =========================================================================
// IMPERSONATION « TESTER » — staging uniquement
// =========================================================================
// Délivre à un admin/superadmin un token d'authentification du compte de test
// générique `tester` (rôle USER) afin qu'il puisse vivre l'expérience d'un joueur
// lambda et tester sans privilèges. Garde-fous :
//  - staging UNIQUEMENT (jamais en prod, fail-secure sur APP_ENV) ;
//  - réservé aux admins (requireAdmin) ;
//  - SEUL le compte `tester` dédié est ciblable — on ne mint jamais le token d'un
//    compte réel arbitraire, ce qui interdit toute usurpation d'un vrai joueur.
// Le retour au compte d'origine est purement côté client (le front sauvegarde le
// token de l'admin avant de le remplacer — cf. startImpersonation/stopImpersonation).
app.post('/admin/impersonate-tester', async (c) => {
  if (process.env.APP_ENV !== 'staging') {
    throw new HTTPException(403, { message: 'staging only' });
  }
  const me = await getCurrentLogin(c);
  if (!TESTER_SWITCH_LOGINS.has(me.toLowerCase())) {
    throw new HTTPException(403, { message: 'tester switch not allowed' });
  }
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new HTTPException(500, { message: 'server misconfigured' });
  // Garantit l'existence du compte (rôle USER) même si le seed n'a pas tourné.
  await getOrCreateUser(TESTER_LOGIN);
  const token = issueToken(TESTER_LOGIN, secret);
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'IMPERSONATE_TESTER',
    target: TESTER_LOGIN,
  });
  return c.json({ token, login: TESTER_LOGIN });
});

// Variante : crée un compte tester TOUT NEUF (login unique `tester-…`) puis délivre
// son token. Permet de revivre l'arrivée d'un joueur fraîchement créé (onboarding à
// faire, stats vierges) à chaque clic. Mêmes garde-fous : staging only + admin.
app.post('/admin/impersonate-fresh-tester', async (c) => {
  if (process.env.APP_ENV !== 'staging') {
    throw new HTTPException(403, { message: 'staging only' });
  }
  const me = await getCurrentLogin(c);
  if (!TESTER_SWITCH_LOGINS.has(me.toLowerCase())) {
    throw new HTTPException(403, { message: 'tester switch not allowed' });
  }
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new HTTPException(500, { message: 'server misconfigured' });
  // Login unique court (≤ 20 car.) ; `onboardedAt` laissé null → onboarding rejoué.
  const login = `${FRESH_TESTER_PREFIX}${randomUUID().slice(0, 8)}`;
  await prisma.user.create({
    data: { login, role: 'USER', campus: 'Le Havre' },
  });
  const token = issueToken(login, secret);
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'IMPERSONATE_TESTER',
    target: login,
  });
  return c.json({ token, login });
});

/* ============ FEATURE REQUESTS ============ */

app.post('/feature-requests', async (c) => {
  const me = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => null);
  const parsed = FeatureRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  await getOrCreateUser(me);
  const fr = await prisma.featureRequest.create({
    data: { id: randomUUID(), text: parsed.data.text, authorId: me },
  });
  return c.json(fr, 201);
});

app.get('/feature-requests', async (c) => {
  const me = await getCurrentLogin(c);
  const role = await getUserRole(me);
  if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
    throw new HTTPException(403, { message: 'admins only' });
  }
  const list = await prisma.featureRequest.findMany({
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { login: true, imageUrl: true } } },
  });
  return c.json(list);
});

app.patch('/feature-requests/:id/status', async (c) => {
  const me = await getCurrentLogin(c);
  const role = await getUserRole(me);
  if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
    throw new HTTPException(403, { message: 'admins only' });
  }
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = SetFeatureRequestStatusSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const fr = await prisma.featureRequest.update({
    where: { id },
    data: { status: parsed.data.status },
  }).catch(() => { throw new HTTPException(404, { message: 'feature request not found' }); });
  return c.json(fr);
});

/* ============ REMONTÉE D'ERREURS CLIENT (écran TV live) → DISCORD ============ */

const ClientErrorSchema = z.object({
  message: z.string().min(1).max(500),
  context: z.string().max(200).optional(),
  stack: z.string().max(2000).optional(),
});

// Reçoit une erreur survenue côté client (page TV live notamment) et la relaie sur
// Discord en fire-and-forget. Authentifié + rate-limité (cf. middleware). Aucun retour
// d'info exploitable : on renvoie toujours 204 même si le webhook échoue, pour ne
// jamais transformer une erreur front en seconde erreur visible.
app.post('/client-errors', async (c) => {
  const me = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => null);
  const parsed = ClientErrorSchema.safeParse(body);
  if (!parsed.success) {
    // Corps invalide : on n'échoue pas bruyamment (le front est déjà en erreur).
    return c.json({ ok: false });
  }
  const { message, context, stack } = parsed.data;
  const where = context ? ` _(${context.slice(0, 120)})_` : '';
  const firstStack = stack ? `\n\`\`\`${stack.split('\n').slice(0, 3).join('\n').slice(0, 600)}\`\`\`` : '';
  void notifyClientError(`\`${me}\`${where} — ${message}${firstStack}`).catch(() => {});
  return c.json({ ok: true });
});

/* ============ BUG REPORTS (boîte à tickets) ============ */

app.post('/bug-reports', async (c) => {
  const me = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => null);
  const parsed = BugReportSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  await getOrCreateUser(me);
  const br = await prisma.bugReport.create({
    data: { id: randomUUID(), text: parsed.data.text, authorId: me },
  });
  return c.json(br, 201);
});

app.get('/bug-reports', async (c) => {
  const me = await getCurrentLogin(c);
  const role = await getUserRole(me);
  if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
    throw new HTTPException(403, { message: 'admins only' });
  }
  const list = await prisma.bugReport.findMany({
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { login: true, imageUrl: true } } },
  });
  return c.json(list);
});

app.patch('/bug-reports/:id/status', async (c) => {
  const me = await getCurrentLogin(c);
  const role = await getUserRole(me);
  if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
    throw new HTTPException(403, { message: 'admins only' });
  }
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = SetBugReportStatusSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const br = await prisma.bugReport.update({
    where: { id },
    data: { status: parsed.data.status },
  }).catch(() => { throw new HTTPException(404, { message: 'bug report not found' }); });
  return c.json(br);
});

/* ============ OPS ============ */
// Durée d'un OPS : 24h (partagée avec le front via @42-league/shared).
// Cooldown de redéclaration : 3 jours après la FIN de l'ops (3 défis consommés
// ou expiration 24h, au premier des deux) — un ops reste un acte fort, espacé.
const OPS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

// Fin effective d'un ops : sa date de fin réelle si les 3 défis ont été
// consommés avant 24h (endedAt), sinon son expiration 24h. C'est l'ancre du
// cooldown de redéclaration.
function opsEffectiveEnd(o: { endedAt: Date | null; expiresAt: Date }): Date {
  return o.endedAt ?? o.expiresAt;
}

// ─── Expiration des ops en temps réel ──────────────────────────────────────
// Un ops expire — puis son cooldown se termine — uniquement par le temps, sans
// aucune mutation HTTP → aucun event SSE n'est émis naturellement. On programme
// donc des timers serveur qui poussent `ops:update` aux joueurs concernés au
// moment exact de ces transitions. (OPS_DURATION = 24h < limite setTimeout ~24,8j.)
// La marge de +1s garantit que la requête de relecture voie bien l'ops comme
// expiré (filtre expiresAt > now côté lecture).
function scheduleOpsTimers(ownerLogin: string, targetLogin: string, expiresAt: Date): void {
  const expiryDelay = expiresAt.getTime() - Date.now() + 1000;
  if (expiryDelay > 0) {
    // À l'expiration : `current` (auteur) et `targetedBy` (cible) repassent à null,
    // et les paris ouverts sur ce duel sont soldés (vainqueur = plus de matchs gagnés).
    setTimeout(() => {
      emit([ownerLogin, targetLogin], { type: 'ops:update', payload: { reason: 'expired' } });
      void sweepExpiredOpsBets();
    }, expiryDelay);
  }
  const cooldownDelay = expiresAt.getTime() + OPS_COOLDOWN_MS - Date.now() + 1000;
  if (cooldownDelay > 0) {
    // À la fin du cooldown : l'auteur peut redéclarer (canDeclareAt franchi).
    setTimeout(() => {
      emit([ownerLogin], { type: 'ops:update', payload: { reason: 'cooldown_ended' } });
    }, cooldownDelay);
  }
}

// Au démarrage, on re-programme les timers des ops encore actifs ou en cooldown :
// les setTimeout sont perdus à chaque redémarrage du process.
async function rescheduleOpsTimers(): Promise<void> {
  const cooldownThreshold = new Date(Date.now() - OPS_COOLDOWN_MS);
  const pending = await prisma.ops.findMany({
    where: { expiresAt: { gt: cooldownThreshold } },
  });
  for (const o of pending) scheduleOpsTimers(o.ownerLogin, o.targetLogin, o.expiresAt);
}

app.get('/ops', async (c) => {
  await getCurrentLogin(c);
  const now = new Date();
  // « Actif » = non expiré ET pas terminé par 3 défis (endedAt null).
  const list = await prisma.ops.findMany({
    where: { expiresAt: { gt: now }, endedAt: null },
  });
  return c.json(list);
});

app.get('/ops/me', async (c) => {
  const me = await getCurrentLogin(c);
  const now = new Date();
  const cooldownThreshold = new Date(now.getTime() - OPS_COOLDOWN_MS);
  const [activeAsOwner, lastAsOwner, activeAsTarget, meUser] = await Promise.all([
    // Ops actif du traqueur : non expiré ET pas terminé par 3 défis.
    prisma.ops.findFirst({
      where: { ownerLogin: me, expiresAt: { gt: now }, endedAt: null },
      include: { target: { select: { login: true, imageUrl: true } } },
    }),
    prisma.ops.findFirst({
      where: { ownerLogin: me },
      orderBy: { expiresAt: 'desc' },
    }),
    // Cible : on n'est « ciblé » que par un ops encore actif (idem).
    prisma.ops.findFirst({
      where: { targetLogin: me, expiresAt: { gt: now }, endedAt: null },
      include: { owner: { select: { login: true, imageUrl: true } } },
    }),
    prisma.user.findUnique({ where: { login: me }, select: { opsCooldownResetAt: true } }),
  ]);
  // Un reset admin neutralise le cooldown des ops terminés avant la date de reset.
  const reset = meUser?.opsCooldownResetAt ?? null;
  // Le cooldown court depuis la FIN effective de l'ops (3 défis ou 24h).
  const lastEnd = lastAsOwner ? opsEffectiveEnd(lastAsOwner) : null;
  let canDeclareAt: Date | null = null;
  if (activeAsOwner) {
    canDeclareAt = new Date(opsEffectiveEnd(activeAsOwner).getTime() + OPS_COOLDOWN_MS);
  } else if (
    lastAsOwner &&
    lastEnd &&
    lastEnd > cooldownThreshold &&
    (!reset || lastEnd > reset)
  ) {
    canDeclareAt = new Date(lastEnd.getTime() + OPS_COOLDOWN_MS);
  }
  return c.json({
    current: activeAsOwner,
    targetedBy: activeAsTarget,
    canDeclareAt,
  });
});

app.post('/ops', async (c) => {
  const me = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => null);
  const parsed = DeclareOpsSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const target = parsed.data.targetLogin;
  if (target === me) {
    throw new HTTPException(400, { message: 'cannot target yourself' });
  }
  // Une cible bannie / désactivée / anonymisée est hors-jeu : pas d'OPS.
  await assertTargetable(target);
  await getOrCreateUser(me);
  await getOrCreateUser(target);

  const now = new Date();
  const cooldownThreshold = new Date(now.getTime() - OPS_COOLDOWN_MS);

  const ops = await prisma.$transaction(async (tx) => {
    // Un ops « actif » = non expiré ET pas terminé par 3 défis (endedAt null).
    const ownerActive = await tx.ops.findFirst({
      where: { ownerLogin: me, expiresAt: { gt: now }, endedAt: null },
    });
    if (ownerActive) {
      throw new HTTPException(409, {
        message: `tu as déjà un ops actif (${ownerActive.targetLogin}) jusqu'au ${ownerActive.expiresAt.toISOString()}`,
      });
    }
    // Un reset admin (opsCooldownResetAt) neutralise le cooldown des ops terminés
    // avant cette date : on relève le seuil au max(cooldownThreshold, reset).
    const meUser = await tx.user.findUnique({
      where: { login: me },
      select: { opsCooldownResetAt: true },
    });
    const reset = meUser?.opsCooldownResetAt ?? null;
    const cooldownFloor = reset && reset > cooldownThreshold ? reset : cooldownThreshold;
    // Cooldown ancré sur la FIN effective du dernier ops (3 défis ou 24h). Prisma
    // ne sait pas coalescer endedAt/expiresAt dans un WHERE → on prend le dernier
    // ops et on tranche en JS.
    const lastOwnerOps = await tx.ops.findFirst({
      where: { ownerLogin: me },
      orderBy: { expiresAt: 'desc' },
    });
    if (lastOwnerOps) {
      const end = opsEffectiveEnd(lastOwnerOps);
      if (end > cooldownFloor) {
        const next = new Date(end.getTime() + OPS_COOLDOWN_MS);
        throw new HTTPException(409, {
          message: `cooldown actif jusqu'au ${next.toISOString()}`,
        });
      }
    }
    // NB : une même cible peut être l'ops de PLUSIEURS traqueurs à la fois — on
    // ne bloque plus une cible déjà ciblée par quelqu'un d'autre. Toute la
    // mécanique de défi forcé / pénalité / paris est indexée sur le COUPLE
    // (ownerLogin, targetLogin), donc les ops concurrents sur une même victime
    // ne se mélangent pas. La seule limite côté traqueur reste « un seul ops
    // actif à la fois » (ownerActive ci-dessus), ce qui garantit aussi qu'un
    // même couple (traqueur, cible) n'a jamais deux ops actifs en parallèle.
    // On autorise donc aussi à cibler quelqu'un qui traque déjà quelqu'un :
    // être traqueur ne protège pas d'être ciblé en retour.
    // Bouclier anti-ops : si cette cible a annulé un de MES ops avec un anti-ops
    // il y a moins de ANTI_OPS_SHIELD_MS, je ne peux pas la re-cibler.
    const shielded = await tx.ops.findFirst({
      where: {
        ownerLogin: me,
        targetLogin: target,
        cancelledByAntiOpsAt: { gt: new Date(now.getTime() - ANTI_OPS_SHIELD_MS) },
      },
      orderBy: { cancelledByAntiOpsAt: 'desc' },
    });
    if (shielded?.cancelledByAntiOpsAt) {
      const until = new Date(shielded.cancelledByAntiOpsAt.getTime() + ANTI_OPS_SHIELD_MS);
      throw new HTTPException(409, {
        message: `${target} a paré ton dernier OPS — protégé·e jusqu'au ${until.toISOString()}`,
      });
    }
    return tx.ops.create({
      data: {
        id: randomUUID(),
        ownerLogin: me,
        targetLogin: target,
        declaredAt: now,
        expiresAt: new Date(now.getTime() + OPS_DURATION_MS),
      },
      include: { target: { select: { login: true, imageUrl: true } } },
    });
  });
  emit([me, target], { type: 'ops:update', payload: ops });
  void notify(target, {
    type: 'ops_targeted',
    title: `@${me} t'a pris pour cible`,
    body: 'Un OPS te vise — tes 3 prochains défis face à lui sont forcés.',
    link: '/profile',
  });
  // Abonnés du traqueur ET de la cible (pref notifyOps) prévenus que le duel est
  // ouvert aux paris — chacun est invité à parier sur l'issue.
  void notifyFollowers(me, 'notifyOps', {
    type: 'follow_ops',
    title: `@${me} a lancé un OPS`,
    body: `Cible : @${target} — parie sur l'issue du duel !`,
    link: '/profile?tab=bets',
  });
  void notifyFollowers(target, 'notifyOps', {
    type: 'follow_ops',
    title: `@${target} est pris pour cible`,
    body: `Traqueur : @${me} — parie sur l'issue du duel !`,
    link: '/profile?tab=bets',
  });
  // Programme l'émission de `ops:update` à l'expiration + fin de cooldown.
  scheduleOpsTimers(me, target, ops.expiresAt);
  return c.json(ops, 201);
});

app.get('/ops/user/:login', async (c) => {
  await getCurrentLogin(c);
  const login = c.req.param('login');
  const now = new Date();
  const [asOwner, asTarget] = await Promise.all([
    prisma.ops.findFirst({
      where: { ownerLogin: login, expiresAt: { gt: now }, endedAt: null },
      include: { target: { select: { login: true, imageUrl: true } } },
    }),
    prisma.ops.findFirst({
      where: { targetLogin: login, expiresAt: { gt: now }, endedAt: null },
      include: { owner: { select: { login: true, imageUrl: true } } },
    }),
  ]);
  return c.json({ owns: asOwner, targetedBy: asTarget });
});

/* ============ ADMIN — USERS ============ */

// ─── Rate-limit : déblocage manuel (SUPERADMIN uniquement) ───────────────────

// Renvoie l'état de la pénalité de l'appelant — utile pour diagnostiquer.
// Les pénalités sont indexées par sujet (user:login quand authentifié), avec un
// repli sur l'IP pour les blocages pré-auth.
app.get('/admin/rate-limit/me', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const ip = clientIp(c);
  const subject = `user:${me.toLowerCase()}`;
  const info = getPenaltyInfo(subject) ?? getPenaltyInfo(`ip:${ip}`);
  return c.json({ subject, ip, penalty: info });
});

// Efface la pénalité de l'appelant (sujet user + IP) — à utiliser quand on est
// bloqué. Le bypass superadmin dans le rate-limiter global permet d'atteindre
// cet endpoint même puni, à condition de présenter son Bearer.
app.delete('/admin/rate-limit/me', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSuperAdmin(me);
  const ip = clientIp(c);
  const subject = `user:${me.toLowerCase()}`;
  clearPenalty(subject);
  clearPenalty(`ip:${ip}`);
  return c.json({ cleared: true, subject, ip });
});

app.get('/admin/users', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdminOrModerator(me);
  const users = await prisma.user.findMany({
    orderBy: [{ role: 'desc' }, { elo: 'desc' }],
  });
  return c.json(users);
});

app.patch('/admin/users/:login/stats', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canEditStats');
  const login = c.req.param('login');
  if (SUPERADMINS.has(login.toLowerCase()) && !SUPERADMINS.has(me.toLowerCase())) {
    throw new HTTPException(403, { message: "cannot modify a superadmin's stats" });
  }
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    elo: z.number().int().min(0).optional(),
    matchesPlayed: z.number().int().min(0).optional(),
    dodgeCount: z.number().int().min(0).optional(),
    tournamentsWon: z.number().int().min(0).optional(),
    // Gestion granulaire par discipline (smash / échecs).
    eloSmash: z.number().int().min(0).optional(),
    matchesPlayedSmash: z.number().int().min(0).optional(),
    tournamentsWonSmash: z.number().int().min(0).optional(),
    eloChess: z.number().int().min(0).optional(),
    matchesPlayedChess: z.number().int().min(0).optional(),
    tournamentsWonChess: z.number().int().min(0).optional(),
    eloSf: z.number().int().min(0).optional(),
    matchesPlayedSf: z.number().int().min(0).optional(),
    tournamentsWonSf: z.number().int().min(0).optional(),
    eloFlechettes: z.number().int().min(0).optional(),
    matchesPlayedFlechettes: z.number().int().min(0).optional(),
    tournamentsWonFlechettes: z.number().int().min(0).optional(),
    // Modes auxquels le joueur adhère.
    games: z.array(z.enum(['babyfoot', 'smash', 'chess', 'streetfighter', 'flechettes'])).min(1).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const before = await prisma.user.findUnique({
    where: { login },
    select: {
      elo: true,
      matchesPlayed: true,
      dodgeCount: true,
      tournamentsWon: true,
      eloSmash: true,
      matchesPlayedSmash: true,
      tournamentsWonSmash: true,
      eloChess: true,
      matchesPlayedChess: true,
      tournamentsWonChess: true,
      eloSf: true,
      matchesPlayedSf: true,
      tournamentsWonSf: true,
      eloFlechettes: true,
      matchesPlayedFlechettes: true,
      tournamentsWonFlechettes: true,
      games: true,
    },
  });
  const user = await prisma.user.update({ where: { login }, data: parsed.data })
    .catch(() => { throw new HTTPException(404, { message: 'user not found' }); });
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_STATS',
    target: login,
    payload: { before, after: parsed.data },
  });
  return c.json(user);
});

app.post('/admin/users/:login/ban', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canBan');
  const login = c.req.param('login');
  if (SUPERADMINS.has(login.toLowerCase())) {
    throw new HTTPException(400, { message: 'cannot ban a superadmin' });
  }
  const { user, tournamentsChanged } = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { login }, data: { bannedAt: new Date() } })
      .catch(() => { throw new HTTPException(404, { message: 'user not found' }); });
    // Un banni quitte les tournois : ceux qu'il a créés disparaissent, et sa
    // place est libérée là où il n'était qu'inscrit (phase d'inscription).
    const changed = await purgeUserFromTournaments(tx, login);
    // Ses défis/duels en cours sont annulés (plus de duel actif pour lui).
    await cancelUserChallenges(tx, login);
    await cancelUserFfas(tx, login);
    return { user: u, tournamentsChanged: changed };
  });
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'BAN_USER',
    target: login,
  });
  if (tournamentsChanged) broadcast({ type: 'tournament:update', payload: {} });
  return c.json({ login: user.login, bannedAt: user.bannedAt });
});

app.post('/admin/users/:login/unban', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canBan');
  const login = c.req.param('login');
  const user = await prisma.user.update({ where: { login }, data: { bannedAt: null } })
    .catch(() => { throw new HTTPException(404, { message: 'user not found' }); });
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'UNBAN_USER',
    target: login,
  });
  return c.json({ login: user.login, bannedAt: null });
});

app.get('/admin/users/:login/moderation', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdminOrModerator(me);
  const login = c.req.param('login');
  const [user, recentMatches, rejectionsEmitted, rejectionsReceived] = await Promise.all([
    prisma.user.findUnique({ where: { login } }),
    prisma.playedMatch.findMany({
      where: { OR: [{ playerALogin: login }, { playerBLogin: login }] },
      orderBy: { playedAt: 'desc' },
      take: 50,
    }),
    // Emitted: this player was opponent and chose to reject
    prisma.rejectedMatch.findMany({
      where: { opponentLogin: login },
      orderBy: { rejectedAt: 'desc' },
    }),
    // Received: someone rejected this player's declarations
    prisma.rejectedMatch.findMany({
      where: { declarerLogin: login },
      orderBy: { rejectedAt: 'desc' },
    }),
  ]);
  if (!user) throw new HTTPException(404, { message: 'user not found' });
  const opponentCounts: Record<string, number> = {};
  for (const m of recentMatches) {
    const opp = m.playerALogin === login ? m.playerBLogin : m.playerALogin;
    opponentCounts[opp] = (opponentCounts[opp] ?? 0) + 1;
  }
  const topOpponents = Object.entries(opponentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([opp, count]) => ({ login: opp, count }));
  return c.json({
    user,
    recentMatches,
    topOpponents,
    rejectionsEmitted,
    rejectionsReceived,
    // Permissions du modérateur (null si pas MODERATOR).
    moderatorPermissions: user.role === 'MODERATOR'
      ? (user.moderatorPermissions as ModeratorPermissions | null) ?? {}
      : null,
    availablePermissions: MODERATOR_PERMISSIONS,
  });
});

/* ============ ADMIN — MATCHES ============ */

app.delete('/admin/matches/:id', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canDeleteMatches');
  const id = c.req.param('id');
  const match = await prisma.playedMatch.findUnique({ where: { id } });
  if (!match) throw new HTTPException(404, { message: 'match not found' });
  await prisma.$transaction(async (tx) => {
    if (match.countedForElo) {
      await tx.user.update({
        where: { login: match.playerALogin },
        data: { elo: { decrement: match.deltaA }, matchesPlayed: { decrement: 1 } },
      });
      await tx.user.update({
        where: { login: match.playerBLogin },
        data: { elo: { decrement: match.deltaB }, matchesPlayed: { decrement: 1 } },
      });
    }
    await tx.playedMatch.delete({ where: { id } });
  });
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'DELETE_MATCH',
    payload: {
      matchId: id,
      playerA: match.playerALogin,
      playerB: match.playerBLogin,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      countedForElo: match.countedForElo,
    },
  });
  return c.json({ id, deleted: true });
});

app.patch('/admin/matches/:id', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canEditMatches');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const schema = z.object({
    scoreA: z.number().int().min(0),
    scoreB: z.number().int().min(0),
    playerALogin: z.string().trim().min(1).optional(),
    playerBLogin: z.string().trim().min(1).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const { scoreA, scoreB, playerALogin: nextPlayerA, playerBLogin: nextPlayerB } = parsed.data;
  if (nextPlayerA && nextPlayerB && nextPlayerA === nextPlayerB) {
    throw new HTTPException(400, { message: 'players must be different' });
  }
  const match = await prisma.playedMatch.findUnique({ where: { id } });
  if (!match) throw new HTTPException(404, { message: 'match not found' });

  const nextA = nextPlayerA ?? match.playerALogin;
  const nextB = nextPlayerB ?? match.playerBLogin;
  if (nextA === nextB) {
    throw new HTTPException(400, { message: 'players must be different' });
  }

  const game = parseGameId(match.game);
  // Nulle possible uniquement si la discipline l'autorise (échecs).
  const winner: 'A' | 'B' | 'draw' =
    scoreA === scoreB && getGameDef(game).hasDraw ? 'draw' : scoreA > scoreB ? 'A' : 'B';

  const updated = await prisma.$transaction(async (tx) => {
    if (match.countedForElo) {
      await tx.user.update({
        where: { login: match.playerALogin },
        data: { elo: { decrement: match.deltaA }, matchesPlayed: { decrement: 1 } },
      });
      await tx.user.update({
        where: { login: match.playerBLogin },
        data: { elo: { decrement: match.deltaB }, matchesPlayed: { decrement: 1 } },
      });
    }

    const priors = await tx.playedMatch.findMany({
      where: {
        id: { not: id },
        playerALogin: nextA,
        playerBLogin: nextB,
        game: match.game,
      },
      select: { playedAt: true, countedForElo: true },
    });
    const countsForElo = shouldCountForElo(priors, match.playedAt);

    const [userA, userB] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { login: nextA } }),
      tx.user.findUniqueOrThrow({ where: { login: nextB } }),
    ]);

    let deltaA = 0;
    let deltaB = 0;
    if (countsForElo) {
      const ratingA = readElo(userA, game);
      const ratingB = readElo(userB, game);
      const outcome = (game === 'smash' || game === 'streetfighter')
        ? {
            scoreA,
            scoreB,
            bestOf: match.bestOf ?? 3,
            winnerStocks: winner === 'A' ? (match.stocksA ?? 1) : (match.stocksB ?? 1),
          }
        : { scoreA, scoreB };
      const update = applyGameElo(game, ratingA, ratingB, winner, outcome);
      // Même dégressivité anti-farming qu'à la confirmation (rematch du jour).
      const factor = farmingDecayFactor(sameDayPriorCount(priors, match.playedAt));
      deltaA = applyFarmingDecay(update.deltaA, factor);
      deltaB = applyFarmingDecay(update.deltaB, factor);
      await tx.user.update({ where: { login: nextA }, data: ratingUpdate(game, ratingA + deltaA) });
      await tx.user.update({ where: { login: nextB }, data: ratingUpdate(game, ratingB + deltaB) });
    }

    return tx.playedMatch.update({
      where: { id },
      data: {
        playerALogin: nextA,
        playerBLogin: nextB,
        scoreA,
        scoreB,
        winner,
        countedForElo: countsForElo,
        deltaA,
        deltaB,
      },
    });
  });
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_MATCH',
    payload: {
      matchId: id,
      before: {
        playerA: match.playerALogin,
        playerB: match.playerBLogin,
        scoreA: match.scoreA,
        scoreB: match.scoreB,
        winner: match.winner,
      },
      after: {
        playerA: nextA,
        playerB: nextB,
        scoreA,
        scoreB,
        winner,
      },
    },
  });
  return c.json(updated);
});

app.get('/admin/rejected-matches', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canDeleteRejectedMatches');
  const list = await prisma.rejectedMatch.findMany({
    orderBy: { rejectedAt: 'desc' },
    take: 200,
  });
  return c.json(list);
});

app.delete('/admin/rejected-matches/:id', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canDeleteRejectedMatches');
  const { id } = c.req.param();
  const row = await prisma.rejectedMatch.findUnique({ where: { id } });
  if (!row) throw new HTTPException(404, { message: 'rejected match not found' });
  await prisma.rejectedMatch.delete({ where: { id } });
  void logAdminAction(c, {
    actor: me, actorRole: await getUserRole(me),
    action: 'DELETE_REJECTED_MATCH',
    target: row.declarerLogin,
    payload: { id, declarerLogin: row.declarerLogin, opponentLogin: row.opponentLogin },
  });
  return c.json({ id, deleted: true });
});

// ── Refonte contestation : arbitrage + réputation + malus ────────────────────
// Un litige (RejectedMatch status='open') est tranché par un admin/modérateur. La
// partie jugée fautive (faux score OU contestation abusive) prend un malus CROISSANT
// selon son nombre de litiges déjà perdus (`disputesLost`) :
//   1er : -20 Elo · -100 coins · 24 h sans déclarer/parier
//   2e  : -50 Elo · -250 coins · 48 h
//   3e+ : -100 Elo · -500 coins · 72 h
// `disputesLost` est aussi la « marque » de réputation affichée sur le profil.
const DISPUTE_MALUS_TIERS = [
  { elo: 20, coins: 100, cooldownH: 24 },
  { elo: 50, coins: 250, cooldownH: 48 },
  { elo: 100, coins: 500, cooldownH: 72 },
] as const;

async function applyDisputeMalusTx(
  tx: Prisma.TransactionClient,
  login: string,
  game: string,
  now: Date = new Date(),
): Promise<{ tier: number; elo: number; coins: number; cooldownUntil: Date }> {
  const u = await tx.user.findUnique({ where: { login }, select: { disputesLost: true } });
  const idx = Math.min(u?.disputesLost ?? 0, DISPUTE_MALUS_TIERS.length - 1);
  const t = DISPUTE_MALUS_TIERS[idx]!;
  const g = parseGameId(game);
  const cooldownUntil = new Date(now.getTime() + t.cooldownH * 60 * 60 * 1000);
  await tx.user.update({
    where: { login },
    data: {
      ...eloDelta(g, -t.elo),
      disputesLost: { increment: 1 },
      penaltyCooldownUntil: cooldownUntil,
    },
  });
  await grantCoinsTx(tx, login, -t.coins, { type: 'dispute_malus', meta: { game: g, elo: -t.elo, tier: idx + 1 } });
  return { tier: idx + 1, elo: t.elo, coins: t.coins, cooldownUntil };
}

const ResolveDisputeSchema = z.object({
  verdict: z.enum(['declarer_wrong', 'contester_wrong', 'dismiss']),
});

// Refuse l'action (déclaration de match / pari) si le joueur est sous cooldown de
// sanction de litige (penaltyCooldownUntil future). Décourage de re-déclarer/parier
// pendant la pénalité. No-op si aucun cooldown actif.
async function assertNotPenalized(login: string, action: 'déclarer un match' | 'parier', now: Date = new Date()): Promise<void> {
  const u = await prisma.user.findUnique({ where: { login }, select: { penaltyCooldownUntil: true } });
  if (u?.penaltyCooldownUntil && u.penaltyCooldownUntil.getTime() > now.getTime()) {
    const hrs = Math.ceil((u.penaltyCooldownUntil.getTime() - now.getTime()) / (60 * 60 * 1000));
    throw new HTTPException(403, {
      message: `Sanction de litige en cours : tu ne peux pas ${action} pendant encore ~${hrs} h.`,
    });
  }
}

// GET /admin/disputes?status=open|all — file d'arbitrage des litiges.
app.get('/admin/disputes', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canDeleteRejectedMatches');
  const status = c.req.query('status') ?? 'open';
  const list = await prisma.rejectedMatch.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { rejectedAt: 'desc' },
    take: 200,
  });
  return c.json(list);
});

// POST /admin/disputes/:id/resolve — tranche un litige (et applique le malus au
// fautif si verdict != 'dismiss').
app.post('/admin/disputes/:id/resolve', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canDeleteRejectedMatches');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = ResolveDisputeSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const { verdict } = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    const d = await tx.rejectedMatch.findUnique({ where: { id } });
    if (!d) throw new HTTPException(404, { message: 'litige introuvable' });
    if (d.status !== 'open') throw new HTTPException(409, { message: 'litige déjà tranché' });
    const culprit =
      verdict === 'declarer_wrong' ? d.declarerLogin : verdict === 'contester_wrong' ? d.opponentLogin : null;
    const malus = culprit ? await applyDisputeMalusTx(tx, culprit, d.game) : null;
    await tx.rejectedMatch.update({
      where: { id },
      data: {
        status: 'resolved',
        resolution: verdict === 'dismiss' ? 'dismissed' : verdict,
        resolvedBy: me,
        resolvedAt: new Date(),
      },
    });
    return { culprit, malus };
  });

  if (result.culprit && result.malus) {
    void notifyMany([result.culprit], {
      type: 'dispute_malus',
      title: 'Litige tranché en ta défaveur',
      body: `Sanction : -${result.malus.elo} Elo, -${result.malus.coins} coins, déclaration & paris bloqués ${DISPUTE_MALUS_TIERS[Math.min(result.malus.tier - 1, 2)]!.cooldownH} h (litige n°${result.malus.tier}).`,
    });
    emit([result.culprit], { type: 'panel:update', payload: {} });
  }
  return c.json({ id, status: 'resolved', verdict, culprit: result.culprit, malus: result.malus });
});

app.delete('/admin/pending-matches/:id', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canDeletePendingMatches');
  const { id } = c.req.param();
  const row = await prisma.pendingMatch.findUnique({ where: { id } });
  if (!row) throw new HTTPException(404, { message: 'pending match not found' });
  await prisma.pendingMatch.delete({ where: { id } });
  emit([row.declarerLogin, row.opponentLogin], { type: 'match:cancelled', payload: { id, cancelledBy: me } });
  void logAdminAction(c, {
    actor: me, actorRole: await getUserRole(me),
    action: 'DELETE_PENDING_MATCH',
    target: row.declarerLogin,
    payload: { id, declarerLogin: row.declarerLogin, opponentLogin: row.opponentLogin },
  });
  return c.json({ id, deleted: true });
});

app.delete('/admin/challenges/:id', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canDeleteChallenges');
  const { id } = c.req.param();
  const row = await prisma.challenge.findUnique({ where: { id } });
  if (!row) throw new HTTPException(404, { message: 'challenge not found' });
  // Duel d'ops : rembourser ses paris AVANT le delete (le cascade les effacerait
  // sinon, mise perdue), puis supprimer.
  const refunded = await prisma.$transaction(async (tx) => {
    const r = row.opsId ? await refundBetsTx(tx, { targetType: 'ops', challengeId: id }) : [];
    await tx.challenge.delete({ where: { id } });
    return r;
  });
  if (refunded.length) emit([...new Set(refunded)], { type: 'panel:update', payload: {} });
  void logAdminAction(c, {
    actor: me, actorRole: await getUserRole(me),
    action: 'DELETE_CHALLENGE',
    target: row.challengerLogin,
    payload: { id, challengerLogin: row.challengerLogin, opponentLogin: row.opponentLogin, status: row.status },
  });
  return c.json({ id, deleted: true });
});

app.delete('/admin/ops/:id', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canDeleteOps');
  const { id } = c.req.param();
  const row = await prisma.ops.findUnique({ where: { id } });
  if (!row) throw new HTTPException(404, { message: 'ops not found' });
  // Rembourse les paris encore ouverts AVANT le delete (le cascade les effacerait
  // sinon, mise perdue), puis supprime l'ops.
  const refunded = await prisma.$transaction(async (tx) => {
    const r = await refundBetsTx(tx, { targetType: 'ops', opsId: id });
    await tx.ops.delete({ where: { id } });
    return r;
  });
  emit([row.ownerLogin, row.targetLogin], { type: 'ops:update', payload: {} });
  if (refunded.length) emit([...new Set(refunded)], { type: 'panel:update', payload: {} });
  void logAdminAction(c, {
    actor: me, actorRole: await getUserRole(me),
    action: 'DELETE_OPS',
    target: row.ownerLogin,
    payload: { id, ownerLogin: row.ownerLogin, targetLogin: row.targetLogin },
  });
  return c.json({ id, deleted: true });
});

// Reset du cooldown d'ops d'un joueur : pose opsCooldownResetAt = now, ce qui
// neutralise le cooldown hérité de tous ses ops déjà terminés. Le joueur peut
// re-déclarer un ops immédiatement (sauf s'il en a déjà un actif — limite
// « un seul à la fois » inchangée).
app.post('/admin/ops/:login/reset-cooldown', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canResetOpsCooldown');
  const login = c.req.param('login');
  const now = new Date();
  const user = await prisma.user
    .update({ where: { login }, data: { opsCooldownResetAt: now } })
    .catch(() => {
      throw new HTTPException(404, { message: 'user not found' });
    });
  emit([login], { type: 'ops:update', payload: {} });
  void logAdminAction(c, {
    actor: me, actorRole: await getUserRole(me),
    action: 'RESET_OPS_COOLDOWN',
    target: login,
    payload: { login, resetAt: now.toISOString() },
  });
  return c.json({ login, cooldownReset: true, resetAt: user.opsCooldownResetAt });
});

// Suppression d'un tournoi par un admin (n'importe quel statut, y compris terminé).
// Si le tournoi était terminé, on décrémente le compteur de victoires du vainqueur.
app.delete('/admin/tournaments/:id', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canDeleteTournaments');
  const { id } = c.req.param();
  const row = await prisma.tournament.findUnique({ where: { id } });
  if (!row) throw new HTTPException(404, { message: 'tournament not found' });
  const refunded = await prisma.$transaction(async (tx) => {
    if (row.status === 'finished' && row.winnerLogin) {
      await tx.user.update({
        where: { login: row.winnerLogin },
        data: tournamentsWonDelta(parseGameId(row.game), -1),
      });
    }
    // Rembourse les paris encore ouverts (no-op sur un tournoi terminé : ses
    // paris sont déjà réglés) avant le cascade de suppression.
    const r = await refundOpenBetsForTournamentTx(tx, id);
    await cleanupOrphanPrizeTx(tx, row);
    await tx.tournament.delete({ where: { id } }); // cascade → entries + matchs
    return r;
  });
  if (refunded.length) emit(refunded, { type: 'panel:update', payload: {} });
  broadcast({ type: 'tournament:update', payload: {} });
  void logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'DELETE_TOURNAMENT',
    target: row.createdByLogin,
    payload: { id, name: row.name, kind: row.kind, status: row.status, winnerLogin: row.winnerLogin },
  });
  return c.json({ id, deleted: true });
});

// Admin : forcer l'acceptation d'une invitation (le joueur invité est inscrit
// d'office). Auto-start si le tournoi atteint sa capacité — même chemin que la
// route /accept normale.
app.post('/admin/tournaments/:id/invites/:inviteId/force-accept', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const { id, inviteId } = c.req.param();

  const { started, invitee } = await prisma.$transaction(async (tx) => {
    const invite = await tx.tournamentInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.tournamentId !== id) {
      throw new HTTPException(404, { message: 'invitation introuvable' });
    }
    const t = await tx.tournament.findUnique({ where: { id }, include: { entries: true } });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });
    if (t.status !== 'registration') {
      throw new HTTPException(409, { message: 'le tournoi n’est plus en phase d’inscription' });
    }

    // Marque l'invite acceptée (idempotent : ne réécrit pas decidedAt si déjà décidée).
    await tx.tournamentInvite.update({
      where: { id: inviteId },
      data: {
        status: 'accepted',
        decidedAt: invite.decidedAt ?? new Date(),
      },
    });

    // Crée l'entry si absente (idempotent — re-invite / déjà inscrit).
    const already = t.entries.some((e) => e.login === invite.inviteeLogin);
    if (already) {
      return { started: false, invitee: invite.inviteeLogin };
    }
    await tx.tournamentEntry.create({ data: { tournamentId: id, login: invite.inviteeLogin } });

    // Ligue : pas d'auto-démarrage (lancement manuel par l'organisateur).
    const newCount = t.entries.length + 1;
    if (t.format !== 'league' && newCount === t.capacity) {
      const logins = [...t.entries.map((e) => e.login), invite.inviteeLogin];
      await launchTournamentMatches(id, t.format, logins);
      await tx.tournament.update({
        where: { id },
        data: { status: 'in_progress', startedAt: new Date() },
      });
      void notifyMany(logins, {
        type: 'tournament',
        title: `Tournoi "${t.name}" lancé`,
        body: 'Le bracket est généré — à toi de jouer !',
        link: `/tournaments/${id}`,
      });
      return { started: true, invitee: invite.inviteeLogin };
    }
    return { started: false, invitee: invite.inviteeLogin };
  });

  broadcast({ type: 'tournament:update', payload: {} });
  void notify(invitee, {
    type: 'tournament',
    title: 'Inscription confirmée par un admin',
    body: 'Tu as été inscrit à un tournoi.',
    link: `/tournaments/${id}`,
  });
  void logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_MATCH',
    target: invitee,
    payload: { forced: 'force-accept', tournamentId: id, inviteId, invitee, started },
  });

  return c.json({ id, inviteId, status: 'accepted' as const, started });
});

// Admin : forcer le résultat d'un match de tournoi (sans confirmation des joueurs).
// Pose le score + le gagnant + confirmedAt, puis applique EXACTEMENT la même
// propagation que la confirmation normale (paris, bracket, finale, récompense).
app.post('/admin/tournaments/:id/matches/:matchId/force-result', async (c) => {
  const me = await getCurrentLogin(c);
  const id = c.req.param('id');
  const matchId = c.req.param('matchId');
  // Officiant : admin/superadmin partout, OU le créateur d'un tournoi amical.
  // Lui permet de saisir le score d'autorité sans jouer le match.
  const owner = await prisma.tournament.findUnique({
    where: { id },
    select: { createdByLogin: true, coOrganizers: true, kind: true },
  });
  if (!owner) throw new HTTPException(404, { message: 'tournament not found' });
  const ownerIsFriendlyOrganizer = isTournamentManager(owner, me) && owner.kind === 'friendly';
  if (!(await isAdminLogin(me)) && !ownerIsFriendlyOrganizer) {
    throw new HTTPException(403, {
      message: 'admins or the organizer of a friendly tournament only',
    });
  }
  const body = await c.req.json().catch(() => null);
  const parsed = TournamentForceResultSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { scoreA, scoreB } = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    const m = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!m || m.tournamentId !== id) {
      throw new HTTPException(404, { message: 'match not found' });
    }
    if (m.confirmedAt) {
      throw new HTTPException(409, { message: 'match already confirmed' });
    }
    if (!m.playerALogin || !m.playerBLogin) {
      throw new HTTPException(409, {
        message: 'match has no players yet (previous round pending)',
      });
    }
    // Validation du score selon la discipline du tournoi (même règle que record/confirm).
    const tour = await tx.tournament.findUnique({ where: { id }, select: { game: true } });
    const scoreErr = validateTournamentScore(parseGameId(tour?.game), scoreA, scoreB, {
      freeGoals: m.stage === 'league' || m.stage === 'bracket',
      allowDraw: m.stage === 'league',
    });
    if (scoreErr) throw new HTTPException(400, { message: scoreErr });

    // Nul possible en ligue (scores égaux) → pas de vainqueur.
    const winnerLogin =
      scoreA === scoreB ? null : scoreA > scoreB ? m.playerALogin : m.playerBLogin;
    await tx.tournamentMatch.update({
      where: { id: matchId },
      data: {
        scoreA,
        scoreB,
        recordedByLogin: me,
        recordedAt: new Date(),
        winnerLogin,
        confirmedAt: new Date(),
        // Ferme les paris s'ils ne l'étaient pas déjà (cohérent avec record).
        betsLockedAt: m.betsLockedAt ?? new Date(),
      },
    });
    // Propagation partagée avec la route /confirm (comportement IDENTIQUE).
    return settleConfirmedTournamentMatch(tx, id, {
      id: m.id,
      stage: m.stage,
      round: m.round,
      slot: m.slot,
      winnerLogin,
      playerALogin: m.playerALogin,
      playerBLogin: m.playerBLogin,
    });
  });

  // Emits/notifs APRÈS commit (jamais dans la transaction) — calqués sur /confirm.
  if (result.finished && result.prizeAwarded && result.winnerLogin) {
    emit([result.winnerLogin], { type: 'panel:update', payload: {} });
  }
  if (result.betWinners.length) {
    emit(result.betWinners, { type: 'panel:update', payload: {} });
  }
  if (result.bracketGenerated) {
    const players = await prisma.tournamentEntry.findMany({
      where: { tournamentId: id },
      select: { login: true },
    });
    void notifyMany(players.map((p) => p.login), {
      type: 'tournament',
      title: 'Phase de poules terminée',
      body: 'Le bracket des qualifiés est prêt — place à l’élimination directe !',
      link: `/tournaments/${id}`,
      game: await tournamentGame(id),
    });
  }
  broadcast({ type: 'tournament:update', payload: {} });
  void logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_MATCH',
    target: result.winnerLogin,
    payload: {
      forced: 'force-result',
      tournamentId: id,
      matchId,
      scoreA,
      scoreB,
      winnerLogin: result.winnerLogin,
      finished: result.finished,
    },
  });

  return c.json({
    id: matchId,
    winnerLogin: result.winnerLogin,
    finished: result.finished,
    bracketGenerated: result.bracketGenerated,
  });
});

/* ─── Admin : gestion complète d'un tournoi (panneau /god) ─────────────────── */

// Admin : annuler (retirer) une invitation en attente — la ligne disparaît de la
// liste « en attente ». Idempotent côté UI (404 si déjà retirée).
app.post('/admin/tournaments/:id/invites/:inviteId/cancel', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const { id, inviteId } = c.req.param();
  const invite = await prisma.tournamentInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.tournamentId !== id) {
    throw new HTTPException(404, { message: 'invitation introuvable' });
  }
  await prisma.tournamentInvite.delete({ where: { id: inviteId } });
  broadcast({ type: 'tournament:update', payload: {} });
  void logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_MATCH',
    target: invite.inviteeLogin,
    payload: { forced: 'cancel-invite', tournamentId: id, inviteId, invitee: invite.inviteeLogin },
  });
  return c.json({ id, inviteId, cancelled: true });
});

// Admin : retirer un participant inscrit. Réservé à la phase d'inscription —
// retirer un joueur d'un bracket déjà lancé corromprait l'arbre.
app.post('/admin/tournaments/:id/entries/:login/remove', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const { id, login } = c.req.param();
  await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({ where: { id } });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });
    if (t.status !== 'registration') {
      throw new HTTPException(409, { message: 'le tournoi a démarré — impossible de retirer un joueur' });
    }
    const entry = await tx.tournamentEntry.findUnique({
      where: { tournamentId_login: { tournamentId: id, login } },
    });
    if (!entry) throw new HTTPException(404, { message: 'participant introuvable' });
    await tx.tournamentEntry.delete({
      where: { tournamentId_login: { tournamentId: id, login } },
    });
  });
  broadcast({ type: 'tournament:update', payload: {} });
  void logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_MATCH',
    target: login,
    payload: { forced: 'remove-entry', tournamentId: id, login },
  });
  return c.json({ id, removed: login });
});

// Admin : ajouter directement un joueur (phase d'inscription). Auto-start si la
// capacité est atteinte — même chemin que /tournaments/:id/add-player.
app.post('/admin/tournaments/:id/players', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = AddTournamentPlayerSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const login = parsed.data.login;

  // Le GOD n'inscrit pas directement : il envoie une invitation EN ATTENTE. Le
  // joueur doit accepter (ou le GOD « Forcer l'acceptation ») pour devenir
  // participant. Logique idempotente identique à POST /tournaments/:id/invite.
  const invite = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({ where: { id }, include: { entries: true } });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });
    if (t.mode === '2v2') {
      throw new HTTPException(400, { message: 'tournoi 2v2 : pas d\'invitations — ajoute directement une paire' });
    }
    if (t.status !== 'registration') {
      throw new HTTPException(409, { message: `tournament is ${t.status}` });
    }
    const target = await tx.user.findUnique({ where: { login } });
    if (!target || target.bannedAt || target.anonymizedAt || target.deletionScheduledAt) {
      throw new HTTPException(404, { message: `joueur introuvable : ${login}` });
    }
    if (t.entries.some((e) => e.login === login)) {
      throw new HTTPException(409, { message: 'joueur déjà inscrit' });
    }
    // Ligue : capacité indicative, inscription au-delà du nombre déclaré permise.
    if (t.format !== 'league' && t.entries.length >= t.capacity) {
      throw new HTTPException(409, { message: 'tournoi complet' });
    }
    // Idempotent : invitation déjà en attente → on la renvoie ; après un refus,
    // on la repasse en pending.
    const existing = await tx.tournamentInvite.findUnique({
      where: { tournamentId_inviteeLogin: { tournamentId: id, inviteeLogin: login } },
    });
    if (existing) {
      if (existing.status === 'pending') return existing;
      return tx.tournamentInvite.update({
        where: { id: existing.id },
        data: { status: 'pending', decidedAt: null },
      });
    }
    return tx.tournamentInvite.create({
      data: { id: randomUUID(), tournamentId: id, inviterLogin: me, inviteeLogin: login },
    });
  });
  const invTournament = await prisma.tournament.findUnique({
    where: { id },
    select: { name: true, game: true },
  });
  void notify(login, {
    type: 'tournament_invite',
    title: `Invitation au tournoi "${invTournament?.name}"`,
    body: `@${me} t'invite à rejoindre le tournoi`,
    link: `/tournaments/${id}`,
    game: invTournament?.game ?? undefined,
  });
  emit([login], { type: 'tournament:invite', payload: { tournamentId: id, inviteId: invite.id } });
  broadcast({ type: 'tournament:update', payload: {} });
  void logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_MATCH',
    target: login,
    payload: { forced: 'invite-player', tournamentId: id, login, inviteId: invite.id },
  });
  return c.json({ id, invited: login, inviteId: invite.id, status: 'pending' }, 201);
});

// Admin : forcer le lancement d'un tournoi en inscription, même incomplet
// (>= 2 joueurs ; le bracket gère les byes). Génère le bracket / les poules.
app.post('/admin/tournaments/:id/start', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const id = c.req.param('id');
  const launched = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({ where: { id }, include: { entries: true } });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });
    if (t.status !== 'registration') {
      throw new HTTPException(409, { message: `tournament is ${t.status}` });
    }
    if (t.entries.length < 2) {
      throw new HTTPException(409, { message: 'il faut au moins 2 joueurs pour lancer' });
    }
    if (t.format === 'pools' && t.entries.length < 12) {
      throw new HTTPException(409, { message: 'les poules nécessitent au moins 12 joueurs' });
    }
    const logins = t.entries.map((e) => e.login);
    await launchTournamentMatches(id, t.format, logins);
    await tx.tournament.update({
      where: { id },
      data: { status: 'in_progress', startedAt: new Date() },
    });
    return logins;
  });
  void notifyMany(launched, {
    type: 'tournament',
    title: 'Tournoi lancé',
    body: 'Le bracket est généré — à toi de jouer !',
    link: `/tournaments/${id}`,
  });
  broadcast({ type: 'tournament:update', payload: {} });
  void logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_MATCH',
    target: me,
    payload: { forced: 'start', tournamentId: id, players: launched.length },
  });
  return c.json({ id, started: true, players: launched.length });
});

// Admin : modifier les paramètres d'un tournoi. name / kind / isPrivate éditables
// à tout moment ; capacity / format uniquement en inscription (le bracket est figé
// une fois lancé).
const AdminUpdateTournamentSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  kind: z.enum(['friendly', 'official']).optional(),
  isPrivate: z.boolean().optional(),
  // Élimination/poules : puissance de 2 (8/16/32/64) — vérifié dans le handler
  // selon le format effectif (la ligue autorise un nombre libre, min 3).
  capacity: z.number().int().min(3).max(64).optional(),
  format: z.enum(['elimination', 'pools', 'league']).optional(),
  // Économie (officiels) : multiplicateur final du pari (2..10) + cash-prize du
  // champion (0/null = aucun). Modifiables tant que le tournoi n'est pas terminé.
  betFinalMult: z.number().int().min(BET_FINAL_MULT_MIN).max(BET_FINAL_MULT_MAX).optional(),
  cashPrizeBase: z.number().int().min(0).max(1_000_000).nullable().optional(),
});

app.patch('/admin/tournaments/:id', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = AdminUpdateTournamentSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const patch = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.findUnique({ where: { id }, include: { entries: true } });
    if (!t) throw new HTTPException(404, { message: 'tournament not found' });

    const data: Prisma.TournamentUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.kind !== undefined) data.kind = patch.kind;
    if (patch.isPrivate !== undefined) data.isPrivate = patch.isPrivate;
    if (patch.betFinalMult !== undefined) data.betFinalMult = patch.betFinalMult;
    if (patch.cashPrizeBase !== undefined) data.cashPrizeBase = patch.cashPrizeBase;

    if (patch.capacity !== undefined || patch.format !== undefined) {
      if (t.status !== 'registration') {
        throw new HTTPException(409, { message: 'capacité / format non modifiables après le lancement' });
      }
      const nextCapacity = patch.capacity ?? t.capacity;
      const nextFormat = patch.format ?? t.format;
      if (nextCapacity < t.entries.length) {
        throw new HTTPException(409, { message: `capacité < inscrits (${t.entries.length})` });
      }
      // Élimination/poules : capacité = puissance de 2 ≥ 8. La ligue échappe à la règle.
      if (nextFormat !== 'league' && (nextCapacity < 8 || (nextCapacity & (nextCapacity - 1)) !== 0)) {
        throw new HTTPException(409, { message: 'la capacité doit être une puissance de 2 (8, 16, 32, 64)' });
      }
      if (nextFormat === 'pools' && nextCapacity < 12) {
        throw new HTTPException(409, { message: 'les poules nécessitent au moins 12 joueurs' });
      }
      if (patch.capacity !== undefined) data.capacity = patch.capacity;
      if (patch.format !== undefined) data.format = patch.format;
    }

    return tx.tournament.update({ where: { id }, data });
  });
  broadcast({ type: 'tournament:update', payload: {} });
  void logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'EDIT_MATCH',
    target: updated.createdByLogin,
    payload: { forced: 'edit-tournament', tournamentId: id, patch },
  });
  return c.json({ id, updated: true });
});

app.get('/admin/suspicious', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canViewSuspicious');

  const [allMatches, allUsers] = await Promise.all([
    prisma.playedMatch.findMany({ orderBy: { playedAt: 'asc' } }),
    prisma.user.findMany({ select: { login: true, elo: true, matchesPlayed: true } }),
  ]);

  type Flag = {
    type: 'pair_domination' | 'recent_farming' | 'elo_spike' | 'victim_pattern';
    severity: 'low' | 'medium' | 'high';
    players: string[];
    detail: string;
    matchCount?: number;
    winRate?: number;
    eloGain?: number;
  };

  const flags: Flag[] = [];
  const now = new Date();
  const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // ── Build pair stats ───────────────────────────────────────────────────
  type PairEntry = { playerA: string; playerB: string; matches: { winner: string; playedAt: Date }[] };
  const pairs = new Map<string, PairEntry>();

  for (const m of allMatches) {
    if (m.winner === 'draw') continue; // les nuls ne nourrissent pas les heuristiques de domination
    const [a, b] = m.playerALogin < m.playerBLogin
      ? [m.playerALogin, m.playerBLogin]
      : [m.playerBLogin, m.playerALogin];
    const key = `${a}|||${b}`;
    let entry = pairs.get(key);
    if (!entry) {
      entry = { playerA: a, playerB: b, matches: [] };
      pairs.set(key, entry);
    }
    const winner = m.winner === 'A' ? m.playerALogin : m.playerBLogin;
    entry.matches.push({ winner, playedAt: m.playedAt });
  }

  // ── Per-player overall win rates (for victim_pattern) ─────────────────
  const playerWins = new Map<string, { wins: number; total: number }>();
  for (const m of allMatches) {
    if (m.winner === 'draw') continue;
    const winnerLogin = m.winner === 'A' ? m.playerALogin : m.playerBLogin;
    const loserLogin  = m.winner === 'A' ? m.playerBLogin : m.playerALogin;
    const w = playerWins.get(winnerLogin) ?? { wins: 0, total: 0 };
    w.wins++; w.total++;
    playerWins.set(winnerLogin, w);
    const l = playerWins.get(loserLogin) ?? { wins: 0, total: 0 };
    l.total++;
    playerWins.set(loserLogin, l);
  }

  // ── Pair-based flags ───────────────────────────────────────────────────
  for (const { playerA, playerB, matches } of pairs.values()) {
    const total = matches.length;
    if (total < 3) continue;

    const winsA = matches.filter(m => m.winner === playerA).length;
    const winRateA = winsA / total;
    const dominant   = winRateA >= 0.5 ? playerA : playerB;
    const dominated  = winRateA >= 0.5 ? playerB : playerA;
    const dominantWR = Math.max(winRateA, 1 - winRateA);

    // Pair domination: one side wins 75%+ over 5+ matches
    if (total >= 5 && dominantWR >= 0.75) {
      const severity: Flag['severity'] = dominantWR >= 0.9 ? 'high' : dominantWR >= 0.83 ? 'medium' : 'low';
      flags.push({
        type: 'pair_domination',
        severity,
        players: [dominant, dominated],
        detail: `${dominant} gagne ${Math.round(dominantWR * 100)}% des matchs face à ${dominated} sur ${total} confrontations.`,
        matchCount: total,
        winRate: dominantWR,
      });
    }

    // Recent farming: 15+ matches in 7 days between same pair (2+ per day per player)
    const recentCount = matches.filter(m => m.playedAt >= day7Ago).length;
    if (recentCount >= 15) {
      flags.push({
        type: 'recent_farming',
        severity: recentCount >= 20 ? 'high' : 'medium',
        players: [playerA, playerB],
        detail: `${playerA} et ${playerB} ont joué ${recentCount} fois ensemble ces 7 derniers jours — rythme anormalement élevé.`,
        matchCount: recentCount,
      });
    }

    // Victim pattern: victim has decent global win rate but consistently loses vs one specific player
    if (total >= 5 && dominantWR >= 0.8) {
      const victimOverall = playerWins.get(dominated);
      if (victimOverall && victimOverall.total >= 8) {
        const victimGlobalWR = victimOverall.wins / victimOverall.total;
        // Globally decent (>35%) but crushed in this matchup → targeted
        if (victimGlobalWR >= 0.35) {
          flags.push({
            type: 'victim_pattern',
            severity: 'high',
            players: [dominant, dominated],
            detail: `${dominated} gagne ${Math.round(victimGlobalWR * 100)}% de ses matchs globalement, mais perd ${Math.round(dominantWR * 100)}% face à ${dominant} spécifiquement. Possible don d'ELO volontaire.`,
            matchCount: total,
            winRate: dominantWR,
          });
        }
      }
    }
  }

  // ── Per-player ELO spike (last 30 days, z-score) ──────────────────────
  const playerGains = new Map<string, { login: string; gain: number; count: number }>();

  for (const m of allMatches) {
    if (m.playedAt < day30Ago || !m.countedForElo) continue;
    const a = playerGains.get(m.playerALogin) ?? { login: m.playerALogin, gain: 0, count: 0 };
    a.gain += m.deltaA; a.count++;
    playerGains.set(m.playerALogin, a);
    const b = playerGains.get(m.playerBLogin) ?? { login: m.playerBLogin, gain: 0, count: 0 };
    b.gain += m.deltaB; b.count++;
    playerGains.set(m.playerBLogin, b);
  }

  const activePlayers = [...playerGains.values()].filter(p => p.count >= 5);
  if (activePlayers.length >= 3) {
    const gainValues = activePlayers.map(p => p.gain);
    const avg = gainValues.reduce((s, v) => s + v, 0) / gainValues.length;
    const variance = gainValues.reduce((s, v) => s + (v - avg) ** 2, 0) / gainValues.length;
    const std = Math.sqrt(variance);
    const threshold = avg + 2 * std;

    for (const p of activePlayers) {
      if (p.gain > threshold && p.gain > 80) {
        const severity: Flag['severity'] = p.gain > avg + 3 * std ? 'high' : 'medium';
        flags.push({
          type: 'elo_spike',
          severity,
          players: [p.login],
          detail: `${p.login} a gagné +${p.gain} ELO en 30 jours (${p.count} matchs). Moyenne communauté : ${Math.round(avg > 0 ? avg : 0)} ELO (+${Math.round(p.gain - avg)} au-dessus).`,
          matchCount: p.count,
          eloGain: p.gain,
        });
      }
    }
  }

  // Sort: high → medium → low, deduplicate pair flags (keep highest severity)
  const seen = new Set<string>();
  const deduped: Flag[] = [];
  const order = { high: 0, medium: 1, low: 2 } as const;
  flags.sort((a, b) => order[a.severity] - order[b.severity]);
  for (const f of flags) {
    const key = `${f.type}:${[...f.players].sort().join(':')}`;
    if (!seen.has(key)) { seen.add(key); deduped.push(f); }
  }

  return c.json(deduped);
});

const AuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  actor: z.string().min(1).max(64).optional(),
  target: z.string().min(1).max(64).optional(),
  action: z
    .enum([
      'SET_ROLE', 'BAN_USER', 'UNBAN_USER', 'EDIT_STATS',
      'EDIT_TITLE', 'DELETE_MATCH', 'EDIT_MATCH', 'REFRESH_IMAGES',
    ])
    .optional(),
});

// =========================================================================
// ANALYTICS — télémétrie d'usage produit (pages vues + interactions)
// =========================================================================
// Distinct de l'audit admin (AdminAuditLog) : ici on mesure l'usage réel de l'app
// pour alimenter le tableau de bord GOD (pages les + vues, boutons les + cliqués,
// actifs vs inscrits, par jeu & global). Ingestion best-effort : un échec ne doit
// JAMAIS casser l'UX → on avale les erreurs et on répond 204 quoi qu'il arrive.

const ANALYTICS_GAMES = ['babyfoot', 'smash', 'chess', 'streetfighter', 'flechettes'] as const;

const TrackBatchSchema = z.object({
  events: z
    .array(
      z.object({
        type: z.enum(['pageview', 'event']),
        name: z.string().min(1).max(200),
        game: z.enum(ANALYTICS_GAMES).nullish(),
      }),
    )
    .min(1)
    .max(50),
});

app.post('/analytics/track', async (c) => {
  const me = await getCurrentLogin(c);
  const body = await c.req.json().catch(() => null);
  const parsed = TrackBatchSchema.safeParse(body);
  // Payload invalide : on ne lève pas (télémétrie best-effort), on ignore.
  if (!parsed.success) return c.body(null, 204);
  try {
    await prisma.analyticsEvent.createMany({
      data: parsed.data.events.map((e) => ({
        id: randomUUID(),
        login: me,
        type: e.type,
        name: e.name,
        game: e.game ?? null,
      })),
    });
  } catch {
    // FK manquante (login non persisté), DB indispo… : on n'échoue jamais ici.
  }
  return c.body(null, 204);
});

// Vue d'ensemble agrégée pour l'onglet STATS du panneau GOD.
//   ?days=N   fenêtre glissante (défaut 30, borné 1..365)
//   ?game=ID  restreint pages/events/actifs à une discipline (sinon global)
app.get('/admin/stats/overview', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canViewStats');
  const url = new URL(c.req.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const gameParam = url.searchParams.get('game');
  const game = (ANALYTICS_GAMES as readonly string[]).includes(gameParam ?? '') ? gameParam! : null;
  const since = new Date(Date.now() - days * 86_400_000);
  const baseWhere = { createdAt: { gte: since }, ...(game ? { game } : {}) };

  // Totaux inscrits : tous comptes, et comptes 42 réels (ftId non nul → hors faux joueurs).
  const [registered, registeredReal, activeRows, pageRows, eventRows] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { ftId: { not: null } } }),
    // Actifs = logins distincts ayant émis un événement sur la fenêtre.
    prisma.analyticsEvent.findMany({ where: baseWhere, distinct: ['login'], select: { login: true } }),
    prisma.analyticsEvent.groupBy({
      by: ['name'],
      where: { ...baseWhere, type: 'pageview' },
      _count: { name: true },
      orderBy: { _count: { name: 'desc' } },
      take: 20,
    }),
    prisma.analyticsEvent.groupBy({
      by: ['name'],
      where: { ...baseWhere, type: 'event' },
      _count: { name: true },
      orderBy: { _count: { name: 'desc' } },
      take: 20,
    }),
  ]);

  // Par jeu : inscrits (opt-in via games[]), joueurs actifs (ont réellement joué sur
  // la fenêtre) et nombre de matchs joués (1v1/2v2 + FFA Smash/Fléchettes).
  const perGame = await Promise.all(
    ANALYTICS_GAMES.map(async (g) => {
      const [reg, mm, ffa] = await Promise.all([
        prisma.user.count({ where: { games: { has: g } } }),
        prisma.playedMatch.findMany({
          where: { game: g, playedAt: { gte: since } },
          select: { playerALogin: true, playerBLogin: true, playerA2Login: true, playerB2Login: true },
        }),
        prisma.playedFfa.findMany({
          where: { game: g, playedAt: { gte: since } },
          select: { participants: { select: { login: true } } },
        }),
      ]);
      const players = new Set<string>();
      for (const m of mm) {
        players.add(m.playerALogin);
        players.add(m.playerBLogin);
        if (m.playerA2Login) players.add(m.playerA2Login);
        if (m.playerB2Login) players.add(m.playerB2Login);
      }
      for (const f of ffa) for (const p of f.participants) players.add(p.login);
      return { game: g, registered: reg, activePlayers: players.size, matches: mm.length + ffa.length };
    }),
  );

  // Timelines journalières : nouvelles inscriptions & actifs distincts (date_trunc en UTC).
  const gameFilter = game ? PrismaRuntime.sql`AND "game" = ${game}` : PrismaRuntime.empty;
  const [signupRows, activityRows] = await Promise.all([
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "created_at") AS day, COUNT(*)::bigint AS count
      FROM "users" WHERE "created_at" >= ${since}
      GROUP BY day ORDER BY day ASC`,
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "created_at") AS day, COUNT(DISTINCT "login")::bigint AS count
      FROM "analytics_events" WHERE "created_at" >= ${since} ${gameFilter}
      GROUP BY day ORDER BY day ASC`,
  ]);
  const toDay = (rows: { day: Date; count: bigint }[]) =>
    rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: Number(r.count) }));

  return c.json({
    days,
    game,
    totals: { registered, registeredReal, activeUsers: activeRows.length },
    topPages: pageRows.map((r) => ({ name: r.name, count: r._count.name })),
    topEvents: eventRows.map((r) => ({ name: r.name, count: r._count.name })),
    perGame,
    signupTimeline: toDay(signupRows),
    activityTimeline: toDay(activityRows),
  });
});

app.get('/admin/audit-log', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canViewAuditLog');
  const url = new URL(c.req.url);
  const parsed = AuditQuerySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    actor: url.searchParams.get('actor') ?? undefined,
    target: url.searchParams.get('target') ?? undefined,
    action: url.searchParams.get('action') ?? undefined,
  });
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { limit, actor, target, action } = parsed.data;
  const entries = await prisma.adminAuditLog.findMany({
    where: {
      ...(actor ? { actorLogin: actor } : {}),
      ...(target ? { targetLogin: target } : {}),
      ...(action ? { action } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return c.json(entries);
});

// ── Admin all-history : timeline unifiée ──────────────────────────────────
app.get('/admin/all-history', async (c) => {
  const me = await getCurrentLogin(c);
  await requirePerm(me, 'canViewHistory');
  const url = new URL(c.req.url);
  const loginFilter = url.searchParams.get('login') ?? undefined;
  const typeFilter = url.searchParams.get('type') ?? undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 500), 1000);
  // Filtre par discipline. challenge/pending/played portent `game` ; rejected/ops
  // sont antérieurs au multi-jeu (babyfoot) → exclus dès qu'on cible smash/échecs.
  const gq = url.searchParams.get('game');
  const gameFilter = gq === 'smash' || gq === 'chess' || gq === 'streetfighter' || gq === 'babyfoot' ? gq : null;
  const gameWhere = gameFilter ? { game: gameFilter } : {};
  const includeLegacy = !gameFilter || gameFilter === 'babyfoot';

  const loginWhere = loginFilter
    ? { OR: [{ challengerLogin: loginFilter }, { opponentLogin: loginFilter }] }
    : {};
  const loginWhereAB = loginFilter
    ? { OR: [{ playerALogin: loginFilter }, { playerBLogin: loginFilter }] }
    : {};
  const loginWhereDO = loginFilter
    ? { OR: [{ declarerLogin: loginFilter }, { opponentLogin: loginFilter }] }
    : {};
  const loginWhereOps = loginFilter
    ? { OR: [{ ownerLogin: loginFilter }, { targetLogin: loginFilter }] }
    : {};

  const [challenges, pending, played, rejected, ops] = await Promise.all([
    (!typeFilter || typeFilter === 'challenge')
      ? prisma.challenge.findMany({ where: { ...loginWhere, ...gameWhere }, orderBy: { createdAt: 'desc' }, take: limit })
      : Promise.resolve([]),
    (!typeFilter || typeFilter === 'pending_match')
      ? prisma.pendingMatch.findMany({ where: { ...loginWhereDO, ...gameWhere }, orderBy: { declaredAt: 'desc' }, take: limit })
      : Promise.resolve([]),
    (!typeFilter || typeFilter === 'played_match')
      ? prisma.playedMatch.findMany({ where: { ...loginWhereAB, ...gameWhere }, orderBy: { playedAt: 'desc' }, take: limit })
      : Promise.resolve([]),
    (includeLegacy && (!typeFilter || typeFilter === 'rejected_match'))
      ? prisma.rejectedMatch.findMany({ where: loginWhereDO, orderBy: { rejectedAt: 'desc' }, take: limit })
      : Promise.resolve([]),
    (includeLegacy && (!typeFilter || typeFilter === 'ops'))
      ? prisma.ops.findMany({ where: loginWhereOps, orderBy: { declaredAt: 'desc' }, take: limit })
      : Promise.resolve([]),
  ]);

  type Event = {
    id: string;
    type: 'challenge' | 'pending_match' | 'played_match' | 'rejected_match' | 'ops';
    at: string;
    game: string;
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
  };

  const events: Event[] = [
    ...challenges.map((c) => ({
      id: c.id,
      type: 'challenge' as const,
      at: c.createdAt.toISOString(),
      game: c.game,
      playerA: c.challengerLogin,
      playerB: c.opponentLogin,
      status: c.status,
      scheduledAt: c.scheduledAt.toISOString(),
      decidedAt: c.decidedAt?.toISOString() ?? null,
    })),
    ...pending.map((p) => ({
      id: p.id,
      type: 'pending_match' as const,
      at: p.declaredAt.toISOString(),
      game: p.game,
      playerA: p.declarerLogin,
      playerB: p.opponentLogin,
      scoreA: p.scoreDeclarer,
      scoreB: p.scoreOpponent,
    })),
    ...played.map((m) => ({
      id: m.id,
      type: 'played_match' as const,
      at: m.playedAt.toISOString(),
      game: m.game,
      playerA: m.playerALogin,
      playerB: m.playerBLogin,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      winner: m.winner,
      deltaA: m.deltaA,
      deltaB: m.deltaB,
      countedForElo: m.countedForElo,
    })),
    ...rejected.map((r) => ({
      id: r.id,
      type: 'rejected_match' as const,
      at: r.rejectedAt.toISOString(),
      game: 'babyfoot',
      playerA: r.declarerLogin,
      playerB: r.opponentLogin,
      scoreA: r.scoreDeclarer,
      scoreB: r.scoreOpponent,
      contestReason: r.contestReason,
      contestMessage: r.contestMessage,
    })),
    ...ops.map((o) => ({
      id: o.id,
      type: 'ops' as const,
      at: o.declaredAt.toISOString(),
      game: 'babyfoot',
      playerA: o.ownerLogin,
      playerB: o.targetLogin,
      forcedUsed: o.forcedUsed,
      expiresAt: o.expiresAt.toISOString(),
    })),
  ];

  events.sort((a, b) => b.at.localeCompare(a.at));
  return c.json(events.slice(0, limit));
});

// ─── Boutique « League Coin » ──────────────────────────────────────────────────
//
// Économie cosmétique : les joueurs dépensent des League Coins (porte-monnaie
// `user.leagueCoins`) pour acquérir des objets (titres, bannières…) puis les
// équipent (au plus un équipé par catégorie). L'attribution de coins est réservée
// aux admins via /admin/shop/grant.

// Sérialise un ShopItem Prisma vers la forme `ShopItemData` attendue par le front.
// Le `payload` JSON est transmis tel quel.
function serializeShopItem(item: {
  id: string;
  name: string;
  description: string | null;
  category: string;
  color: string | null;
  rarity: string | null;
  price: number;
  payload: Prisma.JsonValue | null;
  active: boolean;
  sortOrder: number;
}) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category,
    color: item.color ?? null,
    rarity: item.rarity ?? null,
    price: item.price,
    payload: item.payload ?? null,
    active: item.active,
    sortOrder: item.sortOrder,
  };
}

// GET /shop — catalogue actif + solde + objets possédés par le joueur courant.
app.get('/shop', async (c) => {
  const login = await getCurrentLogin(c);
  await getOrCreateUser(login);
  const [user, items, owned] = await Promise.all([
    prisma.user.findUnique({ where: { login }, select: { leagueCoins: true } }),
    prisma.shopItem.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.shopInventory.findMany({ where: { userLogin: login }, select: { itemId: true } }),
  ]);
  return c.json({
    coins: user?.leagueCoins ?? 0,
    items: items.map(serializeShopItem),
    owned: owned.map((o) => o.itemId),
  });
});

// POST /shop/:id/buy — achète un objet. Re-vérifie solde & possession dans une
// transaction pour éviter les doubles achats / soldes négatifs.
// ── « Apôtre de Sheldon » : objet spécial reconnu par son nom (insensible à la
// casse et aux accents). À l'achat il DONNE 300 coins au lieu de coûter, ne peut
// être acheté qu'une fois, et s'auto-équipe verrouillé 1 semaine (impossible à
// déséquiper avant, ni de lui substituer un autre objet de sa catégorie).
const SHELDON_REWARD = 300;
const SHELDON_LOCK_MS = 7 * 24 * 60 * 60 * 1000;
// Seuil d'Elo pour ouvrir l'accès à la Boîte Mystère : il faut au moins 300 sur
// SA MEILLEURE discipline (le pari coûte de l'Elo en cas de perte — on réserve donc
// la box à ceux qui ont un coussin). Volontairement ABSENT de la description du
// produit : le refus ci-dessous est le seul endroit où ce seuil est révélé.
const MYSTERY_BOX_MIN_BEST_ELO = 300;
/** Meilleur Elo du joueur toutes disciplines confondues. */
function bestEloOf(u: {
  elo: number;
  eloBabyfoot2v2: number;
  eloSmash: number;
  eloChess: number;
  eloSf: number;
  eloFlechettes: number;
}): number {
  return Math.max(u.elo, u.eloBabyfoot2v2, u.eloSmash, u.eloChess, u.eloSf, u.eloFlechettes);
}
function isSheldonApostle(item: { name: string }): boolean {
  return item.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .includes('sheldon');
}
/** Chaîne de titre portée par un item 'title' (payload.title), sinon null. */
function titleOfItem(item: { category: string; payload: Prisma.JsonValue | null }): string | null {
  if (item.category !== 'title' || !item.payload || typeof item.payload !== 'object' || Array.isArray(item.payload)) {
    return null;
  }
  const t = (item.payload as Record<string, unknown>).title;
  return typeof t === 'string' ? t : null;
}

app.post('/shop/:id/buy', async (c) => {
  const login = await getCurrentLogin(c);
  await getOrCreateUser(login);
  const itemId = c.req.param('id');

  const item = await prisma.shopItem.findUnique({ where: { id: itemId } });
  if (!item || !item.active) {
    throw new HTTPException(404, { message: 'objet introuvable' });
  }
  const isMysteryBox = item.category === 'mystery_box';
  const isSheldon = isSheldonApostle(item);
  const consumableKind = consumableKindOf(item);
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { login }, select: { leagueCoins: true } });
    if (!user) throw new HTTPException(404, { message: 'utilisateur introuvable' });

    // Consommable : empilable (quantité), avec cap mensuel d'achats par type.
    if (consumableKind) {
      const now = new Date();
      const mk = monthKey(now);
      const cap = CONSUMABLE_MONTHLY_CAP[consumableKind];
      const monthly = await tx.consumableMonthly.findUnique({
        where: { userLogin_kind_monthKey: { userLogin: login, kind: consumableKind, monthKey: mk } },
      });
      if ((monthly?.count ?? 0) >= cap) {
        throw new HTTPException(409, { message: `cap mensuel atteint pour ce consommable (${cap}/mois)` });
      }
      // Cooldown d'achat (ex. mini_ops : 1 / 48 h) — borne le rythme d'acquisition.
      const buyCooldown = CONSUMABLE_BUY_COOLDOWN_MS[consumableKind];
      const existing = buyCooldown
        ? await tx.consumableInventory.findUnique({
            where: { userLogin_kind: { userLogin: login, kind: consumableKind } },
          })
        : null;
      if (buyCooldown && existing?.lastBoughtAt) {
        const elapsed = now.getTime() - existing.lastBoughtAt.getTime();
        if (elapsed < buyCooldown) {
          const hrs = Math.ceil((buyCooldown - elapsed) / (60 * 60 * 1000));
          throw new HTTPException(429, {
            message: `achat en cooldown : réessaie dans ~${hrs} h (1 achat toutes les ${Math.round(buyCooldown / (24 * 60 * 60 * 1000))} j).`,
          });
        }
      }
      if (user.leagueCoins < item.price) {
        throw new HTTPException(400, { message: 'solde insuffisant' });
      }
      const updated = await tx.user.update({
        where: { login },
        data: { leagueCoins: { decrement: item.price } },
        select: { leagueCoins: true },
      });
      await tx.consumableInventory.upsert({
        where: { userLogin_kind: { userLogin: login, kind: consumableKind } },
        update: { quantity: { increment: 1 }, ...(buyCooldown ? { lastBoughtAt: now } : {}) },
        create: { userLogin: login, kind: consumableKind, quantity: 1, ...(buyCooldown ? { lastBoughtAt: now } : {}) },
      });
      await tx.consumableMonthly.upsert({
        where: { userLogin_kind_monthKey: { userLogin: login, kind: consumableKind, monthKey: mk } },
        update: { count: { increment: 1 } },
        create: { userLogin: login, kind: consumableKind, monthKey: mk, count: 1 },
      });
      await logCoinTx(tx, login, -item.price, updated.leagueCoins, {
        type: 'shop_consumable',
        refId: item.id,
        meta: { name: item.name, kind: consumableKind },
      });
      return { coins: updated.leagueCoins, reward: null };
    }

    // La mystery box est consommable (achat répété autorisé) — pas de check doublon.
    if (!isMysteryBox) {
      const already = await tx.shopInventory.findUnique({
        where: { userLogin_itemId: { userLogin: login, itemId } },
      });
      if (already) throw new HTTPException(409, { message: 'objet déjà possédé' });
    }
    // Apôtre de Sheldon : achat « cadeau » — DONNE 300 coins (aucun coût, aucun
    // check de solde), achetable une seule fois (dédoublonnage ci-dessus),
    // auto-équipé et verrouillé 1 semaine (cf. POST /me/inventory/:id/equip).
    if (isSheldon) {
      const updated = await tx.user.update({
        where: { login },
        data: { leagueCoins: { increment: SHELDON_REWARD } },
        select: { leagueCoins: true },
      });
      // Auto-équipement : un seul objet équipé par catégorie → on déséquipe les autres.
      await tx.shopInventory.updateMany({
        where: { userLogin: login, equipped: true, item: { category: item.category } },
        data: { equipped: false },
      });
      await tx.shopInventory.create({ data: { userLogin: login, itemId, equipped: true } });
      const titleStr = titleOfItem(item);
      if (titleStr) await tx.user.update({ where: { login }, data: { title: titleStr } });
      await logCoinTx(tx, login, SHELDON_REWARD, updated.leagueCoins, {
        type: 'sheldon_reward',
        refId: item.id,
        meta: { name: item.name },
      });
      return { coins: updated.leagueCoins, reward: null };
    }
    if (user.leagueCoins < item.price) {
      throw new HTTPException(400, { message: 'solde insuffisant' });
    }

    // ── Boîte Mystère : un PARI ────────────────────────────────────────────
    // 1 chance sur 10 → on décroche le titre « Mysterious » (arc-en-ciel animé),
    // sans perte d'ELO. 9 fois sur 10 → on perd 10 ELO et rien d'autre. Si on
    // possède déjà le titre, c'est forcément une perte (impossible de le re-gagner).
    if (isMysteryBox) {
      // Gate d'Elo : il faut ≥ 1010 sur sa meilleure discipline. Le message est le
      // SEUL endroit où ce seuil apparaît (absent de la description du produit).
      const elos = await tx.user.findUnique({
        where: { login },
        select: { elo: true, eloBabyfoot2v2: true, eloSmash: true, eloChess: true, eloSf: true, eloFlechettes: true },
      });
      if (elos && bestEloOf(elos) < MYSTERY_BOX_MIN_BEST_ELO) {
        throw new HTTPException(403, {
          message: `Elo trop bas pour acheter la Boîte Mystère : il faut au moins ${MYSTERY_BOX_MIN_BEST_ELO} d'Elo sur ta meilleure discipline.`,
        });
      }
      const ownsTitle = await tx.shopInventory.findUnique({
        where: { userLogin_itemId: { userLogin: login, itemId: 'title-mysterious' } },
      });
      const won = !ownsTitle && Math.random() < 0.1;
      const updated = await tx.user.update({
        where: { login },
        data: { leagueCoins: { decrement: item.price }, ...(won ? {} : { elo: { decrement: 10 } }) },
        select: { leagueCoins: true },
      });
      let reward:
        | { id: string; name: string; category: string; color: string | null; rarity: string | null }
        | null = null;
      if (won) {
        await tx.shopInventory.create({ data: { userLogin: login, itemId: 'title-mysterious' } });
        const title = await tx.shopItem.findUnique({ where: { id: 'title-mysterious' } });
        if (title) {
          reward = { id: title.id, name: title.name, category: title.category, color: title.color, rarity: title.rarity };
        }
      }
      await logCoinTx(tx, login, -item.price, updated.leagueCoins, {
        type: 'mystery_box',
        refId: item.id,
        meta: { name: item.name, won, eloLost: won ? 0 : 10 },
      });
      return { coins: updated.leagueCoins, reward };
    }

    // ── Achat cosmétique normal ────────────────────────────────────────────
    const updated = await tx.user.update({
      where: { login },
      data: { leagueCoins: { decrement: item.price } },
      select: { leagueCoins: true },
    });
    await tx.shopInventory.create({ data: { userLogin: login, itemId } });
    await logCoinTx(tx, login, -item.price, updated.leagueCoins, {
      type: 'shop_purchase',
      refId: item.id,
      meta: { name: item.name, category: item.category },
    });
    return { coins: updated.leagueCoins, reward: null };
  });

  emit([login], { type: 'panel:update', payload: {} });
  return c.json({ ok: true, coins: result.coins, reward: result.reward });
});

// GET /me/inventory — inventaire détaillé du joueur courant (objet + état équipé).
app.get('/me/inventory', async (c) => {
  const login = await getCurrentLogin(c);
  await getOrCreateUser(login);
  let rows = await prisma.shopInventory.findMany({
    where: { userLogin: login },
    include: { item: true },
    orderBy: { acquiredAt: 'asc' },
  });

  // Auto-expiry : si l'Apôtre de Sheldon a dépassé sa semaine d'exposition, on le déséquipe.
  const nowInv = new Date();
  const expiredSheldon = rows.filter(
    (r) =>
      r.equipped &&
      isSheldonApostle(r.item) &&
      r.equippedAt != null &&
      r.equippedAt.getTime() + SHELDON_LOCK_MS <= nowInv.getTime(),
  );
  if (expiredSheldon.length > 0) {
    await Promise.all(
      expiredSheldon.map((r) =>
        prisma.shopInventory.update({
          where: { userLogin_itemId: { userLogin: login, itemId: r.itemId } },
          data: { equipped: false, equippedAt: null },
        }),
      ),
    );
    const u = await prisma.user.findUnique({ where: { login }, select: { title: true } });
    if (u?.title && isSheldonApostle({ name: u.title })) {
      await prisma.user.update({ where: { login }, data: { title: null } });
    }
    rows = await prisma.shopInventory.findMany({
      where: { userLogin: login },
      include: { item: true },
      orderBy: { acquiredAt: 'asc' },
    });
  }

  return c.json(
    rows.map((r) => ({
      itemId: r.itemId,
      item: serializeShopItem(r.item),
      equipped: r.equipped,
      acquiredAt: r.acquiredAt.toISOString(),
      userPayload: r.userPayload ?? null,
    })),
  );
});

// POST /me/inventory/:id/banner-image — upload une image personnalisée pour une bannière
// dont le payload contient `allowUpload: true`. Stockée dans ShopInventory.userPayload.
const CustomBannerImageSchema = z.object({
  image: z
    .string()
    .min(1)
    .refine((s) => s.startsWith('data:image/'), 'Image invalide (data-URL requise)')
    .refine((s) => s.length <= MAX_BANNER_DATAURL_LEN, 'Image trop lourde (max ~700 Ko)'),
});
app.post('/me/inventory/:id/banner-image', async (c) => {
  const login = await getCurrentLogin(c);
  await getOrCreateUser(login);
  const itemId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = CustomBannerImageSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'Image invalide' });

  const entry = await prisma.shopInventory.findUnique({
    where: { userLogin_itemId: { userLogin: login, itemId } },
    include: { item: true },
  });
  if (!entry) throw new HTTPException(404, { message: 'Item non trouvé dans ton inventaire' });
  if (entry.item.category !== 'banner')
    throw new HTTPException(400, { message: "Cet item n'est pas une bannière" });
  const itemPayload =
    entry.item.payload && typeof entry.item.payload === 'object' && !Array.isArray(entry.item.payload)
      ? (entry.item.payload as Record<string, unknown>)
      : {};
  if (!itemPayload.allowUpload)
    throw new HTTPException(400, { message: "Cette bannière ne supporte pas l'upload personnalisé" });

  await prisma.shopInventory.update({
    where: { userLogin_itemId: { userLogin: login, itemId } },
    data: { userPayload: { image: parsed.data.image } },
  });
  return c.json({ ok: true });
});

// POST /me/inventory/:id/equip — (dé)équipe un objet possédé. Au plus un objet
// équipé par catégorie. Un titre équipé est reflété dans `user.title`.
const EquipSchema = z.object({ equipped: z.boolean() });
app.post('/me/inventory/:id/equip', async (c) => {
  const login = await getCurrentLogin(c);
  await getOrCreateUser(login);
  const itemId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = EquipSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { equipped } = parsed.data;

  const row = await prisma.shopInventory.findUnique({
    where: { userLogin_itemId: { userLogin: login, itemId } },
    include: { item: true },
  });
  if (!row) throw new HTTPException(404, { message: 'objet non possédé' });

  // Verrou « Apôtre de Sheldon » : tant qu'il est équipé depuis moins d'une
  // semaine, on ne peut NI le déséquiper, NI équiper un autre objet de SA
  // catégorie (qui le déséquiperait par la règle « un seul équipé par catégorie »).
  const nowEquip = new Date();
  const equippedRows = await prisma.shopInventory.findMany({
    where: { userLogin: login, equipped: true },
    include: { item: true },
  });
  const lockedSheldon = equippedRows.find(
    (r) =>
      isSheldonApostle(r.item) &&
      r.equippedAt != null &&
      r.equippedAt.getTime() + SHELDON_LOCK_MS > nowEquip.getTime(),
  );
  if (lockedSheldon) {
    const until = new Date(lockedSheldon.equippedAt!.getTime() + SHELDON_LOCK_MS).toISOString();
    if (lockedSheldon.itemId === itemId && !equipped) {
      throw new HTTPException(409, { message: `l'Apôtre de Sheldon reste équipé jusqu'au ${until}` });
    }
    if (lockedSheldon.itemId !== itemId && equipped && row.item.category === lockedSheldon.item.category) {
      throw new HTTPException(409, {
        message: `impossible de changer de ${row.item.category} tant que l'Apôtre de Sheldon est équipé (jusqu'au ${until})`,
      });
    }
  }

  const category = row.item.category;
  // Le payload titre porte la chaîne à appliquer sur user.title.
  const titlePayload =
    category === 'title' &&
    row.item.payload &&
    typeof row.item.payload === 'object' &&
    !Array.isArray(row.item.payload)
      ? (row.item.payload as Record<string, unknown>).title
      : undefined;
  const titleStr = typeof titlePayload === 'string' ? titlePayload : null;

  const nowEquipTx = new Date();
  await prisma.$transaction(async (tx) => {
    if (equipped) {
      // Un seul objet équipé par catégorie : on déséquipe les autres de la même catégorie.
      await tx.shopInventory.updateMany({
        where: { userLogin: login, equipped: true, item: { category } },
        data: { equipped: false, equippedAt: null },
      });
      await tx.shopInventory.update({
        where: { userLogin_itemId: { userLogin: login, itemId } },
        data: { equipped: true, equippedAt: nowEquipTx },
      });
      if (category === 'title' && titleStr) {
        await tx.user.update({ where: { login }, data: { title: titleStr } });
      }
    } else {
      await tx.shopInventory.update({
        where: { userLogin_itemId: { userLogin: login, itemId } },
        data: { equipped: false, equippedAt: null },
      });
      if (category === 'title' && titleStr) {
        const u = await tx.user.findUnique({ where: { login }, select: { title: true } });
        if (u?.title === titleStr) {
          await tx.user.update({ where: { login }, data: { title: null } });
        }
      }
    }
  });

  emit([login], { type: 'panel:update', payload: {} });
  return c.json({ ok: true });
});

// ═══ Consommables ═══════════════════════════════════════════════════════════
// Objets empilables (cf. ConsumableInventory) achetés en League Coins :
//  - 'anti_ops' : annule l'ops qui te vise. Cap 2/mois, cooldown 2 sem. entre
//                 usages. À l'usage : l'ops est neutralisé (expiré + marqué), le
//                 chasseur reprend son cooldown 7j et ne peut pas te re-cibler
//                 pendant ANTI_OPS_SHIELD_MS (cf. POST /ops).
//  - 'elo_mult' : « EN FEU ». À l'usage, ouvre une fenêtre de 6 h pendant laquelle
//                 chaque score validé double gain ET perte d'ELO. Activation limitée
//                 à 1 par semaine ISO. Achat empilable (cap mensuel) pour stocker.
//  - 'force_duel' : « marionnettiste ». Désigne DEUX joueurs + une discipline
//                 (au choix) et les force à s'affronter — un défi déjà accepté
//                 (inéluctable, impossible à refuser) apparaît dans leurs duels.
//                 Cap 1/mois.
//  - 'mini_ops' : version « solo » du force_duel — l'ACHETEUR désigne UNE cible et
//                 se voit opposé à elle dans un duel inéluctable. Rare (1200 coins),
//                 limité par un COOLDOWN D'ACHAT (1 / 48 h) plutôt qu'au cap mensuel.
const CONSUMABLE_KINDS = ['anti_ops', 'elo_mult', 'force_duel', 'mini_ops'] as const;
type ConsumableKind = (typeof CONSUMABLE_KINDS)[number];
function isConsumableKind(s: string): s is ConsumableKind {
  return (CONSUMABLE_KINDS as readonly string[]).includes(s);
}
const ELO_MULT_FACTOR = 2;
// Durée de la fenêtre de boost « EN FEU » ouverte à l'activation du multiplicateur.
const ELO_MULT_DURATION_MS = 6 * 60 * 60 * 1000; // 6 heures
/** Le joueur est-il « en feu » (fenêtre de boost ELO ×2 encore ouverte) ? */
function isEloMultActive(u: { eloMultUntil: Date | null }, now: Date = new Date()): boolean {
  return u.eloMultUntil != null && u.eloMultUntil.getTime() > now.getTime();
}
const ANTI_OPS_MONTHLY_CAP = 2;
const ELO_MULT_MONTHLY_CAP = 6;
const FORCE_DUEL_MONTHLY_CAP = 1;
// mini_ops : la vraie limite est le COOLDOWN D'ACHAT (1 achat / 2 jours), pas le cap
// mensuel — on garde un cap mensuel non bloquant (≈ 1 tous les 2 jours).
const MINI_OPS_MONTHLY_CAP = 16;
const MINI_OPS_DEFAULT_GAME = 'babyfoot';
// Discipline par défaut du duel forcé si l'instigateur n'en choisit pas (babyfoot,
// 1v1 phare). L'instigateur peut imposer n'importe quelle discipline à l'usage.
const FORCE_DUEL_DEFAULT_GAME = 'babyfoot';
const ANTI_OPS_USE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 2 semaines entre usages
const ANTI_OPS_SHIELD_MS = 7 * 24 * 60 * 60 * 1000; // 1 semaine sans re-ciblage
const CONSUMABLE_MONTHLY_CAP: Record<ConsumableKind, number> = {
  anti_ops: ANTI_OPS_MONTHLY_CAP,
  elo_mult: ELO_MULT_MONTHLY_CAP,
  force_duel: FORCE_DUEL_MONTHLY_CAP,
  mini_ops: MINI_OPS_MONTHLY_CAP,
};
// Cooldown d'ACHAT par type (ms) — borne le rythme d'acquisition indépendamment du
// cap mensuel. Seul mini_ops en a un (1 achat toutes les 48 h).
const CONSUMABLE_BUY_COOLDOWN_MS: Partial<Record<ConsumableKind, number>> = {
  mini_ops: 2 * 24 * 60 * 60 * 1000,
};

// Objets boutique « consommable » seedés (ids stables, comme la mystery box).
const CONSUMABLE_ITEMS: {
  id: string;
  kind: ConsumableKind;
  name: string;
  description: string;
  price: number;
  rarity: string;
}[] = [
  {
    id: 'consumable-anti-ops',
    kind: 'anti_ops',
    name: 'Anti-OPS',
    description: "Annule l'OPS qui te vise. 2 par mois, 2 semaines de cooldown entre deux usages.",
    price: 800,
    rarity: 'epic',
  },
  {
    id: 'consumable-elo-mult',
    kind: 'elo_mult',
    name: 'ELO ×2 — EN FEU',
    description: 'À utiliser quand tu es en feu : 6 h de boost où chaque score compte double — gain ×2 (et perte ×2). 1 activation par semaine.',
    price: 500,
    rarity: 'rare',
  },
  {
    id: 'consumable-force-duel',
    kind: 'force_duel',
    name: 'Main du Destin',
    description:
      'Désigne deux joueurs et la discipline de ton choix, et force-les à s’affronter : un défi inéluctable apparaît dans leurs duels, impossible à refuser. 1 par mois.',
    price: 2500,
    rarity: 'epic',
  },
  {
    id: 'consumable-mini-ops',
    kind: 'mini_ops',
    name: 'Mini-OPS',
    description:
      'Désigne une cible et la discipline de ton choix : un duel inéluctable t’oppose à elle, impossible à refuser. Achat limité à un toutes les 48 h.',
    price: 1200,
    rarity: 'rare',
  },
];

/** Clé de mois UTC (« 2026-06 ») — partition du cap mensuel des consommables. */
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ─── Série d'assiduité ranked (streak) ───────────────────────────────────────
// Jours calendaires (UTC, comme isoWeekKey/monthKey) où le joueur a joué ≥1 match
// CLASSÉ. Tolérance : 1 jour de grâce — la série continue tant que l'écart entre
// deux jours joués reste ≤ 2 (donc on peut sauter UN jour), et se réinitialise à
// partir de 2 jours manqués. ≥3 jours (« plus de 2 ») → +10% sur les GAINS d'ELO.
// Récompenses de coins en paliers à J3 / J7 / J14 / J30 (puis tous les 30 jours).
const STREAK_MIN_FOR_ELO = 3;
const STREAK_ELO_GAIN_BONUS = 0.1; // +10% appliqué au delta d'ELO POSITIF
const STREAK_MILESTONES: Record<number, number> = { 3: 50, 7: 150, 14: 400, 30: 1000 };

/** Clé de jour UTC "YYYY-MM-DD" (même fuseau que isoWeekKey/monthKey). */
function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Nombre de jours calendaires (UTC) entre deux dayKeys (b − a). */
function dayDiff(a: string, b: string): number {
  const pa = a.split('-');
  const pb = b.split('-');
  const ua = Date.UTC(Number(pa[0]), Number(pa[1]) - 1, Number(pa[2]));
  const ub = Date.UTC(Number(pb[0]), Number(pb[1]) - 1, Number(pb[2]));
  return Math.round((ub - ua) / 86_400_000);
}

/**
 * Fait avancer la série compte tenu du dernier jour joué `prevDay`. Tolérance
 * d'1 jour de grâce : continue si l'écart ≤ 2 jours (un jour sauté toléré), reset
 * au-delà. `isNewDay` = premier match classé du jour (→ palier de coins éventuel).
 * Fonction pure : la lecture (bonus ELO) et l'écriture (au règlement) partagent
 * exactement le même calcul à partir de l'état stocké.
 */
function advanceStreak(
  prevStreak: number,
  prevDay: string | null,
  today: string,
): { streak: number; isNewDay: boolean } {
  if (prevDay === today) return { streak: Math.max(1, prevStreak), isNewDay: false };
  if (prevDay == null) return { streak: 1, isNewDay: true };
  const diff = dayDiff(prevDay, today);
  if (diff <= 0) return { streak: Math.max(1, prevStreak), isNewDay: false }; // garde-fou horloge
  if (diff <= 2) return { streak: prevStreak + 1, isNewDay: true }; // grâce d'1 jour
  return { streak: 1, isNewDay: true }; // 2+ jours manqués → reset
}

/** Coins du palier atteint à `streak` jours (0 si pas un palier). 1000 tous les 30 j au-delà. */
function streakMilestoneCoins(streak: number): number {
  const m = STREAK_MILESTONES[streak];
  if (m) return m;
  if (streak > 30 && streak % 30 === 0) return 1000;
  return 0;
}

/**
 * Vue « série » pour le front : série COURANTE (0 si rompue — au-delà de la grâce),
 * record perso, bonus ELO actif (+10%), et prochain palier de coins à viser.
 */
function streakView(
  u: { rankedStreak: number; rankedStreakBest: number; rankedStreakDay: string | null } | null,
  now: Date = new Date(),
): { current: number; best: number; eloActive: boolean; next: { day: number; coins: number } } {
  const today = dayKey(now);
  const diff = u?.rankedStreakDay != null ? dayDiff(u.rankedStreakDay, today) : null;
  // Vivante tant que l'écart au dernier jour joué reste dans la grâce (0..2 jours).
  const alive = diff != null && diff >= 0 && diff <= 2;
  const current = alive ? (u?.rankedStreak ?? 0) : 0;
  const eloActive = current >= STREAK_MIN_FOR_ELO;
  const keys = [3, 7, 14, 30];
  let next: { day: number; coins: number } | null = null;
  for (const k of keys) {
    if (k > current) { next = { day: k, coins: STREAK_MILESTONES[k] ?? 0 }; break; }
  }
  if (!next) next = { day: (Math.floor(current / 30) + 1) * 30, coins: 1000 };
  return { current, best: u?.rankedStreakBest ?? 0, eloActive, next };
}

/** Type de consommable d'un objet boutique (via payload.kind), sinon null. */
function consumableKindOf(item: { category: string; payload: Prisma.JsonValue | null }): ConsumableKind | null {
  if (item.category !== 'consumable') return null;
  const p = item.payload;
  const kind = p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>).kind : null;
  return typeof kind === 'string' && isConsumableKind(kind) ? kind : null;
}

/** Applique les multiplicateurs d'ELO d'un joueur sur son delta final (après
 *  dégressivité anti-farming) :
 *   • Série d'assiduité : +10% sur le GAIN (delta positif) tant que la série est
 *     active (≥3 jours, en comptant le match du jour). Sans effet sur les pertes.
 *   • « EN FEU » : ×2 (gain ET perte) tant que la fenêtre de boost est ouverte.
 *  Les deux se cumulent (un gain en feu + série = ×2 ×1,1). La fenêtre EN FEU
 *  n'est PAS consommée (tous les scores des 6 h en profitent). */
async function applyEloMultTx(
  tx: Prisma.TransactionClient,
  login: string,
  delta: number,
  now: Date = new Date(),
): Promise<number> {
  if (delta === 0) return delta;
  const u = await tx.user.findUnique({
    where: { login },
    select: { eloMultUntil: true, rankedStreak: true, rankedStreakDay: true },
  });
  if (!u) return delta;
  let d = delta;
  // Série active ⇒ +10% sur les GAINS uniquement. On compte le match du jour
  // (advanceStreak) pour que dès le 3e jour le bonus s'applique sur tous ses matchs.
  if (d > 0) {
    const eff = advanceStreak(u.rankedStreak, u.rankedStreakDay, dayKey(now)).streak;
    if (eff >= STREAK_MIN_FOR_ELO) d *= 1 + STREAK_ELO_GAIN_BONUS;
  }
  if (isEloMultActive(u, now)) d *= ELO_MULT_FACTOR;
  return Math.round(d);
}

/** Ajuste (±) la quantité d'un consommable détenu, bornée à 0. Renvoie la qté. */
async function grantConsumableTx(
  tx: Prisma.TransactionClient,
  login: string,
  kind: ConsumableKind,
  amount: number,
): Promise<number> {
  const row = await tx.consumableInventory.upsert({
    where: { userLogin_kind: { userLogin: login, kind } },
    update: {},
    create: { userLogin: login, kind, quantity: 0 },
  });
  const next = Math.max(0, row.quantity + amount);
  await tx.consumableInventory.update({
    where: { userLogin_kind: { userLogin: login, kind } },
    data: { quantity: next },
  });
  return next;
}

/** Neutralise l'ops actif qui vise `login` (anti-ops). Renvoie le login du
 *  chasseur, ou null s'il n'y avait pas d'ops. Le chasseur reprend son cooldown
 *  (l'ops passe à expiresAt=now) + bouclier de re-ciblage via cancelledByAntiOpsAt. */
async function cancelOpsTargetingTx(
  tx: Prisma.TransactionClient,
  login: string,
  now: Date,
): Promise<string | null> {
  const ops = await tx.ops.findFirst({ where: { targetLogin: login, expiresAt: { gt: now } } });
  if (!ops) return null;
  await tx.ops.update({
    where: { id: ops.id },
    data: { expiresAt: now, cancelledByAntiOpsAt: now },
  });
  return ops.ownerLogin;
}

// Corps du POST .../force_duel/use : les deux joueurs désignés (marionnettiste)
// et la discipline imposée (optionnelle → babyfoot par défaut, normalisée plus bas).
const ForceDuelUseSchema = z.object({
  player1: z.string().trim().min(1),
  player2: z.string().trim().min(1),
  game: z.string().trim().optional(),
});

// Corps du POST .../mini_ops/use : la CIBLE de l'acheteur (qui devient son
// adversaire forcé) et la discipline imposée (optionnelle → babyfoot par défaut).
const MiniOpsUseSchema = z.object({
  target: z.string().trim().min(1),
  game: z.string().trim().optional(),
});

// GET /me/consumables — stock par type + cap mensuel + état du x2 armé.
app.get('/me/consumables', async (c) => {
  const login = await getCurrentLogin(c);
  await getOrCreateUser(login);
  const now = new Date();
  const mk = monthKey(now);
  const [rows, monthly, user] = await Promise.all([
    prisma.consumableInventory.findMany({ where: { userLogin: login } }),
    prisma.consumableMonthly.findMany({ where: { userLogin: login, monthKey: mk } }),
    prisma.user.findUnique({ where: { login }, select: { eloMultUntil: true, eloMultWeekKey: true } }),
  ]);
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  const monthByKind = new Map(monthly.map((m) => [m.kind, m.count]));
  return c.json({
    // Fenêtre de boost « EN FEU » en cours (null/passé = pas en feu) + si l'activation
    // hebdomadaire a déjà été consommée cette semaine ISO.
    eloMultUntil: user?.eloMultUntil ? user.eloMultUntil.toISOString() : null,
    eloMultWeekTaken: !!user?.eloMultWeekKey && user.eloMultWeekKey === isoWeekKey(now),
    items: CONSUMABLE_KINDS.map((kind) => {
      const r = byKind.get(kind);
      const buyCooldownMs = CONSUMABLE_BUY_COOLDOWN_MS[kind] ?? null;
      // Date à partir de laquelle un nouvel achat est permis (cooldown d'achat).
      const buyableAt =
        buyCooldownMs && r?.lastBoughtAt ? new Date(r.lastBoughtAt.getTime() + buyCooldownMs) : null;
      return {
        kind,
        quantity: r?.quantity ?? 0,
        lastUsedAt: r?.lastUsedAt ? r.lastUsedAt.toISOString() : null,
        monthlyCap: CONSUMABLE_MONTHLY_CAP[kind],
        monthlyUsed: monthByKind.get(kind) ?? 0,
        buyCooldownMs,
        buyableAt: buyableAt && buyableAt.getTime() > now.getTime() ? buyableAt.toISOString() : null,
      };
    }),
  });
});

// POST /me/consumables/:kind/use — utilise un consommable.
app.post('/me/consumables/:kind/use', async (c) => {
  const login = await getCurrentLogin(c);
  await getOrCreateUser(login);
  const kind = c.req.param('kind');
  if (!isConsumableKind(kind)) throw new HTTPException(404, { message: 'consommable inconnu' });
  const now = new Date();

  // ── Main du Destin : force deux joueurs désignés à s'affronter dans la ──
  // discipline choisie par l'instigateur (babyfoot par défaut). Le défi est créé
  // DÉJÀ accepté (status 'accepted') → inéluctable : ni refus ni annulation
  // possibles (ces transitions exigent 'pending'). L'acheteur n'est pas partie au
  // duel ; il est l'instigateur (mentionné dans les notifications).
  if (kind === 'force_duel') {
    const body = await c.req.json().catch(() => null);
    const parsed = ForceDuelUseSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
    const { player1, player2 } = parsed.data;
    if (player1 === player2) {
      throw new HTTPException(400, { message: 'choisis deux joueurs différents' });
    }
    // Discipline imposée : normalisée sur une discipline valide (défaut babyfoot).
    const game = parseGameId(parsed.data.game ?? FORCE_DUEL_DEFAULT_GAME);
    const gameLabel = getGameDef(game).label;
    await assertTargetable(player1);
    await assertTargetable(player2);

    const challenge = await prisma.$transaction(async (tx) => {
      const row = await tx.consumableInventory.findUnique({
        where: { userLogin_kind: { userLogin: login, kind } },
      });
      if (!row || row.quantity < 1) throw new HTTPException(400, { message: 'aucune Main du Destin en stock' });
      await tx.consumableInventory.update({
        where: { userLogin_kind: { userLogin: login, kind } },
        data: { quantity: { decrement: 1 }, lastUsedAt: now },
      });
      return tx.challenge.create({
        data: {
          id: randomUUID(),
          challengerLogin: player1,
          opponentLogin: player2,
          status: 'accepted',
          game,
          scheduledAt: now,
          decidedAt: now,
        },
      });
    });

    emit([player1, player2], { type: 'challenge:accepted', payload: challenge });
    void notifyMany([player1, player2], {
      type: 'challenge_received',
      title: `La Main du Destin vous oppose`,
      body: `@${login} vous force à un duel : @${player1} vs @${player2} en ${gameLabel}.`,
      link: `/challenges?game=${encodeURIComponent(game)}`,
      game,
      refId: challenge.id,
    });
    emit([login], { type: 'panel:update', payload: {} });
    return c.json({ ok: true, forced: true, challengeId: challenge.id });
  }

  // ── Mini-OPS : force UN duel entre l'ACHETEUR et la cible désignée, dans la ──
  // discipline choisie (babyfoot par défaut). Comme la Main du Destin, le défi est
  // créé déjà accepté → inéluctable (ni refus ni annulation). L'acheteur EST partie
  // au duel (challenger), contrairement à la Main du Destin.
  if (kind === 'mini_ops') {
    const body = await c.req.json().catch(() => null);
    const parsed = MiniOpsUseSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
    const target = parsed.data.target;
    if (target === login) throw new HTTPException(400, { message: 'choisis un adversaire autre que toi' });
    const game = parseGameId(parsed.data.game ?? MINI_OPS_DEFAULT_GAME);
    const gameLabel = getGameDef(game).label;
    await assertTargetable(target);

    const challenge = await prisma.$transaction(async (tx) => {
      const row = await tx.consumableInventory.findUnique({
        where: { userLogin_kind: { userLogin: login, kind } },
      });
      if (!row || row.quantity < 1) throw new HTTPException(400, { message: 'aucun Mini-OPS en stock' });
      await tx.consumableInventory.update({
        where: { userLogin_kind: { userLogin: login, kind } },
        data: { quantity: { decrement: 1 }, lastUsedAt: now },
      });
      return tx.challenge.create({
        data: {
          id: randomUUID(),
          challengerLogin: login,
          opponentLogin: target,
          status: 'accepted',
          game,
          scheduledAt: now,
          decidedAt: now,
        },
      });
    });

    emit([login, target], { type: 'challenge:accepted', payload: challenge });
    void notifyMany([target], {
      type: 'challenge_received',
      title: 'Mini-OPS : un duel t’est imposé',
      body: `@${login} t’impose un duel inéluctable en ${gameLabel}.`,
      link: `/challenges?game=${encodeURIComponent(game)}`,
      game,
      refId: challenge.id,
    });
    emit([login], { type: 'panel:update', payload: {} });
    return c.json({ ok: true, forced: true, challengeId: challenge.id });
  }

  if (kind === 'elo_mult') {
    const until = await prisma.$transaction(async (tx) => {
      const row = await tx.consumableInventory.findUnique({
        where: { userLogin_kind: { userLogin: login, kind } },
      });
      if (!row || row.quantity < 1) throw new HTTPException(400, { message: 'aucun multiplicateur en stock' });
      const u = await tx.user.findUniqueOrThrow({
        where: { login },
        select: { eloMultUntil: true, eloMultWeekKey: true },
      });
      // Déjà en feu → on ne ré-ouvre pas une fenêtre par-dessus.
      if (isEloMultActive(u, now)) throw new HTTPException(409, { message: 'tu es déjà en feu' });
      // Une seule activation par semaine ISO.
      if (u.eloMultWeekKey === isoWeekKey(now)) {
        throw new HTTPException(409, { message: 'déjà activé cette semaine — reviens la semaine prochaine' });
      }
      const eloMultUntil = new Date(now.getTime() + ELO_MULT_DURATION_MS);
      await tx.consumableInventory.update({
        where: { userLogin_kind: { userLogin: login, kind } },
        data: { quantity: { decrement: 1 }, lastUsedAt: now },
      });
      await tx.user.update({
        where: { login },
        data: { eloMultUntil, eloMultWeekKey: isoWeekKey(now) },
      });
      return eloMultUntil;
    });
    emit([login], { type: 'panel:update', payload: {} });
    return c.json({ ok: true, until: until.toISOString() });
  }

  // anti_ops
  const hunter = await prisma.$transaction(async (tx) => {
    const row = await tx.consumableInventory.findUnique({
      where: { userLogin_kind: { userLogin: login, kind } },
    });
    if (!row || row.quantity < 1) throw new HTTPException(400, { message: 'aucun anti-OPS en stock' });
    if (row.lastUsedAt && now.getTime() - row.lastUsedAt.getTime() < ANTI_OPS_USE_COOLDOWN_MS) {
      const next = new Date(row.lastUsedAt.getTime() + ANTI_OPS_USE_COOLDOWN_MS);
      throw new HTTPException(409, { message: `anti-OPS en cooldown jusqu'au ${next.toISOString()}` });
    }
    const owner = await cancelOpsTargetingTx(tx, login, now);
    if (!owner) throw new HTTPException(409, { message: "aucun OPS ne te vise actuellement" });
    await tx.consumableInventory.update({
      where: { userLogin_kind: { userLogin: login, kind } },
      data: { quantity: { decrement: 1 }, lastUsedAt: now },
    });
    return owner;
  });

  emit([login, hunter], { type: 'ops:update', payload: { reason: 'anti_ops' } });
  void notify(hunter, {
    type: 'ops_cancelled',
    title: `@${login} a paré ton OPS`,
    body: "Ta cible a utilisé un anti-OPS : tu ne peux plus la cibler pendant 1 semaine.",
    link: '/profile',
  });
  emit([login], { type: 'panel:update', payload: {} });
  return c.json({ ok: true, cancelled: true });
});

// ── Boutique : administration du catalogue ──────────────────────────────────
// `ShopItemCreateSchema` + `MAX_BANNER_DATAURL_LEN` sont désormais partagés
// (@42-league/shared) car réutilisés par la récompense de tournoi officiel.
// `.partial()` n'existe pas sur un ZodEffects → on repart de l'objet de base.
const ShopItemUpdateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().nullish(),
    category: z.enum(['title', 'banner', 'badge', 'consumable']).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'couleur invalide (format #rrggbb)')
      .nullish(),
    rarity: ShopRaritySchema.nullish(),
    price: z.number().int().min(0).optional(),
    payload: z.record(z.any()).nullish(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  // Même validation payload↔catégorie qu'à la création, mais en PATCH : on ne
  // contrôle que si la catégorie ET le payload sont réellement fournis (sinon on
  // n'a pas de quoi décider — la valeur en base reste inchangée).
  .superRefine((d, ctx) => {
    if (d.category === undefined || d.payload === undefined || d.payload === null) return;
    if (d.category === 'banner') {
      const img = typeof d.payload.image === 'string' ? d.payload.image : '';
      if (!img.startsWith('data:image/')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bannière : image (data-URL) requise' });
      } else if (img.length > MAX_BANNER_DATAURL_LEN) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bannière trop lourde (max ~700 Ko)' });
      }
    }
    if (d.category === 'badge') {
      const code = typeof d.payload.code === 'string' ? d.payload.code : '';
      const label = typeof d.payload.label === 'string' ? d.payload.label : '';
      if (!code || !label) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'badge : code et label requis' });
      }
    }
    if (d.category === 'consumable') {
      const kind = typeof d.payload.kind === 'string' ? d.payload.kind : '';
      if (!isConsumableKind(kind)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "consommable : payload.kind invalide (anti_ops | elo_mult | force_duel | mini_ops)" });
      }
    }
  });

// ── Permissions des modérateurs ──────────────────────────────────────────────
// Seuls les ADMIN/SUPERADMIN peuvent attribuer des permissions à un modérateur.
// Le corps doit être un objet partiel { canBan: true, canDeleteMatches: false, … }.
// Les clés non reconnues sont ignorées (liste blanche stricte → pas d'injection).
app.patch('/admin/users/:login/moderator-permissions', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const targetLogin = c.req.param('login');
  if (SUPERADMINS.has(targetLogin.toLowerCase())) {
    throw new HTTPException(400, { message: 'cannot modify a hardcoded superadmin' });
  }
  const target = await prisma.user.findUnique({
    where: { login: targetLogin },
    select: { login: true, role: true },
  });
  if (!target) throw new HTTPException(404, { message: 'user not found' });
  if (target.role !== 'MODERATOR') {
    throw new HTTPException(400, { message: 'user is not a MODERATOR — change their role first' });
  }
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HTTPException(400, { message: 'invalid body' });
  }
  const permissions: Partial<Record<ModeratorPermission, boolean>> = {};
  for (const perm of MODERATOR_PERMISSIONS) {
    if (typeof (body as Record<string, unknown>)[perm] === 'boolean') {
      permissions[perm] = (body as Record<string, boolean>)[perm];
    }
  }
  const updated = await prisma.user.update({
    where: { login: targetLogin },
    data: { moderatorPermissions: permissions },
  });
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'SET_MODERATOR_PERMISSIONS',
    target: targetLogin,
    payload: { permissions },
  });
  return c.json({ login: updated.login, moderatorPermissions: updated.moderatorPermissions });
});

// GET /admin/shop/items — catalogue complet (objets inactifs inclus).
app.get('/admin/shop/items', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const items = await prisma.shopItem.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return c.json(items.map(serializeShopItem));
});

// POST /admin/shop/items — crée un objet de boutique.
app.post('/admin/shop/items', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const body = await c.req.json().catch(() => null);
  const parsed = ShopItemCreateSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const d = parsed.data;
  const item = await prisma.shopItem.create({
    data: {
      name: d.name,
      description: d.description ?? null,
      category: d.category,
      color: d.color ?? null,
      rarity: d.rarity ?? null,
      price: d.price,
      payload: (d.payload ?? PrismaRuntime.DbNull) as Prisma.InputJsonValue | typeof PrismaRuntime.DbNull,
      ...(d.active !== undefined ? { active: d.active } : {}),
      ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
    },
  });
  return c.json(serializeShopItem(item));
});

// PATCH /admin/shop/items/:id — met à jour partiellement un objet.
app.patch('/admin/shop/items/:id', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = ShopItemUpdateSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const d = parsed.data;
  const data: Prisma.ShopItemUpdateInput = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.description !== undefined) data.description = d.description ?? null;
  if (d.category !== undefined) data.category = d.category;
  if (d.color !== undefined) data.color = d.color ?? null;
  if (d.rarity !== undefined) data.rarity = d.rarity ?? null;
  if (d.price !== undefined) data.price = d.price;
  if (d.payload !== undefined) {
    data.payload = (d.payload ?? PrismaRuntime.DbNull) as Prisma.InputJsonValue | typeof PrismaRuntime.DbNull;
  }
  if (d.active !== undefined) data.active = d.active;
  if (d.sortOrder !== undefined) data.sortOrder = d.sortOrder;
  const item = await prisma.shopItem.update({ where: { id }, data });
  return c.json(serializeShopItem(item));
});

// DELETE /admin/shop/items/:id — supprime un objet (cascade sur l'inventaire).
app.delete('/admin/shop/items/:id', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const id = c.req.param('id');
  await prisma.shopItem.delete({ where: { id } });
  return c.json({ ok: true });
});

// ── Passe de combat ───────────────────────────────────────────────────────────

// Validation d'un palier (admin). itemId requis pour 'item', coins pour 'coins',
// consumableKind pour 'consumable' ; 'none' = palier vide (montre la progression).
const BattlePassTierInputSchema = z.object({
  rewardKind: z.enum(['item', 'coins', 'consumable', 'none']),
  itemId: z.string().nullish(),
  coins: z.number().int().nonnegative().nullish(),
  consumableKind: z.enum(['anti_ops', 'elo_mult', 'force_duel', 'mini_ops']).nullish(),
});

function serializeBattlePassTierAdmin(t: {
  tier: number;
  rewardKind: string;
  itemId: string | null;
  coins: number | null;
  consumableKind: string | null;
}) {
  return {
    tier: t.tier,
    rewardKind: t.rewardKind,
    itemId: t.itemId ?? null,
    coins: t.coins ?? null,
    consumableKind: t.consumableKind ?? null,
  };
}

// GET /me/battlepass — état du passe pour le joueur courant (spec §5). La piste
// complète des paliers configurés + progression d'XP + déblocage/réclamation.
app.get('/me/battlepass', async (c) => {
  const login = await getCurrentLogin(c);
  await getOrCreateUser(login);
  const user = await prisma.user.findUnique({ where: { login }, select: { xp: true } });
  const totalXp = user?.xp ?? 0;
  const { level, xpIntoLevel, xpForNextLevel } = levelFromXp(totalXp);
  const [tiers, claims] = await Promise.all([
    prisma.battlePassTier.findMany({ orderBy: { tier: 'asc' }, include: { item: true } }),
    prisma.battlePassClaim.findMany({ where: { userLogin: login }, select: { tier: true, grantedAt: true } }),
  ]);
  const claimedAt = new Map(claims.map((cl) => [cl.tier, cl.grantedAt]));
  // Échelle complète : on affiche TOUS les paliers de 1 à BATTLE_PASS_MAX_TIERS,
  // qu'ils soient configurés ou non, pour que le joueur voie la piste entière et
  // quel palier donne quelle récompense. Les paliers non configurés = 'none'.
  const cfg = new Map(tiers.map((t) => [t.tier, t]));
  return c.json({
    totalXp,
    level,
    xpIntoLevel,
    xpForNextLevel,
    tiers: Array.from({ length: BATTLE_PASS_MAX_TIERS }, (_, i) => {
      const tier = i + 1;
      const t = cfg.get(tier);
      return {
        tier,
        xpRequired: cumulativeXpForTier(tier),
        rewardKind: t?.rewardKind ?? 'none',
        item: t && t.rewardKind === 'item' && t.item ? serializeShopItem(t.item) : null,
        coins: t?.coins ?? null,
        consumableKind: t?.consumableKind ?? null,
        unlocked: level >= tier,
        claimedAt: claimedAt.has(tier) ? claimedAt.get(tier)!.toISOString() : null,
      };
    }),
  });
});

// GET /admin/battlepass/tiers — tous les paliers configurés (admin).
app.get('/admin/battlepass/tiers', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const tiers = await prisma.battlePassTier.findMany({ orderBy: { tier: 'asc' } });
  return c.json(tiers.map(serializeBattlePassTierAdmin));
});

// PUT /admin/battlepass/tiers/:tier — upsert de la récompense d'un palier (admin).
app.put('/admin/battlepass/tiers/:tier', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const tier = Number(c.req.param('tier'));
  if (!Number.isInteger(tier) || tier < 1) {
    throw new HTTPException(400, { message: 'tier invalide' });
  }
  const body = await c.req.json().catch(() => null);
  const parsed = BattlePassTierInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const d = parsed.data;
  const data = {
    rewardKind: d.rewardKind,
    itemId: d.rewardKind === 'item' ? d.itemId ?? null : null,
    coins: d.rewardKind === 'coins' ? d.coins ?? null : null,
    consumableKind: d.rewardKind === 'consumable' ? d.consumableKind ?? null : null,
  };
  const t = await prisma.battlePassTier.upsert({
    where: { tier },
    update: data,
    create: { tier, ...data },
  });
  return c.json(serializeBattlePassTierAdmin(t));
});

// DELETE /admin/battlepass/tiers/:tier — supprime un palier (admin).
app.delete('/admin/battlepass/tiers/:tier', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const tier = Number(c.req.param('tier'));
  if (!Number.isInteger(tier)) {
    throw new HTTPException(400, { message: 'tier invalide' });
  }
  await prisma.battlePassTier.delete({ where: { tier } }).catch(() => {});
  return c.json({ ok: true });
});

// ── Annonces générales (admin → tous les joueurs) ────────────────────────────

function serializeAnnouncement(a: {
  id: string;
  title: string;
  body: string;
  kind: string;
  active: boolean;
  createdByLogin: string | null;
  createdAt: Date;
}) {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    kind: a.kind,
    active: a.active,
    createdBy: a.createdByLogin,
    createdAt: a.createdAt.toISOString(),
  };
}

// GET /announcements — annonces actives (les plus récentes d'abord). Listées en
// permanence dans la page À propos (« Dernières annonces »).
app.get('/announcements', async (c) => {
  await getCurrentLogin(c); // réservé aux connectés
  const items = await prisma.announcement.findMany({
    where: { active: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return c.json(items.map(serializeAnnouncement));
});

// POST /announcements/seen — accuse réception d'annonces (popup « vu une fois »).
app.post('/announcements/seen', async (c) => {
  const login = await getCurrentLogin(c);
  const body = (await c.req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body!.ids.filter((x): x is string => typeof x === 'string') : [];
  if (ids.length === 0) return c.json({ ok: true });
  await prisma.announcementSeen.createMany({
    data: ids.map((announcementId) => ({ announcementId, userLogin: login })),
    skipDuplicates: true,
  });
  return c.json({ ok: true });
});

// GET /admin/announcements — liste complète (actives + masquées) avec compteur de vues.
app.get('/admin/announcements', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const items = await prisma.announcement.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { seenBy: true } } },
  });
  return c.json(items.map((a) => ({ ...serializeAnnouncement(a), seenCount: a._count.seenBy })));
});

// POST /admin/announcements — crée une annonce (poppera à la prochaine connexion).
app.post('/admin/announcements', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const body = await c.req.json().catch(() => null);
  const parsed = AnnouncementCreateSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const d = parsed.data;
  const item = await prisma.announcement.create({
    data: {
      title: d.title,
      body: d.body,
      kind: d.kind ?? 'info',
      createdByLogin: me,
      ...(d.active !== undefined ? { active: d.active } : {}),
    },
  });
  // Pousse l'annonce en temps réel : tous les clients connectés rechargent `me`
  // → le popup apparaît sans refresh (le filtre "non vue / postée après le compte"
  // reste appliqué côté /me, donc seuls les bons destinataires la verront).
  if (item.active) broadcast({ type: 'announcement:created', payload: { id: item.id } });
  return c.json(serializeAnnouncement(item));
});

// DELETE /admin/announcements/:id — supprime une annonce (cascade sur les vues).
app.delete('/admin/announcements/:id', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const id = c.req.param('id');
  await prisma.announcement.delete({ where: { id } });
  broadcast({ type: 'announcement:deleted', payload: { id } });
  return c.json({ ok: true });
});

// ── Cœur des grants (réutilisable hors HTTP) ────────────────────────────────
// Versions tx-aware, sans effet de bord HTTP/emit : appelées par les endpoints
// admin ET par le settlement des récompenses de tournoi (dans la transaction de
// finale). Ne PAS appeler emit ici — le faire après commit côté appelant.

// Source d'un mouvement de coins (cf. modèle CoinTransaction). Sert au journal
// de suivi GOD : chaque crédit/débit est rangé sous l'un de ces types.
type CoinTxType =
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
  | 'dispute_malus'
  | 'battlepass_tier'
  | 'admin_grant';

interface CoinTxEntry {
  type: CoinTxType;
  refId?: string | null;
  meta?: Prisma.InputJsonValue;
}

/**
 * Écrit une ligne au journal des mouvements de coins. Purement historique (jamais
 * relu pour un solde). `amount` = delta RÉEL appliqué (signé) ; un delta nul n'est
 * pas journalisé (ex. débit borné à 0 sans effet).
 */
async function logCoinTx(
  tx: Prisma.TransactionClient,
  login: string,
  amount: number,
  balanceAfter: number,
  entry: CoinTxEntry,
): Promise<void> {
  if (amount === 0) return;
  await tx.coinTransaction.create({
    data: {
      id: randomUUID(),
      userLogin: login,
      amount,
      balanceAfter,
      type: entry.type,
      refId: entry.refId ?? null,
      meta: entry.meta ?? undefined,
    },
  });
}

/**
 * Crédite/débite des League Coins. Retourne le nouveau solde, ou null si joueur
 * absent. Si `entry` est fourni, journalise le mouvement RÉEL (delta après bornage
 * à 0) dans CoinTransaction pour le suivi GOD.
 */
async function grantCoinsTx(
  tx: Prisma.TransactionClient,
  login: string,
  amount: number,
  entry?: CoinTxEntry,
): Promise<number | null> {
  const target = await tx.user.findUnique({ where: { login }, select: { leagueCoins: true } });
  if (!target) return null;
  const next = Math.max(0, target.leagueCoins + amount);
  const delta = next - target.leagueCoins;
  await tx.user.update({ where: { login }, data: { leagueCoins: next } });
  if (entry) await logCoinTx(tx, login, delta, next, entry);
  return next;
}

/** Donne un cosmétique (inventaire, sans doublon), avec équipement optionnel. No-op si l'objet n'existe pas. */
async function grantItemTx(
  tx: Prisma.TransactionClient,
  login: string,
  itemId: string,
  equip: boolean,
): Promise<void> {
  const item = await tx.shopItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  await tx.shopInventory.upsert({
    where: { userLogin_itemId: { userLogin: login, itemId } },
    update: {},
    create: { userLogin: login, itemId },
  });
  if (equip) {
    // Un seul équipé par catégorie : on déséquipe les autres de la même catégorie.
    await tx.shopInventory.updateMany({
      where: { userLogin: login, equipped: true, item: { category: item.category } },
      data: { equipped: false },
    });
    await tx.shopInventory.update({
      where: { userLogin_itemId: { userLogin: login, itemId } },
      data: { equipped: true },
    });
    const titleStr =
      item.category === 'title' && item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
        ? typeof (item.payload as Record<string, unknown>).title === 'string'
          ? ((item.payload as Record<string, unknown>).title as string)
          : null
        : null;
    if (item.category === 'title' && titleStr) {
      await tx.user.update({ where: { login }, data: { title: titleStr } });
    }
  }
}

/**
 * Supprime un cosmétique de récompense devenu orphelin lors de l'annulation /
 * suppression d'un tournoi : uniquement s'il a été créé inline (active:false),
 * n'est possédé par personne et n'est référencé par aucun autre tournoi. Un
 * cosmétique de boutique (existant, actif) ou déjà gagné n'est jamais touché.
 */
async function cleanupOrphanPrizeTx(
  tx: Prisma.TransactionClient,
  t: { id: string; prizeKind: string; prizeItemId: string | null },
): Promise<void> {
  if (t.prizeKind !== 'cosmetic' || !t.prizeItemId) return;
  const item = await tx.shopItem.findUnique({
    where: { id: t.prizeItemId },
    select: { id: true, active: true },
  });
  if (!item || item.active) return;
  const [owned, otherRefs] = await Promise.all([
    tx.shopInventory.count({ where: { itemId: item.id } }),
    tx.tournament.count({ where: { prizeItemId: item.id, id: { not: t.id } } }),
  ]);
  if (owned === 0 && otherRefs === 0) {
    await tx.shopItem.delete({ where: { id: item.id } });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Économie de coins : gains de match (volet A), quêtes hebdo (volet B), paris (volet C)
// ═══════════════════════════════════════════════════════════════════════════
//
// Un seul porte-monnaie (User.leagueCoins) alimenté par trois sources, toutes
// créditées/débitées via grantCoinsTx DANS une transaction (jamais de solde
// négatif : grantCoinsTx borne à 0, et les débits vérifient le solde en amont).

/** Prime de participation versée à chaque joueur d'un match classé. */
const COINS_PER_MATCH_PLAYED = 20;
/** Prime totale du vainqueur d'un match classé (remplace la participation). */
const COINS_PER_MATCH_WON = 50;
/** Cote fixe des paris : un pari gagnant rapporte 2× la mise (gain net = mise). */
const BET_PAYOUT_MULTIPLIER = 2;
/**
 * Cote des paris match avec SCORE EXACT : vainqueur correct ×2, et encore ×2 si
 * le score exact est pile (×4 au total). C'est aussi la seule cote des joueurs
 * qui parient sur LEUR PROPRE match (pronostic du score exact obligatoire —
 * gagné uniquement si le score final est exactement celui annoncé).
 */
const BET_EXACT_SCORE_MULTIPLIER = 4;

/**
 * Clé de semaine ISO 8601 (« 2026-W23 ») d'une date, en UTC. Sert de partition
 * aux quêtes hebdo : changer de semaine = nouvelle ligne WeeklyQuestProgress,
 * donc reset implicite des compteurs ET des réclamations.
 */
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Décale sur le jeudi de la semaine (l'année ISO suit le jeudi).
  const dayNum = (date.getUTCDay() + 6) % 7; // lundi=0 … dimanche=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ─── Revenus passifs hebdomadaires (podium des trophées) ─────────────────────
// Chaque semaine ISO, on classe les joueurs par NOMBRE DE TROPHÉES détenus (agrégé
// sur toutes les disciplines, mêmes calculs purs que l'onglet « Trophées », saison
// active — cf. trophyCountsByLogin). Le PODIUM touche une prime fixe et CHACUN reçoit
// en plus une prime PAR TROPHÉE (cumulable avec la prime de podium). Idempotent par
// semaine via WeeklyTrophyPayout (jamais payé deux fois la même semaine ISO).
const TROPHY_PODIUM_WEEKLY = [1200, 700, 350]; // 1er, 2e, 3e
const TROPHY_PER_TROPHY_WEEKLY = 25; // par trophée détenu (podium compris)
// Colonne d'Elo par discipline (board de trophées) — évite de tirer tout RatingFields.
const TROPHY_ELO_FIELD: Record<string, 'elo' | 'eloSmash' | 'eloChess' | 'eloSf' | 'eloFlechettes'> = {
  babyfoot: 'elo',
  smash: 'eloSmash',
  chess: 'eloChess',
  streetfighter: 'eloSf',
  flechettes: 'eloFlechettes',
};

async function runWeeklyTrophyIncome(now: Date = new Date()): Promise<void> {
  const weekKey = isoWeekKey(now);
  // Idempotence : semaine déjà payée → on ne fait rien.
  if (await prisma.weeklyTrophyPayout.findUnique({ where: { weekKey } })) return;

  const season = await prisma.season.findFirst({ where: { isActive: true } });
  const seasonId = season?.id ?? null;

  // Matchs 1v1 classés de la saison active (mêmes que les boards par discipline).
  const rawMatches = await prisma.playedMatch.findMany({
    where: { mode: null, ...(seasonId ? { seasonId } : {}) },
    select: {
      playerALogin: true, playerBLogin: true, scoreA: true, scoreB: true,
      winner: true, playedAt: true, game: true, stocksA: true, stocksB: true,
    },
  });
  const matches = rawMatches as unknown as TrophyMatch[];

  // Boards par discipline : joueurs visibles inscrits, Elo du mode + dodge.
  const boards: GameBoards = {};
  for (const game of GAME_IDS) {
    const users = await prisma.user.findMany({
      where: { ...VISIBLE_USER_WHERE, games: { has: game } },
      select: { login: true, imageUrl: true, dodgeCount: true, elo: true, eloSmash: true, eloChess: true, eloSf: true, eloFlechettes: true },
    });
    const field = TROPHY_ELO_FIELD[game];
    boards[game] = users.map((u) => ({ login: u.login, imageUrl: u.imageUrl, elo: field ? u[field] : u.elo, dodgeCount: u.dodgeCount }));
  }

  const counts = trophyCountsByLogin(boards, matches);
  // Classement par nb de trophées décroissant puis login (déterministe, comme le
  // podium affiché). Vide → on marque tout de même la semaine (idempotence).
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top3 = ranked.slice(0, 3).map(([login]) => login);

  await prisma.$transaction(async (tx) => {
    let paid = 0;
    for (let i = 0; i < ranked.length; i++) {
      const [login, count] = ranked[i]!;
      const podiumBonus = i < 3 ? TROPHY_PODIUM_WEEKLY[i]! : 0;
      const amount = podiumBonus + count * TROPHY_PER_TROPHY_WEEKLY;
      if (amount <= 0) continue;
      const res = await grantCoinsTx(tx, login, amount, {
        type: 'trophy_income',
        meta: { week: weekKey, trophies: count, rank: i < 3 ? i + 1 : null, podiumBonus, perTrophy: count * TROPHY_PER_TROPHY_WEEKLY },
      });
      if (res != null) paid++;
    }
    await tx.weeklyTrophyPayout.create({
      data: { weekKey, recipients: paid, top1: top3[0] ?? null, top2: top3[1] ?? null, top3: top3[2] ?? null },
    });
  });

  if (top3.length > 0) {
    void notifyMany(top3, {
      type: 'coins_granted',
      title: 'Revenus passifs des trophées',
      body: `Le podium des trophées de la semaine a été récompensé — tes League Coins ont été crédités.`,
      link: `/profil`,
    });
  }
}

// ─── Quêtes hebdomadaires (source de vérité serveur) ─────────────────────────
//
// Chaque quête est évaluée à la volée depuis les compteurs de la ligne de la
// semaine. `two_modes`/`all_modes` = objectifs de découverte ; `play_5`/`win_3`
// = objectifs de fidélisation. `all_modes` cible toutes les disciplines.
type QuestMetric = 'distinctGames' | 'matchesPlayed' | 'wins';
interface QuestDef {
  id: string;
  reward: number;
  target: number;
  metric: QuestMetric;
}
const WEEKLY_QUESTS: QuestDef[] = [
  { id: 'two_modes', reward: 200, target: 2, metric: 'distinctGames' },
  { id: 'all_modes', reward: 300, target: GAME_IDS.length, metric: 'distinctGames' },
  { id: 'play_5', reward: 150, target: 5, metric: 'matchesPlayed' },
  { id: 'win_3', reward: 200, target: 3, metric: 'wins' },
];

type QuestProgressRow = { matchesPlayed: number; wins: number; gamesPlayed: string[] };

function questProgressValue(q: QuestDef, row: QuestProgressRow): number {
  switch (q.metric) {
    case 'distinctGames':
      return row.gamesPlayed.length;
    case 'matchesPlayed':
      return row.matchesPlayed;
    case 'wins':
      return row.wins;
  }
}

/**
 * Volet A + B — au règlement d'un match CLASSÉ : crédite les coins (participation
 * ou victoire) et met à jour la progression des quêtes hebdo de chaque joueur
 * (matchs joués, victoires, disciplines distinctes). À n'appeler que lorsque le
 * match compte pour l'Elo (jamais sur dodge / match forcé / non-classé).
 */
async function awardMatchEconomyTx(
  tx: Prisma.TransactionClient,
  game: string,
  participants: { login: string; won: boolean }[],
  playedAt: Date,
  opts: { coinFactor?: number; countForQuests?: boolean } = {},
): Promise<void> {
  // coinFactor : dégressivité anti-farming appliquée AUX COINS (1 = plein tarif).
  // countForQuests : false sur un rematch dégressé → pas de progression de quête à
  // coût nul. Défauts (1 / true) = comportement inchangé pour les autres appelants.
  const coinFactor = opts.coinFactor ?? 1;
  const countForQuests = opts.countForQuests ?? true;
  const weekKey = isoWeekKey(playedAt);
  for (const p of participants) {
    const base = p.won ? COINS_PER_MATCH_WON : COINS_PER_MATCH_PLAYED;
    const coins = Math.max(0, Math.round(base * coinFactor));
    if (coins > 0)
      await grantCoinsTx(tx, p.login, coins, {
        type: 'match',
        meta: { game, won: p.won },
      });
    // Série d'assiduité ranked : avance le compteur (1×/jour) et verse le palier
    // atteint, le cas échéant. Indépendant des quêtes : on le fait même sur un
    // rematch dégressé (jouer compte pour l'assiduité), mais c'est idempotent dans
    // la journée (même jour → isNewDay false → ni mise à jour ni coins en double).
    const today = dayKey(playedAt);
    const cur = await tx.user.findUnique({
      where: { login: p.login },
      select: { rankedStreak: true, rankedStreakBest: true, rankedStreakDay: true },
    });
    if (cur) {
      const adv = advanceStreak(cur.rankedStreak, cur.rankedStreakDay, today);
      if (adv.isNewDay) {
        await tx.user.update({
          where: { login: p.login },
          data: {
            rankedStreak: adv.streak,
            rankedStreakDay: today,
            rankedStreakBest: Math.max(cur.rankedStreakBest, adv.streak),
          },
        });
        const reward = streakMilestoneCoins(adv.streak);
        if (reward > 0) {
          await grantCoinsTx(tx, p.login, reward, {
            type: 'streak',
            refId: `streak-${adv.streak}`,
            meta: { streak: adv.streak },
          });
        }
      }
    }
    // Les rematchs dégressés ne font pas avancer les quêtes hebdo (sinon farmables
    // en boucle à coût nul). Le 1er match du jour contre un adversaire compte plein.
    if (!countForQuests) continue;
    // Recompose l'ensemble des disciplines jouées (sans doublon) avant l'upsert.
    const existing = await tx.weeklyQuestProgress.findUnique({
      where: { login_weekKey: { login: p.login, weekKey } },
      select: { gamesPlayed: true },
    });
    const gamesPlayed = existing
      ? existing.gamesPlayed.includes(game)
        ? existing.gamesPlayed
        : [...existing.gamesPlayed, game]
      : [game];
    await tx.weeklyQuestProgress.upsert({
      where: { login_weekKey: { login: p.login, weekKey } },
      create: {
        login: p.login,
        weekKey,
        matchesPlayed: 1,
        wins: p.won ? 1 : 0,
        gamesPlayed,
      },
      update: {
        matchesPlayed: { increment: 1 },
        wins: p.won ? { increment: 1 } : undefined,
        gamesPlayed: { set: gamesPlayed },
      },
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// XP & passe de combat
// ═══════════════════════════════════════════════════════════════════════════
//
// L'XP est cumulative à vie (User.xp, jamais reset). Le niveau dérive de l'XP
// via une courbe purement serveur — le front n'affiche que ce que l'API renvoie.
// 1 niveau = 1 palier (BattlePassTier) ; atteindre un niveau accorde la
// récompense du palier correspondant (reconcileBattlePassTx, idempotent).

/** Nombre de paliers affichés sur la piste du passe (échelle complète 1..N). */
const BATTLE_PASS_MAX_TIERS = 100;

/** XP nécessaire pour passer du niveau L au niveau L+1 (L1→2:100, L2→3:150, …). */
function xpForLevel(L: number): number {
  return 50 * (L + 1);
}

/**
 * Décompose une XP totale (cumulée à vie) en niveau + progression. Niveau de
 * départ = 1 (totalXp 0 → niveau 1). `xpIntoLevel` = XP au-delà du seuil du
 * niveau courant ; `xpForNextLevel` = coût total pour finir le niveau courant.
 */
function levelFromXp(totalXp: number): { level: number; xpIntoLevel: number; xpForNextLevel: number } {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: xpForLevel(level) };
}

/** XP cumulée requise pour ATTEINDRE le palier/niveau T (T1:0, T2:100, T3:250…). */
function cumulativeXpForTier(T: number): number {
  let sum = 0;
  for (let k = 1; k < T; k++) sum += xpForLevel(k);
  return sum;
}

type XpTxType = 'match' | 'admin_grant' | 'tier_bonus';

interface XpTxEntry {
  type: XpTxType;
  refId?: string | null;
  meta?: Prisma.InputJsonValue;
}

/**
 * Écrit une ligne au journal des mouvements d'XP. Purement historique (jamais
 * relu pour un total). Un delta nul n'est pas journalisé. Mirroir de logCoinTx.
 */
async function logXpTx(
  tx: Prisma.TransactionClient,
  login: string,
  amount: number,
  balanceAfter: number,
  entry: XpTxEntry,
): Promise<void> {
  if (amount === 0) return;
  await tx.xpTransaction.create({
    data: {
      id: randomUUID(),
      userLogin: login,
      amount,
      balanceAfter,
      type: entry.type,
      refId: entry.refId ?? null,
      meta: entry.meta ?? undefined,
    },
  });
}

/**
 * Crédite de l'XP (jamais négatif côté usage). Retourne le nouveau total, ou
 * null si joueur absent. Journalise le mouvement si `entry` est fourni. Mirroir
 * de grantCoinsTx (mais l'XP ne se débite pas : on borne à 0 par sécurité).
 */
async function grantXpTx(
  tx: Prisma.TransactionClient,
  login: string,
  amount: number,
  entry?: XpTxEntry,
): Promise<number | null> {
  const target = await tx.user.findUnique({ where: { login }, select: { xp: true } });
  if (!target) return null;
  const next = Math.max(0, target.xp + amount);
  const delta = next - target.xp;
  await tx.user.update({ where: { login }, data: { xp: next } });
  if (entry) await logXpTx(tx, login, delta, next, entry);
  return next;
}

/**
 * Octroie l'XP de match à chaque participant (DANS la transaction de
 * settlement). À n'appeler que lorsque le match compte pour l'Elo, juste après
 * awardMatchEconomyTx. Barème (spec §2) :
 *  - base « a joué » : 50 ; bonus victoire : +50 (gagnant = 100 avant écart).
 *  - 1v1 (scoreGap connu) : gagnant + min(max(gap,0),10)*5 ; perdant + (gap<=1?25:gap<=3?10:0).
 *  - match nul (échecs) : chacun 50 + 25, pas de bonus victoire.
 *  - FFA / 2v2 : pas de bonus d'écart (gagnant(s) 100, autres 50).
 *  - Tout est ×decayFactor puis arrondi (Math.round). Mirroir de awardMatchEconomyTx.
 */
async function awardMatchExperienceTx(
  tx: Prisma.TransactionClient,
  game: string,
  participants: { login: string; won: boolean; scoreGap?: number }[],
  playedAt: Date,
  opts: { decayFactor?: number; isDraw?: boolean } = {},
): Promise<void> {
  const decayFactor = opts.decayFactor ?? 1;
  const isDraw = opts.isDraw ?? false;
  for (const p of participants) {
    let xp: number;
    if (isDraw) {
      // Nulle : pas de bonus victoire, mais une prime « match serré » fixe.
      xp = 50 + 25;
    } else {
      xp = 50 + (p.won ? 50 : 0);
      // Bonus d'écart 1v1 uniquement (scoreGap fourni seulement en 1v1).
      if (p.scoreGap != null) {
        const gap = p.scoreGap;
        if (p.won) {
          xp += Math.min(Math.max(gap, 0), 10) * 5; // max +50
        } else {
          xp += gap <= 1 ? 25 : gap <= 3 ? 10 : 0; // défaite serrée = + d'XP
        }
      }
    }
    const amount = Math.max(0, Math.round(xp * decayFactor));
    if (amount > 0) {
      await grantXpTx(tx, p.login, amount, {
        type: 'match',
        meta: { game, won: isDraw ? null : p.won },
      });
    }
    // Accorde immédiatement les paliers franchis grâce à cet apport d'XP.
    await reconcileBattlePassTx(tx, p.login);
  }
}

/**
 * Octroie automatiquement, dans l'ordre croissant, les paliers de passe de
 * combat dont le niveau est atteint (tier <= level) et pas encore réclamés.
 * Idempotent grâce à BattlePassClaim. Émet `battlepass:tier` si des paliers ont
 * été accordés. À appeler dans la même transaction que le gain d'XP.
 */
async function reconcileBattlePassTx(tx: Prisma.TransactionClient, login: string): Promise<void> {
  const user = await tx.user.findUnique({ where: { login }, select: { xp: true } });
  if (!user) return;
  const { level } = levelFromXp(user.xp);
  const [tiers, claims] = await Promise.all([
    tx.battlePassTier.findMany({ where: { tier: { lte: level } }, orderBy: { tier: 'asc' } }),
    tx.battlePassClaim.findMany({ where: { userLogin: login }, select: { tier: true } }),
  ]);
  const claimed = new Set(claims.map((c) => c.tier));
  const granted: number[] = [];
  for (const t of tiers) {
    if (claimed.has(t.tier)) continue;
    switch (t.rewardKind) {
      case 'item':
        if (t.itemId) await grantItemTx(tx, login, t.itemId, false);
        break;
      case 'coins':
        if (t.coins && t.coins > 0)
          await grantCoinsTx(tx, login, t.coins, { type: 'battlepass_tier', refId: String(t.tier) });
        break;
      case 'consumable':
        if (t.consumableKind) {
          await tx.consumableInventory.upsert({
            where: { userLogin_kind: { userLogin: login, kind: t.consumableKind } },
            update: { quantity: { increment: 1 } },
            create: { userLogin: login, kind: t.consumableKind, quantity: 1 },
          });
        }
        break;
      case 'none':
      default:
        break;
    }
    await tx.battlePassClaim.create({ data: { userLogin: login, tier: t.tier } });
    granted.push(t.tier);
  }
  if (granted.length > 0) {
    emit([login], { type: 'battlepass:tier', payload: { tiers: granted } });
  }
}

// ─── Paris : règlement / remboursement (volet C) ─────────────────────────────

/**
 * Règle les paris OUVERTS correspondant à `where` selon le vainqueur connu :
 * cote fixe ×2 aux bons pronostics, perdu sinon. Renvoie les logins crédités
 * (pour un emit après commit).
 */
async function settleBetsTx(
  tx: Prisma.TransactionClient,
  where: Prisma.BetWhereInput,
  winnerLogin: string | null,
): Promise<string[]> {
  const open = await tx.bet.findMany({ where: { ...where, status: 'open' } });
  const credited: string[] = [];
  const now = new Date();
  for (const b of open) {
    // Nul (winnerLogin null) : aucun pronostic gagnant → on rembourse la mise (push).
    const isDraw = winnerLogin === null;
    const won = !isDraw && b.choiceLogin === winnerLogin;
    const payout = won ? b.stake * BET_PAYOUT_MULTIPLIER : isDraw ? b.stake : 0;
    if (payout > 0) {
      await grantCoinsTx(tx, b.bettorLogin, payout, {
        type: isDraw ? 'bet_refund' : 'bet_win',
        refId: b.id,
        meta: {
          targetType: b.targetType,
          tournamentId: b.tournamentId,
          matchId: b.matchId,
          opsId: b.opsId,
          choiceLogin: b.choiceLogin,
          stake: b.stake,
        },
      });
      credited.push(b.bettorLogin);
    }
    await tx.bet.update({
      where: { id: b.id },
      data: { status: won ? 'won' : isDraw ? 'refunded' : 'lost', payout, settledAt: now },
    });
  }
  return credited;
}

// Pronostic « match nul » : valeur sentinelle stockée dans Bet.choiceLogin (les
// logins 42 ne contiennent jamais ce motif). Permet de parier sur l'issue d'un
// match — victoire joueur A / NUL / victoire joueur B — sans migration.
const DRAW_CHOICE = '__draw__';

/**
 * Règle les paris sur l'ISSUE d'un match de tournoi. Contrairement aux paris
 * « vainqueur du tournoi », le NUL est ici un pronostic VALIDE : un pari sur le
 * nul (choiceLogin === DRAW_CHOICE) gagne quand le match est nul
 * (winnerLogin === null, ligue uniquement). Un mauvais pronostic est perdu (pas de
 * remboursement — le remboursement reste réservé aux annulations, cf. refundBetsTx).
 *
 * Cotes : vainqueur correct ×2 ; si le pari porte AUSSI le score exact et qu'il
 * est pile (predictedScoreA/B === scoreA/B) → ×4. Cas particulier : un JOUEUR du
 * match (ou son coéquipier 2v2) a forcément parié le score exact — il ne gagne
 * QUE si le score est pile (×4), le bon vainqueur seul ne suffit pas.
 */
async function settleMatchBetsTx(
  tx: Prisma.TransactionClient,
  matchId: string,
  winnerLogin: string | null,
): Promise<string[]> {
  const open = await tx.bet.findMany({ where: { targetType: 'match', matchId, status: 'open' } });
  if (open.length === 0) return [];
  // Score final + joueurs du match : nécessaires pour juger les paris « score
  // exact » et appliquer la règle stricte des participants.
  const m = await tx.tournamentMatch.findUnique({
    where: { id: matchId },
    select: { tournamentId: true, playerALogin: true, playerBLogin: true, scoreA: true, scoreB: true },
  });
  const partners = m ? await tournamentPartnerMap(tx, m.tournamentId) : new Map<string, string | null>();
  const players = m
    ? [...teamMembersOf(m.playerALogin, partners), ...teamMembersOf(m.playerBLogin, partners)]
    : [];
  const credited: string[] = [];
  const now = new Date();
  for (const b of open) {
    const winnerOk =
      b.choiceLogin === DRAW_CHOICE ? winnerLogin === null : b.choiceLogin === winnerLogin;
    const exact =
      b.predictedScoreA != null &&
      b.predictedScoreB != null &&
      m?.scoreA != null &&
      m?.scoreB != null &&
      b.predictedScoreA === m.scoreA &&
      b.predictedScoreB === m.scoreB;
    // Un joueur du match ne gagne que sur le score exact ; les autres gagnent dès
    // le bon vainqueur (×2), avec bonus ×4 si leur score exact est pile.
    const won = players.includes(b.bettorLogin) ? exact : winnerOk;
    const payout = !won ? 0 : exact ? b.stake * BET_EXACT_SCORE_MULTIPLIER : b.stake * BET_PAYOUT_MULTIPLIER;
    if (payout > 0) {
      await grantCoinsTx(tx, b.bettorLogin, payout, {
        type: 'bet_win',
        refId: b.id,
        meta: {
          targetType: 'match',
          matchId: b.matchId,
          choiceLogin: b.choiceLogin,
          stake: b.stake,
          ...(b.predictedScoreA != null
            ? { predictedScoreA: b.predictedScoreA, predictedScoreB: b.predictedScoreB, exact }
            : {}),
        },
      });
      credited.push(b.bettorLogin);
    }
    await tx.bet.update({
      where: { id: b.id },
      data: { status: won ? 'won' : 'lost', payout, settledAt: now },
    });
  }
  return credited;
}

/**
 * Règle les paris « vainqueur du tournoi » placés sur UN pronostic donné, selon
 * le nombre de tours qu'il a franchis (cote progressive). Appelé quand ce
 * pronostic est éliminé (perdant d'un match de bracket) ou sacré champion :
 *   gain = round(mise × betMultiplier(roundsWon, totalRounds, finalMult))
 * 0 tour franchi → gain 0 (mise perdue). Renvoie les logins crédités.
 */
async function settleTournamentBetsForPick(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  pickLogin: string,
  roundsWon: number,
  totalRounds: number,
  finalMult: number,
): Promise<string[]> {
  const open = await tx.bet.findMany({
    where: { targetType: 'tournament', tournamentId, choiceLogin: pickLogin, status: 'open' },
  });
  const credited: string[] = [];
  const now = new Date();
  for (const b of open) {
    const payout = betPayout(b.stake, roundsWon, totalRounds, finalMult);
    if (payout > 0) {
      await grantCoinsTx(tx, b.bettorLogin, payout, {
        type: 'bet_win',
        refId: b.id,
        meta: {
          targetType: 'tournament',
          tournamentId: b.tournamentId,
          choiceLogin: b.choiceLogin,
          stake: b.stake,
          roundsWon,
        },
      });
      credited.push(b.bettorLogin);
    }
    await tx.bet.update({
      where: { id: b.id },
      data: { status: payout > 0 ? 'won' : 'lost', payout, settledAt: now },
    });
  }
  return credited;
}

/**
 * Verse le cash-prize (coins) d'un palier à chaque membre fourni (les deux
 * coéquipiers en 2v2). Montant = base × tours franchis / total (0 si 0 tour).
 */
async function payCashPrizeTx(
  tx: Prisma.TransactionClient,
  members: string[],
  roundsWon: number,
  totalRounds: number,
  base: number,
): Promise<void> {
  const amount = cashPrizeForRounds(roundsWon, totalRounds, base);
  if (amount <= 0) return;
  for (const login of members)
    await grantCoinsTx(tx, login, amount, {
      type: 'tournament_prize',
      meta: { kind: 'cash_prize' },
    });
}

/**
 * Rembourse intégralement tous les paris encore ouverts d'un tournoi (paris sur
 * le tournoi ET sur ses matchs) — à appeler AVANT toute suppression de tournoi,
 * sinon le cascade efface les paris et la mise est perdue. Renvoie les logins
 * remboursés.
 */
async function refundBetsTx(
  tx: Prisma.TransactionClient,
  where: Prisma.BetWhereInput,
): Promise<string[]> {
  const open = await tx.bet.findMany({ where: { ...where, status: 'open' } });
  const refunded: string[] = [];
  const now = new Date();
  for (const b of open) {
    await grantCoinsTx(tx, b.bettorLogin, b.stake, {
      type: 'bet_refund',
      refId: b.id,
      meta: {
        targetType: b.targetType,
        tournamentId: b.tournamentId,
        matchId: b.matchId,
        opsId: b.opsId,
        choiceLogin: b.choiceLogin,
        stake: b.stake,
        reason: 'cancelled',
      },
    });
    await tx.bet.update({
      where: { id: b.id },
      data: { status: 'refunded', payout: b.stake, settledAt: now },
    });
    refunded.push(b.bettorLogin);
  }
  return refunded;
}

/** Rembourse les paris ouverts d'un tournoi (annulation/suppression unitaire). */
function refundOpenBetsForTournamentTx(tx: Prisma.TransactionClient, tournamentId: string) {
  return refundBetsTx(tx, { tournamentId });
}

// ─── Paris : duels d'OPS ─────────────────────────────────────────────────────
// Chaque DUEL (un défi forcé né d'un ops) est un marché distinct : on parie sur
// le vainqueur de CE match. Le règlement gagné/perdu a lieu au confirm du match
// (cf. /matches/:id/confirm, via PendingMatch.challengeId → settleBetsTx). Ici on
// ne gère que le FILET DE SÉCURITÉ : rembourser les paris des duels qui ne seront
// jamais confirmés (ops terminé/expiré, ou défi refusé/annulé) — robuste aux
// redémarrages (les timers d'expiration sont perdus à chaque relance).

async function sweepExpiredOpsBets(): Promise<void> {
  const now = new Date();
  const dead = await prisma.bet.findMany({
    where: {
      targetType: 'ops',
      status: 'open',
      OR: [
        // Ops terminé (3 défis) ou expiré (24h) : un duel encore ouvert ne sera
        // plus confirmé → remboursement. (Couvre aussi les anciens paris « par
        // ops » d'avant le passage aux paris par duel — challengeId null.)
        { ops: { endedAt: { not: null } } },
        { ops: { expiresAt: { lte: now } } },
        // Le défi lui-même est mort (refusé/annulé) sans avoir été joué.
        { challenge: { status: { in: ['declined', 'cancelled'] } } },
      ],
    },
    select: { id: true },
  });
  if (dead.length === 0) return;
  const ids = dead.map((b) => b.id);
  const refunded = await prisma.$transaction((tx) => refundBetsTx(tx, { id: { in: ids } }));
  if (refunded.length) emit([...new Set(refunded)], { type: 'panel:update', payload: {} });
}

/**
 * Rembourse les paris ouverts d'un ENSEMBLE de tournois — à appeler avant une
 * suppression en masse (purge d'un compte, suppression d'un faux joueur) qui
 * effacerait les paris par cascade sans rendre la mise.
 */
function refundOpenBetsForTournamentsTx(tx: Prisma.TransactionClient, tournamentIds: string[]) {
  if (tournamentIds.length === 0) return Promise.resolve<string[]>([]);
  return refundBetsTx(tx, { tournamentId: { in: tournamentIds } });
}

// ─── Endpoints : quêtes hebdomadaires (volet B) ──────────────────────────────

app.get('/quests', async (c) => {
  const me = await getCurrentLogin(c);
  const weekKey = isoWeekKey(new Date());
  const [row, user] = await Promise.all([
    prisma.weeklyQuestProgress.findUnique({ where: { login_weekKey: { login: me, weekKey } } }),
    prisma.user.findUnique({ where: { login: me }, select: { leagueCoins: true } }),
  ]);
  const base: QuestProgressRow = {
    matchesPlayed: row?.matchesPlayed ?? 0,
    wins: row?.wins ?? 0,
    gamesPlayed: row?.gamesPlayed ?? [],
  };
  const claimed = row?.claimed ?? [];
  const quests = WEEKLY_QUESTS.map((q) => {
    const progress = questProgressValue(q, base);
    const isClaimed = claimed.includes(q.id);
    return {
      id: q.id,
      reward: q.reward,
      target: q.target,
      progress: Math.min(progress, q.target),
      claimed: isClaimed,
      claimable: !isClaimed && progress >= q.target,
    };
  });
  return c.json({ weekKey, coins: user?.leagueCoins ?? 0, quests });
});

app.post('/quests/:id/claim', async (c) => {
  const me = await getCurrentLogin(c);
  const questId = c.req.param('id');
  const quest = WEEKLY_QUESTS.find((q) => q.id === questId);
  if (!quest) throw new HTTPException(404, { message: 'quête inconnue' });
  const weekKey = isoWeekKey(new Date());
  const result = await prisma.$transaction(async (tx) => {
    // Verrou de ligne : sérialise les réclamations concurrentes (anti double-claim).
    await tx.$executeRaw`SELECT 1 FROM weekly_quest_progress WHERE login = ${me} AND week_key = ${weekKey} FOR UPDATE`;
    const row = await tx.weeklyQuestProgress.findUnique({
      where: { login_weekKey: { login: me, weekKey } },
    });
    const base: QuestProgressRow = {
      matchesPlayed: row?.matchesPlayed ?? 0,
      wins: row?.wins ?? 0,
      gamesPlayed: row?.gamesPlayed ?? [],
    };
    if (questProgressValue(quest, base) < quest.target) {
      throw new HTTPException(409, { message: 'quête non terminée' });
    }
    if ((row?.claimed ?? []).includes(quest.id)) {
      throw new HTTPException(409, { message: 'récompense déjà réclamée' });
    }
    await tx.weeklyQuestProgress.upsert({
      where: { login_weekKey: { login: me, weekKey } },
      create: { login: me, weekKey, claimed: [quest.id] },
      update: { claimed: { push: quest.id } },
    });
    const coins = await grantCoinsTx(tx, me, quest.reward, {
      type: 'quest',
      refId: quest.id,
      meta: { questId: quest.id, metric: quest.metric },
    });
    return { coins: coins ?? 0 };
  });
  emit([me], { type: 'panel:update', payload: {} });
  return c.json({ id: quest.id, reward: quest.reward, coins: result.coins });
});

// ─── Endpoints : paris (volet C) ─────────────────────────────────────────────

app.get('/bets', async (c) => {
  const me = await getCurrentLogin(c);
  // Solde d'abord les duels d'ops expirés (robuste aux redémarrages), pour que
  // l'historique « Mes paris » reflète immédiatement les gains/remboursements.
  await sweepExpiredOpsBets();
  const now = new Date();
  const [user, myBetsRaw, openTours, openDuelChallenges] = await Promise.all([
    prisma.user.findUnique({ where: { login: me }, select: { leagueCoins: true } }),
    prisma.bet.findMany({
      where: { bettorLogin: me },
      orderBy: { createdAt: 'desc' },
      include: {
        tournament: { select: { name: true, game: true } },
        ops: { select: { ownerLogin: true, targetLogin: true } },
      },
    }),
    // Tournois ouverts aux paris : pendant l'INSCRIPTION, tant que l'admin n'a pas
    // lancé le tournoi. Dès le lancement (status 'in_progress') le marché se ferme
    // — on parie sur le vainqueur avant le coup d'envoi. Le pari est verrouillé dès
    // qu'il est posé (aucune modif — cf. garde anti-doublon).
    prisma.tournament.findMany({
      where: { status: 'registration' },
      orderBy: { createdAt: 'desc' },
      include: { entries: { select: { login: true, partnerLogin: true } } },
    }),
    // Duels d'ops PARIABLES : chaque défi forcé encore À JOUER (status 'accepted')
    // d'un ops actif, auquel JE ne participe pas (ni traqueur ni cible). Un duel =
    // un marché distinct. Le marché se ferme dès que le défi est enregistré
    // (status 'recorded' → match en cours) ou refusé/annulé.
    prisma.challenge.findMany({
      where: {
        opsId: { not: null },
        status: 'accepted',
        challengerLogin: { not: me },
        opponentLogin: { not: me },
        ops: { expiresAt: { gt: now }, endedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        challenger: { select: { login: true, imageUrl: true } },
        opponent: { select: { login: true, imageUrl: true } },
        ops: { select: { expiresAt: true } },
      },
    }),
  ]);
  // Je ne peux pas reparier sur un duel où j'ai déjà un pari ouvert.
  const myOpenDuelIds = new Set(
    myBetsRaw
      .filter((b) => b.targetType === 'ops' && b.status === 'open')
      .map((b) => b.challengeId),
  );
  const openOpsDuels = openDuelChallenges
    .filter((ch) => !myOpenDuelIds.has(ch.id))
    .map((ch) => ({
      // `id` = id du DUEL (le défi forcé) sur lequel on parie.
      id: ch.id,
      opsId: ch.opsId,
      ownerLogin: ch.challengerLogin,
      targetLogin: ch.opponentLogin,
      ownerImageUrl: ch.challenger.imageUrl,
      targetImageUrl: ch.opponent.imageUrl,
      game: ch.game,
      expiresAt: ch.ops?.expiresAt ?? null,
    }));
  return c.json({
    coins: user?.leagueCoins ?? 0,
    myBets: myBetsRaw.map((b) => ({
      id: b.id,
      targetType: b.targetType,
      tournamentId: b.tournamentId,
      tournamentName: b.tournament?.name ?? null,
      game: b.tournament?.game ?? null,
      matchId: b.matchId,
      opsId: b.opsId,
      challengeId: b.challengeId,
      opsOwnerLogin: b.ops?.ownerLogin ?? null,
      opsTargetLogin: b.ops?.targetLogin ?? null,
      choiceLogin: b.choiceLogin,
      predictedScoreA: b.predictedScoreA,
      predictedScoreB: b.predictedScoreB,
      stake: b.stake,
      status: b.status,
      payout: b.payout,
      createdAt: b.createdAt,
      settledAt: b.settledAt,
    })),
    openTournaments: openTours.map((t) => ({
      id: t.id,
      name: t.name,
      game: t.game,
      status: t.status,
      mode: t.mode,
      // `entrants` = logins des CAPITAINES (clé canonique du pari : en 2v2 le
      // vainqueur du tournoi est stocké comme le login du capitaine). `partners`
      // ajoute le coéquipier pour afficher le DUO côté UI (capitaine & coéquipier),
      // sans changer la valeur pariée.
      entrants: t.entries.map((e) => e.login),
      partners: Object.fromEntries(
        t.entries.map((e) => [e.login, e.partnerLogin ?? null]),
      ) as Record<string, string | null>,
    })),
    openOpsDuels,
  });
});

// On ne parie plus que sur le VAINQUEUR d'un tournoi (les paris match par match
// ont été retirés). `targetType` reste un littéral pour compat de payload.
const PlaceBetSchema = z.object({
  targetType: z.literal('tournament'),
  tournamentId: z.string().min(1),
  choiceLogin: z.string().min(1),
  stake: z.number().int().positive(),
});

app.post('/bets', async (c) => {
  const me = await getCurrentLogin(c);
  await assertNotPenalized(me, 'parier');
  const body = await c.req.json().catch(() => null);
  const parsed = PlaceBetSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const { targetType, tournamentId, choiceLogin, stake } = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    const tour = await tx.tournament.findUnique({
      where: { id: tournamentId },
      include: { entries: { select: { login: true, partnerLogin: true } } },
    });
    if (!tour) throw new HTTPException(404, { message: 'tournoi introuvable' });
    // Paris ouverts uniquement pendant l'INSCRIPTION : dès que l'admin lance le
    // tournoi (status 'in_progress'), le marché se ferme — on parie sur le
    // vainqueur avant le coup d'envoi.
    if (tour.status !== 'registration') {
      throw new HTTPException(409, { message: 'les paris sont fermés : le tournoi est déjà lancé' });
    }

    // Un participant ne peut pas parier sur le tournoi auquel il joue (il en
    // arrange/contrôle les scores). En 2v2, le COÉQUIPIER aussi est un joueur.
    if (tour.entries.some((e) => e.login === me || e.partnerLogin === me)) {
      throw new HTTPException(403, { message: 'tu ne peux pas parier sur un tournoi auquel tu participes' });
    }
    // Le pronostic est le CAPITAINE (login canonique de l'équipe) — en 2v2 on
    // parie sur le duo via ce login, jamais via le coéquipier.
    if (!tour.entries.some((e) => e.login === choiceLogin)) {
      throw new HTTPException(400, { message: 'le pronostic doit être un participant du tournoi' });
    }

    // Un seul pari ouvert par tournoi.
    const dup = await tx.bet.findFirst({
      where: { bettorLogin: me, status: 'open', tournamentId, matchId: null },
    });
    if (dup) throw new HTTPException(409, { message: 'tu as déjà un pari ouvert sur ce tournoi' });

    // Débit de la mise : vérifie le solde AVANT (grantCoinsTx borne à 0 — on ne
    // veut pas qu'un solde insuffisant soit silencieusement ramené à 0).
    const u = await tx.user.findUnique({ where: { login: me }, select: { leagueCoins: true } });
    if (!u) throw new HTTPException(404, { message: 'utilisateur introuvable' });
    if (u.leagueCoins < stake) throw new HTTPException(409, { message: 'solde insuffisant' });
    await grantCoinsTx(tx, me, -stake, {
      type: 'bet_place',
      meta: { targetType: 'tournament', tournamentId, choiceLogin, stake },
    });

    const bet = await tx.bet.create({
      data: {
        id: randomUUID(),
        bettorLogin: me,
        targetType,
        tournamentId,
        matchId: null,
        choiceLogin,
        stake,
      },
    });
    return { bet, balance: u.leagueCoins - stake };
  });
  emit([me], { type: 'panel:update', payload: {} });
  // La cagnotte change → l'écran TV live recalcule la « HYPE » des duels en direct.
  broadcast({ type: 'tournament:update', payload: {} });
  return c.json({ bet: result.bet, coins: result.balance }, 201);
});

// Pari sur l'issue d'un DUEL d'OPS précis (un défi forcé) : on pronostique le
// traqueur (challenger) OU la cible (opponent). Le gagnant du pari = le vainqueur
// du match de ce duel (réglé au confirm). `challengeId` = id du duel parié.
const PlaceOpsBetSchema = z.object({
  challengeId: z.string().min(1),
  choiceLogin: z.string().min(1),
  stake: z.number().int().positive(),
});

app.post('/bets/ops', async (c) => {
  const me = await getCurrentLogin(c);
  await assertNotPenalized(me, 'parier');
  const body = await c.req.json().catch(() => null);
  const parsed = PlaceOpsBetSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const { challengeId, choiceLogin, stake } = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    const ch = await tx.challenge.findUnique({
      where: { id: challengeId },
      include: { ops: true },
    });
    if (!ch || !ch.opsId || !ch.ops) throw new HTTPException(404, { message: 'duel introuvable' });
    // Marché ouvert uniquement tant que le défi est À JOUER (accepté, pas encore
    // enregistré) et que l'ops parent est encore actif.
    if (ch.status !== 'accepted') {
      throw new HTTPException(409, { message: 'les paris sont fermés : le duel a déjà commencé' });
    }
    if (ch.ops.endedAt || ch.ops.expiresAt <= new Date()) {
      throw new HTTPException(409, { message: 'les paris sont fermés : le duel est terminé' });
    }
    // Les deux protagonistes ne peuvent pas parier sur leur propre duel.
    if (me === ch.challengerLogin || me === ch.opponentLogin) {
      throw new HTTPException(403, { message: 'tu ne peux pas parier sur ton propre duel' });
    }
    // Le pronostic doit être l'un des deux duellistes.
    if (choiceLogin !== ch.challengerLogin && choiceLogin !== ch.opponentLogin) {
      throw new HTTPException(400, { message: 'le pronostic doit être un des deux duellistes' });
    }
    // Un seul pari ouvert par duel.
    const dup = await tx.bet.findFirst({
      where: { bettorLogin: me, status: 'open', challengeId },
    });
    if (dup) throw new HTTPException(409, { message: 'tu as déjà un pari ouvert sur ce duel' });

    const u = await tx.user.findUnique({ where: { login: me }, select: { leagueCoins: true } });
    if (!u) throw new HTTPException(404, { message: 'utilisateur introuvable' });
    if (u.leagueCoins < stake) throw new HTTPException(409, { message: 'solde insuffisant' });
    await grantCoinsTx(tx, me, -stake, {
      type: 'bet_place',
      refId: challengeId,
      meta: { targetType: 'ops', challengeId, opsId: ch.opsId, choiceLogin, stake },
    });

    const bet = await tx.bet.create({
      data: {
        id: randomUUID(),
        bettorLogin: me,
        targetType: 'ops',
        tournamentId: null,
        matchId: null,
        opsId: ch.opsId,
        challengeId,
        choiceLogin,
        stake,
      },
    });
    return { bet, balance: u.leagueCoins - stake };
  });
  emit([me], { type: 'panel:update', payload: {} });
  return c.json({ bet: result.bet, coins: result.balance }, 201);
});

// Pari sur l'ISSUE d'un MATCH de tournoi : victoire joueur A / NUL / victoire
// joueur B. `choiceLogin` = login d'un des deux joueurs, ou DRAW_CHOICE pour le nul
// (ligue uniquement). Marché ouvert tant que le match n'a pas démarré (aucun score
// saisi) ; réglé au confirm du match (settleMatchBetsTx). Cote fixe ×2, ou ×4 avec
// un pronostic de SCORE EXACT (predictedScoreA/B, optionnel — obligatoire pour un
// joueur du match, qui ne peut parier QUE sur le score exact qu'il pense faire).
const PlaceMatchBetSchema = z
  .object({
    matchId: z.string().min(1),
    choiceLogin: z.string().min(1),
    stake: z.number().int().positive(),
    predictedScoreA: z.number().int().min(0).max(999).optional(),
    predictedScoreB: z.number().int().min(0).max(999).optional(),
  })
  .refine((d) => (d.predictedScoreA == null) === (d.predictedScoreB == null), {
    message: 'le score exact se pronostique des deux côtés (A et B)',
  });

app.post('/bets/match', async (c) => {
  const me = await getCurrentLogin(c);
  await assertNotPenalized(me, 'parier');
  const body = await c.req.json().catch(() => null);
  const parsed = PlaceMatchBetSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const { matchId, choiceLogin, stake, predictedScoreA, predictedScoreB } = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    const m = await tx.tournamentMatch.findUnique({ where: { id: matchId } });
    if (!m) throw new HTTPException(404, { message: 'match introuvable' });
    const tour = await tx.tournament.findUnique({
      where: { id: m.tournamentId },
      select: { status: true, game: true },
    });
    if (!tour || tour.status !== 'in_progress') {
      throw new HTTPException(409, { message: 'les paris sont fermés : tournoi non démarré ou terminé' });
    }
    if (!m.playerALogin || !m.playerBLogin) {
      throw new HTTPException(409, { message: 'match pas encore défini (tour précédent en attente)' });
    }
    // Le pile-ou-face lancé ferme aussi le marché : une fois le tirage effectué le
    // match va commencer, on ne parie plus (cohérent avec la liste des marchés
    // ouverts qui exclut déjà tossAt).
    if (m.tossAt) {
      throw new HTTPException(409, { message: 'les paris sont fermés : le pile-ou-face a eu lieu' });
    }
    // Marché ouvert tant qu'aucun score n'a été saisi/confirmé (betsLockedAt posé
    // dès la 1re saisie → le score est exposé, on ne parie plus).
    if (m.betsLockedAt || m.recordedAt || m.confirmedAt) {
      throw new HTTPException(409, { message: 'les paris sont fermés : le match a déjà commencé' });
    }
    const isDraw = choiceLogin === DRAW_CHOICE;
    if (isDraw && m.stage !== 'league') {
      throw new HTTPException(400, { message: 'le nul n’est possible qu’en phase de ligue' });
    }
    if (!isDraw && choiceLogin !== m.playerALogin && choiceLogin !== m.playerBLogin) {
      throw new HTTPException(400, { message: 'le pronostic doit être un des deux joueurs (ou le nul)' });
    }
    // Un joueur du match (ou son coéquipier 2v2) peut parier sur SON match, mais
    // uniquement en pronostiquant le SCORE EXACT qu'il pense faire (réglé strict :
    // gagné ssi le score final est pile, cote ×4 — cf. settleMatchBetsTx).
    const partners = await tournamentPartnerMap(tx, m.tournamentId);
    const players = [
      ...teamMembersOf(m.playerALogin, partners),
      ...teamMembersOf(m.playerBLogin, partners),
    ];
    if (players.includes(me) && predictedScoreA == null) {
      throw new HTTPException(403, {
        message: 'sur ton propre match, tu paries uniquement sur le score exact (pronostique-le)',
      });
    }
    if (predictedScoreA != null && predictedScoreB != null) {
      // Le score pronostiqué doit être plausible pour la discipline (score libre,
      // nul accepté seulement en ligue — mêmes règles que l'édition de score).
      const predErr = validateTournamentScore(parseGameId(tour.game), predictedScoreA, predictedScoreB, {
        freeGoals: true,
        allowDraw: m.stage === 'league',
      });
      if (predErr) throw new HTTPException(400, { message: `score pronostiqué invalide : ${predErr}` });
      // Cohérence pronostic vainqueur ↔ score exact : le vainqueur impliqué par le
      // score doit être le choix parié (égalité → nul).
      const implied =
        predictedScoreA === predictedScoreB
          ? DRAW_CHOICE
          : predictedScoreA > predictedScoreB
            ? m.playerALogin
            : m.playerBLogin;
      if (implied !== choiceLogin) {
        throw new HTTPException(400, { message: 'le score exact pronostiqué contredit ton pronostic de vainqueur' });
      }
    }
    const dup = await tx.bet.findFirst({ where: { bettorLogin: me, status: 'open', matchId } });
    if (dup) throw new HTTPException(409, { message: 'tu as déjà un pari ouvert sur ce match' });
    const u = await tx.user.findUnique({ where: { login: me }, select: { leagueCoins: true } });
    if (!u) throw new HTTPException(404, { message: 'utilisateur introuvable' });
    if (u.leagueCoins < stake) throw new HTTPException(409, { message: 'solde insuffisant' });
    await grantCoinsTx(tx, me, -stake, {
      type: 'bet_place',
      refId: matchId,
      meta: {
        targetType: 'match',
        tournamentId: m.tournamentId,
        matchId,
        choiceLogin,
        stake,
        ...(predictedScoreA != null ? { predictedScoreA, predictedScoreB } : {}),
      },
    });
    const bet = await tx.bet.create({
      data: {
        id: randomUUID(),
        bettorLogin: me,
        targetType: 'match',
        tournamentId: m.tournamentId,
        matchId,
        choiceLogin,
        stake,
        predictedScoreA: predictedScoreA ?? null,
        predictedScoreB: predictedScoreB ?? null,
      },
    });
    return { bet, balance: u.leagueCoins - stake };
  });
  emit([me], { type: 'panel:update', payload: {} });
  broadcast({ type: 'tournament:update', payload: {} });
  return c.json({ bet: result.bet, coins: result.balance }, 201);
});

// POST /admin/shop/grant — crédite (ou débite) des League Coins à un joueur.
// `amount` peut être négatif ; le solde résultant est borné à >= 0.
const ShopGrantSchema = z.object({
  login: z.string().trim().min(1),
  amount: z.number().int(),
});
app.post('/admin/shop/grant', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const body = await c.req.json().catch(() => null);
  const parsed = ShopGrantSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { login, amount } = parsed.data;
  const next = await prisma.$transaction((tx) =>
    grantCoinsTx(tx, login, amount, { type: 'admin_grant', meta: { by: me } }),
  );
  if (next === null) throw new HTTPException(404, { message: 'utilisateur introuvable' });
  emit([login], { type: 'panel:update', payload: {} });
  return c.json({ ok: true, login, coins: next });
});

// GET /admin/shop/users — annuaire « suivi des coins » : tous les joueurs avec
// leur solde (tri solde décroissant), filtrable par `?search=` (login / prénom /
// nom). Sert à la liste cliquable de Shop GOD. Renvoie aussi quelques agrégats
// légers (nb d'objets possédés) pour un aperçu sans ouvrir la fiche.
app.get('/admin/shop/users', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const search = (c.req.query('search') ?? '').trim();
  const where: Prisma.UserWhereInput = search
    ? {
        OR: [
          { login: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};
  const users = await prisma.user.findMany({
    where,
    orderBy: [{ leagueCoins: 'desc' }, { login: 'asc' }],
    select: {
      login: true,
      firstName: true,
      lastName: true,
      imageUrl: true,
      title: true,
      leagueCoins: true,
      _count: { select: { inventory: true, coinTransactions: true } },
    },
  });
  return c.json(
    users.map((u) => ({
      login: u.login,
      firstName: u.firstName,
      lastName: u.lastName,
      imageUrl: u.imageUrl,
      title: u.title,
      coins: u.leagueCoins,
      itemsOwned: u._count.inventory,
      txCount: u._count.coinTransactions,
    })),
  );
});

// GET /admin/shop/users/:login — fiche « suivi des coins » d'un joueur : solde
// courant, récapitulatif (gagné / dépensé / par type), inventaire (cosmétiques +
// consommables) et journal paginé de TOUS ses mouvements de coins (gains/pertes,
// avec le contexte de chacun). Pagination simple via ?limit= & ?offset=.
app.get('/admin/shop/users/:login', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const login = c.req.param('login');
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50) || 50));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
  const typeFilter = (c.req.query('type') ?? '').trim();
  const txWhere: Prisma.CoinTransactionWhereInput = {
    userLogin: login,
    ...(typeFilter ? { type: typeFilter } : {}),
  };

  const user = await prisma.user.findUnique({
    where: { login },
    select: {
      login: true,
      firstName: true,
      lastName: true,
      imageUrl: true,
      title: true,
      leagueCoins: true,
      eloMultUntil: true,
    },
  });
  if (!user) throw new HTTPException(404, { message: 'utilisateur introuvable' });

  const [cosmetics, consumables, txPage, totalTx, earned, spent, byType] = await Promise.all([
    prisma.shopInventory.findMany({
      where: { userLogin: login },
      orderBy: { acquiredAt: 'desc' },
      select: {
        itemId: true,
        equipped: true,
        acquiredAt: true,
        item: { select: { name: true, category: true, rarity: true, color: true, price: true } },
      },
    }),
    prisma.consumableInventory.findMany({ where: { userLogin: login } }),
    prisma.coinTransaction.findMany({
      where: txWhere,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.coinTransaction.count({ where: txWhere }),
    prisma.coinTransaction.aggregate({
      where: { userLogin: login, amount: { gt: 0 } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.coinTransaction.aggregate({
      where: { userLogin: login, amount: { lt: 0 } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.coinTransaction.groupBy({
      by: ['type'],
      where: { userLogin: login },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  return c.json({
    login: user.login,
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl,
    title: user.title,
    coins: user.leagueCoins,
    eloMultUntil: user.eloMultUntil ? user.eloMultUntil.toISOString() : null,
    summary: {
      earned: earned._sum.amount ?? 0,
      spent: spent._sum.amount ?? 0,
      earnedCount: earned._count,
      spentCount: spent._count,
      byType: byType.map((r) => ({ type: r.type, total: r._sum.amount ?? 0, count: r._count._all })),
    },
    inventory: {
      cosmetics: cosmetics.map((r) => ({
        itemId: r.itemId,
        name: r.item.name,
        category: r.item.category,
        rarity: r.item.rarity,
        color: r.item.color,
        price: r.item.price,
        equipped: r.equipped,
        acquiredAt: r.acquiredAt.toISOString(),
      })),
      consumables: consumables.map((r) => ({
        kind: r.kind,
        quantity: r.quantity,
        lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
      })),
    },
    transactions: txPage.map((t) => ({
      id: t.id,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      type: t.type,
      refId: t.refId,
      meta: t.meta,
      createdAt: t.createdAt.toISOString(),
    })),
    total: totalTx,
    limit,
    offset,
    hasMore: offset + txPage.length < totalTx,
  });
});

// POST /admin/shop/grant-item — donne un cosmétique (titre/badge/bannière/cosmétique)
// à un joueur (insertion dans son inventaire), avec auto-équipement optionnel.
const ShopGrantItemSchema = z.object({
  login: z.string().trim().min(1),
  itemId: z.string().min(1),
  equip: z.boolean().optional(),
});
app.post('/admin/shop/grant-item', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const body = await c.req.json().catch(() => null);
  const parsed = ShopGrantItemSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.message });
  }
  const { login, itemId, equip } = parsed.data;
  const [target, item] = await Promise.all([
    prisma.user.findUnique({ where: { login }, select: { login: true } }),
    prisma.shopItem.findUnique({ where: { id: itemId } }),
  ]);
  if (!target) throw new HTTPException(404, { message: 'utilisateur introuvable' });
  if (!item) throw new HTTPException(404, { message: 'objet introuvable' });

  await prisma.$transaction((tx) => grantItemTx(tx, login, itemId, !!equip));

  emit([login], { type: 'panel:update', payload: {} });
  return c.json({ ok: true, login, itemId, equipped: !!equip });
});

// POST /admin/consumables/grant — ajuste (±) le stock d'un consommable d'un joueur.
const AdminConsumableGrantSchema = z.object({
  login: z.string().trim().min(1),
  kind: z.enum(['anti_ops', 'elo_mult', 'force_duel']),
  amount: z.number().int(),
});
app.post('/admin/consumables/grant', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const body = await c.req.json().catch(() => null);
  const parsed = AdminConsumableGrantSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const { login, kind, amount } = parsed.data;
  const target = await prisma.user.findUnique({ where: { login }, select: { login: true } });
  if (!target) throw new HTTPException(404, { message: 'utilisateur introuvable' });
  const quantity = await prisma.$transaction((tx) => grantConsumableTx(tx, login, kind, amount));
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'GRANT_CONSUMABLE',
    target: login,
    payload: { kind, amount, quantity },
  });
  emit([login], { type: 'panel:update', payload: {} });
  return c.json({ ok: true, login, kind, quantity });
});

// POST /admin/consumables/force-use — force l'effet d'un consommable (ignore cap,
// cooldown et stock) ; décrémente le stock s'il en reste.
const AdminConsumableUseSchema = z.object({
  login: z.string().trim().min(1),
  kind: z.enum(['anti_ops', 'elo_mult']),
});
app.post('/admin/consumables/force-use', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const body = await c.req.json().catch(() => null);
  const parsed = AdminConsumableUseSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const { login, kind } = parsed.data;
  const target = await prisma.user.findUnique({ where: { login }, select: { login: true } });
  if (!target) throw new HTTPException(404, { message: 'utilisateur introuvable' });
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    // Décrémente le stock s'il en reste (force = on applique l'effet quoi qu'il arrive).
    const row = await tx.consumableInventory.findUnique({
      where: { userLogin_kind: { userLogin: login, kind } },
    });
    if (row && row.quantity > 0) {
      await tx.consumableInventory.update({
        where: { userLogin_kind: { userLogin: login, kind } },
        data: { quantity: { decrement: 1 }, lastUsedAt: now },
      });
    }
    if (kind === 'elo_mult') {
      // Force : ouvre la fenêtre de 6 h (ignore la limite hebdo) et mémorise la semaine.
      await tx.user.update({
        where: { login },
        data: { eloMultUntil: new Date(now.getTime() + ELO_MULT_DURATION_MS), eloMultWeekKey: isoWeekKey(now) },
      });
      return { armed: true as const, hunter: null as string | null };
    }
    const hunter = await cancelOpsTargetingTx(tx, login, now);
    return { armed: false as const, hunter };
  });

  if (result.hunter) {
    emit([login, result.hunter], { type: 'ops:update', payload: { reason: 'anti_ops' } });
    void notify(result.hunter, {
      type: 'ops_cancelled',
      title: `L'OPS sur @${login} a été annulé`,
      body: 'Un administrateur a neutralisé ton OPS.',
      link: '/profile',
    });
  }
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'FORCE_CONSUMABLE',
    target: login,
    payload: { kind, ...result },
  });
  emit([login], { type: 'panel:update', payload: {} });
  return c.json({ ok: true, login, kind, ...result });
});

// GET /admin/users/:login/items — état consommables + badges libres + titre d'un joueur.
app.get('/admin/users/:login/items', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const login = c.req.param('login');
  const user = await prisma.user.findUnique({
    where: { login },
    select: { title: true, eloMultUntil: true },
  });
  if (!user) throw new HTTPException(404, { message: 'utilisateur introuvable' });
  const rows = await prisma.consumableInventory.findMany({ where: { userLogin: login } });
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  return c.json({
    login,
    title: user.title,
    eloMultUntil: user.eloMultUntil ? user.eloMultUntil.toISOString() : null,
    consumables: CONSUMABLE_KINDS.map((kind) => ({
      kind,
      quantity: byKind.get(kind)?.quantity ?? 0,
      lastUsedAt: byKind.get(kind)?.lastUsedAt?.toISOString() ?? null,
    })),
    badges: await customBadgesFor(login),
  });
});

// POST /admin/users/:login/badges — attribue un badge « libre » (code + icône + label
// + couleur) à un joueur. Upsert (idempotent) sur (login, code, game).
const AdminBadgeSchema = z.object({
  code: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(40),
  icon: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'couleur invalide (format #rrggbb)').optional(),
  game: z.string().trim().max(20).optional(),
});
app.post('/admin/users/:login/badges', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const login = c.req.param('login');
  const body = await c.req.json().catch(() => null);
  const parsed = AdminBadgeSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const target = await prisma.user.findUnique({ where: { login }, select: { login: true } });
  if (!target) throw new HTTPException(404, { message: 'utilisateur introuvable' });
  const { code, label, icon, color, game } = parsed.data;
  const g = game ?? '';
  await prisma.userBadge.upsert({
    where: { userLogin_code_game: { userLogin: login, code, game: g } },
    update: { label, icon, color: color ?? null },
    create: { id: randomUUID(), userLogin: login, code, game: g, label, icon, color: color ?? null },
  });
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'GRANT_BADGE',
    target: login,
    payload: { code, label, icon, color: color ?? null, game: g },
  });
  emit([login], { type: 'panel:update', payload: {} });
  void notify(login, {
    type: 'badge_awarded',
    title: 'Nouveau badge débloqué',
    body: `Tu as reçu le badge « ${label} ».`,
    link: '/profile',
  });
  return c.json({ ok: true, login, code });
});

// DELETE /admin/users/:login/badges/:code — retire un badge d'un joueur (game via ?game=).
app.delete('/admin/users/:login/badges/:code', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const login = c.req.param('login');
  const code = c.req.param('code');
  const game = c.req.query('game') ?? '';
  await prisma.userBadge
    .delete({ where: { userLogin_code_game: { userLogin: login, code, game } } })
    .catch(() => {
      throw new HTTPException(404, { message: 'badge introuvable' });
    });
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'REMOVE_BADGE',
    target: login,
    payload: { code, game },
  });
  emit([login], { type: 'panel:update', payload: {} });
  return c.json({ ok: true, login, code });
});

// ── RGPD Art. 5(1)(e) — Purge automatique des logs admin après 24 mois ──
async function purgeOldAuditLogs(): Promise<void> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);
  const { count } = await prisma.adminAuditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  if (count > 0) console.log(`[purge] ${count} audit log entries older than 24 months deleted`);
}

// ── Cooldown de 48h : auto-validation des matchs déclarés non confirmés ──
// Un match déclaré que l'adversaire ne confirme NI ne conteste sous 48h est
// AUTO-VALIDÉ avec le score du déclarant (l'ELO compte), puis reste contestable a
// posteriori (cf. POST /matches/played/:id/contest) tant qu'aucun litige n'a été
// ouvert ni tranché. Remplace l'ancienne purge (suppression à 72h) : on ne jette
// plus le résultat, on l'entérine — l'adversaire absent ne bloque plus le match.
const PENDING_MATCH_AUTOCONFIRM_HOURS = Number(process.env.PENDING_MATCH_AUTOCONFIRM_HOURS ?? 48);
// Idem pour les défis : un défi (invitation à jouer) non accepté sous 48h EXPIRE
// (status 'expired', sans pénalité ni auto-acceptation) et disparaît des listes.
const CHALLENGE_ACCEPT_TTL_HOURS = Number(process.env.CHALLENGE_ACCEPT_TTL_HOURS ?? 48);

async function autoConfirmStalePendingMatches(): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - PENDING_MATCH_AUTOCONFIRM_HOURS * 60 * 60 * 1000);
  const stale = await prisma.pendingMatch.findMany({
    where: { declaredAt: { lt: cutoff } },
    orderBy: { declaredAt: 'asc' },
  });
  if (stale.length === 0) return;

  let confirmed = 0;
  for (const p of stale) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Re-lecture dans la transaction : un confirm/reject concurrent a pu la régler.
        const fresh = await tx.pendingMatch.findUnique({ where: { id: p.id } });
        if (!fresh) return null;
        const created = await settlePendingAsPlayed(tx, fresh);
        // Marque le match comme auto-validé (→ contestable a posteriori) et mémorise
        // le déclarant (les côtés A/B suivent l'ordre canonique, pas déclarant/adversaire).
        await tx.playedMatch.update({
          where: { id: created.id },
          data: { autoConfirmedAt: now, autoConfirmDeclarerLogin: fresh.declarerLogin },
        });

        // OPS (strictement 1v1) : un duel d'ops auto-validé consomme un match forcé,
        // exactement comme au confirm manuel (cf. /matches/:id/confirm).
        const opsBetween =
          created.mode === '2v2'
            ? null
            : await tx.ops.findFirst({
                where: {
                  expiresAt: { gt: now },
                  forcedUsed: { lt: OPS_FORCED_MATCHES },
                  OR: [
                    { ownerLogin: created.playerALogin, targetLogin: created.playerBLogin },
                    { ownerLogin: created.playerBLogin, targetLogin: created.playerALogin },
                  ],
                },
              });
        if (opsBetween) {
          const willEnd = opsBetween.forcedUsed + 1 >= OPS_FORCED_MATCHES;
          await tx.ops.update({
            where: { id: opsBetween.id },
            data: { forcedUsed: { increment: 1 }, ...(willEnd ? { endedAt: now } : {}) },
          });
        }
        // Paris sur un duel d'ops : réglés par le vainqueur (ou remboursés si nul).
        let opsDuelCredited: string[] = [];
        if (fresh.challengeId) {
          const winnerLogin =
            created.winner === 'A'
              ? created.playerALogin
              : created.winner === 'B'
                ? created.playerBLogin
                : null;
          opsDuelCredited = winnerLogin
            ? await settleBetsTx(tx, { targetType: 'ops', challengeId: fresh.challengeId }, winnerLogin)
            : await refundBetsTx(tx, { targetType: 'ops', challengeId: fresh.challengeId });
        }
        return { match: created, opsTouched: !!opsBetween, opsDuelCredited };
      });
      if (!result) continue;
      const match = result.match;
      confirmed++;

      const recipients =
        match.mode === '2v2'
          ? ([match.playerALogin, match.playerBLogin, match.playerA2Login, match.playerB2Login].filter(
              Boolean,
            ) as string[])
          : [match.playerALogin, match.playerBLogin];
      // Résultat poussé en temps réel + marqueur auto-validation (le front affiche
      // « match auto-validé, contestable » à l'adversaire).
      emit(recipients, { type: 'match:confirmed', payload: { ...match, autoConfirmed: true } });
      // Le « score à valider » de l'adversaire est soldé, puis on le prévient que le
      // match a été auto-validé faute de réponse — et qu'il peut encore le contester.
      const opponents = [p.opponentLogin, p.partner2Login].filter(Boolean) as string[];
      void markNotifsReadByRef(opponents, p.id);
      void notifyMany(opponents, {
        type: 'match_auto_confirmed',
        title: `Match auto-validé`,
        body: `Tu n'as pas répondu sous ${PENDING_MATCH_AUTOCONFIRM_HOURS}h : le score de @${p.declarerLogin} a été validé. Tu peux encore le contester.`,
        link: `/challenges?game=${encodeURIComponent(match.game)}`,
        game: match.game,
        refId: match.id,
      });
      void notifyMatchResult(match);
      broadcast({ type: 'leaderboard:update', payload: {} });
      void maybeNotifyTop3(match.playerALogin, match.deltaA);
      void maybeNotifyTop3(match.playerBLogin, match.deltaB);
      if (result.opsDuelCredited.length) {
        emit([...new Set(result.opsDuelCredited)], { type: 'panel:update', payload: {} });
      }
      if (result.opsTouched) {
        emit([match.playerALogin, match.playerBLogin], {
          type: 'ops:update',
          payload: { reason: 'forced_played' },
        });
      }
    } catch (err) {
      console.error(`[auto-confirm] failed to settle pending match ${p.id}`, err);
    }
  }
  if (confirmed > 0) {
    console.log(
      `[auto-confirm] ${confirmed} pending match(es) older than ${PENDING_MATCH_AUTOCONFIRM_HOURS}h auto-validated`,
    );
  }
}

// Expire les défis (invitations) non acceptés sous 48h : status 'expired', sans
// pénalité ni auto-acceptation (un défi n'engage personne tant qu'il n'est pas
// accepté). Seuls les défis 'pending' sont concernés ; les duels d'ops, nés
// 'accepted', ne sont jamais touchés.
async function expireStaleChallenges(): Promise<void> {
  const cutoff = new Date(Date.now() - CHALLENGE_ACCEPT_TTL_HOURS * 60 * 60 * 1000);
  const stale = await prisma.challenge.findMany({
    where: { status: 'pending', createdAt: { lt: cutoff } },
    select: {
      id: true,
      challengerLogin: true,
      opponentLogin: true,
      partnerLogin: true,
      opponentPartnerLogin: true,
      opsId: true,
    },
  });
  // Sécurité : ne jamais expirer un duel d'ops forcé (il est de toute façon 'accepted').
  const expirable = stale.filter((ch) => !ch.opsId);
  if (expirable.length === 0) return;
  await prisma.challenge.updateMany({
    where: { id: { in: expirable.map((ch) => ch.id) } },
    data: { status: 'expired', decidedAt: new Date() },
  });
  for (const ch of expirable) {
    const recipients = [
      ch.challengerLogin,
      ch.opponentLogin,
      ch.partnerLogin,
      ch.opponentPartnerLogin,
    ].filter(Boolean) as string[];
    emit(recipients, { type: 'challenge:expired', payload: { id: ch.id } });
    void markNotifsReadByRef([ch.opponentLogin, ch.opponentPartnerLogin].filter(Boolean) as string[], ch.id);
  }
  console.log(
    `[expire] ${expirable.length} challenge(s) older than ${CHALLENGE_ACCEPT_TTL_HOURS}h expired`,
  );
}

// ── RGPD Art. 17 — Anonymisation différée des comptes supprimés ──
// Les comptes dont la suppression a été demandée il y a plus de
// ACCOUNT_GRACE_DAYS jours (et pas encore anonymisés) sont anonymisés
// définitivement. Une reconnexion avant l'échéance a remis deletionScheduledAt
// à null (getOrCreateUser), donc ils n'apparaissent jamais ici.
async function purgeScheduledDeletions(): Promise<void> {
  const cutoff = new Date(Date.now() - ACCOUNT_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const due = await prisma.user.findMany({
    where: { deletionScheduledAt: { lt: cutoff }, anonymizedAt: null },
    select: { login: true },
  });
  for (const u of due) {
    await anonymizeAccount(u.login);
  }
  if (due.length > 0) {
    console.log(
      `[purge] ${due.length} account(s) anonymized after ${ACCOUNT_GRACE_DAYS}-day grace period`,
    );
  }
}

// ── Street Fighter Club Sessions (public) ─────────────────────────────────
app.get('/sf-session/current', async (c) => {
  const now = new Date();
  const active = await prisma.sfSession.findFirst({
    where: {
      isActive: true,
      startTime: { lte: now },
      OR: [{ endTime: null }, { endTime: { gt: now } }],
    },
    orderBy: { startTime: 'desc' },
    include: { organizer: { select: { login: true, firstName: true, lastName: true, imageUrl: true } } },
  });
  if (active) return c.json({ session: active, status: 'active' });

  const next = await prisma.sfSession.findFirst({
    where: { isActive: true, startTime: { gt: now } },
    orderBy: { startTime: 'asc' },
    include: { organizer: { select: { login: true, firstName: true, lastName: true, imageUrl: true } } },
  });
  if (next) return c.json({ session: next, status: 'upcoming' });

  return c.json({ session: null, status: 'none' });
});

// ── Admin : Sessions Street Fighter ────────────────────────────────────────

app.get('/admin/sf-sessions', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSfAdminOrAdmin(me);
  const sessions = await prisma.sfSession.findMany({
    orderBy: { startTime: 'desc' },
    take: 50,
    include: { organizer: { select: { login: true, firstName: true, lastName: true, imageUrl: true } } },
  });
  return c.json(sessions);
});

app.post('/admin/sf-sessions', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSfAdminOrAdmin(me);
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateSfSessionSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const { startTime, endTime, durationHours, description } = parsed.data;
  let resolvedEndTime: Date | undefined;
  if (endTime) {
    resolvedEndTime = new Date(endTime);
  } else if (durationHours) {
    resolvedEndTime = new Date(new Date(startTime).getTime() + durationHours * 60 * 60 * 1000);
  }
  const session = await prisma.sfSession.create({
    data: {
      startTime: new Date(startTime),
      endTime: resolvedEndTime ?? null,
      organizerLogin: me,
      description: description ?? null,
    },
    include: { organizer: { select: { login: true, firstName: true, lastName: true, imageUrl: true } } },
  });
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'OPEN_SF_SESSION',
    payload: { sessionId: session.id, startTime },
  });
  broadcast({ type: 'data:update', payload: {} });
  return c.json(session, 201);
});

app.patch('/admin/sf-sessions/:id', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSfAdminOrAdmin(me);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const parsed = UpdateSfSessionSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
  const session = await prisma.sfSession.findUnique({ where: { id } });
  if (!session) throw new HTTPException(404, { message: 'session not found' });
  const data: Record<string, unknown> = {};
  if (parsed.data.endTime !== undefined) data.endTime = parsed.data.endTime ? new Date(parsed.data.endTime) : null;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  const updated = await prisma.sfSession.update({
    where: { id },
    data,
    include: { organizer: { select: { login: true, firstName: true, lastName: true, imageUrl: true } } },
  });
  if (parsed.data.isActive === false) {
    await logAdminAction(c, {
      actor: me,
      actorRole: await getUserRole(me),
      action: 'CLOSE_SF_SESSION',
      payload: { sessionId: id },
    });
  }
  broadcast({ type: 'data:update', payload: {} });
  return c.json(updated);
});

app.delete('/admin/sf-sessions/:id', async (c) => {
  const me = await getCurrentLogin(c);
  await requireSfAdminOrAdmin(me);
  const id = c.req.param('id');
  const session = await prisma.sfSession.findUnique({ where: { id } });
  if (!session) throw new HTTPException(404, { message: 'session not found' });
  await prisma.sfSession.delete({ where: { id } });
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'CANCEL_SF_SESSION',
    payload: { sessionId: id },
  });
  broadcast({ type: 'data:update', payload: {} });
  return c.json({ ok: true });
});

app.post('/admin/users/:login/sf-admin', async (c) => {
  const me = await getCurrentLogin(c);
  await requireAdmin(me);
  const login = c.req.param('login');
  const body = await c.req.json().catch(() => ({}));
  const sfAdmin = typeof body.sfAdmin === 'boolean' ? body.sfAdmin : false;
  const user = await prisma.user.findUnique({ where: { login } });
  if (!user) throw new HTTPException(404, { message: 'user not found' });
  await prisma.user.update({ where: { login }, data: { sfAdmin } });
  await logAdminAction(c, {
    actor: me,
    actorRole: await getUserRole(me),
    action: 'SET_SF_ADMIN',
    target: login,
    payload: { sfAdmin },
  });
  broadcast({ type: 'data:update', payload: {} });
  return c.json({ ok: true, sfAdmin });
});

const port = Number(process.env.PORT ?? 3000);

// En environnement de test (NODE_ENV=test), on importe `app` pour le tester via
// app.request(...) SANS démarrer le serveur HTTP ni les timers de fond (purge,
// ops). Sinon vitest ne se terminerait jamais (handles ouverts).
if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`42 League backend listening on http://localhost:${info.port}`);
    // Upsert de la mystery box — item permanent du shop, non créable via GOD panel.
    prisma.shopItem.upsert({
      where: { id: 'mystery-box' },
      update: { rarity: 'common' },
      create: {
        id: 'mystery-box',
        name: 'Boîte Mystère',
        description: null,
        category: 'mystery_box',
        price: 200,
        rarity: 'common',
        active: true,
        sortOrder: 0,
        color: null,
      },
    }).catch((err) => console.error('failed to upsert mystery box', err));
    // Titre « Mysterious » — exclusivité Boîte Mystère (1 chance sur 10), JAMAIS
    // achetable directement (active=false → hors vitrine + 404 sur /buy). Couleur
    // sentinelle 'rainbow' → le front le rend en dégradé arc-en-ciel animé.
    prisma.shopItem.upsert({
      where: { id: 'title-mysterious' },
      update: { color: 'rainbow', rarity: 'legendary', payload: { title: 'Mysterious' } },
      create: {
        id: 'title-mysterious',
        name: 'Titre « Mysterious »',
        description: 'Titre arc-en-ciel animé — 1 chance sur 10 dans la Boîte Mystère.',
        category: 'title',
        price: 0,
        rarity: 'legendary',
        active: false,
        sortOrder: 0,
        color: 'rainbow',
        payload: { title: 'Mysterious' },
      },
    }).catch((err) => console.error('failed to upsert mysterious title', err));
    // Upsert des consommables — items permanents du shop (ids stables). On rafraîchit
    // nom/desc/prix/rareté mais on ne touche pas au reste (payload.kind = type).
    for (const ci of CONSUMABLE_ITEMS) {
      prisma.shopItem
        .upsert({
          where: { id: ci.id },
          // On ne corrige QUE la structure (catégorie + type) au redémarrage : le
          // prix, le nom, la rareté, etc. restent éditables depuis le /GOD shop et
          // ne sont jamais réécrits par le seed.
          update: { category: 'consumable', payload: { kind: ci.kind } },
          create: {
            id: ci.id,
            name: ci.name,
            description: ci.description,
            category: 'consumable',
            price: ci.price,
            rarity: ci.rarity,
            active: true,
            sortOrder: 0,
            color: null,
            payload: { kind: ci.kind },
          },
        })
        .catch((err) => console.error(`failed to upsert consumable ${ci.id}`, err));
    }
    // Seed de données de test — staging uniquement, jamais en prod.
    if (process.env.APP_ENV === 'staging') {
      seedStaging().catch((err) => {
        console.error('failed to seed staging test data', err);
      });
    }
    rescheduleOpsTimers().catch((err) => {
      console.error('failed to reschedule ops timers', err);
    });
    // Solde les paris d'ops expirés pendant l'arrêt du process (timers perdus).
    sweepExpiredOpsBets().catch((err) => {
      console.error('failed to sweep expired ops bets', err);
    });
    const runDailyPurges = () => {
      purgeOldAuditLogs().catch((err) => {
        console.error('failed to purge old audit logs', err);
      });
      purgeScheduledDeletions().catch((err) => {
        console.error('failed to purge scheduled account deletions', err);
      });
      // Revenus passifs hebdomadaires (podium des trophées) — idempotent par semaine
      // ISO, donc un check quotidien crédite une seule fois en début de semaine.
      runWeeklyTrophyIncome().catch((err) => {
        console.error('failed to run weekly trophy income', err);
      });
    };
    runDailyPurges();
    // Purge quotidienne à 03h00
    const msUntil3am = (() => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(3, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next.getTime() - now.getTime();
    })();
    setTimeout(() => {
      runDailyPurges();
      setInterval(runDailyPurges, 24 * 60 * 60 * 1000);
    }, msUntil3am);

    // Clôture programmée des saisons : vérifie chaque minute si la saison active a
    // une `scheduledEndAt` échue, et bascule alors automatiquement sur la saison
    // suivante (`nextSeasonName`). Idempotent : après bascule la nouvelle saison
    // n'a plus de date programmée, donc plus aucun déclenchement.
    let seasonRolloverRunning = false;
    const checkSeasonSchedule = async () => {
      if (seasonRolloverRunning) return;
      const active = await prisma.season.findFirst({ where: { isActive: true } });
      if (!active || !active.scheduledEndAt || !active.nextSeasonName) return;
      if (active.scheduledEndAt.getTime() > Date.now()) return;
      seasonRolloverRunning = true;
      try {
        const nextName = active.nextSeasonName;
        console.log(`[season] clôture programmée atteinte → nouvelle saison « ${nextName} »`);
        await performSeasonRollover(nextName);
      } finally {
        seasonRolloverRunning = false;
      }
    };
    checkSeasonSchedule().catch((err) => console.error('season schedule check failed', err));
    setInterval(() => {
      checkSeasonSchedule().catch((err) => console.error('season schedule check failed', err));
    }, 60 * 1000);

    // Cooldown de 48h : auto-validation des matchs déclarés non confirmés +
    // expiration des défis non acceptés. Balayage toutes les 5 min (les délais
    // sont en heures, pas besoin de précision à la minute) + une passe au boot
    // pour rattraper ce qui a expiré pendant l'arrêt du process.
    let staleSweepRunning = false;
    const sweepStale = async () => {
      if (staleSweepRunning) return;
      staleSweepRunning = true;
      try {
        await autoConfirmStalePendingMatches();
        await expireStaleChallenges();
      } finally {
        staleSweepRunning = false;
      }
    };
    sweepStale().catch((err) => console.error('stale sweep failed', err));
    setInterval(() => {
      sweepStale().catch((err) => console.error('stale sweep failed', err));
    }, 5 * 60 * 1000);
  });
}
