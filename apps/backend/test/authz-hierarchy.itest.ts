import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDb, seedUser, post, patch } from './helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Régression sécurité AUTHZ-1 (audit juillet 2026).
//
// Les actions de modération (ban, édition de stats) ne protégeaient QUE les
// SUPERADMIN. Un MODERATOR disposant de `canBan`/`canEditStats` pouvait donc
// sanctionner un ADMIN (griefing vertical). Correctif : `assertOutranksTarget`
// refuse toute action sur une cible de rang de rôle ≥ à celui de l'acteur.
//
// Rangs : USER(0) < MODERATOR(1) < ADMIN(2) < SUPERADMIN(3).
// ─────────────────────────────────────────────────────────────────────────────

/** Crée un modérateur avec les permissions déléguées demandées. */
async function seedModerator(login: string, perms: Record<string, boolean>) {
  await seedUser(login, { role: 'MODERATOR' });
  await prisma.user.update({
    where: { login },
    data: { moderatorPermissions: perms as never },
  });
}

async function isBanned(login: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { login }, select: { bannedAt: true } });
  return u?.bannedAt != null;
}

describe('AUTHZ-1 — hiérarchie des rôles (ban)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('un MODERATOR (canBan) peut bannir un simple USER', async () => {
    await seedModerator('mod', { canBan: true });
    await seedUser('victim');

    const r = await post('/admin/users/victim/ban', { login: 'mod' });
    expect(r.status).toBe(200);
    expect(await isBanned('victim')).toBe(true);
  });

  it('un MODERATOR NE PEUT PAS bannir un ADMIN → 403, admin non banni', async () => {
    await seedModerator('mod', { canBan: true });
    await seedUser('boss', { role: 'ADMIN' });

    const r = await post('/admin/users/boss/ban', { login: 'mod' });
    expect(r.status).toBe(403);
    expect(await isBanned('boss')).toBe(false);
  });

  it('un ADMIN peut bannir un MODERATOR', async () => {
    await seedUser('chief', { role: 'ADMIN' });
    await seedModerator('mod', { canBan: true });

    const r = await post('/admin/users/mod/ban', { login: 'chief' });
    expect(r.status).toBe(200);
    expect(await isBanned('mod')).toBe(true);
  });

  it('un ADMIN NE PEUT PAS bannir un autre ADMIN → 403', async () => {
    await seedUser('chief', { role: 'ADMIN' });
    await seedUser('peer', { role: 'ADMIN' });

    const r = await post('/admin/users/peer/ban', { login: 'chief' });
    expect(r.status).toBe(403);
    expect(await isBanned('peer')).toBe(false);
  });
});

describe('AUTHZ-1 — hiérarchie des rôles (édition de stats)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('un MODERATOR (canEditStats) peut éditer les stats d’un USER', async () => {
    await seedModerator('mod', { canEditStats: true });
    await seedUser('player', { elo: 1000 });

    const r = await patch('/admin/users/player/stats', { login: 'mod', body: { elo: 1234 } });
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { login: 'player' }, select: { elo: true } });
    expect(u?.elo).toBe(1234);
  });

  it('un MODERATOR NE PEUT PAS éditer les stats d’un ADMIN → 403, stats intactes', async () => {
    await seedModerator('mod', { canEditStats: true });
    await seedUser('boss', { role: 'ADMIN', elo: 1500 });

    const r = await patch('/admin/users/boss/stats', { login: 'mod', body: { elo: 9999 } });
    expect(r.status).toBe(403);
    const u = await prisma.user.findUnique({ where: { login: 'boss' }, select: { elo: true } });
    expect(u?.elo).toBe(1500);
  });
});
