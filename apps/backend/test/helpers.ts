import { app, CURRENT_TERMS_VERSION } from '../src/index.js';
import { prisma } from '../src/db.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers pour les tests d'intégration des routes.
//   - resetDb()   : vide toutes les tables entre chaque test (isolation)
//   - seedUser()  : crée un utilisateur directement en DB (avec imageUrl pour
//                   éviter le fetch ft-api en arrière-plan de getOrCreateUser)
//   - api()       : appelle une route via app.request() ; auth via x-dev-login
// ─────────────────────────────────────────────────────────────────────────────

// CASCADE + RESTART IDENTITY : ordre indifférent grâce à CASCADE.
const TABLES = [
  'admin_audit_log',
  'rejected_matches',
  'feature_requests',
  'tournament_matches',
  'tournament_entries',
  'tournaments',
  'ops',
  'pending_matches',
  'played_matches',
  'challenges',
  'users',
];

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

export type RoleName = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPERADMIN';

// Génère un ftId déterministe et unique à partir du login pour simuler un vrai
// utilisateur 42 (la route POST /matches exige opponent.ftId non nul).
function loginToFtId(login: string): number {
  return login.split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0) + 42000;
}

export interface SeedUserOpts {
  elo?: number;
  leagueCoins?: number;
  role?: RoleName;
  matchesPlayed?: number;
  dodgeCount?: number;
  tournamentsWon?: number;
  bannedAt?: Date | null;
  title?: string | null;
  ftId?: number | null;
  /** Par défaut le user a consenti (sinon la consent-gate renvoie 403). Mettre false
   *  pour tester explicitement le comportement avant consentement. */
  consented?: boolean;
}

export async function seedUser(login: string, opts: SeedUserOpts = {}) {
  const consented = opts.consented ?? true;
  return prisma.user.create({
    data: {
      login,
      // ftId renseigné → POST /matches peut déclarer des matchs contre cet utilisateur.
      ftId: opts.ftId !== undefined ? opts.ftId : loginToFtId(login),
      // imageUrl renseigné → getOrCreateUser ne déclenchera pas le fetch 42.
      imageUrl: `https://example.test/${login}.jpg`,
      elo: opts.elo ?? 1000,
      leagueCoins: opts.leagueCoins ?? 0,
      role: opts.role ?? 'USER',
      matchesPlayed: opts.matchesPlayed ?? 0,
      dodgeCount: opts.dodgeCount ?? 0,
      tournamentsWon: opts.tournamentsWon ?? 0,
      bannedAt: opts.bannedAt ?? null,
      title: opts.title ?? null,
      // Consentement RGPD pré-enregistré pour ne pas buter sur la consent-gate.
      termsAcceptedAt: consented ? new Date() : null,
      termsVersion: consented ? CURRENT_TERMS_VERSION : null,
    },
  });
}

/** Crée plusieurs users d'un coup. */
export async function seedUsers(...logins: string[]) {
  for (const l of logins) await seedUser(l);
}

export interface ApiResult<T = any> {
  status: number;
  body: T;
}

export interface ApiOpts {
  login?: string; // pose le header x-dev-login (auth de test)
  body?: unknown;
  headers?: Record<string, string>;
}

export async function api<T = any>(
  method: string,
  path: string,
  opts: ApiOpts = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.login) headers['x-dev-login'] = opts.login;
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await app.request(path, { method, headers, body });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed as T };
}

// Raccourcis lisibles.
export const get = <T = any>(path: string, opts?: ApiOpts) => api<T>('GET', path, opts);
export const post = <T = any>(path: string, opts?: ApiOpts) => api<T>('POST', path, opts);
export const put = <T = any>(path: string, opts?: ApiOpts) => api<T>('PUT', path, opts);
export const patch = <T = any>(path: string, opts?: ApiOpts) => api<T>('PATCH', path, opts);
export const del = <T = any>(path: string, opts?: ApiOpts) => api<T>('DELETE', path, opts);

/** Date ISO future (pour scheduledAt des défis). */
export function futureISO(minutes = 60): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
