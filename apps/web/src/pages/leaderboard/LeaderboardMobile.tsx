import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, LocateFixed } from 'lucide-react';
import { PullToRefresh } from '../../mobile/primitives/PullToRefresh';
import { StaggerList, StaggerItem } from '../../mobile/motion/StaggerList';
import { RankingScopeToggle } from './RankingScopeToggle';
import { CampusScopeToggle, useCampusScope, filterByCampus, hasCampusInfo } from './campusScope';
import { Podium } from './mobile/Podium';
import { PlayerRankCard } from './mobile/PlayerRankCard';
import { LeaderboardScatter, RankingViewToggle, GradesNavButton, type RankingView, type LeaderboardScatterHandle } from './LeaderboardScatter';
import { GoatView } from '../GoatPage';
import { LeaderboardBanner } from '../../components/LeaderboardBanner';
import { TeamLeaderboard } from './TeamLeaderboard';
import { api, type Season, type SeasonStanding, type LeaderboardEntry } from '../../lib/api';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useGameMode } from '../../hooks/useGameMode';
import { useT } from '../../lib/i18n';

type LeaderboardTab = 'personal' | 'teams';

export function LeaderboardMobile() {
  const t = useT();
  const { leaderboard, matches: allMatches, me, allOps, locations, refresh, activeSeasonId } = useLeagueData();
  const { game } = useGameMode();
  const matches = useMemo(
    () => allMatches.filter((m) => (m.game ?? 'babyfoot') === game),
    [allMatches, game],
  );
  // Stats LIVE cloisonnées à la saison active (V/D & win-rate repartent de zéro à
  // chaque saison, comme l'ELO). On garde `matches` complet pour les snapshots de
  // saisons passées. activeSeasonId null → repli sur tout l'historique.
  const liveMatches = useMemo(
    () => (activeSeasonId ? matches.filter((m) => m.seasonId === activeSeasonId) : matches),
    [matches, activeSeasonId],
  );
  const myLogin = me?.login;
  // Cloisonnement par campus (cf. campusScope) : par défaut le joueur ne voit que
  // son campus ; « Inter-campus » (ouvert à tous) lève le filtre.
  const { scope: campusScope, setScope: setCampusScope, myCampus } = useCampusScope();
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<RankingView>('list');

  // Onglets — le classement Équipes n'est disponible qu'en Babyfoot.
  const showTeamsTab = game === 'babyfoot';
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('personal');
  // Réinitialise sur l'onglet personnel si on change de jeu.
  useEffect(() => {
    if (game !== 'babyfoot') setActiveTab('personal');
  }, [game]);

  const tabChoices = [
    { value: 'personal' as LeaderboardTab, label: t('lb.tab.solo') },
    ...(showTeamsTab ? [{ value: 'teams' as LeaderboardTab, label: t('lb.tab.teams') }] : []),
  ];

  // Saison affichée : '' = en cours (live), sinon snapshot d'une saison passée.
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string>('');
  const [standings, setStandings] = useState<SeasonStanding[] | null>(null);
  useEffect(() => {
    api.seasons().then(setSeasons).catch(() => {});
  }, []);
  useEffect(() => {
    if (!seasonId) {
      setStandings(null);
      return;
    }
    let alive = true;
    api.seasonStandings(seasonId, game).then((s) => alive && setStandings(s)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [seasonId, game]);
  const pastSeasons = seasons.filter((s) => !s.isActive);
  const viewingPast = standings !== null;

  // Matchs de la saison affichée. La BETA précède le tagging par seasonId → 0
  // match rattaché : on la détecte ainsi (seasonHasMatches=false) pour masquer la
  // vue G.O.A.T (non recalculable). Nuage + Liste restent disponibles (snapshot).
  const seasonMatches = useMemo(
    () => (standings ? matches.filter((m) => m.seasonId === seasonId) : matches),
    [standings, matches, seasonId],
  );
  const seasonHasMatches = !viewingPast || seasonMatches.length > 0;

  // Photos par login (le snapshot d'une saison ne stocke pas l'imageUrl → on
  // réutilise la photo actuelle du joueur, prise dans le classement courant).
  const imgByLogin = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const u of leaderboard) m.set(u.login, u.imageUrl);
    return m;
  }, [leaderboard]);

  // Classement figé d'une saison passée transformé en entrées « façon live ».
  const pastEntries = useMemo<LeaderboardEntry[]>(() => {
    if (!standings) return [];
    return standings.map((s) => ({
      rank: s.rank,
      login: s.login,
      elo: s.elo,
      imageUrl: imgByLogin.get(s.login) ?? null,
      matchesPlayed: s.wins + s.losses,
      campus: s.campus ?? null,
    }));
  }, [standings, imgByLogin]);

  const winsLossesByLogin = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number }>();
    // Saison passée : V/D figés dans le snapshot.
    if (standings) {
      for (const s of standings) map.set(s.login, { wins: s.wins, losses: s.losses });
      return map;
    }
    for (const u of leaderboard) map.set(u.login, { wins: 0, losses: 0 });
    for (const m of liveMatches) {
      if (m.winner === 'draw') continue; // nulle : ni V ni D
      for (const login of [m.playerALogin, m.playerBLogin]) {
        const cur = map.get(login);
        if (!cur) continue;
        const isA = m.playerALogin === login;
        const won = (isA && m.winner === 'A') || (!isA && m.winner === 'B');
        if (won) cur.wins++;
        else cur.losses++;
      }
    }
    return map;
  }, [standings, leaderboard, liveMatches]);

  // Win rate par login — abscisse du nuage de points.
  const winRates = useMemo(() => {
    const map = new Map<string, number>();
    for (const [login, wl] of winsLossesByLogin) {
      const g = wl.wins + wl.losses;
      map.set(login, g === 0 ? 0 : Math.round((wl.wins / g) * 100));
    }
    return map;
  }, [winsLossesByLogin]);

  // Tri par rang officiel (ELO) — comme la vue desktop. En saison passée, on
  // affiche le classement figé (mêmes composants, photos grisées).
  const sortedLeaderboard = useMemo(() => {
    // Base triée par rang officiel (ELO). En live, seuls les joueurs avec ≥ 1
    // partie cette saison (l'ELO de base 1000 ne suffit pas à figurer au classement).
    const base = viewingPast
      ? [...pastEntries].sort((a, b) => a.rank - b.rank)
      : leaderboard.filter((u) => (u.matchesPlayed ?? 0) > 0).sort((a, b) => a.rank - b.rank);
    // Cloisonnement campus puis re-numérotation contiguë (classement de campus → #1).
    return filterByCampus(base, campusScope, myCampus).map((u, i) => ({ ...u, rank: i + 1 }));
  }, [viewingPast, pastEntries, leaderboard, campusScope, myCampus]);

  // G.O.A.T live : pool complet du campus (cross-saison), pas seulement les classés.
  const goatLiveLeaderboard = useMemo(
    () => filterByCampus(leaderboard, campusScope, myCampus),
    [leaderboard, campusScope, myCampus],
  );

  // Snapshot antérieur au tagging campus affiché en « Mon campus » → on a montré le
  // classement global faute de campus connu : on le signale.
  const campusLegacySnapshot =
    viewingPast && campusScope === 'mine' && !!myCampus && !hasCampusInfo(pastEntries);

  // Top 3 par rang → podium (or / argent / bronze cohérents avec l'ELO).
  const top3 = sortedLeaderboard.slice(0, 3);

  // Win rate des 3 du podium (affiché sous l'ELO, façon tracker esport).
  const podiumStats = useMemo(() => {
    const m = new Map<string, { winRate: number; games: number }>();
    for (const u of top3) {
      const wl = winsLossesByLogin.get(u.login) ?? { wins: 0, losses: 0 };
      const games = wl.wins + wl.losses;
      m.set(u.login, {
        games,
        winRate: games === 0 ? 0 : Math.round((wl.wins / games) * 100),
      });
    }
    return m;
  }, [top3, winsLossesByLogin]);

  // Une seule liste : tout le classement après le podium, filtré par la recherche.
  const normalizedQuery = query.trim().toLowerCase();
  const rest = useMemo(() => {
    const list = sortedLeaderboard.slice(3);
    if (!normalizedQuery) return list;
    return list.filter((u) => u.login.toLowerCase().includes(normalizedQuery));
  }, [sortedLeaderboard, normalizedQuery]);

  const myRank = sortedLeaderboard.find((u) => u.login === myLogin)?.rank;

  // Bouton « Où suis-je ? » : recentre sur le joueur courant dans les 3 vues.
  //  • Liste / G.O.A.T → centre la vue sur #lb-me-row.
  //  • Nuage → commande impérative du nuage (pan/zoom interne).
  // (Plus d'auto-scroll au montage — déclenché à la demande via le bouton.)
  const scatterRef = useRef<LeaderboardScatterHandle>(null);
  const scrollToMe = useCallback(() => {
    if (viewMode === 'graph') {
      scatterRef.current?.locateMe();
      return;
    }
    const el = document.getElementById('lb-me-row');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [viewMode]);

  // Saison BETA en vue G.O.A.T (indisponible) → repli sur la liste.
  useEffect(() => {
    if (viewMode === 'goat' && !seasonHasMatches) setViewMode('list');
  }, [viewMode, seasonHasMatches]);

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="space-y-5">
        {/* Onglets Personnel / Équipes */}
        {showTeamsTab && (
          <RankingScopeToggle
            value={activeTab}
            onChange={setActiveTab}
            choices={tabChoices}
          />
        )}

        {/* ── Transition entre onglets ────────────────────────────────────── */}
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'teams' ? (
            <motion.div
              key="teams"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <TeamLeaderboard
                campusScope={campusScope}
                onCampusScopeChange={setCampusScope}
                myCampus={myCampus}
              />
            </motion.div>
          ) : (
            <motion.div
              key="personal"
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-5"
            >

        {/* Sélecteur de saison (si des saisons passées existent) */}
        {pastSeasons.length > 0 && (
          <div className="flex justify-center pt-1">
            <select
              value={seasonId}
              onChange={(e) => setSeasonId(e.target.value)}
              className="px-3 py-1.5 bg-bg-1 border border-border rounded-lg text-xs font-bold uppercase tracking-wider text-text focus:border-gold outline-none"
            >
              <option value="">{t('lb.season.currentLong')}</option>
              {pastSeasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sélecteur de campus : Mon campus / Inter-campus (cloisonnement) */}
        {myCampus && (
          <div className="px-2">
            <CampusScopeToggle value={campusScope} onChange={setCampusScope} myCampus={myCampus} className="!w-full sm:!w-full" />
          </div>
        )}
        {campusLegacySnapshot && (
          <p className="text-[11px] text-amber-400/80 text-center leading-snug px-2">
            {t('lb.campus.legacyNote')}
          </p>
        )}

        {/* ── Banner GAME — live uniquement, avant même le podium ───────── */}
        {!viewingPast && <LeaderboardBanner />}

        {/* Podium top 3 — uniquement en vue liste (ni nuage, ni G.O.A.T) */}
        {viewMode === 'list' && top3.length > 0 && !normalizedQuery && (
          <Podium top3={top3} statsByLogin={podiumStats} past={viewingPast} />
        )}

        {/* Rappel : il faut ≥ 1 partie pour être classé (live, vue liste). */}
        {!viewingPast && viewMode === 'list' && (
          <p className="text-[11px] text-muted-2/80 text-center leading-snug px-2">
            {t('lb.unranked.note')}
          </p>
        )}

        {/* Barre d'outils : bascule liste / nuage / G.O.A.T + accès Paliers.
            G.O.A.T masqué pour la BETA (pas d'historique de matchs taggé). */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <RankingViewToggle view={viewMode} onChange={setViewMode} showGoat={seasonHasMatches} />
          <GradesNavButton />
        </div>

        {viewMode === 'graph' ? (
          <>
            {myRank && <WhereAmIButton onClick={scrollToMe} label={t('lb.whereAmI')} />}
            <LeaderboardScatter
              ref={scatterRef}
              entries={sortedLeaderboard}
              myLogin={myLogin}
              winRates={winRates}
              className="h-[clamp(320px,70vh,560px)]"
            />
          </>
        ) : viewMode === 'goat' && seasonHasMatches ? (
          <>
            {myRank && <WhereAmIButton onClick={scrollToMe} label={t('lb.whereAmI')} />}
            {viewingPast ? (
              <GoatView leaderboard={sortedLeaderboard} matches={seasonMatches} />
            ) : (
              <GoatView leaderboard={goatLiveLeaderboard} matches={allMatches} />
            )}
          </>
        ) : sortedLeaderboard.length === 0 ? (
          <div className="text-center text-muted-2 py-10 text-sm">
            {viewingPast ? t('lb.snapshot.emptyShort') : t('lb.unranked.empty')}
          </div>
        ) : (
        <>
        {/* Stats globales — live uniquement (sans objet sur un classement figé) */}
        {!viewingPast && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-around py-2 px-3 rounded-2xl card-hud"
          >
            <Stat label={t('lb.stat.players')} value={sortedLeaderboard.length} />
            <div className="w-px h-8 bg-border" />
            <Stat label={t('lb.stat.matches')} value={liveMatches.length} />
            {myRank && (
              <>
                <div className="w-px h-8 bg-border" />
                <Stat label={t('lb.me')} value={`#${myRank}`} tone="teal" />
              </>
            )}
          </motion.div>
        )}

        {/* Bouton « Où suis-je ? » — recentre la liste sur ma carte (hors recherche). */}
        {myRank && !normalizedQuery && (
          <WhereAmIButton onClick={scrollToMe} label={t('lb.whereAmI')} />
        )}

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" strokeWidth={2.5} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('lb.search.placeholder')}
            className="w-full pl-11 pr-10 py-3 bg-bg-1 border border-border rounded-xl text-sm font-medium focus:border-gold focus:shadow-[0_0_16px_rgba(255,201,74,0.18)] outline-none text-text-strong placeholder:text-muted tap-transparent allow-select transition-all"
          />
          {query && (
            <button
              type="button"
              aria-label={t('lb.search.clear')}
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full text-muted hover:text-red hover:bg-red/10 tap-transparent"
            >
              <X className="w-4 h-4" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Liste des joueurs */}
        {rest.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-2">
            {query ? `${t('lb.search.noResult')} "${query}"` : t('lb.search.empty')}
          </div>
        ) : (
          <StaggerList className="space-y-2" stagger={0.03}>
            {rest.map((entry) => {
              const wl = winsLossesByLogin.get(entry.login) ?? { wins: 0, losses: 0 };
              const isMe = entry.login === myLogin;
              // Indicateurs temps réel (Ops, en ligne) : sans objet sur un
              // classement figé d'une saison passée → masqués.
              const targetedBy = viewingPast ? undefined : allOps.find((o) => o.targetLogin === entry.login);
              return (
                <StaggerItem key={entry.login}>
                  <div
                    id={isMe ? 'lb-me-row' : undefined}
                    className="scroll-mt-24 cv-row"
                  >
                    <PlayerRankCard
                      entry={entry}
                      wins={wl.wins}
                      losses={wl.losses}
                      isMe={isMe}
                      targetedBy={targetedBy}
                      host={viewingPast ? undefined : locations.get(entry.login)}
                      past={viewingPast}
                    />
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerList>
        )}
        </>
        )}
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </PullToRefresh>
  );
}

// Bouton « Où suis-je ? » — partagé par les 3 vues (liste / nuage / G.O.A.T).
function WhereAmIButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl border border-gold/30 bg-gold/10 text-gold text-sm font-semibold active:scale-[0.98] transition-transform tap-transparent"
    >
      <LocateFixed className="w-4 h-4" strokeWidth={2.4} />
      {label}
    </button>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'teal';
}) {
  const toneCls = tone === 'teal' ? 'text-gold' : 'text-text-strong';
  return (
    <div className="flex flex-col items-center gap-0.5 flex-1">
      <div className={`font-display text-base font-black tabular-nums leading-none ${toneCls}`}>
        {value}
      </div>
      <div className="text-[9px] text-muted uppercase tracking-[0.16em] font-extrabold leading-none">
        {label}
      </div>
    </div>
  );
}
