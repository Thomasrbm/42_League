import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AbacusSlider } from '../../../components/AbacusSlider';
import { OutcomeButton } from '../../../components/OutcomeButton';
import { Button } from '../../../components/Button';
import { api, type LeaderboardEntry, type Game } from '../../../lib/api';
import { trackEvent } from '../../../lib/analytics';
import { useFlash } from '../../../hooks/useFlash';
import { useGameMode } from '../../../hooks/useGameMode';
import { useLeagueData } from '../../../hooks/useLeagueData';
import { useT } from '../../../lib/i18n';
import { haptic } from '../../../mobile/feedback/useHaptic';
import { PlayerSearch } from './PlayerSearch';
import { SmashSetEditor, type SmashSetValue } from './SmashSetEditor';

export const WINNING_SCORE = 10;
export const LOSER_SCORE_MIN = -10;
export const LOSER_SCORE_MAX = WINNING_SCORE - 1;

const SEND_AWAY_ANIM_MS = 140;

interface DeclareGameFlowProps {
  others: LeaderboardEntry[];
  recentOpponents: LeaderboardEntry[];
  opponentCounts: Record<string, number>;
  myLogin: string | undefined;
  locations?: Map<string, string>;
  /** Appelé après un POST réussi. Doit refresh les data + (optionnel) fermer le container. */
  onSubmitted: () => Promise<void> | void;
  /** Mode visuel — change l'autofocus + la taille des inputs. */
  variant?: 'desktop' | 'mobile';
  /**
   * Force un mode de jeu (override le mode global). Utilisé quand on enregistre
   * le résultat d'un défi : le jeu est celui du défi, pas le mode sélectionné.
   */
  gameOverride?: Game;
}

/**
 * Flow de déclaration d'une game passée — partagé entre la carte desktop
 * (DesktopDeclareGameSection) et la BottomSheet mobile (MobileDeclareGameSheet).
 *
 * Contient les 3 étapes : recherche → résultat (gagné/perdu) → score du perdant.
 * Pas de chrome (pas de card, pas de header) — c'est le rôle du wrapper.
 */
export function DeclareGameFlow({
  others,
  recentOpponents,
  opponentCounts,
  myLogin,
  locations,
  onSubmitted,
  variant = 'desktop',
  gameOverride,
}: DeclareGameFlowProps) {
  const flash = useFlash();
  const t = useT();
  const { me } = useLeagueData();
  const { game: globalGame } = useGameMode();
  const game = gameOverride ?? globalGame;
  const isSmash = game === 'smash';
  const isSf = game === 'streetfighter';
  // Favoris (« mains ») du jeu en cours, pour épingler en haut du picker.
  const favOf = (u: { favSmash?: string[]; favSf?: string[] } | null | undefined) =>
    (isSf ? u?.favSf : u?.favSmash) ?? [];
  const myFavorites = favOf(me?.user);
  // Street Fighter == Smash pour la saisie (set Bo3/Bo5 + 2 persos), mais sans stocks.
  const isSetGame = isSmash || isSf;
  const isChess = game === 'chess';
  const [opponent, setOpponent] = useState<LeaderboardEntry | null>(null);
  // Issue déclarée : victoire / défaite / nulle (la nulle n'existe qu'aux échecs).
  const [outcome, setOutcome] = useState<'win' | 'loss' | 'draw' | null>(null);
  const iWon = outcome === 'win';
  const isDraw = outcome === 'draw';
  const hasOutcome = outcome !== null;
  // Une fois l'issue choisie, le bloc de paramètres (score, persos Smash…)
  // se déploie sous le résumé. On fait remonter ce résumé en haut de la zone
  // scrollable pour que les nouveaux champs soient visibles sans scroll manuel.
  // Cantonné au mobile : la BottomSheet a sa propre zone scrollable contrainte.
  // Sur desktop le formulaire vit dans le scroll global de la page, où un saut
  // automatique serait plus déroutant qu'utile.
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasOutcome || variant !== 'mobile') return;
    const el = resultRef.current;
    if (!el) return;
    const raf = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [hasOutcome, variant]);
  const [loserScore, setLoserScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  // Résultat du set Smash / Street Fighter (format + score + persos optionnels),
  // remonté par SmashSetEditor. `null` tant que le bloc n'est pas monté.
  const [setValue, setSetValue] = useState<SmashSetValue | null>(null);

  const handleOutcome = (o: 'win' | 'loss' | 'draw') => {
    haptic(o === 'win' ? 'success' : o === 'draw' ? 'medium' : 'warning');
    setOutcome(o);
    setLoserScore(0);
  };

  const handleSubmit = useCallback(async () => {
    if (!opponent || !hasOutcome) return;
    setBusy(true);
    try {
      if (isSetGame) {
        if (!setValue) {
          setBusy(false);
          setSending(false);
          return;
        }
        await api.declareMatch({
          opponentLogin: opponent.login,
          scoreSelf: setValue.scoreSelf,
          scoreOpponent: setValue.scoreOpponent,
          game: isSf ? 'streetfighter' : 'smash',
          bestOf: setValue.bestOf,
          charSelf: setValue.charSelf,
          charOpponent: setValue.charOpponent,
        });
      } else if (isChess) {
        // Échecs : victoire 1-0, défaite 0-1, ou nulle 0-0.
        await api.declareMatch({
          opponentLogin: opponent.login,
          scoreSelf: isDraw ? 0 : iWon ? 1 : 0,
          scoreOpponent: isDraw ? 0 : iWon ? 0 : 1,
          game: 'chess',
        });
      } else {
        const scoreSelf = iWon ? WINNING_SCORE : loserScore;
        const scoreOpponent = iWon ? loserScore : WINNING_SCORE;
        await api.declareMatch({ opponentLogin: opponent.login, scoreSelf, scoreOpponent });
      }
      trackEvent('match.declare', isSf ? 'streetfighter' : isSmash ? 'smash' : isChess ? 'chess' : 'babyfoot');
      flash.show(`${t('defis.gameDeclared')} ${opponent.login} ${t('defis.mustConfirmShort')}`);
      haptic('success');
      await onSubmitted();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      haptic('error');
    } finally {
      setBusy(false);
      setSending(false);
    }
  }, [opponent, hasOutcome, iWon, isDraw, loserScore, isSetGame, isSmash, isSf, isChess, setValue, flash, onSubmitted, t]);

  const triggerSend = () => {
    setSending(true);
    haptic('medium');
    window.setTimeout(handleSubmit, SEND_AWAY_ANIM_MS);
  };

  const winnerLogin = iWon ? (myLogin ?? 'Moi') : (opponent?.login ?? '');
  const loserLogin = iWon ? (opponent?.login ?? '') : (myLogin ?? 'Moi');

  return (
    <div className="relative">
      {/* Gold flash overlay on send */}
      <AnimatePresence>
        {sending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.55, 0] }}
            transition={{ duration: 0.4, times: [0, 0.2, 1] }}
            className="absolute inset-0 rounded-xl pointer-events-none z-30"
            style={{ background: 'radial-gradient(ellipse at center, rgba(255,201,74,0.35) 0%, transparent 70%)' }}
          />
        )}
      </AnimatePresence>
    <motion.div
      className="flex flex-col"
      animate={
        sending
          ? { opacity: 0, y: -36, scale: 0.94, filter: 'blur(5px)' }
          : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }
      }
      transition={
        sending
          ? { duration: 0.32, ease: [0.55, 0, 1, 0.45] }
          : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }
      }
      style={{ pointerEvents: sending ? 'none' : undefined }}
    >
      <div className="relative z-20">
        <label className="block text-[10px] uppercase tracking-wider text-muted font-bold mb-2">
          {t('defis.opponent')}
        </label>
        <PlayerSearch
          variant={variant}
          players={others}
          recentPlayers={recentOpponents}
          opponentCounts={opponentCounts}
          selected={opponent}
          onSelect={setOpponent}
          onClear={() => { setOpponent(null); setOutcome(null); }}
          locations={locations}
        />
      </div>

      {opponent && !hasOutcome && (
        <div className="relative mt-6 animate-slide-down">
          <label className="block text-[10px] uppercase tracking-wider text-muted font-bold mb-3">
            {t('defis.result')}
          </label>
          <div className="grid grid-cols-2 gap-4">
            <OutcomeButton kind="win" onClick={() => handleOutcome('win')}>{t('defis.iWon')}</OutcomeButton>
            <OutcomeButton kind="loss" onClick={() => handleOutcome('loss')}>{t('defis.iLost')}</OutcomeButton>
          </div>
          {/* Nulle : échecs uniquement (la seule discipline qui l'autorise). */}
          {isChess && (
            <button
              type="button"
              onClick={() => handleOutcome('draw')}
              className="mt-3 w-full py-3 rounded-xl border border-gold/40 bg-gold/10 text-gold text-sm font-extrabold uppercase tracking-wide transition-all hover:bg-gold/20 active:scale-[0.98]"
            >
              {t('defis.iDrew')}
            </button>
          )}
        </div>
      )}

      {opponent && hasOutcome && (
        <div ref={resultRef} className="relative mt-6 scroll-mt-3 animate-fade-in">
          <label className="block text-[10px] uppercase tracking-wider text-muted font-bold mb-2">
            {t('defis.result')}
          </label>
          <button
            type="button"
            onClick={() => setOutcome(null)}
            aria-label={t('defis.editResult')}
            className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all shadow-sm hover:shadow-md tap-transparent active:scale-[0.98] ${
              isDraw
                ? 'border-gold/40 bg-gold/10 text-gold hover:bg-gold/20'
                : iWon
                  ? 'border-teal/40 bg-teal/10 text-teal hover:bg-teal/20'
                  : 'border-red/40 bg-red/10 text-red hover:bg-red/20'
            }`}
          >
            <span className="text-sm font-extrabold tracking-wide">
              {isDraw
                ? t('defis.iDrew')
                : variant === 'mobile'
                  ? iWon
                    ? t('defis.iWon')
                    : t('defis.iLost')
                  : iWon
                    ? t('defis.iWonTrophy')
                    : t('defis.iLostSkull')}
            </span>
            <span className="text-muted-2 text-lg leading-none">×</span>
          </button>
        </div>
      )}

      {opponent && hasOutcome && game === 'babyfoot' && (
        <div className="relative mt-6 animate-slide-down">

          {/* ── Affichage du score en direct ───────────────────────────────── */}
          {/* Les deux camps côte à côte : le gagnant (10 verrouillé en or) et
              le perdant (valeur live du slider). Rend immédiatement lisible QUI
              marque quoi — plus de confusion "je glisse mon score ou le sien". */}
          <div className="flex items-stretch gap-2 mb-6">
            {/* Gagnant (côté gauche si iWon, droite sinon) */}
            {[
              { login: winnerLogin, score: WINNING_SCORE, isWinner: true },
              { login: loserLogin, score: loserScore, isWinner: false },
            ].map(({ login, score, isWinner }) => (
              <div
                key={login}
                className={`flex-1 rounded-2xl flex flex-col items-center justify-center py-4 gap-1 ${
                  isWinner
                    ? 'bg-gradient-to-b from-gold/15 to-gold/5 border border-gold/40'
                    : loserScore < 0
                      ? 'bg-red/[0.07] border border-red/30'
                      : 'bg-bg-2/60 border border-border/60'
                }`}
              >
                <span className="text-[10px] uppercase tracking-[0.18em] font-extrabold text-muted truncate max-w-full px-2">
                  {login === (myLogin ?? 'Moi') ? t('defis.you') : login}
                </span>
                <span
                  className={`font-display text-5xl font-black tabular-nums leading-none ${
                    isWinner
                      ? 'text-gold'
                      : loserScore < 0
                        ? 'text-red'
                        : 'text-text-strong'
                  }`}
                  style={isWinner ? { textShadow: '0 0 24px rgba(255,201,74,0.45)' } : undefined}
                >
                  {score}
                </span>
                {isWinner && (
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-gold/60">{t('defis.locked')}</span>
                )}
                {!isWinner && (
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-muted-2">{t('defis.slideHint')}</span>
                )}
              </div>
            ))}
          </div>

          {/* Abaque */}
          <AbacusSlider
            value={loserScore}
            onChange={setLoserScore}
            min={LOSER_SCORE_MIN}
            max={LOSER_SCORE_MAX}
          />

          <div className="mt-5">
            <Button size="md" loading={busy} onClick={triggerSend} className="w-full py-3.5 text-sm font-bold shadow-lg">
              {t('defis.sendDeclaration')}
            </Button>
          </div>

          <p className="mt-3 text-[10px] text-muted/70 leading-relaxed text-center font-medium">
            {opponent.login} {t('defis.mustConfirmScore')}
          </p>
        </div>
      )}

      {/* ─── Variante SET (Smash / Street Fighter) : score d'abord, persos optionnels ── */}
      {opponent && hasOutcome && isSetGame && (
        <div className="relative mt-6 animate-slide-down space-y-5">
          <SmashSetEditor
            game={isSf ? 'streetfighter' : 'smash'}
            iWon={iWon}
            myLogin={myLogin}
            oppLogin={opponent.login}
            myFavorites={myFavorites}
            oppFavorites={favOf(opponent)}
            onChange={setSetValue}
          />

          <Button
            size="md"
            loading={busy}
            onClick={triggerSend}
            className="w-full py-3.5 text-sm font-bold shadow-lg"
          >
            {t('defis.sendDeclaration')}
          </Button>
          <p className="text-[10px] text-muted/70 leading-relaxed text-center font-medium">
            {opponent.login} {t('defis.mustConfirmScore')}
          </p>
        </div>
      )}

      {/* ─── Variante ÉCHECS : victoire / défaite / nulle ─────────────────── */}
      {opponent && hasOutcome && isChess && (
        <div className="relative mt-6 animate-slide-down space-y-4">
          <div className="px-4 py-3 rounded-xl bg-bg-1/80 border border-border text-center text-sm text-muted-2 leading-relaxed shadow-inner">
            {isDraw ? (
              <span className="font-extrabold text-gold">
                {t('defis.chessDraw')} {opponent.login}
              </span>
            ) : (
              <>
                <span className={`font-extrabold ${iWon ? 'text-teal' : 'text-text-strong'}`}>{winnerLogin}</span>
                {' '}{t('defis.checkmated')}{' '}
                <span className={`font-extrabold ${iWon ? 'text-text-strong' : 'text-teal'}`}>{loserLogin}</span>
              </>
            )}
            <div className="text-[11px] text-muted-2 mt-1">{t('defis.chessOnlyResult')}</div>
          </div>
          <Button
            size="md"
            loading={busy}
            onClick={triggerSend}
            className="w-full py-3.5 text-sm font-bold shadow-lg"
          >
            {t('defis.sendDeclaration')}
          </Button>
          <p className="text-[10px] text-muted/70 leading-relaxed text-center font-medium">
            {opponent.login} {t('defis.mustConfirmResult')}
          </p>
        </div>
      )}
    </motion.div>
    </div>
  );
}
