import { useState, useEffect, memo, type CSSProperties } from 'react';
import { useAvatarRingColor } from '../hooks/useAvatarRing';
import { useProfileFxByLogin } from '../hooks/useProfileFx';

interface AvatarProps {
  login: string;
  imageUrl: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  /** Grise la photo (saisons passées : classement figé, plus "live"). */
  grayscale?: boolean;
  /**
   * Désactive l'anneau de grade (couleur du palier du joueur dans le mode
   * courant). Par défaut l'anneau est affiché dès qu'un grade est connu.
   */
  noRing?: boolean;
  /**
   * Ajoute un reflet diagonal sur le placeholder (sans photo). Le disque uni
   * tourne déjà en 3D sur les podiums, mais sans surface à suivre du regard la
   * rotation se lit mal ; le reflet donne le repère qui manque → la pièce ronde
   * "flippe" comme une photo. Sans effet quand une photo est affichée.
   */
  coin?: boolean;
  /**
   * Anneau cosmétique (boost ELO « EN FEU », Apôtre de Sheldon…) autour de la
   * photo. Activé par défaut → l'effet d'un joueur boosté apparaît sur TOUS ses
   * avatars du site, sans prop à passer. Le mettre à `false` là où la carte
   * porte déjà l'aura complète (évite le double effet) ou sur les pastilles
   * purement décoratives.
   */
  fx?: boolean;
}

const SIZE = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-11 h-11 text-base',
  lg: 'w-16 h-16 text-2xl',
  xl: 'w-24 h-24 text-4xl',
};

/** Épaisseur de l'anneau de grade (px) selon la taille de l'avatar. */
const RING_W = { xs: 2, sm: 2.5, md: 3, lg: 4, xl: 5 };
/** Rayon du halo coloré (px) projeté autour de l'anneau, selon la taille. */
const RING_GLOW = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16 };

/**
 * Construit le rebord « pierre précieuse » d'un avatar à partir de la couleur de
 * grade : un anneau en `conic-gradient` dont les facettes alternent reflets clairs
 * (color-mix vers le blanc) et ombres (vers le noir) pour un rendu métal/gemme qui
 * accroche la lumière, surmonté d'un halo coloré (box-shadow) et d'un éclat
 * spéculaire en haut. Rendu sur un calque absolu débordant (`-inset`) → aucun
 * impact sur la mise en page et non rogné par l'`overflow-hidden` de la photo.
 */
function ringStyle(color: string, glow: number): CSSProperties {
  const light = `color-mix(in srgb, ${color} 35%, #ffffff)`;
  const dark = `color-mix(in srgb, ${color} 72%, #000000)`;
  return {
    background: `conic-gradient(from 125deg, ${color} 0deg, ${light} 55deg, ${color} 120deg, ${dark} 195deg, ${color} 265deg, ${light} 320deg, ${color} 360deg)`,
    // Éclat spéculaire en haut + halo coloré net puis diffus tout autour.
    boxShadow: `inset 0 1px 2px rgba(255,255,255,0.55), 0 0 ${glow}px ${color}, 0 0 ${glow * 2}px ${color}66, 0 2px 6px rgba(0,0,0,0.4)`,
    filter: 'saturate(1.25)',
  };
}

/**
 * Avatar rond — design friendly et coloré, cerclé d'un rebord de grade façon gemme.
 */
export const Avatar = memo(function Avatar({ login, imageUrl, size = 'md', className = '', grayscale = false, coin = false, noRing = false, fx = true }: AvatarProps) {
  // Nombre d'échecs de chargement de la photo. 0 = 1ʳᵉ tentative, 1 = réessai
  // anti-cache, 2 = on abandonne et on affiche l'initiale. Le réessai garantit
  // qu'une réponse cassée servie par un cache (SW opaque empoisonné, hoquet CDN)
  // ne fait pas disparaître la pp : on retente une fois via une URL différente,
  // qui force un fetch réseau frais en contournant tout cache indexé par URL.
  const [errCount, setErrCount] = useState(0);
  // Réinitialise dès que la photo change (réutilisation d'un composant monté).
  useEffect(() => setErrCount(0), [imageUrl]);
  const broken = errCount >= 2;
  const showImg = imageUrl && !broken;
  // Au réessai, suffixe anti-cache → URL distincte → contourne le cache cassé.
  const imgSrc = imageUrl
    ? errCount > 0
      ? `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}_r=${errCount}`
      : imageUrl
    : '';
  const initial = (login[0] ?? '?').toUpperCase();
  // Reflet diagonal posé sur le placeholder pour rendre la rotation 3D lisible.
  const sheen = coin && !showImg
    ? 'linear-gradient(115deg, rgba(255,255,255,0) 36%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0) 64%), '
    : '';

  // Anneau de grade (couleur du palier du joueur dans le mode courant). Désactivé
  // en grayscale (saisons figées) ou via `noRing`.
  const ringColor = useAvatarRingColor(login);
  const ring = !noRing && !grayscale ? ringColor : null;
  const ringW = RING_W[size];

  // Anneau cosmétique (boost ELO, Apôtre de Sheldon…) — résolu via le lookup
  // central par login : aucun prop à passer, l'effet suit le joueur partout.
  // Coupé en grayscale (saisons figées) et opt-out via `fx={false}`.
  const cosmetic = useProfileFxByLogin(login);
  const showFx = fx && !grayscale && cosmetic.active && cosmetic.color;

  return (
    <div
      className={`relative flex-shrink-0 rounded-full flex items-center justify-center font-display font-bold uppercase ${SIZE[size]} ${grayscale ? 'grayscale opacity-80' : ''} ${className}`}
    >
      {ring && (
        <div
          aria-hidden
          className="avatar-grade-ring absolute rounded-full pointer-events-none"
          style={{ inset: -ringW, ...ringStyle(ring, RING_GLOW[size]) }}
        />
      )}
      {/* Anneau cosmétique posé JUSTE au-delà de l'anneau de grade : un halo
          coloré pulsant qui signale l'effet du joueur (cf. .profile-fx-ring). */}
      {showFx && (
        <div
          aria-hidden
          className="absolute rounded-full pointer-events-none profile-fx-ring"
          style={{ inset: -(ringW + 2), ['--fx' as string]: cosmetic.color }}
        />
      )}
      <div
        className="relative w-full h-full rounded-full overflow-hidden flex items-center justify-center"
        style={{
          background: `${sheen}linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)`,
          // Liseré interne sombre pour détacher nettement la gemme de la photo
          // (sinon le rebord et l'image se fondent). Sans anneau : ombre portée douce.
          boxShadow: ring
            ? 'inset 0 0 0 1px rgba(0,0,0,0.45), inset 0 1px 2px rgba(0,0,0,0.3)'
            : '0 2px 10px rgba(255, 154, 158, 0.3)',
          color: '#fff',
        }}
      >
        {showImg ? (
          <img
            src={imgSrc}
            alt={login}
            className="w-full h-full object-cover block"
            loading="lazy"
            decoding="async"
            onError={() => setErrCount((n) => n + 1)}
          />
        ) : (
          <span className="relative z-10">{initial}</span>
        )}
      </div>
    </div>
  );
});

export interface UserBadgeProps extends AvatarProps {
  firstName?: string | null;
  lastName?: string | null;
  /** Force l'affichage du username (ex: pour la recherche) */
  showUsername?: boolean;
  /** Masque le texte et n'affiche que l'avatar */
  avatarOnly?: boolean;
}

/**
 * Composant universel pour afficher un utilisateur.
 * Affiche par défaut "Prénom Nom" si disponible, sinon le username.
 */
export const UserBadge = memo(function UserBadge({ firstName, lastName, showUsername, avatarOnly, ...avatarProps }: UserBadgeProps) {
  const displayName = firstName && lastName && !showUsername 
    ? `${firstName} ${lastName}` 
    : avatarProps.login;

  if (avatarOnly) {
    return <Avatar {...avatarProps} />;
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar {...avatarProps} />
      <div className="flex flex-col">
        <span className="font-bold text-text-strong leading-tight">{displayName}</span>
        {firstName && lastName && !showUsername && (
          <span className="text-[10px] text-muted-2 leading-tight">@{avatarProps.login}</span>
        )}
      </div>
    </div>
  );
});
