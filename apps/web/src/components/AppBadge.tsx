import { useEffect } from 'react';
import { useLeagueData } from '../hooks/useLeagueData';

/**
 * Badge d'app (App Badging API) : le compteur « défis reçus + scores à
 * valider » s'affiche sur l'icône de la PWA installée. No-op si l'API n'est
 * pas supportée. Ne rend rien.
 */
export function AppBadge() {
  const { me, pending, challenges } = useLeagueData();
  const myLogin = me?.login ?? null;

  const count =
    pending.filter((p) => p.opponentLogin === myLogin).length +
    challenges.filter(
      (c) =>
        c.status === 'pending' &&
        (c.opponentLogin === myLogin || c.opponentPartnerLogin === myLogin),
    ).length;

  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (typeof nav.setAppBadge !== 'function') return;
    if (count > 0) void nav.setAppBadge(count).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [count]);

  return null;
}
