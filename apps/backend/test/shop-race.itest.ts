import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDb, seedUser, post } from './helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Régression sécurité ECO-1 / ECO-2 (audit juillet 2026).
//
// Les dépenses de League Coins (achats boutique, placements de paris) faisaient
// un check de solde PUIS un débit, en deux temps, sans verrou de ligne. Deux
// requêtes concurrentes du même joueur pouvaient donc lire le même solde, passer
// toutes deux le check, et débiter deux fois → achat à découvert (solde négatif)
// ou création de coins. Correctif : `lockUserRowTx` (SELECT … FOR UPDATE) au
// début de chaque transaction de dépense sérialise les opérations du joueur.
//
// Ce test verrouille l'INVARIANT : sous concurrence, le solde ne descend jamais
// sous 0 et on n'acquiert jamais plus d'objets que le solde ne le permet.
// ─────────────────────────────────────────────────────────────────────────────
describe('boutique — anti-course sur le solde (ECO-1)', () => {
  beforeEach(async () => {
    await resetDb();
    // resetDb ne truncate pas shop_items (pas de FK vers users) → on nettoie ici.
    await prisma.shopItem.deleteMany({});
  });

  async function seedTwoItems(prefix: string, price: number) {
    await prisma.shopItem.createMany({
      data: [
        { id: `${prefix}-a`, name: `${prefix} A`, category: 'cosmetic', price, active: true },
        { id: `${prefix}-b`, name: `${prefix} B`, category: 'cosmetic', price, active: true },
      ],
    });
  }

  it('deux achats concurrents à 80 avec 100 coins → un seul passe, solde jamais négatif', async () => {
    await seedUser('rich', { leagueCoins: 100 });
    await seedTwoItems('race', 80);

    // Feu simultané. AVANT le correctif : les deux transactions lisent 100,
    // passent le check `100 < 80 == false`, décrémentent chacune 80 → solde -60
    // et 2 objets possédés. APRÈS : le verrou sérialise, le 2e voit 20 < 80.
    const [ra, rb] = await Promise.all([
      post('/shop/race-a/buy', { login: 'rich' }),
      post('/shop/race-b/buy', { login: 'rich' }),
    ]);

    // Exactement un achat réussit (200), l'autre est refusé (400 solde insuffisant).
    expect([ra.status, rb.status].sort()).toEqual([200, 400]);

    const user = await prisma.user.findUnique({
      where: { login: 'rich' },
      select: { leagueCoins: true },
    });
    expect(user?.leagueCoins).toBe(20); // 100 - 80, jamais négatif
    expect(user!.leagueCoins).toBeGreaterThanOrEqual(0);

    const owned = await prisma.shopInventory.count({ where: { userLogin: 'rich' } });
    expect(owned).toBe(1); // un seul objet acquis
  });

  it('cinq achats concurrents avec un budget pour deux → exactement deux passent', async () => {
    await seedUser('spender', { leagueCoins: 100 });
    // 5 objets distincts à 40 : le solde n'en couvre que 2 (80 ≤ 100 < 120).
    await prisma.shopItem.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        id: `burst-${i}`,
        name: `Burst ${i}`,
        category: 'cosmetic',
        price: 40,
        active: true,
      })),
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => post(`/shop/burst-${i}/buy`, { login: 'spender' })),
    );

    const ok = results.filter((r) => r.status === 200).length;
    expect(ok).toBe(2); // 2 × 40 = 80 ≤ 100 ; le 3e n'a plus que 20

    const user = await prisma.user.findUnique({
      where: { login: 'spender' },
      select: { leagueCoins: true },
    });
    expect(user?.leagueCoins).toBe(20);
    expect(user!.leagueCoins).toBeGreaterThanOrEqual(0);

    const owned = await prisma.shopInventory.count({ where: { userLogin: 'spender' } });
    expect(owned).toBe(2);
  });

  it('achats séquentiels : le second échoue proprement une fois le solde épuisé', async () => {
    await seedUser('poor', { leagueCoins: 80 });
    await seedTwoItems('seq', 80);

    const first = await post('/shop/seq-a/buy', { login: 'poor' });
    expect(first.status).toBe(200);

    const second = await post('/shop/seq-b/buy', { login: 'poor' });
    expect(second.status).toBe(400);

    const user = await prisma.user.findUnique({
      where: { login: 'poor' },
      select: { leagueCoins: true },
    });
    expect(user?.leagueCoins).toBe(0);
  });
});
