import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, X } from 'lucide-react';
import { Button } from '../../../components/Button';
import { ContestModal } from '../../../components/ContestModal';
import { PlayerLink } from '../../../components/PlayerLink';
import type { PlayedMatch } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { haptic } from '../../../mobile/feedback/useHaptic';

interface ContestableMatchCardProps {
  match: PlayedMatch;
  onContest: (id: string, reason: 'never_played' | 'wrong_score', message: string) => Promise<void>;
}

/**
 * Carte mobile d'un match AUTO-VALIDÉ (48h sans réponse) encore contestable.
 * Le résultat compte déjà ; contester ouvre un litige (arbitrage), sans annuler
 * l'ELO automatiquement.
 */
export function ContestableMatchCard({ match, onContest }: ContestableMatchCardProps) {
  const t = useT();
  const [contesting, setContesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const decl = match.autoConfirmDeclarerLogin ?? match.playerALogin;
  // Score en perspective déclarant (les côtés A/B suivent l'ordre canonique).
  const declSideIsA = decl === match.playerALogin || decl === match.playerA2Login;
  const scoreDeclarer = declSideIsA ? match.scoreA : match.scoreB;
  const scoreOpponent = declSideIsA ? match.scoreB : match.scoreA;
  const iWon = scoreOpponent > scoreDeclarer;

  const handleSubmit = async (reason: 'never_played' | 'wrong_score', message: string) => {
    setContesting(false);
    setBusy(true);
    try {
      await onContest(match.id, reason, message);
      haptic('warning');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className="relative overflow-hidden rounded-2xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-500/[0.08] to-bg-1/85 backdrop-blur-md shadow-lg"
      >
        <div className="p-4">
          <div className="flex items-center gap-2 text-xs mb-2">
            <Clock className="w-4 h-4 text-amber-400" strokeWidth={2.5} />
            <PlayerLink login={decl} className="font-bold text-amber-300">{decl}</PlayerLink>
            <span className="text-muted-2">{t('defis.declared')}</span>
          </div>

          <div className="flex items-baseline justify-center gap-2 mb-2 font-display">
            <span className={`text-3xl font-black tabular-nums ${scoreDeclarer > scoreOpponent ? 'text-amber-300' : 'text-text-strong'}`}>
              {scoreDeclarer}
            </span>
            <span className="text-xl text-muted">–</span>
            <span className={`text-3xl font-black tabular-nums ${scoreOpponent > scoreDeclarer ? 'text-amber-300' : 'text-text-strong'}`}>
              {scoreOpponent}
            </span>
          </div>

          <div className="text-center text-[10px] text-amber-300/80 italic mb-3 px-2">
            {t('defis.contestable.hint')} — {t('defis.youHave')} {iWon ? t('defis.won') : t('defis.lost')}
          </div>

          <Button
            size="md"
            variant="ghost"
            disabled={busy}
            onClick={() => { haptic('light'); setContesting(true); }}
            className="w-full py-3 text-sm text-red border-red/30 hover:border-red hover:bg-red/5 hover:text-red"
          >
            <X className="w-4 h-4 mr-1.5" strokeWidth={3} />
            {t('defis.contestable.contest')}
          </Button>
        </div>
      </motion.div>

      {contesting && (
        <ContestModal
          declarerLogin={decl}
          score={`${scoreDeclarer}–${scoreOpponent}`}
          busy={busy}
          onSubmit={handleSubmit}
          onClose={() => setContesting(false)}
        />
      )}
    </>
  );
}
