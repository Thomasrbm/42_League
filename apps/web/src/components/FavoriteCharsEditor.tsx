import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Search } from 'lucide-react';
import { Button } from './Button';
import { api } from '../lib/api';
import { useFlash } from '../hooks/useFlash';
import { useT } from '../lib/i18n';
import { haptic } from '../mobile/feedback/useHaptic';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { rosterForGame, iconForGame, filterRoster, type FightingGame } from '../lib/chars';
import { gameColor, GAME_LOGO_SRC } from '../lib/gameVisuals';

const GAME_LABEL: Record<FightingGame, string> = { smash: 'Smash Bros', streetfighter: 'Street Fighter' };

/**
 * Grille multi-sélection du roster d'un jeu de combat (présentationnel). Toggle
 * d'un perso = ajout/retrait. Réutilisée par l'éditeur de favoris (modale du
 * profil) et l'étape favoris de l'onboarding.
 */
export function CharMultiGrid({
  game,
  selected,
  onToggle,
}: {
  game: FightingGame;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const t = useT();
  const Icon = iconForGame(game);
  const c = gameColor(game);
  const roster = rosterForGame(game);
  const sel = new Set(selected);
  const [query, setQuery] = useState('');
  const shown = filterRoster(roster, query);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {GAME_LOGO_SRC[game] && (
          <img src={GAME_LOGO_SRC[game]} alt="" aria-hidden className="w-5 h-5 object-contain" />
        )}
        <span className="text-[11px] uppercase tracking-wider font-extrabold" style={{ color: c }}>
          {GAME_LABEL[game]}
        </span>
        <span className="text-[10px] text-muted-2 font-mono">{selected.length}</span>
      </div>
      {/* Recherche / filtre par nom de perso */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-2 pointer-events-none" strokeWidth={2.5} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('favorites.search')}
          className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-bg-1/60 border border-border/60 focus:border-[#c97bff] outline-none transition-colors"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="×"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center rounded text-muted-2 hover:text-text">
            <X className="w-3 h-3" strokeWidth={2.5} />
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="py-5 text-center text-[11px] text-muted-2">{t('favorites.noResult')}</div>
      ) : (
        <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-56 overflow-y-auto scrollbar-none p-1 rounded-lg bg-bg-1/50 border border-border/50">
          {shown.map((ch) => {
            const on = sel.has(ch.id);
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => onToggle(ch.id)}
                title={ch.name}
                className={`relative rounded-lg transition-all ${
                  on ? 'ring-2 ring-[#c97bff] scale-105' : 'opacity-75 hover:opacity-100 ring-1 ring-transparent'
                }`}
              >
                <Icon id={ch.id} size={40} className="w-full aspect-square" />
                {on && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#c97bff] grid place-items-center shadow">
                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface FavoriteCharsEditorProps {
  /** Jeux à éditer (un seul depuis le profil, plusieurs possibles ailleurs). */
  games: FightingGame[];
  /** Favoris initiaux par jeu. */
  initial: Partial<Record<FightingGame, string[]>>;
  onClose: () => void;
  /** Appelé après une sauvegarde réussie (pour rafraîchir les data). */
  onSaved?: () => void | Promise<void>;
}

/**
 * Modale d'édition des persos favoris (profil perso). Multi-sélection illimitée,
 * une grille par jeu. PATCH partiel : n'envoie que les jeux édités.
 */
export function FavoriteCharsEditor({ games, initial, onClose, onSaved }: FavoriteCharsEditorProps) {
  const flash = useFlash();
  const t = useT();
  const [sel, setSel] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of games) init[g] = initial[g] ?? [];
    return init;
  });
  const [busy, setBusy] = useState(false);

  // La modale n'a pas d'état d'ouverture interne : elle est montée
  // conditionnellement par son parent, donc toujours active quand elle existe.
  useEscapeKey(true, onClose);

  const toggle = (game: FightingGame, id: string) =>
    setSel((prev) => {
      const cur = prev[game] ?? [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...prev, [game]: next };
    });

  const save = async () => {
    setBusy(true);
    haptic('medium');
    try {
      await api.setFavorites({
        ...(games.includes('smash') ? { smash: sel.smash ?? [] } : {}),
        ...(games.includes('streetfighter') ? { streetfighter: sel.streetfighter ?? [] } : {}),
      });
      haptic('success');
      await onSaved?.();
      onClose();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      haptic('error');
    } finally {
      setBusy(false);
    }
  };

  // Rendu via un PORTAL sur <body> : sinon le `position: fixed` se calerait sur le
  // premier ancêtre transformé (cartes/pages animées en motion = `transform`) au
  // lieu du viewport → la modale partait hors écran sur mobile selon l'endroit du
  // déclencheur. Le conteneur flex centre la modale ; `max-h-[88dvh]` + zone de
  // scroll interne garantissent qu'elle tient toujours à l'écran (header & bouton
  // « Enregistrer » toujours visibles, la grille de persos scrolle).
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#0b0906]/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ type: 'spring', stiffness: 460, damping: 36 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md max-h-[88dvh] flex flex-col rounded-2xl overflow-hidden border border-gold/30 bg-bg-1 shadow-2xl"
        >
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-text hover:bg-white/5 transition-colors tap-transparent"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
          <div className="px-5 pt-5 pb-3 shrink-0">
            <div className="font-display text-lg font-black text-text-strong">{t('favorites.editTitle')}</div>
            <p className="text-xs text-muted-2 mt-1">{t('favorites.editHint')}</p>
          </div>
          <div className="px-5 space-y-4 overflow-y-auto scrollbar-none flex-1 min-h-0">
            {games.map((g) => (
              <CharMultiGrid key={g} game={g} selected={sel[g] ?? []} onToggle={(id) => toggle(g, id)} />
            ))}
          </div>
          <div className="px-5 pt-3 pb-5 shrink-0">
            <Button loading={busy} onClick={save} className="w-full py-3">
              {t('favorites.save')}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
