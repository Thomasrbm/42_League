import { AnimatePresence, motion } from 'framer-motion';
import { GlobalMatchCard, MyMatchCard, GlobalFfaCard, MyFfaCard } from './MatchCards';
import type { HistoriqueData } from './useHistoriqueLogic';
import type { Lang } from '../../../lib/i18n';

export type HistoTab = 'global' | 'mine';

interface HistoriqueListProps {
  tab: HistoTab;
  data: HistoriqueData;
  imgByLogin: Map<string, string | null>;
  lang: Lang;
  /** Texte d'état vide (déjà traduit par la page). */
  emptyText: string;
  /** Nombre max de cartes affichées. */
  limit?: number;
}

/**
 * Liste d'historique partagée mobile/desktop. Bascule entre les cartes
 * « game de la league » (global) et « ma game » (perso) selon l'onglet.
 */
export function HistoriqueList({
  tab,
  data,
  imgByLogin,
  lang,
  emptyText,
  limit = 80,
}: HistoriqueListProps) {
  const isEmpty = tab === 'mine' ? data.mine.length === 0 : data.global.length === 0;

  if (isEmpty) {
    return (
      <div className="text-center py-12 px-4">
        <div className="text-4xl mb-3 opacity-50">🏓</div>
        <div className="text-sm text-muted-2 font-medium">{emptyText}</div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18 }}
        className="space-y-2"
      >
        {tab === 'mine'
          ? data.mine
              .slice(0, limit)
              .map((item, i) => (
                <div key={item.id} className="cv-row">
                  {item.kind === 'match' ? (
                    <MyMatchCard
                      stat={item.stat}
                      lang={lang}
                      imgByLogin={imgByLogin}
                      delay={Math.min(i, 12) * 0.02}
                    />
                  ) : (
                    <MyFfaCard
                      stat={item.stat}
                      lang={lang}
                      imgByLogin={imgByLogin}
                      delay={Math.min(i, 12) * 0.02}
                    />
                  )}
                </div>
              ))
          : data.global
              .slice(0, limit)
              .map((item, i) => (
                <div key={item.id} className="cv-row">
                  {item.kind === 'match' ? (
                    <GlobalMatchCard
                      match={item.match}
                      lang={lang}
                      imgByLogin={imgByLogin}
                      delay={Math.min(i, 12) * 0.02}
                    />
                  ) : (
                    <GlobalFfaCard
                      ffa={item.ffa}
                      lang={lang}
                      imgByLogin={imgByLogin}
                      delay={Math.min(i, 12) * 0.02}
                    />
                  )}
                </div>
              ))}
      </motion.div>
    </AnimatePresence>
  );
}
