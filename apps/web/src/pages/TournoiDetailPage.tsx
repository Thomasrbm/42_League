import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Coins, ChevronRight } from 'lucide-react';
import { Panel } from '../components/Panel';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { PlayerLink } from '../components/PlayerLink';
import { AbacusSlider } from '../components/AbacusSlider';
import { OutcomeButton } from '../components/OutcomeButton';
import { api, type Game, type Tournament, type TournamentMatch, type TournamentInvite, type LeaderboardEntry } from '../lib/api';
import { PlayerSearch } from './defis/shared/PlayerSearch';
import BracketTree from '../components/tournois/BracketTree';
import CoinFlip from '../components/tournois/CoinFlip';
import { CoinFlipOverlay } from '../components/tournois/CoinFlipOverlay';
import { VersusOverlay, type VersusFighter } from '../components/tournois/VersusOverlay';
import { VictoryOverlay } from '../components/tournois/VictoryOverlay';
import { winnerTeam, teamForCaptain } from '../lib/tournamentTeam';
import TournamentLaunchCeremony from '../components/tournois/TournamentLaunchCeremony';
import { TournamentBets } from '../components/tournois/TournamentBets';
import { RankingScopeToggle } from './leaderboard/RankingScopeToggle';
import { useLeagueData } from '../hooks/useLeagueData';
import { useFlash } from '../hooks/useFlash';
import { useConfirm } from '../hooks/useConfirm';
import { useServerEvents } from '../hooks/useServerEvents';
import { useT } from '../lib/i18n';
import { computeStandings, type Standing } from '../lib/tournamentStandings';
import { TOURNAMENT_ELO_PLACEMENTS, tournamentPlacements, tournamentEloForPlacement } from '@42-league/shared';

// Accent par jeu pour la cérémonie / le bracket (mêmes teintes que le reste de l'app).
const GAME_ACCENT: Record<Game, string> = {
  babyfoot: '#ffc94a',
  smash: '#ff4d5c',
  chess: '#56c46e',
  streetfighter: '#ff7a18',
  flechettes: '#14b8a6',
  coding: '#58a6ff',
  pokemon: '#ff4d4d',
};
function gameAccent(game: Game | null | undefined): string {
  return (game && GAME_ACCENT[game]) || '#ffc94a';
}

const STATUS_KEY: Record<Tournament['status'], string> = {
  registration: 'tournois.status.registration',
  in_progress: 'tournois.status.in_progress',
  finished: 'tournois.status.finished',
  cancelled: 'tournois.status.cancelled',
};

const WINNING_SCORE = 10;
const LOSER_SCORE_MIN = -10;
const LOSER_SCORE_MAX = WINNING_SCORE - 1;

export function TournoiDetailPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = rawId ?? '';
  const { me, leaderboard, locations } = useLeagueData();
  const flash = useFlash();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const t = useT();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [invitee, setInvitee] = useState<LeaderboardEntry | null>(null);
  // 2v2 : coéquipier choisi quand JE rejoins, et paire choisie par l'organisateur
  // pour ajouter une équipe (capitaine + coéquipier).
  const [joinPartner, setJoinPartner] = useState<LeaderboardEntry | null>(null);
  const [addCaptain, setAddCaptain] = useState<LeaderboardEntry | null>(null);
  const [addPartner, setAddPartner] = useState<LeaderboardEntry | null>(null);
  const [coAdminPick, setCoAdminPick] = useState<LeaderboardEntry | null>(null);
  // Cérémonie de lancement : déclenchée une fois au passage registration→in_progress.
  // Ouvre directement l'onglet paris si l'URL le demande (?tab=bets), p.ex. depuis
  // le gros bouton « Parier » de la page d'accueil.
  const [detailTab, setDetailTab] = useState<'bracket' | 'bets'>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'bets' ? 'bets' : 'bracket',
  );
  const [showCeremony, setShowCeremony] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  // Onglet de la vue d'un tournoi en cours : bracket/poules ou paris.
  const prevStatusRef = useRef<Tournament['status'] | null>(null);
  // Écran VERSUS : on l'ouvre pour le match dont l'id vient d'être désigné
  // « match suivant » (activeMatchId). Détecté par diff dans load().
  const [versusMatchId, setVersusMatchId] = useState<string | null>(null);
  const prevActiveMatchRef = useRef<string | null | undefined>(undefined);

  // `silent` : refresh en arrière-plan (SSE / retour de focus) qui swap les données
  // SANS repasser par l'écran de chargement plein écran — sinon la page entière
  // « recharge » à la moindre mutation. Le skeleton n'apparaît qu'au 1er chargement
  // (ou quand on change de tournoi).
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const fresh = await api.tournament(id);
      // Détecte la transition registration → in_progress pendant qu'on est sur la page.
      if (prevStatusRef.current === 'registration' && fresh.status === 'in_progress') {
        setShowCeremony(true);
      }
      // Transition vers la fin : célébration du champion (une fois, en live).
      if (prevStatusRef.current === 'in_progress' && fresh.status === 'finished' && fresh.winner) {
        setShowVictory(true);
      }
      prevStatusRef.current = fresh.status;
      // Match suivant désigné : si activeMatchId vient de changer vers un match,
      // on déclenche l'écran VERSUS (une fois). undefined au 1er chargement → on
      // ne joue pas l'animation pour un match déjà désigné avant l'arrivée.
      const prevActive = prevActiveMatchRef.current;
      const nextActive = fresh.activeMatchId ?? null;
      if (prevActive !== undefined && nextActive && nextActive !== prevActive) {
        setVersusMatchId(nextActive);
      }
      prevActiveMatchRef.current = nextActive;
      setTournament(fresh);
    } catch {
      if (!silent) setTournament(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh déclenché par les ACTIONS (toss, choix d'avantage, saisie de score,
  // confirmation…) : silencieux lui aussi, sinon chaque clic recharge toute la
  // page et démonte l'animation (pile-ou-face) en cours.
  const refreshSilent = useCallback(() => load(true), [load]);

  // Rafraîchit la page en temps réel quand une mise à jour de tournoi ou une
  // invitation est reçue (accept, decline, nouveau joueur, démarrage…). Refresh
  // SILENCIEUX : on garde l'affichage courant et on swap les données en place.
  useServerEvents(refreshSilent, ['tournament:update', 'tournament:invite', 'tournament:invite_declined']);

  if (loading) {
    return (
      <Panel title={t('tournois.detail.tournament')} sub="…">
        <BackLink />
        <div className="text-center text-muted-2 py-10">{t('tournois.detail.loading')}</div>
      </Panel>
    );
  }
  if (!tournament) {
    return (
      <Panel title={t('tournois.detail.tournament')} sub={t('tournois.detail.notFoundSub')}>
        <BackLink />
        <div className="text-center text-muted-2 py-10">{t('tournois.detail.notFound')}</div>
      </Panel>
    );
  }

  const myLogin = me?.login;
  // Le créateur ET les co-organisateurs ont tous les droits d'organisation.
  const isCreator = tournament.createdByLogin === myLogin;
  const isOrganizer = isCreator || (tournament.coOrganizers ?? []).includes(myLogin ?? '');
  const isAdmin = !!me?.isAdmin;
  // « Officiant » : peut saisir un score / lancer la pièce SANS jouer le match.
  // Admin/superadmin partout ; le créateur seulement sur un tournoi amical.
  const canOfficiate = isAdmin || (isOrganizer && tournament.kind === 'friendly');
  const is2v2 = tournament.mode === '2v2';
  // 2v2 : je suis inscrit si je suis capitaine OU coéquipier d'une entrée.
  const iAmIn = !!tournament.entries?.some((e) => e.login === myLogin || e.partnerLogin === myLogin);
  // Mon inscription est-elle pointée présente (check-in avant lancement) ?
  const myCheckedIn = !!tournament.entries?.some(
    (e) => (e.login === myLogin || e.partnerLogin === myLogin) && e.checkedInAt,
  );
  const checkedInCount = (tournament.entries ?? []).filter((e) => e.checkedInAt).length;
  const entriesCount = tournament.entries?.length ?? 0;
  // Nombre de matchs ENCORE pariables (2 joueurs connus, pile-ou-face pas lancé, pas
  // de score saisi) → pilote le CTA « Parie » mis en avant sur l'onglet bracket.
  // Même filtre que TournamentBets.openMatches (source de vérité serveur au placement).
  const openBetMatchCount =
    tournament.status === 'in_progress'
      ? (tournament.matches ?? []).filter(
          (m) =>
            m.playerALogin &&
            m.playerBLogin &&
            !m.tossAt &&
            !m.betsLockedAt &&
            !m.recordedAt &&
            !m.confirmedAt,
        ).length
      : 0;
  // Ligue : la capacité est une cible indicative — on peut inscrire au-delà du nombre
  // déclaré et l'organisateur lance MANUELLEMENT dès 2 inscrits (pas d'auto-démarrage).
  const isLeagueReg = tournament.format === 'league';
  // Place encore disponible (toujours vrai en ligue : capacité non plafonnante).
  const hasFreeSlot = isLeagueReg || entriesCount < tournament.capacity;
  // Conditions pour afficher le bouton « Lancer » à l'organisateur.
  const canStartNow = isLeagueReg ? entriesCount >= 2 : entriesCount === tournament.capacity;
  // Re-tirage possible tant que le 1er match n'a pas démarré : tournoi en cours,
  // aucun match désigné/joué (les byes auto-confirmés ne comptent pas).
  const anyMatchStarted = (tournament.matches ?? []).some(
    (m) => m.playerALogin && m.playerBLogin && (m.confirmedAt || m.recordedAt || m.tossAt),
  );
  const canReshuffle =
    tournament.status === 'in_progress' &&
    (isOrganizer || isAdmin) &&
    !tournament.activeMatchId &&
    !anyMatchStarted;
  // Logins déjà engagés (capitaines + coéquipiers) → exclus des sélecteurs 2v2.
  const engagedLogins = new Set(
    (tournament.entries ?? []).flatMap((e) => (e.partnerLogin ? [e.login, e.partnerLogin] : [e.login])),
  );

  // Combattants de l'écran VERSUS (résolus depuis le match désigné + les avatars
  // des inscrits). Null si le match désigné n'existe plus (déjà confirmé).
  const versusMatch =
    versusMatchId != null
      ? (tournament.matches ?? []).find((m) => m.id === versusMatchId) ?? null
      : null;
  const versusFighter = (login: string | null): VersusFighter | null => {
    if (!login) return null;
    const e = (tournament.entries ?? []).find((en) => en.login === login);
    return { login, imageUrl: e?.user?.imageUrl ?? null };
  };

  // Tirage au sort pour la cérémonie : duels du 1er tour du bracket (round min).
  // Vide si le bracket n'existe pas encore (format poules au lancement) → la
  // cérémonie retombe sur le simple défilé des inscrits.
  const bracketMatchesForDraw = (tournament.matches ?? []).filter(
    (m) => (m.stage ?? 'bracket') === 'bracket',
  );
  const drawPairings = bracketMatchesForDraw.length
    ? (() => {
        const minRound = bracketMatchesForDraw.reduce((mn, m) => Math.min(mn, m.round), Infinity);
        return bracketMatchesForDraw
          .filter((m) => m.round === minRound)
          .sort((a, b) => a.slot - b.slot)
          .map((m) => ({ a: versusFighter(m.playerALogin), b: versusFighter(m.playerBLogin) }));
      })()
    : undefined;
  const runAction = async (action: () => Promise<unknown>, successMsg: string) => {
    try {
      await action();
      flash.show(successMsg);
      await load(true); // refresh silencieux : pas de rechargement plein écran à chaque action
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const entryLogins = new Set((tournament.entries ?? []).map((e) => e.login));
  // Joueurs déjà invités (invitation en attente) → on les exclut de la liste invitable.
  const pendingInviteeLogins = new Set(
    (tournament.invites ?? []).filter((i) => i.status === 'pending').map((i) => i.inviteeLogin),
  );
  const invitable = leaderboard
    .filter((u) => !entryLogins.has(u.login) && !pendingInviteeLogins.has(u.login))
    .sort((a, b) => a.login.localeCompare(b.login));
  const invitableCounts = Object.fromEntries(invitable.map((u) => [u.login, u.matchesPlayed]));

  // Mon invitation en attente (si j'ai été invité mais pas encore décidé).
  const myPendingInvite = (tournament.invites ?? []).find(
    (i) => i.inviteeLogin === myLogin && i.status === 'pending',
  );

  const handleSendInvite = async () => {
    if (!invitee) return;
    const login = invitee.login;
    setInvitee(null);
    await runAction(
      () => api.inviteTournamentPlayer(tournament.id, login),
      t('tournois.flash.inviteSent').replace('{login}', login),
    );
  };

  // 2v2 : je rejoins avec mon coéquipier.
  const handleJoin2v2 = async () => {
    if (!joinPartner) return;
    const p = joinPartner.login;
    setJoinPartner(null);
    await runAction(() => api.joinTournament(tournament.id, p), t('tournois.flash.registered'));
  };

  // 2v2 : l'organisateur ajoute directement une équipe (capitaine + coéquipier).
  const handleAddTeam = async () => {
    if (!addCaptain || !addPartner) return;
    const cap = addCaptain.login;
    const par = addPartner.login;
    setAddCaptain(null);
    setAddPartner(null);
    await runAction(
      () => api.addTournamentPlayer(tournament.id, cap, par),
      t('tournois.flash.registered'),
    );
  };

  const handleAcceptInvite = async (invite: TournamentInvite) => {
    await runAction(
      () => api.acceptTournamentInvite(tournament.id, invite.id),
      t('tournois.flash.joined'),
    );
  };

  const handleDeclineInvite = async (invite: TournamentInvite) => {
    await runAction(
      () => api.declineTournamentInvite(tournament.id, invite.id),
      t('tournois.flash.inviteDeclined'),
    );
  };

  const kindLabel = tournament.kind === 'official' ? t('tournois.detail.kind.official') : t('tournois.detail.kind.friendly');
  const visLabel = tournament.isPrivate ? t('tournois.detail.private') : '';
  const formatLabel =
    tournament.format === 'pools' ? t('tournois.detail.pools')
    : tournament.format === 'league' ? t('tournois.detail.league')
    : '';
  const modeLabel = is2v2 ? ` · ${t('tournois.detail.mode2v2')}` : '';
  // Ligue : capacité indicative → on affiche le nombre d'inscrits, pas « X/capacité ».
  const countLabel = isLeagueReg ? `${entriesCount} inscrit${entriesCount > 1 ? 's' : ''}` : `${entriesCount}/${tournament.capacity}`;
  const sub = `${kindLabel}${visLabel}${formatLabel}${modeLabel} · ${countLabel} · ${t(STATUS_KEY[tournament.status])}`;

  const handleLeave = async () => {
    const ok = await confirm({
      title: t('tournois.confirm.leave.title'),
      message: t('tournois.confirm.leave.message'),
      confirmLabel: t('tournois.confirm.leave.confirm'),
      cancelLabel: t('tournois.confirm.leave.cancel'),
      danger: true,
    });
    if (!ok) return;
    await runAction(() => api.leaveTournament(tournament.id), t('tournois.flash.leftReg'));
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: t('tournois.confirm.cancel.title'),
      message: t('tournois.confirm.cancel.message'),
      warning: t('tournois.confirm.cancel.warning'),
      confirmLabel: t('tournois.confirm.cancel.confirm'),
      cancelLabel: t('tournois.confirm.cancel.cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.cancelTournament(tournament.id);
      flash.show(t('tournois.flash.deleted'));
      navigate('/tournaments');
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  // Re-tirage du bracket (créateur/admin, avant le 1er match) : relance le tirage
  // puis rejoue la cérémonie avec les nouveaux affrontements.
  const handleReshuffle = async () => {
    const ok = await confirm({
      title: t('tournois.confirm.reshuffle.title'),
      message: t('tournois.confirm.reshuffle.message'),
      confirmLabel: t('tournois.confirm.reshuffle.confirm'),
      cancelLabel: t('tournois.confirm.reshuffle.cancel'),
    });
    if (!ok) return;
    await runAction(() => api.reshuffleTournament(tournament.id), t('tournois.flash.reshuffled'));
    setShowCeremony(true);
  };

  // Organisateur/admin : retire un inscrit (en 2v2 = tout le duo) en cas d'erreur,
  // pendant l'inscription. `login` = capitaine de l'inscription.
  const handleRemovePlayer = async (login: string, partnerLogin?: string | null) => {
    const who = partnerLogin ? `@${login} & @${partnerLogin}` : `@${login}`;
    const ok = await confirm({
      title: 'Retirer cet inscrit ?',
      message: `${who} sera retiré de ce tournoi.`,
      confirmLabel: 'Retirer',
      cancelLabel: 'Annuler',
      danger: true,
    });
    if (!ok) return;
    await runAction(() => api.removeTournamentPlayer(tournament.id, login), 'Inscrit retiré');
  };

  // Officiant : revient en phase d'inscription depuis une ligue en cours (avant tout
  // match joué). Efface les affiches et rembourse les paris ouverts.
  const handleReopenRegistration = async () => {
    const ok = await confirm({
      title: 'Revenir en phase d’inscription ?',
      message:
        'Les affiches de la ligue seront effacées et les paris ouverts remboursés. Tu pourras modifier les inscrits puis relancer. Possible uniquement si aucun match n’a démarré.',
      confirmLabel: 'Revenir à l’inscription',
      cancelLabel: 'Annuler',
      danger: true,
    });
    if (!ok) return;
    await runAction(() => api.reopenLeagueRegistration(tournament.id), 'Retour en phase d’inscription');
  };

  // 2v2 : (re)nommer une équipe (membre de l'équipe ou organisateur). Action rare
  // → simple invite de saisie.
  const handleSetTeamName = async (login: string, current?: string | null) => {
    const name = window.prompt('Nom de l’équipe (laisse vide pour effacer) :', current ?? '');
    if (name === null) return;
    await runAction(
      () => api.setTournamentTeamName(tournament.id, login, name.trim()),
      'Nom d’équipe mis à jour',
    );
  };

  // Créateur : ajoute / retire un co-organisateur (tous les droits sur le tournoi).
  const handleManageOrganizer = async (login: string, action: 'add' | 'remove') => {
    await runAction(
      () => api.manageTournamentOrganizer(tournament.id, login, action),
      action === 'add' ? `@${login} est co-organisateur` : `@${login} retiré`,
    );
  };

  // ── Salle de contrôle : méta de pilotage partagées avec l'écran TV live ──
  const liveHref = `/live-tournament/${tournament.id}`;
  const hasBracketMatches = (tournament.matches ?? []).some((m) => (m.stage ?? 'bracket') === 'bracket');
  const phaseLabel =
    tournament.status === 'registration'
      ? t('tournois.status.registration')
      : tournament.status === 'finished'
        ? t('tournois.status.finished')
        : tournament.status === 'cancelled'
          ? t('tournois.status.cancelled')
          : tournament.format === 'league'
            ? hasBracketMatches ? 'Phase finale' : 'Phase de ligue'
            : tournament.format === 'pools'
              ? hasBracketMatches ? 'Phase finale' : 'Poules'
              : 'Élimination directe';
  const cockpitMode = is2v2 ? '2v2' : '1v1';

  return (
    <Panel title={tournament.name} sub={sub}>
      <BackLink />

      {/* Barre de commande — console de pilotage : statut/phase, méta, et accès direct
          à l'écran TV live. La page de contrôle et l'écran live partagent les données
          (SSE) → toute action ici se reflète instantanément sur la TV. */}
      <div className="mb-5 rounded-xl border border-gold/25 bg-gradient-to-r from-bg-2/60 to-bg-1/40 p-3 flex flex-wrap items-center gap-3">
        <span
          className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${
            tournament.status === 'in_progress'
              ? 'bg-red/15 text-red border border-red/40'
              : tournament.status === 'finished'
                ? 'bg-gold/15 text-gold border border-gold/40'
                : 'bg-bg-1 text-muted-2 border border-border'
          }`}
        >
          {tournament.status === 'in_progress' && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red animate-pulse mr-1.5 align-middle" />
          )}
          {phaseLabel}
        </span>
        <div className="flex items-center gap-3 text-[11px] text-muted-2 font-mono uppercase tracking-wide">
          <span>{cockpitMode}</span>
          <span className="text-border">·</span>
          <span>{countLabel}</span>
          {tournament.kind === 'official' && (
            <>
              <span className="text-border">·</span>
              <span className="text-gold">Officiel</span>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Accès TV : nouvel onglet pour garder la console ouverte pendant le live. */}
          <Link
            to={liveHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-b from-gold to-gold-dim text-[#1a0d00] font-extrabold text-sm uppercase tracking-wider shadow-gold-glow hover:brightness-110 transition tap-transparent"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1a0d00]/50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1a0d00]" />
            </span>
            Écran TV Live
          </Link>
        </div>
      </div>

      {/* Cérémonie médiévale au lancement (registration → in_progress). */}
      {showCeremony && (
        <TournamentLaunchCeremony
          tournamentName={tournament.name}
          participants={(tournament.entries ?? []).map((e) => ({
            login: e.login,
            imageUrl: e.user?.imageUrl ?? null,
          }))}
          pairings={drawPairings}
          accent={gameAccent(tournament.game)}
          onDone={() => setShowCeremony(false)}
          t={t}
        />
      )}

      {/* Écran VERSUS au lancement d'un duel (« match suivant »). */}
      <VersusOverlay
        open={!!versusMatch}
        a={versusMatch ? versusFighter(versusMatch.playerALogin) : null}
        b={versusMatch ? versusFighter(versusMatch.playerBLogin) : null}
        accent={gameAccent(tournament.game)}
        onDone={() => setVersusMatchId(null)}
        t={t}
      />

      {/* Célébration du champion à la fin du tournoi (in_progress → finished). */}
      <VictoryOverlay
        open={showVictory}
        champion={tournament.winner ?? null}
        tournamentName={tournament.name}
        accent={gameAccent(tournament.game)}
        onDone={() => setShowVictory(false)}
        t={t}
      />

      {/* Récompense (tournois officiels) — visible à tous, indique l'enjeu. */}
      {tournament.kind === 'official' && !!tournament.prizeKind && tournament.prizeKind !== 'none' && (
        <div className="mb-4 flex items-center gap-3 p-3 rounded-xl border border-gold/30 bg-gold/[0.06]">
          <span className="text-2xl leading-none">🎁</span>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-gold font-extrabold">
              {t(tournament.status === 'finished' ? 'tournois.detail.prize.won' : 'tournois.detail.prize.label')}
            </div>
            <div className="text-sm font-bold text-text-strong flex items-center gap-1.5 flex-wrap">
              {tournament.prizeKind === 'coins' ? (
                <>
                  <img src="/42coin.webp" alt="" className="w-4 h-4" />
                  {t('tournois.detail.prize.coins').replace('{n}', String(tournament.prizeCoins ?? 0))}
                </>
              ) : tournament.prizeItem ? (
                <>
                  {tournament.prizeItem.name}
                  <span className="text-[10px] uppercase tracking-wider text-muted-2 font-bold">
                    ({tournament.prizeItem.category})
                  </span>
                </>
              ) : (
                t('tournois.field.prize')
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cash-prize par palier (officiels) — coins versés au prorata du tour atteint. */}
      {tournament.kind === 'official' && !!tournament.cashPrizeBase && tournament.cashPrizeBase > 0 && (
        <div className="mb-4 flex items-center gap-3 p-3 rounded-xl border border-teal/30 bg-teal/[0.06]">
          <span className="text-2xl leading-none">💰</span>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-teal font-extrabold">
              {t('tournois.detail.cashPrize')}
            </div>
            <div className="text-sm font-bold text-text-strong flex items-center gap-1.5 flex-wrap">
              <img src="/42coin.webp" alt="" className="w-4 h-4" />
              {tournament.cashPrizeBase.toLocaleString()}
              <span className="text-[11px] text-muted-2 font-medium">{t('tournois.detail.cashPrize.note')}</span>
            </div>
          </div>
        </div>
      )}

      {tournament.status === 'registration' && (
        <>
          {tournament.isPrivate && !iAmIn && !isOrganizer && !isAdmin && (
            <div className="mb-4 text-[11px] text-teal flex items-center gap-1.5 uppercase tracking-wider font-semibold">
              {t('tournois.detail.privateNotice')}
            </div>
          )}
          <div className="flex flex-wrap gap-2 mb-4">
            {!is2v2 && !iAmIn && hasFreeSlot &&
              (!tournament.isPrivate || isOrganizer || isAdmin) && (
              <Button onClick={() => runAction(() => api.joinTournament(tournament.id), t('tournois.flash.registered'))}>
                {t('tournois.detail.join')}
              </Button>
            )}
            {iAmIn && (
              <>
                {/* Check-in : « je suis là » — l'organisateur voit qui est présent avant de lancer */}
                <Button
                  variant={myCheckedIn ? 'ghost' : 'primary'}
                  onClick={() =>
                    runAction(
                      () => api.tournamentCheckin(tournament.id, !myCheckedIn),
                      myCheckedIn ? t('tournois.detail.checkin.off') : t('tournois.detail.checkin.on'),
                    )
                  }
                >
                  {myCheckedIn ? `✓ ${t('tournois.detail.checkin.here')}` : t('tournois.detail.checkin.cta')}
                </Button>
                <Button variant="ghost" onClick={handleLeave}>{t('tournois.detail.leave')}</Button>
              </>
            )}
            {(isOrganizer || isAdmin) && canStartNow && (
              <Button onClick={() => runAction(() => api.startTournament(tournament.id), t('tournois.flash.started'))}>
                {t('tournois.detail.start')}
              </Button>
            )}
            {(isOrganizer || isAdmin) && (
              <Button variant="danger" onClick={handleCancel}>{t('tournois.detail.delete')}</Button>
            )}
          </div>

          {/* 2v2 : je rejoins avec mon coéquipier (sélecteur + bouton). */}
          {is2v2 && !iAmIn && hasFreeSlot &&
            (!tournament.isPrivate || isOrganizer || isAdmin) && (
            <div className="mb-4 p-3 rounded-xl border border-teal/25 bg-teal/[0.05]">
              <div className="text-[10px] uppercase tracking-wider text-teal font-extrabold mb-2">
                {t('tournois.detail.partnerPrompt')}
              </div>
              <div className="flex flex-col gap-2">
                <PlayerSearch
                  players={leaderboard.filter((p) => p.login !== myLogin && !engagedLogins.has(p.login))}
                  recentPlayers={[]}
                  opponentCounts={{}}
                  selected={joinPartner}
                  onSelect={setJoinPartner}
                  onClear={() => setJoinPartner(null)}
                  locations={locations}
                />
                <Button onClick={handleJoin2v2} disabled={!joinPartner}>
                  {t('tournois.detail.join')}
                </Button>
              </div>
            </div>
          )}

          {/* Bannière : invitation reçue en attente de décision */}
          {myPendingInvite && !iAmIn && (
            <div className="mb-4 p-4 rounded-xl border border-gold/40 bg-gold/[0.06]">
              <div className="text-sm font-extrabold text-gold mb-1">
                {t('tournois.detail.invited.title')}
              </div>
              <div className="text-xs text-muted-2 mb-3">
                {t('tournois.detail.invited.by')} <span className="font-semibold text-text-strong">{myPendingInvite.inviterLogin}</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleAcceptInvite(myPendingInvite)} className="flex-1">
                  {t('tournois.detail.invited.join')}
                </Button>
                <Button variant="ghost" onClick={() => handleDeclineInvite(myPendingInvite)} className="flex-1 text-red border-red/30">
                  {t('tournois.detail.invited.decline')}
                </Button>
              </div>
            </div>
          )}

          {/* 2v2 : l'organisateur ajoute directement une équipe (pas d'invitations). */}
          {is2v2 && (isOrganizer || isAdmin) && hasFreeSlot && (
            <div className="mb-4 p-3 rounded-xl border border-teal/20 bg-bg-2/30">
              <div className="text-[10px] uppercase tracking-wider text-teal font-extrabold mb-2">
                {t('tournois.detail.addTeam')}
              </div>
              <div className="flex flex-col gap-2">
                <PlayerSearch
                  players={leaderboard.filter((p) => !engagedLogins.has(p.login) && p.login !== addPartner?.login)}
                  recentPlayers={[]}
                  opponentCounts={{}}
                  selected={addCaptain}
                  onSelect={setAddCaptain}
                  onClear={() => setAddCaptain(null)}
                  locations={locations}
                />
                <PlayerSearch
                  players={leaderboard.filter((p) => !engagedLogins.has(p.login) && p.login !== addCaptain?.login)}
                  recentPlayers={[]}
                  opponentCounts={{}}
                  selected={addPartner}
                  onSelect={setAddPartner}
                  onClear={() => setAddPartner(null)}
                  locations={locations}
                />
                <Button onClick={handleAddTeam} disabled={!addCaptain || !addPartner}>
                  {t('tournois.detail.addTeam.cta')}
                </Button>
              </div>
            </div>
          )}

          {/* Section invitation (organisateur / admin) — 1v1 uniquement */}
          {!is2v2 && (isOrganizer || isAdmin) && hasFreeSlot && (
            <div className="mb-4 p-3 rounded-xl border border-gold/20 bg-bg-2/30">
              <div className="text-[10px] uppercase tracking-wider text-gold font-extrabold mb-2">
                {t('tournois.detail.invite.title')}
              </div>
              {invitable.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <PlayerSearch
                    players={invitable}
                    recentPlayers={[]}
                    opponentCounts={invitableCounts}
                    selected={invitee}
                    onSelect={setInvitee}
                    onClear={() => setInvitee(null)}
                    locations={locations}
                  />
                  <Button onClick={handleSendInvite} disabled={!invitee}>
                    {invitee ? t('tournois.detail.invite.send').replace('{login}', invitee.login) : t('tournois.detail.invite.sendGeneric')}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-2">{t('tournois.detail.invite.allInvited')}</p>
              )}
              <p className="text-[10px] text-muted mt-1.5">
                {t('tournois.detail.invite.notice')}
              </p>

              {/* Invitations en attente (vue organisateur) */}
              {(tournament.invites ?? []).filter((i) => i.status === 'pending').length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="text-[10px] uppercase tracking-wider text-muted font-bold mb-2">
                    {t('tournois.detail.invite.pending')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(tournament.invites ?? [])
                      .filter((i) => i.status === 'pending')
                      .map((inv) => (
                        <span
                          key={inv.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-1 border border-border text-[11px] text-muted-2"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-gold/70 animate-pulse" />
                          {inv.inviteeLogin}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Co-organisateurs : le créateur (ou un admin) délègue tous les droits
              d'organisation à d'autres joueurs. */}
          {(isCreator || isAdmin) && (
            <div className="mb-4 p-3 rounded-xl border border-gold/20 bg-bg-2/30">
              <div className="text-[10px] uppercase tracking-wider text-gold font-extrabold mb-2">
                Co-organisateurs · tous les droits
              </div>
              {(tournament.coOrganizers ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(tournament.coOrganizers ?? []).map((login) => (
                    <span
                      key={login}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-bg-1 border border-border text-[11px] text-text-strong"
                    >
                      @{login}
                      <button
                        type="button"
                        onClick={() => handleManageOrganizer(login, 'remove')}
                        className="text-red hover:text-red/80 font-bold"
                        aria-label="Retirer ce co-organisateur"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <PlayerSearch
                  players={leaderboard.filter(
                    (p) =>
                      p.login !== tournament.createdByLogin &&
                      !(tournament.coOrganizers ?? []).includes(p.login),
                  )}
                  recentPlayers={[]}
                  opponentCounts={{}}
                  selected={coAdminPick}
                  onSelect={setCoAdminPick}
                  onClear={() => setCoAdminPick(null)}
                  locations={locations}
                />
                <Button
                  disabled={!coAdminPick}
                  onClick={() => {
                    if (!coAdminPick) return;
                    void handleManageOrganizer(coAdminPick.login, 'add');
                    setCoAdminPick(null);
                  }}
                >
                  {coAdminPick
                    ? `Ajouter @${coAdminPick.login} comme co-organisateur`
                    : 'Ajouter un co-organisateur'}
                </Button>
              </div>
            </div>
          )}

          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-2">
            {t('tournois.detail.entrants')}
            {tournament.status === 'registration' && checkedInCount > 0 && (
              <span className="ml-2 text-[#4ade80] font-extrabold tabular-nums normal-case tracking-normal">
                {checkedInCount}/{entriesCount} {t('tournois.detail.checkin.present')}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(tournament.entries ?? []).map((e) => (
              <div
                key={e.login}
                className="flex items-center gap-2.5 p-2.5 border rounded"
                style={{
                  borderColor: tournament.status === 'registration' && e.checkedInAt ? 'rgba(74,222,128,0.45)' : undefined,
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                {tournament.status === 'registration' && e.checkedInAt && (
                  <span
                    className="shrink-0 w-2 h-2 rounded-full bg-[#4ade80] shadow-[0_0_6px_rgba(74,222,128,0.8)]"
                    title={t('tournois.detail.checkin.present')}
                  />
                )}
                {is2v2 ? (
                  // Équipe : nom d'équipe optionnel au-dessus du duo capitaine + coéquipier.
                  <div className="flex-1 min-w-0">
                    {e.teamName && (
                      <div className="text-[12px] font-extrabold text-gold truncate mb-0.5">{e.teamName}</div>
                    )}
                    <div className="min-w-0 flex items-center gap-1.5">
                      <PlayerLink login={e.login} className="min-w-0 flex items-center gap-1.5">
                        <Avatar login={e.login} imageUrl={e.user?.imageUrl ?? null} size="sm" />
                        <span className="font-bold truncate text-text-strong text-sm">{e.login}</span>
                      </PlayerLink>
                      <span className="text-muted-2 text-xs font-bold px-0.5">&amp;</span>
                      {e.partnerLogin ? (
                        <PlayerLink login={e.partnerLogin} className="min-w-0 flex items-center gap-1.5">
                          <Avatar login={e.partnerLogin} imageUrl={e.partner?.imageUrl ?? null} size="sm" />
                          <span className="font-bold truncate text-text-strong text-sm">{e.partnerLogin}</span>
                        </PlayerLink>
                      ) : (
                        <span className="text-muted text-sm">?</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <PlayerLink login={e.login} className="flex-1 min-w-0">
                    <Avatar login={e.login} imageUrl={e.user?.imageUrl ?? null} size="md" />
                    <div className="min-w-0">
                      <div className="font-bold truncate text-text-strong">{e.login}</div>
                      <div className="text-[11px] text-muted-2">
                        <span className="text-teal font-bold">{e.user?.elo ?? '—'}</span> ELO
                      </div>
                    </div>
                  </PlayerLink>
                )}
                {is2v2 &&
                  (isOrganizer || isAdmin || e.login === myLogin || e.partnerLogin === myLogin) && (
                    <button
                      type="button"
                      onClick={() => handleSetTeamName(e.login, e.teamName)}
                      title="Nommer l'équipe"
                      aria-label="Nommer l'équipe"
                      className="shrink-0 w-7 h-7 rounded-lg border border-gold/30 bg-gold/10 text-gold text-sm font-bold tap-transparent hover:bg-gold/20"
                    >
                      ✎
                    </button>
                  )}
                {(isOrganizer || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => handleRemovePlayer(e.login, e.partnerLogin)}
                    title="Retirer cet inscrit"
                    aria-label="Retirer cet inscrit"
                    className="shrink-0 w-7 h-7 rounded-lg border border-red/30 bg-red/10 text-red text-sm font-bold tap-transparent hover:bg-red/20"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {/* Ligue : pas de slots fantômes (la capacité n'est qu'indicative). Autres
                formats : on matérialise les places restantes jusqu'à la capacité. */}
            {!isLeagueReg &&
              Array.from({ length: Math.max(0, tournament.capacity - entriesCount) }).map((_, i) => (
                <div
                  key={`slot-${i}`}
                  className="flex items-center gap-2.5 p-2.5 border border-dashed border-muted/40 bg-bg-2/20 rounded opacity-50"
                >
                  <div className="w-11 h-11 rounded-full border border-dashed border-muted flex items-center justify-center text-muted text-lg font-bold">
                    ?
                  </div>
                  <div className="text-muted text-sm font-semibold">{t('tournois.detail.freeSlot')}</div>
                </div>
              ))}
          </div>

          {/* Ligue : rappel que l'on inscrit librement puis on lance à la main. */}
          {isLeagueReg && (isOrganizer || isAdmin) && (
            <p className="mt-3 text-[11px] text-muted-2 text-center">
              {entriesCount < 2
                ? 'Ligue — inscris au moins 2 joueurs, tu pourras lancer le tournoi quand tu veux.'
                : `Ligue — ${entriesCount} inscrit${entriesCount > 1 ? 's' : ''}. Ajoute autant de joueurs que tu veux, puis lance le tournoi.`}
            </p>
          )}

          {/* Paris ouverts PENDANT l'inscription : on parie sur le vainqueur avant
              le lancement, directement depuis la page du tournoi. Le marché se
              ferme dès que l'admin lance le tournoi. */}
          {entriesCount > 0 && (
            <div className="mt-5 pt-5 border-t border-border/50">
              <TournamentBets tournament={tournament} myLogin={myLogin ?? null} />
            </div>
          )}
        </>
      )}

      {tournament.status !== 'registration' && (
        // Cockpit : surface de pilotage (bracket / ligue) à gauche, console
        // d'actions à droite (état, zone admin). Empilé sur mobile (la console
        // passe au-dessus pour garder les commandes à portée).
        <div className="grid xl:grid-cols-[1fr_300px] gap-5 items-start">
          <div className="min-w-0 order-2 xl:order-1">
            {tournament.status === 'in_progress' && detailTab === 'bets' ? (
              <TournamentBets tournament={tournament} myLogin={myLogin ?? null} />
            ) : (
              <>
                {/* CTA paris mis en avant sur le bracket : rend évident qu'on peut
                    parier sur chaque match à venir sans chercher l'onglet. */}
                {tournament.status === 'in_progress' && openBetMatchCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setDetailTab('bets')}
                    className="mb-4 w-full flex items-center gap-3 rounded-xl border border-gold/40 bg-gold/[0.08] px-4 py-3 text-left hover:bg-gold/15 transition-all"
                  >
                    <Coins className="w-6 h-6 text-gold shrink-0" strokeWidth={2.2} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-extrabold text-gold">
                        {t('bets.bracketCta')}
                      </span>
                      <span className="block text-[11px] text-muted-2">
                        {t('bets.bracketCtaHint').replace('{n}', String(openBetMatchCount))}
                      </span>
                    </span>
                    <ChevronRight className="w-5 h-5 text-gold shrink-0" strokeWidth={2.5} />
                  </button>
                )}
                <PoolsAndBracket
                  tournament={tournament}
                  myLogin={myLogin ?? null}
                  canManage={isOrganizer || isAdmin}
                  canOfficiate={canOfficiate}
                  onChange={refreshSilent}
                />
              </>
            )}
          </div>

          <aside className="order-1 xl:order-2 flex flex-col gap-3 xl:sticky xl:top-2">
            {tournament.winner && tournament.status === 'finished' && (() => {
              const wt = winnerTeam(tournament);
              if (!wt) return null;
              // Podium complet dérivé du bracket (3e = battu par le champion en demi).
              // Affiché aussi pour les tournois PASSÉS — même barème : +100/+75/+50/+25.
              const bracket = (tournament.matches ?? []).filter(
                (m) => (m.stage ?? 'bracket') === 'bracket',
              );
              const placements = tournamentPlacements(
                bracket.map((m) => ({
                  round: m.round,
                  playerALogin: m.playerALogin ?? null,
                  playerBLogin: m.playerBLogin ?? null,
                  winnerLogin: m.winnerLogin ?? null,
                })),
              );
              const PLACE_LABEL = ['🥇 1er', '🥈 2e', '🥉 3e', '4e'];
              const runners = placements
                .map((login, i) => ({ login, rank: i + 1 }))
                .filter((p): p is { login: string; rank: number } => !!p.login && p.rank > 1);
              return (
                <div className="border border-gold/40 bg-gold/5 rounded-xl p-5 text-center">
                  <div className="text-gold text-xs uppercase tracking-[0.18em] font-extrabold mb-3">
                    {t('tournois.detail.winner')}{wt.is2v2 ? ' · Duo' : ''}
                  </div>
                  <div className="inline-flex flex-col items-center gap-2 text-base">
                    <div className="flex -space-x-3">
                      {wt.members.map((m) => (
                        <PlayerLink key={m.login} login={m.login}>
                          <Avatar login={m.login} imageUrl={m.imageUrl} size="lg" />
                        </PlayerLink>
                      ))}
                    </div>
                    <span className="font-extrabold text-text-strong">{wt.label}</span>
                    <span className="text-[11px] font-bold text-gold">+{TOURNAMENT_ELO_PLACEMENTS[0]} Elo</span>
                  </div>
                  {runners.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-gold/15 space-y-1.5 text-left">
                      {runners.map(({ login, rank }) => {
                        const team = teamForCaptain(tournament, login);
                        const elo = tournamentEloForPlacement(rank);
                        return (
                          <div key={login} className="flex items-center gap-2 text-xs">
                            <span className="w-12 shrink-0 text-muted-2 font-bold">{PLACE_LABEL[rank - 1]}</span>
                            <span className="flex -space-x-1.5 shrink-0">
                              {team.members.map((m) => (
                                <Avatar key={m.login} login={m.login} imageUrl={m.imageUrl} size="xs" />
                              ))}
                            </span>
                            <span className="flex-1 min-w-0 truncate text-text-strong font-semibold">{team.label}</span>
                            {elo > 0 && <span className="shrink-0 text-teal font-bold">+{elo}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Onglets (tournoi en cours) : suivre le bracket/la ligue, ou parier
                sur l'issue des matchs à venir. Visible par tout le monde. */}
            {tournament.status === 'in_progress' && (
              <div className="rounded-xl border border-border/60 bg-bg-2/40 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-2">
                  {t('tournois.detail.tournament')}
                </div>
                <RankingScopeToggle<'bracket' | 'bets'>
                  value={detailTab}
                  onChange={setDetailTab}
                  choices={[
                    { value: 'bracket', label: t('tournois.tab.bracket') },
                    { value: 'bets', label: t('tournois.tab.bets') },
                  ]}
                />
              </div>
            )}

            {tournament.status === 'in_progress' && (isOrganizer || isAdmin) && (
              <div className="rounded-xl border border-red/20 bg-red/[0.04] p-3 flex flex-col gap-2">
                <div className="text-[10px] uppercase tracking-wider text-red/80 font-extrabold">
                  {t('tournois.detail.tournament')}
                </div>
                {canReshuffle && (
                  <Button size="sm" variant="ghost" onClick={handleReshuffle} className="w-full">
                    {t('tournois.detail.reshuffle')}
                  </Button>
                )}
                {isLeagueReg && (
                  <Button size="sm" variant="ghost" onClick={handleReopenRegistration} className="w-full">
                    Revenir à l’inscription
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={handleCancel} className="w-full">
                  {t('tournois.detail.deleteTournament')}
                </Button>
              </div>
            )}
          </aside>
        </div>
      )}
    </Panel>
  );
}

function BackLink() {
  const t = useT();
  return (
    <Link
      to="/tournaments"
      className="inline-block text-[11px] uppercase tracking-wider text-muted-2 hover:text-teal mb-3"
    >
      {t('tournois.detail.back')}
    </Link>
  );
}

// Équipe d'un championnat de ligue : un duo (2v2) résolu, ou un joueur seul. La clé
// d'identité dans les matchs est le `captain` (les TournamentMatch ne référencent
// que les capitaines ; le coéquipier vient de TournamentEntry.partnerLogin).
interface LeagueTeam {
  captain: string;
  members: string[];
}

const QUALIFY_PER_POOL = 2;

/** Plus grande puissance de 2 ≤ n (≥ 2). Taille de bracket par défaut à la qualification. */
function largestPow2AtMost(n: number): number {
  let p = 2;
  while (p * 2 <= n) p *= 2;
  return p;
}

function PoolsAndBracket({
  tournament,
  myLogin,
  canManage,
  canOfficiate,
  onChange,
}: {
  tournament: Tournament;
  myLogin: string | null;
  canManage: boolean;
  canOfficiate: boolean;
  onChange: () => Promise<void>;
}) {
  const t = useT();
  const flash = useFlash();
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [announcing, setAnnouncing] = useState(false);
  const {
    poolGroups,
    bracketMatchesFlat,
    totalBracketRounds,
    poolsComplete,
    leagueMatches,
    leagueTeams,
    leagueStandings,
    leagueComplete,
    leagueCount,
  } = useMemo(() => {
    const all = tournament.matches ?? [];
    const poolMatches = all.filter((m) => m.stage === 'pool');
    const lgMatches = all.filter((m) => m.stage === 'league');
    const bracketMatches = all.filter((m) => (m.stage ?? 'bracket') === 'bracket');

    // Poules regroupées par index.
    const byPool = new Map<number, TournamentMatch[]>();
    for (const m of poolMatches) {
      const p = m.poolIndex ?? 0;
      const arr = byPool.get(p) ?? [];
      arr.push(m);
      byPool.set(p, arr);
    }
    const groups = [...byPool.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, matches]) => ({
        index,
        matches: [...matches].sort((a, b) => a.slot - b.slot),
        standings: computeStandings(matches),
      }));
    const complete = poolMatches.length > 0 && poolMatches.every((m) => m.confirmedAt);

    // Ligue (championnat) : plus de notion de journée. Liste plate triée (aller
    // d'abord, retour ensuite, puis ordre de création), classement unique au goal
    // average, et liste d'ÉQUIPES (duos résolus en 2v2) pour la matrice qui-vs-qui.
    const lgSorted = [...lgMatches].sort(
      (a, b) => (a.poolIndex ?? 0) - (b.poolIndex ?? 0) || a.slot - b.slot,
    );
    const teams: LeagueTeam[] = (tournament.entries ?? []).map((e) => ({
      captain: e.login,
      members: e.partnerLogin ? [e.login, e.partnerLogin] : [e.login],
    }));
    const lgStandings = computeStandings(lgMatches, 'league');
    const lgComplete = lgMatches.length > 0 && lgMatches.every((m) => m.confirmedAt);

    // Bracket : nombre de rounds = round max réel (byes/poules font diverger la capacité).
    const total = bracketMatches.reduce((mx, m) => Math.max(mx, m.round), 0);

    return {
      poolGroups: groups,
      bracketMatchesFlat: bracketMatches,
      totalBracketRounds: total,
      poolsComplete: complete,
      leagueMatches: lgSorted,
      leagueTeams: teams,
      leagueStandings: lgStandings,
      leagueComplete: lgComplete,
      leagueCount: lgMatches.length,
    };
  }, [tournament.matches, tournament.entries]);

  const hasPools = poolGroups.length > 0;
  const hasBracket = totalBracketRounds > 0;
  // Phase de ligue : active tant que le bracket n'a pas été généré (bascule finale).
  const isLeague = tournament.format === 'league';
  const leagueEditable = isLeague && !hasBracket;
  // Match sélectionné dans l'arbre (détail + duel/saisie en dessous).
  const selectedMatch = useMemo(
    () => bracketMatchesFlat.find((m) => m.id === selectedMatchId) ?? null,
    [bracketMatchesFlat, selectedMatchId],
  );

  // « Match suivant » (organisateur/admin, hors échecs) : matchs jouables, triés
  // par tour puis position. La cible = le match sélectionné s'il est jouable,
  // sinon le prochain match prêt (en sautant celui déjà désigné « en cours »).
  // Disciplines à résultat binaire (échecs / coding / pokémon) : pas de cérémonie
  // d'annonce de match (ni toss/stage), comme les échecs.
  const tGame = tournament.game ?? 'babyfoot';
  const isChess = tGame === 'chess' || tGame === 'coding' || tGame === 'pokemon';
  const readyMatches = useMemo(
    () =>
      bracketMatchesFlat
        .filter((m) => m.playerALogin && m.playerBLogin && !m.confirmedAt)
        .sort((a, b) => a.round - b.round || a.slot - b.slot),
    [bracketMatchesFlat],
  );
  const announceTarget =
    selectedMatch && readyMatches.some((m) => m.id === selectedMatch.id)
      ? selectedMatch
      : readyMatches.find((m) => m.id !== tournament.activeMatchId) ?? readyMatches[0] ?? null;
  const handleAnnounce = async () => {
    if (!announceTarget) return;
    setAnnouncing(true);
    try {
      await api.announceTournamentMatch(tournament.id, announceTarget.id);
      setSelectedMatchId(announceTarget.id);
      await onChange();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setAnnouncing(false);
    }
  };
  const showAnnounce = canManage && !isChess && hasBracket && !!announceTarget;

  // Maps pp + binôme (depuis les inscrits) pour les bandeaux/affiches.
  const { entryAvatars, entryPartners } = useMemo(() => {
    const av: Record<string, string | null> = {};
    const pa: Record<string, string | null> = {};
    for (const e of tournament.entries ?? []) {
      av[e.login] = e.user?.imageUrl ?? null;
      pa[e.login] = e.partnerLogin ?? null;
      if (e.partnerLogin) av[e.partnerLogin] = e.partner?.imageUrl ?? null;
    }
    return { entryAvatars: av, entryPartners: pa };
  }, [tournament.entries]);
  // Affiche mise en avant : le match ANNONCÉ en cours (activeMatchId, non confirmé)
  // sinon le prochain match prêt. Visible de TOUS (parieurs compris).
  const activeMatch = bracketMatchesFlat.find(
    (m) => m.id === tournament.activeMatchId && !m.confirmedAt,
  );
  const bannerMatch = activeMatch ?? announceTarget;

  // Officiant : échange de deux joueurs du bracket par drag-and-drop. Le backend
  // valide (matchs non confirmés), reset l'état des matchs touchés et rembourse les
  // paris ouverts ; on recharge ensuite l'arbre.
  const handleSwapBracket = async (loginA: string, loginB: string) => {
    try {
      await api.swapBracketPlayers(tournament.id, loginA, loginB);
      flash.show(t('tournois.flash.swapped'));
      await onChange();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className="space-y-6">
      {isLeague && (
        <LeagueSection
          tournament={tournament}
          matches={leagueMatches}
          teams={leagueTeams}
          standings={leagueStandings}
          complete={leagueComplete}
          matchCount={leagueCount}
          editable={leagueEditable}
          canManage={canManage}
          canOfficiate={canOfficiate}
          myLogin={myLogin}
          onChange={onChange}
        />
      )}

      {hasPools && (
        <section>
          <div className="text-[10px] uppercase tracking-[0.16em] text-gold font-extrabold mb-3 flex items-center gap-2">
            <span className="inline-block w-1 h-2.5 bg-gradient-to-b from-gold to-gold-dim rounded-sm" />
            {t('tournois.bracket.poolPhase')}
            <span className="text-muted-2 normal-case font-mono">
              {t('tournois.bracket.poolQualify').replace('{n}', String(QUALIFY_PER_POOL))}
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {poolGroups.map((g) => (
              <PoolCard
                key={g.index}
                tournament={tournament}
                pool={g}
                myLogin={myLogin}
                canOfficiate={canOfficiate}
                onChange={onChange}
              />
            ))}
          </div>
          {!poolsComplete && (
            <p className="text-[11px] text-muted-2 mt-3">
              {t('tournois.bracket.poolPending')}
            </p>
          )}
        </section>
      )}

      {hasBracket ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            {hasPools ? (
              <div className="text-[10px] uppercase tracking-[0.16em] text-teal font-extrabold flex items-center gap-2">
                <span className="inline-block w-1 h-2.5 bg-gradient-to-b from-teal to-teal rounded-sm" />
                {t('tournois.bracket.finalPhase')}
              </div>
            ) : (
              <span />
            )}

            {/* « Match suivant » : l'organisateur lance le duel en cours
                (écran VERSUS partagé). Désigne le match sélectionné s'il est
                jouable, sinon le prochain match prêt. */}
            {showAnnounce && (
              <Button size="sm" loading={announcing} onClick={handleAnnounce}>
                {announceTarget && announceTarget.id === selectedMatchId
                  ? t('tournois.bracket.announceThis')
                  : t('tournois.bracket.nextMatch')}
              </Button>
            )}
          </div>

          {/* Bandeau « Prochain match / en cours » — visible de tous (parieurs + orga). */}
          {!isChess && bannerMatch && (
            <NextMatchBanner
              match={bannerMatch}
              partners={entryPartners}
              avatars={entryAvatars}
              live={!!activeMatch}
              label={activeMatch ? t('tournois.bracket.nowPlaying') : t('tournois.bracket.upNext')}
            />
          )}

          {/* Officiant : indice drag-and-drop pour échanger deux joueurs. */}
          {canOfficiate && (
            <p className="text-[11px] text-muted-2 mb-2 flex items-center gap-1.5">
              <span aria-hidden>↔</span>
              {t('tournois.bracket.swapHint')}
            </p>
          )}

          {/* Arbre visuel (vue d'ensemble cliquable). */}
          <BracketTree
            matches={bracketMatchesFlat}
            rounds={totalBracketRounds}
            entries={tournament.entries ?? []}
            activeMatchId={tournament.activeMatchId ?? null}
            onSelectMatch={(m) => setSelectedMatchId((cur) => (cur === m.id ? null : m.id))}
            selectedMatchId={selectedMatchId}
            canSwap={canOfficiate}
            onSwap={handleSwapBracket}
          />

          {/* Détail du match sélectionné : duel (toss → avantage) puis saisie du score. */}
          {selectedMatch && (
            <div className="mt-4 max-w-md mx-auto">
              {/* key={id} : remonte le composant à chaque match sélectionné pour
                  que l'état local (flipping du pile-ou-face) ne fuite pas d'un match à l'autre. */}
              <BracketMatch
                key={selectedMatch.id}
                tournament={tournament}
                match={selectedMatch}
                myLogin={myLogin}
                canOfficiate={canOfficiate}
                onChange={onChange}
              />
            </div>
          )}
        </section>
      ) : (
        !hasPools && !isLeague && (
          <div className="text-center text-muted-2 py-8 text-sm">{t('tournois.bracket.preparing')}</div>
        )
      )}
    </div>
  );
}

// ── Phase de ligue ─────────────────────────────────────────────────────────────
// Classement unique au goal average + historique par journée + outils admin
// (composer les affiches, supprimer une affiche non confirmée, basculer en phase
// finale). Une fois le bracket généré (bascule effectuée), `editable` passe à false
// et la section devient un historique en lecture seule.
// Libellé d'une équipe de ligue : « capitaine » (1v1) ou « capitaine + coéquipier » (2v2).
function leagueTeamLabel(team: LeagueTeam): string {
  return team.members.length > 1 ? `${team.captain} + ${team.members[1]}` : team.captain;
}

// Un côté d'affiche : pp (capitaine + binôme en 2v2) + libellé, lisible d'un coup.
function MatchSide({
  login,
  partners,
  avatars,
  right = false,
}: {
  login: string | null;
  partners: Record<string, string | null>;
  avatars: Record<string, string | null>;
  right?: boolean;
}) {
  if (!login) return <span className="text-muted-2">?</span>;
  const partner = partners[login] ?? null;
  return (
    <div className={`flex items-center gap-2 min-w-0 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <div className="flex -space-x-2 shrink-0">
        <Avatar login={login} imageUrl={avatars[login] ?? null} size="sm" />
        {partner && <Avatar login={partner} imageUrl={avatars[partner] ?? null} size="sm" />}
      </div>
      <span className="font-extrabold text-text-strong text-sm truncate">
        @{login}
        {partner && <span className="text-muted-2"> &amp; @{partner}</span>}
      </span>
    </div>
  );
}

// Bandeau « Prochain match » / « Match en cours » : met en avant l'affiche désignée,
// avec photos de profil, pour que parieurs ET organisateur la suivent sans effort.
function NextMatchBanner({
  match,
  partners,
  avatars,
  label,
  live,
}: {
  match: TournamentMatch;
  partners: Record<string, string | null>;
  avatars: Record<string, string | null>;
  label: string;
  live: boolean;
}) {
  return (
    <div className={`mb-3 rounded-2xl border px-4 py-3 ${live ? 'border-teal/45 bg-teal/[0.06]' : 'border-gold/40 bg-gold/[0.06]'}`}>
      <div className={`text-[10px] uppercase tracking-[0.16em] font-extrabold mb-2 flex items-center gap-2 ${live ? 'text-teal' : 'text-gold'}`}>
        <span className={`inline-block w-1 h-2.5 rounded-sm bg-gradient-to-b ${live ? 'from-teal to-teal' : 'from-gold to-gold-dim'}`} />
        {label}
      </div>
      <div className="flex items-center justify-between gap-3">
        <MatchSide login={match.playerALogin} partners={partners} avatars={avatars} />
        <span className={`shrink-0 text-[11px] font-black uppercase tracking-[0.18em] ${live ? 'text-teal/70' : 'text-gold/70'}`}>VS</span>
        <MatchSide login={match.playerBLogin} partners={partners} avatars={avatars} right />
      </div>
    </div>
  );
}

// Classe de couleur d'une cellule de matrice selon l'issue (vue de l'équipe-ligne).
function matrixTone(tone?: 'win' | 'loss' | 'draw' | 'pending'): string {
  return tone === 'win'
    ? 'text-[#7fd66e] font-bold'
    : tone === 'loss'
      ? 'text-red'
      : tone === 'draw'
        ? 'text-steel-light font-semibold'
        : 'text-muted-2';
}

// Matrice « qui-vs-qui » : grille équipes × équipes. Chaque cellule montre l'aller
// (haut) et, le cas échéant, le retour (bas), vus du côté de l'équipe-ligne. Les
// paires non encore programmées (aucun aller) sont teintées en ambre (#5/#6).
function LeagueMatrix({
  teams,
  matches,
  t,
}: {
  teams: LeagueTeam[];
  matches: TournamentMatch[];
  t: (k: string) => string;
}) {
  if (teams.length < 2) return null;
  // Libellé d'équipe abrégé : les deux membres (capitaine & binôme) tronqués,
  // joints par « & » — en 2v2 on voit les deux joueurs, pas juste le capitaine.
  const short = (tm: LeagueTeam) => tm.members.map((m) => m.slice(0, 5)).join(' & ');
  const fmt = (m: TournamentMatch | undefined, rowCap: string) => {
    if (!m) return null;
    if (m.scoreA == null || m.scoreB == null) return { text: '·', tone: 'pending' as const };
    const rowIsA = m.playerALogin === rowCap;
    const rs = rowIsA ? m.scoreA : m.scoreB;
    const cs = rowIsA ? m.scoreB : m.scoreA;
    // Nul (winnerLogin null) une fois confirmé ; sinon (saisi non confirmé) en attente.
    const tone =
      m.winnerLogin == null
        ? m.confirmedAt
          ? ('draw' as const)
          : ('pending' as const)
        : m.winnerLogin === rowCap
          ? ('win' as const)
          : ('loss' as const);
    return { text: `${rs}-${cs}`, tone };
  };
  return (
    <div className="mb-4">
      <div className="overflow-x-auto">
        <table className="text-[10px] border-collapse mx-auto">
          <thead>
            <tr>
              <th className="p-1" />
              {teams.map((tm) => (
                <th key={tm.captain} className="p-1 font-mono text-muted-2 font-semibold whitespace-nowrap">{short(tm)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((row) => (
              <tr key={row.captain}>
                <th className="p-1 font-mono text-muted-2 font-semibold text-right whitespace-nowrap">{short(row)}</th>
                {teams.map((col) => {
                  // Match impossible : une équipe ne peut pas s'affronter elle-même
                  // (diagonale) → croix rouge.
                  if (row.captain === col.captain) {
                    return (
                      <td
                        key={col.captain}
                        className="bg-bg-2/60 border border-border/30 w-10 h-9 text-center align-middle text-red/50 font-bold"
                      >
                        ✗
                      </td>
                    );
                  }
                  const ms = matches.filter(
                    (m) =>
                      (m.playerALogin === row.captain && m.playerBLogin === col.captain) ||
                      (m.playerALogin === col.captain && m.playerBLogin === row.captain),
                  );
                  const aller = ms.find((m) => (m.poolIndex ?? 0) === 0);
                  const retour = ms.find((m) => (m.poolIndex ?? 0) === 1);
                  const a = fmt(aller, row.captain);
                  const r = fmt(retour, row.captain);
                  // Match « fait » : toutes les manches programmées entre ces deux
                  // équipes ont un score → tick vert en coin de cellule.
                  const done = ms.length > 0 && ms.every((m) => m.scoreA != null && m.scoreB != null);
                  return (
                    <td
                      key={col.captain}
                      className={`relative w-10 h-9 text-center border border-border/30 ${aller ? '' : 'bg-amber-500/[0.07]'}`}
                    >
                      {done && (
                        <span className="absolute top-0 right-0.5 text-[#7fd66e] text-[8px] leading-none">✓</span>
                      )}
                      <div className="flex flex-col leading-tight">
                        <span className={matrixTone(a?.tone)}>{a?.text ?? '·'}</span>
                        {retour && <span className={matrixTone(r?.tone)}>{r?.text ?? '·'}</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-2 mt-1.5 text-center">{t('tournois.league.matrixHint')}</p>
    </div>
  );
}

function LeagueSection({
  tournament,
  matches,
  teams,
  standings,
  complete,
  matchCount,
  editable,
  canManage,
  canOfficiate,
  myLogin,
  onChange,
}: {
  tournament: Tournament;
  matches: TournamentMatch[];
  teams: LeagueTeam[];
  standings: Standing[];
  complete: boolean;
  matchCount: number;
  editable: boolean;
  canManage: boolean;
  canOfficiate: boolean;
  myLogin: string | null;
  onChange: () => Promise<void>;
}) {
  const t = useT();
  const flash = useFlash();
  const confirm = useConfirm();
  // Affiche : deux équipes (logins capitaines) + manche (aller/retour).
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [leg, setLeg] = useState<0 | 1>(0);
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Nombre d'équipes qualifiées en phase finale — nombre LIBRE (≥ 2), persisté sur le
  // tournoi et modifiable à tout moment. Défaut : valeur enregistrée, sinon plus grande
  // puissance de 2 ≤ nombre de classés.
  const [qualifyCount, setQualifyCount] = useState(
    () => tournament.leagueQualifyCount ?? largestPow2AtMost(standings.length || 2),
  );
  const [finalizing, setFinalizing] = useState(false);
  const [undoing, setUndoing] = useState(false);
  // Resynchronise si la valeur persistée change (autre admin, reload SSE).
  useEffect(() => {
    if (tournament.leagueQualifyCount != null) setQualifyCount(tournament.leagueQualifyCount);
  }, [tournament.leagueQualifyCount]);

  // Clé non-ordonnée d'une affiche (paire d'équipes, sens A/B indifférent).
  const pairKey = (m: TournamentMatch) =>
    [m.playerALogin ?? '', m.playerBLogin ?? ''].sort().join(' ');
  // Partition : affiches jouables (2 équipes), séparées « à jouer » / « jouées ».
  const playable = matches.filter((m) => m.playerALogin && m.playerBLogin);
  const pending = playable.filter((m) => !m.confirmedAt);
  const played = playable.filter((m) => m.confirmedAt);

  // ── Auto-organisation : prochain match par « qui n'a pas joué depuis le plus
  // longtemps » ──────────────────────────────────────────────────────────────
  // Équipes déclarées absentes (retrait neutre) : exclues de la proposition.
  const absentSet = useMemo(
    () => new Set((tournament.entries ?? []).filter((e) => e.absentAt).map((e) => e.login)),
    [tournament.entries],
  );
  const involvesAbsent = (m: TournamentMatch) =>
    absentSet.has(m.playerALogin ?? '') || absentSet.has(m.playerBLogin ?? '');
  // Dernière activité par équipe (ms du dernier match confirmé) — jamais joué → 0
  // (a « attendu » depuis le début, donc prioritaire).
  const lastActivity = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of played) {
      const ts = m.confirmedAt ? new Date(m.confirmedAt).getTime() : 0;
      for (const p of [m.playerALogin, m.playerBLogin]) {
        if (p) map[p] = Math.max(map[p] ?? 0, ts);
      }
    }
    return map;
  }, [played]);
  // Attente d'une affiche = ancienneté de l'équipe qui a le plus attendu (min des deux).
  const pairWait = (m: TournamentMatch) =>
    Math.min(lastActivity[m.playerALogin ?? ''] ?? 0, lastActivity[m.playerBLogin ?? ''] ?? 0);
  const byWait = (a: TournamentMatch, b: TournamentMatch) => pairWait(a) - pairWait(b) || a.slot - b.slot;
  // Affiches jouables hors équipes absentes, réparties active / reportée.
  const pendingLive = pending.filter((m) => !involvesAbsent(m));
  const pendingAbsent = pending.filter(involvesAbsent);
  const activeQueue = pendingLive.filter((m) => !m.postponedAt).sort(byWait);
  const postponedQueue = pendingLive.filter((m) => !!m.postponedAt).sort(byWait);
  // Prochain match : la 1re affiche active (attente la plus longue) ; à défaut une
  // affiche reportée resurgit (« skip puis revient »).
  const nextMatch = activeQueue[0] ?? postponedQueue[0] ?? null;
  // Maps pp + binôme depuis les inscrits, pour le bandeau « Prochain match ».
  const leagueAvatars: Record<string, string | null> = {};
  const leaguePartners: Record<string, string | null> = {};
  for (const e of tournament.entries ?? []) {
    leagueAvatars[e.login] = e.user?.imageUrl ?? null;
    leaguePartners[e.login] = e.partnerLogin ?? null;
    if (e.partnerLogin) leagueAvatars[e.partnerLogin] = e.partner?.imageUrl ?? null;
  }
  // Paires ayant déjà un retour composé (pour masquer le bouton « demander un retour »).
  const retourPairs = new Set(
    matches.filter((m) => (m.poolIndex ?? 0) === 1).map((m) => pairKey(m)),
  );

  // Le classement est calculé par capitaine ; on remonte au duo pour l'affichage
  // (en 2v2, une ligne = une équipe, pas un joueur seul).
  const is2v2 = tournament.mode === '2v2';
  const teamByCaptain = useMemo(
    () => new Map(teams.map((tm) => [tm.captain, tm])),
    [teams],
  );

  // Nombre de qualifiés visé (libre, borné 2..64). La surbrillance du classement se
  // limite au nombre d'équipes réellement classées (matchs confirmés).
  const rankedCount = standings.length;
  const effectiveQualify = Math.min(64, Math.max(2, qualifyCount || 2));
  const highlightQualify = Math.min(effectiveQualify, rankedCount);
  // Finalisation possible dès qu'au moins 2 équipes sont classées et qu'on ne demande
  // pas plus de qualifiés qu'il n'y a de classés.
  const canFinalize = rankedCount >= 2 && effectiveQualify <= rankedCount;

  // ── Gains projetés (temps réel) ──
  // Barème par PLACEMENT final (identique amical/officiel) : 1er +100, 2e +75,
  // 3e +50, 4e +25. Le rang du classement de ligue donne la PROJECTION — le
  // placement réel se joue en phase finale. Recalculé à chaque score.
  const eloMax = TOURNAMENT_ELO_PLACEMENTS[0];
  // Libellé du prix unique au champion (officiels) : coins ou cosmétique.
  const championPrize =
    tournament.kind === 'official' && tournament.prizeKind && tournament.prizeKind !== 'none'
      ? tournament.prizeKind === 'coins'
        ? t('tournois.league.gainCoins').replace('{n}', String(tournament.prizeCoins ?? 0))
        : (tournament.prizeItem?.name ?? t('tournois.field.prize'))
      : null;

  const handleAdd = async () => {
    if (!teamA || !teamB || teamA === teamB) {
      flash.show(t('tournois.league.pickTwo'), 'error');
      return;
    }
    setAdding(true);
    try {
      await api.addLeagueMatch(tournament.id, teamA, teamB, leg);
      setTeamA('');
      setTeamB('');
      flash.show(t('tournois.league.matchAdded'));
      await onChange();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (matchId: string) => {
    try {
      await api.deleteLeagueMatch(tournament.id, matchId);
      flash.show(t('tournois.league.matchDeleted'));
      await onChange();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  // « Remettre à plus tard » une affiche (ou la réactiver). Report révocable : elle
  // sort de la proposition « prochain match » mais reste jouable et resurgit ensuite.
  const handlePostpone = async (matchId: string, postponed: boolean) => {
    try {
      await api.postponeLeagueMatch(tournament.id, matchId, postponed);
      flash.show(postponed ? t('tournois.league.postponed') : t('tournois.league.reactivated'));
      await onChange();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  // « Déclarer une équipe absente » (retrait neutre) ou la réintégrer. Révocable :
  // ses affiches non jouées sont juste ignorées de la proposition, sans forfait.
  const handleAbsent = async (login: string, absent: boolean) => {
    try {
      await api.setLeagueEntryAbsent(tournament.id, login, absent);
      flash.show(absent ? t('tournois.league.declaredAbsent') : t('tournois.league.reinstated'));
      await onChange();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  // Persiste le nombre de qualifiés (au blur de l'input) — sans bloquer l'UI.
  const persistQualify = (n: number) => {
    const clamped = Math.min(64, Math.max(2, n || 2));
    setQualifyCount(clamped);
    if (clamped === tournament.leagueQualifyCount) return;
    void api.setLeagueQualifyCount(tournament.id, clamped).then(onChange).catch((err) => {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    });
  };

  const handleFinalize = async () => {
    // Avertit si on bascule alors que des affiches ne sont pas jouées (elles seront
    // ignorées du classement mais conservées en historique « non joué »).
    const warning = pending.length > 0 ? t('tournois.league.finalizeEarly') : t('tournois.league.finalize.warning');
    const ok = await confirm({
      title: t('tournois.league.finalize.title'),
      message: t('tournois.league.finalize.message').replace('{n}', String(effectiveQualify)),
      warning,
      confirmLabel: t('tournois.league.finalize.confirm'),
      cancelLabel: t('tournois.league.finalize.cancel'),
    });
    if (!ok) return;
    setFinalizing(true);
    try {
      await api.finalizeLeague(tournament.id, effectiveQualify);
      flash.show(t('tournois.league.finalized'));
      await onChange();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setFinalizing(false);
    }
  };

  // Demande un match retour sur une affiche déjà jouée (admin/organisateur) : crée la
  // manche retour → elle apparaît dans « à jouer » (pile-ou-face puis score).
  const handleRequestReturn = async (m: TournamentMatch) => {
    if (!m.playerALogin || !m.playerBLogin) return;
    try {
      await api.addLeagueMatch(tournament.id, m.playerALogin, m.playerBLogin, 1);
      flash.show(t('tournois.league.returnAdded'));
      await onChange();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  // (Re)génère les affiches aller manquantes du round-robin.
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await api.generateLeagueSchedule(tournament.id);
      flash.show(res.created > 0 ? t('tournois.league.generated') : t('tournois.league.allScheduled'));
      await onChange();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setGenerating(false);
    }
  };

  // Annule la bascule en phase finale et rouvre la ligue (correction d'erreur).
  const handleUndo = async () => {
    const ok = await confirm({
      title: t('tournois.league.undo.title'),
      message: t('tournois.league.undo.message'),
      warning: t('tournois.league.undo.warning'),
      confirmLabel: t('tournois.league.undo.confirm'),
      cancelLabel: t('tournois.league.undo.cancel'),
      danger: true,
    });
    if (!ok) return;
    setUndoing(true);
    try {
      await api.undoFinalizeLeague(tournament.id);
      flash.show(t('tournois.league.undone'));
      await onChange();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setUndoing(false);
    }
  };

  // Carte d'une affiche à jouer (pile-ou-face → score) avec les actions officiant :
  // supprimer, et « remettre à plus tard » / « réactiver » (report révocable).
  const fixtureCard = (m: TournamentMatch, postponed = false) => (
    <div key={m.id} className="relative">
      {(m.poolIndex ?? 0) === 1 && (
        <span className="absolute -top-1 left-2 z-10 px-1.5 py-0.5 rounded bg-bg-1 border border-border/60 text-[9px] font-bold uppercase tracking-wider text-muted-2">
          {t('tournois.league.legReturn')}
        </span>
      )}
      {canManage && (
        <button
          type="button"
          onClick={() => handleDelete(m.id)}
          title={t('tournois.league.deleteMatch')}
          className="absolute -top-1 -right-1 z-10 w-5 h-5 rounded-full bg-red/80 text-white text-xs font-bold flex items-center justify-center hover:bg-red"
        >
          ×
        </button>
      )}
      <BracketMatch
        tournament={tournament}
        match={m}
        myLogin={myLogin}
        canOfficiate={canOfficiate}
        onChange={onChange}
      />
      {canManage && (
        <button
          type="button"
          onClick={() => handlePostpone(m.id, !postponed)}
          className="mt-1.5 w-full text-[11px] font-semibold text-muted-2 hover:text-gold border border-border/60 hover:border-gold/40 rounded-lg py-1 transition-colors"
        >
          {postponed ? `↩ ${t('tournois.league.reactivate')}` : `⏱ ${t('tournois.league.later')}`}
        </button>
      )}
    </div>
  );

  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.16em] text-gold font-extrabold mb-3 flex items-center gap-2">
        <span className="inline-block w-1 h-2.5 bg-gradient-to-b from-gold to-gold-dim rounded-sm" />
        {t('tournois.league.phase')}
        <span className="text-muted-2 normal-case font-mono">{t('tournois.league.goalAverage')}</span>
      </div>

      {/* Classement unique au goal average. Surligne les N premiers (qualifiables). */}
      {standings.length > 0 ? (
        <div className="rounded-xl border border-border bg-bg-2/30 overflow-hidden mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-2 border-b border-border/40">
                <th className="text-left font-semibold py-1.5 pl-3">#</th>
                <th className="text-left font-semibold py-1.5">
                  {is2v2 ? t('tournois.league.col.team') : t('tournois.pool.col.player')}
                </th>
                <th className="text-center font-semibold py-1.5">{t('tournois.pool.col.played')}</th>
                <th className="text-center font-semibold py-1.5">{t('tournois.pool.col.wins')}</th>
                <th className="text-center font-semibold py-1.5">{t('tournois.pool.col.diff')}</th>
                <th className="text-right font-semibold py-1.5 pr-3">{t('tournois.league.col.gains')}</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => {
                const qualified = editable && i < highlightQualify;
                const team = teamByCaptain.get(s.login);
                const members = team?.members ?? [s.login];
                const isMine = team?.members.includes(myLogin ?? '') ?? false;
                return (
                  <tr
                    key={s.login}
                    className={`border-b border-border/20 last:border-0 ${
                      isMine ? 'bg-gold/10' : qualified ? 'bg-teal/5' : ''
                    }`}
                  >
                    <td className="py-1.5 pl-3">
                      <span className={`inline-flex w-4 justify-center font-bold ${qualified ? 'text-teal' : 'text-muted-2'}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-1.5">
                      <span className="flex items-center gap-1 text-sm min-w-0">
                        {members.map((m, mi) => (
                          <span key={m} className="flex items-center gap-1 min-w-0">
                            {mi > 0 && <span className="text-muted-2">+</span>}
                            <PlayerLink login={m} className="truncate">
                              <span className={qualified ? 'text-text-strong font-semibold' : ''}>{m}</span>
                            </PlayerLink>
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="py-1.5 text-center tabular-nums text-muted-2">{s.played}</td>
                    <td className="py-1.5 text-center tabular-nums font-bold">{s.wins}</td>
                    <td className="py-1.5 text-center tabular-nums">
                      <span className={s.diff > 0 ? 'text-[#7fd66e]' : s.diff < 0 ? 'text-red' : ''}>
                        {s.diff > 0 ? `+${s.diff}` : s.diff}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                      {!qualified ? (
                        <span className="text-muted-2 text-[11px]">{t('tournois.league.gainNone')}</span>
                      ) : i === 0 ? (
                        <span className="text-gold font-bold text-[11px]" title={championPrize ?? undefined}>
                          🏆 +{eloMax}
                          {championPrize ? ` · ${championPrize}` : ''}
                        </span>
                      ) : i < TOURNAMENT_ELO_PLACEMENTS.length ? (
                        // Podium projeté (2e/3e/4e) : +75/+50/+25 si le rang tient en phase finale.
                        <span className="text-teal text-[11px] font-semibold">
                          {t('tournois.league.gainQualified').replace('{n}', String(TOURNAMENT_ELO_PLACEMENTS[i]))}
                        </span>
                      ) : (
                        <span className="text-teal/70 text-[11px] font-semibold">
                          {t('tournois.league.qualifiedOnly')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[11px] text-muted-2 mb-4">{t('tournois.league.noMatchesYet')}</p>
      )}

      {/* Matrice qui-vs-qui : repère visuel des confrontations jouées / à jouer. */}
      {teams.length >= 2 && <LeagueMatrix teams={teams} matches={matches} t={t} />}

      {/* Outils admin : composer une affiche (équipe vs équipe + manche). */}
      {canManage && editable && (
        <div className="mb-4 p-3 rounded-xl border border-gold/20 bg-bg-2/30 space-y-2.5">
          <div className="text-[10px] uppercase tracking-wider text-gold font-extrabold">
            {t('tournois.league.addMatch')}
          </div>
          {/* Manche : aller (défaut) ou retour (retour = 2e confrontation d'une paire). */}
          <div className="flex items-center gap-1.5">
            {([0, 1] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLeg(l)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${
                  leg === l ? 'bg-gold/20 text-gold ring-1 ring-gold/50' : 'bg-bg-1 text-muted-2'
                }`}
              >
                {l === 0 ? t('tournois.league.legFirst') : t('tournois.league.legReturn')}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={teamA}
              onChange={(e) => setTeamA(e.target.value)}
              className="flex-1 min-w-[8rem] px-2 py-1.5 bg-bg-1 border border-border rounded-lg text-sm focus:border-gold outline-none"
            >
              <option value="">{t('tournois.league.pickTeam')}</option>
              {teams.map((tm) => (
                <option key={tm.captain} value={tm.captain} disabled={tm.captain === teamB}>
                  {leagueTeamLabel(tm)}
                </option>
              ))}
            </select>
            <span className="text-muted-2 text-xs font-bold">vs</span>
            <select
              value={teamB}
              onChange={(e) => setTeamB(e.target.value)}
              className="flex-1 min-w-[8rem] px-2 py-1.5 bg-bg-1 border border-border rounded-lg text-sm focus:border-gold outline-none"
            >
              <option value="">{t('tournois.league.pickTeam')}</option>
              {teams.map((tm) => (
                <option key={tm.captain} value={tm.captain} disabled={tm.captain === teamA}>
                  {leagueTeamLabel(tm)}
                </option>
              ))}
            </select>
            <Button size="sm" loading={adding} onClick={handleAdd} disabled={!teamA || !teamB}>
              {t('tournois.league.add')}
            </Button>
          </div>
          {/* Filet : recrée les affiches aller manquantes du round-robin (idempotent). */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="w-full text-[11px] font-semibold text-muted-2 hover:text-text-strong border border-border/60 hover:border-gold/40 rounded-lg py-1.5 transition-colors disabled:opacity-50"
          >
            {t('tournois.league.generateMissing')}
          </button>
        </div>
      )}

      {/* Gestion des équipes : « déclarer absente » (retrait neutre, révocable) →
          ses affiches non jouées sont ignorées de la proposition « prochain match ». */}
      {canManage && editable && teams.length > 0 && (
        <div className="mb-4 p-3 rounded-xl border border-border/60 bg-bg-2/30 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-2 font-extrabold">
            {t('tournois.league.teamsManage')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {teams.map((tm) => {
              const isAbsent = absentSet.has(tm.captain);
              return (
                <button
                  key={tm.captain}
                  type="button"
                  onClick={() => handleAbsent(tm.captain, !isAbsent)}
                  title={isAbsent ? t('tournois.league.reinstate') : t('tournois.league.declareAbsent')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                    isAbsent
                      ? 'border-amber-400/50 bg-amber-400/10 text-amber-400 line-through'
                      : 'border-border/60 text-muted-2 hover:text-text-strong hover:border-gold/40'
                  }`}
                >
                  {isAbsent ? '↩' : '🚫'} {leagueTeamLabel(tm)}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-2">{t('tournois.league.absentHint')}</p>
        </div>
      )}

      {/* Bandeau « Prochain match » : auto-proposé par l'équipe qui n'a pas joué
          depuis le plus longtemps (hors absents/reportés). L'officiant peut le
          « remettre à plus tard » — la proposition passe alors à l'affiche suivante. */}
      {editable && nextMatch && (
        <div className="mb-4">
          <NextMatchBanner
            match={nextMatch}
            partners={leaguePartners}
            avatars={leagueAvatars}
            live={false}
            label={t('tournois.bracket.upNext')}
          />
          {canManage && (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              {nextMatch.postponedAt ? (
                <span className="text-[11px] font-semibold text-amber-400/90">
                  ↩ {t('tournois.league.resurfaced')}
                </span>
              ) : (
                <span className="text-[11px] text-muted-2">{t('tournois.league.autoNextHint')}</span>
              )}
              <button
                type="button"
                onClick={() => handlePostpone(nextMatch.id, !nextMatch.postponedAt)}
                className="shrink-0 text-[11px] font-semibold text-muted-2 hover:text-gold border border-border/60 hover:border-gold/40 rounded-lg px-2.5 py-1 transition-colors"
              >
                {nextMatch.postponedAt ? `↩ ${t('tournois.league.reactivate')}` : `⏱ ${t('tournois.league.later')}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── À jouer ── Affiches actives, ordonnées par attente la plus longue.
          Pile-ou-face puis saisie du score. Le retour porte un badge « Retour ». */}
      {editable && activeQueue.length > 0 && (
        <div className="rounded-xl border border-gold/25 bg-bg-2/30 overflow-hidden mb-4">
          <div className="px-3 py-2 bg-gold/[0.07] border-b border-border/50 text-[11px] font-extrabold uppercase tracking-wider text-gold flex items-center justify-between">
            <span>{t('tournois.league.toPlay')}</span>
            <span className="text-muted-2 tabular-nums font-mono">{activeQueue.length}</span>
          </div>
          <div className="p-2.5 space-y-2">
            {activeQueue.map((m) => fixtureCard(m, false))}
          </div>
        </div>
      )}

      {/* ── Reportés ── Affiches « remises à plus tard » : retirées de la proposition
          « prochain match » mais toujours jouables ; resurgissent une fois les autres jouées. */}
      {editable && postponedQueue.length > 0 && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.04] overflow-hidden mb-4">
          <div className="px-3 py-2 bg-amber-400/[0.06] border-b border-border/50 text-[11px] font-extrabold uppercase tracking-wider text-amber-400 flex items-center justify-between">
            <span>⏱ {t('tournois.league.postponedGroup')}</span>
            <span className="text-muted-2 tabular-nums font-mono">{postponedQueue.length}</span>
          </div>
          <div className="p-2.5 space-y-2">
            {postponedQueue.map((m) => fixtureCard(m, true))}
          </div>
        </div>
      )}

      {/* ── En attente (équipe absente) ── Affiches non jouées d'équipes déclarées
          absentes : ignorées de la proposition tant que l'équipe n'est pas réintégrée. */}
      {editable && pendingAbsent.length > 0 && (
        <div className="rounded-xl border border-border bg-bg-2/20 overflow-hidden mb-4 opacity-70">
          <div className="px-3 py-2 bg-bg-2/50 border-b border-border/50 text-[11px] font-extrabold uppercase tracking-wider text-muted-2 flex items-center justify-between">
            <span>{t('tournois.league.absentPending')}</span>
            <span className="tabular-nums font-mono">{pendingAbsent.length}</span>
          </div>
          <div className="p-2.5 space-y-1">
            {pendingAbsent.map((m) => {
              const lbl = (login: string | null) => {
                const tm = login ? teamByCaptain.get(login) : null;
                return tm ? leagueTeamLabel(tm) : (login ?? '—');
              };
              return (
                <div key={m.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-bg-2/40">
                  <span className="truncate">
                    {lbl(m.playerALogin)} <span className="text-muted-2">vs</span> {lbl(m.playerBLogin)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-amber-400/80 shrink-0 ml-2">
                    {t('tournois.league.absent')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Résultats ── Affiches jouées : score figé, édition admin (ligue ouverte) et
          bouton « demander un match retour » sur les allers sans retour. */}
      {played.length > 0 && (
        <div className="rounded-xl border border-teal/25 bg-bg-2/30 overflow-hidden mb-4">
          <div className="px-3 py-2 bg-teal/[0.06] border-b border-border/50 text-[11px] font-extrabold uppercase tracking-wider text-teal flex items-center justify-between">
            <span>{t('tournois.league.played')}</span>
            <span className="text-muted-2 tabular-nums font-mono">{played.length}</span>
          </div>
          <div className="p-2.5 space-y-2">
            {played.map((m) => {
              const isAller = (m.poolIndex ?? 0) === 0;
              const canAskReturn = canManage && editable && isAller && !retourPairs.has(pairKey(m));
              return (
                <div key={m.id} className="relative">
                  {!isAller && (
                    <span className="absolute -top-1 left-2 z-10 px-1.5 py-0.5 rounded bg-bg-1 border border-border/60 text-[9px] font-bold uppercase tracking-wider text-muted-2">
                      {t('tournois.league.legReturn')}
                    </span>
                  )}
                  <BracketMatch
                    tournament={tournament}
                    match={m}
                    myLogin={myLogin}
                    canOfficiate={editable && canOfficiate}
                    onChange={onChange}
                  />
                  {canAskReturn && (
                    <button
                      type="button"
                      onClick={() => handleRequestReturn(m)}
                      className="mt-1.5 w-full text-[11px] font-semibold text-muted-2 hover:text-gold border border-border/60 hover:border-gold/40 rounded-lg py-1.5 transition-colors"
                    >
                      ↩ {t('tournois.league.requestReturn')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Non joués ── Après bascule : affiches jamais disputées (ignorées du classement). */}
      {!editable && pending.length > 0 && (
        <div className="rounded-xl border border-border bg-bg-2/20 overflow-hidden mb-4 opacity-70">
          <div className="px-3 py-2 bg-bg-2/50 border-b border-border/50 text-[11px] font-extrabold uppercase tracking-wider text-muted-2 flex items-center justify-between">
            <span>{t('tournois.league.notPlayed')}</span>
            <span className="tabular-nums font-mono">{pending.length}</span>
          </div>
          <div className="p-2.5 space-y-1">
            {pending.map((m) => {
              const lbl = (login: string | null) => {
                const tm = login ? teamByCaptain.get(login) : null;
                return tm ? leagueTeamLabel(tm) : (login ?? '—');
              };
              return (
                <div key={m.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-bg-2/40">
                  <span className="truncate">
                    {lbl(m.playerALogin)} <span className="text-muted-2">vs</span> {lbl(m.playerBLogin)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-2 shrink-0 ml-2">
                    {t('tournois.league.notPlayed')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bascule en phase finale (admin) : nombre LIBRE de qualifiés, modifiable à tout
          moment et persisté. Autorisée même avec des matchs non joués (ignorés). */}
      {canManage && editable && (
        <div className="mt-4 p-3 rounded-xl border border-teal/25 bg-teal/[0.05] space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-teal font-extrabold">
            {t('tournois.league.toKnockout')}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-muted-2 uppercase tracking-wider font-semibold">
              {t('tournois.league.qualifyCount')}
            </label>
            <input
              type="number"
              min={2}
              max={64}
              value={qualifyCount}
              onChange={(e) => setQualifyCount(Number(e.target.value))}
              onBlur={(e) => persistQualify(Number(e.target.value))}
              className="w-20 px-2 py-1.5 bg-bg-1 border border-border rounded-lg text-sm focus:border-gold outline-none tabular-nums"
            />
            <Button
              size="sm"
              loading={finalizing}
              onClick={handleFinalize}
              disabled={!canFinalize || matchCount === 0}
            >
              {t('tournois.league.finalizeCta')}
            </Button>
          </div>
          <p className="text-[10px] text-muted-2">{t('tournois.league.qualifyHint')}</p>
          {rankedCount < 2 && (
            <p className="text-[11px] text-muted-2">{t('tournois.league.needMorePlayers')}</p>
          )}
          {rankedCount >= 2 && effectiveQualify > rankedCount && (
            <p className="text-[11px] text-gold">
              {t('tournois.league.qualifyCount')} &gt; {rankedCount}
            </p>
          )}
          {canFinalize && !complete && (
            <p className="text-[11px] text-muted-2">{t('tournois.league.pendingMatches')}</p>
          )}
        </div>
      )}

      {/* Revenir en arrière depuis la phase finale (admin) : efface le bracket et rouvre la
          ligue (possible tant qu'aucun match de la finale n'a commencé). */}
      {canManage && !editable && tournament.status === 'in_progress' && (
        <div className="mt-4 p-3 rounded-xl border border-gold/25 bg-gold/[0.05]">
          <div className="text-[10px] uppercase tracking-wider text-gold font-extrabold mb-2">
            {t('tournois.league.undoFinalize')}
          </div>
          <Button size="sm" variant="ghost" loading={undoing} onClick={handleUndo}>
            ↩ {t('tournois.league.undoFinalize')}
          </Button>
          <p className="text-[10px] text-muted-2 mt-1.5">{t('tournois.league.undo.warning')}</p>
        </div>
      )}
    </section>
  );
}

function PoolCard({
  tournament,
  pool,
  myLogin,
  canOfficiate,
  onChange,
}: {
  tournament: Tournament;
  pool: { index: number; matches: TournamentMatch[]; standings: Standing[] };
  myLogin: string | null;
  canOfficiate: boolean;
  onChange: () => Promise<void>;
}) {
  const t = useT();
  const poolName = String.fromCharCode(65 + pool.index); // A, B, C…

  // ── Auto-organisation : prochain match de la poule par « qui n'a pas joué depuis
  // le plus longtemps » (miroir de la phase de ligue) ────────────────────────────
  const playablePool = pool.matches.filter((m) => m.playerALogin && m.playerBLogin);
  const playedPool = playablePool.filter((m) => m.confirmedAt);
  const pendingPool = playablePool.filter((m) => !m.confirmedAt);
  // Dernière activité par joueur (ms du dernier match de poule confirmé) — jamais
  // joué → 0, donc prioritaire.
  const poolLastActivity: Record<string, number> = {};
  for (const m of playedPool) {
    const ts = m.confirmedAt ? new Date(m.confirmedAt).getTime() : 0;
    for (const p of [m.playerALogin, m.playerBLogin]) {
      if (p) poolLastActivity[p] = Math.max(poolLastActivity[p] ?? 0, ts);
    }
  }
  // Attente d'une affiche = ancienneté du joueur qui a le plus attendu (min des deux).
  const poolPairWait = (m: TournamentMatch) =>
    Math.min(poolLastActivity[m.playerALogin ?? ''] ?? 0, poolLastActivity[m.playerBLogin ?? ''] ?? 0);
  const pendingByWait = [...pendingPool].sort((a, b) => poolPairWait(a) - poolPairWait(b) || a.slot - b.slot);
  // Prochain match : affiche non jouée dont l'attente est la plus longue.
  const nextPoolMatch = tournament.status === 'in_progress' ? (pendingByWait[0] ?? null) : null;
  // Ordre d'affichage : à jouer (attente décroissante) puis déjà jouées (ordre de jeu).
  const orderedPoolMatches = [
    ...pendingByWait,
    ...playedPool.slice().sort((a, b) => a.slot - b.slot),
  ];

  return (
    <div className="rounded-xl border border-border bg-bg-2/30 overflow-hidden">
      <div className="px-3 py-2 bg-bg-2/60 border-b border-border/50 text-[11px] font-extrabold uppercase tracking-wider text-text-strong">
        {t('tournois.pool.name').replace('{name}', poolName)}
      </div>
      {/* Classement */}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-2 border-b border-border/40">
            <th className="text-left font-semibold py-1.5 pl-3">#</th>
            <th className="text-left font-semibold py-1.5">{t('tournois.pool.col.player')}</th>
            <th className="text-center font-semibold py-1.5">{t('tournois.pool.col.played')}</th>
            <th className="text-center font-semibold py-1.5">{t('tournois.pool.col.wins')}</th>
            <th className="text-center font-semibold py-1.5 pr-3">{t('tournois.pool.col.diff')}</th>
          </tr>
        </thead>
        <tbody>
          {pool.standings.map((s, i) => {
            const qualified = i < QUALIFY_PER_POOL;
            return (
              <tr
                key={s.login}
                className={`border-b border-border/20 last:border-0 ${
                  qualified ? 'bg-teal/5' : ''
                }`}
              >
                <td className="py-1.5 pl-3">
                  <span
                    className={`inline-flex w-4 justify-center font-bold ${
                      qualified ? 'text-teal' : 'text-muted-2'
                    }`}
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="py-1.5">
                  <PlayerLink login={s.login} className="text-sm truncate">
                    <span className={qualified ? 'text-text-strong font-semibold' : ''}>
                      {s.login}
                    </span>
                  </PlayerLink>
                </td>
                <td className="py-1.5 text-center tabular-nums text-muted-2">{s.played}</td>
                <td className="py-1.5 text-center tabular-nums font-bold">{s.wins}</td>
                <td className="py-1.5 text-center tabular-nums pr-3">
                  <span className={s.diff > 0 ? 'text-[#7fd66e]' : s.diff < 0 ? 'text-red' : ''}>
                    {s.diff > 0 ? `+${s.diff}` : s.diff}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Matchs de la poule — non joués d'abord (attente la plus longue), le
          prochain match auto-proposé est mis en avant. */}
      <div className="p-2.5 space-y-2 border-t border-border/40">
        {orderedPoolMatches.map((m) => {
          const isNext = nextPoolMatch?.id === m.id;
          return (
            <div
              key={m.id}
              className={isNext ? 'rounded-lg ring-1 ring-gold/40 bg-gold/[0.05] p-2' : undefined}
            >
              {isNext && (
                <div className="mb-1 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-gold">
                  <span aria-hidden>⏱</span>
                  {t('tournois.bracket.upNext')}
                </div>
              )}
              <BracketMatch
                tournament={tournament}
                match={m}
                myLogin={myLogin}
                canOfficiate={canOfficiate}
                onChange={onChange}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BracketMatch({
  tournament,
  match,
  myLogin,
  canOfficiate,
  onChange,
}: {
  tournament: Tournament;
  match: TournamentMatch;
  myLogin: string | null;
  canOfficiate: boolean;
  onChange: () => Promise<void>;
}) {
  const flash = useFlash();
  const confirm = useConfirm();
  const t = useT();
  const [recording, setRecording] = useState(false);
  // Édition admin d'un score de ligue DÉJÀ confirmé (correction d'erreur de saisie).
  const [editing, setEditing] = useState(false);
  // Pile-ou-face : true entre le clic et l'arrivée du résultat (via reload SSE).
  const [flipping, setFlipping] = useState(false);
  // Révélation différée du résultat : on laisse la pièce se poser et on garde le
  // résultat du tirage à l'écran un instant avant d'enchaîner sur la saisie du
  // score. True d'emblée si le toss était déjà tranché au montage (revisite).
  const [tossRevealed, setTossRevealed] = useState(() => match.tossWinnerLogin != null);
  // Instant du clic « Pile ou face », pour garantir un temps de vol minimal de la
  // pièce identique à /god même si le backend tranche en quelques ms.
  const flipStartedAt = useRef<number | null>(null);

  const winnerA = !!(match.winnerLogin && match.winnerLogin === match.playerALogin);
  const winnerB = !!(match.winnerLogin && match.winnerLogin === match.playerBLogin);
  // Un match 2v2 oppose des ÉQUIPES, mais le match ne porte que le login du
  // capitaine. On retrouve le binôme depuis les entrées pour afficher les DEUX
  // membres (lignes du match + saisie de score).
  const teamOf = (login: string | null): MatchTeam | null => {
    if (!login) return null;
    const e = (tournament.entries ?? []).find((en) => en.login === login);
    return {
      captain: login,
      captainImageUrl: e?.user?.imageUrl ?? null,
      partner: e?.partnerLogin ?? null,
      partnerImageUrl: e?.partner?.imageUrl ?? null,
    };
  };
  const teamA = teamOf(match.playerALogin);
  const teamB = teamOf(match.playerBLogin);
  const labelA = teamLabel(teamA, t('tournois.match.playerA'));
  const labelB = teamLabel(teamB, t('tournois.match.playerB'));
  const iAmIn = !!(myLogin && (match.playerALogin === myLogin || match.playerBLogin === myLogin));
  const recorded = match.recordedByLogin != null && match.scoreA != null && match.scoreB != null;
  const iRecorded = recorded && match.recordedByLogin === myLogin;
  // Officiant (admin/organisateur) : saisit le score d'autorité (force-result, validé
  // direct) au lieu du double-aveugle record/confirm — y compris s'il joue lui-même
  // le match (un score saisi par un admin compte immédiatement, sans confirmation
  // adverse, depuis la page tournoi).
  const officiating = canOfficiate;

  const canRecord =
    tournament.status === 'in_progress' &&
    (iAmIn || canOfficiate) &&
    !!match.playerALogin &&
    !!match.playerBLogin &&
    !match.confirmedAt;

  // ── Pile-ou-face : uniquement pour les matchs de bracket prêts ──────────────
  // Plus de choix d'avantage dans l'appli (réglé « dans la vraie vie ») : le
  // tirage désigne juste le gagnant, puis on passe direct à la saisie du score.
  // Pile-ou-face : matchs de bracket ET de ligue (championnat).
  const tossEligible = (match.stage ?? 'bracket') === 'bracket' || match.stage === 'league';
  const tossDone = match.tossWinnerLogin != null;
  // Le duel (pile-ou-face) précède la saisie : actif tant que le toss n'est pas
  // tranché ET révélé (on garde l'annonce du gagnant à l'écran un instant).
  const duelPending = tossEligible && canRecord && !recorded && (!tossDone || !tossRevealed);
  const tossWinnerName = match.tossWinnerLogin ?? '';
  // PP du vainqueur du tirage (révélée à l'atterrissage de la pièce).
  const tossWinnerImageUrl = match.tossWinnerLogin
    ? (tournament.entries ?? [])
        .flatMap((e) => [
          { login: e.login, imageUrl: e.user?.imageUrl ?? null },
          ...(e.partnerLogin ? [{ login: e.partnerLogin, imageUrl: e.partner?.imageUrl ?? null }] : []),
        ])
        .find((p) => p.login === match.tossWinnerLogin)?.imageUrl ?? null
    : null;

  // Une fois le résultat du tirage arrivé, on coupe l'animation de la pièce, on
  // la laisse atterrir (~0.6 s) puis on souffle sur le résultat avant de dévoiler
  // l'étape suivante (choix d'avantage).
  useEffect(() => {
    if (!tossDone) return;
    // On calque le timing de /god : la pièce vole ~2,6 s avant d'atterrir, puis le
    // résultat reste affiché ~2 s. Si le backend a répondu plus vite, on laisse la
    // pièce finir son vol ; sur revisite (pas de clic) flipStartedAt est null → vol
    // déjà « écoulé » → atterrissage immédiat.
    const elapsed = Date.now() - (flipStartedAt.current ?? 0);
    const landDelay = Math.max(0, 2600 - elapsed);
    const tLand = setTimeout(() => setFlipping(false), landDelay);
    const tReveal = setTimeout(() => setTossRevealed(true), landDelay + 2000);
    return () => { clearTimeout(tLand); clearTimeout(tReveal); };
  }, [tossDone]);

  const handleToss = async () => {
    flipStartedAt.current = Date.now();
    setFlipping(true);
    try {
      await api.tossTournamentMatch(tournament.id, match.id);
      // Le résultat partagé arrive via le reload (SSE tournament:update) ;
      // on rafraîchit aussi explicitement pour l'initiateur.
      await onChange();
    } catch (err) {
      setFlipping(false);
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleRecordSubmit = async (scoreA: number, scoreB: number) => {
    try {
      if (officiating) {
        // Saisie d'autorité : score validé immédiatement (pas de confirmation
        // de l'adversaire puisque l'officiant ne joue pas le match).
        await api.adminForceTournamentMatch(tournament.id, match.id, scoreA, scoreB);
        flash.show(t('tournois.flash.scoreConfirmed'));
      } else {
        await api.recordTournamentMatch(tournament.id, match.id, scoreA, scoreB);
        flash.show(t('tournois.flash.scoreRecorded'));
      }
      setRecording(false);
      await onChange();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleConfirm = async () => {
    // Narrowing safe : on rentre ici uniquement quand `recorded` est true.
    if (match.scoreA == null || match.scoreB == null) return;
    try {
      // L'officiant (admin/organisateur d'un amical) valide d'autorité le score
      // déjà saisi : force-result confirme immédiatement, sans exiger qu'il soit
      // le camp adverse (la confirmation double-aveugle ne le concerne pas).
      const res = officiating
        ? await api.adminForceTournamentMatch(tournament.id, match.id, match.scoreA, match.scoreB)
        : await api.confirmTournamentMatch(tournament.id, match.id, match.scoreA, match.scoreB);
      flash.show(
        res.finished
          ? t('tournois.flash.tournamentWon').replace('{login}', String(res.winnerLogin))
          : t('tournois.flash.scoreConfirmed'),
      );
      await onChange();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleReject = async () => {
    const ok = await confirm({
      title: t('tournois.confirm.reject.title'),
      message: t('tournois.confirm.reject.message'),
      confirmLabel: t('tournois.confirm.reject.confirm'),
      cancelLabel: t('tournois.confirm.reject.cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.rejectTournamentMatch(tournament.id, match.id);
      flash.show(t('tournois.flash.scoreReset'));
      await onChange();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  // Édition admin d'un score de ligue confirmé : réécrit le score (le classement se
  // recalcule, les paris du match sont re-réglés côté serveur si le vainqueur change).
  const handleEditSubmit = async (scoreA: number, scoreB: number) => {
    try {
      await api.editLeagueScore(tournament.id, match.id, scoreA, scoreB);
      flash.show(t('tournois.flash.scoreConfirmed'));
      setEditing(false);
      await onChange();
    } catch (err) {
      flash.show(err instanceof Error ? err.message : String(err), 'error');
    }
  };
  // L'officiant peut corriger un match de LIGUE déjà confirmé (erreur de saisie).
  const canEditConfirmed =
    canOfficiate && match.stage === 'league' && !!match.confirmedAt && tournament.status === 'in_progress';

  return (
    <div
      className={`p-2.5 border rounded bg-bg-2/50 ${
        match.confirmedAt ? 'border-teal/40' : 'border-border'
      }`}
    >
      <PlayerRow team={teamA} score={match.scoreA} winner={winnerA} />
      <PlayerRow team={teamB} score={match.scoreB} winner={winnerB} />

      {/* ── Pile-ou-face partagé ──
          Le LANCER (rotation + annonce du gagnant) s'affiche EN GRAND, centré sur
          toute la page, via CoinFlipOverlay. Ici, en inline, on ne garde que le
          bouton d'initiation (avant le lancer). Pas de choix d'avantage en appli :
          il se règle « dans la vraie vie ». */}
      {duelPending && !tossDone && !flipping && (
        <div className="mt-2 pt-2 border-t border-border/40">
          <CoinFlip
            side={match.tossSide ?? null}
            flipping={false}
            onFlip={handleToss}
            t={t}
          />
        </div>
      )}

      {/* Cinématique plein écran du pile-ou-face : ouverte pendant la rotation
          puis l'annonce du gagnant, fermée quand on enchaîne sur la saisie. */}
      <CoinFlipOverlay
        open={duelPending && (flipping || (tossDone && !tossRevealed))}
        side={match.tossSide ?? null}
        flipping={flipping}
        winnerName={tossWinnerName || undefined}
        winnerLogin={tossWinnerName || undefined}
        winnerImageUrl={tossWinnerImageUrl}
        t={t}
      />

      {canRecord && !duelPending && !recorded && !recording && (
        // Clignote / pulse quelques fois à l'arrivée sur la page pour attirer
        // l'attention sur la saisie du résultat, puis se stabilise.
        <motion.div
          className="mt-2 rounded-lg"
          initial={{ boxShadow: '0 0 0 0 rgba(255,201,74,0)' }}
          animate={{
            scale: [1, 1.04, 1, 1.04, 1, 1.04, 1],
            boxShadow: [
              '0 0 0 0 rgba(255,201,74,0)',
              '0 0 18px 2px rgba(255,201,74,0.65)',
              '0 0 0 0 rgba(255,201,74,0)',
              '0 0 18px 2px rgba(255,201,74,0.65)',
              '0 0 0 0 rgba(255,201,74,0)',
              '0 0 18px 2px rgba(255,201,74,0.65)',
              '0 0 0 0 rgba(255,201,74,0)',
            ],
          }}
          transition={{ duration: 1.8, ease: 'easeInOut', times: [0, 0.14, 0.28, 0.42, 0.56, 0.7, 1] }}
        >
          <Button size="sm" full onClick={() => setRecording(true)}>
            {t('tournois.match.enterScore')}
          </Button>
        </motion.div>
      )}

      {canRecord && recording && (
        <RecordBracketForm
          game={tournament.game ?? 'babyfoot'}
          labelA={labelA}
          labelB={labelB}
          freeScores={match.stage === 'league' || match.stage === 'bracket'}
          allowDraw={match.stage === 'league'}
          onSubmit={handleRecordSubmit}
          onCancel={() => setRecording(false)}
        />
      )}

      {canRecord && recorded && iRecorded && (
        <div className="text-[11px] text-muted-2 mt-2 text-center">
          {t('tournois.match.waitingConfirm').replace('{score}', `${match.scoreA}-${match.scoreB}`)}
        </div>
      )}

      {canRecord && recorded && !iRecorded && (
        <div className="mt-2">
          <div className="text-[11px] text-gold mb-1.5">
            {t('tournois.match.scoreToConfirm').replace('{score}', `${match.scoreA}-${match.scoreB}`)}
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={handleConfirm}>{t('tournois.match.confirm')}</Button>
            <Button size="sm" variant="ghost" onClick={handleReject}>{t('tournois.match.reject')}</Button>
          </div>
        </div>
      )}

      {/* Correction admin d'un score de ligue confirmé (erreur de saisie). */}
      {canEditConfirmed && (
        editing ? (
          <RecordBracketForm
            game={tournament.game ?? 'babyfoot'}
            labelA={labelA}
            labelB={labelB}
            freeScores
            allowDraw
            onSubmit={handleEditSubmit}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-2 w-full text-[11px] font-semibold text-muted-2 hover:text-text-strong border border-border/60 hover:border-gold/40 rounded-lg py-1.5 transition-colors"
          >
            {t('tournois.league.editScore')}
          </button>
        )
      )}
    </div>
  );
}

// Une équipe vue depuis un match : capitaine + coéquipier éventuel (avec PP).
type MatchTeam = {
  captain: string;
  captainImageUrl: string | null;
  partner: string | null;
  partnerImageUrl: string | null;
};

// Libellé texte d'une équipe (capitaine + binôme), pour les boutons de saisie.
function teamLabel(team: MatchTeam | null, fallback: string): string {
  if (!team) return fallback;
  return team.partner ? `${team.captain} + ${team.partner}` : team.captain;
}

function PlayerRow({
  team,
  score,
  winner,
}: {
  team: MatchTeam | null;
  score: number | null;
  winner: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 py-1.5 px-1 border-b border-border/40 last:border-0 ${
        winner ? 'text-text-strong font-bold' : 'text-text'
      }`}
    >
      {team ? (
        <div className="flex flex-col gap-0.5 min-w-0">
          <PlayerLink login={team.captain} className="text-sm truncate min-w-0">
            <Avatar login={team.captain} imageUrl={team.captainImageUrl} size="xs" />
            <span className="truncate">{team.captain}</span>
          </PlayerLink>
          {team.partner && (
            <PlayerLink login={team.partner} className="text-xs text-muted-2 truncate min-w-0">
              <Avatar login={team.partner} imageUrl={team.partnerImageUrl} size="xs" />
              <span className="truncate">{team.partner}</span>
            </PlayerLink>
          )}
        </div>
      ) : (
        <span className="text-sm text-muted">?</span>
      )}
      <span className={`text-sm tabular-nums ${score != null && score < 0 ? 'text-red' : ''}`}>
        {score != null ? score : '–'}
      </span>
    </div>
  );
}

function RecordBracketForm({
  game,
  labelA,
  labelB,
  freeScores = false,
  allowDraw = false,
  onSubmit,
  onCancel,
}: {
  game: Game;
  // Libellés d'équipe (capitaine + binôme en 2v2), affichés au lieu du seul login.
  labelA: string;
  labelB: string;
  // Saisie libre des deux scores (babyfoot) — utilisée en ligue ET en phase finale.
  freeScores?: boolean;
  // Nul autorisé (ligue, goal average) ; en finale il faut un vainqueur.
  allowDraw?: boolean;
  onSubmit: (scoreA: number, scoreB: number) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [winner, setWinner] = useState<'a' | 'b' | null>(null);
  const [loserScore, setLoserScore] = useState(0);
  const [winnerGames, setWinnerGames] = useState(2); // smash : games du vainqueur (2 ou 3)
  const [freeA, setFreeA] = useState(0);
  const [freeB, setFreeB] = useState(0);
  const [busy, setBusy] = useState(false);

  const send = async (scoreA: number, scoreB: number) => {
    setBusy(true);
    try {
      await onSubmit(scoreA, scoreB);
    } finally {
      setBusy(false);
    }
  };

  // Babyfoot : on saisit librement le score des DEUX camps, chaque champ étiqueté
  // avec son équipe — pas d'étape « qui a gagné », le vainqueur se déduit du score
  // le plus élevé. Le nul n'est permis qu'en ligue (allowDraw) ; en finale on doit
  // départager.
  if (freeScores && game === 'babyfoot') {
    const tie = freeA === freeB;
    const blockTie = tie && !allowDraw;
    const row = (label: string, value: number, onChange: (v: number) => void) => (
      <div className="flex items-center gap-2">
        <div className="w-24 shrink-0 text-right text-xs font-semibold text-text truncate">{label}</div>
        <div className="flex-1 min-w-0">
          <AbacusSlider value={value} onChange={onChange} min={0} max={WINNING_SCORE} />
        </div>
        <div className="w-7 shrink-0 text-center font-mono font-extrabold tabular-nums text-gold">{value}</div>
      </div>
    );
    return (
      <div className="mt-2 space-y-2.5">
        <div className="text-xs text-muted text-center">{t('tournois.match.finalScore')}</div>
        {row(labelA, freeA, setFreeA)}
        {row(labelB, freeB, setFreeB)}
        {blockTie && <div className="text-[11px] text-center text-red-400">{t('tournois.match.noTie')}</div>}
        {tie && allowDraw && (
          <div className="text-[11px] text-center text-muted-2">{t('tournois.match.draw')}</div>
        )}
        <div className="flex gap-1.5 pt-1">
          <Button size="sm" loading={busy} disabled={blockTie} onClick={() => send(freeA, freeB)} className="flex-1">
            OK
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} className="flex-none">×</Button>
        </div>
      </div>
    );
  }

  // Étape 1 — vainqueur. Binaire (échecs / coding / pokémon) : un clic suffit.
  if (!winner) {
    const pick = (w: 'a' | 'b') => {
      if (game === 'chess' || game === 'coding' || game === 'pokemon') void send(w === 'a' ? 1 : 0, w === 'a' ? 0 : 1);
      else setWinner(w);
    };
    return (
      <div className="mt-2 space-y-2">
        <div className="text-xs text-muted text-center">{t('tournois.match.whoWon')}</div>
        <div className="grid grid-cols-2 gap-2">
          <OutcomeButton kind="win" onClick={() => pick('a')}>
            {labelA}
          </OutcomeButton>
          <OutcomeButton kind="win" onClick={() => pick('b')}>
            {labelB}
          </OutcomeButton>
        </div>
        <Button size="sm" variant="ghost" onClick={onCancel} className="w-full">{t('tournois.match.cancel')}</Button>
      </div>
    );
  }

  const loserLabel = winner === 'a' ? labelB : labelA;

  // Set (Smash / Street Fighter) : score du set en games (vainqueur 2 ou 3, perdant strictement moins).
  if (game === 'smash' || game === 'streetfighter') {
    const loserGames = Math.min(loserScore, winnerGames - 1);
    const chip = (active: boolean) =>
      `w-8 h-8 rounded-lg font-mono font-extrabold tabular-nums transition-all ${
        active ? 'bg-gold/15 text-gold ring-1 ring-gold/50' : 'bg-bg-2/50 text-muted-2'
      }`;
    return (
      <div className="mt-2 space-y-2">
        <div className="text-xs text-muted text-center">{t('tournois.match.setScore')}</div>
        <div className="flex items-center justify-center gap-2 text-[11px] text-muted-2">
          <span className="w-20 text-right">{t('tournois.match.winner')}</span>
          {[2, 3].map((g) => (
            <button key={g} type="button" onClick={() => setWinnerGames(g)} className={chip(winnerGames === g)}>
              {g}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 text-[11px] text-muted-2">
          <span className="w-20 text-right truncate">{loserLabel}</span>
          {Array.from({ length: winnerGames }, (_, i) => i).map((g) => (
            <button key={g} type="button" onClick={() => setLoserScore(g)} className={chip(loserGames === g)}>
              {g}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setWinner(null)} className="flex-none">←</Button>
          <Button
            size="sm"
            loading={busy}
            onClick={() => send(winner === 'a' ? winnerGames : loserGames, winner === 'a' ? loserGames : winnerGames)}
            className="flex-1"
          >
            OK
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} className="flex-none">×</Button>
        </div>
      </div>
    );
  }

  // Babyfoot : abaque du score du perdant (le vainqueur marque 10).
  return (
    <div className="mt-2 space-y-2">
      <div className="text-xs text-muted text-center">
        {t('tournois.match.loserScore')} <span className="text-text font-semibold">{loserLabel}</span>
      </div>
      <AbacusSlider
        value={loserScore}
        onChange={setLoserScore}
        min={LOSER_SCORE_MIN}
        max={LOSER_SCORE_MAX}
      />
      <div className="flex gap-1.5 pt-1">
        <Button size="sm" variant="ghost" onClick={() => setWinner(null)} className="flex-none">←</Button>
        <Button
          size="sm"
          loading={busy}
          onClick={() => send(winner === 'a' ? WINNING_SCORE : loserScore, winner === 'a' ? loserScore : WINNING_SCORE)}
          className="flex-1"
        >
          OK
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="flex-none">×</Button>
      </div>
    </div>
  );
}
