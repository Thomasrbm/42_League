import { useMemo } from 'react';
import { useLeagueData } from '../../../hooks/useLeagueData';
import { useGameMode } from '../../../hooks/useGameMode';
import type { PlayedMatch, PlayedFfa } from '../../../lib/api';

/** Une de mes games 1v1/2v2, enrichie de son impact ELO et win-rate. */
export interface MyMatchStat {
  match: PlayedMatch;
  won: boolean;
  /** Match nul (échecs) — ni victoire ni défaite, hors win-rate. */
  draw: boolean;
  opponent: string;
  /** Second adversaire — présent uniquement en 2v2. */
  opponent2?: string;
  /** Mon partenaire — présent uniquement en 2v2. */
  partner?: string;
  myScore: number;
  oppScore: number;
  /** Variation d'ELO pour moi sur cette game. */
  delta: number;
  counted: boolean;
  /** Win-rate cumulé (%) juste après cette game. */
  wrAfter: number;
  /** Variation du win-rate (points de %) provoquée par cette game (signée). */
  wrImpact: number;
}

/** Ma participation à un FFA Smash (rang + delta). N'entre PAS dans le win-rate. */
export interface MyFfaStat {
  ffa: PlayedFfa;
  myPosition: number;
  myDelta: number;
  total: number;
}

/**
 * Ma participation à une manche de fléchettes (reste + rang + delta).
 * Réutilise le modèle FFA — même forme que MyFfaStat (le champ `ffa` porte
 * la PlayedFfa darts, avec startScore + remaining par participant).
 */
export interface MyDartsStat {
  ffa: PlayedFfa;
  myPosition: number;
  myDelta: number;
  total: number;
}

/** Élément du flux global : un match 1v1/2v2, un FFA OU une manche de fléchettes. */
export type GlobalItem =
  | { kind: 'match'; id: string; playedAt: string; match: PlayedMatch }
  | { kind: 'ffa'; id: string; playedAt: string; ffa: PlayedFfa }
  | { kind: 'darts'; id: string; playedAt: string; ffa: PlayedFfa };

/** Élément de mon flux : ma game 1v1/2v2, ma participation FFA OU fléchettes. */
export type MineItem =
  | { kind: 'match'; id: string; playedAt: string; stat: MyMatchStat }
  | { kind: 'ffa'; id: string; playedAt: string; stat: MyFfaStat }
  | { kind: 'darts'; id: string; playedAt: string; stat: MyDartsStat };

export interface HistoriqueData {
  myLogin: string | undefined;
  /** Toutes les games de la league (matchs + FFA), plus récentes d'abord. */
  global: GlobalItem[];
  /** Mes games (matchs + FFA), plus récentes d'abord. */
  mine: MineItem[];
  refresh: () => Promise<void>;
}

/**
 * Logique de la page Historique — fusionne l'historique des matchs 1v1/2v2 et
 * des FFA Smash dans un même flux trié par date (global et perso). L'impact ELO
 * de chaque game est déjà fourni par l'API ; l'impact sur le win-rate est calculé
 * en rejouant MES matchs dans l'ordre chronologique. Les FFA déplacent l'ELO mais
 * N'ENTRENT PAS dans le calcul du win-rate (ils ont un rang, pas un binaire V/D).
 */
/**
 * @param seasonFilter '' = saison en cours (active), 'all' = tout l'historique,
 *   sinon l'id d'une saison précise. Permet de cloisonner l'historique par saison
 *   (cohérent avec le reset de saison : par défaut on ne voit que la saison en cours).
 */
export function useHistoriqueLogic(seasonFilter: string = ''): HistoriqueData {
  const { matches: allMatches, playedFfas: allFfas, playedDarts: allDarts, me, refresh, activeSeasonId } = useLeagueData();
  const { game } = useGameMode();
  const myLogin = me?.login;

  // Saison effective : '' → saison active ; 'all' → aucune restriction (null) ;
  // sinon la saison demandée. null = on ne filtre pas par saison.
  const seasonId = seasonFilter === '' ? activeSeasonId : seasonFilter === 'all' ? null : seasonFilter;

  // Historique filtré par discipline (mode courant) ET par saison.
  const matches = useMemo(
    () => allMatches.filter((m) => (m.game ?? 'babyfoot') === game && (!seasonId || m.seasonId === seasonId)),
    [allMatches, game, seasonId],
  );
  // Les FFA n'existent qu'en Smash : présents seulement dans ce mode.
  const ffas = useMemo(
    () => allFfas.filter((f) => (f.game ?? 'smash') === game && (!seasonId || f.seasonId === seasonId)),
    [allFfas, game, seasonId],
  );
  // Les manches de fléchettes (game='flechettes') : présentes seulement dans ce mode.
  const darts = useMemo(
    () => allDarts.filter((d) => (d.game ?? 'flechettes') === game && (!seasonId || d.seasonId === seasonId)),
    [allDarts, game, seasonId],
  );

  const global = useMemo<GlobalItem[]>(() => {
    const items: GlobalItem[] = [
      ...matches.map((m) => ({ kind: 'match' as const, id: m.id, playedAt: m.playedAt, match: m })),
      ...ffas.map((f) => ({ kind: 'ffa' as const, id: f.id, playedAt: f.playedAt, ffa: f })),
      ...darts.map((d) => ({ kind: 'darts' as const, id: d.id, playedAt: d.playedAt, ffa: d })),
    ];
    return items.sort((a, b) => +new Date(b.playedAt) - +new Date(a.playedAt));
  }, [matches, ffas, darts]);

  const mine = useMemo<MineItem[]>(() => {
    if (!myLogin) return [];

    // Mes matchs — inclut les slots 1v1 ET les coéquipiers 2v2.
    const asc = matches
      .filter((m) =>
        m.playerALogin === myLogin || m.playerBLogin === myLogin ||
        m.playerA2Login === myLogin || m.playerB2Login === myLogin,
      )
      .sort((a, b) => +new Date(a.playedAt) - +new Date(b.playedAt));

    let wins = 0;
    let decisive = 0; // parties décisives (hors nulles) pour le win-rate cumulé
    const matchItems: MineItem[] = asc.map((m) => {
      // 2v2 : je suis côté A si je suis playerA OU playerA2 (coéquipier A).
      const youAreA = m.playerALogin === myLogin || m.playerA2Login === myLogin;
      const draw = m.winner === 'draw';
      const won = !draw && ((youAreA && m.winner === 'A') || (!youAreA && m.winner === 'B'));
      const wrBefore = decisive === 0 ? 0 : (wins / decisive) * 100;
      // La nulle (échecs) ne compte ni comme victoire ni comme défaite.
      if (!draw) { decisive++; if (won) wins++; }
      const wrAfter = decisive === 0 ? 0 : (wins / decisive) * 100;

      // Delta ELO : slot précis selon ma position dans le match (2v2 aware).
      const delta =
        m.playerALogin === myLogin  ? m.deltaA :
        m.playerA2Login === myLogin ? (m.deltaA2 ?? m.deltaA) :
        m.playerBLogin === myLogin  ? m.deltaB :
                                      (m.deltaB2 ?? m.deltaB);

      // En 2v2 : mon partenaire et les 2 adversaires.
      const partner = m.mode === '2v2'
        ? (youAreA
            ? (m.playerALogin === myLogin ? (m.playerA2Login ?? undefined) : m.playerALogin)
            : (m.playerBLogin === myLogin ? (m.playerB2Login ?? undefined) : m.playerBLogin))
        : undefined;
      const opponent2 = m.mode === '2v2'
        ? (youAreA ? (m.playerB2Login ?? undefined) : (m.playerA2Login ?? undefined))
        : undefined;

      const stat: MyMatchStat = {
        match: m,
        won,
        draw,
        opponent: youAreA ? m.playerBLogin : m.playerALogin,
        opponent2,
        partner,
        myScore: youAreA ? m.scoreA : m.scoreB,
        oppScore: youAreA ? m.scoreB : m.scoreA,
        delta,
        counted: m.countedForElo,
        wrAfter: Math.round(wrAfter),
        wrImpact: wrAfter - wrBefore,
      };
      return { kind: 'match', id: m.id, playedAt: m.playedAt, stat };
    });

    // Mes FFA (hors win-rate) : on extrait ma position + mon delta.
    const ffaItems: MineItem[] = ffas
      .map((f) => {
        const me = f.participants.find((p) => p.login === myLogin);
        if (!me) return null;
        const stat: MyFfaStat = {
          ffa: f,
          myPosition: me.position,
          myDelta: me.delta,
          total: f.participants.length,
        };
        return { kind: 'ffa', id: f.id, playedAt: f.playedAt, stat } as MineItem;
      })
      .filter((x): x is MineItem => x !== null);

    // Mes manches de fléchettes (hors win-rate) : ma position + mon delta.
    const dartsItems: MineItem[] = darts
      .map((d) => {
        const me = d.participants.find((p) => p.login === myLogin);
        if (!me) return null;
        const stat: MyDartsStat = {
          ffa: d,
          myPosition: me.position,
          myDelta: me.delta,
          total: d.participants.length,
        };
        return { kind: 'darts', id: d.id, playedAt: d.playedAt, stat } as MineItem;
      })
      .filter((x): x is MineItem => x !== null);

    return [...matchItems, ...ffaItems, ...dartsItems].sort(
      (a, b) => +new Date(b.playedAt) - +new Date(a.playedAt),
    );
  }, [matches, ffas, darts, myLogin]);

  return { myLogin, global, mine, refresh };
}
