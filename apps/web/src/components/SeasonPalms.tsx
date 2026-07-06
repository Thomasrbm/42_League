import { memo } from 'react';

/**
 * Décor saisonnier « Piscine 2026 » — deux palmiers en accents de coin, présents
 * sur toutes les pages de l'app authentifiée (monté dans AppShell).
 *
 * Contrainte absolue : ne JAMAIS cacher un bouton ni empêcher un clic.
 *  - `pointer-events-none` sur le conteneur ET les images → tout clic traverse,
 *    l'accès à l'UI dessous est garanti quoi qu'il arrive.
 *  - Cantonnés aux coins HAUTS (houppier dans l'angle, tronc le long du bord) :
 *    le centre de l'écran et les zones d'action restent dégagés.
 *  - Taille bornée par clamp() + opacité douce → ornement discret, pas un mur.
 *  - `aria-hidden` : purement décoratif, ignoré des lecteurs d'écran.
 *
 * Les .webp sont same-origin → servis par le cache runtime du SW (pas de
 * précache, cf. vite.config workbox), donc aucun impact sur le premier chargement.
 */
function SeasonPalmsImpl() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden select-none">
      {/* Canopée haut-gauche, tuckée dans l'angle (crown poussé hors-champ en haut
          à gauche) → ne recouvre ni le logo (desktop) ni la salutation (mobile). */}
      <img
        src="/season/palm-left.webp"
        alt=""
        draggable={false}
        decoding="async"
        loading="eager"
        className="pointer-events-none absolute top-0 left-0 h-auto w-[clamp(84px,11vw,168px)] -translate-x-[32%] -translate-y-[42%] opacity-[0.64] drop-shadow-[0_6px_18px_rgba(0,0,0,0.45)]"
      />
      {/* Canopée haut-droite : symétrique. */}
      <img
        src="/season/palm-right.webp"
        alt=""
        draggable={false}
        decoding="async"
        loading="eager"
        className="pointer-events-none absolute top-0 right-0 h-auto w-[clamp(84px,11vw,168px)] translate-x-[32%] -translate-y-[42%] opacity-[0.64] drop-shadow-[0_6px_18px_rgba(0,0,0,0.45)]"
      />
    </div>
  );
}

export const SeasonPalms = memo(SeasonPalmsImpl);
