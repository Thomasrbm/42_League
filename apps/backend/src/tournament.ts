import { prisma } from './db.js';
import { randomUUID } from 'node:crypto';

/** Plus petite puissance de 2 >= n. */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Nombre de rounds d'un bracket de taille `bracketSize` (puissance de 2). */
export function totalRounds(bracketSize: number): number {
  return Math.max(0, Math.round(Math.log2(bracketSize)));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}

/**
 * Ordre de seeding canonique d'un bracket (1 affronte le dernier, 2 l'avant-dernier,
 * etc., réparti récursivement). Retourne un tableau de longueur `size` de numéros de
 * seed 1..size. Les byes (seeds > nb de joueurs) atterrissent ainsi face aux têtes de série.
 */
function seedOrder(size: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

/**
 * Construit un bracket à élimination directe à partir d'une liste de joueurs.
 * Gère un nombre quelconque de joueurs (>= 2) : la taille du bracket est arrondie à
 * la puissance de 2 supérieure et les byes sont attribués aux têtes de série (qui
 * avancent automatiquement au tour 2).
 *
 * @param seededLogins joueurs déjà ordonnés par seed (index 0 = tête de série n°1).
 *   Si `preSeeded` est faux, l'ordre est mélangé aléatoirement avant le seeding.
 */
export async function generateBracket(
  tournamentId: string,
  seededLogins: string[],
  opts: { preSeeded?: boolean } = {},
): Promise<void> {
  const players = opts.preSeeded ? [...seededLogins] : shuffle(seededLogins);
  const n = players.length;
  const size = Math.max(2, nextPow2(n));
  const rounds = totalRounds(size);
  // seedToPlayer[seed] = login (seed 1..n) ou null (bye, seed n+1..size)
  const seedToPlayer = (seed: number): string | null => players[seed - 1] ?? null;
  const order = seedOrder(size);

  const data: Array<{
    id: string;
    tournamentId: string;
    stage: string;
    round: number;
    slot: number;
    playerALogin: string | null;
    playerBLogin: string | null;
    winnerLogin: string | null;
    confirmedAt: Date | null;
  }> = [];

  // Round 1 : paires issues de l'ordre de seeding.
  const firstRoundMatches = size / 2;
  const byeWinners: Array<{ slot: number; winner: string }> = [];
  for (let s = 0; s < firstRoundMatches; s++) {
    const a = seedToPlayer(order[s * 2]!);
    const b = seedToPlayer(order[s * 2 + 1]!);
    // Bye : un seul joueur présent → il est qualifié d'office.
    let winner: string | null = null;
    let confirmedAt: Date | null = null;
    if (a && !b) {
      winner = a;
      confirmedAt = new Date();
    } else if (b && !a) {
      winner = b;
      confirmedAt = new Date();
    }
    if (winner) byeWinners.push({ slot: s, winner });
    data.push({
      id: randomUUID(),
      tournamentId,
      stage: 'bracket',
      round: 1,
      slot: s,
      playerALogin: a,
      playerBLogin: b,
      winnerLogin: winner,
      confirmedAt,
    });
  }

  // Rounds suivants : placeholders vides.
  for (let r = 2; r <= rounds; r++) {
    const matchesInRound = size / Math.pow(2, r);
    for (let s = 0; s < matchesInRound; s++) {
      data.push({
        id: randomUUID(),
        tournamentId,
        stage: 'bracket',
        round: r,
        slot: s,
        playerALogin: null,
        playerBLogin: null,
        winnerLogin: null,
        confirmedAt: null,
      });
    }
  }

  await prisma.tournamentMatch.createMany({ data });

  // Propage les byes du round 1 vers le round 2.
  for (const { slot, winner } of byeWinners) {
    if (rounds < 2) continue;
    const nextSlot = Math.floor(slot / 2);
    const side = slot % 2 === 0 ? 'A' : 'B';
    await prisma.tournamentMatch.update({
      where: { tournamentId_round_slot: { tournamentId, round: 2, slot: nextSlot } },
      data: side === 'A' ? { playerALogin: winner } : { playerBLogin: winner },
    });
  }
}

const POOL_SIZE = 4;

/**
 * Paires round-robin d'une poule, RANGÉES PAR JOURNÉE (« méthode du cercle ») : à
 * chaque journée, chacun joue au plus une fois (un joueur se repose si l'effectif
 * est impair). Les affiches sont donc ENTRELACÉES — on ne voit plus les matchs d'un
 * même joueur à la suite, et le « prochain match » tombe naturellement sur ceux qui
 * n'ont pas joué depuis le plus longtemps. Miroir de `leagueRoundRobinPairs`
 * (index.ts) à l'échelle d'une poule. Renvoie les paires dans l'ordre de jeu.
 */
export function poolRoundRobinPairs(logins: string[]): Array<[string, string]> {
  if (logins.length < 2) return [];
  const arr = [...logins];
  if (arr.length % 2 === 1) arr.push('__BYE__');
  const n = arr.length;
  const half = n / 2;
  const out: Array<[string, string]> = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i]!;
      const b = arr[n - 1 - i]!;
      if (a === '__BYE__' || b === '__BYE__') continue;
      out.push([a, b]);
    }
    // Rotation : arr[0] figé, le reste tourne d'un cran (dernier → 2e position).
    const fixed = arr[0]!;
    const rest = arr.slice(1);
    rest.unshift(rest.pop()!);
    arr.splice(0, arr.length, fixed, ...rest);
  }
  return out;
}

/**
 * Construit la phase de poules : poules de 4 (la dernière peut être plus petite),
 * round-robin complet dans chaque poule. Les joueurs sont répartis en serpent pour
 * équilibrer les tailles. Au sein d'une poule, les affiches sont ordonnées PAR
 * JOURNÉE (cf. `poolRoundRobinPairs`) : l'ordre des `slot` donne l'ordre de jeu, si
 * bien que le « prochain match » de poule tombe sur l'équipe la plus inactive.
 */
export async function generatePools(
  tournamentId: string,
  loginsIn: string[],
): Promise<void> {
  const logins = shuffle(loginsIn);
  const numPools = Math.max(1, Math.ceil(logins.length / POOL_SIZE));
  const pools: string[][] = Array.from({ length: numPools }, () => []);
  logins.forEach((login, i) => {
    pools[i % numPools]!.push(login);
  });

  const data: Array<{
    id: string;
    tournamentId: string;
    stage: string;
    poolIndex: number;
    round: number;
    slot: number;
    playerALogin: string;
    playerBLogin: string;
  }> = [];
  let slot = 0;
  pools.forEach((pool, poolIndex) => {
    // Affiches entrelacées par journée plutôt que joueur par joueur : l'ordre des
    // `slot` reflète ainsi l'ordre de jeu conseillé.
    for (const [a, b] of poolRoundRobinPairs(pool)) {
      data.push({
        id: randomUUID(),
        tournamentId,
        stage: 'pool',
        poolIndex,
        round: 0,
        slot: slot++,
        playerALogin: a,
        playerBLogin: b,
      });
    }
  });
  await prisma.tournamentMatch.createMany({ data });
}

export interface PoolMatchLite {
  poolIndex: number | null;
  playerALogin: string | null;
  playerBLogin: string | null;
  scoreA: number | null;
  scoreB: number | null;
  winnerLogin: string | null;
}

export interface PoolStanding {
  login: string;
  played: number;
  wins: number;
  goalsFor: number;
  goalsAgainst: number;
  diff: number;
}

/**
 * Classement d'une poule à partir de ses matchs confirmés. Tri : victoires, puis
 * différence de buts, puis buts marqués.
 */
export function poolStandings(matches: PoolMatchLite[]): PoolStanding[] {
  const table = new Map<string, PoolStanding>();
  const ensure = (login: string): PoolStanding => {
    let s = table.get(login);
    if (!s) {
      s = { login, played: 0, wins: 0, goalsFor: 0, goalsAgainst: 0, diff: 0 };
      table.set(login, s);
    }
    return s;
  };
  for (const m of matches) {
    if (!m.playerALogin || !m.playerBLogin || m.scoreA == null || m.scoreB == null) continue;
    const a = ensure(m.playerALogin);
    const b = ensure(m.playerBLogin);
    a.played++;
    b.played++;
    a.goalsFor += m.scoreA;
    a.goalsAgainst += m.scoreB;
    b.goalsFor += m.scoreB;
    b.goalsAgainst += m.scoreA;
    if (m.winnerLogin === m.playerALogin) a.wins++;
    else if (m.winnerLogin === m.playerBLogin) b.wins++;
  }
  const rows = [...table.values()];
  for (const r of rows) r.diff = r.goalsFor - r.goalsAgainst;
  rows.sort((x, y) => y.wins - x.wins || y.diff - x.diff || y.goalsFor - x.goalsFor);
  return rows;
}

/**
 * À partir de tous les matchs de poule confirmés, calcule les qualifiés (top 2 de
 * chaque poule) et les ordonne pour le bracket : tous les 1ers (dans l'ordre des
 * poules) puis tous les 2es en ordre inverse — de sorte que deux qualifiés d'une
 * même poule ne se croisent pas avant la fin.
 */
export function qualifiersFromPools(matches: PoolMatchLite[], qualifyPerPool = 2): string[] {
  const byPool = new Map<number, PoolMatchLite[]>();
  for (const m of matches) {
    const p = m.poolIndex ?? 0;
    if (!byPool.has(p)) byPool.set(p, []);
    byPool.get(p)!.push(m);
  }
  const poolIndexes = [...byPool.keys()].sort((a, b) => a - b);
  const ranks: string[][] = poolIndexes.map((p) =>
    poolStandings(byPool.get(p)!)
      .slice(0, qualifyPerPool)
      .map((s) => s.login),
  );
  // Colonne par rang : firsts (ordre poules), seconds (ordre poules inversé), etc.
  const seeded: string[] = [];
  for (let rank = 0; rank < qualifyPerPool; rank++) {
    const col = ranks.map((r) => r[rank]).filter((x): x is string => !!x);
    if (rank % 2 === 1) col.reverse();
    seeded.push(...col);
  }
  return seeded;
}

/**
 * Classement d'une phase de ligue (un seul tableau, tous les matchs confondus).
 * Tri AU GOAL AVERAGE : différence de buts, puis buts marqués, puis victoires —
 * contrairement aux poules qui priorisent les victoires.
 */
export function leagueStandings(matches: PoolMatchLite[]): PoolStanding[] {
  const rows = poolStandings(matches);
  rows.sort((x, y) => y.diff - x.diff || y.goalsFor - x.goalsFor || y.wins - x.wins);
  return rows;
}

/**
 * Qualifiés de la phase de ligue : les `qualifyCount` premiers au goal average,
 * déjà ordonnés par seed (1er = tête de série) pour `generateBracket({preSeeded})`.
 */
export function leagueQualifiers(matches: PoolMatchLite[], qualifyCount: number): string[] {
  return leagueStandings(matches)
    .slice(0, qualifyCount)
    .map((s) => s.login);
}

/**
 * Après confirmation d'un match de bracket, propage le gagnant au match du tour
 * suivant. Retourne `isFinal` quand il s'agit du dernier round (la finale).
 *
 * @param totalBracketRounds nombre total de rounds de bracket (calculé depuis les
 *   matchs réels, pas la capacité — byes et poules font diverger les deux).
 */
export async function advanceWinner(
  tournamentId: string,
  round: number,
  slot: number,
  winnerLogin: string,
  totalBracketRounds: number,
): Promise<{ isFinal: boolean }> {
  if (round >= totalBracketRounds) return { isFinal: true };
  const nextRound = round + 1;
  const nextSlot = Math.floor(slot / 2);
  const side = slot % 2 === 0 ? 'A' : 'B';
  await prisma.tournamentMatch.update({
    where: {
      tournamentId_round_slot: {
        tournamentId,
        round: nextRound,
        slot: nextSlot,
      },
    },
    data:
      side === 'A'
        ? { playerALogin: winnerLogin }
        : { playerBLogin: winnerLogin },
  });
  return { isFinal: false };
}
