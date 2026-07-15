import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useLeagueData } from '../hooks/useLeagueData';
import { useFlash } from '../hooks/useFlash';
import { useViewport } from '../hooks/useViewport';
import { api } from '../lib/api';
import { IS_STAGING } from '../lib/config';
import { getImpersonatorLogin, startImpersonation, stopImpersonation } from '../lib/storage';

// Logins autorisés à la bascule (pas tous les admins) — miroir du backend.
const TESTER_SWITCH_LOGINS = new Set(['throbert', 'jagharra']);

// ─────────────────────────────────────────────────────────────────────────────
// « Tester en mode user » — STAGING, logins throbert/jagharra UNIQUEMENT.
//
// Permet à un admin/superadmin de basculer sur le compte générique `tester`
// (rôle USER) pour vivre l'expérience d'un joueur lambda, puis de revenir à son
// compte. Le token de l'admin est sauvegardé côté client (startImpersonation) ;
// le retour (stopImpersonation) le restaure sans repasser par OAuth.
//
// Le serveur ne délivre QUE le token du compte `tester` dédié, jamais celui d'un
// joueur réel (cf. POST /admin/impersonate-tester) — staging only, fail-secure.
//
// Présentation :
//   - Desktop  → bouton flottant bas-gauche (<TesterSwitch />).
//   - Mobile   → petite icône dans le header, à côté de Réglages
//                (<TesterSwitchMobileIcon />). Le bouton flottant est masqué.
//   - Retour d'impersonation → bannière flottante, quel que soit le viewport.
// ─────────────────────────────────────────────────────────────────────────────

/** Logique partagée entre le bouton flottant (desktop) et l'icône (mobile). */
export function useTesterSwitch() {
  const { me } = useLeagueData();
  const { show } = useFlash();
  const [busy, setBusy] = useState(false);
  // Lu une seule fois au montage : on recharge la page à chaque bascule, donc
  // pas besoin de réactivité sur le localStorage.
  const [impersonator] = useState(() => getImpersonatorLogin());

  // Réservé à ces logins uniquement (pas tous les admins) — miroir du backend.
  const canUseTester = !!me?.login && TESTER_SWITCH_LOGINS.has(me.login.toLowerCase());

  async function switchToTester() {
    setBusy(true);
    try {
      const { token, login } = await api.impersonateTester();
      startImpersonation(token, login);
      // Rechargement complet → tout l'état (session, /me, SSE) repart sur tester.
      window.location.assign('/');
    } catch (err) {
      setBusy(false);
      show(err instanceof Error ? err.message : 'Bascule impossible', 'error');
    }
  }

  // Variante : bascule sur un compte tester FRAÎCHEMENT créé (onboarding à refaire).
  async function switchToFresh() {
    setBusy(true);
    try {
      const { token, login } = await api.impersonateFreshTester();
      startImpersonation(token, login);
      window.location.assign('/');
    } catch (err) {
      setBusy(false);
      show(err instanceof Error ? err.message : 'Création impossible', 'error');
    }
  }

  function returnToSelf() {
    if (stopImpersonation()) {
      window.location.assign('/');
    }
  }

  return {
    busy,
    impersonator,
    /** true ⇒ login autorisé (throbert/jagharra) sur staging peut basculer en mode tester. */
    canSwitch: IS_STAGING && canUseTester,
    switchToTester,
    switchToFresh,
    returnToSelf,
  };
}

/**
 * Bouton flottant bas-gauche (desktop) + bannière de retour (tous viewports).
 * Sur mobile, la bascule vit dans le header (cf. <TesterSwitchMobileIcon />),
 * donc le bouton flottant de bascule est masqué.
 */
export function TesterSwitch() {
  const { isMobile } = useViewport();
  const { busy, impersonator, canSwitch, switchToTester, switchToFresh, returnToSelf } =
    useTesterSwitch();

  // Impersonation en cours → bannière de retour (visible quel que soit le rôle).
  if (impersonator) {
    return (
      <button
        onClick={returnToSelf}
        className="fixed z-[80] bottom-44 sm:bottom-40 left-3 flex items-center gap-2 px-4 py-2.5 rounded-full border border-gold/60 bg-gold/15 glass-strong shadow-lg hover:bg-gold/25 transition-colors animate-pop"
        title={`Revenir au compte ${impersonator}`}
      >
        <span className="text-base">🧪</span>
        <span className="text-start leading-tight">
          <span className="block text-[10px] uppercase tracking-wider text-gold font-bold">
            Mode test (tester)
          </span>
          <span className="block text-xs text-text-strong font-semibold">
            Revenir à {impersonator} →
          </span>
        </span>
      </button>
    );
  }

  // Bouton de bascule : desktop uniquement (sur mobile il vit dans le header).
  if (!canSwitch || isMobile) return null;

  return (
    <div className="fixed z-[80] bottom-44 sm:bottom-40 left-3 flex items-center gap-2">
      <button
        onClick={switchToTester}
        disabled={busy}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-teal/50 bg-teal-deep/20 glass-strong shadow-lg hover:bg-teal-deep/30 transition-colors disabled:opacity-50 animate-pop"
        title="Basculer sur le compte tester (mode utilisateur)"
      >
        <span className="text-base">🧪</span>
        <span className="text-xs font-semibold text-teal">
          {busy ? 'Bascule…' : 'Tester en mode user'}
        </span>
      </button>
      {/* Petit rond : se connecter avec un NOUVEAU compte tester (fraîchement créé). */}
      <button
        onClick={switchToFresh}
        disabled={busy}
        className="flex items-center justify-center w-9 h-9 rounded-full border border-teal/50 bg-teal-deep/20 glass-strong shadow-lg hover:bg-teal-deep/30 transition-colors disabled:opacity-50 animate-pop"
        title="Se connecter avec un nouveau compte tester (fraîchement créé)"
        aria-label="Nouveau compte tester"
      >
        <UserPlus className="w-4 h-4 text-teal" strokeWidth={2.5} />
      </button>
    </div>
  );
}

/**
 * Petite icône tester pour le header mobile, à placer à côté du rouage Réglages.
 * Reprend le « petit bouton » du widget desktop : bascule sur un compte tester
 * FRAÎCHEMENT créé (onboarding à refaire). N'apparaît que pour un admin sur
 * staging hors impersonation.
 */
export function TesterSwitchMobileIcon() {
  const { busy, impersonator, canSwitch, switchToFresh } = useTesterSwitch();

  if (impersonator || !canSwitch) return null;

  return (
    <button
      onClick={switchToFresh}
      disabled={busy}
      aria-label="Nouveau compte tester"
      title="Se connecter avec un nouveau compte tester (fraîchement créé)"
      className="relative flex items-center justify-center w-9 h-9 rounded-full text-teal active:scale-90 active:text-teal transition-transform tap-transparent disabled:opacity-50"
    >
      <UserPlus className="w-[18px] h-[18px]" strokeWidth={2.2} />
    </button>
  );
}
