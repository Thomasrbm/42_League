import { useSyncExternalStore } from 'react';
import {
  getPerfPref,
  getPerfTier,
  subscribePerf,
  type PerfPref,
  type PerfTier,
} from '../lib/perf';

/**
 * Palier de qualité graphique effectif ('full' | 'lite'). Réagit au moniteur FPS
 * et au choix manuel des réglages. Source : module store `lib/perf`.
 */
export function usePerfTier(): PerfTier {
  return useSyncExternalStore(subscribePerf, getPerfTier, () => 'full');
}

/** True quand les effets coûteux doivent être coupés (raccourci de confort). */
export function useIsLite(): boolean {
  return usePerfTier() === 'lite';
}

/** Préférence persistée ('auto' | 'full' | 'lite') — pour l'UI des réglages. */
export function usePerfPref(): PerfPref {
  return useSyncExternalStore(subscribePerf, getPerfPref, () => 'auto');
}
