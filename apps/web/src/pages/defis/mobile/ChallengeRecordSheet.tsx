import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomSheet } from '../../../mobile/primitives/BottomSheet';
import { AbacusSlider } from '../../../components/AbacusSlider';
import { OutcomeButton } from '../../../components/OutcomeButton';
import { Button } from '../../../components/Button';
import { api, type Challenge } from '../../../lib/api';
import { useLeagueData } from '../../../hooks/useLeagueData';
import { useFlash } from '../../../hooks/useFlash';
import { useT } from '../../../lib/i18n';
import { haptic } from '../../../mobile/feedback/useHaptic';
import { SmashSetEditor, type SmashSetValue } from '../shared/SmashSetEditor';

const WINNING_SCORE = 10;
const LOSER_SCORE_MIN = -10;
const LOSER_SCORE_MAX = 9;

interface ChallengeRecordSheetProps {
  challenge: Challenge | null;
  myLogin: string | undefined;
  onClose: () => void;
  onDone: () => Promise<void>;
}

/**
 * Sheet mobile pour enregistrer le résultat d'un défi accepté.
 * Utilise `challenge.game` (pas le mode global) → interface correcte smash/baby/chess.
 */
export function ChallengeRecordSheet({ challenge, myLogin, onClose, onDone }: ChallengeRecordSheetProps) {
  const t = useT();
  return (
    <BottomSheet
      open={challenge !== null}
      onClose={onClose}
      title={<span className="gradient-text-brand">{t('defis.enterScoreTitle')}</span>}
      snap={94}
    >
      <div className="px-5 pt-4 pb-4">
        {challenge && (
          <RecordForm challenge={challenge} myLogin={myLogin} onClose={onClose} onDone={onDone} />
        )}
      </div>
    </BottomSheet>
  );
}

function RecordForm({ challenge, myLogin, onClose, onDone }: {
  challenge: Challenge; myLogin: string | undefined; onClose: () => void; onDone: () => Promise<void>;
}) {
  const t = useT();
  const { refresh, me } = useLeagueData();
  const flash = useFlash();

  const game = challenge.game ?? 'babyfoot';
  const isSmash = game === 'smash';
  const isSf = game === 'streetfighter';
  // Street Fighter == Smash pour la saisie (set Bo3/Bo5 + 2 persos), mais sans stocks.
  const isSetGame = isSmash || isSf;
  const myFavorites = (isSf ? me?.user?.favSf : me?.user?.favSmash) ?? [];
  const isChess = game === 'chess';
  const opponent = challenge.challengerLogin === myLogin ? challenge.opponentLogin : challenge.challengerLogin;

  const [iWon, setIWon] = useState<boolean | null>(null);
  const [loserScore, setLoserScore] = useState(0);
  const [setValue, setSetValue] = useState<SmashSetValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (iWon === null) return;
    setBusy(true);
    try {
      if (isSetGame) {
        if (!setValue) { setBusy(false); setSending(false); return; }
        await api.recordChallengeResult(challenge.id, {
          scoreSelf: setValue.scoreSelf,
          scoreOpponent: setValue.scoreOpponent,
          game: isSf ? 'streetfighter' : 'smash',
          bestOf: setValue.bestOf,
          charSelf: setValue.charSelf,
          charOpponent: setValue.charOpponent,
        });
      } else if (isChess) {
        await api.recordChallengeResult(challenge.id, { scoreSelf: iWon ? 1 : 0, scoreOpponent: iWon ? 0 : 1, game: 'chess' });
      } else {
        await api.recordChallengeResult(challenge.id, {
          scoreSelf: iWon ? WINNING_SCORE : loserScore,
          scoreOpponent: iWon ? loserScore : WINNING_SCORE,
        });
      }
      flash.show(`${t('defis.scoreSentPrefix')} ${opponent} ${t('defis.scoreSentMustConfirm')}`);
      haptic('success');
      await refresh();
      await onDone();
      onClose();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      haptic('error');
    } finally { setBusy(false); setSending(false); }
  }, [iWon, isSetGame, isSf, isChess, setValue, loserScore, challenge.id, opponent, flash, refresh, onDone, onClose, t]);

  const triggerSend = () => { setSending(true); haptic('medium'); window.setTimeout(handleSubmit, 140); };

  const winnerLogin = iWon ? (myLogin ?? t('defis.me')) : opponent;
  const loserLogin = iWon ? opponent : (myLogin ?? t('defis.me'));

  return (
    <div className="relative space-y-4">
      <AnimatePresence>
        {sending && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0, 0.55, 0] }} transition={{ duration: 0.4, times: [0, 0.2, 1] }}
            className="absolute inset-0 rounded-xl pointer-events-none z-30"
            style={{ background: 'radial-gradient(ellipse at center, rgba(255,201,74,0.35) 0%, transparent 70%)' }}
          />
        )}
      </AnimatePresence>

      <motion.div
        animate={sending ? { opacity: 0, y: -30, scale: 0.95, filter: 'blur(4px)' } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        transition={sending ? { duration: 0.3 } : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        style={{ pointerEvents: sending ? 'none' : undefined }}
        className="space-y-4"
      >
        {/* Contexte */}
        <div className="text-center text-sm text-muted-2">
          {t('defis.matchAgainst')} <span className="font-extrabold text-text-strong">{opponent}</span>
          {game !== 'babyfoot' && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-bg-2 border border-border">
              {game === 'smash' ? t('game.smash') : game === 'streetfighter' ? t('game.streetfighter') : t('game.chess')}
            </span>
          )}
        </div>

        {/* Résultat */}
        {iWon === null ? (
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted font-bold mb-3 text-center">{t('defis.result')}</label>
            <div className="grid grid-cols-2 gap-4">
              <OutcomeButton kind="win" onClick={() => { setIWon(true); haptic('success'); }}>{t('defis.iWon')}</OutcomeButton>
              <OutcomeButton kind="loss" onClick={() => { setIWon(false); haptic('warning'); }}>{t('defis.iLost')}</OutcomeButton>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setIWon(null)}
            className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all ${iWon ? 'border-teal/40 bg-teal/10 text-teal' : 'border-red/40 bg-red/10 text-red'}`}
          >
            <span className="text-sm font-extrabold">{iWon ? t('defis.iWon') : t('defis.iLost')}</span>
            <span className="text-muted-2 text-lg">×</span>
          </button>
        )}

        {/* Babyfoot */}
        {iWon !== null && !isSetGame && !isChess && (
          <div className="space-y-4">
            <label className="block text-[10px] uppercase tracking-wider text-muted font-bold text-center">
              {t('defis.scoreOf')} {iWon ? opponent : (myLogin ?? t('defis.me'))}
            </label>
            <AbacusSlider value={loserScore} onChange={setLoserScore} min={LOSER_SCORE_MIN} max={LOSER_SCORE_MAX} />
            <div className="px-4 py-3 rounded-xl bg-bg-1/80 border border-border text-center text-sm text-muted-2 shadow-inner">
              <span className={`font-extrabold ${iWon ? 'text-teal' : 'text-text-strong'}`}>{winnerLogin}</span>
              {' '}{t('defis.wonScore')}{' '}
              <span className="font-extrabold text-text-strong font-mono tabular-nums">{WINNING_SCORE}</span>
              <span className="text-muted mx-2 opacity-50">/</span>
              <span className={`font-extrabold font-mono tabular-nums ${loserScore < 0 ? 'text-red' : 'text-text-strong'}`}>{loserScore}</span>
              {' '}{t('defis.against')}{' '}
              <span className={`font-extrabold ${iWon ? 'text-text-strong' : 'text-teal'}`}>{loserLogin}</span>
            </div>
            <Button size="md" loading={busy} onClick={triggerSend} className="w-full py-3.5 text-sm font-bold shadow-lg">{t('defis.sendScore')}</Button>
          </div>
        )}

        {/* Set (Smash / Street Fighter) — score d'abord, persos optionnels */}
        {iWon !== null && isSetGame && (
          <div className="space-y-4">
            <SmashSetEditor
              game={isSf ? 'streetfighter' : 'smash'}
              iWon={iWon}
              myLogin={myLogin}
              oppLogin={opponent}
              myFavorites={myFavorites}
              onChange={setSetValue}
            />
            <Button size="md" loading={busy} onClick={triggerSend} className="w-full py-3.5 text-sm font-bold shadow-lg">{t('defis.sendScore')}</Button>
          </div>
        )}

        {/* Échecs */}
        {iWon !== null && isChess && (
          <div className="space-y-4">
            <div className="px-4 py-3 rounded-xl bg-bg-1/80 border border-border text-center text-sm text-muted-2 shadow-inner">
              <span className={`font-extrabold ${iWon ? 'text-teal' : 'text-text-strong'}`}>{winnerLogin}</span>
              {' '}{t('defis.checkmated')}{' '}
              <span className={`font-extrabold ${iWon ? 'text-text-strong' : 'text-teal'}`}>{loserLogin}</span>
            </div>
            <Button size="md" loading={busy} onClick={triggerSend} className="w-full py-3.5 text-sm font-bold shadow-lg">{t('defis.sendScore')}</Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
