import { motion, useReducedMotion } from 'framer-motion';
import { Cog } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { ProfileAura } from './ProfileAura';
import type { ProfileFxState } from '../lib/profileFx';

/* ─────────────────────────────────────────────────────────────────────────
 * Échafaudage partagé des cartes héro de profil.
 *
 * Les cartes héro (profil mobile, fiche Défis, profil desktop) dupliquaient
 * ~80 % de leur structure : conteneur `relative overflow-hidden rounded-*`,
 * fond dégradé recoloré selon l'effet cosmétique (neutre / boost « EN FEU » /
 * Apôtre de Sheldon), bordure + ombre du cadre (cf. lib/profileFx), aura,
 * tuyaux laiton, halo conique animé et grille HUD.
 *
 * Ce composant centralise la triade `fond-ternaire + frame + <ProfileAura/>`
 * et expose en flags les couches déco OPTIONNELLES qui, elles, varient d'une
 * carte à l'autre (shimmer, silhouettes, cog…). Le contenu propre de chaque
 * carte arrive en `children` et est posé en `relative z-10`.
 *
 * Aucune logique d'effet ici : on CONSOMME l'état déjà résolu (`fx`) ; sa
 * dérivation reste dans `useProfileFx`.
 * ──────────────────────────────────────────────────────────────────────── */

/** Famille de dégradé de fond — selon la richesse voulue par chaque carte. */
export type HeroGradient = 'rich' | 'flat';

/**
 * Fonds recolorés selon l'effet, en deux familles :
 *  - `rich` : 5 arrêts (cartes mobile profil + Défis) — relief plus marqué ;
 *  - `flat` : 3 arrêts (carte profil desktop) — plus sobre.
 * Repris VERBATIM des cartes d'origine → aucun changement de rendu.
 */
const BACKGROUNDS: Record<HeroGradient, Record<'sheldon' | 'boost' | 'neutral', string>> = {
  rich: {
    sheldon:
      'linear-gradient(180deg, #0e1e0e 0%, #071007 18%, #050d05 50%, #071007 82%, #0e1e0e 100%)',
    boost:
      'linear-gradient(180deg, #2d1a0e 0%, #1f0f07 18%, #180a05 50%, #1f0f07 82%, #2d1a0e 100%)',
    neutral:
      'linear-gradient(180deg, #2a241c 0%, #1d1914 18%, #15120e 50%, #1d1914 82%, #2a241c 100%)',
  },
  flat: {
    sheldon: 'linear-gradient(180deg, #0e1e0e 0%, #071007 55%, #0a140a 100%)',
    boost: 'linear-gradient(180deg, #2d1a0e 0%, #1a0e07 55%, #22100a 100%)',
    neutral: 'linear-gradient(180deg, #2a241c 0%, #15120e 55%, #1d1914 100%)',
  },
};

/** Cadre doré par défaut (carte sans effet, familles `rich`). */
const FALLBACK_FRAME = {
  border: '1px solid rgba(255, 201, 74, 0.4)',
  boxShadow:
    'inset 0 1px 0 rgba(255, 215, 120, 0.18), inset 0 -1px 0 rgba(0,0,0,0.5), 0 12px 36px -8px rgba(255, 201, 74, 0.22)',
};

/** Réglage du halo conique animé (les cartes divergent sur opacité/durée/flou). */
interface ConicConfig {
  /** Opacité de la couche (0.25 mobile/Défis, 0.20 desktop). */
  opacity?: number;
  /** Durée d'un tour en secondes (30 profil, 40 Défis, 32 desktop). */
  duration?: number;
  /** Flou en px (50 mobile/Défis, 48 desktop). */
  blur?: number;
  /** Couche compositeur permanente (`gpu` + `will-change`). Cartes mobiles. */
  gpu?: boolean;
}

const CONIC_DEFAULT: Required<ConicConfig> = {
  opacity: 0.25,
  duration: 30,
  blur: 50,
  gpu: true,
};

/** Réglage des tuyaux laiton (présence et inset horizontal). */
type BrassConfig =
  | false
  /** `pipes` : filets `brass-pipe` haut + bas (cartes mobile/Défis). */
  | { variant: 'pipes' }
  /** `hairline` : unique liseré dégradé en haut (cartes desktop). */
  | { variant: 'hairline'; inset?: string };

interface HeroCardFrameProps {
  /** Effet cosmétique résolu (cf. useProfileFx). Pilote fond + cadre + aura. */
  fx: ProfileFxState;
  /** Rayon du conteneur (classe Tailwind), ex. `rounded-3xl` / `rounded-2xl`. */
  radius: string;
  /** Famille de dégradé de fond. Défaut `rich`. */
  gradient?: HeroGradient;
  /**
   * Bordure + ombre quand AUCUN effet n'est actif. Deux modes mutuellement
   * exclusifs (la carte choisit le sien) :
   *  - `frameFallback` : `{border, boxShadow}` inline (cartes mobile/Défis) ;
   *  - `neutralBorderClass` : classe Tailwind de bordure (carte desktop, qui
   *    n'utilise PAS `fx.frame` mais des classes `border-*` + un boxShadow à
   *    part), couplée à `neutralBoxShadow`.
   * Quand un effet est actif, `fx.frame` l'emporte toujours (mode `frame`).
   */
  frameFallback?: { border: string; boxShadow: string };
  /** Mode « classe de bordure » : classe Tailwind appliquée hors effet. */
  neutralBorderClass?: string;
  /** Classes de bordure par effet (desktop) — `sheldon`/`boost` quand actif. */
  effectBorderClass?: { sheldon: string; boost: string };
  /** boxShadow inline hors effet (desktop, va de pair avec neutralBorderClass). */
  neutralBoxShadow?: string;
  /** boxShadow inline par effet (desktop) — `sheldon`/`boost` quand actif. */
  effectBoxShadow?: { sheldon: string; boost: string };
  /**
   * Suffixe ajouté à TOUTE ombre (effet ou repli). Sert au fin liseré sombre
   * `, 0 0 0 1px rgba(0,0,0,0.5)` propre à la carte Défis.
   */
  boxShadowSuffix?: string;
  /** Couche bannière (déjà construite par l'appelant : fond + voile). */
  banner?: ReactNode;
  /** Halo conique animé. `false` pour le couper, sinon réglage (défaut activé). */
  conic?: ConicConfig | false;
  /** Tuyaux laiton. Défaut `{ variant: 'pipes' }`. */
  brass?: BrassConfig;
  /** Grille HUD (`hud-grid opacity-50`). Défaut `true`. */
  hudGrid?: boolean;
  /** Shimmer doré (carte Défis uniquement). Défaut `false`. */
  shimmer?: boolean;
  /** Silhouettes de personnages en arrière-plan (carte Défis). Défaut `false`. */
  silhouettes?: boolean;
  /** Rouage tournant en haut à droite (carte Défis). Défaut `false`. */
  cog?: boolean;
  /** Animation d'entrée (cartes mobile/Défis) ; les vues desktop sont statiques. */
  animateIn?: boolean;
  /** className additionnelle sur le conteneur (ex. `mb-6`, `no-select`). */
  className?: string;
  /** Contenu propre de la carte (posé en `relative z-10`). */
  children: ReactNode;
}

/**
 * Conteneur configurable qui rend l'échafaudage commun des cartes héro puis le
 * `children`. Tout ce qui varie d'une carte à l'autre passe en props/flags ;
 * tout ce qui est strictement commun (recoloration, aura, structure) est figé.
 */
export function HeroCardFrame({
  fx,
  radius,
  gradient = 'rich',
  frameFallback,
  neutralBorderClass,
  effectBorderClass,
  neutralBoxShadow,
  effectBoxShadow,
  boxShadowSuffix = '',
  banner,
  conic = {},
  brass = { variant: 'pipes' },
  hudGrid = true,
  shimmer = false,
  silhouettes = false,
  cog = false,
  animateIn = false,
  className = '',
  children,
}: HeroCardFrameProps) {
  const reducedMotion = useReducedMotion();
  const { sheldon, boosted } = fx;
  const effectKey = sheldon ? 'sheldon' : boosted ? 'boost' : 'neutral';

  // Fond recoloré selon l'effet dominant (priorité Sheldon > boost > neutre,
  // alignée sur lib/profileFx).
  const background = BACKGROUNDS[gradient][effectKey];

  // ── Cadre (bordure + ombre) ──────────────────────────────────────────────
  // Deux modèles selon la carte. Mode « classe de bordure » (desktop) : la
  // bordure est une classe Tailwind et l'ombre un inline keyé par effet, SANS
  // passer par fx.frame. Sinon mode « frame » : fx.frame inline (repli fourni).
  const usesBorderClass = neutralBorderClass != null;
  let borderClass = '';
  const frameStyle: CSSProperties = {};

  if (usesBorderClass) {
    borderClass = sheldon
      ? effectBorderClass?.sheldon ?? neutralBorderClass
      : boosted
        ? effectBorderClass?.boost ?? neutralBorderClass
        : neutralBorderClass ?? '';
    const shadow = sheldon
      ? effectBoxShadow?.sheldon
      : boosted
        ? effectBoxShadow?.boost
        : neutralBoxShadow;
    if (shadow != null) frameStyle.boxShadow = shadow + boxShadowSuffix;
  } else {
    const frame = fx.frame ?? frameFallback ?? FALLBACK_FRAME;
    frameStyle.border = frame.border;
    frameStyle.boxShadow = frame.boxShadow + boxShadowSuffix;
  }

  // ── Halo conique animé ────────────────────────────────────────────────────
  const conicCfg: Required<ConicConfig> | null =
    conic === false ? null : { ...CONIC_DEFAULT, ...conic };

  const containerClass =
    `relative overflow-hidden ${radius}` +
    (usesBorderClass ? ` border ${borderClass}` : '') +
    (className ? ` ${className}` : '');

  // Le laiton respecte l'ordre de peinture d'ORIGINE de chaque carte : les tuyaux
  // (cartes mobile/Défis) sont posés AVANT le conic, le filet (cartes desktop)
  // APRÈS → aucun changement de superposition par rapport aux cartes migrées.
  const pipes = brass !== false && brass.variant === 'pipes' && (
    <>
      <div className="absolute top-0 left-3 right-3 h-[2px] brass-pipe rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-3 right-3 h-[2px] brass-pipe rounded-full pointer-events-none" />
    </>
  );
  const hairline = brass !== false && brass.variant === 'hairline' && (
    <div
      className={`absolute top-0 ${brass.inset ?? 'left-3 right-3'} h-px bg-gradient-to-r from-transparent via-gold/55 to-transparent pointer-events-none`}
    />
  );

  // Couches déco communes — identiques quelle que soit l'enveloppe (motion ou
  // statique), donc extraites pour ne pas dupliquer le bloc.
  const decorations = (
    <>
      {/* Aura de l'effet actif (boost ELO ×2 / Apôtre de Sheldon). */}
      <ProfileAura kind={fx.kind} />
      {/* Bannière équipée (fond + voile) — construite par l'appelant. */}
      {banner}
      {/* Tuyaux laiton (avant le conic, cf. cartes mobile/Défis). */}
      {pipes}
      {/* Halo conique animé — coupé sous prefers-reduced-motion (perf + a11y). */}
      {conicCfg && !reducedMotion && (
        <motion.div
          aria-hidden
          className={`absolute inset-0 pointer-events-none${conicCfg.gpu ? ' gpu' : ''}`}
          style={{
            opacity: conicCfg.opacity,
            background:
              'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(255,201,74,0.35) 60deg, transparent 120deg, rgba(192,138,74,0.25) 200deg, transparent 260deg, rgba(255,201,74,0.25) 340deg, transparent 360deg)',
            filter: `blur(${conicCfg.blur}px)`,
            ...(conicCfg.gpu ? { willChange: 'transform' } : null),
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: conicCfg.duration, ease: 'linear', repeat: Infinity }}
        />
      )}
      {/* Filet laiton (après le conic, cf. cartes desktop). */}
      {hairline}
      {/* Shimmer doré (carte Défis). */}
      {shimmer && (
        <div aria-hidden className="absolute inset-0 opacity-25 pointer-events-none shimmer" />
      )}
      {/* Grille HUD très subtile. */}
      {hudGrid && (
        <div aria-hidden className="absolute inset-0 hud-grid opacity-50 pointer-events-none" />
      )}
      {/* Silhouettes de personnages décoratives (gauche/droite, très estompées). */}
      {silhouettes && (
        <>
          <div
            aria-hidden
            className="absolute inset-y-4 left-2 w-20 opacity-[0.06] pointer-events-none flex items-center"
          >
            <Silhouette />
          </div>
          <div
            aria-hidden
            className="absolute inset-y-4 right-2 w-20 opacity-[0.06] pointer-events-none flex items-center"
          >
            <Silhouette />
          </div>
        </>
      )}
      {/* Rouage décoratif en haut à droite (carte Défis). */}
      {cog && !reducedMotion && (
        <Cog
          className="absolute top-3 right-3 w-5 h-5 text-gold/45 animate-gear-spin pointer-events-none"
          strokeWidth={2}
        />
      )}
    </>
  );

  // Enveloppe : animée (cartes mobile/Défis) ou statique (vues desktop).
  if (animateIn) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className={containerClass}
        style={{ background, ...frameStyle }}
      >
        {decorations}
        {children}
      </motion.div>
    );
  }

  return (
    <div className={containerClass} style={{ background, ...frameStyle }}>
      {decorations}
      {children}
    </div>
  );
}

/** Silhouette stylisée d'un personnage (réplique exacte de la carte Défis). */
function Silhouette() {
  return (
    <svg viewBox="0 0 80 100" className="w-full h-full text-gold">
      <ellipse cx="40" cy="22" rx="14" ry="16" fill="currentColor" />
      <path
        d="M40 38 C 20 38 14 60 14 78 L 14 98 L 66 98 L 66 78 C 66 60 60 38 40 38 Z"
        fill="currentColor"
      />
    </svg>
  );
}
