/**
 * Mode de jeu courant (babyfoot | smash). Stocké hors React (module store) pour
 * que la couche data (fetchers statiques de useLeagueData) puisse le lire sans
 * prop-drilling. Le hook `useGameMode` l'expose à React via useSyncExternalStore.
 */
export type Game = 'babyfoot' | 'smash' | 'chess' | 'streetfighter' | 'flechettes' | 'coding' | 'pokemon';

const KEY = 'league.game';

function readInitial(): Game {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'smash' || v === 'chess' || v === 'streetfighter' || v === 'flechettes' || v === 'coding' || v === 'pokemon'
      ? v
      : 'babyfoot';
  } catch {
    return 'babyfoot';
  }
}

let current: Game = readInitial();
const listeners = new Set<() => void>();

export function getGame(): Game {
  return current;
}

export function setGame(g: Game): void {
  if (g === current) return;
  current = g;
  try {
    localStorage.setItem(KEY, g);
  } catch {
    /* stockage indisponible : on garde la valeur en mémoire */
  }
  for (const l of listeners) l();
}

export function subscribeGame(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
