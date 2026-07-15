import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { api, type OwnedTitle } from '../lib/api';
import { useLeagueData } from '../hooks/useLeagueData';
import { useT } from '../lib/i18n';

/**
 * Sélecteur de titre cosmétique (self-service), affiché UNIQUEMENT sur son
 * propre profil. Réduit à une simple flèche coulissante : un clic ouvre la liste
 * des titres possédés (`me.ownedTitles`) + l'option par défaut « sans éclat. ».
 *
 * À la sélection : mise à jour optimiste (state local), appel `api.setMyTitle`,
 * puis `patchMyTitle` — qui ne met à jour QUE le titre dans le contexte (pas de
 * reload de page). En cas d'erreur réseau on revient à la valeur précédente.
 */
export function TitlePicker({ className }: { className?: string }) {
  const { me, patchMyTitle } = useLeagueData();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Titre affiché de façon optimiste (label) — `undefined` = on suit `me`.
  const [optimistic, setOptimistic] = useState<string | null | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);

  const owned: OwnedTitle[] = me?.ownedTitles ?? [];
  const serverTitle = me?.user?.title ?? null;
  const current = optimistic === undefined ? serverTitle : optimistic;

  // Resynchronise l'optimiste dès que le serveur confirme la même valeur.
  useEffect(() => {
    if (optimistic !== undefined && optimistic === serverTitle) setOptimistic(undefined);
  }, [optimistic, serverTitle]);

  // Fermeture au clic extérieur / Échap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Pas de titres possédés : rien à afficher (ni indice, ni sélecteur).
  if (owned.length === 0) {
    return null;
  }

  async function select(label: string | null) {
    setOpen(false);
    if (label === current) return;
    const prev = current;
    setOptimistic(label);
    setSaving(true);
    try {
      await api.setMyTitle(label);
      // Patch local du seul titre : pas de reload global, seule la bannière de
      // titre se met à jour. L'effet de resync efface alors l'optimiste.
      patchMyTitle(label);
    } catch {
      setOptimistic(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={rootRef} className={`inline-block ${className ?? ''}`}>
      {/* Wrapper relatif : le menu s'ancre au bouton (et non à un ancêtre
          positionné lointain), qu'on soit en desktop ou en mobile. */}
      <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        aria-label={t('profil.title.choose')}
        className="inline-flex items-center justify-center rounded-full border border-gold/40 bg-bg-1/60 p-1 text-gold transition hover:border-gold/70 hover:bg-bg-1/80 disabled:opacity-50"
      >
        <ChevronDown
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2.5}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-gold/30 shadow-2xl"
            style={{ background: 'linear-gradient(180deg, #1b1d26 0%, #14151c 100%)' }}
          >
            <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider font-bold text-muted-2 border-b border-border/40">
              {t('profil.title.current')}
            </div>
            <ul className="max-h-64 overflow-y-auto py-1">
              <TitleOption
                label={t('profil.title.tarnished')}
                muted
                selected={current === null}
                onClick={() => void select(null)}
              />
              {owned.map((o) => (
                <TitleOption
                  key={o.key}
                  label={o.label}
                  selected={current === o.label}
                  onClick={() => void select(o.label)}
                />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

function TitleOption({
  label,
  selected,
  muted,
  onClick,
}: {
  label: string;
  selected: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-start text-xs transition hover:bg-gold/10 ${
          muted ? 'text-muted-2 italic' : 'text-gold italic font-semibold'
        }`}
      >
        <span className="w-3.5 flex-shrink-0">
          {selected && <Check className="w-3.5 h-3.5 text-gold" strokeWidth={3} />}
        </span>
        <span className="truncate">{muted ? label : `« ${label} »`}</span>
      </button>
    </li>
  );
}
