import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import type { PlayedMatch } from '../../../lib/api';
import { Avatar } from '../../../components/Avatar';
import { PlayerLink } from '../../../components/PlayerLink';
import { SmashCharIcon } from '../../../components/SmashCharIcon';
import { SfCharIcon } from '../../../components/SfCharIcon';
import { decodeChars } from '../../../lib/chars';
import { GamePill, MatchScore } from '../../../components/MatchScore';
import { useLeagueData } from '../../../hooks/useLeagueData';
import { useI18n, useT } from '../../../lib/i18n';
import { fmtDatePair, fmtTime } from '../../../lib/format';

interface RecentMatchRowProps {
  match: PlayedMatch;
  /** Login du joueur dont on consulte le profil (perspective « moi »). */
  ownerLogin: string;
  /** Délai d'apparition (stagger) — 0 par défaut. */
  delay?: number;
}

/**
 * Ligne d'historique de match — rendu UNIQUE partagé entre le profil desktop et
 * mobile (avant : un tableau brut sans photo côté desktop, des cartes côté
 * mobile). Agencement harmonisé en 3 zones alignées d'une ligne à l'autre :
 *   [badge V/N/D] [avatar + nom + date]          [score]  [Δ elo]
 * Les zones de droite ont des largeurs fixes → colonnes alignées, pas tassées.
 * Couleurs : or = nul, VERT = victoire, ROUGE = défaite. On utilise `accent`
 * (vert fixe) et `red` (rouge fixe) plutôt que `teal` — qui est la couleur
 * d'accent THÉMATISABLE (or/rouge/… selon le mode) — pour que victoire = vert et
 * défaite = rouge QUEL QUE SOIT le mode de jeu / thème.
 */
export function RecentMatchRow({ match, ownerLogin, delay = 0 }: RecentMatchRowProps) {
  const t = useT();
  const { lang } = useI18n();
  const { leaderboard } = useLeagueData();

  const is2v2 = match.mode === '2v2';
  // 2v2 : le propriétaire du profil peut être le coéquipier (slot A2/B2), pas
  // seulement le capitaine — on teste les deux slots de chaque camp.
  const youAreA = match.playerALogin === ownerLogin || match.playerA2Login === ownerLogin;
  const isDraw = match.winner === 'draw';
  const youWon = !isDraw && ((youAreA && match.winner === 'A') || (!youAreA && match.winner === 'B'));
  const outcome: 'win' | 'loss' | 'draw' = isDraw ? 'draw' : youWon ? 'win' : 'loss';
  const opp = youAreA ? match.playerBLogin : match.playerALogin;
  // 2v2 : second adversaire et mon coéquipier (le duo affiché dans l'historique).
  const opp2 = is2v2 ? (youAreA ? match.playerB2Login : match.playerA2Login) ?? null : null;
  const partner = is2v2
    ? (youAreA
        ? (match.playerALogin === ownerLogin ? match.playerA2Login : match.playerALogin)
        : (match.playerBLogin === ownerLogin ? match.playerB2Login : match.playerBLogin)) ?? null
    : null;
  const imgFor = (login: string | null) => (login ? leaderboard.find((u) => u.login === login)?.imageUrl ?? null : null);
  const oppImg = imgFor(opp);
  const isSmash = match.game === 'smash';
  const isSf = match.game === 'streetfighter';
  // Perso(s) de l'adversaire : un seul, ou un par manche si détaillé à la déclaration.
  const oppChars = decodeChars(youAreA ? match.charB : match.charA);
  const winnerScore = youWon ? (youAreA ? match.scoreA : match.scoreB) : (youAreA ? match.scoreB : match.scoreA);
  const loserScore = youWon ? (youAreA ? match.scoreB : match.scoreA) : (youAreA ? match.scoreA : match.scoreB);
  // Delta ELO : slot précis selon ma position (2v2 aware — A2/B2 partagent le
  // delta de leur camp en 2v2, mais on lit la colonne dédiée par sécurité).
  const delta =
    match.playerALogin === ownerLogin  ? match.deltaA :
    match.playerA2Login === ownerLogin ? (match.deltaA2 ?? match.deltaA) :
    match.playerBLogin === ownerLogin  ? match.deltaB :
                                         (match.deltaB2 ?? match.deltaB);
  const date = fmtDatePair(match.playedAt, lang);

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
        isDraw
          ? 'border-gold/25 bg-gold/[0.06]'
          : youWon
            ? 'border-accent/35 bg-accent/[0.08]'
            : 'border-red/35 bg-red/[0.08]'
      }`}
    >
      {/* Badge résultat V / N / D — carré fixe */}
      <div
        className={`flex-shrink-0 grid place-items-center w-9 h-9 rounded-lg font-mono font-black text-sm ${
          isDraw ? 'bg-gold/15 text-gold' : youWon ? 'bg-accent/20 text-accent' : 'bg-red/20 text-red'
        }`}
      >
        {isDraw ? t('lb.abbr.draw') : youWon ? t('lb.abbr.win') : t('lb.abbr.loss')}
      </div>

      {/* Adversaire(s) : avatar + nom + date. En 2v2 on montre le DUO adverse
          (deux avatars empilés, « opp & opp2 ») et le coéquipier « avec … ». */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        {is2v2 && opp2 ? (
          <div className="relative flex-shrink-0 w-9 h-8">
            <Avatar login={opp} imageUrl={oppImg} size="sm" className="absolute top-0 left-0" />
            <Avatar login={opp2} imageUrl={imgFor(opp2)} size="xs" className="absolute bottom-0 right-0 ring-1 ring-bg-1" />
          </div>
        ) : (
          <Avatar login={opp} imageUrl={oppImg} size="sm" />
        )}
        <div className="min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <PlayerLink login={opp} className="min-w-0">
              <span className="text-sm font-bold text-text-strong truncate leading-none">{opp}</span>
            </PlayerLink>
            {opp2 && (
              <>
                <span className="text-[10px] text-muted-2 shrink-0">&amp;</span>
                <PlayerLink login={opp2} className="min-w-0">
                  <span className="text-sm font-bold text-text-strong truncate leading-none">{opp2}</span>
                </PlayerLink>
              </>
            )}
            {(isSmash || isSf) && oppChars.length > 0 && (
              <span className="flex items-center gap-0.5 shrink-0">
                {oppChars.map((c, i) =>
                  isSmash ? (
                    <SmashCharIcon key={i} id={c} size={16} className="shrink-0" />
                  ) : (
                    <SfCharIcon key={i} id={c} size={16} className="shrink-0" />
                  ),
                )}
              </span>
            )}
            {is2v2 && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded bg-gold/10 text-gold border border-gold/25 shrink-0">
                <Users className="w-2.5 h-2.5" strokeWidth={2.5} />
                2v2
              </span>
            )}
            <GamePill game={match.game} />
          </div>
          {/* 2v2 : coéquipier. */}
          {partner && (
            <span className="text-[10px] text-gold/80 font-medium leading-none flex items-center gap-1 min-w-0">
              <Users className="w-2.5 h-2.5 shrink-0" strokeWidth={2.5} />
              {t('profil.hist.with')}{' '}
              <PlayerLink login={partner} className="min-w-0">
                <span className="font-bold text-gold/90 truncate">{partner}</span>
              </PlayerLink>
            </span>
          )}
          <span className="text-[11px] text-muted-2 font-medium tabular-nums leading-none mt-0.5">
            {date.short}
            {/* L'heure n'est affichée que pour les matchs 2v2 (demande explicite). */}
            {is2v2 && (
              <>
                <span className="mx-1 opacity-40">·</span>
                {fmtTime(match.playedAt)}
              </>
            )}
            <span className="mx-1 opacity-40">·</span>
            {date.long}
          </span>
        </div>
      </div>

      {/* Score — zone alignée à droite, largeur mini constante. */}
      <div className="flex-shrink-0 flex justify-end min-w-[46px]">
        <MatchScore
          game={match.game}
          winnerScore={winnerScore}
          loserScore={loserScore}
          myPerspective={outcome}
          bestOf={match.bestOf}
          compact
        />
      </div>

      {/* Delta ELO — colonne fixe (espace réservé même sans delta pour aligner). */}
      <div
        className={`flex-shrink-0 w-11 text-end text-xs font-mono font-extrabold tabular-nums ${
          !match.countedForElo
            ? 'opacity-0'
            : delta > 0
              ? 'text-teal'
              : delta < 0
                ? 'text-red'
                : 'text-muted'
        }`}
      >
        {match.countedForElo ? `${delta > 0 ? '+' : ''}${delta}` : '+0'}
      </div>
    </motion.div>
  );
}
