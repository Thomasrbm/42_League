import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from './shell/AppShell';
import { Toast } from './components/Toast';
import { PageSkeleton } from './mobile/primitives/Skeleton';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuth } from './hooks/useAuth';
import { LeagueDataProvider, useLeagueData } from './hooks/useLeagueData';
import { AvatarRingProvider } from './hooks/useAvatarRing';
import { ProfileFxProvider } from './hooks/useProfileFx';
import { MatchmakingProvider } from './hooks/useMatchmaking';
import { LoginPage } from './pages/LoginPage';
import { AuthReturnPage } from './pages/AuthReturnPage';
import { ConsentGate } from './components/ConsentGate';
import { StagingGate } from './components/StagingGate';
import { IS_STAGING } from './lib/config';
import { SplashScreen } from './components/SplashScreen';
import { AnalyticsTracker } from './components/AnalyticsTracker';

/**
 * Préchargement eager de tous les chunks de routes secondaires.
 * Déclenché après le chargement initial des données → Suspense ne suspend jamais
 * pendant la navigation, ce qui garantit la compatibilité avec AnimatePresence.
 */
function prefetchRouteChunks() {
  void import('./pages/leaderboard');
  void import('./pages/profil');
  void import('./pages/tournois');
  void import('./pages/TropheesPage');
  void import('./pages/HistoriquePage');
  void import('./pages/ReglagesPage');
  void import('./pages/PlayerPage');
  void import('./pages/TournoiDetailPage');
  void import('./pages/team/TeamProfilePage');
  void import('./pages/teams/TeamsPage');
}

// ─── Routes paresseuses ──────────────────────────────────────────────────────
// Code-splitting par page → bundle initial allégé (~50%+).
// Chaque chunk est chargé à la demande au premier accès à la route.
// La pré-loading peut être déclenchée au hover sur la TabBar plus tard.
const DefisPage = lazy(() =>
  import('./pages/defis').then((m) => ({ default: m.DefisPage })),
);
const TournoisPage = lazy(() =>
  import('./pages/tournois').then((m) => ({ default: m.TournoisPage })),
);
const TournoiDetailPage = lazy(() =>
  import('./pages/TournoiDetailPage').then((m) => ({ default: m.TournoiDetailPage })),
);
const CreateTournamentPage = lazy(() =>
  import('./pages/tournois/CreateTournamentPage').then((m) => ({ default: m.CreateTournamentPage })),
);
const LeaderboardPage = lazy(() =>
  import('./pages/leaderboard').then((m) => ({ default: m.LeaderboardPage })),
);
const GoatPage = lazy(() =>
  import('./pages/GoatPage').then((m) => ({ default: m.GoatPage })),
);
const ProfilPage = lazy(() =>
  import('./pages/profil').then((m) => ({ default: m.ProfilPage })),
);
const PlayerPage = lazy(() =>
  import('./pages/PlayerPage').then((m) => ({ default: m.PlayerPage })),
);
const HistoriquePage = lazy(() =>
  import('./pages/HistoriquePage').then((m) => ({ default: m.HistoriquePage })),
);
const ReglagesPage = lazy(() =>
  import('./pages/ReglagesPage').then((m) => ({ default: m.ReglagesPage })),
);
const TropheesPage = lazy(() =>
  import('./pages/TropheesPage').then((m) => ({ default: m.TropheesPage })),
);
const H2HPage = lazy(() =>
  import('./pages/H2HPage').then((m) => ({ default: m.H2HPage })),
);
const TeamProfilePage = lazy(() =>
  import('./pages/team/TeamProfilePage').then((m) => ({ default: m.TeamProfilePage })),
);
const TeamsPage = lazy(() =>
  import('./pages/teams/TeamsPage').then((m) => ({ default: m.TeamsPage })),
);
const ShopPage = lazy(() =>
  import('./pages/ShopPage').then((m) => ({ default: m.ShopPage })),
);
const ShopGODPage = lazy(() =>
  import('./pages/ShopGODPage').then((m) => ({ default: m.ShopGODPage })),
);
const PassePage = lazy(() =>
  import('./pages/passe').then((m) => ({ default: m.PassePage })),
);
const ShopGODUserPage = lazy(() =>
  import('./pages/ShopGODUserPage').then((m) => ({ default: m.ShopGODUserPage })),
);
const ShopGODPlayersPage = lazy(() =>
  import('./pages/ShopGODPage').then((m) => ({ default: m.ShopGODPlayersPage })),
);
const GradesPage = lazy(() =>
  import('./pages/GradesPage').then((m) => ({ default: m.GradesPage })),
);
// Pages secondaires sorties du bundle d'entrée : admin (GOD) + à-propos.
const GODPage = lazy(() =>
  import('./pages/GODPage').then((m) => ({ default: m.GODPage })),
);
const AboutPage = lazy(() =>
  import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })),
);
// Écran TV live (plein écran, hors AppShell : ni nav ni scroll).
const LiveTournamentPage = lazy(() =>
  import('./pages/LiveTournamentPage').then((m) => ({ default: m.LiveTournamentPage })),
);
const SfSessionPage = lazy(() =>
  import('./pages/SfSessionPage').then((m) => ({ default: m.SfSessionPage })),
);

export function App() {
  const { authenticated } = useAuth();

  // Le splash se coupe quand LES DEUX conditions sont vraies :
  //   1. l'animation interne est terminée (onAnimDone)
  //   2. les données de l'app sont chargées (setAppReady)
  // Si non-authentifié → on considère l'app prête immédiatement.
  const [animDone,  setAnimDone]  = useState(false);
  const [appReady,  setAppReady]  = useState(!authenticated); // prêt direct si pas auth
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (animDone && appReady) {
      setShowSplash(false);
    }
  }, [animDone, appReady]);

  // Fallback max 4 s après fin d'animation — évite un splash infini si la
  // requête réseau bloque.
  useEffect(() => {
    if (!animDone) return;
    const t = setTimeout(() => setAppReady(true), 4000);
    return () => clearTimeout(t);
  }, [animDone]);

  return (
    <>
      {/* Cross-dissolve : app invisible pendant le splash, fade-in simultané à l'exit */}
      <motion.div
        className="h-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: showSplash ? 0 : 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <Routes>
          <Route path="/auth/return" element={<AuthReturnPage />} />
          {!authenticated && (
            <Route
              path="/about"
              element={
                <Suspense fallback={<PageSkeleton />}>
                  <AboutPage />
                </Suspense>
              }
            />
          )}
          <Route path="/login" element={authenticated ? <Navigate to="/challenges" replace /> : <LoginPage />} />
          {/* Page session SF — plein écran, publique (pas d'auth requise). */}
          <Route
            path="/sf-session"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <SfSessionPage />
              </Suspense>
            }
          />
          {/* Écran TV live — plein écran, hors AppShell. Authentifié (la TV est connectée). */}
          <Route
            path="/live-tournament/:id?"
            element={
              authenticated ? (
                <Suspense fallback={<PageSkeleton />}>
                  <LiveTournamentPage />
                </Suspense>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="*"
            element={
              authenticated ? (
                <LeagueDataProvider>
                  <AuthenticatedShell onReady={() => setAppReady(true)} />
                </LeagueDataProvider>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Routes>
      </motion.div>
      <AnimatePresence>
        {showSplash && (
          <SplashScreen onComplete={() => setAnimDone(true)} />
        )}
      </AnimatePresence>
    </>
  );
}

function AuthenticatedShell({ onReady }: { onReady?: () => void }) {
  const { loading, error, me, refresh } = useLeagueData();

  // Signal « données prêtes » vers App pour lever le splash.
  // Déclenché une seule fois dès que le premier fetch se termine.
  useEffect(() => {
    if (!loading) onReady?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Précharger tous les chunks de routes en arrière-plan dès que les données sont prêtes.
  // Évite toute suspension Suspense pendant la navigation → transitions AnimatePresence stables.
  useEffect(() => {
    if (loading || me?.consentRequired) return;
    // Décalé en idle : le préchargement (~10 chunks) ne doit pas concurrencer le
    // rendu initial / LCP / interactivité. requestIdleCallback avec fallback
    // setTimeout (Safari < 17).
    const schedule =
      window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = schedule(() => prefetchRouteChunks());
    return () => cancel(id);
  }, [loading, me?.consentRequired]);

  // Barrière de consentement RGPD : tant que l'utilisateur n'a pas consenti, on
  // n'affiche QUE la modale (le serveur refuse de toute façon le reste des données).
  if (!loading && me?.consentRequired) {
    return <ConsentGate login={me.login} onAccepted={() => void refresh()} />;
  }

  // Staging : accès réservé à la liste blanche (cf. STAGING_ALLOWED backend, exposée
  // via me.stagingAllowed). Un login non autorisé voit un écran dédié plutôt que
  // l'app (le backend refuse de toute façon ses données).
  if (!loading && IS_STAGING && me && !me.stagingAllowed) {
    return <StagingGate login={me.login} />;
  }

  return (
    <AvatarRingProvider>
    <ProfileFxProvider>
    <MatchmakingProvider>
      <AnalyticsTracker />
      <AppShell>
        {error && (
          <div className="mb-4 p-3 border border-red/50 bg-red/10 rounded text-red text-sm">
            {error}
          </div>
        )}
        {loading ? (
          <PageSkeleton />
        ) : (
          <ErrorBoundary>
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route path="/" element={<Navigate to="/challenges" replace />} />
                <Route path="/challenges" element={<DefisPage />} />
                <Route path="/tournaments" element={<TournoisPage />} />
                <Route path="/tournaments/create" element={<CreateTournamentPage />} />
                <Route path="/tournaments/:id" element={<TournoiDetailPage />} />
                <Route path="/leaderboard" element={<LeaderboardPage />} />
                <Route path="/goat" element={<GoatPage />} />
                <Route path="/trophies" element={<TropheesPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/profile" element={<ProfilPage />} />
                <Route path="/player/:login" element={<PlayerPage />} />
                <Route path="/team/:teamId" element={<TeamProfilePage />} />
              <Route path="/teams" element={<TeamsPage />} />
                <Route path="/h2h" element={<H2HPage />} />
                <Route path="/shop" element={<ShopPage />} />
                <Route path="/passe" element={<PassePage />} />
                <Route path="/shop-god" element={<ShopGODPage />} />
                <Route path="/shop-god/players" element={<ShopGODPlayersPage />} />
                <Route path="/shop-god/u/:login" element={<ShopGODUserPage />} />
                <Route path="/GOD" element={<GODPage />} />
                {/* Panneau modérateur : même page que /GOD, restreinte aux onglets
                    couverts par les permissions du MODERATOR. */}
                <Route path="/moodo" element={<GODPage moodo />} />
                <Route path="/grades" element={<GradesPage />} />
                <Route path="/history" element={<HistoriquePage />} />
                <Route path="/settings" element={<ReglagesPage />} />
                <Route path="*" element={<Navigate to="/challenges" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        )}
        <Toast />
      </AppShell>
    </MatchmakingProvider>
    </ProfileFxProvider>
    </AvatarRingProvider>
  );
}
