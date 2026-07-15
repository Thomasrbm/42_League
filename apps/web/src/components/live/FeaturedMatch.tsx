import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Avatar } from '../Avatar';
import type { LiveTournament, TournamentMatch } from '../../lib/api';
import { avatarMap, teamEloMap, teamEloBand, partnerOf, matchHype, type FeaturedState } from '../../lib/liveTournament';

// Centre haut — affiche VS du match en avant, sur l'image babyfoot animée. Gère 1v1
// et 2v2 (paire affichée). Le visuel s'adapte à l'état (en cours / live / à venir /
// dernier match). Ajouts : barre de PRONOSTIC ELO (qui dit en un coup d'œil si le
// duel sera serré) et CÉLÉBRATION « waouh » quand un score décisif tombe.

const GREEN = '#7fd66e';

const STATE_BADGE: Record<FeaturedState, { label: string; tone: string }> = {
  active: { label: '⚔ MATCH EN COURS', tone: 'text-gold border-gold/60 bg-gold/10' },
  live: { label: '● EN DIRECT', tone: 'text-red border-red/60 bg-red/10' },
  next: { label: 'PROCHAIN DUEL', tone: 'text-teal border-teal/50 bg-teal/10' },
  last: { label: 'DERNIER MATCH', tone: 'text-muted-2 border-border bg-bg-2/60' },
};

function roundLabel(m: TournamentMatch, rounds: number): string {
  const stage = m.stage ?? 'bracket';
  if (stage === 'league') return m.poolIndex === 1 ? 'Match retour' : 'Journée de ligue';
  if (stage === 'pool') return `Poule ${(m.poolIndex ?? 0) + 1}`;
  const fromEnd = rounds - m.round;
  if (fromEnd === 0) return 'LA FINALE';
  if (fromEnd === 1) return 'Demi-finale';
  if (fromEnd === 2) return 'Quart de finale';
  return `Tour ${m.round}`;
}

export function FeaturedMatch({
  match,
  state,
  tournament,
  bracketRounds,
}: {
  match: TournamentMatch;
  state: FeaturedState;
  tournament: LiveTournament;
  bracketRounds: number;
}) {
  const entries = tournament.entries ?? [];
  const avatars = avatarMap(entries);
  const elos = teamEloMap(entries);
  const isBabyfoot = (tournament.game ?? 'babyfoot') === 'babyfoot';
  const badge = STATE_BADGE[state];
  const showScores = match.scoreA != null && match.scoreB != null;
  const winnerA = match.winnerLogin && match.winnerLogin === match.playerALogin;
  const winnerB = match.winnerLogin && match.winnerLogin === match.playerBLogin;

  const eloA = match.playerALogin ? elos.get(match.playerALogin) : undefined;
  const eloB = match.playerBLogin ? elos.get(match.playerBLogin) : undefined;
  // Hype de l'affiche = niveau des deux binômes (ELO). Grosse affiche = gros ELO.
  const hype = matchHype(eloA, eloB, teamEloBand(entries));

  // ── Célébration du score gagnant ────────────────────────────────────────────
  // On déclenche une cinématique « waouh » quand le vainqueur de CE match vient
  // d'être désigné (transition null → login), une seule fois par match.
  const prevWinnerRef = useRef<string | null>(match.winnerLogin ?? null);
  const prevMatchIdRef = useRef<string>(match.id);
  const [celebrate, setCelebrate] = useState<{ key: number; side: 'A' | 'B'; login: string } | null>(null);
  const celebKey = useRef(0);

  useEffect(() => {
    // Reset du suivi quand le match en avant change (on n'hérite pas du précédent).
    if (prevMatchIdRef.current !== match.id) {
      prevMatchIdRef.current = match.id;
      prevWinnerRef.current = match.winnerLogin ?? null;
      return;
    }
    const prev = prevWinnerRef.current;
    const now = match.winnerLogin ?? null;
    if (!prev && now) {
      const side: 'A' | 'B' = now === match.playerALogin ? 'A' : 'B';
      celebKey.current += 1;
      setCelebrate({ key: celebKey.current, side, login: now });
    }
    prevWinnerRef.current = now;
  }, [match.id, match.winnerLogin, match.playerALogin]);

  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setCelebrate(null), 3200);
    return () => clearTimeout(t);
  }, [celebrate]);

  return (
    <div className="relative flex flex-col items-center justify-center h-full w-full rounded-xl border border-border/60 bg-gradient-to-b from-bg-1/80 to-bg-0 overflow-hidden shadow-rivet">
      {/* Halo d'ambiance */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,201,74,0.10),transparent_65%)]" />

      <div className={`absolute top-[1.4vh] left-1/2 -translate-x-1/2 z-20 px-[1vw] py-[0.4vh] rounded-full border text-[1.5vh] font-bold uppercase tracking-[0.15em] ${badge.tone}`}>
        {badge.label}
      </div>

      <div className="relative z-10 flex items-center justify-between w-full px-[2vw] mt-[1.4vh]">
        <Fighter
          login={match.playerALogin}
          partner={match.playerALogin ? partnerOf(match.playerALogin, entries) : null}
          imageUrl={match.playerALogin ? avatars.get(match.playerALogin) ?? null : null}
          partnerImg={match.playerALogin ? avatars.get(partnerOf(match.playerALogin, entries) ?? '') ?? null : null}
          elo={eloA}
          align="left"
          winner={!!winnerA}
          loser={!!match.winnerLogin && !winnerA}
        />

        {/* Centre : babyfoot + scores */}
        <div className="relative flex flex-col items-center justify-center shrink-0 px-[1vw]">
          {showScores ? (
            <div className="flex items-center gap-[1.2vw]">
              <Score value={match.scoreA!} highlight={!!winnerA} />
              <span className="font-display font-black text-[3vh] text-muted-2">·</span>
              <Score value={match.scoreB!} highlight={!!winnerB} />
            </div>
          ) : (
            <div className="font-display font-black text-[6vh] bg-gradient-to-b from-text-strong to-gold bg-clip-text text-transparent">
              VS
            </div>
          )}
          {isBabyfoot && (
            <img
              src="/baby-anim.webp"
              alt=""
              className="h-[12vh] w-auto object-contain mt-[0.4vh] drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
            />
          )}
          <div className="mt-[0.4vh] text-[1.5vh] uppercase tracking-[0.18em] text-gold/90 font-gaming font-bold whitespace-nowrap">
            {roundLabel(match, bracketRounds)}
          </div>
        </div>

        <Fighter
          login={match.playerBLogin}
          partner={match.playerBLogin ? partnerOf(match.playerBLogin, entries) : null}
          imageUrl={match.playerBLogin ? avatars.get(match.playerBLogin) ?? null : null}
          partnerImg={match.playerBLogin ? avatars.get(partnerOf(match.playerBLogin, entries) ?? '') ?? null : null}
          elo={eloB}
          align="right"
          winner={!!winnerB}
          loser={!!match.winnerLogin && !winnerB}
        />
      </div>

      {/* Barre de HYPE (niveau des binômes) — en bas du match en cours, masquée une
          fois le vainqueur connu. */}
      {!match.winnerLogin && match.playerALogin && match.playerBLogin && (
        <HypeBar hype={hype} unknown={eloA == null || eloB == null} />
      )}

      {/* Cinématique de victoire (waouh) */}
      <AnimatePresence>
        {celebrate && <WinBurst key={celebrate.key} side={celebrate.side} login={celebrate.login} />}
      </AnimatePresence>
    </div>
  );
}

// ── Barre de HYPE (force des binômes) ──────────────────────────────────────────

function HypeBar({ hype, unknown }: { hype: number; unknown: boolean }) {
  const pct = Math.round(hype * 100);
  // Libellé qualitatif : grosse affiche = ELO élevés des deux côtés.
  const label = unknown
    ? 'Affiche à découvrir'
    : hype >= 0.75
      ? '🔥 Affiche de gala'
      : hype >= 0.45
        ? 'Belle affiche'
        : 'Montée en puissance';

  return (
    <div className="absolute bottom-[1.2vh] left-1/2 -translate-x-1/2 z-10 w-[82%] max-w-[44vw] flex flex-col items-center gap-[0.4vh]">
      <div className="flex items-center gap-[0.6vw]">
        <span className="text-[1.25vh] font-gaming font-black uppercase tracking-[0.16em] text-gold">Hype</span>
        <span className="text-[1.15vh] font-bold uppercase tracking-[0.1em] text-text-strong">{label}</span>
      </div>
      <div className="w-full flex items-center gap-[0.6vw]">
        <div className="relative flex-1 h-[1.1vh] rounded-full overflow-hidden bg-bg-3/80 border border-border/50">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold-deep via-gold to-[#ff8a3a]"
            animate={{ width: `${Math.max(4, pct)}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 22 }}
          />
        </div>
        <span className="text-[1.3vh] font-mono font-bold tabular-nums text-gold w-[4ch] text-end shrink-0">
          {unknown ? '–' : `${pct}%`}
        </span>
      </div>
      <span className="text-[0.95vh] uppercase tracking-wide text-muted-2">d'après l'ELO des deux binômes</span>
    </div>
  );
}

// ── Cinématique de victoire ────────────────────────────────────────────────────

function WinBurst({ side, login }: { side: 'A' | 'B'; login: string }) {
  // Particules dorées qui jaillissent du côté du vainqueur.
  const particles = Array.from({ length: 18 }, (_, i) => i);
  const originX = side === 'A' ? '24%' : '76%';
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
    >
      {/* Flash d'écran */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, rgba(255,201,74,0.35), transparent 70%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0] }}
        transition={{ duration: 0.7, times: [0, 0.2, 1] }}
      />
      {/* Particules */}
      <div className="absolute top-[42%]" style={{ left: originX }}>
        {particles.map((i) => {
          const angle = (i / particles.length) * Math.PI * 2;
          const dist = 60 + (i % 5) * 26;
          const dx = Math.cos(angle) * dist;
          const dy = Math.sin(angle) * dist;
          const gold = i % 3 === 0;
          return (
            <motion.span
              key={i}
              className="absolute block rounded-sm"
              style={{
                width: gold ? 10 : 7,
                height: gold ? 10 : 7,
                background: gold ? '#ffc94a' : GREEN,
                boxShadow: gold ? '0 0 8px rgba(255,201,74,0.8)' : '0 0 6px rgba(127,214,110,0.7)',
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
              animate={{ x: dx, y: dy + 40, opacity: 0, scale: 0.4, rotate: 180 }}
              transition={{ duration: 1.1 + (i % 4) * 0.15, ease: 'easeOut' }}
            />
          );
        })}
      </div>
      {/* Tampon VICTOIRE du côté du vainqueur */}
      <motion.div
        className={`absolute top-[10%] ${side === 'A' ? 'left-[6%]' : 'right-[6%]'} flex flex-col items-center`}
        initial={{ scale: 0.2, opacity: 0, rotate: side === 'A' ? -16 : 16 }}
        animate={{ scale: 1, opacity: 1, rotate: side === 'A' ? -10 : 10 }}
        exit={{ scale: 1.4, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 14 }}
      >
        <span className="font-display font-black text-[3.4vh] uppercase tracking-[0.1em] text-gold drop-shadow-[0_0_18px_rgba(255,201,74,0.7)]">
          Victoire
        </span>
        <span className="text-[1.6vh] font-bold uppercase text-text-strong truncate max-w-[18vw]">{login}</span>
      </motion.div>
    </motion.div>
  );
}

function Score({ value, highlight }: { value: number; highlight: boolean }) {
  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={value}
        initial={{ scale: 0.4, opacity: 0, y: -10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.4, opacity: 0, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 20 }}
        className={`font-display font-black tabular-nums text-[8.5vh] leading-none ${
          highlight ? 'text-gold drop-shadow-[0_0_22px_rgba(255,201,74,0.6)]' : 'text-text-strong'
        }`}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

function Fighter({
  login,
  partner,
  imageUrl,
  partnerImg,
  elo,
  align,
  winner,
  loser,
}: {
  login: string | null;
  partner: string | null;
  imageUrl: string | null;
  partnerImg: string | null;
  elo: number | undefined;
  align: 'left' | 'right';
  winner: boolean;
  loser: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-[0.6vh] min-w-0 max-w-[24vw] transition-opacity ${
        loser ? 'opacity-50' : ''
      } ${align === 'left' ? 'items-center' : 'items-center'}`}
    >
      <div className="relative">
        <motion.div
          className={winner ? 'ring-4 ring-gold rounded-full shadow-[0_0_30px_rgba(255,201,74,0.6)]' : ''}
          animate={winner ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={winner ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        >
          <Avatar login={login ?? '?'} imageUrl={imageUrl} size="xl" grayscale={loser} />
        </motion.div>
        {partner && (
          <div className="absolute -bottom-[0.5vh] -right-[0.5vh] rounded-full ring-2 ring-bg-0">
            <Avatar login={partner} imageUrl={partnerImg} size="md" grayscale={loser} />
          </div>
        )}
      </div>
      <div className="text-[2.6vh] font-display font-bold text-text-strong uppercase truncate max-w-full text-center">
        {login ?? '?'}
      </div>
      {partner && <div className="text-[1.4vh] text-muted-2 -mt-[0.4vh] truncate max-w-full">&amp; {partner}</div>}
      {elo != null && (
        <div className="flex flex-col items-center leading-none text-gold">
          <span className="text-[1.0vh] uppercase tracking-[0.12em] text-muted-2">ELO de la team</span>
          <span className="text-[1.7vh] font-mono font-bold">{elo}</span>
        </div>
      )}
    </div>
  );
}
