import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Flame, MapPin, Trophy, Zap } from 'lucide-react';
import { Avatar } from '../../../components/Avatar';
import { HeroCardFrame } from '../../../components/HeroCardFrame';
import { useProfileFx } from '../../../hooks/useProfileFx';
import { AnimatedCounter } from '../../../mobile/primitives/AnimatedCounter';
import { useLeagueData } from '../../../hooks/useLeagueData';
import { useGameMode } from '../../../hooks/useGameMode';
import { pickRating } from '../../../lib/gameStats';
import { StatPlate, type StatPlateTone } from '../../../components/stats/StatPlate';
import { useT } from '../../../lib/i18n';

/**
 * Hero card "RPG / Esport" du joueur — pièce maîtresse de la page Défis.
 *
 * Inspirée du screenshot 42 League cible :
 * - Cartouche dorée avec rivets et tuyaux en laiton
 * - Plaques d'acier brossé pour les 4 stats (W/L/WR%/STREAK)
 * - ELO en typo display (Orbitron) ultra-gros avec relief doré
 * - Badge "TOP X%" en vert
 * - Silhouettes de personnages stylisées en arrière-plan
 * - Mini rouage qui tourne en haut à droite
 *
 * Animations conservées : rotation du conic gradient, shimmer, count-up.
 */
export function HeroPlayerCard() {
  const t = useT();
  const { me, matches, leaderboard } = useLeagueData();
  const { game } = useGameMode();
  const user = me?.user;
  const myLogin = me?.login;
  // Effet cosmétique du joueur (boost ELO « EN FEU » / Apôtre de Sheldon) — la
  // carte héro Défis hérite du même habillage que la carte profil.
  const fx = useProfileFx({ title: user?.title, eloMultUntil: user?.eloMultUntil });

  // Toutes les stats sont CLOISONNÉES par discipline :
  // l'ELO affiché, le rang, les victoires et la série correspondent
  // uniquement aux matchs du mode de jeu courant.
  const stats = useMemo(() => {
    if (!user || !myLogin) {
      return { wins: 0, losses: 0, total: 0, winRate: 0, streak: 0, rank: 0, elo: 1000 };
    }
    const mine = matches
      .filter(
        (m) =>
          (m.game ?? 'babyfoot') === game &&
          (m.playerALogin === myLogin || m.playerBLogin === myLogin),
      )
      .sort((a, b) => +new Date(b.playedAt) - +new Date(a.playedAt));
    let wins = 0;
    let losses = 0;
    let streak = 0;
    let streakBroken = false;
    for (const m of mine) {
      if (m.winner === 'draw') { streakBroken = true; continue; } // nulle : ni V ni D, casse la série
      const youAreA = m.playerALogin === myLogin;
      const youWon = (youAreA && m.winner === 'A') || (!youAreA && m.winner === 'B');
      if (youWon) wins++;
      else losses++;
      if (!streakBroken) {
        if (youWon) streak++;
        else streakBroken = true;
      }
    }
    const total = wins + losses;
    const winRate = total === 0 ? 0 : Math.round((wins / total) * 100);
    const rank = leaderboard.find((u) => u.login === myLogin)?.rank ?? 0;
    const elo = pickRating(user, game).elo;
    return { wins, losses, total, winRate, streak, rank, elo };
  }, [user, myLogin, matches, leaderboard, game]);

  if (!user) return null;

  const isTop1 = stats.rank === 1;
  const isTop3 = stats.rank > 0 && stats.rank <= 3;
  const isTop10 = stats.rank > 0 && stats.rank <= 10;
  const topPercent = leaderboard.length > 0 && stats.rank > 0
    ? Math.max(1, Math.round((stats.rank / leaderboard.length) * 100))
    : 0;

  return (
    <HeroCardFrame
      fx={fx}
      radius="rounded-3xl"
      // Sans `gpu` géré par le frame ; ici on garde `no-select` propre à la carte.
      className="no-select"
      animateIn
      // Conic Défis : 40 s, opacité 0.25, flou 50 px, couche compositeur (`gpu`).
      conic={{ duration: 40 }}
      // Fin liseré sombre `0 0 0 1px` propre à cette carte (sur l'ombre, effet ou repli).
      boxShadowSuffix=", 0 0 0 1px rgba(0,0,0,0.5)"
      // Habillage spécifique Défis : shimmer doré, silhouettes, rouage tournant.
      shimmer
      silhouettes
      cog
    >
      {/* Rank badge en haut à gauche (à l'opposé du cog). Enfant direct de la
          carte — comme le cog — pour que `top/left` soit ancré au coin de la
          carte et non à l'intérieur du conteneur de contenu centré (sinon le
          badge se retrouvait mal positionné). z-20 → au-dessus des couches déco
          ET du contenu (z-10). */}
      {stats.rank > 0 && (
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.3 }}
          // `!absolute` (important) car .metal-plate-gold impose `position:relative`
          // (même calque utilities, déclarée après) et écrasait sinon `.absolute`,
          // transformant le badge #1 en bloc flex pleine largeur.
          className={`!absolute top-3 left-3 z-20 flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-xs font-extrabold tabular-nums tracking-wide ${
            isTop1
              ? 'metal-plate-gold shadow-gold-glow'
              : isTop3
                ? 'bg-bg-1/80 text-gold border border-gold/50 backdrop-blur'
                : isTop10
                  ? 'bg-bg-1/80 text-gold border border-gold/30 backdrop-blur'
                  : 'bg-bg-1/80 text-muted-2 border border-border backdrop-blur'
          }`}
        >
          <span>#{stats.rank}</span>
        </motion.div>
      )}

      {/* CONTENU */}
      <div className="relative z-10 px-5 pt-5 pb-4 flex flex-col items-center text-center">
        {/* Avatar XL avec ring */}
        <div className="relative mb-3 mt-2">
          <div
            className="absolute -inset-2 rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(255,201,74,0.35) 0%, transparent 70%)',
              filter: 'blur(10px)',
            }}
          />
          <Avatar
            login={user.login}
            imageUrl={user.imageUrl}
            size="xl"
            className="relative"
            // La carte porte déjà l'aura complète → pas de double effet sur la PP.
            fx={false}
          />
        </div>

        {/* Login + title + campus */}
        <div className="mb-4">
          <h2 className="font-display text-2xl font-black text-text-strong tracking-tight">
            {user.login}
          </h2>
          {user.title && (
            <div className="text-[11px] text-gold italic mt-0.5 px-2 truncate max-w-[260px]">
              « {user.title} »
            </div>
          )}
          {user.campus && (
            <div className="inline-flex items-center gap-1 text-[10px] text-muted-2 mt-1 font-bold uppercase tracking-[0.18em]">
              <MapPin className="w-3 h-3" strokeWidth={2.5} />
              <span>{user.campus}</span>
            </div>
          )}
        </div>

        {/* ELO géant — toujours celui du jeu courant */}
        <div className="relative mb-1">
          <div
            className="font-display text-[68px] font-black leading-none tabular-nums tracking-tighter text-gold-emboss"
          >
            <AnimatedCounter value={stats.elo} duration={1.4} />
          </div>
          <div className="text-[10px] text-muted uppercase tracking-[0.36em] font-extrabold mt-0.5">
            ELO
          </div>
        </div>

        {/* Stats row — plaques en acier */}
        <div className="mt-5 w-full grid grid-cols-4 gap-2">
          <StatBlock label="W" value={stats.wins} tone="gold" />
          <StatBlock label="L" value={stats.losses} tone="red" />
          <StatBlock label="WR" value={`${stats.winRate}%`} tone="gold" />
          <StatBlock
            label="STREAK"
            value={stats.streak}
            tone={stats.streak >= 3 ? 'fire' : 'muted'}
            icon={stats.streak >= 3 ? <Flame className="w-3 h-3" strokeWidth={2.5} /> : undefined}
          />
        </div>

        {/* Footer — badge TOP X% en vert + trophées */}
        {(user.tournamentsWon > 0 || topPercent > 0) && (
          <div className="mt-4 flex items-center justify-center gap-2 w-full">
            {topPercent > 0 && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4, type: 'spring', stiffness: 360, damping: 20 }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#7fd66e]/50 bg-[#7fd66e]/10 text-[#7fd66e] font-gaming text-[10px] font-extrabold uppercase tracking-wider shadow-[inset_0_1px_0_rgba(127,214,110,0.18),0_0_14px_rgba(127,214,110,0.18)]"
              >
                <Zap className="w-3 h-3" strokeWidth={2.5} />
                <span className="tabular-nums">TOP {topPercent}%</span>
              </motion.div>
            )}
            {pickRating(user, game).tournamentsWon > 0 && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-gold/40 bg-gold/10 text-gold font-gaming text-[10px] font-extrabold uppercase tracking-wider">
                <Trophy className="w-3 h-3" strokeWidth={2.5} />
                <span className="font-mono tabular-nums">{pickRating(user, game).tournamentsWon}</span>
                <span>{pickRating(user, game).tournamentsWon > 1 ? t('defis.tournamentPlural') : t('defis.tournamentSingular')}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </HeroCardFrame>
  );
}

interface StatBlockProps {
  label: string;
  value: number | string;
  tone: Extract<StatPlateTone, 'gold' | 'red' | 'fire' | 'muted'>;
  icon?: React.ReactNode;
}

/**
 * Plaque d'acier brossé pour une stat — réplique exacte des plaques du screenshot
 * (W/L/WR%/STREAK). Surcouche de `StatPlate` qui dérive le halo par ton :
 * rouge atténué pour les défaites, aucun glow pour `muted`, doré sinon.
 */
function StatBlock({ label, value, tone, icon }: StatBlockProps) {
  const textShadow =
    tone === 'red'
      ? '0 1px 0 rgba(0,0,0,0.6), 0 0 10px rgba(255,83,102,0.4)'
      : tone === 'muted'
        ? '0 1px 0 rgba(0,0,0,0.6)'
        : '0 1px 0 rgba(0,0,0,0.6), 0 0 10px rgba(255,201,74,0.4)';
  return <StatPlate label={label} value={value} tone={tone} icon={icon} textShadow={textShadow} />;
}
