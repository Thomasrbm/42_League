import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';

// =========================================================================
// RATE-LIMITING — fenêtre fixe + pénalités progressives par IP
// =========================================================================
// Deux niveaux :
//  1. Fenêtre fixe (bucket counter) — bloque les floods de base.
//  2. Pénalités exponentielles — plus on spam, plus le blocage dure longtemps :
//       30 s → 2 min → 8 min → 30 min → 2 h → 8 h
//     Le compteur de violations est remis à zéro après 24 h sans incident.

type Bucket = { count: number; resetAt: number };
type Penalty = { violations: number; blockedUntil: number; lastViolationAt: number };

const bucketStores = new Map<string, Map<string, Bucket>>();
const penaltyStore = new Map<string, Penalty>();

const VIOLATION_TTL_MS = 24 * 3600_000;

// Durées croissantes : 30 s, 2 min, 8 min, 30 min, 2 h, 8 h.
const PENALTY_STEPS_MS = [30_000, 120_000, 480_000, 1_800_000, 7_200_000, 28_800_000];

function getPenaltyDuration(violations: number): number {
  const idx = Math.min(violations - 1, PENALTY_STEPS_MS.length - 1);
  return PENALTY_STEPS_MS[idx] ?? PENALTY_STEPS_MS[PENALTY_STEPS_MS.length - 1]!;
}

let sweeper: ReturnType<typeof setInterval> | null = null;
function ensureSweeper(): void {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const store of bucketStores.values()) {
      for (const [k, b] of store) {
        if (b.resetAt <= now) store.delete(k);
      }
    }
    for (const [ip, p] of penaltyStore) {
      if (now - p.lastViolationAt > VIOLATION_TTL_MS) penaltyStore.delete(ip);
    }
  }, 60_000);
  sweeper.unref?.();
}

/**
 * Extrait l'IP cliente derrière le reverse-proxy (Caddy).
 *
 * SÉCURITÉ (audit INJ-1) : on prend le DERNIER maillon de `X-Forwarded-For`, pas
 * le premier. Le token le plus à gauche est celui que le CLIENT peut forger ;
 * chaque proxy ajoute à DROITE l'IP qu'il a réellement vue. Derrière notre unique
 * proxy de confiance, le dernier token est donc l'IP vue par Caddy. En prod Caddy
 * réécrit déjà `XFF = {remote_host}` (un seul token) — prendre le dernier est
 * alors équivalent, mais reste correct si l'app est exposée sans proxy ou si des
 * hops multiples apparaissent. Prendre le premier laissait un attaquant choisir
 * sa propre clé de rate-limit (bypass) via un header forgé.
 */
export function clientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  const real = c.req.header('x-real-ip');
  if (real) return real.trim();
  return c.req.header('cf-connecting-ip')?.trim() ?? 'unknown';
}

export interface RateLimitOptions {
  name: string;
  windowMs: number;
  max: number;
  skip?: (c: Context) => boolean | Promise<boolean>;
  /**
   * Clé de comptage (bucket + pénalité). Défaut : l'IP cliente.
   * À surcharger pour compter par utilisateur (login signé) — indispensable
   * derrière un NAT unique (campus 42) où toutes les IP sont identiques.
   */
  key?: (c: Context) => string | Promise<string>;
  /** Activer les pénalités progressives (défaut : true). */
  progressive?: boolean;
}

export function rateLimit(opts: RateLimitOptions) {
  ensureSweeper();
  // Pénalité progressive DÉSACTIVÉE par défaut : on ne veut plus AUCUN ban qui
  // escalade (« blocked for Xs »), insupportable en usage normal. Au pire, un flood
  // réel reçoit un 429 « slow down » transitoire qui se purge à la fin de la fenêtre.
  // À n'activer (progressive: true) que pour un cas précis qui le justifierait.
  const progressive = opts.progressive ?? false;

  if (!bucketStores.has(opts.name)) bucketStores.set(opts.name, new Map());
  const store = bucketStores.get(opts.name)!;

  return async (c: Context, next: Next) => {
    if (opts.skip && (await opts.skip(c))) { await next(); return; }

    const subject = opts.key ? await opts.key(c) : clientIp(c);
    const now = Date.now();

    // Vérification de la pénalité avant tout.
    if (progressive) {
      const penalty = penaltyStore.get(subject);
      if (penalty && penalty.blockedUntil > now) {
        const retryAfter = Math.ceil((penalty.blockedUntil - now) / 1000);
        c.header('Retry-After', String(retryAfter));
        throw new HTTPException(429, { message: `too many requests — blocked for ${retryAfter}s` });
      }
    }

    const key = `${opts.name}:${subject}`;
    let bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      store.set(key, bucket);
    }
    bucket.count++;

    const remaining = Math.max(0, opts.max - bucket.count);
    c.header('X-RateLimit-Limit', String(opts.max));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > opts.max) {
      if (progressive) {
        const existing = penaltyStore.get(subject);
        const violations = (existing?.violations ?? 0) + 1;
        const duration = getPenaltyDuration(violations);
        penaltyStore.set(subject, { violations, blockedUntil: now + duration, lastViolationAt: now });
        const retryAfter = Math.ceil(duration / 1000);
        c.header('Retry-After', String(retryAfter));
        throw new HTTPException(429, { message: `too many requests — blocked for ${retryAfter}s (violation #${violations})` });
      }
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      c.header('Retry-After', String(retryAfter));
      throw new HTTPException(429, { message: 'too many requests — slow down' });
    }

    await next();
  };
}

/**
 * Efface la pénalité d'un sujet (user ou IP) et ses buckets fenêtre-fixe —
 * pour débloquer via `DELETE /admin/rate-limit/me`.
 */
export function clearPenalty(subject: string): void {
  penaltyStore.delete(subject);
  for (const store of bucketStores.values()) {
    for (const key of store.keys()) {
      if (key.endsWith(`:${subject}`)) store.delete(key);
    }
  }
}

/** Renvoie l'état de la pénalité active pour un sujet (user ou IP), ou null. */
export function getPenaltyInfo(
  subject: string,
): { blockedUntil: number; remainingSec: number; violations: number } | null {
  const p = penaltyStore.get(subject);
  if (!p || p.blockedUntil <= Date.now()) return null;
  return {
    blockedUntil: p.blockedUntil,
    remainingSec: Math.ceil((p.blockedUntil - Date.now()) / 1000),
    violations: p.violations,
  };
}

/** Réinitialise tous les compteurs — réservé aux tests. */
export function __resetRateLimitStore(): void {
  for (const s of bucketStores.values()) s.clear();
  penaltyStore.clear();
}
