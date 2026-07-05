import { useSyncExternalStore } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Préférence « cinématiques automatiques » — laisse l'utilisateur couper les
// overlays plein écran qui se déclenchent SANS action de sa part (level-up,
// récompense de palier, rage de contestation, réaction meme). Les cinématiques
// liées à une action directe (claim du passe, duel lancé…) et le narguage
// post-défaite (c'est le jeu 😈) ne sont pas concernés.
// ─────────────────────────────────────────────────────────────────────────────

const LS_KEY = 'league.autoCinematics';
const listeners = new Set<() => void>();

export function autoCinematicsEnabled(): boolean {
  try {
    return localStorage.getItem(LS_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setAutoCinematics(on: boolean): void {
  try {
    localStorage.setItem(LS_KEY, on ? '1' : '0');
  } catch {
    /* stockage indisponible : la préférence ne persiste pas */
  }
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Version réactive pour les composants (Réglages, overlays gués au rendu). */
export function useAutoCinematics(): boolean {
  return useSyncExternalStore(subscribe, autoCinematicsEnabled, autoCinematicsEnabled);
}
