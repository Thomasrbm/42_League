/**
 * Métadonnées visuelles par univers (couleur, libellé, logo). Partagé entre le
 * sélecteur d'univers (GameModeSwitch), les pastilles de recherche du matchmaking
 * (MatchmakingButton) et l'overlay VERSUS (logo du mode où l'on a été apparié).
 */
import type { Game } from './gameMode';

export const GAMES: Game[] = ['babyfoot', 'smash', 'chess', 'streetfighter', 'flechettes'];

export interface GameMeta {
  label: string;
  shortLabel: string;
  color: string; // CSS color string (Tailwind ne passe pas en CSS inline)
  borderColor: string;
  bgColor: string;
  glowColor: string;
  // Palette du bouton « Match aléatoire » déclinée à l'identité du mode (dégradé
  // clair→profond, couleur du texte, bordure et glow). Le design du bouton reste
  // le même ; seules les couleurs changent selon l'univers courant.
  button: { from: string; via: string; to: string; text: string; border: string; glow: string };
  // Reçoit `sel` (univers sélectionné) : les logos PNG basculent gris↔couleur ;
  // les SVG l'ignorent et se colorent via `currentColor` sur le parent.
  // `size` (px, défaut 20) permet d'agrandir le logo dans les gros contenants
  // (ex : FAB du sélecteur d'univers) où un PNG à 20px paraît trop petit.
  icon: (sel: boolean, size?: number) => React.ReactElement;
}

export const GAME_META: Record<Game, GameMeta> = {
  babyfoot: {
    label: 'Babyfoot',
    shortLabel: 'Baby',
    color: '#ffbf20',
    borderColor: 'rgba(255,191,32,0.65)',
    bgColor: 'rgba(255,191,32,0.13)',
    glowColor: 'rgba(255,191,32,0.55)',
    button: { from: '#ffe066', via: '#ffb200', to: '#e05e00', text: '#1a0d00', border: 'rgba(255,206,80,0.7)', glow: 'rgba(255,150,20,0.55)' },
    icon: (sel, size = 20) => (
      <img src={sel ? '/coulour-baby.webp' : '/gray-baby.webp'} alt="" width={size} height={size} loading="eager" decoding="async" className="object-contain" aria-hidden />
    ),
  },
  smash: {
    label: 'Smash',
    shortLabel: 'Smash',
    color: '#ff2d55',
    borderColor: 'rgba(255,45,85,0.65)',
    bgColor: 'rgba(255,45,85,0.13)',
    glowColor: 'rgba(255,45,85,0.55)',
    button: { from: '#ff8da4', via: '#ff2d55', to: '#b00c2e', text: '#2a0307', border: 'rgba(255,120,145,0.7)', glow: 'rgba(255,45,85,0.55)' },
    icon: (sel, size = 20) => (
      <img src={sel ? '/smash-color.webp' : '/smash-grey.webp'} alt="" width={size} height={size} loading="eager" decoding="async" className="object-contain" aria-hidden />
    ),
  },
  chess: {
    label: 'Échecs',
    shortLabel: 'Échecs',
    color: '#36e07a',
    borderColor: 'rgba(54,224,122,0.65)',
    bgColor: 'rgba(54,224,122,0.13)',
    glowColor: 'rgba(54,224,122,0.55)',
    button: { from: '#8df5b0', via: '#36e07a', to: '#158a48', text: '#04240e', border: 'rgba(120,240,165,0.7)', glow: 'rgba(54,224,122,0.55)' },
    icon: (sel, size = 20) => (
      <img src={sel ? '/chess.webp' : '/gray-chess.webp'} alt="" width={size} height={size} loading="eager" decoding="async" className="object-contain" aria-hidden />
    ),
  },
  streetfighter: {
    label: 'Street Fighter',
    shortLabel: 'SF',
    color: '#ff6a00',
    borderColor: 'rgba(255,106,0,0.65)',
    bgColor: 'rgba(255,106,0,0.13)',
    glowColor: 'rgba(255,106,0,0.55)',
    button: { from: '#ffb680', via: '#ff6a00', to: '#c23c00', text: '#2a1200', border: 'rgba(255,170,95,0.7)', glow: 'rgba(255,106,0,0.55)' },
    icon: (sel, size = 20) => (
      <img src={sel ? '/sf-color.webp' : '/sf-grey.webp'} alt="" width={size} height={size} loading="eager" decoding="async" className="object-contain" aria-hidden />
    ),
  },
  flechettes: {
    label: 'Fléchettes',
    shortLabel: 'Fléch.',
    color: '#00d8c2',
    borderColor: 'rgba(0,216,194,0.65)',
    bgColor: 'rgba(0,216,194,0.13)',
    glowColor: 'rgba(0,216,194,0.55)',
    button: { from: '#66f2e0', via: '#00d8c2', to: '#00857a', text: '#04241f', border: 'rgba(90,235,215,0.7)', glow: 'rgba(0,216,194,0.55)' },
    icon: (sel, size = 20) => (
      <img src={sel ? '/flechette.webp' : '/gray-flechette.webp'} alt="" width={size} height={size} loading="eager" decoding="async" className="object-contain" aria-hidden />
    ),
  },
};
