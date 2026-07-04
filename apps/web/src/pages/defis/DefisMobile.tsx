import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Plus, Swords, Target, Users, X, Zap } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PullToRefresh } from '../../mobile/primitives/PullToRefresh';
import { HeroPlayerCard } from './mobile/HeroPlayerCard';
import { DeclareGameSheet } from './mobile/DeclareGameSheet';
import { DeclareFfaGameSheet } from './mobile/DeclareFfaGameSheet';
import { DeclareDartsGameSheet } from './mobile/DeclareDartsGameSheet';
import { NewTeamCelebration } from '../../components/NewTeamCelebration';
import { ChallengeSheet } from './mobile/ChallengeSheet';
import { ChallengeRecordSheet } from './mobile/ChallengeRecordSheet';
import { BigActionButton } from './mobile/BigActionButton';
import { OpponentBubble } from './mobile/OpponentBubble';
import { PendingMatchCard } from './mobile/PendingMatchCard';
import { ContestableMatchCard } from './mobile/ContestableMatchCard';
import { ChallengeMobileCard } from './mobile/ChallengeMobileCard';
import { MatchmakingButton } from '../../components/MatchmakingButton';
import { useDefisLogic } from './shared/useDefisLogic';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useOpsStatus } from '../../hooks/useOpsStatus';
import { useGameMode } from '../../hooks/useGameMode';
import { useT } from '../../lib/i18n';
import type { Challenge, PendingFfa } from '../../lib/api';

export function DefisMobile() {
  const {
    myLogin,
    incoming,
    outgoing,
    accepted,
    pendingToConfirm,
    pendingWaiting,
    ffaToConfirm,
    ffaWaiting,
    dartsToConfirm,
    dartsWaiting,
    contestableMatches,
    others,
    recentOpponents,
    opponentCounts,
    refresh,
    handleAction,
    cancelDeclaration,
    confirmFfa,
    contestFfa,
    cancelFfaDeclaration,
    confirmDarts,
    contestDarts,
    cancelDartsDeclaration,
    contestMatch,
    requestAmicableCancel,
    respondAmicableCancel,
  } = useDefisLogic();
  const t = useT();
  const { leaderboard, locations } = useLeagueData();
  const { isOpsDuel } = useOpsStatus();
  const { game } = useGameMode();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [declareOpen, setDeclareOpen] = useState(false);
  const [ffaOpen, setFfaOpen] = useState(false);
  const [dartsOpen, setDartsOpen] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);

  // Célébration nouveau duo 2v2 — géré ici (niveau racine, jamais démonté)
  // pour éviter les problèmes de cycle de vie dans DeclareGameSheet.
  const [teamCelebration, setTeamCelebration] = useState<{
    teamId: string; teamElo: number;
    player1: { login: string; elo?: number };
    player2: { login: string; imageUrl?: string | null; elo?: number };
  } | null>(null);

  const myElo = leaderboard.find((u) => u.login === myLogin)?.elo;
  const [recordChallenge, setRecordChallenge] = useState<Challenge | null>(null);

  // Ouvre le sheet d'enregistrement si ?record=<id> est dans l'URL.
  useEffect(() => {
    const id = searchParams.get('record');
    if (!id) return;
    const ch = accepted.find((c) => c.id === id);
    if (ch) setRecordChallenge(ch);
  }, [searchParams, accepted]);

  // Map login → imageUrl pour les cartes de défis
  const imgByLogin = new Map(leaderboard.map((u) => [u.login, u.imageUrl] as const));

  const totalChallenges = incoming.length + accepted.length + outgoing.length;

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="space-y-5">
        {/* Hero player card */}
        <HeroPlayerCard />

        {/* Match aléatoire (matchmaking queue) — CTA proéminent */}
        <MatchmakingButton />

        {/* CTAs — Déclarer (1v1/2v2 au choix dans le sheet), Défier */}
        <div className="space-y-2.5">
          <BigActionButton
            Icon={Plus}
            tone="amber"
            title={t('defis.cta.declare')}
            subtitle={t('defis.cta.declare1v1.sub')}
            accessory={<Silhouettes2 />}
            onClick={() => setDeclareOpen(true)}
          />
          {/* FFA — uniquement en Smash. */}
          {game === 'smash' && (
            <BigActionButton
              Icon={Users}
              tone="red"
              title={t('ffa.cta.title')}
              subtitle={t('ffa.cta.sub')}
              accessory={<Silhouettes4 />}
              onClick={() => setFfaOpen(true)}
            />
          )}
          {/* Manche de fléchettes — uniquement en Fléchettes. */}
          {game === 'flechettes' && (
            <BigActionButton
              Icon={Target}
              tone="red"
              title={t('darts.cta.title')}
              subtitle={t('darts.cta.sub')}
              onClick={() => setDartsOpen(true)}
            />
          )}
          <BigActionButton
            Icon={Swords}
            tone="gold"
            title={t('defis.cta.challenge')}
            subtitle={t('defis.cta.challengeSub')}
            onClick={() => setChallengeOpen(true)}
          />
        </div>

        {/* Pending — à confirmer (CTA urgent) */}
        {pendingToConfirm.length > 0 && (
          <section>
            <SectionHeader
              icon={<Zap className="w-3.5 h-3.5 text-gold" strokeWidth={2.5} />}
              title={t('defis.toConfirm')}
              badge={pendingToConfirm.length}
              tone="gold"
            />
            <div className="space-y-2.5">
              {pendingToConfirm.map((p) => (
                <PendingMatchCard key={p.id} match={p} myLogin={myLogin} onDone={refresh} />
              ))}
            </div>
          </section>
        )}

        {/* Matchs auto-validés (48h sans réponse) encore contestables */}
        {contestableMatches.length > 0 && (
          <section>
            <SectionHeader
              icon={<Clock className="w-3.5 h-3.5 text-amber-400" strokeWidth={2.5} />}
              title={t('defis.contestable.title')}
              badge={contestableMatches.length}
              tone="gold"
            />
            <div className="space-y-2.5">
              {contestableMatches.map((m) => (
                <ContestableMatchCard key={m.id} match={m} onContest={contestMatch} />
              ))}
            </div>
          </section>
        )}

        {/* FFA Smash — ma position à confirmer */}
        {ffaToConfirm.length > 0 && (
          <section>
            <SectionHeader
              icon={<Users className="w-3.5 h-3.5 text-red" strokeWidth={2.5} />}
              title={t('ffa.toConfirm')}
              badge={ffaToConfirm.length}
              tone="gold"
            />
            <div className="space-y-2.5">
              {ffaToConfirm.map((f) => (
                <FfaMobileCard key={f.id} ffa={f} myLogin={myLogin} onConfirm={confirmFfa} onContest={contestFfa} />
              ))}
            </div>
          </section>
        )}

        {/* FFA Smash — en attente des autres */}
        {ffaWaiting.length > 0 && (
          <section>
            <SectionHeader title={t('ffa.waiting')} />
            <div className="space-y-2.5">
              {ffaWaiting.map((f) => (
                <FfaMobileCard key={f.id} ffa={f} myLogin={myLogin} waiting onCancel={cancelFfaDeclaration} />
              ))}
            </div>
          </section>
        )}

        {/* Fléchettes — mon reste à confirmer */}
        {dartsToConfirm.length > 0 && (
          <section>
            <SectionHeader
              icon={<Target className="w-3.5 h-3.5" strokeWidth={2.5} style={{ color: '#14b8a6' }} />}
              title={t('darts.toConfirm')}
              badge={dartsToConfirm.length}
              tone="gold"
            />
            <div className="space-y-2.5">
              {dartsToConfirm.map((d) => (
                <DartsMobileCard key={d.id} darts={d} myLogin={myLogin} onConfirm={confirmDarts} onContest={contestDarts} />
              ))}
            </div>
          </section>
        )}

        {/* Fléchettes — en attente des autres */}
        {dartsWaiting.length > 0 && (
          <section>
            <SectionHeader title={t('darts.waiting')} />
            <div className="space-y-2.5">
              {dartsWaiting.map((d) => (
                <DartsMobileCard key={d.id} darts={d} myLogin={myLogin} waiting onCancel={cancelDartsDeclaration} />
              ))}
            </div>
          </section>
        )}

        {pendingWaiting.length > 0 && (
          <section>
            <SectionHeader title={t('defis.waitingConfirm')} />
            <div className="space-y-2">
              {pendingWaiting.map((p) =>
                p.mode === '2v2' ? (
                  // 2v2 : on attend la validation des 3 autres — composition
                  // complète (mon duo vs duo adverse) + avancée des confirmations.
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative card-hud px-4 py-3 text-xs hover-glow group"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-[0.14em] bg-red/15 text-red border border-red/30">
                        2 vs 2
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-display tabular-nums font-black text-text-strong text-sm flex items-center gap-1">
                          <span className={p.scoreDeclarer > p.scoreOpponent ? 'text-gold' : 'text-muted-2'}>
                            {p.scoreDeclarer}
                          </span>
                          <span className="text-muted mx-0.5">–</span>
                          <span className={p.scoreOpponent > p.scoreDeclarer ? 'text-gold' : 'text-red'}>
                            {p.scoreOpponent}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => cancelDeclaration(p)}
                          aria-label={t('defis.cancelDeclarationAria')}
                          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-2 hover:text-red hover:bg-red/10 active:scale-95 transition-colors"
                        >
                          <X className="w-4 h-4" strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>

                    <div className="text-[11px] font-semibold text-text-strong text-center leading-relaxed">
                      <span className="text-gold">
                        {p.declarerLogin} &amp; {p.partner1Login}
                      </span>
                      <span className="text-muted-2"> vs </span>
                      <span>
                        {p.opponentLogin} &amp; {p.partner2Login}
                      </span>
                    </div>

                    <div className="text-[9px] text-muted-2 uppercase tracking-[0.14em] font-bold text-center mt-1.5">
                      {[p.partner1Confirmed, p.opp1Confirmed, p.opp2Confirmed].filter(Boolean).length}/3 confirmations
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`relative card-hud px-4 py-3 flex items-center gap-3 text-xs hover-glow group ${
                      isOpsDuel(p.declarerLogin, p.opponentLogin, p.declaredAt) ? 'ops-duel' : ''
                    }`}
                  >
                    {/* Silhouette trophée à gauche */}
                    <div className="relative flex-shrink-0 w-9 h-9 rounded-lg metal-plate flex items-center justify-center">
                      <svg
                        viewBox="0 0 24 24"
                        className="w-5 h-5 text-gold/70 group-hover:text-gold transition-colors"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path d="M7 4h10v2h3a1 1 0 0 1 1 1v2c0 2.2-1.8 4-4 4h-.3c-.7 1.7-2.1 3-3.7 3.4V19h3v2H8v-2h3v-2.6c-1.6-.4-3-1.7-3.7-3.4H7c-2.2 0-4-1.8-4-4V7a1 1 0 0 1 1-1h3V4Zm0 4H5v1c0 1.1.9 2 2 2V8Zm10 0v3c1.1 0 2-.9 2-2V8h-2Z" />
                      </svg>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-muted-2 uppercase tracking-[0.12em] font-bold">
                        {t('defis.waitingFor')}
                      </div>
                      <div className="font-display font-bold text-text-strong truncate text-sm tracking-wide">
                        {p.opponentLogin}
                      </div>
                    </div>

                    <div className="font-display tabular-nums font-black text-text-strong text-sm flex items-center gap-1">
                      <span className={p.scoreDeclarer > p.scoreOpponent ? 'text-gold' : 'text-muted-2'}>
                        {p.scoreDeclarer}
                      </span>
                      <span className="text-muted mx-0.5">–</span>
                      <span className={p.scoreOpponent > p.scoreDeclarer ? 'text-gold' : 'text-red'}>
                        {p.scoreOpponent}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => cancelDeclaration(p)}
                      aria-label={t('defis.cancelDeclarationAria')}
                      className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-2 hover:text-red hover:bg-red/10 active:scale-95 transition-colors"
                    >
                      <X className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                  </motion.div>
                ),
              )}
            </div>
          </section>
        )}

        {/* Adversaires récents — strip horizontal */}
        {recentOpponents.length > 0 && (
          <section>
            <SectionHeader
              icon={<Users className="w-3.5 h-3.5 text-teal" strokeWidth={2.5} />}
              title={t('defis.recentOpponents')}
            />
            <div className="-mx-4 px-4 overflow-x-auto scrollbar-none scroll-smooth-touch">
              <div className="flex gap-3 pb-1 min-w-min">
                {recentOpponents.slice(0, 12).map((p) => (
                  <OpponentBubble
                    key={p.login}
                    player={p}
                    count={opponentCounts[p.login]}
                    onClick={() => navigate(`/player/${p.login}`)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Défis — reçus / prévus / envoyés empilés et tous visibles d'un coup
            (comme sur desktop), plus de bascule par onglets. On ne montre que
            les groupes non vides. */}
        {incoming.length > 0 && (
          <section>
            <SectionHeader title={t('defis.tab.received')} badge={incoming.length} />
            <div className="space-y-2.5">
              {incoming.map((c) => (
                <ChallengeMobileCard
                  key={c.id}
                  challenge={c}
                  kind="incoming"
                  myLogin={myLogin}
                  imageUrl={imgByLogin.get(c.challengerLogin)}
                  onAccept={() => handleAction(c.id, 'accept')}
                  onDecline={() => handleAction(c.id, 'decline')}
                />
              ))}
            </div>
          </section>
        )}

        {accepted.length > 0 && (
          <section>
            <SectionHeader title={t('defis.tab.scheduled')} badge={accepted.length} />
            <div className="space-y-2.5">
              {accepted.map((c) => (
                <ChallengeMobileCard
                  key={c.id}
                  challenge={c}
                  kind="accepted"
                  myLogin={myLogin}
                  imageUrl={imgByLogin.get(
                    c.challengerLogin === myLogin ? c.opponentLogin : c.challengerLogin,
                  )}
                  onAccept={() => setRecordChallenge(c)}
                  onDecline={() => handleAction(c.id, 'decline')}
                  onAmicableRequest={() => requestAmicableCancel(c.id)}
                  onAmicableRespond={(accept) => respondAmicableCancel(c.id, accept)}
                />
              ))}
            </div>
          </section>
        )}

        {outgoing.length > 0 && (
          <section>
            <SectionHeader title={t('defis.tab.sent')} badge={outgoing.length} />
            <div className="space-y-2.5">
              {outgoing.map((c) => (
                <ChallengeMobileCard
                  key={c.id}
                  challenge={c}
                  kind="outgoing"
                  myLogin={myLogin}
                  imageUrl={imgByLogin.get(c.opponentLogin)}
                  onAccept={() => {}}
                  onDecline={() => handleAction(c.id, 'decline')}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty state si rien de tout cela */}
        {totalChallenges === 0 &&
          pendingToConfirm.length === 0 &&
          pendingWaiting.length === 0 && (
            <div className="text-center py-10 px-4">
              <div className="text-4xl mb-3 opacity-60"></div>
              <div className="text-sm text-muted-2 font-medium">
                {t('defis.noChallenges')}<br />
                <span className="text-xs text-muted">
                  {t('defis.goChallenge')}
                </span>
              </div>
            </div>
          )}
      </div>

      {/* Sheet de déclaration 1v1 / 2v2 */}
      <DeclareGameSheet
        open={declareOpen}
        onClose={() => setDeclareOpen(false)}
        others={others}
        recentOpponents={recentOpponents}
        opponentCounts={opponentCounts}
        myLogin={myLogin}
        locations={locations}
        onDone={refresh}
        onNewTeam={setTeamCelebration}
      />

      {/* Célébration nouveau duo — rendu au niveau racine pour survivre à onClose */}
      {teamCelebration && (
        <NewTeamCelebration
          teamId={teamCelebration.teamId}
          teamElo={teamCelebration.teamElo}
          player1={teamCelebration.player1}
          player2={teamCelebration.player2}
          onClose={() => setTeamCelebration(null)}
        />
      )}

      {/* Sheet de déclaration FFA Smash */}
      <DeclareFfaGameSheet
        open={ffaOpen}
        onClose={() => setFfaOpen(false)}
        others={others}
        recentOpponents={recentOpponents}
        opponentCounts={opponentCounts}
        myLogin={myLogin}
        myElo={myElo}
        locations={locations}
        onDone={refresh}
      />

      {/* Sheet de déclaration d'une manche de fléchettes */}
      <DeclareDartsGameSheet
        open={dartsOpen}
        onClose={() => setDartsOpen(false)}
        others={others}
        recentOpponents={recentOpponents}
        opponentCounts={opponentCounts}
        myLogin={myLogin}
        myElo={myElo}
        locations={locations}
        onDone={refresh}
      />

      {/* Sheet de défi (duel à venir) */}
      <ChallengeSheet
        open={challengeOpen}
        onClose={() => setChallengeOpen(false)}
        others={others}
        recentOpponents={recentOpponents}
        opponentCounts={opponentCounts}
        myLogin={myLogin}
        locations={locations}
        onDone={refresh}
      />

      {/* Sheet d'enregistrement d'un défi accepté — utilise le jeu DU défi */}
      <ChallengeRecordSheet
        challenge={recordChallenge}
        myLogin={myLogin}
        onClose={() => {
          setRecordChallenge(null);
          navigate('/challenges', { replace: true });
        }}
        onDone={refresh}
      />
    </PullToRefresh>
  );
}

// ─── Helpers locaux ──────────────────────────────────────────────────────────

/** 2 silhouettes pour le bouton 1v1. */
function Silhouettes2() {
  return (
    <svg width="28" height="18" viewBox="0 0 28 18" fill="currentColor" className="text-gold/50" aria-hidden>
      <circle cx="8" cy="5" r="3.5" />
      <path d="M1 17c0-3.866 3.134-7 7-7s7 3.134 7 17H1z" opacity={0} />
      <ellipse cx="8" cy="14.5" rx="6" ry="3.5" />
      <circle cx="20" cy="5" r="3.5" />
      <ellipse cx="20" cy="14.5" rx="6" ry="3.5" />
    </svg>
  );
}

/** 4 silhouettes pour le bouton 2v2. */
function Silhouettes4() {
  return (
    <svg width="38" height="18" viewBox="0 0 38 18" fill="currentColor" className="text-red/50" aria-hidden>
      <circle cx="5"  cy="5" r="2.8" />
      <ellipse cx="5"  cy="14" rx="4.5" ry="3" />
      <circle cx="13" cy="5" r="2.8" />
      <ellipse cx="13" cy="14" rx="4.5" ry="3" />
      <circle cx="25" cy="5" r="2.8" />
      <ellipse cx="25" cy="14" rx="4.5" ry="3" />
      <circle cx="33" cy="5" r="2.8" />
      <ellipse cx="33" cy="14" rx="4.5" ry="3" />
    </svg>
  );
}

// ─── FFA Smash : carte mobile (confirmer sa place / contester / annuler) ──────

function FfaMobileCard({
  ffa, myLogin, waiting = false, onConfirm, onContest, onCancel,
}: {
  ffa: PendingFfa;
  myLogin: string | undefined;
  waiting?: boolean;
  onConfirm?: (id: string, position: number) => Promise<void>;
  onContest?: (id: string, claimedPosition: number, message?: string) => Promise<void>;
  onCancel?: (id: string) => Promise<void>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [contesting, setContesting] = useState(false);
  const [claimed, setClaimed] = useState(0);
  const ordered = [...ffa.participants].sort((a, b) => a.position - b.position);
  const mine = ffa.participants.find((p) => p.login === myLogin);
  const confirmedCount = ffa.participants.filter((p) => p.confirmed).length;
  const total = ffa.participants.length;
  const isDeclarer = ffa.declarerLogin === myLogin;
  if (!mine) return null;

  return (
    <div className="relative card-hud px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <Users className="w-4 h-4 text-red flex-shrink-0" strokeWidth={2.5} />
        <span className="text-xs font-bold text-text-strong">{ffa.declarerLogin}</span>
        <span className="text-[10px] text-muted-2">{t('ffa.placedYou')}</span>
        <span className="ml-auto font-mono text-[10px] text-muted bg-bg-2 px-1.5 py-0.5 rounded">{confirmedCount}/{total}</span>
      </div>

      {/* Classement proposé */}
      <div className="space-y-1 mb-3">
        {ordered.map((p) => (
          <div
            key={p.login}
            className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs ${
              p.login === myLogin ? 'bg-gold/[0.08] text-gold font-extrabold' : 'text-muted-2'
            }`}
          >
            <span className="font-mono w-5 text-center">{p.position}</span>
            <span className="flex-1 truncate">{p.login}</span>
            {p.confirmed && <span className="text-teal">✓</span>}
          </div>
        ))}
      </div>

      {!waiting && !contesting && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onConfirm?.(ffa.id, mine.position); } finally { setBusy(false); } }}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-gold to-[#f5b942] text-[#1a1100] text-xs font-black uppercase tracking-wider active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {t('ffa.confirmPlace')} · {t('ffa.positionShort')}{mine.position}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => { setClaimed(mine.position); setContesting(true); }}
            className="px-4 py-2.5 rounded-xl border border-red/40 text-red text-xs font-bold active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {t('ffa.contest')}
          </button>
        </div>
      )}

      {!waiting && contesting && (
        <div className="rounded-xl border border-red/30 bg-red/[0.04] p-3">
          <div className="text-[11px] text-muted-2 mb-2 leading-relaxed">{t('ffa.contest.sub')}</div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted mb-2">{t('ffa.contest.yourPlace')}</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {Array.from({ length: total }, (_, i) => i + 1).map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => setClaimed(pos)}
                className={`w-9 h-9 rounded-lg font-mono font-extrabold text-sm transition-colors ${
                  claimed === pos ? 'bg-gold text-[#1a1100]' : 'bg-bg-2 text-muted-2'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setContesting(false)}
              className="flex-1 py-2 rounded-lg bg-bg-2 text-muted-2 text-xs font-bold"
            >
              {t('defis.confirm.keep')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => { setBusy(true); try { await onContest?.(ffa.id, claimed); } finally { setBusy(false); setContesting(false); } }}
              className="flex-1 py-2 rounded-lg bg-red text-white text-xs font-bold disabled:opacity-50"
            >
              {t('ffa.contest.submit')}
            </button>
          </div>
        </div>
      )}

      {waiting && isDeclarer && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => { setBusy(true); try { await onCancel?.(ffa.id); } finally { setBusy(false); } }}
          className="w-full py-2 rounded-xl border border-border text-muted-2 text-xs font-bold active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {t('defis.cancel')}
        </button>
      )}
    </div>
  );
}

// ─── Fléchettes : carte mobile (confirmer son reste / contester / annuler) ────

function DartsMobileCard({
  darts, myLogin, waiting = false, onConfirm, onContest, onCancel,
}: {
  darts: PendingFfa;
  myLogin: string | undefined;
  waiting?: boolean;
  onConfirm?: (id: string, remaining: number) => Promise<void>;
  onContest?: (id: string, claimedRemaining: number, message?: string) => Promise<void>;
  onCancel?: (id: string) => Promise<void>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [contesting, setContesting] = useState(false);
  const [claimed, setClaimed] = useState('');
  // Classement dérivé du reste (0 = vainqueur, puis du plus petit au plus grand).
  const ordered = [...darts.participants].sort(
    (a, b) => (a.remaining ?? Infinity) - (b.remaining ?? Infinity),
  );
  const mine = darts.participants.find((p) => p.login === myLogin);
  const confirmedCount = darts.participants.filter((p) => p.confirmed).length;
  const total = darts.participants.length;
  const isDeclarer = darts.declarerLogin === myLogin;
  const startScore = darts.startScore ?? null;
  if (!mine) return null;
  const myRemaining = mine.remaining ?? 0;
  // Le reste revendiqué doit être un entier compris entre 0 et le startScore de
  // la manche (défense côté front, sans dépendre du rejet backend).
  const claimedNum = Number(claimed);
  const claimedValid =
    claimed.trim() !== '' &&
    Number.isInteger(claimedNum) &&
    claimedNum >= 0 &&
    (startScore == null || claimedNum <= startScore);

  return (
    <div className="relative card-hud px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <Target className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} style={{ color: '#14b8a6' }} />
        <span className="text-xs font-bold text-text-strong">{darts.declarerLogin}</span>
        <span className="text-[10px] text-muted-2">{t('darts.placedYou')}</span>
        {startScore != null && (
          <span className="font-mono text-[10px] text-muted bg-bg-2 px-1.5 py-0.5 rounded">{startScore}</span>
        )}
        <span className="ml-auto font-mono text-[10px] text-muted bg-bg-2 px-1.5 py-0.5 rounded">{confirmedCount}/{total}</span>
      </div>

      {/* Restes proposés */}
      <div className="space-y-1 mb-3">
        {ordered.map((p) => (
          <div
            key={p.login}
            className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs ${
              p.login === myLogin ? 'bg-gold/[0.08] text-gold font-extrabold' : 'text-muted-2'
            }`}
          >
            <span className="w-5 text-center">{(p.remaining ?? 0) === 0 ? '🏆' : ''}</span>
            <span className="flex-1 truncate">{p.login}</span>
            <span className="font-mono tabular-nums">{p.remaining ?? 0}</span>
            {p.confirmed && <span style={{ color: '#14b8a6' }}>✓</span>}
          </div>
        ))}
      </div>

      {!waiting && !contesting && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onConfirm?.(darts.id, myRemaining); } finally { setBusy(false); } }}
            className="flex-1 py-2.5 rounded-xl text-[#022] text-xs font-black uppercase tracking-wider active:scale-[0.98] transition-transform disabled:opacity-50"
            style={{ background: 'linear-gradient(90deg, #2dd4bf 0%, #14b8a6 100%)' }}
          >
            {t('darts.confirmRemaining')} · {myRemaining}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => { setClaimed(String(myRemaining)); setContesting(true); }}
            className="px-4 py-2.5 rounded-xl border text-xs font-bold active:scale-[0.98] transition-transform disabled:opacity-50"
            style={{ borderColor: 'rgba(20,184,166,0.4)', color: '#14b8a6' }}
          >
            {t('darts.contest')}
          </button>
        </div>
      )}

      {!waiting && contesting && (
        <div className="rounded-xl border p-3" style={{ borderColor: 'rgba(20,184,166,0.3)', background: 'rgba(20,184,166,0.04)' }}>
          <div className="text-[11px] text-muted-2 mb-2 leading-relaxed">{t('darts.contest.sub')}</div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted mb-2">{t('darts.contest.yourRemaining')}</div>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={startScore ?? undefined}
            value={claimed}
            onChange={(e) => setClaimed(e.target.value)}
            className="w-full mb-1 px-3 py-2 rounded-lg bg-bg-2 text-text-strong font-mono tabular-nums text-sm outline-none focus:ring-2"
            style={{ ['--tw-ring-color' as string]: 'rgba(20,184,166,0.5)' }}
          />
          {claimed.trim() !== '' && !claimedValid && (
            <div className="text-[10px] text-red-400 mb-2">{t('darts.contest.range')} {startScore ?? 501}</div>
          )}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => setContesting(false)}
              className="flex-1 py-2 rounded-lg bg-bg-2 text-muted-2 text-xs font-bold"
            >
              {t('defis.confirm.keep')}
            </button>
            <button
              type="button"
              disabled={busy || !claimedValid}
              onClick={async () => {
                if (!claimedValid) return;
                setBusy(true);
                try { await onContest?.(darts.id, claimedNum); } finally { setBusy(false); setContesting(false); }
              }}
              className="flex-1 py-2 rounded-lg text-white text-xs font-bold disabled:opacity-50"
              style={{ background: '#14b8a6' }}
            >
              {t('darts.contest.submit')}
            </button>
          </div>
        </div>
      )}

      {waiting && isDeclarer && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => { setBusy(true); try { await onCancel?.(darts.id); } finally { setBusy(false); } }}
          className="w-full py-2 rounded-xl border border-border text-muted-2 text-xs font-bold active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {t('defis.cancel')}
        </button>
      )}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
  badge?: number;
  tone?: 'teal' | 'gold' | 'muted';
}

function SectionHeader({ title, icon, badge, tone = 'muted' }: SectionHeaderProps) {
  const toneCls =
    tone === 'gold' ? 'text-gold' : tone === 'teal' ? 'text-gold' : 'text-gold/80';
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <span className="inline-block w-1 h-3 bg-gradient-to-b from-gold to-gold-dim rounded-sm" />
      {icon}
      <span className={`font-gaming text-[10px] uppercase tracking-[0.18em] font-extrabold ${toneCls}`}>
        {title}
      </span>
      {badge !== undefined && badge > 0 && (
        <span className="font-mono text-[10px] text-muted tabular-nums">· {badge}</span>
      )}
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent ml-2" />
    </div>
  );
}
