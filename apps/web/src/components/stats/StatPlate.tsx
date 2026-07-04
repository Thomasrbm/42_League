import type { ReactNode } from 'react';

/**
 * Atome partagé : plaque d'acier brossé pour UNE statistique (valeur en gros +
 * label majuscule). Unifie les anciens `StatPill` (carte profil mobile) et
 * `StatBlock` (carte héro Défis), pixel-perfect.
 *
 * Le rendu de base (conteneur `metal-plate`, typo de la valeur, label) est
 * strictement identique entre les deux sites. Les seules divergences — la
 * couleur du texte et l'ombre portée — sont exposées en props :
 *  - `tone` choisit la classe de couleur (l'union des tons des deux sites) ;
 *  - `textShadow` est fourni par l'appelant car chaque site calcule son halo
 *    différemment (l'un sur `currentColor`, l'autre par ton) → aucun style figé
 *    ici, donc aucune perte.
 */

/** Union des tons utilisés par les deux cartes héro. */
export type StatPlateTone = 'teal' | 'red' | 'gold' | 'fire' | 'muted';

/**
 * Classe de couleur par ton. `fire` ajoute l'animation de braises (utilisée par
 * la carte Défis) ; sur la carte profil l'appelant passe `gold` pour rester
 * sur le doré fixe sans animation — d'où deux tons distincts plutôt qu'un seul.
 */
const TONE_TEXT: Record<StatPlateTone, string> = {
  teal: 'text-teal',
  red: 'text-red',
  gold: 'text-gold',
  fire: 'text-gold animate-ember',
  muted: 'text-muted-2',
};

interface StatPlateProps {
  label: string;
  value: number | string;
  tone: StatPlateTone;
  /** Ombre portée de la valeur — propre à chaque site (halo doré, rouge…). */
  textShadow: string;
  /** Icône optionnelle devant la valeur (ex. flamme sur une série en feu). */
  icon?: ReactNode;
}

export function StatPlate({ label, value, tone, textShadow, icon }: StatPlateProps) {
  return (
    <div className="relative metal-plate rounded-lg px-1 py-2 flex flex-col items-center gap-0.5">
      <div
        className={`relative z-10 font-display text-base font-black tabular-nums leading-none flex items-center gap-1 ${TONE_TEXT[tone]}`}
        style={{ textShadow }}
      >
        {icon}
        <span>{value}</span>
      </div>
      <div className="relative z-10 text-[9px] text-muted-2 uppercase tracking-[0.16em] font-extrabold leading-none">
        {label}
      </div>
    </div>
  );
}
