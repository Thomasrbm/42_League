/**
 * Qualité graphique adaptative — source de vérité hors React (module store).
 *
 * Deux paliers (« tiers ») :
 *  - 'full' : rendu complet, IDENTIQUE au design d'origine (machines capables).
 *  - 'lite' : effets coûteux coupés (flous plein écran, backdrop-filter, animations
 *             infinies) — MÊME design/couleurs/layout, mais fluide sur VM / vieux PC.
 *
 * Le palier effectif découle d'une préférence persistée (réglages) :
 *  - 'auto' (défaut) : démarre en 'full' (ou 'lite' si prefers-reduced-motion /
 *    machine extrêmement faible), puis un moniteur FPS rétrograde en 'lite' si le
 *    site rame durablement.
 *  - 'full' / 'lite' : forçage manuel.
 *
 * Reflété sur `<html data-perf>` → pilote les dégradations CSS (index.css) et,
 * via MotionProvider, le `reducedMotion` global de framer-motion. Exposé à React
 * par useSyncExternalStore (cf. hooks/usePerf).
 */

export type PerfTier = 'full' | 'lite';
export type PerfPref = 'auto' | 'full' | 'lite';

const PREF_KEY = 'league.perf';

const canUseDOM = typeof window !== 'undefined' && typeof document !== 'undefined';

function prefersReducedMotion(): boolean {
  if (!canUseDOM || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function readPref(): PerfPref {
  if (!canUseDOM) return 'auto';
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === 'full' || v === 'lite' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Heuristique de palier initial (synchrone, sans coût). Volontairement
 * conservatrice : on ne rétrograde d'emblée QUE sur signal explicite
 * (prefers-reduced-motion) ou machine extrêmement faible (1 cœur / ≤1 Go). Tout
 * le reste démarre en 'full' — le moniteur FPS rétrogradera s'il rame VRAIMENT,
 * pour ne jamais sacrifier les graphismes d'une machine capable.
 */
function detectInitialTier(): PerfTier {
  if (prefersReducedMotion()) return 'lite';
  if (canUseDOM) {
    const cores = navigator.hardwareConcurrency || 0;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0;
    if (cores === 1) return 'lite';
    if (mem && mem <= 1) return 'lite';
  }
  return 'full';
}

let pref: PerfPref = readPref();
let autoTier: PerfTier = detectInitialTier();
const listeners = new Set<() => void>();

function effectiveTier(): PerfTier {
  return pref === 'auto' ? autoTier : pref;
}

let appliedTier: PerfTier | null = null;
function apply(): void {
  const tier = effectiveTier();
  if (canUseDOM) document.documentElement.dataset.perf = tier;
  if (tier === appliedTier) return;
  appliedTier = tier;
  for (const l of listeners) l();
}

export function getPerfTier(): PerfTier {
  return effectiveTier();
}

export function getPerfPref(): PerfPref {
  return pref;
}

export function setPerfPref(next: PerfPref): void {
  if (next === pref) return;
  pref = next;
  try {
    if (next === 'auto') localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, next);
  } catch {
    /* stockage indisponible : on garde la valeur en mémoire */
  }
  apply();
  // Repasser en 'auto' relance la surveillance FPS si on était capable.
  if (next === 'auto' && effectiveTier() === 'full') startPerfMonitor();
}

export function subscribePerf(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Pose `data-perf` avant le premier rendu (à appeler tôt dans main.tsx). */
export function initPerf(): void {
  if (canUseDOM) document.documentElement.dataset.perf = effectiveTier();
  appliedTier = effectiveTier();
}

// ─── Moniteur FPS ────────────────────────────────────────────────────────────
// Mesure la cadence rAF (proxy fiable du jank : une frame lâchée allonge le delta).
// Rétrograde 'full' → 'lite' après plusieurs secondes CONSÉCUTIVES sous le seuil.
// Latch : aucune re-promotion automatique (évite l'oscillation visuelle). Ne
// tourne qu'en préférence 'auto' tant qu'on est en 'full'.

const FPS_FLOOR = 24; // sous ce FPS moyen = jank franc (jamais atteint par un écran sain, même 30 Hz)
const BAD_WINDOWS_TO_DEMOTE = 3; // secondes mauvaises consécutives avant rétrogradation
const WINDOW_MS = 1000;
const WARMUP_MS = 1500; // ignore le jank de démarrage / 1ère navigation
const STALE_GAP_MS = 2000; // fenêtre trop longue = onglet masqué/throttlé → invalide

let monitoring = false;

export function startPerfMonitor(): void {
  if (monitoring) return;
  if (!canUseDOM || typeof requestAnimationFrame !== 'function') return;
  if (pref !== 'auto' || effectiveTier() !== 'full') return;

  monitoring = true;
  let frames = 0;
  let windowStart = 0;
  let started = 0;
  let badWindows = 0;

  const tick = (t: number) => {
    if (!monitoring) return;
    if (started === 0) {
      started = t;
      windowStart = t;
    }
    frames++;
    const elapsed = t - windowStart;
    if (elapsed >= WINDOW_MS) {
      const fps = (frames * 1000) / elapsed;
      const stale = elapsed > STALE_GAP_MS; // boucle suspendue (onglet masqué) → on ne juge pas
      frames = 0;
      windowStart = t;
      if (!stale && t - started > WARMUP_MS && document.visibilityState === 'visible') {
        if (fps < FPS_FLOOR) {
          badWindows++;
          if (badWindows >= BAD_WINDOWS_TO_DEMOTE) {
            monitoring = false;
            autoTier = 'lite';
            apply();
            return;
          }
        } else {
          badWindows = 0; // il faut des secondes CONSÉCUTIVES sous le seuil
        }
      } else {
        badWindows = 0;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
