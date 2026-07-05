import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Home as HomeIcon,
  Swords,
  Trophy,
  BarChart3,
  Award,
  User,
  Users,
  Zap,
  Menu,
  History,
  Crown,
  Info,
  Settings,
  ShoppingBag,
} from 'lucide-react';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useT } from '../../lib/i18n';
import { haptic } from '../feedback/useHaptic';
import { BottomSheet } from './BottomSheet';

interface TabDef {
  to: string;
  labelKey: string;
  Icon: typeof Swords;
}

// 4 destinations directes + « Plus ». Le Passe a un slot direct (feature
// d'engagement) ; Profil/Trophées & co vivent dans la sheet « Plus » — une
// bottom sheet reste dans la zone du pouce, contrairement à un burger en haut.
const TABS: TabDef[] = [
  { to: '/challenges', labelKey: 'nav.defis', Icon: Swords },
  { to: '/tournaments', labelKey: 'nav.tournois', Icon: Trophy },
  { to: '/leaderboard', labelKey: 'nav.leaderboard', Icon: BarChart3 },
  { to: '/passe', labelKey: 'nav.passe', Icon: Zap },
];

/** Destinations de la sheet « Plus » (règle aussi les pages orphelines du mobile). */
const MORE: TabDef[] = [
  { to: '/', labelKey: 'nav.home', Icon: HomeIcon },
  { to: '/profile', labelKey: 'nav.profil', Icon: User },
  { to: '/trophies', labelKey: 'nav.trophees', Icon: Award },
  { to: '/shop', labelKey: 'nav.shop', Icon: ShoppingBag },
  { to: '/teams', labelKey: 'nav.teams', Icon: Users },
  { to: '/history', labelKey: 'nav.historique', Icon: History },
  { to: '/goat', labelKey: 'nav.goat', Icon: Crown },
  { to: '/settings', labelKey: 'nav.reglages', Icon: Settings },
  { to: '/about', labelKey: 'nav.about', Icon: Info },
];

const CELLS = TABS.length + 1; // + le tab « Plus »

function matches(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** Index de la cellule active : un tab direct, ou « Plus » si on est sur une de ses pages. */
function activeIndex(pathname: string): number {
  const direct = TABS.findIndex((t) => matches(pathname, t.to));
  if (direct >= 0) return direct;
  return MORE.some((m) => matches(pathname, m.to)) ? TABS.length : -1;
}

/**
 * Bottom tab bar premium :
 * - Glassmorphism + safe-area-bottom
 * - Indicateur fluide qui glisse entre les tabs (layoutId framer-motion)
 * - Bounce sur l'icône active (key-driven re-mount)
 * - Badge animé sur Défis
 * - Tab « Plus » → bottom sheet des destinations secondaires
 * - Haptique au tap
 */
export function MobileTabBar() {
  const t = useT();
  const location = useLocation();
  const { me, pending } = useLeagueData();
  const pendingCount = pending.filter((p) => p.opponentLogin === me?.login).length;
  const [moreOpen, setMoreOpen] = useState(false);

  const idx = activeIndex(location.pathname);
  const navRef = useRef<HTMLElement>(null);
  // Largeur calculée du highlight : permet à la position de coller pile à la cellule
  // sans dépendre des % et de la responsivité interne du flex.
  const [tabWidth, setTabWidth] = useState(0);

  useEffect(() => {
    const measure = () => {
      const w = navRef.current?.offsetWidth ?? 0;
      setTabWidth(w / CELLS);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // La sheet se referme à chaque navigation (clic sur une destination).
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const cellClass = (active: boolean) =>
    `relative flex flex-col items-center justify-center flex-1 gap-0.5 tap-transparent transition-colors ${
      active ? 'text-gold' : 'text-muted-2 active:text-text'
    }`;

  return (
    <>
      <nav
        ref={navRef}
        className="fixed bottom-0 left-0 right-0 z-40 glass-strong border-t border-border/60 no-select"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Navigation principale"
      >
        {/* Filet doré décoratif en haut */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent pointer-events-none" />

        {/* Filet opaque sous la barre : couvre la safe-area-inset-bottom en dur
            (le glass de la nav est translucide → sans ça, le contenu scrollé
            transparaissait dans la zone du home indicator). */}
        <div
          className="absolute bottom-0 left-0 right-0 bg-bg-0 pointer-events-none"
          style={{ height: 'env(safe-area-inset-bottom)' }}
        />

        {/* Indicateur fluide qui se déplace */}
        {idx >= 0 && tabWidth > 0 && (
          <motion.div
            className="absolute top-0 h-[2px] bg-gradient-to-r from-gold via-gold to-gold-dim"
            initial={false}
            animate={{ x: idx * tabWidth, width: tabWidth }}
            transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.6 }}
            style={{
              boxShadow: '0 0 14px rgba(255,201,74,0.7), 0 0 28px rgba(255,201,74,0.35)',
            }}
          />
        )}

        <div className="flex h-[60px] items-stretch">
          {TABS.map((tab, i) => {
            const active = i === idx;
            const showBadge = tab.to === '/challenges' && pendingCount > 0;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                onClick={() => haptic(active ? 'selection' : 'light')}
                className={cellClass(active)}
                aria-label={t(tab.labelKey)}
              >
                {/* Halo de fond au tap actif */}
                {active && (
                  <motion.div
                    layoutId="tab-halo"
                    className="absolute inset-x-3 inset-y-1.5 rounded-xl bg-gradient-to-b from-gold/15 to-gold/5 border border-gold/25"
                    transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,215,120,0.15)' }}
                  />
                )}

                {/* Icône */}
                <motion.div
                  key={active ? `${tab.to}-on` : `${tab.to}-off`}
                  initial={active ? { scale: 0.7, y: 4 } : false}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                  className="relative"
                >
                  <tab.Icon
                    className="w-[22px] h-[22px]"
                    strokeWidth={active ? 2.5 : 2}
                    fill={active ? 'rgba(255,201,74,0.22)' : 'transparent'}
                  />
                  <AnimatePresence>
                    {showBadge && (
                      <motion.span
                        key={pendingCount}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                        className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red text-white text-[9px] font-extrabold flex items-center justify-center ring-2 ring-bg-1 tabular-nums"
                      >
                        {pendingCount}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Label */}
                <span
                  className={`font-gaming text-[10px] uppercase tracking-[0.12em] font-extrabold leading-none transition-all ${
                    active ? 'opacity-100' : 'opacity-70'
                  }`}
                >
                  {t(tab.labelKey)}
                </span>
              </NavLink>
            );
          })}

          {/* Tab « Plus » : ouvre la sheet des destinations secondaires */}
          <button
            type="button"
            onClick={() => {
              haptic('light');
              setMoreOpen(true);
            }}
            className={cellClass(idx === TABS.length)}
            aria-label={t('nav.more')}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
          >
            {idx === TABS.length && (
              <motion.div
                layoutId="tab-halo"
                className="absolute inset-x-3 inset-y-1.5 rounded-xl bg-gradient-to-b from-gold/15 to-gold/5 border border-gold/25"
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,215,120,0.15)' }}
              />
            )}
            <Menu className="w-[22px] h-[22px]" strokeWidth={idx === TABS.length ? 2.5 : 2} />
            <span
              className={`font-gaming text-[10px] uppercase tracking-[0.12em] font-extrabold leading-none transition-all ${
                idx === TABS.length ? 'opacity-100' : 'opacity-70'
              }`}
            >
              {t('nav.more')}
            </span>
          </button>
        </div>
      </nav>

      {/* Sheet « Plus » — grille des destinations secondaires */}
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t('nav.more')} snap="auto">
        <div className="grid grid-cols-4 gap-2 px-1 pb-2">
          {MORE.map((m) => {
            const active = matches(location.pathname, m.to);
            return (
              <NavLink
                key={m.to}
                to={m.to}
                onClick={() => {
                  haptic('light');
                  setMoreOpen(false);
                }}
                className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border transition-colors ${
                  active
                    ? 'border-gold/40 bg-gold/10 text-gold'
                    : 'border-border/50 bg-bg-2/50 text-muted-2 active:bg-bg-2'
                }`}
              >
                <m.Icon className="w-5 h-5" strokeWidth={2.2} />
                <span className="font-gaming text-[10px] uppercase tracking-[0.1em] font-extrabold leading-none text-center">
                  {t(m.labelKey)}
                </span>
              </NavLink>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
