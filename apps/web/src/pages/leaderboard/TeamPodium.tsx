import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Crown } from 'lucide-react';
import type { BabyfootTeamEntry } from '../../lib/api';
import { haptic } from '../../mobile/feedback/useHaptic';
import { useT } from '../../lib/i18n';

type TeamEntry = BabyfootTeamEntry & {
  player1ImageUrl?: string | null;
  player2ImageUrl?: string | null;
};

interface TeamPodiumProps {
  top3: TeamEntry[];
}

const GOLD_GRAD = 'linear-gradient(135deg, #d4a04a 0%, #8a5e10 50%, #c79122 100%)';

/**
 * Podium top 3 des équipes Babyfoot 2v2 — pendant « duo » du podium individuel.
 * Or au centre (surélevé + couronne), argent à gauche, bronze à droite.
 * Chaque marche montre les deux avatars du duo, l'ELO d'équipe et le win rate.
 * Tap → page profil de l'équipe (/team/:id).
 */
export function TeamPodium({ top3 }: TeamPodiumProps) {
  const navigate = useNavigate();
  const [p1, p2, p3] = top3;

  const goTo = (id: string) => {
    haptic('selection');
    navigate(`/team/${id}`);
  };

  return (
    <div className="relative mb-5">
      {/* Glow de fond */}
      <div
        className="absolute inset-x-4 top-4 bottom-0 rounded-3xl opacity-50 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(255,201,74,0.35), transparent 60%)',
          filter: 'blur(28px)',
        }}
      />

      {/* Rayons de soleil tournants */}
      <div className="absolute inset-x-0 top-0 h-56 pointer-events-none overflow-hidden opacity-40 [mask-image:radial-gradient(ellipse_70%_100%_at_50%_0%,black,transparent_72%)]">
        <div
          className="absolute left-1/2 -translate-x-1/2 top-0 aspect-square w-[680px] max-w-none animate-spin-sun"
          style={{
            background:
              'repeating-conic-gradient(rgba(255,201,74,0.14) 0deg 5deg, transparent 5deg 16deg)',
          }}
        />
      </div>

      <div className="relative grid grid-cols-3 items-end gap-2 sm:gap-4 pt-6 max-w-2xl mx-auto">
        {p2 && <TeamSlot entry={p2} color="silver" height="h-24" delay={0.15} onClick={goTo} />}
        {p1 && <TeamSlot entry={p1} color="gold" height="h-32" delay={0} onClick={goTo} />}
        {p3 && <TeamSlot entry={p3} color="bronze" height="h-20" delay={0.25} onClick={goTo} />}
      </div>
    </div>
  );
}

type PodiumColor = 'gold' | 'silver' | 'bronze';

const COLOR_STEP: Record<PodiumColor, string> = {
  gold: 'bg-gradient-to-b from-gold/40 via-gold/15 to-gold/5 border-gold/40',
  silver: 'bg-gradient-to-b from-muted-2/30 via-muted-2/10 to-muted-2/5 border-muted-2/30',
  bronze: 'bg-gradient-to-b from-[#cd7f32]/35 via-[#cd7f32]/10 to-[#cd7f32]/5 border-[#cd7f32]/35',
};
const COLOR_RING: Record<PodiumColor, string> = {
  gold: 'ring-gold/70 shadow-gold-glow',
  silver: 'ring-muted-2/60',
  bronze: 'ring-[#cd7f32]/60',
};
const COLOR_TEXT: Record<PodiumColor, string> = {
  gold: 'text-gold',
  silver: 'text-muted-2',
  bronze: 'text-[#cd7f32]',
};
const COLOR_RANK: Record<PodiumColor, string> = {
  gold: 'metal-plate-gold shadow-gold-glow text-[#1a1100]',
  silver: 'bg-gradient-to-br from-[#d6d2c8] to-[#7d7468] text-bg-0',
  bronze: 'bg-gradient-to-br from-[#cd7f32] to-[#8b5722] text-white',
};

function DuoAvatar({
  login,
  imageUrl,
  color,
  className = '',
}: {
  login: string;
  imageUrl?: string | null;
  color: PodiumColor;
  className?: string;
}) {
  return (
    <div
      className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full overflow-hidden ring-2 ring-offset-2 ring-offset-bg-0 ${COLOR_RING[color]} ${className}`}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={login} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center text-sm font-black text-[#1a1100]"
          style={{ background: GOLD_GRAD }}
        >
          {login[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}

function TeamSlot({
  entry,
  color,
  height,
  delay,
  onClick,
}: {
  entry: TeamEntry;
  color: PodiumColor;
  height: string;
  delay: number;
  onClick: (id: string) => void;
}) {
  const t = useT();
  const isFirst = entry.rank === 1;
  const games = entry.wins + entry.losses;
  const winRate = games === 0 ? 0 : Math.round((entry.wins / games) * 100);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => onClick(entry.id)}
      className="flex flex-col items-center gap-2 tap-transparent active:scale-95 transition-transform focus:outline-none"
    >
      {/* Duo d'avatars chevauchés + couronne pour le #1 */}
      <motion.div
        className="relative"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: delay + 0.4 }}
      >
        {isFirst && (
          <motion.div
            initial={{ y: -20, opacity: 0, rotate: -20 }}
            animate={{ y: [0, -4, 0], opacity: 1, rotate: 0 }}
            transition={{
              opacity: { delay: 0.4, duration: 0.4 },
              rotate: { delay: 0.4, type: 'spring', stiffness: 400, damping: 14 },
              y: { delay: 0.7, duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
            }}
            className="absolute -top-7 left-1/2 -translate-x-1/2 text-gold z-10 drop-shadow-[0_2px_8px_rgba(255,201,74,0.6)]"
          >
            <Crown className="w-7 h-7" strokeWidth={2.5} fill="currentColor" />
          </motion.div>
        )}
        <div className="relative flex items-center justify-center w-16 sm:w-20 h-9 sm:h-11">
          <DuoAvatar
            login={entry.player1Login}
            imageUrl={entry.player1ImageUrl}
            color={color}
            className="absolute left-0 top-0 z-10"
          />
          <DuoAvatar
            login={entry.player2Login}
            imageUrl={entry.player2ImageUrl}
            color={color}
            className="absolute right-0 top-0"
          />
        </div>
        {/* Pastille rang */}
        <div
          className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold font-mono ring-2 ring-bg-0 ${COLOR_RANK[color]}`}
        >
          {entry.rank}
        </div>
      </motion.div>

      {/* Nom du duo / logins + ELO + win rate */}
      <div className="text-center mt-1 max-w-full px-1 w-full">
        <div className={`text-[11px] font-extrabold truncate ${COLOR_TEXT[color]}`}>
          {entry.name ?? `${entry.player1Login} & ${entry.player2Login}`}
        </div>
        <div
          className="font-display font-black tabular-nums text-gold leading-tight text-sm"
          style={{ textShadow: '0 0 12px rgba(255,201,74,0.4)' }}
        >
          {entry.elo}
          <span className="text-[8px] text-muted ms-1 font-bold uppercase tracking-wider">ELO</span>
        </div>
        {games > 0 && (
          <div className="text-[9px] font-mono tabular-nums text-muted leading-tight mt-0.5">
            {winRate}% · {games}G
          </div>
        )}
        {isFirst && (
          <div className="mt-1 inline-block text-[8px] font-extrabold uppercase tracking-[0.18em] text-gold/90">
            {t('lb.podium.champion')}
          </div>
        )}
      </div>

      {/* Marche */}
      <div
        className={`w-full ${height} rounded-t-2xl border-t border-s border-e flex items-start justify-center pt-1.5 ${COLOR_STEP[color]}`}
      >
        <span className={`font-mono font-black text-3xl ${COLOR_TEXT[color]} opacity-50`}>
          {entry.rank}
        </span>
      </div>
    </motion.button>
  );
}
