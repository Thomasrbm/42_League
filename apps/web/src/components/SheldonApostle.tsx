import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
/* ─────────────────────────────────────────────────────────────────────────
 * « Apôtre de Sheldon » — effet cosmétique du titre boutique homonyme.
 *
 * Quand un joueur porte ce titre, la carte profil vire au vert toxique :
 * la bordure pulse en vert néon, un voile bio-luminescent recouvre le fond,
 * des particules vertes montent lentement, et un badge « VENDU » trahit
 * l'allégeance totale à la mascotte.
 *
 * Toujours rendu nul hors Apôtre → coût zéro sur les profils normaux.
 * ──────────────────────────────────────────────────────────────────────── */

export const SHELDON_COLORS = {
  slime:   '#39ff14', // vert néon / toxique
  bile:    '#76b900', // vert foncé organique
  murk:    '#1e3a1e', // fond brun-vert sombre
  glow:    '#00ff41', // glow matrix vert électrique
  spore:   '#b8ff8a', // particule claire
} as const;

/** Détecte si le titre d'un joueur signale l'allégeance à Sheldon. */
export function isSheldonTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .includes('sheldon');
}

/** Une spore : position, taille, timing (pseudo-aléatoire déterministe). */
interface Spore {
  left: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
}

function makeSpores(count: number): Spore[] {
  return Array.from({ length: count }, (_, i) => {
    const r = (n: number) => ((Math.sin(i * 17.443 + n * 61.987) * 53219.8371) % 1 + 1) % 1;
    return {
      left: 3 + r(1) * 94,
      size: 1.5 + r(2) * 3,
      duration: 3.8 + r(3) * 3.4,
      delay: r(4) * 4.5,
      drift: (r(5) - 0.5) * 28,
    };
  });
}

/**
 * Aura toxique à poser en overlay sur la carte de profil.
 * Doit être enfant direct d'un conteneur `relative overflow-hidden`.
 */
export function SheldonApostleAura({
  active,
  count = 12,
  className = '',
}: {
  active: boolean;
  count?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const spores = useMemo(() => makeSpores(count), [count]);
  if (!active) return null;

  return (
    <div aria-hidden className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>

      {/* Voile bio-luminescent : recolore le fond en vert vaseux. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(130% 90% at 50% 110%, ${SHELDON_COLORS.slime}45 0%, ${SHELDON_COLORS.bile}2e 30%, transparent 65%),` +
            `linear-gradient(180deg, ${SHELDON_COLORS.bile}18 0%, transparent 40%)`,
          mixBlendMode: 'screen',
        }}
      />

      {/* Halo verdâtre central qui respire lentement — ambiance sous-marine. */}
      <motion.div
        className="absolute left-1/2 top-[44%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full gpu"
        style={{
          background: `radial-gradient(circle, ${SHELDON_COLORS.bile}55 0%, ${SHELDON_COLORS.slime}1a 50%, transparent 72%)`,
          filter: 'blur(36px)',
        }}
        animate={reduced ? undefined : { scale: [1, 1.14, 1], opacity: [0.45, 0.75, 0.45] }}
        transition={{ duration: 4.8, ease: 'easeInOut', repeat: Infinity }}
      />

      {/* Nappe toxique au bas de la carte (émanation de Sheldon). */}
      <div
        className={`absolute inset-x-0 bottom-0 h-20 ${reduced ? '' : 'sheldon-ooze'}`}
        style={{
          background: `linear-gradient(0deg, ${SHELDON_COLORS.bile}6a 0%, ${SHELDON_COLORS.slime}2e 40%, transparent 100%)`,
          maskImage: 'linear-gradient(0deg, #000 0%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(0deg, #000 0%, transparent 100%)',
        }}
      />

      {/* Spores ascendantes (coupées sous reduced-motion). */}
      {!reduced &&
        spores.map((s, i) => (
          <span
            key={i}
            className="absolute bottom-1 rounded-full sheldon-spore gpu"
            style={{
              left: `${s.left}%`,
              width: s.size,
              height: s.size,
              background: SHELDON_COLORS.spore,
              boxShadow: `0 0 5px 1px ${SHELDON_COLORS.slime}cc, 0 0 9px 2px ${SHELDON_COLORS.bile}88`,
              ['--spore-drift' as string]: `${s.drift}px`,
              animationDuration: `${s.duration}s`,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}

      {/* Bordure toxique pulsante. */}
      <motion.div
        className="absolute inset-0 rounded-[inherit]"
        style={{ boxShadow: `inset 0 0 0 1.5px ${SHELDON_COLORS.slime}bb, inset 0 0 20px -4px ${SHELDON_COLORS.bile}` }}
        animate={reduced ? undefined : { opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2.8, ease: 'easeInOut', repeat: Infinity }}
      />
    </div>
  );
}

