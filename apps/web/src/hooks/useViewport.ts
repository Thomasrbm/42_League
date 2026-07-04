import { useSyncExternalStore } from 'react';

/**
 * Breakpoints alignés sur Tailwind :
 * - xs: 420  (très petits mobiles)
 * - sm: 640  (mobiles paysage / petits tablets portrait)
 * - md: 768  (tablets)
 * - lg: 1024 (desktop)
 * - xl: 1280
 */
const BREAKPOINTS = {
  xs: 420,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

export interface Viewport {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** True quand le pointeur principal est tactile (mobile/tablet). */
  isTouch: boolean;
  /** True quand l'app tourne en mode standalone (PWA installée). */
  isStandalone: boolean;
  /** Orientation actuelle. */
  orientation: 'portrait' | 'landscape';
}

// MediaQueryList hoistés une seule fois : `getSnapshot` est appelé à chaque
// render des composants qui consomment le hook ; recréer un MQL à chaque appel
// (window.matchMedia(...)) allouait inutilement. On réutilise ces objets pour la
// lecture (.matches) ET l'abonnement (addEventListener).
const mqlPointer =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(pointer: coarse)')
    : null;
const mqlStandalone =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(display-mode: standalone)')
    : null;

function readViewport(): Viewport {
  if (typeof window === 'undefined') {
    return {
      width: 1024,
      height: 768,
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      isTouch: false,
      isStandalone: false,
      orientation: 'landscape',
    };
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  const isTouch = mqlPointer?.matches ?? false;
  const isStandalone =
    (mqlStandalone?.matches ?? false) ||
    // iOS legacy
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return {
    width: w,
    height: h,
    isMobile: w < BREAKPOINTS.md,
    isTablet: w >= BREAKPOINTS.md && w < BREAKPOINTS.lg,
    isDesktop: w >= BREAKPOINTS.md,
    isTouch,
    isStandalone,
    orientation: w > h ? 'landscape' : 'portrait',
  };
}

// Cache du dernier snapshot pour useSyncExternalStore — sinon React boucle.
let cached: Viewport | null = null;
let lastFingerprint = '';

function getSnapshot(): Viewport {
  const next = readViewport();
  const fp = `${next.width}x${next.height}|${next.isTouch ? 't' : 'm'}|${next.isStandalone ? 's' : 'b'}|${next.orientation}`;
  if (fp !== lastFingerprint || cached === null) {
    lastFingerprint = fp;
    cached = next;
  }
  return cached;
}

function getServerSnapshot(): Viewport {
  return {
    width: 1024,
    height: 768,
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isTouch: false,
    isStandalone: false,
    orientation: 'landscape',
  };
}

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('resize', cb);
  window.addEventListener('orientationchange', cb);
  mqlStandalone?.addEventListener('change', cb);
  mqlPointer?.addEventListener('change', cb);
  return () => {
    window.removeEventListener('resize', cb);
    window.removeEventListener('orientationchange', cb);
    mqlStandalone?.removeEventListener('change', cb);
    mqlPointer?.removeEventListener('change', cb);
  };
}

/**
 * Hook réactif sur le viewport — recompose au resize/orientation/display-mode change.
 * Source de vérité unique pour décider Mobile vs Desktop dans tout le app shell.
 */
export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Helper court pour les cas qui n'ont besoin que du isMobile. */
export function useIsMobile(): boolean {
  return useViewport().isMobile;
}
