import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useGameMode } from '../hooks/useGameMode';
import { setTransitionPhase } from '../lib/universeTransition';

/**
 * Cinématique de changement d'univers — « les blocs du HUD se dispersent en 3D,
 * la backdrop 4K + le symbole du jeu se révèlent, puis les blocs se
 * recomposent ». Pilotée par la Web Animations API (et non par du CSS) car :
 *
 *  • La WAAPI surcharge les transforms inline posées par framer-motion sur
 *    beaucoup de blocs (motion.div) — du CSS ne le pourrait pas (l'inline gagne).
 *  • 100 % GPU-composité (transform + opacity), 0 reflow pendant l'anim.
 *  • Auto-nettoyage : à la fin les éléments reviennent à leur état React naturel.
 *
 * La sélection des tuiles est RÉCURSIVE : on descend dans tout conteneur trop
 * grand (ex. le <Panel> qui enveloppe la page) jusqu'à atteindre les vraies
 * cartes / lignes, en ignorant les overlays décoratifs. Donc aucune page n'a
 * besoin d'être taguée : ça marche partout, et les blocs sont bien découpés.
 */

interface UniverseTransitionProps {
  children: ReactNode;
}

// ─── Réglages ────────────────────────────────────────────────────────────────
// Durées volontairement courtes : changer d'univers est une action FRÉQUENTE
// (comparer deux classements) — la transition doit rester sous ~700 ms au total.
const EXIT_DUR = 260;
const ENTER_DUR = 320;
const REVEAL_HOLD = 120; // durée où les blocs sont hors-champ (backdrop exposée)
const MAX_TILES = 42;
const EXIT_EASE = 'cubic-bezier(0.7, 0, 0.84, 0)'; // accélère vers les bords
const ENTER_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'; // décélère, settle premium

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Descend récursivement dans le sous-arbre pour récupérer les « tuiles »
 * animables : on éclate tout conteneur dont la hauteur dépasse ~42 % du viewport
 * (= une section, pas une carte), on garde les éléments plus petits tels quels,
 * et on ignore les overlays décoratifs / marqueurs invisibles.
 */
function collectTiles(container: HTMLElement, vh: number): HTMLElement[] {
  const MAX_H = vh * 0.42;
  const tiles: HTMLElement[] = [];
  const walk = (node: HTMLElement, depth: number) => {
    for (const child of Array.from(node.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (tiles.length >= MAX_TILES) return;
      const rect = child.getBoundingClientRect();
      if (rect.width < 12 || rect.height < 12) continue; // marqueurs / vides
      const cs = getComputedStyle(child);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      // Overlays décoratifs (filigrane, vignette interne…) → ne pas animer.
      if ((cs.position === 'absolute' || cs.position === 'fixed') && cs.pointerEvents === 'none') continue;
      const isTallContainer = rect.height > MAX_H && child.children.length > 0 && depth < 5;
      if (isTallContainer) walk(child, depth + 1);
      else tiles.push(child);
    }
  };
  walk(container, 0);
  return tiles.slice(0, MAX_TILES);
}

interface TileVec {
  el: HTMLElement;
  tx: number;
  ty: number;
  dist: number;
}

export function UniverseTransition({ children }: UniverseTransitionProps) {
  const { game } = useGameMode();
  const prevGameRef = useRef(game);
  const wrapRef = useRef<HTMLDivElement>(null);
  const animsRef = useRef<Animation[]>([]);
  const timersRef = useRef<number[]>([]);
  const tilesRef = useRef<HTMLElement[]>([]);

  const cleanup = () => {
    animsRef.current.forEach((a) => a.cancel());
    animsRef.current = [];
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    tilesRef.current.forEach((el) => {
      el.style.willChange = '';
      el.style.backfaceVisibility = '';
    });
    tilesRef.current = [];
  };

  useLayoutEffect(() => {
    if (prevGameRef.current === game) return;
    prevGameRef.current = game;

    const wrap = wrapRef.current;
    if (!wrap) return;

    cleanup(); // annule une transition précédente non terminée

    // Reduced motion → simple bascule de la backdrop, pas de ballet.
    if (prefersReducedMotion()) {
      setTransitionPhase('reveal');
      timersRef.current.push(window.setTimeout(() => setTransitionPhase('idle'), REVEAL_HOLD));
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tiles = collectTiles(wrap, vh);
    if (tiles.length === 0) {
      setTransitionPhase('reveal');
      timersRef.current.push(window.setTimeout(() => setTransitionPhase('idle'), REVEAL_HOLD));
      return;
    }
    tilesRef.current = tiles;

    // Vecteur radial unitaire (centre écran → centre tuile) + tri éloigné→proche.
    const vecs: TileVec[] = tiles.map((el) => {
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - vw / 2;
      const dy = r.top + r.height / 2 - vh / 2;
      const len = Math.hypot(dx, dy) || 1;
      return {
        el,
        tx: dx / len + Math.sign(dx) * 0.22,
        ty: dy / len + Math.sign(dy) * 0.22,
        dist: len,
      };
    });
    vecs.sort((a, b) => b.dist - a.dist);

    const n = vecs.length;
    const stagger = clamp(Math.round(180 / n), 6, 26);
    const staggerTotal = (n - 1) * stagger;

    const base = 'perspective(1200px) translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale(1)';

    // ── Phase EXIT : chaque tuile fuit vers son bord, pivote en 3D, s'efface ──
    setTransitionPhase('exit');
    vecs.forEach(({ el, tx, ty }, i) => {
      el.style.willChange = 'transform, opacity';
      el.style.backfaceVisibility = 'hidden';
      const exitT =
        `perspective(1200px) translate3d(calc(${tx.toFixed(3)} * 60vw), calc(${ty.toFixed(3)} * 60vh), 200px) ` +
        `rotateY(${(tx * 18).toFixed(1)}deg) rotateX(${(-ty * 18).toFixed(1)}deg) scale(0.72)`;
      const anim = el.animate(
        [
          { transform: base, opacity: 1, offset: 0 },
          { opacity: 1, offset: 0.35 },
          { transform: exitT, opacity: 0, offset: 1 },
        ],
        { duration: EXIT_DUR, delay: i * stagger, easing: EXIT_EASE, fill: 'forwards' },
      );
      animsRef.current.push(anim);
    });

    // ── Orchestration ──
    const revealAt = Math.round(staggerTotal * 0.45 + EXIT_DUR * 0.62);
    const enterAt = revealAt + REVEAL_HOLD;
    const idleAt = enterAt + staggerTotal + ENTER_DUR;

    timersRef.current.push(window.setTimeout(() => setTransitionPhase('reveal'), revealAt));

    timersRef.current.push(
      window.setTimeout(() => {
        setTransitionPhase('enter');
        // ── Phase ENTER : retour depuis l'opposé (en profondeur), settle ──
        // stagger inversé : les tuiles proches du centre se recomposent d'abord.
        const enterAnims: Animation[] = [];
        vecs.forEach(({ el, tx, ty }, i) => {
          const fromT =
            `perspective(1200px) translate3d(calc(${(-tx).toFixed(3)} * 38vw), calc(${(-ty).toFixed(3)} * 38vh), -320px) ` +
            `rotateY(${(-tx * 14).toFixed(1)}deg) rotateX(${(ty * 14).toFixed(1)}deg) scale(0.78)`;
          const enterDelay = (n - 1 - i) * stagger;
          const anim = el.animate(
            [
              { transform: fromT, opacity: 0, offset: 0 },
              { transform: base, opacity: 1, offset: 1 },
            ],
            { duration: ENTER_DUR, delay: enterDelay, easing: ENTER_EASE, fill: 'backwards' },
          );
          enterAnims.push(anim);
        });
        // Les anims d'entrée (créées après) priment ; on libère les exit.
        animsRef.current.forEach((a) => a.cancel());
        animsRef.current = enterAnims;
      }, enterAt),
    );

    timersRef.current.push(
      window.setTimeout(() => {
        setTransitionPhase('idle');
        cleanup();
      }, idleAt),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  useEffect(() => () => {
    cleanup();
    setTransitionPhase('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={wrapRef}>{children}</div>;
}
