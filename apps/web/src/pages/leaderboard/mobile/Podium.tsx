import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Crown } from 'lucide-react';
import type { LeaderboardEntry } from '../../../lib/api';
import { haptic } from '../../../mobile/feedback/useHaptic';
import { AnimatedCounter } from '../../../mobile/primitives/AnimatedCounter';
import { useFlickSpin } from '../../../hooks/useFlickSpin';

interface PodiumProps {
  top3: LeaderboardEntry[];
  /** login → { winRate, games } affiché sous l'ELO de chaque marche. */
  statsByLogin?: Map<string, { winRate: number; games: number }>;
  /** Saison passée : grise les photos (classement figé). */
  past?: boolean;
}

/**
 * Podium top 3 mobile — visuel "récompenses olympiques" avec or, argent, bronze.
 * - Or au centre, surélevé, avec couronne
 * - Argent à gauche
 * - Bronze à droite
 * - Tap sur un joueur → sa page profil
 */
export function Podium({ top3, statsByLogin, past = false }: PodiumProps) {
  const navigate = useNavigate();
  const [p1, p2, p3] = top3;

  const goTo = (login: string) => {
    haptic('selection');
    navigate(`/player/${login}`);
  };

  return (
    <div className="relative">
      {/* Glow de fond */}
      <div
        className="absolute inset-x-4 top-4 bottom-0 rounded-3xl opacity-50 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(255,201,74,0.35), transparent 60%)',
          filter: 'blur(28px)',
        }}
      />

      {/* Rayons de soleil tournants (comme le podium desktop) */}
      <div className="absolute inset-x-0 top-0 h-56 pointer-events-none overflow-hidden opacity-40 [mask-image:radial-gradient(ellipse_70%_100%_at_50%_0%,black,transparent_72%)]">
        <div
          className="absolute left-1/2 -translate-x-1/2 top-0 aspect-square w-[680px] max-w-none animate-spin-sun"
          style={{
            background:
              'repeating-conic-gradient(rgba(255,201,74,0.14) 0deg 5deg, transparent 5deg 16deg)',
          }}
        />
      </div>

      <div className="relative grid grid-cols-3 items-end gap-2 pt-6">
        {/* 2nd place — left */}
        {p2 && (
          <PodiumSlot
            rank={p2.rank}
            entry={p2}
            stats={statsByLogin?.get(p2.login)}
            onClick={goTo}
            height="h-24"
            color="silver"
            delay={0.15}
            past={past}
          />
        )}

        {/* 1st place — center, elevated */}
        {p1 && (
          <PodiumSlot
            rank={p1.rank}
            entry={p1}
            stats={statsByLogin?.get(p1.login)}
            onClick={goTo}
            height="h-32"
            color="gold"
            delay={0}
            past={past}
          />
        )}

        {/* 3rd place — right */}
        {p3 && (
          <PodiumSlot
            rank={p3.rank}
            entry={p3}
            stats={statsByLogin?.get(p3.login)}
            onClick={goTo}
            height="h-20"
            color="bronze"
            delay={0.25}
            past={past}
          />
        )}
      </div>
    </div>
  );
}

type PodiumColor = 'gold' | 'silver' | 'bronze';

interface PodiumSlotProps {
  rank: number;
  entry: LeaderboardEntry;
  stats?: { winRate: number; games: number };
  onClick: (login: string) => void;
  height: string;
  color: PodiumColor;
  delay: number;
  past?: boolean;
}

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
  gold: 'metal-plate-gold shadow-gold-glow',
  silver: 'bg-gradient-to-br from-[#d6d2c8] to-[#7d7468] text-bg-0',
  bronze: 'bg-gradient-to-br from-[#cd7f32] to-[#8b5722] text-white',
};

function PodiumSlot({ rank, entry, stats, onClick, height, color, delay, past = false }: PodiumSlotProps) {
  const spinRef = useFlickSpin<HTMLDivElement>();
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => onClick(entry.login)}
      className="flex flex-col items-center gap-2 tap-transparent active:scale-95 transition-transform"
    >
      {/* Avatar + couronne pour le #1 — flotte doucement (photo en lévitation) */}
      <motion.div
        className="relative"
        animate={{ y: [0, -6, 0] }}
        transition={{
          duration: 3.2,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: delay + 0.4,
        }}
      >
        {rank === 1 && (
          <motion.div
            initial={{ y: -20, opacity: 0, rotate: -20 }}
            animate={{ y: [0, -4, 0], opacity: 1, rotate: 0 }}
            transition={{
              opacity: { delay: 0.4, duration: 0.4 },
              rotate: { delay: 0.4, type: 'spring', stiffness: 400, damping: 14 },
              y: { delay: 0.7, duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
            }}
            className="absolute -top-7 left-1/2 -translate-x-1/2 text-gold drop-shadow-[0_2px_8px_rgba(255,201,74,0.6)]"
          >
            <Crown className="w-7 h-7" strokeWidth={2.5} fill="currentColor" />
          </motion.div>
        )}
        {/* Le spin 3D est porté par CE wrapper ; le cercle (clip rond + ring) est
            un enfant non-transformé → toute la pièce ronde pivote ensemble, sans
            que les coins carrés de la photo ne dépassent. */}
        <div ref={spinRef}>
          <div
            className={`relative w-14 h-14 rounded-full overflow-hidden ring-2 ring-offset-2 ring-offset-bg-0 ${COLOR_RING[color]} ${past ? 'grayscale opacity-80' : ''}`}
          >
            {entry.imageUrl ? (
              <img src={entry.imageUrl} alt={entry.login} className="w-full h-full object-cover" />
            ) : (
              <div className={`relative w-full h-full bg-bg-2 flex items-center justify-center text-lg font-extrabold ${COLOR_TEXT[color]}`}>
                {/* Reflet diagonal : surface à suivre du regard → la rotation 3D du
                    disque uni se lit comme une pièce qui tourne (cf. la photo). */}
                <span
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0) 36%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0) 64%)' }}
                />
                <span className="relative">{entry.login[0]?.toUpperCase()}</span>
              </div>
            )}
          </div>
        </div>
        {/* Rank chip */}
        <div
          className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold font-mono ring-2 ring-bg-0 ${COLOR_RANK[color]}`}
        >
          {rank}
        </div>
      </motion.div>

      {/* Login */}
      <div className="text-center mt-1 max-w-full px-1">
        <div className={`text-[11px] font-extrabold truncate ${COLOR_TEXT[color]}`}>
          {entry.login}
        </div>
        <div className="text-[10px] font-mono tabular-nums text-text-strong leading-tight">
          <AnimatedCounter value={entry.elo} duration={1.0} />
        </div>
        {stats && stats.games > 0 && (
          <div className="text-[9px] font-mono tabular-nums text-muted leading-tight mt-0.5">
            {stats.winRate}% · {stats.games}G
          </div>
        )}
      </div>

      {/* Step */}
      <div
        className={`w-full ${height} rounded-t-2xl border-t border-s border-e flex items-start justify-center pt-1.5 ${COLOR_STEP[color]}`}
      >
        <span className={`font-mono font-black text-3xl ${COLOR_TEXT[color]} opacity-50`}>
          {rank}
        </span>
      </div>
    </motion.button>
  );
}
