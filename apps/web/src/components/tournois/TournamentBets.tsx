import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Swords, Trophy } from 'lucide-react';
import {
  api,
  DRAW_CHOICE,
  type MyBet,
  type PlaceBetInput,
  type PlaceMatchBetInput,
  type Tournament,
  type TournamentMatch,
} from '../../lib/api';
import { trackEvent } from '../../lib/analytics';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useT } from '../../lib/i18n';
import { Avatar } from '../Avatar';
import { BetForm, CoinAmount, GameTag, betStatusStyle } from '../bets/BetPrimitives';

/** Visage(s) d'une équipe : pp du capitaine (+ coéquipier en 2v2) puis le libellé.
 *  Rend les affiches lisibles d'un coup d'œil dans l'onglet « Parier ». */
function TeamFaces({
  login,
  partners,
  avatars,
  size = 'sm',
  align = 'left',
}: {
  login: string | null;
  partners: Record<string, string | null>;
  avatars: Record<string, string | null>;
  size?: 'xs' | 'sm' | 'md';
  align?: 'left' | 'right';
}) {
  if (!login) return <span className="text-muted-2">?</span>;
  const partner = partners[login] ?? null;
  const faces = (
    <div className="flex -space-x-2 shrink-0">
      <Avatar login={login} imageUrl={avatars[login] ?? null} size={size} />
      {partner && <Avatar login={partner} imageUrl={avatars[partner] ?? null} size={size} />}
    </div>
  );
  const label = (
    <span className="font-extrabold text-text-strong text-sm truncate">
      @{login}
      {partner && <span className="text-muted-2"> &amp; @{partner}</span>}
    </span>
  );
  return (
    <div className={`flex items-center gap-2 min-w-0 ${align === 'right' ? 'flex-row-reverse text-end' : ''}`}>
      {faces}
      {label}
    </div>
  );
}

/** En-tête de section dorée, alignée sur le style de la page tournoi. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.16em] text-gold font-extrabold mb-3 flex items-center gap-2">
      <span className="inline-block w-1 h-2.5 bg-gradient-to-b from-gold to-gold-dim rounded-sm" />
      {children}
    </div>
  );
}

/** Libellé d'une équipe : « @cap » ou « @cap & @partner » en 2v2. */
function teamLabel(login: string | null, partners: Record<string, string | null>): string {
  if (!login) return '?';
  const p = partners[login];
  return p ? `@${login} & @${p}` : `@${login}`;
}

/**
 * Onglet « Parier » d'un tournoi. Deux marchés selon la phase :
 * - INSCRIPTION : pari sur le VAINQUEUR du tournoi (cote progressive), fermé au
 *   lancement.
 * - EN COURS : pari sur l'ISSUE de chaque match à venir (victoire A / NUL en ligue
 *   / victoire B, cote fixe ×2), fermé dès qu'un score est saisi.
 * Solde + mes paris viennent de GET /bets ; la validation reste côté serveur.
 */
export function TournamentBets({
  tournament,
  myLogin,
}: {
  tournament: Tournament;
  myLogin: string | null;
}) {
  const t = useT();
  const { refresh } = useLeagueData();
  const [coins, setCoins] = useState(0);
  const [myBets, setMyBets] = useState<MyBet[]>([]);
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  // Prime « gambler » : reflet immédiat du claim sans attendre un refetch du
  // tournoi (le payload GET /tournaments/:id porte gamblerBonusClaimed).
  const [claimedLocal, setClaimedLocal] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const gamblerClaimed = claimedLocal || !!tournament.gamblerBonusClaimed;

  const loadBets = useCallback(() => {
    api
      .bets()
      .then((d) => {
        setCoins(d.coins);
        setMyBets(d.myBets.filter((b) => b.tournamentId === tournament.id));
      })
      .catch(() => {});
  }, [tournament.id]);

  // Recharge à l'ouverture et à chaque mise à jour du tournoi (un match qui se
  // joue n'est plus pariable → on resynchronise solde + mes paris).
  useEffect(() => {
    loadBets();
  }, [loadBets, tournament]);

  // Enrobage commun à un placement (vainqueur ou match).
  const runPlace = useCallback(
    async (place: () => Promise<unknown>) => {
      setPlacing(true);
      setFlash(null);
      try {
        await place();
        trackEvent('bet.place');
        setOpenForm(null);
        setFlash(t('bets.placed'));
        loadBets();
        void refresh();
      } catch {
        setFlash(t('bets.error'));
      } finally {
        setPlacing(false);
      }
    },
    [loadBets, refresh, t],
  );
  const placeBet = useCallback(
    (input: PlaceBetInput) => runPlace(() => api.placeBet(input)),
    [runPlace],
  );
  const placeMatchBet = useCallback(
    (input: PlaceMatchBetInput) => runPlace(() => api.placeMatchBet(input)),
    [runPlace],
  );
  // Réclame la prime « gambler » (150 coins, une fois par tournoi en cours).
  const claimGambler = useCallback(async () => {
    setClaiming(true);
    setFlash(null);
    try {
      await api.claimGamblerBonus(tournament.id);
      setClaimedLocal(true);
      trackEvent('bet.gambler_claim');
      setFlash(t('bets.gamblerClaimed'));
      loadBets();
      void refresh();
    } catch {
      // Erreur transitoire OU déjà réclamée : on n'affirme rien (le prochain refetch
      // du tournoi posera gamblerBonusClaimed si c'était vraiment déjà pris).
      setFlash(t('bets.error'));
    } finally {
      setClaiming(false);
    }
  }, [tournament.id, loadBets, refresh, t]);

  const entries = tournament.entries ?? [];
  const entrants = entries.map((e) => e.login);
  // 2v2 : capitaine → coéquipier. On parie sur le DUO, mais la valeur reste le
  // login du capitaine (clé canonique : le vainqueur du tournoi est ce login).
  const partners = useMemo(
    () =>
      Object.fromEntries(entries.map((e) => [e.login, e.partnerLogin ?? null])) as Record<
        string,
        string | null
      >,
    [entries],
  );
  // Map login → photo (capitaines ET coéquipiers) pour les pp du formulaire.
  const avatars = useMemo(
    () =>
      Object.fromEntries(
        [
          ...entries.map((e) => [e.login, e.user?.imageUrl ?? null] as const),
          ...entries.map((e) => [e.partnerLogin, e.partner?.imageUrl ?? null] as const),
        ].filter(([login]) => !!login),
      ) as Record<string, string | null>,
    [entries],
  );

  const isRegistration = tournament.status === 'registration';
  const isInProgress = tournament.status === 'in_progress';
  // Un participant (capitaine OU coéquipier) ne peut pas parier sur son propre
  // tournoi (refus serveur 403).
  const iAmEntrant =
    !!myLogin && (entrants.includes(myLogin) || Object.values(partners).includes(myLogin));
  const canBetWinner = isRegistration && !iAmEntrant && entrants.length > 0;

  // Membres d'une équipe (capitaine + coéquipier éventuel).
  const teamOf = useCallback(
    (login: string | null) => (login ? [login, partners[login] ?? null].filter(Boolean) : []),
    [partners],
  );
  // Matchs PARIABLES : les deux joueurs connus, pas encore saisis/confirmés/verrouillés.
  // MES matchs restent pariables — mais uniquement sur le SCORE EXACT (cf. renderMatchCard).
  const openMatches = useMemo(() => {
    if (!isInProgress) return [] as TournamentMatch[];
    return (tournament.matches ?? []).filter((m) => {
      if (!m.playerALogin || !m.playerBLogin) return false;
      // Pile-ou-face lancé → marché fermé (le match va commencer).
      if (m.tossAt) return false;
      return !(m.confirmedAt || m.recordedAt || m.betsLockedAt);
    });
  }, [isInProgress, tournament.matches]);
  // « Match à suivre » : l'affiche ANNONCÉE par l'orga (activeMatchId) si elle est
  // encore pariable, sinon le prochain match ouvert. Mise en avant en grand pour
  // parier en un clic ; les autres affiches suivent en liste compacte.
  const featured = useMemo(() => {
    if (!isInProgress) return null;
    const announced = openMatches.find((m) => m.id === tournament.activeMatchId);
    return announced ?? openMatches[0] ?? null;
  }, [isInProgress, openMatches, tournament.activeMatchId]);
  const restMatches = useMemo(
    () => openMatches.filter((m) => m.id !== featured?.id),
    [openMatches, featured],
  );
  // Matchs sur lesquels j'ai déjà un pari ouvert (pour masquer le bouton).
  const myOpenMatchIds = useMemo(
    () => new Set(myBets.filter((b) => b.targetType === 'match' && b.status === 'open').map((b) => b.matchId)),
    [myBets],
  );
  // Map matchId → match (pour afficher l'affiche dans « Mes paris »).
  const matchById = useMemo(
    () => new Map((tournament.matches ?? []).map((m) => [m.id, m])),
    [tournament.matches],
  );

  // Affiche pariable (pp visibles). `featured` → version mise en avant (plus grande,
  // joueurs face à face). Sinon ligne compacte. Réutilise le même formulaire de pari.
  const renderMatchCard = (m: TournamentMatch, isFeatured: boolean) => {
    const key = `m:${m.id}`;
    const isLeague = m.stage === 'league';
    const alreadyBet = myOpenMatchIds.has(m.id);
    // Je joue ce match (capitaine ou coéquipier) → pari possible UNIQUEMENT sur le
    // score exact que je pense faire (gagné ssi pile, gain ×4 — règle serveur).
    const iPlay =
      !!myLogin && [...teamOf(m.playerALogin), ...teamOf(m.playerBLogin)].includes(myLogin);
    const choices = [
      m.playerALogin as string,
      ...(isLeague ? [DRAW_CHOICE] : []),
      m.playerBLogin as string,
    ];
    return (
      <div
        key={m.id}
        className={`rounded-2xl border p-4 ${
          isFeatured ? 'border-gold/40 bg-gold/[0.06] shadow-[0_0_0_1px_rgba(255,201,74,0.12)]' : 'border-gold/15 bg-bg-1/70'
        }`}
      >
        {isFeatured ? (
          <div className="flex items-center justify-between gap-3">
            <TeamFaces login={m.playerALogin} partners={partners} avatars={avatars} size="md" />
            <span className="shrink-0 text-[11px] font-black uppercase tracking-[0.18em] text-gold/70">VS</span>
            <TeamFaces login={m.playerBLogin} partners={partners} avatars={avatars} size="md" align="right" />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Swords className="w-4 h-4 text-gold shrink-0" strokeWidth={2.2} />
              <TeamFaces login={m.playerALogin} partners={partners} avatars={avatars} size="xs" />
              <span className="text-muted-2 text-xs shrink-0">vs</span>
              <TeamFaces login={m.playerBLogin} partners={partners} avatars={avatars} size="xs" />
            </div>
            {!alreadyBet && openForm !== key && (
              <button
                type="button"
                onClick={() => setOpenForm(key)}
                className="shrink-0 px-3 h-8 rounded-lg border border-gold/40 bg-gold/15 text-gold text-xs font-extrabold uppercase tracking-[0.14em] tap-transparent hover:bg-gold/25"
              >
                {t('bets.placeBet')}
              </button>
            )}
          </div>
        )}
        {isFeatured && !alreadyBet && openForm !== key && (
          <button
            type="button"
            onClick={() => setOpenForm(key)}
            className="mt-3 w-full h-9 rounded-lg border border-gold/40 bg-gold/15 text-gold text-xs font-extrabold uppercase tracking-[0.14em] tap-transparent hover:bg-gold/25"
          >
            {t('bets.placeBet')}
          </button>
        )}
        {alreadyBet ? (
          <div className="text-[11px] text-muted-2 mt-2">{t('bets.alreadyBet')}</div>
        ) : (
          openForm === key && (
            <BetForm
              choices={choices}
              avatars={avatars}
              partners={partners}
              labels={{ [DRAW_CHOICE]: t('bets.draw') }}
              maxStake={coins}
              busy={placing}
              scorePrediction={{
                required: iPlay,
                teamA: m.playerALogin as string,
                teamB: m.playerBLogin as string,
                allowDraw: isLeague,
              }}
              onCancel={() => setOpenForm(null)}
              onSubmit={(choiceLogin, stake, scores) =>
                placeMatchBet({
                  matchId: m.id,
                  choiceLogin,
                  stake,
                  ...(scores ? { predictedScoreA: scores.a, predictedScoreB: scores.b } : {}),
                })
              }
            />
          )
        )}
      </div>
    );
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted-2">{t('bets.subtitle')}</p>
        <CoinAmount value={coins} className="text-gold font-extrabold" />
      </div>

      {flash && (
        <div className="text-center text-xs font-bold text-gold bg-gold/10 border border-gold/20 rounded-xl py-2">
          {flash}
        </div>
      )}

      {/* Prime « gambler » : 150 coins offerts une fois par tournoi en cours. */}
      {isInProgress && (
        <div className="rounded-2xl border border-gold/25 bg-gold/[0.06] p-4 flex items-center gap-3">
          <Coins className="w-6 h-6 text-gold shrink-0" strokeWidth={2.2} />
          <p className="flex-1 min-w-0 text-[11px] text-muted-2 leading-snug">
            {t('bets.gamblerHint')}
          </p>
          {gamblerClaimed ? (
            <span className="shrink-0 text-[11px] font-extrabold text-emerald-300">
              {t('bets.gamblerClaimed')}
            </span>
          ) : (
            <button
              type="button"
              disabled={claiming}
              onClick={claimGambler}
              className="shrink-0 px-3 h-9 rounded-lg bg-gold text-black text-xs font-black uppercase tracking-[0.12em] hover:brightness-110 disabled:opacity-50 tap-transparent"
            >
              {t('bets.gamblerClaim')}
            </button>
          )}
        </div>
      )}

      {/* Pari sur le VAINQUEUR du tournoi — phase d'inscription uniquement. */}
      {isRegistration && (
        <section>
          <SectionTitle>{t('bets.tournamentWinner')}</SectionTitle>
          <div className="rounded-2xl border border-gold/15 bg-bg-1/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Trophy className="w-4 h-4 text-gold shrink-0" strokeWidth={2.2} />
                <span className="font-extrabold text-text-strong text-sm truncate">{tournament.name}</span>
                <GameTag game={tournament.game ?? null} />
              </div>
              {canBetWinner && openForm !== 'winner' && (
                <button
                  type="button"
                  onClick={() => setOpenForm('winner')}
                  className="shrink-0 px-3 h-8 rounded-lg border border-gold/40 bg-gold/15 text-gold text-xs font-extrabold uppercase tracking-[0.14em] tap-transparent hover:bg-gold/25"
                >
                  {t('bets.placeBet')}
                </button>
              )}
            </div>
            <div className="text-[11px] text-muted-2 mt-1">{entrants.length} 👥</div>
            {canBetWinner && (
              <p className="text-[11px] text-gold/80 mt-2 leading-snug">
                {t('bets.progressiveNote').replace('{mult}', String(tournament.betFinalMult ?? 2))}
              </p>
            )}
            {canBetWinner ? (
              openForm === 'winner' && (
                <BetForm
                  choices={entrants}
                  avatars={avatars}
                  partners={partners}
                  maxStake={coins}
                  busy={placing}
                  onCancel={() => setOpenForm(null)}
                  onSubmit={(choiceLogin, stake) =>
                    placeBet({
                      targetType: 'tournament',
                      tournamentId: tournament.id,
                      choiceLogin,
                      stake,
                    })
                  }
                />
              )
            ) : (
              <div className="mt-3 pt-3 border-t border-gold/10 text-[12px] text-muted-2">
                {iAmEntrant ? t('bets.ownTournament') : t('bets.closedStarted')}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Pari sur l'ISSUE des matchs — tournoi en cours. */}
      {isInProgress && (
        <section className="space-y-5">
          {iAmEntrant && (
            <p className="text-[11px] text-muted-2">{t('bets.matchOwnHint')}</p>
          )}

          {/* MATCH À SUIVRE : l'affiche en cours/à venir, mise en avant pour parier vite. */}
          {featured && (
            <section>
              <SectionTitle>{t('bets.featured')}</SectionTitle>
              <p className="text-[11px] text-muted-2 mb-2 leading-snug">{t('bets.featuredHint')}</p>
              {renderMatchCard(featured, true)}
            </section>
          )}

          {/* Les AUTRES affiches pariables, en liste compacte avec pp. */}
          {openMatches.length === 0 ? (
            <section>
              <SectionTitle>{t('bets.matchOutcome')}</SectionTitle>
              <div className="text-center text-muted-2 py-4 text-sm">{t('bets.noOpenMatch')}</div>
            </section>
          ) : (
            restMatches.length > 0 && (
              <section>
                <SectionTitle>{t('bets.matchOutcome')}</SectionTitle>
                <div className="space-y-3">{restMatches.map((m) => renderMatchCard(m, false))}</div>
              </section>
            )
          )}
        </section>
      )}

      {/* Mes paris sur ce tournoi */}
      <section>
        <SectionTitle>{t('bets.myBets')}</SectionTitle>
        {myBets.length === 0 ? (
          <div className="text-center text-muted-2 py-4 text-sm">{t('bets.noBets')}</div>
        ) : (
          <div className="space-y-2">
            {myBets.map((bet) => {
              const isMatch = bet.targetType === 'match';
              const m = isMatch && bet.matchId ? matchById.get(bet.matchId) : null;
              const title = isMatch
                ? m
                  ? `${teamLabel(m.playerALogin, partners)} vs ${teamLabel(m.playerBLogin, partners)}`
                  : t('bets.matchOutcome')
                : t('bets.tournamentWinner');
              const pick =
                (bet.choiceLogin === DRAW_CHOICE ? t('bets.draw') : `@${bet.choiceLogin}`) +
                (bet.predictedScoreA != null ? ` (${bet.predictedScoreA}-${bet.predictedScoreB})` : '');
              return (
                <div
                  key={bet.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-bg-1/50 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-text-strong truncate">{title}</div>
                    <div className="text-[11px] text-muted-2 truncate">
                      {bet.stake} {t('bets.on')} {pick}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {bet.status === 'won' && (
                      <CoinAmount value={bet.payout} className="text-emerald-300 font-extrabold text-xs" />
                    )}
                    <span
                      className={`px-2 py-1 rounded-lg text-[10px] uppercase tracking-wider font-extrabold border ${betStatusStyle(
                        bet.status,
                      )}`}
                    >
                      {t(`bets.status.${bet.status}`)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
