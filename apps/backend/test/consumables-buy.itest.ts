import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDb, seedUser, post } from './helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Couverture d'intégration de l'ACHAT de consommables (anti_ops, elo_mult,
// force_duel, mini_ops). Vérifie les garde-fous économiques : débit du solde,
// empilement (quantity), cap mensuel par type, et cooldown d'achat (mini_ops).
//
// Caps mensuels : anti_ops=2, elo_mult=6, force_duel=1, mini_ops=16 (borné par
// un cooldown d'achat de 48 h). Chemins déterministes uniquement.
// ─────────────────────────────────────────────────────────────────────────────

async function seedConsumable(id: string, kind: string, price: number) {
  await prisma.shopItem.create({
    data: {
      id,
      name: `Conso ${kind}`,
      category: 'consumable',
      price,
      active: true,
      payload: { kind } as never,
    },
  });
}

async function quantityOf(login: string, kind: string): Promise<number> {
  const row = await prisma.consumableInventory.findUnique({
    where: { userLogin_kind: { userLogin: login, kind } },
  });
  return row?.quantity ?? 0;
}

async function coinsOf(login: string): Promise<number> {
  const u = await prisma.user.findUnique({ where: { login }, select: { leagueCoins: true } });
  return u?.leagueCoins ?? -1;
}

describe('consommables — achat, empilement, débit', () => {
  beforeEach(async () => {
    await resetDb();
    await prisma.shopItem.deleteMany({});
  });

  it('achat valide → 200, quantité +1, solde débité', async () => {
    await seedUser('alice', { leagueCoins: 500 });
    await seedConsumable('c-elo', 'elo_mult', 100);

    const r = await post('/shop/c-elo/buy', { login: 'alice' });
    expect(r.status).toBe(200);
    expect(await coinsOf('alice')).toBe(400);
    expect(await quantityOf('alice', 'elo_mult')).toBe(1);
  });

  it('achats répétés → empilement (quantity cumulée)', async () => {
    await seedUser('alice', { leagueCoins: 500 });
    await seedConsumable('c-elo', 'elo_mult', 50);

    await post('/shop/c-elo/buy', { login: 'alice' });
    await post('/shop/c-elo/buy', { login: 'alice' });
    await post('/shop/c-elo/buy', { login: 'alice' });

    expect(await quantityOf('alice', 'elo_mult')).toBe(3);
    expect(await coinsOf('alice')).toBe(350); // 500 - 3×50
  });

  it('solde insuffisant → 400, rien débité', async () => {
    await seedUser('broke', { leagueCoins: 20 });
    await seedConsumable('c-elo', 'elo_mult', 100);

    const r = await post('/shop/c-elo/buy', { login: 'broke' });
    expect(r.status).toBe(400);
    expect(await coinsOf('broke')).toBe(20);
    expect(await quantityOf('broke', 'elo_mult')).toBe(0);
  });
});

describe('consommables — caps mensuels par type', () => {
  beforeEach(async () => {
    await resetDb();
    await prisma.shopItem.deleteMany({});
  });

  // [kind, cap] — achète cap fois (OK) puis une fois de trop (409).
  const CAPS: Array<[string, number]> = [
    ['anti_ops', 2],
    ['elo_mult', 6],
    ['force_duel', 1],
  ];

  for (const [kind, cap] of CAPS) {
    it(`${kind} : ${cap} achat(s) puis 409 au cap mensuel`, async () => {
      await seedUser('alice', { leagueCoins: 10_000 });
      await seedConsumable(`c-${kind}`, kind, 10);

      for (let i = 0; i < cap; i++) {
        const ok = await post(`/shop/c-${kind}/buy`, { login: 'alice' });
        expect(ok.status).toBe(200);
      }
      const over = await post(`/shop/c-${kind}/buy`, { login: 'alice' });
      expect(over.status).toBe(409);
      expect(await quantityOf('alice', kind)).toBe(cap);
    });
  }
});

describe('consommables — cooldown d’achat (mini_ops)', () => {
  beforeEach(async () => {
    await resetDb();
    await prisma.shopItem.deleteMany({});
  });

  it('mini_ops : 1 achat OK, 2e achat immédiat → 429 (cooldown 48 h)', async () => {
    await seedUser('alice', { leagueCoins: 10_000 });
    await seedConsumable('c-mini', 'mini_ops', 100);

    const first = await post('/shop/c-mini/buy', { login: 'alice' });
    expect(first.status).toBe(200);

    const second = await post('/shop/c-mini/buy', { login: 'alice' });
    expect(second.status).toBe(429); // cooldown actif
    expect(await quantityOf('alice', 'mini_ops')).toBe(1); // pas de 2e exemplaire
  });
});
