import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { api, type AnnouncementData } from '../lib/api';
import { announcementKindMeta } from '../lib/announcements';
import { useIsMobile } from '../hooks/useViewport';

// ─────────────────────────────────────────────────────────────────────────────
// Bandeau de news — fine barre fixée EN BAS de l'écran, présente sur toutes les
// pages (montée dans AppShell). Fait défiler les dernières annonces actives (les
// mêmes que le popup / la page À propos), une par une en fondu. Clic → /about.
// Refermable ; le rejet est mémorisé tant que le lot de news ne change pas.
// Sur mobile, elle se pose juste AU-DESSUS de la tab bar (pas par-dessus).
// ─────────────────────────────────────────────────────────────────────────────

const DISMISS_KEY = 'newsTickerDismissed';
const CYCLE_MS = 5500;

export function NewsTicker() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [news, setNews] = useState<AnnouncementData[]>([]);
  const [idx, setIdx] = useState(0);
  const [dismissedKey, setDismissedKey] = useState<string>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) ?? '';
    } catch {
      return '';
    }
  });

  // Charge les annonces actives (les plus récentes d'abord), garde le top 5.
  useEffect(() => {
    let alive = true;
    api
      .announcements()
      .then((list) => {
        if (!alive) return;
        const sorted = [...list]
          .filter((a) => a.active)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, 5);
        setNews(sorted);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Empreinte du lot courant : si de nouvelles news arrivent, le bandeau réapparaît.
  const key = useMemo(() => news.map((n) => n.id).join(','), [news]);
  const visible = news.length > 0 && key !== dismissedKey;

  // Défilement auto entre les news.
  useEffect(() => {
    if (!visible || news.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % news.length), CYCLE_MS);
    return () => clearInterval(t);
  }, [visible, news.length]);

  useEffect(() => {
    setIdx((i) => (i < news.length ? i : 0));
  }, [news.length]);

  if (!visible) return null;

  const current = news[Math.min(idx, news.length - 1)];
  if (!current) return null;
  const meta = announcementKindMeta(current.kind);
  const { Icon } = meta;

  function dismiss() {
    setDismissedKey(key);
    try {
      localStorage.setItem(DISMISS_KEY, key);
    } catch {
      /* stockage indispo (mode privé) — on masque juste pour la session */
    }
  }

  return (
    <div
      className="fixed z-30 pointer-events-none"
      style={{
        left: isMobile ? 0 : '16rem',
        right: 0,
        bottom: isMobile ? 'calc(60px + env(safe-area-inset-bottom))' : 0,
      }}
    >
      <div
        className="pointer-events-auto mx-auto flex items-center gap-2.5 px-3 sm:px-4 h-9 glass-strong border-t border-border/60"
        style={{ borderTop: `1px solid ${meta.ring}`, boxShadow: `0 -6px 24px ${meta.glow}` }}
      >
        {/* Label NEWS + icône du type */}
        <span
          className="hidden sm:inline-flex items-center gap-1.5 shrink-0 text-[10px] font-extrabold uppercase tracking-[0.22em]"
          style={{ color: meta.accent }}
        >
          <Icon className="w-3.5 h-3.5" strokeWidth={2.4} />
          News
        </span>
        <Icon className="sm:hidden w-3.5 h-3.5 shrink-0" style={{ color: meta.accent }} strokeWidth={2.4} />

        {/* Contenu défilant en fondu, cliquable → page À propos (dernières annonces) */}
        <button
          type="button"
          onClick={() => navigate('/about')}
          className="flex-1 min-w-0 text-left"
          aria-label={current.title}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={current.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28 }}
              className="block truncate text-[12.5px] leading-9"
            >
              <span className="font-bold text-text-strong">{current.title}</span>
              <span className="text-muted-2"> — {current.body}</span>
            </motion.span>
          </AnimatePresence>
        </button>

        {/* Pastilles de progression (si plusieurs news) */}
        {news.length > 1 && (
          <span className="hidden sm:flex items-center gap-1 shrink-0">
            {news.map((n, i) => (
              <span
                key={n.id}
                className="w-1.5 h-1.5 rounded-full transition-colors"
                style={{ background: i === idx ? meta.accent : 'rgba(255,255,255,0.2)' }}
              />
            ))}
          </span>
        )}

        {/* Fermer */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Masquer les news"
          className="shrink-0 w-7 h-7 -mr-1 rounded-full flex items-center justify-center text-muted-2 hover:text-text-strong hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}
