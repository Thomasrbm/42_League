/**
 * Déclencheurs globaux des cinématiques du PASSE DE COMBAT.
 *
 * Deux stores hors-React indépendants, sur le même patron que `lib/rankUp.ts` :
 *  - `levelUp`  : le niveau du joueur augmente (détection par comparaison de
 *                 `me.level` dans LevelUpOverlay, qui s'abonne ici).
 *  - `reward`   : un (des) palier(s) de passe vient d'être accordé — déclenché
 *                 par l'event SSE `battlepass:tier` (payload.tiers), consommé
 *                 par RewardUnlockOverlay.
 *
 * Les overlays sont montés en permanence dans l'AppShell et s'abonnent via
 * `useSyncExternalStore`.
 */
import type { BattlePassTierView } from './api';

// ─── Level-up ────────────────────────────────────────────────────────────────

export interface LevelUp {
  /** Nouveau niveau atteint. */
  level: number;
  /** Identifiant unique pour re-déclencher même avec un niveau identique. */
  nonce: number;
}

let currentLevelUp: LevelUp | null = null;
const levelUpListeners = new Set<() => void>();

export function getLevelUp(): LevelUp | null {
  return currentLevelUp;
}

export function triggerLevelUp(level: number): void {
  currentLevelUp = { level, nonce: Date.now() + Math.random() };
  for (const l of levelUpListeners) l();
}

export function clearLevelUp(): void {
  if (currentLevelUp === null) return;
  currentLevelUp = null;
  for (const l of levelUpListeners) l();
}

export function subscribeLevelUp(cb: () => void): () => void {
  levelUpListeners.add(cb);
  return () => {
    levelUpListeners.delete(cb);
  };
}

// ─── Récompense de palier débloquée ────────────────────────────────────────────

/** Sous-ensemble d'un palier suffisant pour révéler sa récompense. */
export type RewardTier = Pick<
  BattlePassTierView,
  'tier' | 'rewardKind' | 'item' | 'coins' | 'consumableKind'
>;

export interface RewardUnlock {
  tiers: RewardTier[];
  nonce: number;
}

let currentReward: RewardUnlock | null = null;
const rewardListeners = new Set<() => void>();

export function getRewardUnlock(): RewardUnlock | null {
  return currentReward;
}

export function triggerRewardUnlock(tiers: RewardTier[]): void {
  if (!tiers || tiers.length === 0) return;
  currentReward = { tiers, nonce: Date.now() + Math.random() };
  for (const l of rewardListeners) l();
}

export function clearRewardUnlock(): void {
  if (currentReward === null) return;
  currentReward = null;
  for (const l of rewardListeners) l();
}

export function subscribeRewardUnlock(cb: () => void): () => void {
  rewardListeners.add(cb);
  return () => {
    rewardListeners.delete(cb);
  };
}
