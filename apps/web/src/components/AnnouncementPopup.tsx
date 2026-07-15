import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useLeagueData } from '../hooks/useLeagueData';
import { useServerEvents } from '../hooks/useServerEvents';
import { useT } from '../lib/i18n';
import { api } from '../lib/api';
import { announcementKindMeta } from '../lib/announcements';

/**
 * Popup d'annonce générale — affiché UNE SEULE FOIS à la connexion de chaque
 * joueur (les annonces non vues viennent de /me → me.unseenAnnouncements ; le
 * suivi « vu » est serveur, donc valable à travers tous les appareils).
 *
 * Style calqué sur le popup GOAT (GoatIntroModal) : carte sombre, accent coloré
 * selon le type, croix de fermeture, ouverture animée via framer-motion.
 * Si plusieurs annonces sont en attente, on les fait défiler une par une.
 */
export function AnnouncementPopup() {
  const t = useT();
  const { me, refresh } = useLeagueData();
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Snapshot figé à l'ouverture : on ne veut pas que la liste change sous nos
  // pieds quand `refresh` vide me.unseenAnnouncements après l'accusé de lecture.
  const queue = useMemo(() => me?.unseenAnnouncements ?? [], [me?.unseenAnnouncements]);

  // Temps réel : quand le /god publie une annonce, on recharge `me` → la file se
  // remplit sans refresh manuel (le serveur broadcaste `announcement:created`).
  useServerEvents(refresh, ['announcement:created']);

  // Quand de NOUVELLES annonces arrivent (file qui change pour du contenu inédit),
  // on ré-ouvre le popup même si le joueur en avait déjà fermé d'anciennes.
  const idsKey = queue.map((a) => a.id).join(',');
  const prevIdsKey = useRef(idsKey);
  useEffect(() => {
    if (idsKey && idsKey !== prevIdsKey.current) {
      setDismissed(false);
      setIndex(0);
    }
    prevIdsKey.current = idsKey;
  }, [idsKey]);

  // Ne pas gêner l'onboarding du tout premier login (modale prioritaire).
  const onboarded = !!me?.user?.onboardedAt;
  const open = !dismissed && onboarded && queue.length > 0;

  // Échap = fermer + blocage du scroll de fond tant que le popup est ouvert.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const current = open ? queue[Math.min(index, queue.length - 1)] : undefined;
  if (!open || !current) return null;

  const isLast = index >= queue.length - 1;
  const meta = announcementKindMeta(current.kind);
  const { Icon } = meta;

  function close() {
    setDismissed(true);
    // Accuse réception de TOUTES les annonces de la file, puis rafraîchit `me`.
    const ids = queue.map((a) => a.id);
    void api
      .markAnnouncementsSeen(ids)
      .catch(() => {})
      .finally(() => {
        void refresh();
      });
  }

  function next() {
    if (isLast) close();
    else setIndex((i) => i + 1);
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="announcement-popup"
        role="dialog"
        aria-modal="true"
        aria-label={current.title}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={close}
        className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto"
        style={{ background: 'rgba(8,6,3,0.7)', backdropFilter: 'blur(4px)' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md my-auto rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(155deg, rgba(28,26,22,0.97) 0%, rgba(14,13,11,0.98) 100%)',
            border: `1.5px solid ${meta.ring}`,
            boxShadow: `0 0 50px ${meta.glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}
        >
          {/* Filigrane d'icône (haut-droite, très discret) */}
          <div className="absolute -right-6 -top-6 opacity-[0.06] pointer-events-none">
            <Icon className="w-40 h-40" style={{ color: meta.accent }} strokeWidth={0.6} />
          </div>

          {/* Croix de fermeture */}
          <button
            type="button"
            onClick={close}
            aria-label={t('common.back')}
            className="absolute right-3 top-3 z-10 w-10 h-10 rounded-full flex items-center justify-center text-muted-2 hover:text-text-strong hover:bg-white/10 transition-colors"
          >
            <X className="w-6 h-6" strokeWidth={2.6} />
          </button>

          <div className="relative p-6 sm:p-7">
            <div className="flex items-center gap-2.5 mb-2">
              <Icon
                className="w-6 h-6 shrink-0"
                style={{ color: meta.accent, filter: `drop-shadow(0 2px 8px ${meta.glow})` }}
                strokeWidth={2}
              />
              <span className="font-display text-xl font-black text-text-strong leading-tight">
                {current.title}
              </span>
            </div>
            <div
              className="text-[9px] font-extrabold uppercase tracking-[0.24em] mb-4"
              style={{ color: meta.accent }}
            >
              📣 {meta.label}
            </div>

            <p className="text-sm text-muted leading-relaxed whitespace-pre-line">{current.body}</p>

            {/* Plus de bouton « J'ai compris » : on ferme via la croix. Le bouton
                « Suivant » ne reste que pour défiler entre plusieurs annonces. */}
            {queue.length > 1 && (
              <div className="mt-6 flex items-center gap-3">
                <span className="text-[11px] font-mono text-muted-2 tabular-nums">
                  {index + 1} / {queue.length}
                </span>
                {!isLast && (
                  <button
                    type="button"
                    onClick={next}
                    className="ms-auto inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 font-display text-sm font-black uppercase tracking-wider text-bg-1 transition-all active:scale-[0.98] hover:brightness-110"
                    style={{ background: `linear-gradient(90deg, ${meta.accent}, ${meta.accent}cc)` }}
                  >
                    {t('announce.popup.next')}
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
