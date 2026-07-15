import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { Avatar } from './Avatar';
import { PlayerLink } from './PlayerLink';
import { useFlickSpin } from '../hooks/useFlickSpin';

// ─────────────────────────────────────────────────────────────────────────────
// TrophyPodium — podium des « plus titrés » de la section Trophées.
//
// Volontairement DISTINCT du podium du classement (DesktopPodium) : on classe
// par NOMBRE DE TROPHÉES 🏆 (pas l'ELO), et l'identité visuelle change pour ne
// pas le confondre avec le classement —
//   • icône TROPHÉE (lucide Trophy) au lieu de la COURONNE,
//   • palette or / violet / cyan « hall of fame » au lieu de or / argent / bronze,
//   • halo violet+or, rayons bicolores, balayage holographique animé, étincelles.
// Responsive (marches/avatars réduits sur mobile) : composant partagé desktop +
// mobile.
// ─────────────────────────────────────────────────────────────────────────────

export interface TrophyPodiumEntry {
  login: string;
  imageUrl: string | null;
  trophyCount: number;
  rank: number;
}

interface TrophyPodiumProps {
  /** Déjà en ordre d'affichage : [2e, 1er, 3e]. */
  podium: TrophyPodiumEntry[];
}

export function TrophyPodium({ podium }: TrophyPodiumProps) {
  return (
    <div className="relative overflow-hidden rounded-xl pt-8 pb-0">
      {/* Halo radial doré (centré sur le n°1) avec un voile violet sur les bords */}
      <div
        className="absolute inset-x-0 top-0 h-44 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 80% at 50% 0%, rgba(255,201,74,0.20), rgba(180,120,255,0.10) 46%, transparent 70%)',
        }}
      />

      {/* Balayage holographique qui traverse périodiquement le podium */}
      <motion.div
        aria-hidden
        className="absolute top-0 bottom-0 w-1/3 pointer-events-none [background:linear-gradient(100deg,transparent,rgba(255,255,255,0.08),rgba(190,140,255,0.07),transparent)]"
        initial={{ left: '-35%' }}
        animate={{ left: '115%' }}
        transition={{ duration: 3.4, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }}
      />

      <div
        className="relative grid grid-cols-3 items-end gap-2 sm:gap-4 max-w-xl mx-auto"
        style={{ perspective: '1100px' }}
      >
        {podium.map((e, i) => (
          <TrophyPodiumColumn key={e.login} entry={e} delay={i * 0.11} />
        ))}
      </div>
    </div>
  );
}

type PodiumTier = 'first' | 'second' | 'third';
const TIER_BY_RANK: Record<number, PodiumTier> = { 1: 'first', 2: 'second', 3: 'third' };
const STEP_H: Record<number, string> = {
  1: 'h-28 sm:h-36',
  2: 'h-20 sm:h-24',
  3: 'h-14 sm:h-16',
};

// Palette « hall of fame » — or / violet / cyan (≠ or-argent-bronze du classement).
const STEP: Record<PodiumTier, string> = {
  first: 'from-[#3a2e10] via-[#241c08] to-[#0f0c04] border-[#e0b34a]/55',
  second: 'from-[#241a3a] via-[#160f28] to-[#0b0816] border-[#a259ff]/40',
  third: 'from-[#10262b] via-[#0a1a1e] to-[#060f11] border-[#22d3d3]/35',
};
const RING: Record<PodiumTier, string> = {
  first: 'ring-[#ffcf5a] shadow-[0_0_30px_rgba(255,201,74,0.50)]',
  second: 'ring-[#b98bff] shadow-[0_0_22px_rgba(162,89,255,0.42)]',
  third: 'ring-[#3fe0e0] shadow-[0_0_20px_rgba(34,211,211,0.35)]',
};
const TXT: Record<PodiumTier, string> = {
  first: 'text-[#ffd76a]',
  second: 'text-[#c4a0ff]',
  third: 'text-[#5fe6e6]',
};
const COUNT_SHADOW: Record<PodiumTier, string> = {
  first: '0 0 14px rgba(255,201,74,0.45)',
  second: '0 0 14px rgba(162,89,255,0.45)',
  third: '0 0 14px rgba(34,211,211,0.40)',
};
const BADGE: Record<PodiumTier, string> = {
  first: 'bg-gradient-to-br from-[#ffe08a] to-[#c79122] text-[#231600]',
  second: 'bg-gradient-to-br from-[#c9a8ff] to-[#7c3aed] text-white',
  third: 'bg-gradient-to-br from-[#7df0f0] to-[#1fa3a3] text-[#062020]',
};
const BIG_NUM: Record<PodiumTier, string> = {
  first: 'text-[#ffce5a]/25',
  second: 'text-[#a259ff]/20',
  third: 'text-[#22d3d3]/18',
};
const TROPHY_ICON: Record<PodiumTier, string> = {
  first: 'text-[#ffd76a] drop-shadow-[0_2px_10px_rgba(255,201,74,0.7)]',
  second: 'text-[#c4a0ff] drop-shadow-[0_2px_10px_rgba(162,89,255,0.6)]',
  third: 'text-[#5fe6e6] drop-shadow-[0_2px_10px_rgba(34,211,211,0.55)]',
};

function TrophyPodiumColumn({
  entry,
  delay,
}: {
  entry: TrophyPodiumEntry;
  delay: number;
}) {
  const { rank } = entry;
  const tier = TIER_BY_RANK[rank] ?? 'third';
  const isFirst = rank === 1;
  const spinRef = useFlickSpin<HTMLDivElement>();

  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      className="group relative flex flex-col items-center gap-2.5"
    >
      {/* Figure (avatar + nom) : seule cette partie se soulève au hover. */}
      <div className="flex flex-col items-center gap-2 transition-transform duration-300 ease-out group-hover:-translate-y-1.5">
        {/* Avatar + trophée flottant */}
        <motion.div
          className="relative"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: delay + 0.5 }}
        >
          {isFirst && (
            <motion.div
              initial={{ y: -18, opacity: 0, scale: 0.4 }}
              animate={{ y: [0, -5, 0], opacity: 1, scale: 1, rotate: [0, -8, 8, 0] }}
              transition={{
                opacity: { delay: delay + 0.35, duration: 0.4 },
                scale: { delay: delay + 0.35, type: 'spring', stiffness: 300, damping: 11 },
                y: { delay: delay + 0.8, duration: 2.6, repeat: Infinity, ease: 'easeInOut' },
                rotate: { delay: delay + 0.8, duration: 4.2, repeat: Infinity, ease: 'easeInOut' },
              }}
              className="absolute -top-8 left-1/2 -translate-x-1/2 z-10"
            >
              <Trophy
                className={`w-7 h-7 sm:w-8 sm:h-8 ${TROPHY_ICON.first}`}
                strokeWidth={2.5}
                fill="currentColor"
              />
              {/* Étincelle scintillante */}
              <motion.span
                className="absolute -top-1.5 -right-1.5 text-[10px] text-[#fff2c0]"
                animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
                transition={{ duration: 1.8, repeat: Infinity, delay: delay + 1.1, ease: 'easeInOut' }}
              >
                ✦
              </motion.span>
            </motion.div>
          )}
          <PlayerLink login={entry.login} className="!block">
            {/* Hover-zoom (CSS) à l'extérieur, spin 3D (inline) à l'intérieur,
                Avatar rond non-transformé → la pièce ronde pivote en entier. */}
            <div className="transition-transform duration-300 group-hover:scale-105">
              <div ref={spinRef}>
                <Avatar
                  login={entry.login}
                  imageUrl={entry.imageUrl}
                  size={isFirst ? 'lg' : 'md'}
                  coin
                  className={`ring-[3px] ring-offset-2 ring-offset-bg-1 ${RING[tier]}`}
                />
              </div>
            </div>
          </PlayerLink>
          {/* Pastille rang */}
          <div
            className={`absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full flex items-center justify-center font-mono font-black ring-2 ring-bg-1 ${BADGE[tier]} ${
              isFirst ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-[11px]'
            }`}
          >
            {rank}
          </div>
        </motion.div>

        {/* Nom + compteur de trophées */}
        <div className="text-center mt-1 max-w-full px-1">
          <div
            className={`font-extrabold truncate max-w-[92px] sm:max-w-[120px] ${TXT[tier]} ${
              isFirst ? 'text-sm' : 'text-xs'
            }`}
          >
            {entry.login}
          </div>
          <div
            className={`font-display font-black tabular-nums leading-tight ${TXT[tier]}`}
            style={{ textShadow: COUNT_SHADOW[tier] }}
          >
            {entry.trophyCount}
            <span className="ms-1 text-sm align-middle">🏆</span>
          </div>
          {isFirst && (
            <div className="mt-0.5 inline-block text-[8px] font-extrabold uppercase tracking-[0.18em] text-[#ffd76a]/90">
              Le plus titré
            </div>
          )}
        </div>
      </div>

      {/* Marche */}
      <div
        className={`relative w-full ${STEP_H[rank]} rounded-t-xl border-t border-s border-e bg-gradient-to-b ${STEP[tier]} flex items-start justify-center pt-2 overflow-hidden transition-all duration-300 group-hover:brightness-110`}
        style={{ transform: 'rotateX(8deg)', transformOrigin: 'bottom' }}
      >
        {/* Reflet brossé */}
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        <span className="absolute inset-0 [background:linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.06)_50%,transparent_60%)]" />
        <span
          className={`font-display font-black leading-none ${BIG_NUM[tier]} ${
            isFirst ? 'text-5xl sm:text-6xl' : 'text-3xl sm:text-4xl'
          }`}
        >
          {rank}
        </span>
      </div>
    </motion.div>
  );
}
