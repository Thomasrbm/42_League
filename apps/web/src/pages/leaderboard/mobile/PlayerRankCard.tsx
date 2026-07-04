import { memo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Skull, Swords, Trophy } from 'lucide-react';
import { Avatar } from '../../../components/Avatar';
import { OnlineBadge } from '../../../components/OnlineBadge';
import { SwipeableCard } from '../../../mobile/primitives/SwipeableCard';
import { RivetCorners } from '../../../mobile/primitives/RivetCorners';
import type { LeaderboardEntry, Ops } from '../../../lib/api';
import { haptic } from '../../../mobile/feedback/useHaptic';
import { WinRateBar } from '../../../components/WinRateBar';
import { BadgeChip } from '../../../components/Badges';
import { useT } from '../../../lib/i18n';
import { SheldonApostleAura, SHELDON_COLORS, isSheldonTitle } from '../../../components/SheldonApostle';

interface PlayerRankCardProps {
  entry: LeaderboardEntry;
  wins: number;
  losses: number;
  isMe: boolean;
  targetedBy?: Ops;
  /** Hôte 42 si l'utilisateur est connecté à l'école (ex. "c1r7s8"). */
  host?: string;
  /** Si fourni, le swipe gauche → droite déclenche cette action (défier). */
  onDefi?: (entry: LeaderboardEntry) => void;
  /** Saison passée : grise la photo (classement figé). */
  past?: boolean;
}

/**
 * Carte mobile d'un joueur dans le leaderboard.
 * - Tap → page profil
 * - Swipe vers la droite → défier (si onDefi fourni et pas moi-même)
 * - Highlight spécial pour "moi" + indicateur Ops
 */
export const PlayerRankCard = memo(function PlayerRankCard({
  entry,
  wins,
  losses,
  isMe,
  targetedBy,
  host,
  onDefi,
  past = false,
}: PlayerRankCardProps) {
  const t = useT();
  const navigate = useNavigate();

  const rankColor =
    entry.rank === 1
      ? 'text-gold'
      : entry.rank === 2
        ? 'text-muted-2'
        : entry.rank === 3
          ? 'text-[#cd7f32]'
          : 'text-muted';

  const isSheldon = isSheldonTitle(entry.title);

  const inner = (
    <motion.button
      type="button"
      onClick={() => {
        haptic('selection');
        navigate(`/player/${entry.login}`);
      }}
      whileTap={{ scale: 0.98 }}
      className={`relative w-full flex items-center gap-3 p-3.5 rounded-2xl border tap-transparent text-left transition-all hover-glow overflow-hidden ${
        isSheldon
          ? ''
          : isMe
            ? 'border-gold/60 bg-gold/[0.08] shadow-gold-glow'
            : 'border-gold/15 card-hud active:bg-bg-2'
      }`}
      style={isSheldon ? {
        borderColor: `${SHELDON_COLORS.slime}44`,
        background: `linear-gradient(135deg, #0d1d0d 0%, #071007 55%, #0a140a 100%)`,
        boxShadow: `0 0 0 1px ${SHELDON_COLORS.slime}22, 0 4px 20px -4px ${SHELDON_COLORS.slime}38`,
      } : undefined}
    >
      {/* Filets HUD haut/bas pour l'aspect cartouche */}
      <span
        className="absolute top-0 left-4 right-4 h-[1px] pointer-events-none"
        style={isSheldon
          ? { background: `linear-gradient(90deg, transparent, ${SHELDON_COLORS.slime}88, transparent)` }
          : { background: 'linear-gradient(90deg, transparent, rgba(255,201,74,0.35), transparent)' }
        }
      />
      <span
        className="absolute bottom-0 left-4 right-4 h-[1px] pointer-events-none"
        style={isSheldon
          ? { background: `linear-gradient(90deg, transparent, ${SHELDON_COLORS.bile}55, transparent)` }
          : { background: 'linear-gradient(90deg, transparent, rgba(255,201,74,0.2), transparent)' }
        }
      />
      {/* Aura Sheldon */}
      <SheldonApostleAura active={isSheldon} count={6} />
      {/* Rivets uniquement sur ma propre carte (signature visuelle) */}
      {isMe && !isSheldon && <RivetCorners size={6} inset={4} />}
      {/* Rank */}
      <div
        className={`w-10 flex-shrink-0 text-center font-mono font-black tabular-nums leading-none ${rankColor}`}
      >
        <div className="text-xl">#{entry.rank}</div>
      </div>

      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <Avatar login={entry.login} imageUrl={entry.imageUrl} size="md" grayscale={past} />
        {targetedBy && (
          <span
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red text-white flex items-center justify-center ring-2 ring-bg-0"
            title={`${t('lb.opsOf')} ${targetedBy.ownerLogin}`}
          >
            <Skull className="w-3 h-3" strokeWidth={2.5} />
          </span>
        )}
        {host && !targetedBy && (
          <OnlineBadge host={host} compact className="absolute -bottom-0.5 -right-0.5" />
        )}
      </div>

      {/* Login + title + tournois */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-extrabold text-text-strong truncate text-sm">
            {entry.login}
          </span>
          {entry.badges?.includes('goat') && <BadgeChip code="goat" size="xs" iconOnly />}
          {isMe && (
            <span className="text-[8px] font-extrabold text-[#1a1100] metal-plate-gold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
              {t('lb.me')}
            </span>
          )}
          {host && <OnlineBadge host={host} />}
        </div>
        {entry.title && (
          <div
            className={`text-[10px] italic truncate ${entry.titleColor === 'rainbow' ? 'title-rainbow' : ''}`}
            style={entry.titleColor === 'rainbow' ? undefined : { color: entry.titleColor ?? '#ffc94a' }}
          >« {entry.title} »</div>
        )}
        <div className="mt-1">
          <WinRateBar wins={wins} losses={losses} variant="compact" />
        </div>
        {entry.tournamentsWon !== undefined && entry.tournamentsWon > 0 && (
          <div className="flex items-center gap-1 mt-0.5 text-[9px] text-gold">
            <Trophy className="w-2.5 h-2.5" strokeWidth={2.5} />
            <span className="font-mono tabular-nums">{entry.tournamentsWon}</span>
          </div>
        )}
      </div>

      {/* ELO */}
      <div className="text-right flex-shrink-0">
        <div className="font-display text-base font-black tabular-nums text-gold leading-none" style={{ textShadow: '0 0 12px rgba(255,201,74,0.35)' }}>
          {entry.elo}
        </div>
        <div className="text-[9px] text-muted uppercase tracking-wider font-bold mt-0.5">
          ELO
        </div>
      </div>
    </motion.button>
  );

  if (onDefi && !isMe) {
    return (
      <SwipeableCard
        leftAction={{
          label: t('lb.defi'),
          color: 'teal',
          icon: Swords,
          onTrigger: () => onDefi(entry),
        }}
      >
        {inner}
      </SwipeableCard>
    );
  }

  return inner;
});
