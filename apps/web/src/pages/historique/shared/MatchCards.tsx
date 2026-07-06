import { motion } from 'framer-motion';
import { TrendingDown, TrendingUp, Users } from 'lucide-react';
import { Avatar } from '../../../components/Avatar';
import { PlayerLink } from '../../../components/PlayerLink';
import type { Game, PlayedMatch, PlayedFfa } from '../../../lib/api';
import { fmtDatePair } from '../../../lib/format';
import { useT, type Lang } from '../../../lib/i18n';
import type { MyMatchStat, MyFfaStat, MyDartsStat } from './useHistoriqueLogic';

// Accent fléchettes (teal).
const DARTS_ACCENT = '#14b8a6';

// ─── Pastilles de discipline et de mode ──────────────────────────────────────
const GAME_BADGE: Record<string, string> = {
  babyfoot: '⚽',
  smash: '🎮',
  chess: '♟',
  streetfighter: '🥊',
};
/** Petite pastille indiquant la discipline d'un match. */
export function GamePill({ game }: { game?: Game }) {
  const g = game ?? 'babyfoot';
  if (g === 'babyfoot') return null;
  return (
    <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded bg-accent/10 text-accent">
      {GAME_BADGE[g] ?? g}
    </span>
  );
}

/** Pastille « 2 VS 2 » visible sur les matchs en mode équipe. */
function TwoVTwoPill() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded bg-gold/10 text-gold border border-gold/25">
      <Users className="w-2.5 h-2.5" strokeWidth={2.5} />
      2v2
    </span>
  );
}

// ─── Badges réutilisables ────────────────────────────────────────────────────

/** Pastille « +15 ELO » verte / « -5 » rouge. */
export function EloDeltaPill({ delta, counted }: { delta: number; counted: boolean }) {
  const t = useT();
  if (!counted) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold text-muted-2 bg-bg-2/60 border border-border">
        {t('history.outOfElo')}
      </span>
    );
  }
  const positive = delta > 0;
  const neutral = delta === 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-mono font-extrabold tabular-nums border ${
        neutral
          ? 'text-muted-2 bg-bg-2/60 border-border'
          : positive
            ? 'text-accent bg-accent/10 border-accent/30'
            : 'text-red bg-red/10 border-red/30'
      }`}
    >
      {positive ? '+' : ''}
      {delta}
      <span className="opacity-70 font-sans ml-0.5">ELO</span>
    </span>
  );
}

/** Impact win-rate : « 54% ▲ » (vert) / « 48% ▼ » (rouge). */
export function WinRateImpact({ wrAfter, wrImpact }: { wrAfter: number; wrImpact: number }) {
  const up = wrImpact > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-2">
      <span className="font-mono tabular-nums text-muted-2">WR {wrAfter}%</span>
      <span className={`inline-flex items-center gap-0.5 ${up ? 'text-accent' : 'text-red'}`}>
        <Icon className="w-3 h-3" strokeWidth={2.75} />
        <span className="font-mono tabular-nums">
          {up ? '+' : ''}
          {wrImpact.toFixed(1)}
        </span>
      </span>
    </span>
  );
}

// ─── Carte « ma game » (historique perso) ────────────────────────────────────

interface MyMatchCardProps {
  stat: MyMatchStat;
  lang: Lang;
  /** URL de l'avatar de l'adversaire principal (fallback si imgByLogin absent). */
  imageUrl?: string | null;
  /** Map complète login → imageUrl (permet d'afficher les avatars 2v2). */
  imgByLogin?: Map<string, string | null>;
  delay?: number;
}

export function MyMatchCard({ stat, lang, imageUrl, imgByLogin, delay = 0 }: MyMatchCardProps) {
  const t = useT();
  const { won, draw, opponent, opponent2, partner, myScore, oppScore, delta, counted, wrAfter, wrImpact } = stat;
  const game = stat.match.game;
  const is2v2 = stat.match.mode === '2v2';
  const oppImg = imgByLogin?.get(opponent) ?? imageUrl ?? null;
  const opp2Img = opponent2 ? (imgByLogin?.get(opponent2) ?? null) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className={`relative card-hud rounded-2xl p-3.5 flex items-center gap-3 hover-glow border ${
        draw ? 'border-gold/25' : won ? 'border-accent/25' : 'border-red/20'
      }`}
    >
      {/* Badge V / N / D */}
      <div
        className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-display font-black text-sm ${
          draw ? 'bg-gold/15 text-gold' : won ? 'bg-accent/15 text-accent' : 'bg-red/15 text-red'
        }`}
      >
        {draw ? t('lb.abbr.draw') : won ? t('lb.abbr.win') : t('lb.abbr.loss')}
      </div>

      {/* Avatar(s) adversaire(s) */}
      {is2v2 && opponent2 ? (
        <div className="relative flex-shrink-0 w-10 h-8">
          <Avatar login={opponent} imageUrl={oppImg} size="sm" className="absolute top-0 left-0" />
          <Avatar login={opponent2} imageUrl={opp2Img} size="xs" className="absolute bottom-0 right-0 ring-1 ring-bg-1" />
        </div>
      ) : (
        <Avatar login={opponent} imageUrl={oppImg} size="sm" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-muted">vs</span>
          <PlayerLink login={opponent} className="text-sm font-bold text-text-strong truncate">
            {opponent}
          </PlayerLink>
          {opponent2 && (
            <>
              <span className="text-[10px] text-muted-2">&amp;</span>
              <PlayerLink login={opponent2} className="text-sm font-bold text-text-strong truncate">
                {opponent2}
              </PlayerLink>
            </>
          )}
          {is2v2 && <TwoVTwoPill />}
          <GamePill game={game} />
        </div>
        {/* Partenaire 2v2 */}
        {partner && (
          <div className="text-[10px] text-gold/80 font-medium mt-0.5 flex items-center gap-1">
            <Users className="w-2.5 h-2.5" strokeWidth={2.5} />
            avec{' '}
            <PlayerLink login={partner} className="font-bold text-gold/90 truncate">
              {partner}
            </PlayerLink>
          </div>
        )}
        <div className="mt-1">
          <WinRateImpact wrAfter={wrAfter} wrImpact={wrImpact} />
        </div>
        <div className="text-[10px] text-muted font-medium mt-0.5">
          {fmtDatePair(stat.match.playedAt, lang).short}
          <span className="mx-1 opacity-40">·</span>
          <span className="text-muted-2">{fmtDatePair(stat.match.playedAt, lang).long}</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <div className="font-display tabular-nums text-base font-black">
          {draw ? (
            <span className="text-gold">{game === 'chess' ? '½–½' : `${myScore}–${oppScore}`}</span>
          ) : (
            <>
              <span className={won ? 'text-accent' : 'text-text-strong'}>{myScore}</span>
              <span className="text-muted mx-1 opacity-60">–</span>
              <span className={won ? 'text-text-strong' : 'text-red'}>{oppScore}</span>
            </>
          )}
        </div>
        <EloDeltaPill delta={delta} counted={counted} />
      </div>
    </motion.div>
  );
}

// ─── Carte « game de la league » (historique global) ─────────────────────────

interface GlobalMatchCardProps {
  match: PlayedMatch;
  lang: Lang;
  imgByLogin: Map<string, string | null>;
  delay?: number;
}

/**
 * Carte « game de la league » (historique global) — affichage tête-à-tête :
 * le VAINQUEUR à gauche (🏆 + avatar + nom + Δ ELO), le score au centre, et le
 * PERDANT à droite (nom + Δ ELO + avatar), en miroir.
 */
export function GlobalMatchCard({ match, lang, imgByLogin, delay = 0 }: GlobalMatchCardProps) {
  const t = useT();
  const isDraw = match.winner === 'draw';
  // Nulle : pas de vainqueur — on garde l'ordre A (gauche) / B (droite).
  const aWon = match.winner === 'A';
  const is2v2 = match.mode === '2v2';

  const winnerLogin  = aWon || isDraw ? match.playerALogin  : match.playerBLogin;
  const winner2Login = is2v2 ? (aWon || isDraw ? (match.playerA2Login ?? null) : (match.playerB2Login ?? null)) : null;
  const loserLogin   = aWon || isDraw ? match.playerBLogin  : match.playerALogin;
  const loser2Login  = is2v2 ? (aWon || isDraw ? (match.playerB2Login ?? null) : (match.playerA2Login ?? null)) : null;
  const winnerScore  = aWon || isDraw ? match.scoreA : match.scoreB;
  const loserScore   = aWon || isDraw ? match.scoreB : match.scoreA;
  const winnerDelta  = aWon || isDraw ? match.deltaA : match.deltaB;
  const loserDelta   = aWon || isDraw ? match.deltaB : match.deltaA;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="relative card-hud rounded-2xl p-3.5 flex items-center gap-2.5 hover-glow border border-gold/25"
    >
      {/* Trophée ou poignée de main */}
      <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-gold/15 text-base">
        {isDraw ? '🤝' : '🏆'}
      </div>

      {/* Vainqueur — gauche */}
      {is2v2 && winner2Login ? (
        <div className="relative flex-shrink-0 w-10 h-8">
          <Avatar login={winnerLogin} imageUrl={imgByLogin.get(winnerLogin) ?? null} size="sm" className="absolute top-0 left-0" />
          <Avatar login={winner2Login} imageUrl={imgByLogin.get(winner2Login) ?? null} size="xs" className="absolute bottom-0 right-0 ring-1 ring-bg-1" />
        </div>
      ) : (
        <Avatar login={winnerLogin} imageUrl={imgByLogin.get(winnerLogin) ?? null} size="sm" />
      )}

      <div className="flex-1 min-w-0 flex flex-col items-start gap-0.5">
        <PlayerLink login={winnerLogin} className={`text-sm font-bold truncate max-w-full ${isDraw ? 'text-text-strong' : 'text-gold'}`}>
          {winnerLogin}
        </PlayerLink>
        {winner2Login && (
          <PlayerLink login={winner2Login} className="text-[11px] font-semibold text-gold/70 truncate max-w-full">
            &amp; {winner2Login}
          </PlayerLink>
        )}
        <EloDeltaPill delta={winnerDelta} counted={match.countedForElo} />
      </div>

      {/* Score + date — centre */}
      <div className="flex-shrink-0 flex flex-col items-center gap-0.5 px-1">
        {match.game === 'chess' || match.game === 'coding' || match.game === 'pokemon' ? (
          /* Binaire (échecs / coding / pokémon) : Victoire / Nulle plutôt qu'un score 1-0 brut */
          <div className={`text-[11px] font-extrabold uppercase tracking-wide whitespace-nowrap ${isDraw ? 'text-gold' : 'text-gold text-gold-emboss'}`}>
            {isDraw ? t('history.result.draw') : t('history.result.win')}
          </div>
        ) : (
          <div className="font-display tabular-nums text-base font-black">
            <span className="text-gold text-gold-emboss">{winnerScore}</span>
            <span className="text-muted mx-1 opacity-60">–</span>
            <span className="text-text-strong">{loserScore}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          {is2v2 && <TwoVTwoPill />}
          <GamePill game={match.game} />
          <div className="text-[10px] text-muted font-medium whitespace-nowrap">
            {fmtDatePair(match.playedAt, lang).short}
          </div>
        </div>
      </div>

      {/* Perdant — droite (miroir) */}
      <div className="flex-1 min-w-0 flex flex-col items-end gap-0.5">
        <PlayerLink login={loserLogin} className="text-sm font-semibold text-muted-2 truncate max-w-full text-right">
          {loserLogin}
        </PlayerLink>
        {loser2Login && (
          <PlayerLink login={loser2Login} className="text-[11px] font-semibold text-muted/60 truncate max-w-full text-right">
            &amp; {loser2Login}
          </PlayerLink>
        )}
        <EloDeltaPill delta={loserDelta} counted={match.countedForElo} />
      </div>

      {is2v2 && loser2Login ? (
        <div className="relative flex-shrink-0 w-10 h-8">
          <Avatar login={loserLogin} imageUrl={imgByLogin.get(loserLogin) ?? null} size="sm" className="absolute top-0 right-0" />
          <Avatar login={loser2Login} imageUrl={imgByLogin.get(loser2Login) ?? null} size="xs" className="absolute bottom-0 left-0 ring-1 ring-bg-1" />
        </div>
      ) : (
        <Avatar login={loserLogin} imageUrl={imgByLogin.get(loserLogin) ?? null} size="sm" />
      )}
    </motion.div>
  );
}

// ─── FFA Smash : carte d'historique ───────────────────────────────────────────

/** Petite pastille de delta ELO pour le FFA (toujours compté pour l'ELO). */
function FfaDeltaPill({ delta }: { delta: number }) {
  const neutral = delta === 0;
  const positive = delta > 0;
  return (
    <span
      className={`font-mono font-extrabold tabular-nums text-[10px] ${
        neutral ? 'text-muted-2' : positive ? 'text-accent' : 'text-red'
      }`}
    >
      {positive ? '+' : ''}
      {delta}
    </span>
  );
}

interface GlobalFfaCardProps {
  ffa: PlayedFfa;
  lang: Lang;
  imgByLogin: Map<string, string | null>;
  delay?: number;
}

/**
 * Carte FFA « game de la league » (historique global) — affiche TOUS les
 * participants (« @a vs @b vs @c vs @d »), classés par rang, avec leur delta ELO.
 * Le 1er est mis en avant (couronne).
 */
export function GlobalFfaCard({ ffa, lang, imgByLogin, delay = 0 }: GlobalFfaCardProps) {
  const t = useT();
  // Les manches de fléchettes réutilisent le modèle FFA → carte dédiée (teal, 🎯).
  if (ffa.game === 'flechettes') {
    return <GlobalDartsCard ffa={ffa} lang={lang} imgByLogin={imgByLogin} delay={delay} />;
  }
  const ordered = [...ffa.participants].sort((a, b) => a.position - b.position);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="relative card-hud rounded-2xl p-3.5 hover-glow border border-red/25"
    >
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-red/15">
          <Users className="w-4 h-4 text-red" strokeWidth={2.5} />
        </div>
        <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-red">
          {t('ffa.label')}
        </span>
        <span className="text-[10px] text-muted-2 font-mono">· {ordered.length} {t('ffa.playersSuffix')}</span>
        <span className="ml-auto text-[10px] text-muted font-medium whitespace-nowrap">
          {fmtDatePair(ffa.playedAt, lang).short}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {ordered.map((p, i) => (
          <span key={p.login} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-muted-2 text-[10px] mr-1">vs</span>}
            <span className={`font-mono text-[10px] font-extrabold ${p.position === 1 ? 'text-gold' : 'text-muted-2'}`}>
              {p.position === 1 ? '🏆' : `${p.position}.`}
            </span>
            <Avatar login={p.login} imageUrl={imgByLogin.get(p.login) ?? null} size="xs" />
            <PlayerLink login={p.login} className={`text-xs font-bold truncate max-w-[88px] ${p.position === 1 ? 'text-gold' : 'text-text-strong'}`}>
              {p.login}
            </PlayerLink>
            <FfaDeltaPill delta={p.delta} />
          </span>
        ))}
      </div>
    </motion.div>
  );
}

interface MyFfaCardProps {
  stat: MyFfaStat;
  lang: Lang;
  imgByLogin: Map<string, string | null>;
  delay?: number;
}

/** Carte FFA « mon historique » — met en avant MON rang dans le FFA + delta. */
export function MyFfaCard({ stat, lang, imgByLogin, delay = 0 }: MyFfaCardProps) {
  const t = useT();
  // Les manches de fléchettes réutilisent le modèle FFA → carte dédiée (teal, 🎯).
  if (stat.ffa.game === 'flechettes') {
    return <MyDartsCard stat={stat} lang={lang} imgByLogin={imgByLogin} delay={delay} />;
  }
  const { ffa, myPosition, myDelta, total } = stat;
  const won = myPosition === 1;
  const others = [...ffa.participants]
    .filter((p) => p.position !== myPosition)
    .sort((a, b) => a.position - b.position);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className={`relative card-hud rounded-2xl p-3.5 flex items-center gap-3 hover-glow border ${
        won ? 'border-accent/25' : 'border-red/20'
      }`}
    >
      {/* Badge rang */}
      <div
        className={`flex-shrink-0 w-9 h-9 rounded-xl flex flex-col items-center justify-center font-display font-black leading-none ${
          won ? 'bg-gold/15 text-gold' : 'bg-bg-2/60 text-text-strong'
        }`}
      >
        <span className="text-sm">{won ? '🏆' : `#${myPosition}`}</span>
        <span className="text-[8px] text-muted-2 font-mono">/{total}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-red">{t('ffa.label')}</span>
          <span className="text-[10px] text-muted">vs</span>
          {others.slice(0, 4).map((p) => (
            <span key={p.login} className="inline-flex items-center gap-0.5">
              <Avatar login={p.login} imageUrl={imgByLogin.get(p.login) ?? null} size="xs" />
              <span className="text-[10px] text-muted-2 truncate max-w-[64px]">{p.login}</span>
            </span>
          ))}
          {others.length > 4 && <span className="text-[10px] text-muted-2">+{others.length - 4}</span>}
        </div>
        <div className="text-[10px] text-muted font-medium mt-1">
          {fmtDatePair(ffa.playedAt, lang).short}
          <span className="mx-1 opacity-40">·</span>
          <span className="text-muted-2">{fmtDatePair(ffa.playedAt, lang).long}</span>
        </div>
      </div>

      <div className="flex-shrink-0">
        <EloDeltaPill delta={myDelta} counted={ffa.countedForElo} />
      </div>
    </motion.div>
  );
}

// ─── Fléchettes : carte d'historique (modèle FFA, accent teal 🎯) ──────────────

/** Pastille « 501 » / « 301 » indiquant le score de départ de la manche. */
function StartScoreBadge({ startScore }: { startScore?: number | null }) {
  if (!startScore) return null;
  return (
    <span
      className="text-[10px] font-extrabold tabular-nums px-1.5 py-0.5 rounded border"
      style={{ color: DARTS_ACCENT, backgroundColor: `${DARTS_ACCENT}1a`, borderColor: `${DARTS_ACCENT}4d` }}
    >
      {startScore}
    </span>
  );
}

/** Affiche les points restants d'un participant (0 = vainqueur). */
function RemainingPill({ remaining }: { remaining?: number | null }) {
  const t = useT();
  if (remaining == null) return null;
  return (
    <span className="font-mono text-[10px] font-bold text-muted-2 tabular-nums">
      {remaining} {t('darts.rest')}
    </span>
  );
}

interface GlobalDartsCardProps {
  ffa: PlayedFfa;
  lang: Lang;
  imgByLogin: Map<string, string | null>;
  delay?: number;
}

/**
 * Carte fléchettes « game de la league » (historique global) — clone de
 * GlobalFfaCard, accent teal + 🎯. Affiche TOUS les participants classés par
 * reste croissant, leur points restants, leur delta ELO, et le score de départ.
 * Le vainqueur (position 1 / reste 0) reçoit un 🏆.
 */
export function GlobalDartsCard({ ffa, lang, imgByLogin, delay = 0 }: GlobalDartsCardProps) {
  const t = useT();
  const ordered = [...ffa.participants].sort((a, b) => a.position - b.position);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="relative card-hud rounded-2xl p-3.5 hover-glow border"
      style={{ borderColor: `${DARTS_ACCENT}40` }}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <div
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-base"
          style={{ backgroundColor: `${DARTS_ACCENT}26` }}
        >
          🎯
        </div>
        <span className="text-[11px] font-extrabold uppercase tracking-[0.12em]" style={{ color: DARTS_ACCENT }}>
          {t('darts.label')}
        </span>
        <span className="text-[10px] text-muted-2 font-mono">· {ordered.length} {t('darts.playersSuffix')}</span>
        <StartScoreBadge startScore={ffa.startScore} />
        <span className="ml-auto text-[10px] text-muted font-medium whitespace-nowrap">
          {fmtDatePair(ffa.playedAt, lang).short}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {ordered.map((p, i) => {
          const won = p.position === 1;
          return (
            <span key={p.login} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-muted-2 text-[10px] mr-1">vs</span>}
              <span
                className="font-mono text-[10px] font-extrabold"
                style={won ? { color: DARTS_ACCENT } : undefined}
              >
                {won ? '🏆' : `${p.position}.`}
              </span>
              <Avatar login={p.login} imageUrl={imgByLogin.get(p.login) ?? null} size="xs" />
              <PlayerLink
                login={p.login}
                className={`text-xs font-bold truncate max-w-[88px] ${won ? 'text-[#14b8a6]' : 'text-text-strong'}`}
              >
                {p.login}
              </PlayerLink>
              <RemainingPill remaining={p.remaining} />
              <FfaDeltaPill delta={p.delta} />
            </span>
          );
        })}
      </div>
    </motion.div>
  );
}

interface MyDartsCardProps {
  stat: MyDartsStat;
  lang: Lang;
  imgByLogin: Map<string, string | null>;
  delay?: number;
}

/**
 * Carte fléchettes « mon historique » — clone de MyFfaCard, accent teal + 🎯.
 * Met en avant MON reste/rang dans la manche + mon delta ELO, avec le score de
 * départ. Vainqueur (position 1 / reste 0) → 🏆.
 */
export function MyDartsCard({ stat, lang, imgByLogin, delay = 0 }: MyDartsCardProps) {
  const t = useT();
  const { ffa, myPosition, myDelta, total } = stat;
  const won = myPosition === 1;
  const mine = ffa.participants.find((p) => p.position === myPosition);
  const others = [...ffa.participants]
    .filter((p) => p.position !== myPosition)
    .sort((a, b) => a.position - b.position);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="relative card-hud rounded-2xl p-3.5 flex items-center gap-3 hover-glow border"
      style={{ borderColor: won ? `${DARTS_ACCENT}40` : undefined }}
    >
      {/* Badge rang / reste */}
      <div
        className="flex-shrink-0 w-9 h-9 rounded-xl flex flex-col items-center justify-center font-display font-black leading-none"
        style={won ? { backgroundColor: `${DARTS_ACCENT}26`, color: DARTS_ACCENT } : { backgroundColor: 'rgba(0,0,0,0.25)' }}
      >
        <span className="text-sm">{won ? '🏆' : `#${myPosition}`}</span>
        <span className="text-[8px] text-muted-2 font-mono">/{total}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.1em]" style={{ color: DARTS_ACCENT }}>
            {t('darts.label')}
          </span>
          <StartScoreBadge startScore={ffa.startScore} />
          {mine && <RemainingPill remaining={mine.remaining} />}
          <span className="text-[10px] text-muted">vs</span>
          {others.slice(0, 4).map((p) => (
            <span key={p.login} className="inline-flex items-center gap-0.5">
              <Avatar login={p.login} imageUrl={imgByLogin.get(p.login) ?? null} size="xs" />
              <span className="text-[10px] text-muted-2 truncate max-w-[64px]">{p.login}</span>
            </span>
          ))}
          {others.length > 4 && <span className="text-[10px] text-muted-2">+{others.length - 4}</span>}
        </div>
        <div className="text-[10px] text-muted font-medium mt-1">
          {fmtDatePair(ffa.playedAt, lang).short}
          <span className="mx-1 opacity-40">·</span>
          <span className="text-muted-2">{fmtDatePair(ffa.playedAt, lang).long}</span>
        </div>
      </div>

      <div className="flex-shrink-0">
        <EloDeltaPill delta={myDelta} counted={ffa.countedForElo} />
      </div>
    </motion.div>
  );
}
