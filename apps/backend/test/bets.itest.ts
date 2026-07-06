import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/db.js';
import { resetDb, seedUser, post } from './helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Couverture d'intégration du PLACEMENT DE PARIS (surface économie/sécu).
//
// Deux marchés : pari sur le VAINQUEUR d'un tournoi (POST /bets, ouvert pendant
// l'inscription) et pari sur l'issue d'un MATCH de tournoi (POST /bets/match,
// ouvert tant que le match n'a pas démarré). Vérifie l'ouverture/fermeture des
// marchés, les règles d'éligibilité (un participant ne parie pas sur lui-même),
// le débit atomique de la mise, l'anti-doublon et la validation d'entrée.
// ─────────────────────────────────────────────────────────────────────────────

async function seedTournament(
  id: string,
  status: string,
  entries: string[],
  opts: { createdBy?: string } = {},
) {
  await prisma.tournament.create({
    data: { id, name: `Tournoi ${id}`, capacity: 8, status, createdByLogin: opts.createdBy ?? 'org' },
  });
  for (const login of entries) {
    await prisma.tournamentEntry.create({ data: { tournamentId: id, login } });
  }
}

async function seedMatch(id: string, tournamentId: string, a: string, b: string) {
  await prisma.tournamentMatch.create({
    data: { id, tournamentId, round: 1, slot: 0, playerALogin: a, playerBLogin: b },
  });
}

async function coinsOf(login: string): Promise<number> {
  const u = await prisma.user.findUnique({ where: { login }, select: { leagueCoins: true } });
  return u?.leagueCoins ?? -1;
}

async function openBetsCount(bettor: string): Promise<number> {
  return prisma.bet.count({ where: { bettorLogin: bettor, status: 'open' } });
}

describe('paris — vainqueur de tournoi (POST /bets)', () => {
  beforeEach(async () => {
    await resetDb();
    await seedUser('org');
    await seedUser('p1');
    await seedUser('p2');
  });

  function placeTournamentBet(login: string, tournamentId: string, choiceLogin: string, stake: number) {
    return post('/bets', { login, body: { targetType: 'tournament', tournamentId, choiceLogin, stake } });
  }

  it('pari valide → 201, mise débitée, pari « open » enregistré', async () => {
    await seedUser('alice', { leagueCoins: 500 });
    await seedTournament('t1', 'registration', ['p1', 'p2']);

    const r = await placeTournamentBet('alice', 't1', 'p1', 100);
    expect(r.status).toBe(201);
    expect(r.body.coins).toBe(400);
    expect(await coinsOf('alice')).toBe(400);

    const bet = await prisma.bet.findFirst({ where: { bettorLogin: 'alice' } });
    expect(bet?.status).toBe('open');
    expect(bet?.stake).toBe(100);
    expect(bet?.choiceLogin).toBe('p1');
    expect(bet?.targetType).toBe('tournament');
  });

  it('tournoi inexistant → 404', async () => {
    await seedUser('alice', { leagueCoins: 500 });
    const r = await placeTournamentBet('alice', 'nope', 'p1', 100);
    expect(r.status).toBe(404);
  });

  it('marché fermé si le tournoi n’est plus en inscription → 409', async () => {
    await seedUser('alice', { leagueCoins: 500 });
    await seedTournament('t1', 'in_progress', ['p1', 'p2']);
    const r = await placeTournamentBet('alice', 't1', 'p1', 100);
    expect(r.status).toBe(409);
    expect(await coinsOf('alice')).toBe(500); // rien débité
  });

  it('un participant ne peut pas parier sur son propre tournoi → 403', async () => {
    // p1 est déjà seedé (beforeEach) et inscrit ci-dessous → il ne peut pas parier.
    await seedTournament('t1', 'registration', ['p1', 'p2']);
    const r = await placeTournamentBet('p1', 't1', 'p2', 100);
    expect(r.status).toBe(403);
  });

  it('le pronostic doit être un participant → 400', async () => {
    await seedUser('alice', { leagueCoins: 500 });
    await seedUser('outsider');
    await seedTournament('t1', 'registration', ['p1', 'p2']);
    const r = await placeTournamentBet('alice', 't1', 'outsider', 100);
    expect(r.status).toBe(400);
  });

  it('un seul pari ouvert par tournoi → 409, pas de double débit', async () => {
    await seedUser('alice', { leagueCoins: 500 });
    await seedTournament('t1', 'registration', ['p1', 'p2']);

    expect((await placeTournamentBet('alice', 't1', 'p1', 100)).status).toBe(201);
    const second = await placeTournamentBet('alice', 't1', 'p2', 100);
    expect(second.status).toBe(409);
    expect(await coinsOf('alice')).toBe(400); // un seul débit
    expect(await openBetsCount('alice')).toBe(1);
  });

  it('solde insuffisant → 409, rien débité', async () => {
    await seedUser('broke', { leagueCoins: 30 });
    await seedTournament('t1', 'registration', ['p1', 'p2']);
    const r = await placeTournamentBet('broke', 't1', 'p1', 100);
    expect(r.status).toBe(409);
    expect(await coinsOf('broke')).toBe(30);
    expect(await openBetsCount('broke')).toBe(0);
  });

  it('mise négative/zéro rejetée par le schéma → 400', async () => {
    await seedUser('alice', { leagueCoins: 500 });
    await seedTournament('t1', 'registration', ['p1', 'p2']);
    expect((await placeTournamentBet('alice', 't1', 'p1', 0)).status).toBe(400);
    expect((await placeTournamentBet('alice', 't1', 'p1', -50)).status).toBe(400);
    expect(await coinsOf('alice')).toBe(500);
  });

  it('sans auth → 401', async () => {
    await seedTournament('t1', 'registration', ['p1', 'p2']);
    const r = await post('/bets', { body: { targetType: 'tournament', tournamentId: 't1', choiceLogin: 'p1', stake: 100 } });
    expect(r.status).toBe(401);
  });
});

describe('paris — issue d’un match (POST /bets/match)', () => {
  beforeEach(async () => {
    await resetDb();
    await seedUser('org');
    await seedUser('p1');
    await seedUser('p2');
  });

  function placeMatchBet(login: string, matchId: string, choiceLogin: string, stake: number) {
    return post('/bets/match', { login, body: { matchId, choiceLogin, stake } });
  }

  it('pari valide sur un match ouvert → 201, mise débitée', async () => {
    await seedUser('alice', { leagueCoins: 500 });
    await seedTournament('t1', 'in_progress', ['p1', 'p2']);
    await seedMatch('m1', 't1', 'p1', 'p2');

    const r = await placeMatchBet('alice', 'm1', 'p1', 80);
    expect(r.status).toBe(201);
    expect(await coinsOf('alice')).toBe(420);
    const bet = await prisma.bet.findFirst({ where: { bettorLogin: 'alice', targetType: 'match' } });
    expect(bet?.matchId).toBe('m1');
    expect(bet?.stake).toBe(80);
  });

  it('marché fermé une fois un score verrouillé → 409', async () => {
    await seedUser('alice', { leagueCoins: 500 });
    await seedTournament('t1', 'in_progress', ['p1', 'p2']);
    await seedMatch('m1', 't1', 'p1', 'p2');
    await prisma.tournamentMatch.update({ where: { id: 'm1' }, data: { betsLockedAt: new Date() } });

    const r = await placeMatchBet('alice', 'm1', 'p1', 80);
    expect(r.status).toBe(409);
    expect(await coinsOf('alice')).toBe(500);
  });

  it('pronostic hors des deux joueurs → 400', async () => {
    await seedUser('alice', { leagueCoins: 500 });
    await seedUser('ghost');
    await seedTournament('t1', 'in_progress', ['p1', 'p2']);
    await seedMatch('m1', 't1', 'p1', 'p2');

    const r = await placeMatchBet('alice', 'm1', 'ghost', 80);
    expect(r.status).toBe(400);
    expect(await coinsOf('alice')).toBe(500);
  });
});
