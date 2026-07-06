import type { Game } from './schemas.js';

// Moteur de trophées PUR (aucune dépendance, aucun accès base) — partagé entre le
// front (affichage de l'onglet « Trophées ») et le back (calcul du podium pour les
// revenus passifs hebdomadaires). On ne dépend que d'un SOUS-ENSEMBLE structurel
// des entités, pour rester découplé des types api front et des modèles Prisma.

/** Sous-ensemble d'un match nécessaire au calcul des trophées. */
export interface TrophyMatch {
  playerALogin: string;
  playerBLogin: string;
  scoreA: number;
  scoreB: number;
  winner: 'A' | 'B' | 'draw';
  playedAt: string | Date;
  game?: Game | string | null;
  stocksA?: number | null;
  stocksB?: number | null;
}

/** Sous-ensemble d'un joueur (ligne de classement) nécessaire au calcul. */
export interface TrophyUser {
  login: string;
  imageUrl: string | null;
  elo: number;
  /** Nombre de fuites (dodge) — trophée « Le Couard ». Optionnel. */
  dodgeCount?: number | null;
}

export type TrophyColor =
  | 'gold'
  | 'red'
  | 'cyan'
  | 'violet'
  | 'magenta'
  | 'bronze'
  | 'crimson'
  | 'green'
  | 'sapphire';

export interface TrophyResult {
  emoji: string;
  title: string;
  subtitle: string;
  winner: { login: string; imageUrl: string | null } | null;
  value: string;
  hint?: string;
  color: TrophyColor;
  /** false → personne ne détient ce trophée (carte grisée). */
  earned: boolean;
}

interface Acc {
  login: string;
  wins: number;
  losses: number;
  played: number;
  maxGap: number;
  maxGapDate: number;
  biggestUpsetGap: number;
  biggestUpsetVictim: string | null;
  perfectWins: number; // gagné 10-0
  closeWins: number; // gagné 10-9
  negativeWins: number; // gagné 10 contre un score négatif
  annihilations: number; // gagné 10 à -10 (ou pire)
  comebacks: number; // gagné alors que l'adversaire avait ≥ 7
  zeroLosses: number; // perdu en marquant 0
  negativeFinishes: number; // perdu en finissant dans le négatif
  sweeps: number; // smash : set gagné sans concéder de game (2-0 / 3-0)
  stockPerfect: number; // smash : game décisif gagné avec toutes ses vies (3 stocks)
  nightGames: number; // matchs joués entre 0h et 6h
  curWinStreak: number;
  maxWinStreak: number;
  curLossStreak: number;
  maxLossStreak: number;
  beaten: Map<string, number>; // adversaire battu → nb de victoires
  days: Map<string, number>; // jour ISO → nb de matchs
}

export function computeTrophies(
  leaderboard: TrophyUser[],
  matches: TrophyMatch[],
  game: Game = 'babyfoot',
): TrophyResult[] {
  // Pas de partage de trophées entre modes : on ne calcule que sur la discipline.
  matches = matches.filter((m) => (m.game ?? 'babyfoot') === game);
  const userMap = new Map(leaderboard.map((u) => [u.login, u]));
  const acc = new Map<string, Acc>();

  const ensure = (login: string): Acc => {
    let a = acc.get(login);
    if (!a) {
      a = {
        login,
        wins: 0,
        losses: 0,
        played: 0,
        maxGap: -1,
        maxGapDate: 0,
        biggestUpsetGap: 0,
        biggestUpsetVictim: null,
        perfectWins: 0,
        closeWins: 0,
        negativeWins: 0,
        annihilations: 0,
        comebacks: 0,
        zeroLosses: 0,
        negativeFinishes: 0,
        sweeps: 0,
        stockPerfect: 0,
        nightGames: 0,
        curWinStreak: 0,
        maxWinStreak: 0,
        curLossStreak: 0,
        maxLossStreak: 0,
        beaten: new Map(),
        days: new Map(),
      };
      acc.set(login, a);
    }
    return a;
  };

  // Tri chronologique (indispensable pour les séries en cours).
  const sorted = [...matches].sort(
    (a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime(),
  );

  for (const m of sorted) {
    const a = ensure(m.playerALogin);
    const b = ensure(m.playerBLogin);
    a.played++;
    b.played++;
    // Nulle (échecs) : ni V ni D, casse les séries des deux joueurs.
    if (m.winner === 'draw') {
      a.curWinStreak = 0; a.curLossStreak = 0;
      b.curWinStreak = 0; b.curLossStreak = 0;
      continue;
    }
    const winner = m.winner === 'A' ? a : b;
    const loser = m.winner === 'A' ? b : a;
    winner.wins++;
    loser.losses++;

    // Séries en cours
    winner.curWinStreak++;
    winner.curLossStreak = 0;
    if (winner.curWinStreak > winner.maxWinStreak) winner.maxWinStreak = winner.curWinStreak;
    loser.curLossStreak++;
    loser.curWinStreak = 0;
    if (loser.curLossStreak > loser.maxLossStreak) loser.maxLossStreak = loser.curLossStreak;

    // Adversaires battus
    winner.beaten.set(loser.login, (winner.beaten.get(loser.login) ?? 0) + 1);

    const winnerScore = m.winner === 'A' ? m.scoreA : m.scoreB;
    const loserScore = m.winner === 'A' ? m.scoreB : m.scoreA;

    // Set games (Smash / Street Fighter) : sweep = set gagné sans concéder de game.
    // Les « vies » (stockPerfect) sont propres au Smash.
    if (game === 'smash' || game === 'streetfighter') {
      if (loserScore === 0) winner.sweeps++;
      if (game === 'smash') {
        const winnerStocks = m.winner === 'A' ? m.stocksA : m.stocksB;
        if ((winnerStocks ?? 0) >= 3) winner.stockPerfect++;
      }
    }

    const gap = Math.abs(m.scoreA - m.scoreB);
    const d = new Date(m.playedAt);
    const ts = d.getTime();
    if (gap > winner.maxGap || (gap === winner.maxGap && ts > winner.maxGapDate)) {
      winner.maxGap = gap;
      winner.maxGapDate = ts;
    }

    // Heure / jour
    const hour = d.getHours();
    if (hour < 6) {
      a.nightGames++;
      b.nightGames++;
    }
    const dayKey = d.toISOString().slice(0, 10);
    a.days.set(dayKey, (a.days.get(dayKey) ?? 0) + 1);
    b.days.set(dayKey, (b.days.get(dayKey) ?? 0) + 1);

    // Exploits du gagnant (la game se gagne à 10)
    if (winnerScore === 10) {
      if (loserScore === 0) winner.perfectWins++; // 10-0
      if (loserScore === 9) winner.closeWins++; // 10-9
      if (loserScore < 0) winner.negativeWins++; // 10 à négatif
      if (loserScore <= -10) winner.annihilations++; // 10 à -10 (ou pire)
      if (loserScore >= 7) winner.comebacks++; // remontée serrée
    }
    // Misères du perdant
    if (loserScore === 0) loser.zeroLosses++; // perdu sans marquer
    if (loserScore < 0) loser.negativeFinishes++; // fini dans le négatif

    const wElo = userMap.get(winner.login)?.elo ?? 1000;
    const lElo = userMap.get(loser.login)?.elo ?? 1000;
    const upsetGap = lElo - wElo;
    if (upsetGap > 0 && upsetGap > winner.biggestUpsetGap) {
      winner.biggestUpsetGap = upsetGap;
      winner.biggestUpsetVictim = loser.login;
    }
  }

  // Paire la plus active (rivalité)
  let topPair: { a: string; b: string; n: number } | null = null;
  const pairCount = new Map<string, number>();
  for (const m of matches) {
    const [x, y] =
      m.playerALogin < m.playerBLogin
        ? [m.playerALogin, m.playerBLogin]
        : [m.playerBLogin, m.playerALogin];
    const k = `${x}|${y}`;
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
  }
  for (const [k, n] of pairCount.entries()) {
    if (!topPair || n > topPair.n) {
      const [a, b] = k.split('|');
      topPair = { a: a ?? '', b: b ?? '', n };
    }
  }

  function avatarOf(login: string | null) {
    if (!login) return null;
    const u = userMap.get(login);
    return { login, imageUrl: u?.imageUrl ?? null };
  }

  function best(cmp: (x: Acc, y: Acc) => number, minPlayed = 0): Acc | null {
    let res: Acc | null = null;
    for (const a of acc.values()) {
      if (a.played < minPlayed) continue;
      if (!res || cmp(a, res) > 0) res = a;
    }
    return res;
  }

  function maxOf(m: Map<string, number>): { key: string; val: number } | null {
    let best: { key: string; val: number } | null = null;
    for (const [key, val] of m) {
      if (!best || val > best.val) best = { key, val };
    }
    return best;
  }

  /** Construit un trophée "leader d'une métrique" : grisé si personne ne dépasse 0. */
  function metricTrophy(opts: {
    emoji: string;
    title: string;
    subtitle: string;
    color: TrophyColor;
    pick: (a: Acc) => number;
    format: (v: number) => string;
    minPlayed?: number;
  }): TrophyResult {
    const leader = best((a, b) => opts.pick(a) - opts.pick(b), opts.minPlayed ?? 0);
    const v = leader ? opts.pick(leader) : 0;
    const earned = !!leader && v > 0;
    return {
      emoji: opts.emoji,
      title: opts.title,
      subtitle: opts.subtitle,
      color: opts.color,
      winner: earned ? avatarOf(leader!.login) : null,
      value: earned ? opts.format(v) : '—',
      earned,
    };
  }

  const out: TrophyResult[] = [];

  // Titres « phares » déclinés par discipline (même métrique, habillage différent).
  const winsFlavor =
    game === 'smash'
      ? { emoji: '🎮', title: 'Smash God' }
      : game === 'streetfighter'
        ? { emoji: '🥊', title: 'World Warrior' }
        : game === 'chess'
          ? { emoji: '♛', title: 'Maître du jeu' }
          : game === 'flechettes'
            ? { emoji: '🎯', title: 'Maître des fléchettes' }
            : { emoji: '🏆', title: 'G.O.A.T' };
  const streakFlavor =
    game === 'smash'
      ? { emoji: '🔥', title: 'Combo King' }
      : game === 'streetfighter'
        ? { emoji: '🔥', title: 'Perfect' }
        : game === 'chess'
          ? { emoji: '♟️', title: 'Série gagnante' }
          : game === 'flechettes'
            ? { emoji: '🔥', title: 'Main chaude' }
            : { emoji: '🔥', title: 'En feu' };

  // ─── Classement / ELO ──────────────────────────────────────────────
  const champion = leaderboard[0];
  out.push({
    emoji: '💎',
    title: 'Elo KING',
    subtitle: 'Plus haut ELO actuel',
    color: 'sapphire',
    winner: champion ? avatarOf(champion.login) : null,
    value: champion ? `${champion.elo} ELO` : '—',
    earned: !!champion,
  });

  // ─── Performances positives ────────────────────────────────────────
  out.push(
    metricTrophy({
      emoji: winsFlavor.emoji,
      title: winsFlavor.title,
      subtitle: 'Le plus de victoires',
      color: 'gold',
      pick: (a) => a.wins,
      format: (v) => `${v} W`,
    }),
  );
  // Win rate : « Sniper » au babyfoot/smash, « Le Stratège » aux échecs.
  out.push(
    metricTrophy({
      emoji: game === 'chess' ? '🧠' : '🎯',
      title: game === 'chess' ? 'Le Stratège' : 'Sniper',
      subtitle: 'Meilleur win rate (min 3 matchs)',
      color: 'cyan',
      minPlayed: 3,
      pick: (a) => (a.played ? a.wins / a.played : 0),
      format: (v) => `${Math.round(v * 100)}%`,
    }),
  );
  out.push(
    metricTrophy({
      emoji: streakFlavor.emoji,
      title: streakFlavor.title,
      subtitle: 'Plus longue série de victoires',
      color: 'gold',
      pick: (a) => a.maxWinStreak,
      format: (v) => `${v} d'affilée`,
    }),
  );

  // ─── Trophées spécifiques BABYFOOT (exploits au score) ──────────────
  if (game === 'babyfoot') {
    out.push(
      metricTrophy({
        emoji: '💥',
        title: 'Destroyer',
        subtitle: 'Le plus de victoires 10-0',
        color: 'magenta',
        pick: (a) => a.perfectWins,
        format: (v) => `${v}× 10-0`,
      }),
    );
    out.push(
      metricTrophy({
        emoji: '⚖️',
        title: 'Le Serré',
        subtitle: 'Le plus de victoires 10-9',
        color: 'green',
        pick: (a) => a.closeWins,
        format: (v) => `${v}× 10-9`,
      }),
    );
    out.push(
      metricTrophy({
        emoji: '📉',
        title: 'Negativer',
        subtitle: 'Le plus de victoires 10 contre un score négatif',
        color: 'violet',
        pick: (a) => a.negativeWins,
        format: (v) => `${v}× 10-(−)`,
      }),
    );
    out.push(
      metricTrophy({
        emoji: '☠️',
        title: 'Annihilateur',
        subtitle: 'Le plus de victoires 10 à -10 (ou pire)',
        color: 'crimson',
        pick: (a) => a.annihilations,
        format: (v) => `${v}× 10 à -10`,
      }),
    );
    out.push(
      metricTrophy({
        emoji: '🎪',
        title: 'Spectacle',
        subtitle: 'Plus grosse marge en victoire',
        color: 'bronze',
        pick: (a) => a.maxGap,
        format: (v) => `+${v}`,
      }),
    );
  }

  // ─── Trophées spécifiques aux jeux de set (Smash / Street Fighter) ──────
  if (game === 'smash' || game === 'streetfighter') {
    out.push(
      metricTrophy({
        emoji: '🧹',
        title: 'Sweep Master',
        subtitle: 'Le plus de sets gagnés sans concéder de game',
        color: 'magenta',
        pick: (a) => a.sweeps,
        format: (v) => `${v} sweeps`,
      }),
    );
    // Les « vies » (3 stocks) sont propres au Smash.
    if (game === 'smash') {
      out.push(
        metricTrophy({
          emoji: '💢',
          title: 'Sans Pitié',
          subtitle: 'Le plus de games décisifs gagnés avec 3 vies',
          color: 'crimson',
          pick: (a) => a.stockPerfect,
          format: (v) => `${v}× 3 vies`,
        }),
      );
    }
  }

  out.push(
    metricTrophy({
      emoji: '🗡️',
      title: 'Chasseur de primes',
      subtitle: "Le plus d'adversaires différents battus",
      color: 'cyan',
      pick: (a) => a.beaten.size,
      format: (v) => `${v} victimes`,
    }),
  );

  // Némésis — le plus de victoires contre un même joueur (avec la victime)
  {
    let leader: Acc | null = null;
    let leaderVal = 0;
    let leaderVictim: string | null = null;
    for (const a of acc.values()) {
      const top = maxOf(a.beaten);
      if (top && top.val > leaderVal) {
        leader = a;
        leaderVal = top.val;
        leaderVictim = top.key;
      }
    }
    const earned = !!leader && leaderVal >= 2;
    out.push({
      emoji: '😈',
      title: 'Némésis',
      subtitle: 'Le plus de victoires contre un même joueur',
      color: 'crimson',
      winner: earned ? avatarOf(leader!.login) : null,
      value: earned ? `${leaderVal}×` : '—',
      hint: earned && leaderVictim ? `victime : ${leaderVictim}` : undefined,
      earned,
    });
  }

  // ─── Misères / honte ───────────────────────────────────────────────
  out.push(
    metricTrophy({
      emoji: '💀',
      title: 'Loooooooooser',
      subtitle: 'Le plus de défaites',
      color: 'red',
      pick: (a) => a.losses,
      format: (v) => `${v} L`,
    }),
  );
  out.push(
    metricTrophy({
      emoji: '🥶',
      title: 'Glissade',
      subtitle: 'Plus longue série de défaites',
      color: 'sapphire',
      pick: (a) => a.maxLossStreak,
      format: (v) => `${v} d'affilée`,
    }),
  );
  if (game === 'babyfoot') {
    out.push(
      metricTrophy({
        emoji: '🧊',
        title: 'Zéro Absolu',
        subtitle: 'Le plus de défaites en marquant 0',
        color: 'cyan',
        pick: (a) => a.zeroLosses,
        format: (v) => `${v}× 0 pt`,
      }),
    );
    out.push(
      metricTrophy({
        emoji: '🪨',
        title: 'Le Boulet',
        subtitle: 'Le plus de matchs finis dans le négatif',
        color: 'red',
        pick: (a) => a.negativeFinishes,
        format: (v) => `${v}× négatif`,
      }),
    );
  }

  // ─── Activité / divers ─────────────────────────────────────────────
  out.push(
    metricTrophy({
      emoji: '🔁',
      title: 'Marathonien',
      subtitle: 'Le plus de matchs joués',
      color: 'green',
      pick: (a) => a.played,
      format: (v) => `${v} matchs`,
    }),
  );
  out.push(
    metricTrophy({
      emoji: '🌙',
      title: 'Le Noctambule',
      subtitle: 'Le plus de matchs entre 0h et 6h',
      color: 'violet',
      pick: (a) => a.nightGames,
      format: (v) => `${v} matchs`,
    }),
  );

  // Bourreau de travail — le plus de matchs sur une même journée
  {
    let leader: Acc | null = null;
    let leaderVal = 0;
    for (const a of acc.values()) {
      const top = maxOf(a.days);
      if (top && top.val > leaderVal) {
        leader = a;
        leaderVal = top.val;
      }
    }
    const earned = !!leader && leaderVal >= 3;
    out.push({
      emoji: '📅',
      title: 'Bourreau de travail',
      subtitle: 'Le plus de matchs en une journée',
      color: 'bronze',
      winner: earned ? avatarOf(leader!.login) : null,
      value: earned ? `${leaderVal} en 1 jour` : '—',
      earned,
    });
  }

  // Pissette Master (upset ELO) — porte aussi un indice "vs victime"
  const pissette = best((a, b) => a.biggestUpsetGap - b.biggestUpsetGap);
  const pissetteEarned = !!pissette && pissette.biggestUpsetGap > 0;
  out.push({
    emoji: '👑',
    title: 'Pissette Master',
    subtitle: 'Plus gros upset ELO',
    color: 'violet',
    winner: pissetteEarned ? avatarOf(pissette!.login) : null,
    value: pissetteEarned ? `+${pissette!.biggestUpsetGap} ELO` : '—',
    hint:
      pissetteEarned && pissette!.biggestUpsetVictim
        ? `vs ${pissette!.biggestUpsetVictim}`
        : undefined,
    earned: pissetteEarned,
  });

  // Le Couard (fuites) — basé sur le classement
  const couard = [...leaderboard].sort(
    (a, b) => (b.dodgeCount ?? 0) - (a.dodgeCount ?? 0),
  )[0];
  const couardEarned = !!couard && (couard.dodgeCount ?? 0) > 0;
  out.push({
    emoji: '🏃',
    title: 'Le Couard',
    subtitle: 'Le plus de fuites',
    color: 'crimson',
    winner: couardEarned ? avatarOf(couard.login) : null,
    value: couardEarned ? `${couard.dodgeCount} fuites` : '—',
    earned: couardEarned,
  });

  // Rivalité (paire la plus active) — winner null mais "earned" si paire ≥ 2
  const rivalryEarned = !!topPair && topPair.n >= 2;
  out.push({
    emoji: '🤝',
    title: 'Rivalité',
    subtitle: 'Paire la plus active',
    color: 'bronze',
    winner: null,
    value: rivalryEarned ? `${topPair!.a} vs ${topPair!.b}` : '—',
    hint: rivalryEarned ? `${topPair!.n} matchs` : undefined,
    earned: rivalryEarned,
  });

  return out;
}

// ─── Trophées INTER-JEUX (mix) ──────────────────────────────────────────────
// Récompensent les joueurs qui combinent des performances/trophées sur plusieurs
// disciplines à la fois.

export type GameBoards = Partial<Record<Game, TrophyUser[]>>;

const MIX_GAMES: Game[] = ['babyfoot', 'smash', 'chess', 'streetfighter', 'flechettes', 'coding', 'pokemon'];

export function computeMixTrophies(boards: GameBoards, matches: TrophyMatch[]): TrophyResult[] {
  // Avatars + ELO cumulé depuis les 3 classements.
  const avatar = new Map<string, string | null>();
  const sumElo = new Map<string, number>();
  for (const g of MIX_GAMES) {
    for (const e of boards[g] ?? []) {
      if (!avatar.has(e.login)) avatar.set(e.login, e.imageUrl);
      sumElo.set(e.login, (sumElo.get(e.login) ?? 0) + e.elo);
    }
  }

  // Victoires totales + matchs joués + disciplines jouées (historique tous jeux).
  const wins = new Map<string, number>();
  const played = new Map<string, number>();
  const gamesPlayed = new Map<string, Set<string>>();
  for (const m of matches) {
    const g = m.game ?? 'babyfoot';
    if (m.winner !== 'draw') {
      const winner = m.winner === 'A' ? m.playerALogin : m.playerBLogin;
      wins.set(winner, (wins.get(winner) ?? 0) + 1);
    }
    for (const login of [m.playerALogin, m.playerBLogin]) {
      played.set(login, (played.get(login) ?? 0) + 1);
      const s = gamesPlayed.get(login) ?? new Set<string>();
      s.add(g);
      gamesPlayed.set(login, s);
      if (!avatar.has(login)) avatar.set(login, null);
    }
  }

  // Disciplines où le joueur détient ≥1 trophée (calculés par jeu).
  const trophyGames = new Map<string, Set<string>>();
  const trophyCount = new Map<string, number>();
  for (const g of MIX_GAMES) {
    const board = boards[g];
    if (!board || board.length === 0) continue;
    for (const t of computeTrophies(board, matches, g)) {
      if (!t.earned || !t.winner) continue;
      const login = t.winner.login;
      const set = trophyGames.get(login) ?? new Set<string>();
      set.add(g);
      trophyGames.set(login, set);
      trophyCount.set(login, (trophyCount.get(login) ?? 0) + 1);
    }
  }

  // Nombre de disciplines classées (non vides) + #1 de chaque classement.
  const top1Count = new Map<string, number>();
  let activeGameCount = 0;
  for (const g of MIX_GAMES) {
    const board = boards[g];
    if (!board || board.length === 0) continue;
    activeGameCount++;
    const leaderLogin = board[0]?.login;
    if (leaderLogin) top1Count.set(leaderLogin, (top1Count.get(leaderLogin) ?? 0) + 1);
  }

  const av = (login: string) => ({ login, imageUrl: avatar.get(login) ?? null });

  /** Trophée "leader d'une métrique" sur l'ensemble des joueurs croisés. */
  function leader(
    opts: {
      emoji: string;
      title: string;
      subtitle: string;
      color: TrophyColor;
      value: (login: string) => number;
      format: (v: number) => string;
      min: number;
    },
  ): TrophyResult {
    let bestLogin: string | null = null;
    let bestVal = 0;
    for (const login of avatar.keys()) {
      const v = opts.value(login);
      if (v > bestVal) {
        bestVal = v;
        bestLogin = login;
      }
    }
    const earned = !!bestLogin && bestVal >= opts.min;
    return {
      emoji: opts.emoji,
      title: opts.title,
      subtitle: opts.subtitle,
      color: opts.color,
      winner: earned ? av(bestLogin!) : null,
      value: earned ? opts.format(bestVal) : '—',
      earned,
    };
  }

  return [
    leader({
      emoji: '🌐',
      title: 'Touche-à-tout',
      subtitle: 'Détient des trophées dans le plus de disciplines',
      color: 'sapphire',
      value: (l) => trophyGames.get(l)?.size ?? 0,
      format: (v) => `${v} jeux`,
      min: 2,
    }),
    leader({
      emoji: '🌟',
      title: 'Légende universelle',
      subtitle: 'Le plus de trophées cumulés, tous jeux confondus',
      color: 'gold',
      value: (l) => trophyCount.get(l) ?? 0,
      format: (v) => `${v} trophées`,
      min: 2,
    }),
    leader({
      emoji: '💎',
      title: 'Roi multi-jeux',
      subtitle: 'Plus haut ELO cumulé (babyfoot + smash + échecs + Street Fighter)',
      color: 'violet',
      value: (l) => sumElo.get(l) ?? 0,
      format: (v) => `${v} ELO`,
      min: 1,
    }),
    leader({
      emoji: '⚔️',
      title: 'Machine de guerre',
      subtitle: 'Le plus de victoires toutes disciplines confondues',
      color: 'crimson',
      value: (l) => wins.get(l) ?? 0,
      format: (v) => `${v} W`,
      min: 1,
    }),
    leader({
      emoji: '🎮',
      title: 'Le Polyvalent',
      subtitle: 'Actif sur le plus de disciplines différentes',
      color: 'green',
      value: (l) => gamesPlayed.get(l)?.size ?? 0,
      format: (v) => `${v} jeux joués`,
      min: 2,
    }),
    leader({
      emoji: '🌍',
      title: 'Marathonien Universel',
      subtitle: 'Le plus de matchs joués, toutes disciplines confondues',
      color: 'cyan',
      value: (l) => played.get(l) ?? 0,
      format: (v) => `${v} matchs`,
      min: 10,
    }),
    leader({
      emoji: '🧠',
      title: 'Le Surdoué',
      subtitle: 'Meilleur ratio de victoires tous jeux (min. 10 matchs)',
      color: 'magenta',
      value: (l) => {
        const p = played.get(l) ?? 0;
        return p >= 10 ? Math.round(((wins.get(l) ?? 0) / p) * 100) : 0;
      },
      format: (v) => `${v}% WR`,
      min: 50,
    }),
    leader({
      emoji: '🏛️',
      title: 'Pilier de la Ligue',
      subtitle: 'En tête du classement dans le plus de disciplines',
      color: 'gold',
      value: (l) => top1Count.get(l) ?? 0,
      format: (v) => `${v}× n°1`,
      min: 2,
    }),
    leader({
      emoji: '🏅',
      title: 'Grand Chelem',
      subtitle: 'Détient un trophée dans CHAQUE discipline classée',
      color: 'bronze',
      value: (l) => trophyGames.get(l)?.size ?? 0,
      format: (v) => `${v} disciplines`,
      min: Math.max(activeGameCount, 2),
    }),
  ];
}

/**
 * Nombre de trophées détenus par chaque joueur, AGRÉGÉ sur toutes les disciplines
 * (mêmes calculs par jeu que l'onglet « Trophées »). C'est la base du « podium des
 * trophés » : on classe les joueurs par ce total. Sert au calcul server-side des
 * revenus passifs hebdomadaires (podium + prime par trophée).
 *
 * On ne compte QUE les trophées effectivement décernés (`earned` + `winner`), une
 * unité par trophée tenu, sommée sur les disciplines classées.
 */
export function trophyCountsByLogin(boards: GameBoards, matches: TrophyMatch[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const g of MIX_GAMES) {
    const board = boards[g];
    if (!board || board.length === 0) continue;
    for (const t of computeTrophies(board, matches, g)) {
      if (!t.earned || !t.winner) continue;
      counts.set(t.winner.login, (counts.get(t.winner.login) ?? 0) + 1);
    }
  }
  return counts;
}
