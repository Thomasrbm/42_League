import { EloBoostAura } from './EloBoost';
import { SheldonApostleAura } from './SheldonApostle';
import type { ProfileFxKind } from '../lib/profileFx';

/* ─────────────────────────────────────────────────────────────────────────
 * Overlay d'effet à poser sur une carte de profil.
 *
 * Dispatche vers l'aura du `kind` actif (cf. lib/profileFx.ts). À placer en
 * enfant direct d'un conteneur `relative overflow-hidden rounded-*`. Rend null
 * hors effet → coût zéro sur les cartes normales.
 *
 * Un seul point d'appel remplace désormais les paires
 * `<EloBoostAura/> + <SheldonApostleAura/>` éparpillées dans les cartes.
 * ──────────────────────────────────────────────────────────────────────── */
export function ProfileAura({ kind }: { kind: ProfileFxKind | null }) {
  if (kind === 'sheldon') return <SheldonApostleAura active />;
  if (kind === 'eloBoost') return <EloBoostAura active />;
  return null;
}
