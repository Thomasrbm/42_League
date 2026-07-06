import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDb, seedUser, get, post } from './helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Couverture d'intégration de la BOUTIQUE et de l'INVENTAIRE.
//
// Chemins déterministes uniquement (la Boîte Mystère, aléatoire, est couverte à
// part). Cible : listing, achat cosmétique (débit + possession), dédoublonnage,
// solde insuffisant, authentification, cadeau « Apôtre de Sheldon », et la règle
// « un seul objet équipé par catégorie » via /me/inventory/:id/equip.
//
// Note : resetDb() ne truncate pas shop_items (aucune FK vers users) → on les
// nettoie explicitement entre chaque test.
// ─────────────────────────────────────────────────────────────────────────────

interface ItemSeed {
  id: string;
  name: string;
  category: string;
  price: number;
  payload?: unknown;
}

async function seedItem(o: ItemSeed) {
  await prisma.shopItem.create({
    data: {
      id: o.id,
      name: o.name,
      category: o.category,
      price: o.price,
      active: true,
      payload: (o.payload ?? undefined) as never,
    },
  });
}

async function coinsOf(login: string): Promise<number> {
  const u = await prisma.user.findUnique({ where: { login }, select: { leagueCoins: true } });
  return u?.leagueCoins ?? -1;
}

async function owns(login: string, itemId: string): Promise<boolean> {
  const row = await prisma.shopInventory.findUnique({
    where: { userLogin_itemId: { userLogin: login, itemId } },
  });
  return row != null;
}

describe('boutique — listing & achat', () => {
  beforeEach(async () => {
    await resetDb();
    await prisma.shopItem.deleteMany({});
  });

  it('GET /shop sans auth → 401', async () => {
    const r = await get('/shop');
    expect(r.status).toBe(401);
  });

  it('GET /shop expose le solde, les items actifs et la liste possédée', async () => {
    await seedUser('alice', { leagueCoins: 250 });
    await seedItem({ id: 'cos-1', name: 'Cadre doré', category: 'cosmetic', price: 100 });
    await seedItem({ id: 'cos-2', name: 'Cadre argent', category: 'cosmetic', price: 60 });

    const r = await get('/shop', { login: 'alice' });
    expect(r.status).toBe(200);
    expect(r.body.coins).toBe(250);
    expect(r.body.items.map((i: { id: string }) => i.id).sort()).toEqual(['cos-1', 'cos-2']);
    expect(r.body.owned).toEqual([]);
  });

  it('GET /shop masque les items inactifs', async () => {
    await seedUser('alice', { leagueCoins: 100 });
    await seedItem({ id: 'live', name: 'Actif', category: 'cosmetic', price: 10 });
    await prisma.shopItem.create({
      data: { id: 'dead', name: 'Inactif', category: 'cosmetic', price: 10, active: false },
    });
    const r = await get('/shop', { login: 'alice' });
    expect(r.body.items.map((i: { id: string }) => i.id)).toEqual(['live']);
  });

  it('achat cosmétique valide → 200, solde débité, objet possédé et listé', async () => {
    await seedUser('alice', { leagueCoins: 250 });
    await seedItem({ id: 'cos-1', name: 'Cadre doré', category: 'cosmetic', price: 100 });

    const r = await post('/shop/cos-1/buy', { login: 'alice' });
    expect(r.status).toBe(200);
    expect(r.body.coins).toBe(150);
    expect(await coinsOf('alice')).toBe(150);
    expect(await owns('alice', 'cos-1')).toBe(true);

    // La possession se reflète dans le listing.
    const list = await get('/shop', { login: 'alice' });
    expect(list.body.owned).toContain('cos-1');
  });

  it('racheter un objet déjà possédé → 409, solde inchangé', async () => {
    await seedUser('alice', { leagueCoins: 250 });
    await seedItem({ id: 'cos-1', name: 'Cadre doré', category: 'cosmetic', price: 100 });

    expect((await post('/shop/cos-1/buy', { login: 'alice' })).status).toBe(200);
    const second = await post('/shop/cos-1/buy', { login: 'alice' });
    expect(second.status).toBe(409);
    expect(await coinsOf('alice')).toBe(150); // pas de double débit
  });

  it('solde insuffisant → 400, rien débité, rien possédé', async () => {
    await seedUser('broke', { leagueCoins: 30 });
    await seedItem({ id: 'cos-1', name: 'Cadre doré', category: 'cosmetic', price: 100 });

    const r = await post('/shop/cos-1/buy', { login: 'broke' });
    expect(r.status).toBe(400);
    expect(await coinsOf('broke')).toBe(30);
    expect(await owns('broke', 'cos-1')).toBe(false);
  });

  it('acheter un objet inexistant → 404', async () => {
    await seedUser('alice', { leagueCoins: 100 });
    const r = await post('/shop/nope/buy', { login: 'alice' });
    expect(r.status).toBe(404);
  });

  it('acheter sans auth → 401', async () => {
    await seedItem({ id: 'cos-1', name: 'Cadre doré', category: 'cosmetic', price: 100 });
    const r = await post('/shop/cos-1/buy');
    expect(r.status).toBe(401);
  });
});

describe('boutique — cadeau « Apôtre de Sheldon »', () => {
  beforeEach(async () => {
    await resetDb();
    await prisma.shopItem.deleteMany({});
  });

  it('DONNE 300 coins, s’auto-équipe, et ne peut être pris qu’une fois', async () => {
    await seedUser('alice', { leagueCoins: 50 });
    // Reconnu par son nom (insensible casse/accents) — prix ignoré (cadeau).
    await seedItem({ id: 'sheldon', name: 'Apôtre de Sheldon', category: 'badge', price: 0 });

    const r = await post('/shop/sheldon/buy', { login: 'alice' });
    expect(r.status).toBe(200);
    expect(await coinsOf('alice')).toBe(350); // 50 + 300, aucun coût
    expect(await owns('alice', 'sheldon')).toBe(true);

    const row = await prisma.shopInventory.findUnique({
      where: { userLogin_itemId: { userLogin: 'alice', itemId: 'sheldon' } },
    });
    expect(row?.equipped).toBe(true); // auto-équipé

    // Une seule fois : le second achat est refusé (déjà possédé), pas de re-cadeau.
    const second = await post('/shop/sheldon/buy', { login: 'alice' });
    expect(second.status).toBe(409);
    expect(await coinsOf('alice')).toBe(350);
  });
});

describe('inventaire — équipement (un seul par catégorie)', () => {
  beforeEach(async () => {
    await resetDb();
    await prisma.shopItem.deleteMany({});
  });

  it('équiper un titre applique user.title ; équiper un 2e titre déséquipe le 1er', async () => {
    await seedUser('alice', { leagueCoins: 1000 });
    await seedItem({ id: 't1', name: 'Titre 1', category: 'title', price: 100, payload: { title: 'Pionnier' } });
    await seedItem({ id: 't2', name: 'Titre 2', category: 'title', price: 100, payload: { title: 'Légende' } });

    expect((await post('/shop/t1/buy', { login: 'alice' })).status).toBe(200);
    expect((await post('/shop/t2/buy', { login: 'alice' })).status).toBe(200);

    // Équiper t1 → titre appliqué.
    const e1 = await post('/me/inventory/t1/equip', { login: 'alice', body: { equipped: true } });
    expect(e1.status).toBe(200);
    let u = await prisma.user.findUnique({ where: { login: 'alice' }, select: { title: true } });
    expect(u?.title).toBe('Pionnier');

    // Équiper t2 → t1 déséquipé (un seul par catégorie), titre remplacé.
    const e2 = await post('/me/inventory/t2/equip', { login: 'alice', body: { equipped: true } });
    expect(e2.status).toBe(200);
    u = await prisma.user.findUnique({ where: { login: 'alice' }, select: { title: true } });
    expect(u?.title).toBe('Légende');

    const rows = await prisma.shopInventory.findMany({
      where: { userLogin: 'alice', equipped: true },
      select: { itemId: true },
    });
    expect(rows.map((r) => r.itemId)).toEqual(['t2']); // seul t2 équipé
  });

  it('équiper un objet non possédé → 404', async () => {
    await seedUser('alice', { leagueCoins: 100 });
    await seedItem({ id: 't1', name: 'Titre 1', category: 'title', price: 100, payload: { title: 'Pionnier' } });
    const r = await post('/me/inventory/t1/equip', { login: 'alice', body: { equipped: true } });
    expect(r.status).toBe(404);
  });
});
