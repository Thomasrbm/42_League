import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Crosshair, Settings, ShoppingBag } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { NotificationBell } from '../../components/NotificationBell';
import { TesterSwitchMobileIcon } from '../../components/TesterSwitch';
import { useAuth } from '../../hooks/useAuth';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useOpsStatus } from '../../hooks/useOpsStatus';
import { fmtCountdown } from '../../lib/format';
import { useT } from '../../lib/i18n';
import { haptic } from '../feedback/useHaptic';

/**
 * Titre par route — visible en très gros style "iOS large title".
 * `null` ⇒ on n'affiche que le brand (fallback).
 */
const ROUTE_TITLE: Record<string, string> = {
  '/challenges': 'Défis',
  '/tournaments': 'Tournois',
  '/tournaments/create': 'Nouveau tournoi',
  '/leaderboard': 'Classement',
  '/trophies': 'Trophées',
  '/profile': 'Profil',
  '/history': 'Historique',
  '/settings': 'Réglages',
  '/about': 'Règles',
};

function titleFor(pathname: string): string {
  // Match exact d'abord, sinon préfixe (tournaments/:id → Tournois)
  if (ROUTE_TITLE[pathname]) return ROUTE_TITLE[pathname];
  for (const [route, title] of Object.entries(ROUTE_TITLE)) {
    if (pathname.startsWith(`${route}/`)) return title;
  }
  return 'One League';
}

export function MobileHeader() {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const { me } = useLeagueData();
  const { amTarget, hunter, amHunter, prey, forcedLeftAsHunter } = useOpsStatus();
  const title = titleFor(location.pathname);

  return (
    <header
      className={`sticky top-0 z-40 w-full glass border-b no-select ${
        amTarget ? 'border-red/30' : 'border-gold/20'
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Filet décoratif en bas (effet HUD) — vire au rouge quand on est traqué */}
      <div
        className={`absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent to-transparent pointer-events-none ${
          amTarget ? 'via-red/60 animate-pulse' : 'via-gold/50'
        }`}
      />

      <div className="relative flex items-center gap-3 px-4 h-14">
        {/* Brand compact — plaque dorée mini. Non cliquable sur mobile : la nav
            se fait via la tab bar (cliquer le logo provoquait un saut de mise en
            page persistant en haut des pages). */}
        <div className="flex items-center gap-1.5">
          <img src="/mini-96.webp" alt="42L" width={28} height={28} className="w-7 h-7 rounded-md" loading="eager" decoding="async" />
        </div>

        {/* Titre de page animé — change avec la route */}
        <motion.h1
          key={title}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="font-gaming text-base font-extrabold text-text-strong tracking-wide flex-1 truncate ms-1 uppercase"
        >
          {title}
        </motion.h1>

        {/* Indicateur OPS — discret mais visible : pastille rouge légèrement
            inclinée « mode warning » quand on est la cible d'une traque. */}
        {amTarget && hunter && (
          <motion.button
            initial={{ scale: 0, rotate: 0 }}
            animate={{ scale: 1, rotate: -4 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            type="button"
            onClick={() => {
              haptic('warning');
              navigate('/profile');
            }}
            aria-label="Tu es une cible OPS"
            className="relative flex items-center gap-1 ps-1.5 pe-2 h-7 rounded-md bg-gradient-to-br from-red/25 to-red/10 border border-red/45 active:scale-95 transition-transform tap-transparent"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,120,140,0.18), 0 2px 10px rgba(255,59,92,0.22)' }}
          >
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red ring-2 ring-bg-0 animate-pulse" />
            <Crosshair className="w-3.5 h-3.5 text-red animate-pulse" strokeWidth={2.5} />
            <span className="font-gaming text-[9px] font-extrabold uppercase tracking-[0.12em] text-red leading-none tabular-nums">
              {fmtCountdown(hunter.expiresAt)}
            </span>
          </motion.button>
        )}

        {/* Indicateur OPS — côté TRAQUEUR : pastille dorée montrant combien de
            matchs forcés il reste à imposer à sa proie (sur les 3). Disparaît dès
            que le quota est épuisé. */}
        {amHunter && prey && forcedLeftAsHunter > 0 && (
          <motion.button
            initial={{ scale: 0, rotate: 0 }}
            animate={{ scale: 1, rotate: 4 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            type="button"
            onClick={() => {
              haptic('selection');
              navigate('/challenges');
            }}
            aria-label={`Il te reste ${forcedLeftAsHunter} match${forcedLeftAsHunter > 1 ? 's' : ''} OPS à imposer`}
            className="relative flex items-center gap-1 ps-1.5 pe-2 h-7 rounded-md bg-gradient-to-br from-gold/25 to-gold/10 border border-gold/45 active:scale-95 transition-transform tap-transparent"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,215,120,0.18), 0 2px 10px rgba(212,175,55,0.22)' }}
          >
            <Crosshair className="w-3.5 h-3.5 text-gold" strokeWidth={2.5} />
            <span className="font-gaming text-[9px] font-extrabold uppercase tracking-[0.12em] text-gold leading-none tabular-nums">
              {forcedLeftAsHunter} OPS
            </span>
          </motion.button>
        )}

        {/* Les games à confirmer ne s'affichent plus ici : elles vivent dans la
            section Défis (badge sur l'onglet) + la bannière popup. */}

        {/* Tester en mode user — petite icône à côté de Réglages (staging + admins) */}
        <TesterSwitchMobileIcon />

        {/* Boutique — déplacée ici depuis la tab bar du bas */}
        <NavLink
          to="/shop"
          onClick={() => haptic('selection')}
          aria-label={t('nav.shop')}
          className="relative flex items-center justify-center w-9 h-9 rounded-full text-gold active:scale-90 transition-transform tap-transparent"
        >
          <ShoppingBag className="w-[18px] h-[18px]" strokeWidth={2.2} />
        </NavLink>

        {/* Réglages — rouage, à gauche des notifs (comme la version web) */}
        <NavLink
          to="/settings"
          onClick={() => haptic('selection')}
          aria-label={t('nav.reglages')}
          className="relative flex items-center justify-center w-9 h-9 rounded-full text-muted-2 active:scale-90 active:text-text transition-transform tap-transparent"
        >
          <Settings className="w-[18px] h-[18px]" strokeWidth={2.2} />
        </NavLink>

        {/* Centre de notifications */}
        <NotificationBell />

        {/* GOD shortcut — admins uniquement */}
        {(me?.role === 'ADMIN' || me?.role === 'SUPERADMIN') && (
          <NavLink
            to="/GOD"
            onClick={() => haptic('selection')}
            aria-label="GOD"
            className="relative flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-red/20 to-red/5 border border-red/40 active:scale-90 transition-transform tap-transparent"
          >
            <Shield className="w-4 h-4 text-red" strokeWidth={2.5} />
          </NavLink>
        )}

        {/* Avatar utilisateur */}
        {me?.user && (
          <NavLink
            to="/profile"
            onClick={() => haptic('selection')}
            className="active:scale-90 transition-transform tap-transparent"
            aria-label={t('nav.profil')}
          >
            <Avatar login={login ?? '?'} imageUrl={me.user.imageUrl} size="sm" />
          </NavLink>
        )}
      </div>
    </header>
  );
}
