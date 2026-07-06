import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Dices, Swords, Trophy, X } from 'lucide-react';
import { useLeagueData } from '../hooks/useLeagueData';
import { useServerEvents } from '../hooks/useServerEvents';
import { useT } from '../lib/i18n';
import { api } from '../lib/api';
import { GameTag } from './bets/BetPrimitives';
import { haptic } from '../mobile/feedback/useHaptic';

/**
 * Popup « paris en cours » — s'affiche sur l'écran de tout le monde dès qu'un
 * marché est OUVERT AUX PARIS : un duel d'ops accepté (⚔️ traqueur/cible) ou un
 * tournoi ouvert au pari du vainqueur. La liste vient de `GET /bets`
 * (openOpsDuels + openTournaments), rafraîchie en temps réel via les events SSE
 * `ops:update` / `tournament:update` / `data:update`.
 *
 * Anti-spam : on mémorise (sessionStorage) les marchés déjà vus cette session ;
 * le popup ne se ré-ouvre que quand un marché INÉDIT apparaît. Fermeture par la
 * croix, le fond ou Échap — CTA « Parier maintenant » → onglet Paris du shop.
 * Style calqué sur AnnouncementPopup (portail + framer-motion + backdrop-blur).
 */

const GOLD = '#f5b331';
const SEEN_KEY = 'betLivePopup.seenV1';

type Market =
  | { kind: 'ops'; id: string; owner: string; target: string; game: string }
  | { kind: 'tournament'; id: string; name: string; game: string };

const mkey = (m: Market) => `${m.kind}:${m.id}`;

function loadSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function persistSeen(s: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
  } catch {
    /* stockage indispo (mode privé) : le popup reste éphémère, sans persistance */
  }
}

export function BetLivePopup() {
  const t = useT();
  const navigate = useNavigate();
  const { me } = useLeagueData();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const seenRef = useRef<Set<string>>(loadSeen());

  // Pas avant la fin de l'onboarding (ne pas gêner le tout premier login).
  const ready = !!me?.user?.onboardedAt;

  const refetch = useCallback(() => {
    if (!ready) return;
    void api
      .bets()
      .then((r) => {
        const next: Market[] = [
          ...r.openOpsDuels.map((d) => ({
            kind: 'ops' as const,
            id: d.id,
            owner: d.ownerLogin,
            target: d.targetLogin,
            game: d.game,
          })),
          ...r.openTournaments.map((tn) => ({
            kind: 'tournament' as const,
            id: tn.id,
            name: tn.name,
            game: tn.game,
          })),
        ];
        setMarkets(next);
      })
      .catch(() => {});
  }, [ready]);

  // Chargement initial (au login) puis à chaque signal touchant un marché.
  useEffect(() => {
    refetch();
  }, [refetch]);
  useServerEvents(refetch, ['tournament:update', 'ops:update', 'data:update'], {
    fireOnReopen: false,
    debounceMs: 600,
  });

  // Marchés jamais vus cette session (clé = kind:id).
  const freshCount = markets.filter((m) => !seenRef.current.has(mkey(m))).length;

  // Ré-ouvre dès qu'un marché INÉDIT apparaît (0 → >0), même si un lot précédent
  // avait été fermé.
  const prevFresh = useRef(0);
  useEffect(() => {
    if (freshCount > 0 && prevFresh.current === 0) setDismissed(false);
    prevFresh.current = freshCount;
  }, [freshCount]);

  const open = ready && !dismissed && freshCount > 0;

  function close() {
    // Tout marché actuellement ouvert devient « vu » → plus de re-pop tant
    // qu'aucun marché inédit n'ouvre.
    for (const m of markets) seenRef.current.add(mkey(m));
    persistSeen(seenRef.current);
    setDismissed(true);
  }

  function goBet() {
    haptic('light');
    close();
    navigate('/shop?tab=bets');
  }

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

  if (!open) return null;

  const shown = markets.slice(0, 3);
  const extra = markets.length - shown.length;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="bet-live-popup"
        role="dialog"
        aria-modal="true"
        aria-label={t('bets.popup.title')}
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
            border: `1.5px solid ${GOLD}`,
            boxShadow: `0 0 50px ${GOLD}55, inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}
        >
          {/* Filigrane de dés (haut-droite, très discret) */}
          <div className="absolute -right-6 -top-6 opacity-[0.06] pointer-events-none">
            <Dices className="w-40 h-40" style={{ color: GOLD }} strokeWidth={0.6} />
          </div>

          {/* Croix de fermeture */}
          <button
            type="button"
            onClick={close}
            aria-label={t('bets.popup.later')}
            className="absolute right-3 top-3 z-10 w-10 h-10 rounded-full flex items-center justify-center text-muted-2 hover:text-text-strong hover:bg-white/10 transition-colors"
          >
            <X className="w-6 h-6" strokeWidth={2.6} />
          </button>

          <div className="relative p-6 sm:p-7">
            <div className="flex items-center gap-2.5 mb-2">
              <Dices
                className="w-6 h-6 shrink-0"
                style={{ color: GOLD, filter: `drop-shadow(0 2px 8px ${GOLD}88)` }}
                strokeWidth={2}
              />
              <span className="font-display text-xl font-black text-text-strong leading-tight">
                {t('bets.popup.title')}
              </span>
            </div>
            <div
              className="text-[9px] font-extrabold uppercase tracking-[0.24em] mb-4"
              style={{ color: GOLD }}
            >
              🎲 {t('bets.subtitle')}
            </div>

            <p className="text-sm text-muted leading-relaxed">{t('bets.popup.subtitle')}</p>

            {/* Liste des marchés ouverts (max 3) */}
            <div className="mt-4 flex flex-col gap-2">
              {shown.map((m) => (
                <div
                  key={mkey(m)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {m.kind === 'ops' ? (
                    <>
                      <Swords className="w-4 h-4 shrink-0" style={{ color: GOLD }} strokeWidth={2.2} />
                      <span className="text-sm font-semibold text-text-strong truncate">
                        {m.owner} <span className="text-muted-2">⚔️</span> {m.target}
                      </span>
                    </>
                  ) : (
                    <>
                      <Trophy className="w-4 h-4 shrink-0" style={{ color: GOLD }} strokeWidth={2.2} />
                      <span className="text-sm font-semibold text-text-strong truncate">{m.name}</span>
                    </>
                  )}
                  <span className="ml-auto shrink-0">
                    <GameTag game={m.game} />
                  </span>
                </div>
              ))}
              {extra > 0 && (
                <div className="text-[11px] font-mono text-muted-2 tabular-nums pl-1">
                  {t('bets.popup.more').replace('{n}', String(extra))}
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={close}
                className="text-[13px] font-semibold text-muted-2 hover:text-text-strong transition-colors"
              >
                {t('bets.popup.later')}
              </button>
              <button
                type="button"
                onClick={goBet}
                className="ml-auto inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 font-display text-sm font-black uppercase tracking-wider text-bg-1 transition-all active:scale-[0.98] hover:brightness-110"
                style={{ background: `linear-gradient(90deg, ${GOLD}, ${GOLD}cc)` }}
              >
                <Dices className="w-4 h-4" strokeWidth={2.6} />
                {t('bets.popup.cta')}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
