import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useGameMode } from '../hooks/useGameMode';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useT } from '../lib/i18n';
import type { Game } from '../lib/gameMode';
import { GAMES, GAME_META as META } from '../lib/gameMeta';
import { api, type SfSessionCurrent } from '../lib/api';

/** Applique `data-game` sur <html> pour le thème conditionnel. */
export function useGameModeTheme(): void {
  const { game } = useGameMode();
  useEffect(() => {
    document.documentElement.dataset.game = game;
  }, [game]);
}

// ─── Composant principal ──────────────────────────────────────────────────────

/** Morph sans overshoot (évite tout rollback à la fermeture). */
const MORPH = { type: 'tween' as const, duration: 0.42, ease: [0.33, 1, 0.68, 1] };

/**
 * Sélecteur d'univers flottant (bas droite).
 * Un bouton rond montre l'univers actif ; au clic il se déploie — en restant
 * ancré dans le coin — en un panneau des 3 jeux. Tap sur un jeu = bascule.
 *
 * Le morph FAB ↔ panneau s'appuie sur `layoutId` (shared layout) ; le hover
 * est découplé du layout pour rester fluide malgré le morph en tween.
 */
export function GameModeSwitch() {
  const t = useT();
  const { game, setGame } = useGameMode();
  useGameModeTheme();
  const [open, setOpen] = useState(false);
  const m = META[game];
  const navigate = useNavigate();
  const [sfStatus, setSfStatus] = useState<SfSessionCurrent | null>(null);

  // Ferme le panneau au clavier (Échap), en plus du clic backdrop.
  useEscapeKey(open, () => setOpen(false));

  useEffect(() => {
    api.getSfSessionCurrent().then(setSfStatus).catch(() => {});
  }, []);

  const pick = (g: Game) => {
    setGame(g);
    window.setTimeout(() => setOpen(false), 180);
  };

  return (
    <>
      {/* Voile de fermeture (clic extérieur) */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="gm-backdrop"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[89] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />
        )}
      </AnimatePresence>

      {/* Ancré au-dessus de la tab bar mobile (60px + safe-area) quelle que soit
          la hauteur d'écran ; collé en bas sur desktop (pas de tab bar). */}
      <div className="fixed right-3 z-[90] bottom-[calc(60px+env(safe-area-inset-bottom)+16px)] sm:bottom-4">
        {open ? (
          // ── Panneau (morph depuis le FAB, reste ancré dans le coin) ──
          <motion.div
            layoutId="gm-switch"
            role="dialog"
            aria-modal="true"
            aria-label={t('settings.universe')}
            transition={{ layout: MORPH }}
            style={{ borderRadius: 22, background: '#14110b', border: `1.5px solid ${m.borderColor}` }}
            className="w-[248px] max-w-[calc(100vw-1.5rem)] overflow-hidden shadow-2xl backdrop-blur-md"
          >
            <motion.div
              className="p-3.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, delay: 0.05 }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-2">{t('settings.universe')}</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t('settings.close')}
                  className="grid h-6 w-6 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-white/10 hover:text-text-strong"
                >
                  ✕
                </button>
              </div>
              <motion.div
                className="grid grid-cols-4 gap-2"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } }}
                initial="hidden"
                animate="show"
              >
                {GAMES.map((g) => {
                  const gm = META[g];
                  const sel = g === game;
                  const isSf = g === 'streetfighter';
                  const sfBlocked = isSf && sfStatus !== null && sfStatus.status !== 'active';

                  const sfTooltipText = sfStatus
                    ? sfStatus.status === 'active'
                      ? 'Session en cours !'
                      : sfStatus.status === 'upcoming' && sfStatus.session
                      ? `Prochaine session : ${new Date(sfStatus.session.startTime).toLocaleDateString('fr-FR', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : 'Aucune session programmée'
                    : undefined;

                  return (
                    <motion.button
                      key={g}
                      type="button"
                      title={sfBlocked ? sfTooltipText : undefined}
                      onClick={() => {
                        if (sfBlocked) {
                          setOpen(false);
                          navigate('/sf-session');
                          return;
                        }
                        pick(g);
                      }}
                      variants={{ hidden: { opacity: 0, y: 12, scale: 0.9 }, show: { opacity: 1, y: 0, scale: 1 } }}
                      transition={{ type: 'spring', stiffness: 440, damping: 26 }}
                      whileHover={sfBlocked ? {} : { y: -2 }}
                      whileTap={{ scale: 0.94 }}
                      className="relative flex flex-col items-center gap-1.5 rounded-xl py-2.5"
                      style={{
                        background: sel ? gm.bgColor : 'rgba(255,255,255,0.03)',
                        border: `1.5px solid ${sel ? gm.borderColor : 'rgba(255,255,255,0.07)'}`,
                        boxShadow: sel ? `0 0 16px -5px ${gm.glowColor}` : 'none',
                        opacity: sfBlocked ? 0.45 : 1,
                        filter: sfBlocked ? 'grayscale(0.8)' : 'none',
                        cursor: sfBlocked ? 'pointer' : undefined,
                        transition: 'opacity 0.3s, filter 0.3s',
                      }}
                    >
                      <span
                        className="grid h-8 w-8 place-items-center"
                        style={{ color: sel ? gm.color : 'rgba(255,255,255,0.45)' }}
                      >
                        {gm.icon(sel, 28)}
                      </span>
                      <span
                        className="w-full text-center text-[10px] font-extrabold uppercase tracking-wider leading-none whitespace-nowrap"
                        style={{ color: sfBlocked ? 'rgba(255,255,255,0.25)' : sel ? gm.color : 'rgba(255,255,255,0.5)' }}
                      >
                        {sfBlocked ? 'Fermé' : gm.shortLabel}
                      </span>
                      {sel && !sfBlocked && (
                        <motion.span
                          layoutId="gm-switch-dot"
                          className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full"
                          style={{ background: gm.color }}
                        />
                      )}
                    </motion.button>
                  );
                })}
              </motion.div>
            </motion.div>
          </motion.div>
        ) : (
          // ── FAB rond (univers actif) ──
          <motion.button
            layoutId="gm-switch"
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`${t('settings.currentUniverse')} : ${t(`game.${game}`)}. ${t('settings.changeGame')}`}
            transition={{ layout: MORPH, default: { type: 'spring', stiffness: 500, damping: 28 } }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            style={{
              borderRadius: 26,
              background: '#14110b',
              border: `1.5px solid ${m.borderColor}`,
              boxShadow: `0 0 20px -6px ${m.glowColor}`,
            }}
            className="grid h-[52px] w-[52px] place-items-center backdrop-blur-md"
          >
            <motion.span
              initial={false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 600, damping: 24 }}
              className="grid place-items-center"
              style={{ color: m.color }}
            >
              {/* Logo agrandi : à 20px les PNG (échecs/SF/smash) paraissent perdus
                  dans le rond de 52px. L'échecs est un roi vertical (étroit) →
                  `object-contain` le réduit en largeur, on l'agrandit davantage. */}
              {m.icon(true, game === 'chess' ? 42 : 32)}
            </motion.span>
          </motion.button>
        )}
      </div>
    </>
  );
}
