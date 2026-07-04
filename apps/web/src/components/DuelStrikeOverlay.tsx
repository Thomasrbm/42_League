import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Avatar } from './Avatar';
import { useDuelStrike } from '../hooks/useDuelStrike';
import { useLeagueData } from '../hooks/useLeagueData';
import { useT } from '../lib/i18n';
import { clearDuelStrike, type DuelStrike } from '../lib/duelStrike';
import { gameColor } from '../lib/gameVisuals';
import { GAME_META } from '../lib/gameMeta';
import { playThunder } from '../lib/thunder';
import { makeBolt } from '../lib/lightning';
import { haptic } from '../mobile/feedback/useHaptic';

// ─────────────────────────────────────────────────────────────────────────────
// Cinématique « COUP DE FOUDRE → VERSUS » — déclenchée à l'acceptation ou à
// l'envoi d'un duel. Deux temps :
//   1. STRIKE  — la foudre s'abat sur le bouton cliqué : flash blanc stroboscopé,
//      éclair ramifié dessiné du haut de l'écran jusqu'au point d'impact, secousse
//      d'écran, tonnerre synthétisé (Web Audio) + haptique. Ça surprend.
//   2. VS      — bascule plein écran façon jeu de combat : les deux avatars entrent
//      par les côtés, un énorme « VS » doré explose au centre.
// ─────────────────────────────────────────────────────────────────────────────

const STRIKE_MS = 820; // durée de la phase foudre avant bascule VS
const VS_MS = 2900; // durée de la phase VS avant auto-fermeture

interface Resolved {
  login: string;
  imageUrl: string | null;
  name: string;
}

export function DuelStrikeOverlay() {
  const strike = useDuelStrike();
  return (
    <AnimatePresence>{strike && <DuelStrikeScene key={strike.nonce} strike={strike} />}</AnimatePresence>
  );
}

function DuelStrikeScene({ strike }: { strike: DuelStrike }) {
  const t = useT();
  const { me, leaderboard } = useLeagueData();
  const [phase, setPhase] = useState<'strike' | 'vs'>('strike');
  const dismissed = useRef(false);

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const origin = strike.origin ?? { x: vw / 2, y: vh * 0.4 };
  const color = strike.game ? gameColor(strike.game) : '#ffc94a';
  const gm = strike.game ? GAME_META[strike.game] : null;

  // Tracés d'éclair (mémoïsés : un principal + 2 ramifications).
  const bolts = useMemo(() => {
    const main = makeBolt(origin.x + (Math.random() - 0.5) * 60, -20, origin.x, origin.y, 90, 6);
    const forkA = makeBolt(origin.x, origin.y * 0.42, origin.x - 120 - Math.random() * 80, origin.y * 0.7, 50, 4);
    const forkB = makeBolt(origin.x, origin.y * 0.62, origin.x + 100 + Math.random() * 80, origin.y * 0.9, 46, 4);
    return [main, forkA, forkB];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strike.nonce]);

  // Résolution avatars / noms depuis le classement (login → photo + nom).
  const resolve = (login: string): Resolved => {
    const e = leaderboard.find((p) => p.login === login);
    const name = e?.firstName && e?.lastName ? `${e.firstName} ${e.lastName}` : login;
    return { login, imageUrl: e?.imageUrl ?? null, name };
  };
  const myUser = me?.user;
  const meRes: Resolved = {
    login: strike.meLogin,
    imageUrl: myUser?.imageUrl ?? resolve(strike.meLogin).imageUrl,
    name: myUser?.firstName && myUser?.lastName ? `${myUser.firstName} ${myUser.lastName}` : strike.meLogin,
  };
  const oppRes = resolve(strike.opponentLogin);

  function done() {
    if (dismissed.current) return;
    dismissed.current = true;
    clearDuelStrike();
  }

  // Coup d'envoi : tonnerre + haptique « lourd » dès le montage.
  useEffect(() => {
    playThunder();
    haptic('heavy');
    const toVs = setTimeout(() => {
      setPhase('vs');
      haptic('warning');
    }, STRIKE_MS);
    const close = setTimeout(done, STRIKE_MS + VS_MS);
    return () => {
      clearTimeout(toVs);
      clearTimeout(close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtitle = strike.kind === 'accept' ? t('defis.strike.accepted') : t('defis.strike.sent');

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[2147483646] overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
      onClick={phase === 'vs' ? done : undefined}
      role="dialog"
      aria-modal="true"
      style={{ cursor: phase === 'vs' ? 'pointer' : 'default' }}
    >
      {/* ─── PHASE 1 : COUP DE FOUDRE ─────────────────────────────────────── */}
      {phase === 'strike' && (
        <motion.div
          className="absolute inset-0"
          // Secousse d'écran à l'impact
          animate={{ x: [0, -14, 12, -8, 6, -3, 0], y: [0, 8, -6, 5, -3, 2, 0] }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          {/* Fond qui s'assombrit légèrement pour détacher l'éclair */}
          <div className="absolute inset-0" style={{ background: 'rgba(4,4,8,0.55)' }} />

          {/* Flash blanc stroboscopé (le « WAOUH ») */}
          <motion.div
            className="absolute inset-0"
            style={{ background: '#ffffff' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.1, 0.85, 0, 0.3, 0] }}
            transition={{ duration: 0.55, times: [0, 0.05, 0.12, 0.2, 0.35, 0.45, 1], ease: 'linear' }}
          />

          {/* Halo coloré qui pulse au point d'impact */}
          <motion.div
            className="absolute"
            style={{
              left: origin.x,
              top: origin.y,
              width: 600,
              height: 600,
              marginLeft: -300,
              marginTop: -300,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${color}cc 0%, ${color}55 18%, transparent 60%)`,
              mixBlendMode: 'screen',
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.1, 1.4], opacity: [0, 1, 0] }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />

          {/* L'éclair (SVG plein écran) */}
          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none">
            <defs>
              <filter id="boltGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {bolts.map((d, i) => (
              <g key={i} filter="url(#boltGlow)">
                {/* lueur colorée large */}
                <motion.path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={i === 0 ? 11 : 6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.7}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: [0, 0.85, 0.2, 0.6, 0] }}
                  transition={{ duration: 0.5, delay: i * 0.04, times: [0, 0.15, 0.3, 0.5, 1] }}
                />
                {/* cœur blanc net */}
                <motion.path
                  d={d}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={i === 0 ? 4 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: [0, 1, 0.3, 0.9, 0] }}
                  transition={{ duration: 0.5, delay: i * 0.04, times: [0, 0.12, 0.3, 0.5, 1] }}
                />
              </g>
            ))}
          </svg>
        </motion.div>
      )}

      {/* ─── PHASE 2 : VERSUS plein écran ─────────────────────────────────── */}
      {phase === 'vs' && (
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at 50% 45%, ${color}33, rgba(0,0,0,0.94) 60%), rgba(6,5,4,0.96)`,
            }}
          />
          {/* Rayons d'énergie derrière */}
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background: `repeating-conic-gradient(from 0deg at 50% 45%, ${color}22 0deg, transparent 6deg 12deg)`,
              maskImage: 'radial-gradient(circle at 50% 45%, black, transparent 65%)',
              WebkitMaskImage: 'radial-gradient(circle at 50% 45%, black, transparent 65%)',
            }}
          />

          {/* Sous-titre (Duel accepté / lancé) */}
          <motion.div
            className="relative z-10 mb-2 font-display text-xs font-black uppercase tracking-[0.2em] md:text-sm"
            style={{ color }}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 240, damping: 18 }}
          >
            {subtitle}
          </motion.div>

          {/* Badge du mode */}
          {gm && (
            <motion.div
              className="relative z-10 mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 backdrop-blur-md"
              style={{ border: `1.5px solid ${gm.borderColor}`, background: gm.bgColor, boxShadow: `0 0 18px -6px ${gm.glowColor}` }}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 18 }}
            >
              <span className="grid h-5 w-5 place-items-center" style={{ color: gm.color }}>
                {gm.icon(true)}
              </span>
              <span className="font-display text-xs font-extrabold uppercase tracking-wider" style={{ color: gm.color }}>
                {gm.label}
              </span>
            </motion.div>
          )}

          <div className="relative z-10 flex w-full max-w-3xl items-center justify-center gap-4 px-6 md:gap-10">
            {/* Moi — entre par la gauche */}
            <motion.div
              className="flex min-w-0 flex-1 flex-col items-center"
              initial={{ x: '-120%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 130, damping: 16, delay: 0.05 }}
            >
              <div className="rounded-full ring-4 ring-teal/70 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                <Avatar login={meRes.login} imageUrl={meRes.imageUrl} size="xl" />
              </div>
              <span className="mt-3 max-w-full truncate font-display text-sm font-bold text-text-strong md:text-lg">
                {meRes.name}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-teal md:text-xs">{t('defis.you')}</span>
            </motion.div>

            {/* VS central — explose au centre */}
            <motion.div
              className="relative z-20 flex-shrink-0"
              initial={{ scale: 0, rotate: -25, opacity: 0 }}
              animate={{ scale: [0, 1.35, 1], rotate: [-25, 6, 0], opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.32, ease: [0.16, 1, 0.3, 1] }}
            >
              <span
                className="font-display text-6xl font-black italic md:text-8xl"
                style={{
                  background: `linear-gradient(180deg, #fff 0%, ${color} 55%, #7a2e00 100%)`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: `drop-shadow(0 2px 16px ${color}aa)`,
                }}
              >
                VS
              </span>
            </motion.div>

            {/* Adversaire — entre par la droite */}
            <motion.div
              className="flex min-w-0 flex-1 flex-col items-center"
              initial={{ x: '120%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 130, damping: 16, delay: 0.05 }}
            >
              <div className="rounded-full ring-4 ring-red/70 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                <Avatar login={oppRes.login} imageUrl={oppRes.imageUrl} size="xl" />
              </div>
              <span className="mt-3 max-w-full truncate font-display text-sm font-bold text-text-strong md:text-lg">
                {oppRes.name}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-red md:text-xs">{t('defis.opponent')}</span>
            </motion.div>
          </div>

          {/* Invitation à fermer */}
          <motion.div
            className="relative z-10 mt-12 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 1 }}
          >
            {t('defis.strike.tap')}
          </motion.div>
        </motion.div>
      )}
    </motion.div>,
    document.body,
  );
}
