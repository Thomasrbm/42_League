import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Avatar } from './Avatar';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useLeagueData } from '../hooks/useLeagueData';
import { useT } from '../lib/i18n';
import { GAME_META, type GameMeta } from '../lib/gameMeta';
import { api, type TauntData } from '../lib/api';
import { tauntPhrase } from '../lib/tauntEmotes';
import { haptic } from '../mobile/feedback/useHaptic';

// ─────────────────────────────────────────────────────────────────────────────
// Narguage post-défaite — le perdant d'un 1v1 voit, à sa PROCHAINE connexion :
//   1. VS     — écran versus façon jeu de combat : le vainqueur entre par la
//               gauche, le perdant (moi) par la droite, gros « VS » doré.
//   2. EMOTE  — l'émote du vainqueur explose au centre (rebond + secousse),
//               légende « X te nargue ». C'est vexant, c'est le but.
// Les narguages en attente sont récupérés au montage (connexion au site) et
// marqués vus un par un après leur cinématique. Skippable au clic.
// ─────────────────────────────────────────────────────────────────────────────

const GOLD = '#ffc94a';
const VS_MS = 2300;
const EMOTE_MS = 3200;

export function TauntOverlay() {
  const [queue, setQueue] = useState<TauntData[]>([]);

  // À la connexion : laisse l'app se poser puis récupère les narguages en attente.
  useEffect(() => {
    const id = setTimeout(() => {
      api
        .tauntsPending()
        .then((list) => setQueue(list))
        .catch(() => {});
    }, 1800);
    return () => clearTimeout(id);
  }, []);

  const onDone = useCallback(() => {
    setQueue((q) => {
      const head = q[0];
      if (head) void api.tauntSeen(head.id).catch(() => {});
      return q.slice(1);
    });
  }, []);

  const current = queue[0];
  return (
    <AnimatePresence>
      {current && <TauntScene key={current.id} taunt={current} onDone={onDone} />}
    </AnimatePresence>
  );
}

/** Scène seule (versus → émote) — exportée pour l'aperçu du GOD panel. */
export function TauntScene({ taunt, onDone }: { taunt: TauntData; onDone: () => void }) {
  const t = useT();
  const { me } = useLeagueData();
  const [phase, setPhase] = useState<'vs' | 'emote'>('vs');
  const dismissed = useRef(false);

  const gm: GameMeta | undefined = (GAME_META as Record<string, GameMeta | undefined>)[taunt.game];
  const winnerName =
    [taunt.winner.firstName, taunt.winner.lastName].filter(Boolean).join(' ') ||
    taunt.winner.login;
  const myLogin = me?.login ?? '';
  const myImage = me?.user?.imageUrl ?? null;

  const done = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    onDone();
  }, [onDone]);

  // Enchaînement automatique VS → EMOTE → fermeture. Clic = phase suivante.
  useEffect(() => {
    if (phase === 'vs') {
      const id = setTimeout(() => setPhase('emote'), VS_MS);
      return () => clearTimeout(id);
    }
    haptic('heavy');
    const id = setTimeout(done, EMOTE_MS);
    return () => clearTimeout(id);
  }, [phase, done]);

  const advance = () => (phase === 'vs' ? setPhase('emote') : done());
  // Échap = passer (même geste que le clic).
  useEscapeKey(true, advance);

  // Particules déterministes pour l'explosion de l'émote.
  const sparks = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const radius = 130 + (i % 3) * 50;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, s: 5 + (i % 3) * 3 };
  });

  // Pluie d'émojis de victoire (fond) — beaucoup d'exemplaires de l'émote qui
  // tombent en boucle. Positions/tailles/délais DÉTERMINISTES (pas de Math.random →
  // stable au re-render et au skip). 22 gouttes réparties sur la largeur.
  const rain = Array.from({ length: 22 }, (_, i) => {
    const r1 = ((i * 9301 + 49297) % 233280) / 233280;
    const r2 = ((i * 4021 + 12345) % 100) / 100;
    return {
      left: (i / 22) * 100 + (r1 * 7 - 3.5),
      size: 22 + Math.round(r2 * 32),
      delay: r1 * 1.1,
      dur: 2.6 + r2 * 1.8,
      drift: (r1 - 0.5) * 70,
      rot: (r2 - 0.5) * 160,
    };
  });

  // Réplique de narguage, figée pour ce narguage (seed = son id).
  const phrase = tauntPhrase(taunt.emote, winnerName, taunt.id);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[130] flex items-center justify-center cursor-pointer select-none overflow-hidden"
      style={{ background: 'radial-gradient(95% 95% at 50% 42%, rgba(10,14,30,0.88), rgba(3,6,16,0.97))' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onPointerDown={advance}
    >
      {phase === 'vs' ? (
        <div className="relative flex items-center justify-center gap-8 sm:gap-16 px-6">
          {/* Vainqueur — entre par la gauche */}
          <motion.div
            className="flex flex-col items-center gap-3"
            initial={{ x: '-70vw', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 210, damping: 20 }}
          >
            <div className="relative">
              <span
                className="absolute -inset-3 rounded-full blur-2xl pointer-events-none"
                style={{ background: `${gm?.glowColor ?? GOLD}55` }}
              />
              <Avatar login={taunt.winner.login} imageUrl={taunt.winner.imageUrl} size="xl" />
            </div>
            <div className="text-center">
              <div className="font-gaming font-black italic uppercase text-lg text-white leading-tight" style={{ transform: 'skewX(-6deg)' }}>
                {winnerName}
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: gm?.color ?? GOLD }}>
                {t('taunt.beatYou')}
              </div>
            </div>
          </motion.div>

          {/* VS central */}
          <motion.div
            className="relative font-gaming font-black italic text-6xl sm:text-8xl"
            style={{
              transform: 'skewX(-10deg)',
              color: GOLD,
              textShadow: `0 4px 0 #1a1206, 0 0 44px ${GOLD}`,
            }}
            initial={{ scale: 3.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.28, type: 'spring', stiffness: 300, damping: 16 }}
          >
            VS
          </motion.div>

          {/* Moi (le perdant) — entre par la droite */}
          <motion.div
            className="flex flex-col items-center gap-3"
            initial={{ x: '70vw', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 210, damping: 20 }}
          >
            <Avatar login={myLogin} imageUrl={myImage} size="xl" grayscale />
            <div className="font-gaming font-bold italic uppercase text-sm text-white/60" style={{ transform: 'skewX(-6deg)' }}>
              {myLogin}
            </div>
          </motion.div>

          {/* Jeu concerné */}
          {gm && (
            <motion.div
              className="absolute -bottom-14 left-1/2 -translate-x-1/2 px-4 py-1.5 text-[11px] font-gaming font-black italic uppercase tracking-[0.2em] whitespace-nowrap"
              style={{
                color: gm.color,
                border: `1.5px solid ${gm.borderColor}`,
                background: gm.bgColor,
                transform: 'translateX(-50%) skewX(-8deg)',
              }}
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.3 }}
            >
              {gm.label}
            </motion.div>
          )}
        </div>
      ) : (
        <>
        {/* Pluie d'émojis de victoire — nappe de fond, plein d'exemplaires. */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {rain.map((r, i) => (
            <motion.span
              key={i}
              className="absolute top-0 will-change-transform leading-none"
              style={{ left: `${r.left}%`, fontSize: r.size, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }}
              initial={{ y: '-14vh', opacity: 0, rotate: 0 }}
              animate={{ y: '114vh', x: r.drift, rotate: r.rot, opacity: [0, 0.9, 0.9, 0] }}
              transition={{ duration: r.dur, delay: r.delay, ease: 'easeIn', repeat: Infinity }}
            >
              {taunt.emote}
            </motion.span>
          ))}
        </div>
        <div className="relative flex flex-col items-center gap-6 px-6">
          {/* Halo derrière l'émote */}
          <span
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none"
            style={{ background: `${gm?.glowColor ?? GOLD}40` }}
          />

          {/* Particules projetées à l'apparition */}
          {sparks.map((p, i) => (
            <motion.span
              key={i}
              className="absolute top-1/2 left-1/2 rounded-full pointer-events-none"
              style={{ width: p.s, height: p.s, background: i % 2 ? GOLD : gm?.color ?? '#fff' }}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: p.x, y: p.y, opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.12 }}
            />
          ))}

          {/* Vainqueur (rappel) */}
          <motion.div
            className="flex items-center gap-3"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <Avatar login={taunt.winner.login} imageUrl={taunt.winner.imageUrl} size="md" />
            <div className="font-gaming font-black italic uppercase text-lg text-white" style={{ transform: 'skewX(-6deg)' }}>
              {winnerName}{' '}
              <span className="text-white/50 text-sm not-italic normal-case font-bold">{t('taunt.mocksYou')}</span>
            </div>
          </motion.div>

          {/* L'ÉMOTE — énorme, rebond puis danse en boucle fluide (alternate) */}
          <motion.div
            className="relative leading-none"
            style={{ fontSize: 'clamp(110px, 24vw, 190px)' }}
            initial={{ scale: 0.1, rotate: -18, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 12 }}
          >
            <span
              className="inline-block"
              style={{ animation: 'tauntWiggle 0.9s ease-in-out infinite alternate' }}
            >
              {taunt.emote}
            </span>
          </motion.div>

          <style>{`
            @keyframes tauntWiggle {
              from { transform: rotate(-7deg) scale(1); }
              to   { transform: rotate(7deg) scale(1.08); }
            }
          `}</style>

          {/* Réplique de narguage — punchline sous l'émote. */}
          <motion.div
            className="max-w-[min(90vw,440px)] text-center font-gaming font-black italic uppercase text-xl sm:text-2xl leading-tight"
            style={{ color: '#fff', transform: 'skewX(-5deg)', textShadow: `0 2px 16px ${gm?.glowColor ?? GOLD}99` }}
            initial={{ y: 20, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ delay: 0.45, type: 'spring', stiffness: 240, damping: 15 }}
          >
            {phrase}
          </motion.div>

          <div className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-bold">
            {t('battlepass.tapToSkip')}
          </div>
        </div>
        </>
      )}
    </motion.div>,
    document.body,
  );
}
