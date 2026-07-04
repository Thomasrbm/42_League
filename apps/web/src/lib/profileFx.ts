/* ─────────────────────────────────────────────────────────────────────────
 * Effets cosmétiques de profil — SOURCE DE VÉRITÉ UNIQUE.
 *
 * Un « effet de profil » est un habillage spécial (aura sur la carte + anneau
 * sur la photo) que portent certains joueurs : boost ELO ×2 « EN FEU », Apôtre
 * de Sheldon, et tout futur cosmétique. Tout part d'ici :
 *
 *   - la DÉTECTION (depuis le `title` et `eloMultUntil` d'un joueur),
 *   - la PRIORITÉ entre effets (un seul s'affiche à la fois),
 *   - la PALETTE partagée (couleur d'anneau d'avatar + cadre de carte).
 *
 * Ajouter un effet = ajouter une entrée à {@link FX} et (au besoin) une aura
 * dans `components/ProfileAura.tsx`. Rien d'autre à toucher : l'anneau d'avatar
 * et le cadre des cartes en héritent automatiquement partout sur le site.
 *
 * Ce module est PUR (aucun React, aucune dépendance UI) → réutilisable côté
 * dérivation, mémoïsation et tests.
 * ──────────────────────────────────────────────────────────────────────── */

/** Effets connus, dans l'ordre où ils sont déclarés (cf. priorité plus bas). */
export type ProfileFxKind = 'sheldon' | 'eloBoost';

/** Champs d'un joueur dont on dérive ses effets (sous-ensemble de n'importe
 *  quelle représentation utilisateur : `me.user`, `LeaderboardEntry`, etc.). */
export interface ProfileFxSource {
  title?: string | null;
  /** Fin de la fenêtre de boost ELO ×2 (ISO). Passé/absent = pas boosté. */
  eloMultUntil?: string | null;
}

/** Cadre d'une carte portant l'effet (à étaler dans le `style` de la carte). */
export interface ProfileFxFrame {
  border: string;
  boxShadow: string;
}

/** Habillage complet d'un effet (mêmes valeurs partagées carte ⇄ avatar). */
interface FxDef {
  /** Couleur dominante : anneau d'avatar + glow. */
  color: string;
  frame: ProfileFxFrame;
}

/* Palettes — alignées sur `components/EloBoost.tsx` (BOOST_COLORS.ember) et
 * `components/SheldonApostle.tsx` (SHELDON_COLORS.slime). Dupliquées ici à
 * dessein : ce module reste pur (pas d'import d'un composant). */
const EMBER = '#ff7a18';
const SLIME = '#39ff14';

/**
 * Registre des effets. L'ORDRE des clés définit la PRIORITÉ d'affichage : le
 * premier effet actif l'emporte (Sheldon > boost ELO — un Apôtre boosté reste
 * vert toxique, comme dans les cartes d'origine).
 */
const FX: Record<ProfileFxKind, FxDef> = {
  sheldon: {
    color: SLIME,
    frame: {
      border: '1px solid rgba(57, 255, 20, 0.6)',
      boxShadow:
        'inset 0 1px 0 rgba(57,255,20,0.18), inset 0 -1px 0 rgba(0,0,0,0.6), 0 12px 48px -6px rgba(57,255,20,0.38)',
    },
  },
  eloBoost: {
    color: EMBER,
    frame: {
      border: '1px solid rgba(255, 120, 30, 0.65)',
      boxShadow:
        'inset 0 1px 0 rgba(255,140,60,0.28), inset 0 -1px 0 rgba(0,0,0,0.6), 0 12px 48px -6px rgba(255,70,10,0.50)',
    },
  },
};

/** Ordre de priorité figé (clés de {@link FX}). */
const FX_PRIORITY = Object.keys(FX) as ProfileFxKind[];

/** État résolu d'un joueur — ce que consomment les composants. */
export interface ProfileFxState {
  /** Un effet est-il actif ? */
  active: boolean;
  /** Effet dominant (le plus prioritaire actif), ou `null`. */
  kind: ProfileFxKind | null;
  sheldon: boolean;
  boosted: boolean;
  /** Couleur de l'anneau d'avatar / glow (null si aucun effet). */
  color: string | null;
  /** Cadre de carte (bordure + ombre) à étaler dans un `style` (null si aucun). */
  frame: ProfileFxFrame | null;
}

/** État « aucun effet » — singleton partagé (évite des allocations inutiles). */
export const NO_FX: ProfileFxState = {
  active: false,
  kind: null,
  sheldon: false,
  boosted: false,
  color: null,
  frame: null,
};

/** Le titre d'un joueur signale-t-il l'allégeance à Sheldon ? */
export function isSheldonTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .includes('sheldon');
}

/**
 * Résout l'état d'effet à partir des booléens déjà calculés (le `boosted`
 * dépend du temps → fourni par un hook, cf. `useProfileFx`). Pur et stable :
 * deux entrées égales renvoient l'effet figé du registre.
 */
export function resolveProfileFx(flags: { sheldon: boolean; boosted: boolean }): ProfileFxState {
  const active = { sheldon: flags.sheldon, eloBoost: flags.boosted };
  const kind = FX_PRIORITY.find((k) => active[k]) ?? null;
  if (!kind) return NO_FX;
  const def = FX[kind];
  return {
    active: true,
    kind,
    sheldon: flags.sheldon,
    boosted: flags.boosted,
    color: def.color,
    frame: def.frame,
  };
}
