import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Crown } from 'lucide-react';
import type { LeaderboardEntry } from '../../lib/api';
import { Avatar } from '../../components/Avatar';
import { RankedBadge } from '../../components/RankedBadge';
import { useT } from '../../lib/i18n';
import { useFlickSpin } from '../../hooks/useFlickSpin';

interface DesktopPodiumProps {
  top3: LeaderboardEntry[];
  /** login → { winRate, games } pour afficher un badge sous chaque marche. */
  statsByLogin: Map<string, { winRate: number; games: number }>;
  /** Saison passée : grise les photos (classement figé). */
  past?: boolean;
}

/**
 * Podium desktop "effet WAOUH" pour le Top 3.
 * - Scène en perspective 3D, marches en métal brossé (or / argent / bronze)
 * - #1 surélevé au centre, couronne flottante, halo doré pulsé
 * - Rayons de lumière + particules dorées en fond
 * - Hover : la marche se soulève légèrement et brille
 */
export function DesktopPodium({ top3, statsByLogin, past = false }: DesktopPodiumProps) {
  const [p1, p2, p3] = top3;

  return (
    <div className="relative overflow-hidden rounded-3xl card-hud px-6 pt-10 pb-0 mb-6">
      {/* Halo radial doré */}
      <div
        className="absolute inset-x-0 top-0 h-64 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 80% at 50% 0%, rgba(255,201,74,0.28), transparent 65%)',
        }}
      />
      {/* Rayons de lumière en éventail */}
      <div className="absolute inset-x-0 top-0 h-72 pointer-events-none overflow-hidden opacity-40 [mask-image:radial-gradient(ellipse_70%_100%_at_50%_0%,black,transparent_72%)]">
        {/* Soleil : grand carré centré en haut, rayons en éventail tout autour,
            qui tourne sur lui-même → rotation infinie sans bord qui disparaît. */}
        <div
          className="absolute left-1/2 top-0 aspect-square w-[1400px] max-w-none animate-spin-sun"
          style={{
            background:
              'repeating-conic-gradient(rgba(255,201,74,0.14) 0deg 5deg, transparent 5deg 16deg)',
          }}
        />
      </div>

      <div
        className="relative grid grid-cols-3 items-end gap-4 max-w-2xl mx-auto"
        style={{ perspective: '1200px' }}
      >
        {p2 && (
          <PodiumColumn
            entry={p2}
            rank={2}
            color="silver"
            stepClass="h-28"
            delay={0.12}
            stats={statsByLogin.get(p2.login)}
            past={past}
          />
        )}
        {p1 && (
          <PodiumColumn
            entry={p1}
            rank={1}
            color="gold"
            stepClass="h-44"
            delay={0}
            stats={statsByLogin.get(p1.login)}
            past={past}
          />
        )}
        {p3 && (
          <PodiumColumn
            entry={p3}
            rank={3}
            color="bronze"
            stepClass="h-20"
            delay={0.22}
            stats={statsByLogin.get(p3.login)}
            past={past}
          />
        )}
      </div>
    </div>
  );
}

type PodiumColor = 'gold' | 'silver' | 'bronze';

const STEP: Record<PodiumColor, string> = {
  gold: 'from-[#3a2e10] via-[#241c08] to-[#0f0c04] border-gold/45',
  silver: 'from-[#2c2e33] via-[#1c1d20] to-[#0e0e10] border-[#c9cdd6]/30',
  bronze: 'from-[#33220f] via-[#1f1408] to-[#0e0905] border-[#cd7f32]/35',
};
const RING: Record<PodiumColor, string> = {
  gold: 'ring-gold shadow-[0_0_28px_rgba(255,201,74,0.55)]',
  silver: 'ring-[#c9cdd6]/80 shadow-[0_0_18px_rgba(201,205,214,0.35)]',
  bronze: 'ring-[#cd7f32]/80 shadow-[0_0_18px_rgba(205,127,50,0.35)]',
};
const TXT: Record<PodiumColor, string> = {
  gold: 'text-gold',
  silver: 'text-[#d6dae3]',
  bronze: 'text-[#e0954c]',
};
const BADGE: Record<PodiumColor, string> = {
  gold: 'metal-plate-gold text-[#1a1100] shadow-gold-glow',
  silver: 'bg-gradient-to-br from-[#e2e5ec] to-[#9aa0ad] text-[#15171c]',
  bronze: 'bg-gradient-to-br from-[#e0954c] to-[#8b5722] text-white',
};
const BIG_NUM: Record<PodiumColor, string> = {
  gold: 'text-gold/25',
  silver: 'text-[#c9cdd6]/20',
  bronze: 'text-[#cd7f32]/20',
};

function PodiumColumn({
  entry,
  rank,
  color,
  stepClass,
  delay,
  stats,
  past = false,
}: {
  entry: LeaderboardEntry;
  rank: number;
  color: PodiumColor;
  stepClass: string;
  delay: number;
  stats?: { winRate: number; games: number };
  past?: boolean;
}) {
  const navigate = useNavigate();
  const t = useT();
  const isFirst = rank === 1;
  const spinRef = useFlickSpin<HTMLDivElement>();

  return (
    <motion.button
      type="button"
      onClick={() => navigate(`/player/${entry.login}`)}
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      className="group relative flex flex-col items-center gap-3 focus:outline-none"
    >
      {/* Figure (avatar + nom) : seule cette partie se soulève au hover, la marche
          reste ancrée au sol — pas de décollage. */}
      <div className="flex flex-col items-center gap-3 transition-transform duration-300 ease-out group-hover:-translate-y-1.5">
      {/* Avatar + couronne — flotte doucement (lévitation de la photo intra) */}
      <motion.div
        className="relative"
        animate={{ y: [0, -7, 0] }}
        transition={{
          duration: 3.4,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: delay + 0.5,
        }}
      >
        {isFirst && (
          <motion.div
            initial={{ y: -16, opacity: 0, rotate: -18 }}
            animate={{ y: [0, -4, 0], opacity: 1, rotate: 0 }}
            transition={{
              opacity: { delay: delay + 0.35, duration: 0.4 },
              rotate: { delay: delay + 0.35, type: 'spring', stiffness: 320, damping: 12 },
              y: { delay: delay + 0.7, duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
            }}
            className="absolute -top-9 left-1/2 -translate-x-1/2 text-gold z-10 drop-shadow-[0_2px_8px_rgba(255,201,74,0.6)]"
          >
            <Crown className="w-9 h-9" strokeWidth={2.5} fill="currentColor" />
          </motion.div>
        )}
        {/* Hover-zoom sur le wrapper externe (CSS), spin 3D sur le wrapper interne
            (inline, sans transition → pas de lag). L'Avatar rond reste un enfant
            NON transformé → la pièce ronde entière pivote, pas juste le carré. */}
        <div className="transition-transform duration-300 ease-out group-hover:scale-105">
          <div ref={spinRef}>
            <Avatar
              login={entry.login}
              imageUrl={entry.imageUrl}
              size={isFirst ? 'xl' : 'lg'}
              grayscale={past}
              coin
              className={`ring-[3px] ring-offset-2 ring-offset-bg-1 ${RING[color]}`}
            />
          </div>
        </div>
        {/* Pastille rang */}
        <div
          className={`absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full flex items-center justify-center font-mono font-black ring-2 ring-bg-1 ${BADGE[color]} ${
            isFirst ? 'w-9 h-9 text-base' : 'w-7 h-7 text-xs'
          }`}
        >
          {rank}
        </div>
      </motion.div>

      {/* Login + ELO + stats */}
      <div className="text-center mt-1 max-w-full px-1">
        <div className={`font-extrabold truncate ${TXT[color]} ${isFirst ? 'text-base' : 'text-sm'}`}>
          {entry.login}
        </div>
        <div
          className="font-display font-black tabular-nums text-gold leading-tight"
          style={{ textShadow: '0 0 14px rgba(255,201,74,0.4)' }}
        >
          {entry.elo}
          <span className="text-[9px] text-muted ms-1 font-bold uppercase tracking-wider">ELO</span>
          {isFirst && <RankedBadge size="xs" className="ms-1 align-middle" />}
        </div>
        {stats && stats.games > 0 && (
          <div className="text-[10px] text-muted-2 font-mono tabular-nums mt-0.5">
            {stats.winRate}% · {stats.games}G
          </div>
        )}
        {isFirst && (
          <div className="mt-1 inline-block text-[8px] font-extrabold uppercase tracking-[0.18em] text-gold/90">
            {t('lb.podium.champion')}
          </div>
        )}
      </div>
      </div>

      {/* Marche */}
      <div
        className={`relative w-full ${stepClass} rounded-t-xl border-t border-s border-e bg-gradient-to-b ${STEP[color]} flex items-start justify-center pt-2 overflow-hidden transition-all duration-300 group-hover:brightness-110`}
        style={{ transform: 'rotateX(8deg)', transformOrigin: 'bottom' }}
      >
        {/* Reflet brossé */}
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        <span className="absolute inset-0 [background:linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.06)_50%,transparent_60%)]" />
        <span className={`font-display font-black leading-none ${BIG_NUM[color]} ${isFirst ? 'text-6xl' : 'text-4xl'}`}>
          {rank}
        </span>
      </div>
    </motion.button>
  );
}
