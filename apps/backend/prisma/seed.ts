import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { fetchAndSavePublicUser } from '../src/ft-api.js';

const prisma = new PrismaClient();

const WHITELIST = [
  'throbert',
  'nithomas',
  'rbardet-',
  'jubrouss',
  'abidaux',
  'garside',
  'ytennah',
  'hkeromne',
  'sbonneau',
];

// Shorthand aliases
const [T, N, R, J, A, G, Y, H, S] = WHITELIST;
// throbert=T, nithomas=N, rbardet-=R, jubrouss=J, abidaux=A, garside=G, ytennah=Y, hkeromne=H, sbonneau=S

function daysAgo(d: number) {
  return new Date(Date.now() - d * 86_400_000);
}
function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3_600_000);
}
function daysFromNow(d: number) {
  return new Date(Date.now() + d * 86_400_000);
}
function hoursFromNow(h: number) {
  return new Date(Date.now() + h * 3_600_000);
}

// Canonical pair ordering (same as backend pairKey)
function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function clean() {
  console.log('🧹 Cleaning non-whitelist users & stale data...');

  // Delete data for non-whitelist users (manual cascade)
  const nonWhitelist = await prisma.user.findMany({
    where: { login: { notIn: WHITELIST } },
    select: { login: true },
  });
  const logins = nonWhitelist.map((u) => u.login);

  if (logins.length > 0) {
    console.log(`   → removing users: ${logins.join(', ')}`);
    await prisma.ops.deleteMany({
      where: { OR: [{ ownerLogin: { in: logins } }, { targetLogin: { in: logins } }] },
    });
    await prisma.pendingMatch.deleteMany({
      where: { OR: [{ declarerLogin: { in: logins } }, { opponentLogin: { in: logins } }] },
    });
    await prisma.playedMatch.deleteMany({
      where: { OR: [{ playerALogin: { in: logins } }, { playerBLogin: { in: logins } }] },
    });
    await prisma.challenge.deleteMany({
      where: { OR: [{ challengerLogin: { in: logins } }, { opponentLogin: { in: logins } }] },
    });
    // Cascade handles tournament entries + matches
    const tourneys = await prisma.tournament.findMany({
      where: { createdByLogin: { in: logins } },
      select: { id: true },
    });
    await prisma.tournament.deleteMany({ where: { id: { in: tourneys.map((t) => t.id) } } });
    await prisma.user.deleteMany({ where: { login: { in: logins } } });
  }

  // Wipe all seed-generated data so the seed is idempotent
  console.log('   → wiping previous seed data...');
  await prisma.ops.deleteMany();
  await prisma.pendingMatch.deleteMany();
  await prisma.challenge.deleteMany();
  await prisma.tournamentMatch.deleteMany();
  await prisma.tournamentEntry.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.playedMatch.deleteMany();
}

async function seed() {
  console.log('\n🌱 Seeding database...');

  // ── Users ──────────────────────────────────────────────────────────────────
  console.log('👥 Upserting whitelist users...');
  const userDefs = [
    { login: T, elo: 1680, matchesPlayed: 52, title: '👑 Roi du Babyfoot' },
    { login: N, elo: 1590, matchesPlayed: 44 },
    { login: R, elo: 1530, matchesPlayed: 39 },
    { login: J, elo: 1490, matchesPlayed: 36 },
    { login: A, elo: 1460, matchesPlayed: 33 },
    { login: G, elo: 1410, matchesPlayed: 29 },
    { login: Y, elo: 1360, matchesPlayed: 26, dodgeCount: 1 },
    { login: H, elo: 1310, matchesPlayed: 20 },
    { login: S, elo: 1240, matchesPlayed: 14 },
  ];

  for (const u of userDefs) {
    await prisma.user.upsert({
      where: { login: u.login },
      update: { elo: u.elo, matchesPlayed: u.matchesPlayed, imageUrl: null, title: u.title ?? null, dodgeCount: u.dodgeCount ?? 0 },
      create: { login: u.login, campus: 'Paris', imageUrl: null, ...u },
    });
  }

  // ── Played matches ─────────────────────────────────────────────────────────
  console.log('🎮 Creating played matches...');

  type MatchRow = [string, string, number, number, number, number];
  const matchRows: MatchRow[] = [
    // [playerA, playerB, scoreA, scoreB, deltaA, deltaB] — sorted pair, A wins if scoreA > scoreB
    [T, N,  10, 8,  +22, -22],
    [T, R,  10, 6,  +18, -18],
    [N, J,  10, 7,  +20, -20],
    [R, A,   6, 10, -19, +19],
    [J, G,  10, 5,  +24, -24],
    [A, Y,  10, 8,  +17, -17],
    [G, H,   7, 10, -16, +16],
    [H, S,  10, 4,  +26, -26],
    [T, J,  10, 5,  +19, -19],
    [N, R,   8, 10, -21, +21],
    [A, J,  10, 6,  +20, -20],
    [R, S,  10, 2,  +25, -25],
    [Y, H,  10, 9,  +15, -15],
    [T, A,  10, 7,  +16, -16],
    [G, S,  10, 3,  +27, -27],
    [N, A,  10, 8,  +18, -18],
    [J, R,   5, 10, -22, +22],
    [H, G,  10, 6,  +21, -21],
    [T, G,  10, 4,  +14, -14],
    [S, Y,   9, 10, -17, +17],
    [A, H,  10, 7,  +19, -19],
    [N, Y,  10, 5,  +20, -20],
    [R, H,   6, 10, -18, +18],
    [T, S,  10, 1,  +12, -12],
    [J, Y,  10, 8,  +16, -16],
    [G, A,   8, 10, -20, +20],
    [N, H,  10, 6,  +18, -18],
    [T, Y,  10, 3,  +13, -13],
    [S, J,   4, 10, -23, +23],
    [R, G,  10, 7,  +19, -19],
  ];

  for (let i = 0; i < matchRows.length; i++) {
    const [loginA, loginB, scoreA, scoreB, deltaA, deltaB] = matchRows[i];
    const [a, b] = pairKey(loginA, loginB);
    const swapped = a !== loginA;
    await prisma.playedMatch.create({
      data: {
        id: randomUUID(),
        playerALogin: a,
        playerBLogin: b,
        scoreA: swapped ? scoreB : scoreA,
        scoreB: swapped ? scoreA : scoreB,
        winner: swapped ? (scoreB > scoreA ? 'A' : 'B') : (scoreA > scoreB ? 'A' : 'B'),
        playedAt: daysAgo(matchRows.length - i),
        countedForElo: true,
        deltaA: swapped ? deltaB : deltaA,
        deltaB: swapped ? deltaA : deltaB,
      },
    });
  }

  // ── Challenges ─────────────────────────────────────────────────────────────
  console.log('⚔️  Creating challenges...');
  await prisma.challenge.createMany({
    data: [
      // Incoming pour T (throbert) — quelqu'un le défie
      { id: randomUUID(), challengerLogin: N, opponentLogin: T, status: 'pending',  scheduledAt: daysFromNow(1), createdAt: hoursAgo(3) },
      { id: randomUUID(), challengerLogin: S, opponentLogin: T, status: 'pending',  scheduledAt: daysFromNow(2), createdAt: hoursAgo(1) },
      // Match accepté avec T
      { id: randomUUID(), challengerLogin: R, opponentLogin: T, status: 'accepted', scheduledAt: hoursFromNow(4), createdAt: daysAgo(1), decidedAt: hoursAgo(10) },
      // Défi envoyé par T
      { id: randomUUID(), challengerLogin: T, opponentLogin: G, status: 'pending',  scheduledAt: daysFromNow(3), createdAt: hoursAgo(2) },
      // Autres défis entre joueurs
      { id: randomUUID(), challengerLogin: J, opponentLogin: A, status: 'pending',  scheduledAt: daysFromNow(2), createdAt: hoursAgo(5) },
      { id: randomUUID(), challengerLogin: H, opponentLogin: Y, status: 'accepted', scheduledAt: hoursFromNow(6), createdAt: daysAgo(1), decidedAt: hoursAgo(8) },
    ],
  });

  // ── Pending matches (à confirmer) ──────────────────────────────────────────
  console.log('⏳ Creating pending matches...');
  await prisma.pendingMatch.createMany({
    data: [
      // S a déclaré une game contre T (T doit confirmer)
      { id: randomUUID(), declarerLogin: S, opponentLogin: T, scoreDeclarer: 10, scoreOpponent: 7, declaredAt: hoursAgo(1) },
      // H a déclaré contre N
      { id: randomUUID(), declarerLogin: H, opponentLogin: N, scoreDeclarer: 8, scoreOpponent: 10, declaredAt: hoursAgo(3) },
    ],
  });

  // ── Tournoi en cours (4 joueurs, round 1 à moitié joué) ───────────────────
  console.log('🏟️  Creating tournament in progress...');
  const tourney1 = await prisma.tournament.create({
    data: {
      id: randomUUID(),
      name: 'Grand Prix Spring 2026',
      kind: 'official',
      capacity: 4,
      status: 'in_progress',
      createdByLogin: T,
      createdAt: daysAgo(2),
      startedAt: hoursAgo(3),
    },
  });
  await prisma.tournamentEntry.createMany({
    data: [T, N, R, J].map((login) => ({ tournamentId: tourney1.id, login, joinedAt: daysAgo(2) })),
  });
  const t1m1 = randomUUID();
  const t1m2 = randomUUID();
  const t1final = randomUUID();
  await prisma.tournamentMatch.createMany({
    data: [
      // Round 1 slot 0 — T a battu N (confirmé)
      { id: t1m1, tournamentId: tourney1.id, round: 1, slot: 0,
        playerALogin: T, playerBLogin: N, scoreA: 10, scoreB: 6,
        winnerLogin: T, recordedByLogin: T,
        recordedAt: hoursAgo(2), confirmedAt: hoursAgo(1) },
      // Round 1 slot 1 — R vs J, pas encore joué
      { id: t1m2, tournamentId: tourney1.id, round: 1, slot: 1,
        playerALogin: R, playerBLogin: J,
        scoreA: null, scoreB: null, winnerLogin: null,
        recordedByLogin: null, recordedAt: null, confirmedAt: null },
      // Finale — T qualifié, attend le gagnant de R vs J
      { id: t1final, tournamentId: tourney1.id, round: 2, slot: 0,
        playerALogin: T, playerBLogin: null,
        scoreA: null, scoreB: null, winnerLogin: null,
        recordedByLogin: null, recordedAt: null, confirmedAt: null },
    ],
  });

  // ── Tournoi en inscription (8 joueurs, 4 inscrits) ────────────────────────
  console.log('📋 Creating tournament in registration...');
  const tourney2 = await prisma.tournament.create({
    data: {
      id: randomUUID(),
      name: 'Summer Slam 2026',
      kind: 'friendly',
      capacity: 8,
      status: 'registration',
      createdByLogin: G,
      createdAt: hoursAgo(5),
    },
  });
  await prisma.tournamentEntry.createMany({
    data: [G, A, Y, S].map((login) => ({ tournamentId: tourney2.id, login, joinedAt: hoursAgo(4) })),
  });

  // ── Tournoi terminé (pour l'historique) ───────────────────────────────────
  console.log('🏆 Creating finished tournament...');
  const tourney3 = await prisma.tournament.create({
    data: {
      id: randomUUID(),
      name: 'Winter Cup 2025',
      kind: 'official',
      capacity: 4,
      status: 'finished',
      createdByLogin: N,
      winnerLogin: T,
      createdAt: daysAgo(30),
      startedAt: daysAgo(28),
      finishedAt: daysAgo(27),
    },
  });
  await prisma.user.update({ where: { login: T }, data: { tournamentsWon: 1 } });
  await prisma.tournamentEntry.createMany({
    data: [T, N, A, H].map((login) => ({ tournamentId: tourney3.id, login, joinedAt: daysAgo(30) })),
  });
  const t3ids = [randomUUID(), randomUUID(), randomUUID()];
  await prisma.tournamentMatch.createMany({
    data: [
      { id: t3ids[0], tournamentId: tourney3.id, round: 1, slot: 0,
        playerALogin: T, playerBLogin: N, scoreA: 10, scoreB: 8,
        winnerLogin: T, recordedByLogin: T,
        recordedAt: daysAgo(28), confirmedAt: daysAgo(28) },
      { id: t3ids[1], tournamentId: tourney3.id, round: 1, slot: 1,
        playerALogin: A, playerBLogin: H, scoreA: 7, scoreB: 10,
        winnerLogin: H, recordedByLogin: A,
        recordedAt: daysAgo(28), confirmedAt: daysAgo(28) },
      { id: t3ids[2], tournamentId: tourney3.id, round: 2, slot: 0,
        playerALogin: T, playerBLogin: H, scoreA: 10, scoreB: 5,
        winnerLogin: T, recordedByLogin: T,
        recordedAt: daysAgo(27), confirmedAt: daysAgo(27) },
    ],
  });

  // ── Ops (bragging rights) ──────────────────────────────────────────────────
  console.log('🎯 Creating Ops...');
  await prisma.ops.createMany({
    data: [
      { id: randomUUID(), ownerLogin: T, targetLogin: N, declaredAt: daysAgo(1), expiresAt: daysFromNow(6) },
      { id: randomUUID(), ownerLogin: R, targetLogin: J, declaredAt: daysAgo(3), expiresAt: daysFromNow(4) },
      { id: randomUUID(), ownerLogin: A, targetLogin: G, declaredAt: daysAgo(2), expiresAt: daysFromNow(5) },
    ],
  });

  // ── Photos de profil 42 intra ──────────────────────────────────────────────
  console.log('🖼️  Fetching profile pictures from 42 intra...');
  for (const login of WHITELIST) {
    process.stdout.write(`   → ${login}... `);
    await fetchAndSavePublicUser(login);
    const u = await prisma.user.findUnique({ where: { login }, select: { imageUrl: true } });
    console.log(u?.imageUrl ? '✓' : '✗ (not found)');
  }

  // ── Boutique « League Coin » : objet de démonstration ──────────────────────
  console.log('🛒 Upserting demo shop item...');
  await prisma.shopItem.upsert({
    where: { slug: 'title_pioneer' },
    update: {},
    create: {
      slug: 'title_pioneer',
      name: 'Pionnier',
      description: 'Titre de démonstration — premier cosmétique de la boutique.',
      category: 'title',
      price: 100,
      payload: { title: 'Pionnier' },
      active: true,
      sortOrder: 0,
    },
  });

  // ── Passe de combat : 100 paliers, récompenses = cosmétiques EXISTANTS ──────
  // Pour l'instant on n'attache QUE des cosmétiques déjà présents en boutique
  // (pas de nouvel item dédié). On les répartit sur les paliers « milestone »
  // (multiples de 5) ; les autres paliers restent vides (rewardKind 'none') et
  // seront garnis depuis /GOD. La piste complète 1..100 est visible côté joueur.
  console.log('🎟️  Upserting battle pass tiers (100, cosmétiques existants)...');
  const cosmetics = await prisma.shopItem.findMany({
    where: { active: true, category: { in: ['title', 'banner', 'badge', 'cosmetic'] } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true },
  });
  let cosmeticIdx = 0;
  for (let tier = 1; tier <= 100; tier++) {
    let data: {
      rewardKind: string;
      itemId: string | null;
      coins: number | null;
      consumableKind: string | null;
    };
    if (tier % 5 === 0 && cosmeticIdx < cosmetics.length) {
      // Palier « milestone » : un cosmétique existant tant que la boutique en a.
      data = { rewardKind: 'item', itemId: cosmetics[cosmeticIdx++]!.id, coins: null, consumableKind: null };
    } else {
      // Aucune récompense pour l'instant (à configurer dans /GOD).
      data = { rewardKind: 'none', itemId: null, coins: null, consumableKind: null };
    }
    await prisma.battlePassTier.upsert({
      where: { tier },
      update: data,
      create: { tier, ...data },
    });
  }

  console.log('\n✅ Done!');
  process.exit(0);
}

clean()
  .then(seed)
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  });
