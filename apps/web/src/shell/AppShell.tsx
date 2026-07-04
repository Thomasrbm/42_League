import { lazy, Suspense, type ReactNode } from 'react';
import { DesktopShell } from './DesktopShell';
import { MobileShell } from './MobileShell';
import { ViewportSwitch } from './ViewportSwitch';
import { GameModeSwitch } from '../components/GameModeSwitch';
import { GameBackdrop } from '../components/GameBackdrop';
import { TesterSwitch } from '../components/TesterSwitch';
import { GameOnboarding } from '../components/GameOnboarding';

const NotifBanner        = lazy(() => import('../components/NotifBanner').then(m => ({ default: m.NotifBanner })));
const OpsRevealOverlay   = lazy(() => import('../components/OpsRevealOverlay').then(m => ({ default: m.OpsRevealOverlay })));
const AnnouncementPopup  = lazy(() => import('../components/AnnouncementPopup').then(m => ({ default: m.AnnouncementPopup })));
const GameTransitionOverlay = lazy(() => import('../components/GameTransitionOverlay').then(m => ({ default: m.GameTransitionOverlay })));
const MatchmakingOverlay = lazy(() => import('../components/MatchmakingOverlay').then(m => ({ default: m.MatchmakingOverlay })));
const DuelStrikeOverlay  = lazy(() => import('../components/DuelStrikeOverlay').then(m => ({ default: m.DuelStrikeOverlay })));
const ContestRageOverlay = lazy(() => import('../components/ContestRageOverlay').then(m => ({ default: m.ContestRageOverlay })));
const RankUpOverlay      = lazy(() => import('../components/RankUpOverlay').then(m => ({ default: m.RankUpOverlay })));
const LevelUpOverlay     = lazy(() => import('../components/LevelUpOverlay').then(m => ({ default: m.LevelUpOverlay })));
const RewardUnlockOverlay = lazy(() => import('../components/RewardUnlockOverlay').then(m => ({ default: m.RewardUnlockOverlay })));

interface AppShellProps {
  children: ReactNode;
}

/**
 * Racine du chrome de l'app authentifiée.
 * Choisit Mobile ou Desktop selon le viewport.
 * Le contenu (les <Routes>) est passé en children — il est rendu une seule fois
 * et reçoit le bon wrapper.
 *
 * <NotifBanner> est monté ici (hors du switch viewport) pour flotter au-dessus
 * de n'importe quelle page : duels reçus et scores à valider poppent en temps
 * réel (SSE via useLeagueData) sur toute l'app.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <>
      {/* Décor d'ambiance par univers — derrière tout le contenu */}
      <GameBackdrop />
      <ViewportSwitch
        mobile={<MobileShell>{children}</MobileShell>}
        desktop={<DesktopShell>{children}</DesktopShell>}
      />
      <Suspense>
        <NotifBanner />
        <OpsRevealOverlay />
      </Suspense>
      <GameModeSwitch />
      {/* Bouton « Tester en mode user » (staging + admins) — bas-gauche */}
      <TesterSwitch />
      <GameOnboarding />
      <Suspense>
        {/* Annonces générales (admin) — popup « une seule fois » à la connexion */}
        <AnnouncementPopup />
        {/* Overlay cinématique de changement d'univers — pointer-events-none */}
        <GameTransitionOverlay />
        {/* Overlay VERSUS global */}
        <MatchmakingOverlay />
        {/* Réaction « rage » plein écran quand une game est contestée */}
        <ContestRageOverlay />
        {/* Cinématique « coup de foudre → VERSUS » */}
        <DuelStrikeOverlay />
        {/* Cinématique « PASSAGE DE RANG » : l'emblème claque + onde de choc + éclairs */}
        <RankUpOverlay />
        {/* Passe de combat : « niveau supérieur » (hausse de me.level) + « récompense
            débloquée » (event SSE battlepass:tier) */}
        <LevelUpOverlay />
        <RewardUnlockOverlay />
      </Suspense>
    </>
  );
}
