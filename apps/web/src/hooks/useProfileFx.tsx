import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  resolveProfileFx,
  isSheldonTitle,
  type ProfileFxSource,
  type ProfileFxState,
} from '../lib/profileFx';
import { useLeagueData } from './useLeagueData';

/* ─────────────────────────────────────────────────────────────────────────
 * Hooks d'accès aux effets cosmétiques de profil (cf. lib/profileFx.ts).
 *
 * Deux portes d'entrée :
 *   - useProfileFx(source)        → effet d'un joueur dont on a l'objet complet
 *                                   (grosses cartes : profil, défis, survol…).
 *   - useProfileFxByLogin(login)  → effet d'un joueur connu par son seul login
 *                                   (anneau d'avatar PARTOUT, zéro prop-drilling).
 *
 * Perf : pas d'intervalle. Le seul état temporel (le boost expire) est géré par
 * UN `setTimeout` posé à l'échéance — coût nul pour les 99 % de joueurs non
 * boostés (la grande majorité des avatars du site).
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * `true` tant que `until` est dans le futur. Bascule à `false` via un unique
 * `setTimeout` armé à l'échéance — aucun polling, aucun re-render périodique.
 * Pour les joueurs non boostés (`until` nul/passé) : ne programme rien.
 */
export function useBoostActive(until: string | null | undefined): boolean {
  const target = until ? new Date(until).getTime() : 0;
  const [active, setActive] = useState(() => target > Date.now());

  useEffect(() => {
    const ms = target - Date.now();
    if (ms <= 0) {
      setActive(false);
      return;
    }
    setActive(true);
    const id = window.setTimeout(() => setActive(false), ms);
    return () => window.clearTimeout(id);
  }, [target]);

  return active;
}

/** Effet cosmétique d'un joueur à partir de son objet (title + eloMultUntil). */
export function useProfileFx(source: ProfileFxSource | null | undefined): ProfileFxState {
  const sheldon = isSheldonTitle(source?.title);
  const boosted = useBoostActive(source?.eloMultUntil);
  return useMemo(() => resolveProfileFx({ sheldon, boosted }), [sheldon, boosted]);
}

// ── Lookup central par login (miroir d'AvatarRingProvider) ──────────────────

type FxLookup = (login: string) => ProfileFxSource | null;

const ProfileFxContext = createContext<FxLookup>(() => null);

/**
 * Construit la table `login → {title, eloMultUntil}` depuis les données déjà
 * chargées (classement + soi-même) et la partage à tous les `Avatar`. Hors
 * provider (pages publiques), la table est vide → avatars sans effet, aucun
 * couplage dur.
 */
export function ProfileFxProvider({ children }: { children: ReactNode }) {
  const { me, leaderboard } = useLeagueData();

  const byLogin = useMemo(() => {
    const m = new Map<string, ProfileFxSource>();
    for (const e of leaderboard) {
      if (e.title || e.eloMultUntil) m.set(e.login, { title: e.title, eloMultUntil: e.eloMultUntil });
    }
    // `me` peut ne pas figurer au classement du mode courant (autre discipline) :
    // on garantit que mon propre effet s'affiche sur tous mes avatars.
    if (me?.user) {
      const u = me.user;
      if (u.title || u.eloMultUntil) m.set(u.login, { title: u.title, eloMultUntil: u.eloMultUntil });
    }
    return m;
  }, [leaderboard, me]);

  const lookup = useMemo<FxLookup>(() => (login) => byLogin.get(login) ?? null, [byLogin]);

  return <ProfileFxContext.Provider value={lookup}>{children}</ProfileFxContext.Provider>;
}

/** Effet cosmétique d'un joueur connu par son login (anneau d'avatar). */
export function useProfileFxByLogin(login: string): ProfileFxState {
  const source = useContext(ProfileFxContext)(login);
  // Cas ultra-majoritaire (joueur sans effet) : `source` nul → `useProfileFx`
  // renvoie déjà le singleton NO_FX, sans timer ni allocation.
  return useProfileFx(source);
}
