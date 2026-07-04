import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Clock, X, Zap } from 'lucide-react';
import { Button } from '../../../components/Button';
import { ContestModal } from '../../../components/ContestModal';
import { PlayerLink } from '../../../components/PlayerLink';
import { api, type PendingMatch } from '../../../lib/api';
import { useFlash } from '../../../hooks/useFlash';
import { useOpsStatus } from '../../../hooks/useOpsStatus';
import { useT } from '../../../lib/i18n';
import { haptic } from '../../../mobile/feedback/useHaptic';
import { Cooldown } from '../shared/Cooldown';

// ─── Pill par joueur pour les confirmations 2v2 ───────────────────────────────

function ConfirmPill({
  login,
  confirmed,
  isMe,
}: {
  login: string;
  confirmed: boolean | null | undefined;
  isMe: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold transition-colors ${
        confirmed
          ? 'border-[#7fd66e]/50 bg-[#7fd66e]/10 text-[#7fd66e]'
          : isMe
            ? 'border-gold/50 bg-gold/10 text-gold'
            : 'border-border/60 bg-bg-1/60 text-muted-2'
      }`}
    >
      {confirmed ? (
        <Check className="w-3 h-3 flex-shrink-0" strokeWidth={3} />
      ) : (
        <Clock className="w-3 h-3 flex-shrink-0 opacity-60" strokeWidth={2.5} />
      )}
      <span className="truncate max-w-[72px]">{isMe ? 'Toi' : login}</span>
    </div>
  );
}

interface PendingMatchCardProps {
  match: PendingMatch;
  myLogin?: string;
  onDone: () => Promise<void>;
}

/**
 * Carte d'un match en attente de confirmation côté mobile.
 * Deux issues nettes : soit on confirme le score déclaré tel quel (validation
 * directe, l'ELO bouge), soit on conteste avec une justification. Pas de re-saisie
 * du score à la confirmation.
 */
export function PendingMatchCard({ match, myLogin, onDone }: PendingMatchCardProps) {
  const t = useT();
  const flash = useFlash();
  const { isOpsDuel } = useOpsStatus();
  const isOps = match.mode !== '2v2' && isOpsDuel(match.declarerLogin, match.opponentLogin, match.declaredAt);
  const [contesting, setContesting] = useState(false);
  const [busy, setBusy] = useState(false);
  // Dès qu'on a tranché (confirmé/contesté avec succès), la carte se retire
  // immédiatement — sans attendre le refresh réseau (qui peut être lent).
  const [resolved, setResolved] = useState(false);
  // Suivi local des confirmations 2v2 (avant refresh serveur).
  const [localConfirms, setLocalConfirms] = useState({
    partner1: match.partner1Confirmed ?? false,
    opp1: match.opp1Confirmed ?? false,
    opp2: match.opp2Confirmed ?? false,
  });

  // Vainqueur déterminé par comparaison de scores (et non « = 10 ») : valable
  // pour toutes les disciplines (babyfoot 10-x, échecs 1-0, smash 2-1).
  const iWon = match.scoreOpponent > match.scoreDeclarer;
  // Nulle (échecs) : les deux scores égaux (0-0).
  const isDraw = match.game === 'chess' && match.scoreDeclarer === match.scoreOpponent;

  // ── Confirmation 2v2 ──────────────────────────────────────────────────────────
  const handleConfirm2v2 = async () => {
    setBusy(true);
    try {
      const res = await api.confirm2v2Match(match.id);
      if ('status' in res && res.status === 'waiting') {
        // Mise à jour optimiste locale — on marque ce joueur comme confirmé.
        const me = myLogin ?? '';
        setLocalConfirms((prev) => ({
          partner1: prev.partner1 || me === match.partner1Login,
          opp1:     prev.opp1    || me === match.opponentLogin,
          opp2:     prev.opp2    || me === match.partner2Login,
        }));
        flash.show(`${res.confirmed}/3 joueurs ont confirmé — en attente des autres`);
        haptic('light');
        setBusy(false);
      } else {
        // Settlement déclenché — tous ont confirmé.
        flash.show(t('defis.matchConfirmedM'));
        haptic('success');
        setResolved(true);
        await onDone();
      }
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      haptic('error');
      setBusy(false);
    }
  };

  // ── Confirmation 1v1 ──────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    setBusy(true);
    try {
      // On confirme exactement le score déclaré (du point de vue « toi ») —
      // aucune re-saisie : c'est l'accord sur la version du déclarant.
      await api.confirmMatch(match.id, match.scoreOpponent, match.scoreDeclarer, {
        game: match.game,
        bestOf: match.bestOf as 3 | 5 | undefined,
      });
      flash.show(t('defis.matchConfirmedM'));
      haptic('success');
      setResolved(true);
      await onDone();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      haptic('error');
      setBusy(false);
    }
  };

  const handleContestSubmit = async (
    reason: 'never_played' | 'wrong_score',
    message: string,
  ) => {
    // Ferme la popup tout de suite (UX) et retire la carte au succès.
    setContesting(false);
    setBusy(true);
    try {
      await api.rejectMatch(match.id, reason, message);
      flash.show(t('defis.contestSent'));
      haptic('warning');
      setResolved(true);
      await onDone();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
      haptic('error');
      setBusy(false);
    }
  };

  if (resolved) return null;

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className={`relative overflow-hidden rounded-2xl border-2 border-gold/60 bg-gradient-to-br from-gold/[0.10] to-bg-1/85 backdrop-blur-md shadow-lg ${isOps ? 'ops-duel' : ''}`}
        style={isOps ? undefined : { boxShadow: '0 6px 28px -8px rgba(255,201,74,0.35), inset 0 1px 0 rgba(255,215,120,0.12)' }}
      >
        {/* Liseré animé en haut */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gold to-transparent animate-pulse" />
        {/* Petite trame HUD */}
        <div className="absolute inset-0 hud-diag opacity-40 pointer-events-none" />

        <div className="p-4">
          <div className="flex items-center gap-2 text-xs mb-3">
            <Zap className="w-4 h-4 text-gold animate-ember" strokeWidth={2.5} fill="rgba(255,201,74,0.35)" />
            <PlayerLink login={match.declarerLogin} className="font-bold text-gold">
              {match.declarerLogin}
            </PlayerLink>
            <span className="text-muted-2">{t('defis.declared')}</span>
          </div>

          {/* Cooldown 48h : passé ce délai sans réponse, le match est auto-validé. */}
          <div className="flex justify-center mb-3">
            <Cooldown
              from={match.declaredAt}
              label={t('defis.cooldown.autoValidateIn')}
              expiredLabel={t('defis.cooldown.autoValidating')}
            />
          </div>

          {/* Discipline du match */}
          {match.game && match.game !== 'babyfoot' && (
            <div className="flex justify-center mb-2">
              <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-[0.14em] bg-accent/15 text-accent border border-accent/30">
                {match.game === 'smash' ? `🎮 ${t('game.smash')}` : match.game === 'streetfighter' ? `🥊 ${t('game.streetfighter')}` : `♟ ${t('game.chess')}`}
              </span>
            </div>
          )}

          {/* Mode 2v2 : badge + composition + statuts de confirmation */}
          {match.mode === '2v2' && (
            <div className="mb-3 space-y-2.5">
              {/* Badge + score */}
              <div className="flex items-center justify-center gap-2">
                <span className="inline-flex items-center px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-[0.14em] bg-red/15 text-red border border-red/30">
                  2 vs 2
                </span>
              </div>

              {/* Équipes */}
              <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-text-strong">
                <span className="text-gold">
                  {match.declarerLogin} &amp; {match.partner1Login}
                </span>
                <span className="text-muted-2">vs</span>
                <span>
                  {match.opponentLogin} &amp; {match.partner2Login}
                </span>
              </div>

              {/* Statut de confirmation par joueur */}
              {(() => {
                const me = myLogin ?? '';
                const p1c = localConfirms.partner1;
                const o1c = localConfirms.opp1;
                const o2c = localConfirms.opp2;
                const confirmedCount = [p1c, o1c, o2c].filter(Boolean).length;
                return (
                  <div className="space-y-1.5">
                    <div className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-muted text-center">
                      {confirmedCount}/3 confirmations
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <ConfirmPill
                        login={match.partner1Login ?? ''}
                        confirmed={p1c}
                        isMe={me === match.partner1Login}
                      />
                      <ConfirmPill
                        login={match.opponentLogin}
                        confirmed={o1c}
                        isMe={me === match.opponentLogin}
                      />
                      <ConfirmPill
                        login={match.partner2Login ?? ''}
                        confirmed={o2c}
                        isMe={me === match.partner2Login}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {isDraw ? (
            <div className="relative flex items-center justify-center gap-2 mb-3 font-display">
              <span className="text-3xl font-black text-gold text-gold-emboss uppercase tracking-wide">
                ♟ {t('defis.draw')} · ½–½
              </span>
            </div>
          ) : (
            <div className="relative flex items-baseline justify-center gap-2 mb-3 font-display">
              <span
                className={`text-4xl font-black tabular-nums ${
                  match.scoreDeclarer > match.scoreOpponent ? 'text-gold text-gold-emboss' : 'text-text-strong'
                }`}
              >
                {match.game === 'chess' && match.scoreDeclarer > match.scoreOpponent ? 'V' : match.scoreDeclarer}
              </span>
              <span className="text-2xl text-muted">–</span>
              <span
                className={`text-4xl font-black tabular-nums ${
                  match.scoreOpponent > match.scoreDeclarer ? 'text-gold text-gold-emboss' : 'text-text-strong'
                }`}
              >
                {match.game === 'chess' && match.scoreOpponent > match.scoreDeclarer ? 'V' : match.scoreOpponent}
              </span>
            </div>
          )}
          <div className="text-center text-[10px] text-muted uppercase tracking-wider font-bold mb-4">
            {match.declarerLogin} <span className="opacity-50 mx-1">/</span> {t('common.toi')}
            <span className="block normal-case tracking-normal text-muted-2 mt-1">
              {t('defis.accordingTo')} {match.declarerLogin}{t('defis.accordingToYouHave')} {isDraw ? t('defis.drew') : iWon ? t('defis.won') : t('defis.lost')}. {t('defis.confirmIfExact')}
            </span>
          </div>

          {match.mode === '2v2' ? (
            /* ── Confirmation 2v2 : présence uniquement ── */
            (() => {
              const me = myLogin ?? '';
              const alreadyConfirmed =
                (me === match.partner1Login && localConfirms.partner1) ||
                (me === match.opponentLogin && localConfirms.opp1) ||
                (me === match.partner2Login && localConfirms.opp2);
              return alreadyConfirmed ? (
                <div className="flex items-center justify-center gap-2 py-2 text-[11px] text-[#7fd66e] font-bold">
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  Tu as confirmé — en attente des autres
                </div>
              ) : (
                <Button
                  size="md"
                  loading={busy}
                  onClick={handleConfirm2v2}
                  className="w-full py-3 text-sm"
                >
                  <Check className="w-4 h-4 mr-1.5" strokeWidth={3} />
                  Je confirme ce match
                </Button>
              );
            })()
          ) : (
            /* ── Confirmation 1v1 : score + contest ── */
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="md"
                loading={busy}
                onClick={handleConfirm}
                className="py-3 text-sm"
              >
                <Check className="w-4 h-4 mr-1.5" strokeWidth={3} />
                {t('defis.confirm')}
              </Button>
              <Button
                size="md"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  haptic('light');
                  setContesting(true);
                }}
                className="py-3 text-sm text-red border-red/30 hover:border-red hover:bg-red/5 hover:text-red"
              >
                <X className="w-4 h-4 mr-1.5" strokeWidth={3} />
                {t('defis.contest')}
              </Button>
            </div>
          )}
        </div>
      </motion.div>

      {contesting && (
        <ContestModal
          declarerLogin={match.declarerLogin}
          score={`${match.scoreDeclarer}–${match.scoreOpponent}`}
          busy={busy}
          onSubmit={handleContestSubmit}
          onClose={() => setContesting(false)}
        />
      )}
    </>
  );
}
