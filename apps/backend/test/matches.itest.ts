import { describe, it, expect, beforeEach } from 'vitest';
import { get, post, resetDb, seedUser } from './helpers.js';

// Tests d'intégration du cycle de vie d'un match : déclaration → confirmation
// bilatérale → impact ELO, avec les chemins d'erreur (auth, permissions, scores
// incohérents) et la règle anti-farming (max 2 matchs comptés / paire / 7 j).
//
// Convention de score côté API :
//   - le déclarant envoie {scoreSelf, scoreOpponent} de SON point de vue ;
//   - l'adversaire confirme en RE-saisissant {scoreSelf, scoreOpponent} du SIEN.
//   La confirmation ne passe que si les deux saisies sont le miroir l'une de l'autre.

/** Déclare un match alice 10–scoreLoser bob et renvoie l'id du pending. */
async function declare(
  declarer: string,
  opponent: string,
  scoreSelf: number,
  scoreOpponent: number,
): Promise<string> {
  const r = await post('/matches', {
    login: declarer,
    body: { opponentLogin: opponent, scoreSelf, scoreOpponent },
  });
  expect(r.status).toBe(201);
  return r.body.id;
}

describe('matches — déclaration', () => {
  beforeEach(async () => {
    await resetDb();
    await seedUser('alice');
    await seedUser('bob');
  });

  it('sans auth → 401', async () => {
    const r = await post('/matches', {
      body: { opponentLogin: 'bob', scoreSelf: 10, scoreOpponent: 3 },
    });
    expect(r.status).toBe(401);
  });

  it('valide → 201 + apparaît dans /matches/pending', async () => {
    const id = await declare('alice', 'bob', 10, 3);
    const pendings = await get('/matches/pending', { login: 'bob' });
    expect(pendings.status).toBe(200);
    expect(pendings.body).toHaveLength(1);
    expect(pendings.body[0]).toMatchObject({
      id,
      declarerLogin: 'alice',
      opponentLogin: 'bob',
      scoreDeclarer: 10,
      scoreOpponent: 3,
    });
  });

  it('contre soi-même → 400', async () => {
    const r = await post('/matches', {
      login: 'alice',
      body: { opponentLogin: 'alice', scoreSelf: 10, scoreOpponent: 3 },
    });
    expect(r.status).toBe(400);
  });

  it('score invalide (aucun camp à 10) → 400', async () => {
    const r = await post('/matches', {
      login: 'alice',
      body: { opponentLogin: 'bob', scoreSelf: 7, scoreOpponent: 3 },
    });
    expect(r.status).toBe(400);
  });

  it('déclarant banni → 403', async () => {
    await seedUser('mallory', { bannedAt: new Date() });
    const r = await post('/matches', {
      login: 'mallory',
      body: { opponentLogin: 'bob', scoreSelf: 10, scoreOpponent: 3 },
    });
    expect(r.status).toBe(403);
  });
});

describe('matches — confirmation', () => {
  beforeEach(async () => {
    await resetDb();
    await seedUser('alice');
    await seedUser('bob');
  });

  it('confirmation introuvable → 404', async () => {
    const r = await post('/matches/does-not-exist/confirm', {
      login: 'bob',
      body: { scoreSelf: 3, scoreOpponent: 10 },
    });
    expect(r.status).toBe(404);
  });

  it("seul l'adversaire peut confirmer (le déclarant → 403)", async () => {
    const id = await declare('alice', 'bob', 10, 3);
    const r = await post(`/matches/${id}/confirm`, {
      login: 'alice',
      body: { scoreSelf: 10, scoreOpponent: 3 },
    });
    expect(r.status).toBe(403);
  });

  it('scores miroir → 200, ELO mis à jour, pending consommé', async () => {
    const id = await declare('alice', 'bob', 10, 3);
    const r = await post(`/matches/${id}/confirm`, {
      login: 'bob',
      body: { scoreSelf: 3, scoreOpponent: 10 },
    });
    expect(r.status).toBe(200);
    expect(r.body.countedForElo).toBe(true);

    // alice a gagné → ELO en hausse ; bob a perdu → ELO en baisse.
    const alice = await get('/users/alice', { login: 'alice' });
    const bob = await get('/users/bob', { login: 'bob' });
    expect(alice.body.user.elo).toBeGreaterThan(1000);
    expect(bob.body.user.elo).toBeLessThan(1000);
    expect(alice.body.user.matchesPlayed).toBe(1);
    expect(bob.body.user.matchesPlayed).toBe(1);

    // pending consommé, match joué enregistré
    const pendings = await get('/matches/pending', { login: 'bob' });
    expect(pendings.body).toHaveLength(0);
    const played = await get('/matches', { login: 'bob' });
    expect(played.body).toHaveLength(1);
  });

  it('scores incohérents → 409 et le pending est supprimé (à redéclarer)', async () => {
    const id = await declare('alice', 'bob', 10, 3);
    // bob saisit un score qui n'est pas le miroir (5–10 au lieu de 3–10)
    const r = await post(`/matches/${id}/confirm`, {
      login: 'bob',
      body: { scoreSelf: 5, scoreOpponent: 10 },
    });
    expect(r.status).toBe(409);

    // le pending a été détruit : reconfirmer → 404, et aucun ELO bougé
    const again = await post(`/matches/${id}/confirm`, {
      login: 'bob',
      body: { scoreSelf: 3, scoreOpponent: 10 },
    });
    expect(again.status).toBe(404);
    const alice = await get('/users/alice', { login: 'alice' });
    expect(alice.body.user.elo).toBe(1000);
    expect(alice.body.user.matchesPlayed).toBe(0);
  });
});

describe("matches — rejet par l'adversaire", () => {
  beforeEach(async () => {
    await resetDb();
    await seedUser('alice');
    await seedUser('bob');
  });

  it("seul l'adversaire peut rejeter (le déclarant → 403)", async () => {
    const id = await declare('alice', 'bob', 10, 3);
    const r = await post(`/matches/${id}/reject`, {
      login: 'alice',
      body: { contestReason: 'never_played', contestMessage: "on n'a jamais joué" },
    });
    expect(r.status).toBe(403);
  });

  it('rejet valide → pending supprimé + trace dans /admin/rejected-matches', async () => {
    const id = await declare('alice', 'bob', 10, 3);
    const r = await post(`/matches/${id}/reject`, {
      login: 'bob',
      body: { contestReason: 'wrong_score', contestMessage: "le score est faux, c'était 10-7" },
    });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('rejected');

    const pendings = await get('/matches/pending', { login: 'bob' });
    expect(pendings.body).toHaveLength(0);

    await seedUser('admin', { role: 'ADMIN' });
    const rejected = await get('/admin/rejected-matches', { login: 'admin' });
    expect(rejected.status).toBe(200);
    expect(rejected.body).toHaveLength(1);
    expect(rejected.body[0]).toMatchObject({
      declarerLogin: 'alice',
      opponentLogin: 'bob',
      contestReason: 'wrong_score',
    });
  });
});

describe('matches — annulation par le déclarant', () => {
  beforeEach(async () => {
    await resetDb();
    await seedUser('alice');
    await seedUser('bob');
  });

  it("seul le déclarant peut annuler (l'adversaire → 403)", async () => {
    const id = await declare('alice', 'bob', 10, 3);
    const r = await post(`/matches/${id}/cancel`, { login: 'bob' });
    expect(r.status).toBe(403);
  });

  it('annulation valide → pending supprimé, aucune trace de rejet', async () => {
    const id = await declare('alice', 'bob', 10, 3);
    const r = await post(`/matches/${id}/cancel`, { login: 'alice' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('cancelled');

    const pendings = await get('/matches/pending', { login: 'alice' });
    expect(pendings.body).toHaveLength(0);

    await seedUser('admin', { role: 'ADMIN' });
    const rejected = await get('/admin/rejected-matches', { login: 'admin' });
    expect(rejected.body).toHaveLength(0);
  });

  it('annuler un match inexistant → 404', async () => {
    const r = await post('/matches/does-not-exist/cancel', { login: 'alice' });
    expect(r.status).toBe(404);
  });
});

describe('matches — anti-farming (max 2 comptés / paire / fenêtre)', () => {
  beforeEach(async () => {
    await resetDb();
    // ELO de départ élevé (bien au-dessus de ELO_HARD_FLOOR=975) : ce test
    // vérifie la suppression du plafond par paire, PAS le plancher. À 1000,
    // bob touche le plancher dès le 2e KO (10-3) et son delta est écrêté à 0
    // par l'anti-farming de plancher (elo.ts) — ce qui n'a rien à voir avec ce
    // qu'on teste ici. On part donc haut pour garder des deltas symétriques.
    await seedUser('alice', { elo: 1300 });
    await seedUser('bob', { elo: 1300 });
  });

  async function declareAndConfirm() {
    const id = await declare('alice', 'bob', 10, 3);
    const r = await post(`/matches/${id}/confirm`, {
      login: 'bob',
      body: { scoreSelf: 3, scoreOpponent: 10 },
    });
    expect(r.status).toBe(200);
    return r.body;
  }

  it("ranked illimité : le 3e match consécutif compte pour l'ELO (anti-farming supprimé)", async () => {
    // shouldCountForElo renvoie toujours true — plus de plafond par paire.
    await declareAndConfirm(); // compté
    await declareAndConfirm(); // compté

    const aliceAfter2 = await get('/users/alice', { login: 'alice' });
    const eloAfter2 = aliceAfter2.body.user.elo;

    const third = await declareAndConfirm();
    expect(third.countedForElo).toBe(true);   // compte (anti-farming supprimé)
    expect(third.deltaA).not.toBe(0);          // ELO bougé
    expect(third.deltaB).not.toBe(0);

    const aliceAfter3 = await get('/users/alice', { login: 'alice' });
    expect(aliceAfter3.body.user.elo).not.toBe(eloAfter2); // ELO a changé
    expect(aliceAfter3.body.user.matchesPlayed).toBe(3);   // les 3 comptent

    // les 3 matchs sont bien enregistrés
    const played = await get('/matches', { login: 'alice' });
    expect(played.body).toHaveLength(3);
  });
});
