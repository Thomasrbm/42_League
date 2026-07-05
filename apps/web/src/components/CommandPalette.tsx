import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  Swords,
  Trophy,
  BarChart3,
  Award,
  Crown,
  User,
  Users,
  History,
  Settings,
  Info,
  ShoppingBag,
  Zap,
  CornerDownLeft,
  type LucideIcon,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { useLeagueData } from '../hooks/useLeagueData';
import { useT } from '../lib/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Palette de commande (Cmd/Ctrl+K, desktop) — sauter à une page, un joueur ou
// un tournoi sans lâcher le clavier. ↑/↓ pour naviguer, Entrée pour ouvrir,
// Échap pour fermer.
// ─────────────────────────────────────────────────────────────────────────────

interface PageEntry {
  to: string;
  labelKey: string;
  Icon: LucideIcon;
}

const PAGES: PageEntry[] = [
  { to: '/challenges', labelKey: 'nav.defis', Icon: Swords },
  { to: '/tournaments', labelKey: 'nav.tournois', Icon: Trophy },
  { to: '/leaderboard', labelKey: 'nav.leaderboard', Icon: BarChart3 },
  { to: '/trophies', labelKey: 'nav.trophees', Icon: Award },
  { to: '/shop', labelKey: 'nav.shop', Icon: ShoppingBag },
  { to: '/passe', labelKey: 'nav.passe', Icon: Zap },
  { to: '/profile', labelKey: 'nav.profil', Icon: User },
  { to: '/teams', labelKey: 'nav.teams', Icon: Users },
  { to: '/goat', labelKey: 'nav.goat', Icon: Crown },
  { to: '/history', labelKey: 'nav.historique', Icon: History },
  { to: '/settings', labelKey: 'nav.reglages', Icon: Settings },
  { to: '/about', labelKey: 'nav.about', Icon: Info },
];

interface ResultRow {
  key: string;
  to: string;
  label: string;
  sub?: string;
  kind: 'page' | 'player' | 'tournament';
  Icon?: LucideIcon;
  imageUrl?: string | null;
  login?: string;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function CommandPalette() {
  const t = useT();
  const navigate = useNavigate();
  const { leaderboard, tournaments } = useLeagueData();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Raccourci global Cmd/Ctrl+K (toggle) — Échap géré par l'input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo<ResultRow[]>(() => {
    const q = norm(query.trim());
    const out: ResultRow[] = [];

    const pages = PAGES.filter((p) => !q || norm(t(p.labelKey)).includes(q));
    for (const p of pages.slice(0, q ? 4 : 6)) {
      out.push({ key: `page:${p.to}`, to: p.to, label: t(p.labelKey), kind: 'page', Icon: p.Icon });
    }

    if (q) {
      const players = leaderboard.filter((u) => {
        const name = norm(`${u.login} ${u.firstName ?? ''} ${u.lastName ?? ''}`);
        return name.includes(q);
      });
      for (const u of players.slice(0, 6)) {
        out.push({
          key: `player:${u.login}`,
          to: `/player/${encodeURIComponent(u.login)}`,
          label: u.login,
          sub: [u.firstName, u.lastName].filter(Boolean).join(' ') || undefined,
          kind: 'player',
          imageUrl: u.imageUrl,
          login: u.login,
        });
      }
      const tours = tournaments.filter((tour) => norm(tour.name).includes(q));
      for (const tour of tours.slice(0, 4)) {
        out.push({
          key: `tour:${tour.id}`,
          to: `/tournaments/${encodeURIComponent(tour.id)}`,
          label: tour.name,
          sub: t('nav.tournois'),
          kind: 'tournament',
          Icon: Trophy,
        });
      }
    }
    return out;
  }, [query, leaderboard, tournaments, t]);

  // Index sélectionné toujours dans les bornes.
  useEffect(() => {
    setIdx((i) => Math.min(i, Math.max(0, results.length - 1)));
  }, [results.length]);

  const go = useCallback(
    (row: ResultRow | undefined) => {
      if (!row) return;
      setOpen(false);
      navigate(row.to);
    },
    [navigate],
  );

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[idx]);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-start justify-center pt-[18vh] px-4 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <motion.div
            className="w-full max-w-lg card-hud rounded-2xl overflow-hidden border-gold/25"
            style={{ boxShadow: '0 24px 70px rgba(0,0,0,0.75), 0 0 40px rgba(255,201,74,0.08)' }}
            initial={{ y: -14, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -10, scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
            aria-label={t('palette.title')}
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60">
              <Search className="w-4 h-4 text-muted-2 shrink-0" strokeWidth={2.4} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIdx(0);
                }}
                onKeyDown={onInputKey}
                placeholder={t('palette.placeholder')}
                className="flex-1 bg-transparent outline-none text-sm text-text-strong placeholder:text-muted"
                aria-label={t('palette.placeholder')}
              />
              <kbd className="px-1.5 py-0.5 rounded-md bg-bg-2 border border-border/60 text-[10px] font-bold text-muted-2">
                esc
              </kbd>
            </div>

            <div className="max-h-[46vh] overflow-y-auto custom-scrollbar py-1.5">
              {results.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-2">{t('palette.noResult')}</div>
              ) : (
                results.map((row, i) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => go(row)}
                    onMouseEnter={() => setIdx(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      i === idx ? 'bg-gold/10' : ''
                    }`}
                  >
                    {row.kind === 'player' ? (
                      <Avatar login={row.login ?? '?'} imageUrl={row.imageUrl ?? null} size="sm" />
                    ) : (
                      <span className="w-8 h-8 rounded-lg bg-bg-2 border border-border/60 flex items-center justify-center shrink-0">
                        {row.Icon && <row.Icon className="w-4 h-4 text-muted-2" strokeWidth={2.2} />}
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-text-strong truncate">{row.label}</span>
                      {row.sub && <span className="block text-[11px] text-muted-2 truncate">{row.sub}</span>}
                    </span>
                    {i === idx && <CornerDownLeft className="w-3.5 h-3.5 text-gold/70 shrink-0" strokeWidth={2.4} />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
