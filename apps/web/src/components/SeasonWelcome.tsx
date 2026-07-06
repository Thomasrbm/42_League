import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useLeagueData } from '../hooks/useLeagueData';

/**
 * Splash de bienvenue « Saison Piscine 2026 » — s'affiche une seule fois par
 * navigateur, quelques secondes le temps de lire, puis disparaît tout seul.
 *
 *  - Une seule fois : mémorisé en localStorage (clé versionnée par saison).
 *  - Auto-fermeture après AUTO_MS ; refermable avant via clic ou Échap.
 *  - Ne s'affiche qu'une fois l'onboarding du 1er login passé, pour ne pas
 *    empiler deux modales sur un tout nouveau compte.
 */
const SEASON_KEY = 'season-welcome:piscine-2026';
const AUTO_MS = 5000;

export function SeasonWelcome() {
  const { me } = useLeagueData();
  const onboarded = !!me?.user?.onboardedAt;
  const [open, setOpen] = useState(false);

  // Décide de l'ouverture une fois l'utilisateur chargé et onboardé.
  useEffect(() => {
    if (!onboarded) return;
    let seen = false;
    try {
      seen = localStorage.getItem(SEASON_KEY) === '1';
    } catch {
      // localStorage indisponible (mode privé strict) → on affiche quand même.
    }
    if (!seen) setOpen(true);
  }, [onboarded]);

  // Marque comme vu + timer d'auto-fermeture + Échap, tant que le splash est ouvert.
  useEffect(() => {
    if (!open) return;
    try {
      localStorage.setItem(SEASON_KEY, '1');
    } catch {
      /* pas grave : au pire re-vu au prochain chargement */
    }
    const timer = setTimeout(() => setOpen(false), AUTO_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="season-welcome"
          role="dialog"
          aria-modal="true"
          aria-label="Saison Piscine 2026"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[130] flex items-center justify-center p-4 sm:p-6"
          style={{ background: 'rgba(6,8,12,0.82)', backdropFilter: 'blur(6px)' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg rounded-2xl overflow-hidden"
            style={{
              border: '1.5px solid rgba(44,195,255,0.55)',
              boxShadow: '0 0 60px rgba(44,195,255,0.28), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            {/* Photo de piscine — visuel héro plein cadre. */}
            <img
              src="/season/piscine.webp"
              alt=""
              draggable={false}
              className="block w-full h-auto select-none"
            />
            {/* Voile bas → lisibilité du texte posé dessus. */}
            <div
              className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
              style={{ background: 'linear-gradient(to top, rgba(6,8,12,0.94) 6%, rgba(6,8,12,0.55) 45%, transparent 100%)' }}
            />

            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 text-center">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.28em] text-[#7fe0ff] mb-2">
                🏊 Saison Piscine 2026
              </div>
              <h2 className="font-gaming text-2xl sm:text-3xl font-black text-white leading-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
                Bienvenue sur <span className="text-[#2cc3ff]">OneLeague</span>,
                <br className="hidden sm:block" /> saison Piscine 2026 !
              </h2>

              {/* Barre de progression = compte à rebours de l'auto-fermeture. */}
              <motion.div
                className="mx-auto mt-5 h-[3px] rounded-full bg-[#2cc3ff]"
                style={{ maxWidth: 220 }}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: AUTO_MS / 1000, ease: 'linear' }}
              />
              <p className="mt-2 text-[11px] text-white/55">Appuie n'importe où pour continuer</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
