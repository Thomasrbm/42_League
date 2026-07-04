import { motion } from 'framer-motion';
import { Clock, Swords } from 'lucide-react';
import { SwipeableCard } from '../../../mobile/primitives/SwipeableCard';
import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { PlayerLink } from '../../../components/PlayerLink';
import type { Challenge } from '../../../lib/api';
import { fmtRelative } from '../../../lib/format';
import { useI18n, useT } from '../../../lib/i18n';
import { useOpsStatus } from '../../../hooks/useOpsStatus';
import { challengeCancelState } from '../shared/useDefisLogic';
import { Cooldown } from '../shared/Cooldown';

type Kind = 'incoming' | 'outgoing' | 'accepted';

interface ChallengeMobileCardProps {
  challenge: Challenge;
  kind: Kind;
  myLogin: string | undefined;
  imageUrl?: string | null;
  onAccept: () => void;
  onDecline: () => void;
  /** Demande d'annulation à l'amiable (défi accepté uniquement). */
  onAmicableRequest?: () => void;
  /** Réponse à une demande d'annulation à l'amiable (accept = true/false). */
  onAmicableRespond?: (accept: boolean) => void;
}

const KIND_LABEL_KEY: Record<Kind, string> = {
  incoming: 'defis.challengeReceived',
  outgoing: 'defis.challengeSent',
  accepted: 'defis.matchPlanned',
};

const KIND_TONE: Record<Kind, { border: string; badge: string; icon: string }> = {
  incoming: {
    border: 'border-gold/50',
    badge: 'bg-gold/15 text-gold border border-gold/30',
    icon: 'text-gold',
  },
  outgoing: {
    border: 'border-border',
    badge: 'bg-bg-2 text-muted-2 border border-border',
    icon: 'text-muted-2',
  },
  accepted: {
    border: 'border-gold/40',
    badge: 'bg-gold/15 text-gold border border-gold/30',
    icon: 'text-gold',
  },
};

/**
 * Carte de défi mobile.
 * - Pour les "incoming" : swipe à gauche = refuser, swipe à droite = accepter
 * - Pour "outgoing" / "accepted" : pas de swipe, juste des boutons compacts
 */
export function ChallengeMobileCard({
  challenge,
  kind,
  myLogin,
  imageUrl,
  onAccept,
  onDecline,
  onAmicableRequest,
  onAmicableRespond,
}: ChallengeMobileCardProps) {
  const { lang } = useI18n();
  const t = useT();
  const { isOpsDuel } = useOpsStatus();
  const opponent =
    challenge.challengerLogin === myLogin ? challenge.opponentLogin : challenge.challengerLogin;
  const isOps = challenge.mode !== '2v2' && isOpsDuel(challenge.challengerLogin, challenge.opponentLogin, challenge.createdAt);
  const when = fmtRelative(challenge.scheduledAt, lang);
  const tone = KIND_TONE[kind];
  const cancelState = challengeCancelState(challenge, myLogin);

  const Inner = (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={`relative card-hud border ${tone.border} rounded-2xl p-3.5 flex items-center gap-3 hover-glow ${isOps ? 'ops-duel' : ''}`}
    >
      <Avatar login={opponent} imageUrl={imageUrl ?? null} size="md" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Swords className={`w-3 h-3 ${tone.icon}`} strokeWidth={2.5} />
          <span className={`text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded ${tone.badge}`}>
            {t(KIND_LABEL_KEY[kind])}
          </span>
        </div>
        <PlayerLink login={opponent} className="font-display font-bold text-text-strong text-sm">
          {opponent}
        </PlayerLink>
        {challenge.mode === '2v2' && (
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider bg-red/15 text-red border border-red/30">
              2 vs 2
            </span>
            <span className="text-[10px] text-muted-2 truncate">
              {challenge.challengerLogin} &amp; {challenge.partnerLogin} vs {challenge.opponentLogin} &amp; {challenge.opponentPartnerLogin}
            </span>
          </div>
        )}
        <div className={`text-[11px] mt-0.5 flex items-center gap-1 ${when.late ? 'text-red' : 'text-muted-2'}`}>
          <Clock className="w-3 h-3" strokeWidth={2.5} />
          <span>{when.text}</span>
        </div>
        {/* Cooldown 48h : un défi reçu non accepté sous ce délai expire (sans pénalité). */}
        {kind === 'incoming' && (
          <div className="mt-1">
            <Cooldown
              from={challenge.createdAt}
              label={t('defis.cooldown.expireIn')}
              expiredLabel={t('defis.cooldown.expired')}
            />
          </div>
        )}
      </div>

      {kind === 'incoming' && (
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <Button size="sm" onClick={onAccept} className="text-[10px] px-3">
            {t('defis.accept')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDecline}
            className="text-[10px] px-3 text-red border-red/30 hover:border-red hover:bg-red/5 hover:text-red"
          >
            {t('defis.decline')}
          </Button>
        </div>
      )}
      {kind === 'outgoing' && (
        <Button size="sm" variant="ghost" onClick={onDecline} className="text-[10px]">
          {t('defis.cancel')}
        </Button>
      )}
      {/* Duel OPS forcé : pas de fuite ni d'annulation à l'amiable — seul le score. */}
      {kind === 'accepted' && isOps && (
        <Button size="sm" onClick={onAccept} className="text-[10px] px-3 flex-shrink-0">
          {t('defis.scoreShort')}
        </Button>
      )}
      {kind === 'accepted' && !isOps && (
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <Button size="sm" onClick={onAccept} className="text-[10px] px-3">
            {t('defis.scoreShort')}
          </Button>
          {cancelState === 'awaiting_my_response' ? (
            <>
              <Button size="sm" onClick={() => onAmicableRespond?.(true)} className="text-[10px] px-3">
                {t('defis.amicable.accept')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onAmicableRespond?.(false)} className="text-[10px] px-3">
                {t('defis.amicable.refuse')}
              </Button>
            </>
          ) : cancelState === 'requested_by_my_team' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDecline}
              className="text-[10px] px-3 text-red border-red/30 hover:border-red hover:bg-red/5 hover:text-red"
            >
              {t('defis.flee')}
            </Button>
          ) : cancelState === 'none' ? (
            <>
              <Button size="sm" variant="ghost" onClick={onAmicableRequest} className="text-[10px] px-3">
                {t('defis.amicable.request')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDecline}
                className="text-[10px] px-3 text-red border-red/30 hover:border-red hover:bg-red/5 hover:text-red"
              >
                {t('defis.flee')}
              </Button>
            </>
          ) : null}
        </div>
      )}
    </motion.div>
  );

  // Défis reçus : boutons explicites (ci-dessus) + swipe en bonus (accepter/refuser).
  if (kind === 'incoming') {
    return (
      <SwipeableCard
        leftAction={{ label: t('defis.accept'), color: 'teal', onTrigger: onAccept }}
        rightAction={{ label: t('defis.decline'), color: 'red', onTrigger: onDecline }}
      >
        {Inner}
      </SwipeableCard>
    );
  }

  return Inner;
}
