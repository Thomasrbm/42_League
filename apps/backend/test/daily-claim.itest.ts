import { describe, it, expect, beforeEach } from 'vitest';
import { get, post, resetDb, seedUser } from './helpers.js';
import { prisma } from '../src/db.js';

// Récolte quotidienne (POST /daily/claim + exposition GET /me.dailyClaim).
describe('récolte quotidienne', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('1re récolte : crédite XP + coins (jour 1 = +10 XP / +5 coins) et série = 1', async () => {
    await seedUser('alice', { elo: 1000 });
    const r = await post('/daily/claim', { login: 'alice' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ streak: 1, xp: 10, coins: 5, balance: 5, totalXp: 10 });

    const u = await prisma.user.findUnique({ where: { login: 'alice' } });
    expect(u?.leagueCoins).toBe(5);
    expect(u?.xp).toBe(10);
    expect(u?.dailyClaimStreak).toBe(1);
    expect(u?.dailyClaimBest).toBe(1);
    expect(u?.dailyClaimDay).not.toBeNull();
  });

  it('GET /me reflète la récolte : claimedToday=true après le claim, montants du jour/demain', async () => {
    await seedUser('bob');
    const before = await get('/me', { login: 'bob' });
    expect(before.body.dailyClaim).toMatchObject({
      claimedToday: false,
      streak: 1,
      reward: { xp: 10, coins: 5 },
      next: { xp: 15, coins: 8 },
    });

    await post('/daily/claim', { login: 'bob' });

    const after = await get('/me', { login: 'bob' });
    expect(after.body.dailyClaim).toMatchObject({
      claimedToday: true,
      streak: 1,
      best: 1,
    });
  });

  it('double récolte le même jour → 409 (anti double-claim), solde inchangé', async () => {
    await seedUser('carol');
    const first = await post('/daily/claim', { login: 'carol' });
    expect(first.status).toBe(200);

    const second = await post('/daily/claim', { login: 'carol' });
    expect(second.status).toBe(409);

    const u = await prisma.user.findUnique({ where: { login: 'carol' } });
    expect(u?.leagueCoins).toBe(5); // pas de double crédit
    expect(u?.xp).toBe(10);
  });

  it('série continue le lendemain : jour 2 = +15 XP / +8 coins', async () => {
    // Simule « hier » : on pose directement l'état de série de la veille.
    await seedUser('dave');
    const yesterday = new Date(Date.now() - 24 * 3600_000);
    const y = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`;
    await prisma.user.update({
      where: { login: 'dave' },
      data: { dailyClaimStreak: 1, dailyClaimBest: 1, dailyClaimDay: y, leagueCoins: 5, xp: 10 },
    });

    const r = await post('/daily/claim', { login: 'dave' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ streak: 2, xp: 15, coins: 8 });

    const u = await prisma.user.findUnique({ where: { login: 'dave' } });
    expect(u?.leagueCoins).toBe(13); // 5 + 8
    expect(u?.xp).toBe(25); // 10 + 15
    expect(u?.dailyClaimStreak).toBe(2);
  });

  it('série rompue (2 jours manqués) → repart à 1', async () => {
    await seedUser('erin');
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600_000);
    const d = `${threeDaysAgo.getUTCFullYear()}-${String(threeDaysAgo.getUTCMonth() + 1).padStart(2, '0')}-${String(threeDaysAgo.getUTCDate()).padStart(2, '0')}`;
    await prisma.user.update({
      where: { login: 'erin' },
      data: { dailyClaimStreak: 5, dailyClaimBest: 5, dailyClaimDay: d },
    });

    const r = await post('/daily/claim', { login: 'erin' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ streak: 1, xp: 10, coins: 5 });

    const u = await prisma.user.findUnique({ where: { login: 'erin' } });
    expect(u?.dailyClaimStreak).toBe(1);
    expect(u?.dailyClaimBest).toBe(5); // record conservé
  });
});
