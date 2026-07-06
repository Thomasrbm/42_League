import { lazy, Suspense, type ReactNode } from 'react';
import { DesktopShell } from './DesktopShell';
import { MobileShell } from './MobileShell';
import { ViewportSwitch } from './ViewportSwitch';
import { GameModeSwitch } from '../components/GameModeSwitch';
import { GameBackdrop } from '../components/GameBackdrop';
import { TesterSwitch } from '../components/TesterSwitch';
import { GameOnboarding } from '../components/GameOnboarding';
import { SeasonPalms } from '../components/SeasonPalms';

const NotifBanner        = lazy(() => import('../components/NotifBanner').then(m => ({ default: m.NotifBanner })));
const NewsTicker         = lazy(() => import('../components/NewsTicker').then(m => ({ default: m.NewsTicker })));
const OpsRevealOverlay   = lazy(() => import('../components/OpsRevealOverlay').then(m => ({ default: m.OpsRevealOverlay })));
const AnnouncementPopup  = lazy(() => import('../components/AnnouncementPopup').then(m => ({ default: m.AnnouncementPopup })));
const BetLivePopup       = lazy(() => import('../components/BetLivePopup').then(m => ({ default: m.BetLivePopup })));
const MatchmakingOverlay = lazy(() => import('../components/MatchmakingOverlay').then(m => ({ default: m.MatchmakingOverlay })));
const DuelStrikeOverlay  = lazy(() => import('../components/DuelStrikeOverlay').then(m => ({ default: m.DuelStrikeOverlay })));
const ContestRageOverlay = lazy(() => import('../components/ContestRageOverlay').then(m => ({ default: m.ContestRageOverlay })));
const RankUpOverlay      = lazy(() => import('../components/RankUpOverlay').then(m => ({ default: m.RankUpOverlay })));
const LevelUpOverlay     = lazy(() => import('../components/LevelUpOverlay').then(m => ({ default: m.LevelUpOverlay })));
const RewardUnlockOverlay = lazy(() => import('../components/RewardUnlockOverlay').then(m => ({ default: m.RewardUnlockOverlay })));
const TauntOverlay       = lazy(() => import('../components/TauntOverlay').then(m => ({ default: m.TauntOverlay })));
const XpGainToast        = lazy(() => import('../components/XpGainToast').then(m => ({ default: m.XpGainToast })));
const AppBadge           = lazy(() => import('../components/AppBadge').then(m => ({ default: m.AppBadge })));
const SeasonWelcome      = lazy(() => import('../components/SeasonWelcome').then(m => ({ default: m.SeasonWelcome })));

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
      {/* Palmiers saisonniers en accents de coin — pointer-events-none, ne bloquent rien */}
      <SeasonPalms />
      <Suspense>
        <NotifBanner />
        {/* Bandeau de news défilant, en bas de l'écran sur toutes les pages */}
        <NewsTicker />
        <OpsRevealOverlay />
      </Suspense>
      <GameModeSwitch />
      {/* Bouton « Tester en mode user » (staging + admins) — bas-gauche */}
      <TesterSwitch />
      <GameOnboarding />
      <Suspense>
        {/* Annonces générales (admin) — popup « une seule fois » à la connexion */}
        <AnnouncementPopup />
        {/* Popup « paris en cours » — dès qu'un duel d'ops ou un tournoi est ouvert
            aux paris (data via GET /bets + events SSE ops/tournament) */}
        <BetLivePopup />
        {/* Une SEULE cinématique de changement d'univers : le ballet de tuiles
            (UniverseTransition dans les shells). L'ancien GameTransitionOverlay
            doublait l'animation à chaque switch — retiré. */}
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
        {/* Narguage post-défaite : écran versus puis émote du vainqueur, à la connexion */}
        <TauntOverlay />
        {/* Feedback immédiat des gains d'XP (+N XP + barre du niveau) */}
        <XpGainToast />
        {/* Compteur sur l'icône de la PWA installée (App Badging API) */}
        <AppBadge />
        {/* Splash de bienvenue « Saison Piscine 2026 » — une fois par navigateur */}
        <SeasonWelcome />
      </Suspense>
    </>
  );
}
