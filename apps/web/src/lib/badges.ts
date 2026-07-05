import { Crown, ShieldCheck, FlaskConical, Trophy, Award, Star, type LucideIcon } from 'lucide-react';

export interface BadgeDef {
  label: string;
  description: string;
  /** Couleur d'accent (hex) — pilote le rendu + l'animation. */
  color: string;
  icon: LucideIcon;
  /** Comment l'obtenir (affiché dans l'infobulle de profil). */
  obtain?: string;
  /** Badge UNIQUE (un seul porteur / non débloquable) plutôt qu'obtenable. */
  unique?: boolean;
}

/**
 * Catalogue des badges, façon « badges intra 42 ».
 * Les codes sont émis par le backend (badgesFor) ; le front résout ici le
 * libellé, la couleur et l'icône.
 */
export const BADGE_CATALOG: Record<string, BadgeDef> = {
  goat: {
    label: 'G.O.A.T',
    description: 'N°1 du classement G.O.A.T — le meilleur joueur de tous les temps de sa discipline.',
    color: '#ffd24a',
    icon: Star,
    obtain: 'Termine n°1 du classement G.O.A.T (all-time) de ta discipline. Un seul porteur par jeu.',
    unique: true,
  },
  founder: {
    label: 'Founder',
    description: "À l'origine de One League — du premier commit au déploiement.",
    color: '#ffc94a',
    icon: Crown,
    obtain: 'Réservé aux fondateurs de One League. Inattribuable.',
    unique: true,
  },
  admin: {
    label: 'Admin',
    description: 'Administrateur — modération et organisation.',
    color: '#5fb4ff',
    icon: ShieldCheck,
    obtain: 'Octroyé aux membres de l’équipe d’administration.',
  },
  beta_tester: {
    label: 'Beta Tester',
    description: 'Présent·e dès la saison bêta de One League.',
    color: '#3fd6c0',
    icon: FlaskConical,
    obtain: 'Décerné à celles et ceux présents dès la bêta. Non rétro-attribuable.',
  },
  season_champion: {
    label: 'Champion',
    description: "Vainqueur du classement d'une saison.",
    color: '#ffc94a',
    icon: Trophy,
    obtain: 'Termine n°1 du classement à la fin d’une saison.',
  },
};

/** Définition d'un badge inconnu (fallback) pour ne jamais planter le rendu. */
export function badgeDef(code: string): BadgeDef {
  return (
    BADGE_CATALOG[code] ?? {
      label: code,
      description: 'Badge.',
      color: '#a9b6c9',
      icon: Award,
      obtain: 'Badge disponible en boutique ou attribué par un admin.',
    }
  );
}
