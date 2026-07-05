import { type ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Swords,
  Trophy,
  BarChart3,
  Award,
  Crown,
  User,
  Users,
  History,
  Settings,
  Cog,
  Shield,
  Info,
  ShoppingBag,
  Store,
  Zap,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { CoinCount } from '../components/CoinCount';
import { NotificationBell } from '../components/NotificationBell';
import { useAuth } from '../hooks/useAuth';
import { useLeagueData } from '../hooks/useLeagueData';
import { useGameMode } from '../hooks/useGameMode';
import { GAME_META } from '../lib/gameMeta';
import { pickRating } from '../lib/gameStats';
import { useT } from '../lib/i18n';
import { UniverseTransition } from '../components/UniverseTransition';

interface NavDef {
  to: string;
  labelKey: string;
  Icon: typeof Swords;
}

const NAV: NavDef[] = [
  { to: '/challenges', labelKey: 'nav.defis', Icon: Swords },
  { to: '/tournaments', labelKey: 'nav.tournois', Icon: Trophy },
  { to: '/leaderboard', labelKey: 'nav.leaderboard', Icon: BarChart3 },
  { to: '/trophies', labelKey: 'nav.trophees', Icon: Award },
  { to: '/shop', labelKey: 'nav.shop', Icon: ShoppingBag },
  { to: '/passe', labelKey: 'nav.passe', Icon: Zap },
  { to: '/profile', labelKey: 'nav.profil', Icon: User },
  { to: '/teams', labelKey: 'nav.teams', Icon: Users },
];

const NAV_SECONDARY: NavDef[] = [
  { to: '/goat', labelKey: 'nav.goat', Icon: Crown },
  { to: '/history', labelKey: 'nav.historique', Icon: History },
  { to: '/settings', labelKey: 'nav.reglages', Icon: Settings },
  { to: '/about', labelKey: 'nav.about', Icon: Info },
];

/** Clé localStorage de l'état replié du rail de navigation. */
const NAV_COLLAPSED_LS = 'league.navCollapsed';

const NAV_ADMIN: NavDef[] = [
  { to: '/GOD', labelKey: 'nav.god', Icon: Shield },
  { to: '/shop-god', labelKey: 'nav.shopgod', Icon: Store },
];

interface DesktopShellProps {
  children: ReactNode;
}

/**
 * Shell desktop — refonte premium « RPG / Esport ».
 * Sidebar dorée avec rivets, fond anthracite chaud, glow doré.
 * Le contenu garde une largeur lisible, centré, avec deux tubes en laiton sur les côtés.
 */
export function DesktopShell({ children }: DesktopShellProps) {
  const t = useT();
  const { login } = useAuth();
  const { me, pending } = useLeagueData();
  const { game } = useGameMode();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Rail replié : icônes seules (~72px) au lieu de la sidebar 256px — libère de
  // la place pour les tableaux sans rien cacher. Choix mémorisé.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(NAV_COLLAPSED_LS) === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(NAV_COLLAPSED_LS, c ? '0' : '1');
      } catch {
        /* stockage indisponible */
      }
      return !c;
    });
  };

  const pendingCount = pending.filter((p) => p.opponentLogin === me?.login).length;

  // Remet le contenu en haut à chaque changement de page. Le classement n'a plus
  // d'auto-scroll : on arrive en haut, le recentrage sur sa place se fait à la
  // demande via le bouton « Où suis-je ? » (cf. LeaderboardDesktop).
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="h-dvh flex flex-row relative overflow-hidden">
      {/* ─── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={`relative flex flex-col h-dvh z-20 no-select overflow-hidden transition-[width] duration-200 ease-out ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        {/* Fond + grille HUD */}
        <div className="absolute inset-0 bg-gradient-to-b from-bg-1 via-bg-1/95 to-bg-0 hud-grid" />

        {/* Bordure droite « tube laiton » */}
        <div className="absolute top-0 bottom-0 right-0 w-[3px] brass-pipe pointer-events-none" />
        {/* Rivet décoratif */}
        {!collapsed && (
          <Cog
            className="absolute top-3 right-3 w-4 h-4 text-gold/40 animate-gear-spin pointer-events-none"
            strokeWidth={2}
          />
        )}

        {/* Brand */}
        <div className={`relative border-b border-gold/20 ${collapsed ? 'px-2 py-4' : 'px-5 py-5'}`}>
          <NavLink to="/" className="flex flex-col gap-1.5 group" aria-label="42 League">
            {collapsed ? (
              <span className="font-display text-xl font-black text-gold text-center leading-none drop-shadow-[0_2px_8px_rgba(255,201,74,0.25)]">
                42
              </span>
            ) : (
              <>
                <img
                  src="/logo-wordmark.webp"
                  alt="42 League"
                  width={700}
                  height={233}
                  fetchPriority="high"
                  className="w-full h-auto select-none drop-shadow-[0_2px_8px_rgba(255,201,74,0.25)]"
                  draggable={false}
                />
                <div className="text-[9px] text-brass/80 uppercase tracking-[0.2em] font-bold text-center">
                  {GAME_META[game].label} · Ranked
                </div>
              </>
            )}
          </NavLink>
        </div>

        {/* Navigation principale */}
        <nav className={`relative flex flex-col gap-1 ${collapsed ? 'p-2' : 'p-3'}`}>
          {NAV.map((n) => (
            <NavItem
              key={n.to}
              to={n.to}
              label={t(n.labelKey)}
              Icon={n.Icon}
              badge={n.to === '/challenges' ? pendingCount : 0}
              collapsed={collapsed}
            />
          ))}
          <div className="my-2 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
          {NAV_SECONDARY.map((n) => (
            <NavItem
              key={n.to}
              to={n.to}
              label={t(n.labelKey)}
              Icon={n.Icon}
              collapsed={collapsed}
            />
          ))}
          {(me?.role === 'ADMIN' || me?.role === 'SUPERADMIN') && (
            <>
              <div className="my-2 h-px bg-gradient-to-r from-transparent via-red/30 to-transparent" />
              {NAV_ADMIN.map((n) => (
                <NavItem key={n.to} to={n.to} label={t(n.labelKey)} Icon={n.Icon} collapsed={collapsed} />
              ))}
            </>
          )}

          {/* Replier / agrandir le rail */}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold tracking-wide text-muted-2 hover:text-text transition-colors duration-150 ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            {collapsed ? (
              <ChevronsRight className="w-[18px] h-[18px]" strokeWidth={2} />
            ) : (
              <>
                <ChevronsLeft className="w-[18px] h-[18px]" strokeWidth={2} />
                <span className="flex-1 text-left">{t('nav.collapse')}</span>
              </>
            )}
          </button>
        </nav>

        {/* Les games à confirmer ne s'affichent plus dans la barre : elles vivent
            dans la section Défis (badge sur l'onglet) + la bannière popup. */}

        {/* Profil bas */}
        <div className={`relative mt-auto border-t border-gold/20 ${collapsed ? 'p-2' : 'p-3'}`}>
          {me?.user ? (
            collapsed ? (
              <div className="flex flex-col items-center gap-2">
                <NavLink to="/profile" title={login ?? ''} className="rounded-full hover:ring-2 hover:ring-gold/40 transition-shadow">
                  <Avatar login={login ?? '?'} imageUrl={me.user.imageUrl} size="md" />
                </NavLink>
                <NotificationBell placement="up" />
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <NavLink
                  to="/profile"
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-gold/5 transition-colors group flex-1 min-w-0"
                >
                  <Avatar login={login ?? '?'} imageUrl={me.user.imageUrl} size="md" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-[15px] font-bold text-text-strong truncate group-hover:text-gold transition-colors">
                      {login}
                    </div>
                    <div className="text-xs text-gold uppercase tracking-wider font-extrabold tabular-nums flex items-center gap-1">
                      {pickRating(me.user, game).elo} ELO
                    </div>
                    <div className="text-sm text-violet-300 font-extrabold tabular-nums flex items-center gap-1.5">
                      <img src="/42coin.webp" alt="" className="w-4 h-4" />
                      <CoinCount login={login} value={me.coins ?? 0} />
                    </div>
                  </div>
                </NavLink>
                <NotificationBell placement="up" />
              </div>
            )
          ) : (
            <div className="text-xs text-muted-2">{t('auth.notConnected')}</div>
          )}
        </div>
      </aside>

      {/* ─── Main ────────────────────────────────────────────────────── */}
      <main ref={mainRef} className="flex-1 min-w-0 relative overflow-y-auto custom-scrollbar">
        {/* Vignette dorée derrière le contenu */}
        <div className="absolute inset-0 bg-gold-vignette pointer-events-none" />
        <div className="relative px-6 lg:px-10 py-8 max-w-[1600px] mx-auto w-full">
          <UniverseTransition>{children}</UniverseTransition>
        </div>
      </main>
    </div>
  );
}

// ─── NavItem ─────────────────────────────────────────────────────────────

interface NavItemProps {
  to: string;
  label: string;
  Icon: typeof Swords;
  badge?: number;
  /** Rail replié : icône seule centrée, libellé en tooltip natif. */
  collapsed?: boolean;
}

function NavItem({ to, label, Icon, badge = 0, collapsed = false }: NavItemProps) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold tracking-wide group transition-colors duration-150 ${
          collapsed ? 'justify-center' : ''
        } ${isActive ? 'text-gold' : 'text-muted-2 hover:text-text'}`
      }
    >
      {({ isActive }) => (
        <>
          {/* Smooth sliding background pill — motion.dev tabs pattern */}
          {isActive && (
            <motion.span
              layoutId="desktop-nav-bg"
              className="absolute inset-0 rounded-lg"
              style={{
                background: 'rgba(255,201,74,0.09)',
                border: '1px solid rgba(255,201,74,0.22)',
                boxShadow: 'inset 0 1px 0 rgba(255,215,120,0.10)',
              }}
              transition={{ type: 'spring', stiffness: 500, damping: 38, mass: 0.7 }}
            />
          )}
          {/* Left accent bar (slides with the bg pill) */}
          {isActive && (
            <motion.span
              layoutId="desktop-nav-bar"
              className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
              style={{
                background: 'linear-gradient(to bottom, #ffc94a, #e0a82a)',
                boxShadow: '0 0 10px rgba(255,201,74,0.6)',
              }}
              transition={{ type: 'spring', stiffness: 500, damping: 38, mass: 0.7 }}
            />
          )}
          <span className="relative">
            <Icon
              className={`relative w-[18px] h-[18px] transition-all duration-150 ${
                isActive ? 'text-gold' : 'text-muted-2 group-hover:text-text'
              }`}
              strokeWidth={isActive ? 2.5 : 2}
            />
            {/* Rail replié : le badge devient une pastille sur l'icône */}
            {collapsed && badge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red text-white text-[9px] font-extrabold flex items-center justify-center ring-2 ring-bg-1 tabular-nums">
                {badge}
              </span>
            )}
          </span>
          {!collapsed && <span className="relative flex-1">{label}</span>}
          {!collapsed && badge > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="relative min-w-[18px] h-[18px] px-1 rounded-full bg-red text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-bg-1 tabular-nums"
            >
              {badge}
            </motion.span>
          )}
        </>
      )}
    </NavLink>
  );
}

// ─── Brand mark (petit rouage doré) ─────────────────────────────────────

