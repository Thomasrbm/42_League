import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Swords,
  ClipboardCheck,
  Gift,
  Trophy,
  Flame,
  Activity,
  MapPin,
  ChevronRight,
  Sparkles,
  Zap,
  TrendingUp,
  PartyPopper,
  CalendarCheck,
  ShoppingBag,
  Orbit,
  Medal,
  ChevronsUp,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { HotPlayers } from '../components/HotPlayers';
import { OnlineBadge } from '../components/OnlineBadge';
import { PlayerLink } from '../components/PlayerLink';
import { useLeagueData } from '../hooks/useLeagueData';
import { api } from '../lib/api';
import { fmtRelative } from '../lib/format';
import { GAME_META } from '../lib/gameMeta';
import { useI18n, useT } from '../lib/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil « Aujourd'hui » — répond à « qu'est-ce qui m'attend ? » en un écran :
// défis reçus, scores à valider, récompenses de passe à réclamer, tournoi en
// cours/ouvert, qui est au cluster, et l'activité récente du campus (les
// upsets 🔥 font parler). Remplace l'ancien redirect / → /challenges.
// Tout vient de useLeagueData sauf le compteur de paliers (1 fetch léger).
// ─────────────────────────────────────────────────────────────────────────────

/** Gain d'ELO du vainqueur à partir duquel on tamponne « upset » (grosse surprise). */
const UPSET_DELTA = 20;

// ─── Nouveautés à tester ──────────────────────────────────────────────────────
// Vitrine statique des dernières features (pas d'API) : à mettre à jour à la
// main quand une nouveauté sort. App interne francophone → FR en dur assumé.
const WHATS_NEW: { to: string; Icon: LucideIcon; color: string; title: string; desc: string }[] = [
  {
    to: '/passe',
    Icon: Zap,
    color: '#ffc94a',
    title: 'Passe de combat',
    desc: 'Gagne de l’XP à chaque match, même perdu, et réclame tes récompenses.',
  },
  {
    to: '/leaderboard',
    Icon: TrendingUp,
    color: '#2cc3ff',
    title: 'Classement XP',
    desc: 'Le nouveau ladder d’XP toutes disciplines confondues.',
  },
  {
    to: '/settings',
    Icon: PartyPopper,
    color: '#ff5d73',
    title: 'Émotes de victoire',
    desc: 'Nargue tes victimes après un 1v1 — à choisir dans tes réglages.',
  },
  {
    to: '/tournaments',
    Icon: CalendarCheck,
    color: '#4ade80',
    title: 'Check-in tournoi',
    desc: 'Confirme ta présence avant le coup d’envoi pour garder ta place.',
  },
];

/** Bloc pleine largeur « Nouveautés à tester » — vitrine flashy des features fraîches. */
function WhatsNewCard() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="relative card-hud rounded-2xl px-4 py-4 overflow-hidden border !border-gold/40 shadow-gold-glow"
    >
      {/* Halo doré discret en fond, pour l'effet « vitrine » */}
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{ background: 'radial-gradient(ellipse at top left, rgb(var(--accent-gold) / 0.10), transparent 55%)' }}
      />

      <div className="relative flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-gold" strokeWidth={2.4} />
        <span className="font-gaming text-xs font-extrabold uppercase tracking-[0.14em] text-text-strong">
          Nouveautés à tester
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gold/15 border border-gold/50 text-gold text-[9px] font-extrabold uppercase tracking-widest animate-pulse">
          Nouveau
        </span>
      </div>

      <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-2">
        {WHATS_NEW.map((item) => (
          <Link
            key={item.to + item.title}
            to={item.to}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-bg-2/50 border border-border/50 hover:brightness-110 hover:border-gold/40 transition-all group"
          >
            <span
              className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border"
              style={{ color: item.color, background: `${item.color}14`, borderColor: `${item.color}40` }}
            >
              <item.Icon className="w-[18px] h-[18px]" strokeWidth={2.2} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-gaming font-extrabold text-text-strong leading-tight">
                {item.title}
              </span>
              <span className="block text-[11px] text-muted-2 leading-snug mt-0.5">{item.desc}</span>
            </span>
            <ChevronRight
              className="shrink-0 w-4 h-4 text-muted-2 group-hover:text-gold group-hover:translate-x-0.5 transition-all"
              strokeWidth={2.5}
            />
          </Link>
        ))}
      </div>
    </motion.section>
  );
}

// ─── Mini-quêtes de la semaine ────────────────────────────────────────────────
// Suggestions d'activités concrètes (statiques, pas d'API) pour donner des idées
// quand la todo est vide : dépenser ses coins, viser un trophée, grimper…
const WEEKLY_IDEAS: { to: string; Icon: LucideIcon; color: string; label: string; desc: string }[] = [
  {
    to: '/shop',
    Icon: ShoppingBag,
    color: '#ffc94a',
    label: 'Vide ton portefeuille',
    desc: 'Passe en boutique dépenser tes coins : skins d’avatar, titres, consommables.',
  },
  {
    to: '/challenges',
    Icon: Orbit,
    color: '#2cc3ff',
    label: 'Sors de ta zone',
    desc: 'Défie quelqu’un dans un autre univers que le tien.',
  },
  {
    to: '/trophies',
    Icon: Medal,
    color: '#ff9d3a',
    label: 'Vise le podium des trophées',
    desc: 'Chaque trophée détenu rapporte 25 coins par semaine.',
  },
  {
    to: '/leaderboard',
    Icon: ChevronsUp,
    color: '#4ade80',
    label: 'Monte d’un grade',
    desc: 'Grimpe au classement avant la fin de la saison.',
  },
];

/** Carte « À faire cette semaine » — mini-quêtes hebdo statiques avec liens. */
function WeeklyIdeasCard() {
  return (
    <div className="card-hud rounded-2xl px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <Target className="w-4 h-4 text-teal" strokeWidth={2.4} />
        <span className="font-gaming text-xs font-extrabold uppercase tracking-[0.14em] text-text-strong">
          À faire cette semaine
        </span>
      </div>
      <div className="space-y-1.5">
        {WEEKLY_IDEAS.map((q) => (
          <Link
            key={q.to + q.label}
            to={q.to}
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-bg-2/60 border border-transparent hover:border-border/60 transition-all group"
          >
            <span
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border"
              style={{ color: q.color, background: `${q.color}14`, borderColor: `${q.color}40` }}
            >
              <q.Icon className="w-4 h-4" strokeWidth={2.2} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] font-bold text-text-strong leading-tight">{q.label}</span>
              <span className="block text-[11px] text-muted-2 leading-snug mt-0.5">{q.desc}</span>
            </span>
            <ChevronRight
              className="shrink-0 w-3.5 h-3.5 text-muted-2 group-hover:translate-x-0.5 transition-transform"
              strokeWidth={2.5}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function HomePage() {
  const t = useT();
  const { lang } = useI18n();
  const { me, challenges, pending, tournaments, matches, leaderboard, locations } = useLeagueData();
  const myLogin = me?.login ?? null;

  // Paliers de passe réclamables — compteur léger, rechargé à chaque visite.
  const [claimables, setClaimables] = useState(0);
  useEffect(() => {
    let alive = true;
    api
      .battlePass()
      .then((bp) => {
        if (alive) setClaimables(bp.tiers.filter((tier) => tier.unlocked && !tier.claimedAt).length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const incomingChallenges = useMemo(
    () =>
      challenges.filter(
        (c) =>
          c.status === 'pending' &&
          (c.opponentLogin === myLogin || c.opponentPartnerLogin === myLogin),
      ).length,
    [challenges, myLogin],
  );

  const scoresToConfirm = useMemo(
    () => pending.filter((p) => p.opponentLogin === myLogin).length,
    [pending, myLogin],
  );

  // Tournoi mis en avant : un « en cours » d'abord, sinon inscriptions ouvertes.
  const featuredTournament = useMemo(() => {
    const live = tournaments.find((tour) => tour.status === 'in_progress');
    if (live) return { tour: live, live: true };
    const open = tournaments.find((tour) => tour.status === 'registration' && !tour.isPrivate);
    return open ? { tour: open, live: false } : null;
  }, [tournaments]);

  // Activité récente tous jeux confondus (plus récents d'abord).
  const recent = useMemo(
    () =>
      [...matches]
        .sort((a, b) => +new Date(b.playedAt) - +new Date(a.playedAt))
        .slice(0, 6),
    [matches],
  );

  const imgByLogin = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const e of leaderboard) map.set(e.login, e.imageUrl);
    return map;
  }, [leaderboard]);

  // Joueurs actuellement au cluster (API 42), moi exclu.
  const online = useMemo(
    () => [...locations.entries()].filter(([login]) => login !== myLogin).slice(0, 10),
    [locations, myLogin],
  );

  const todo = [
    {
      key: 'challenges',
      count: incomingChallenges,
      label: t('home.challenges'),
      Icon: Swords,
      color: '#ff5d73',
      to: '/challenges',
    },
    {
      key: 'scores',
      count: scoresToConfirm,
      label: t('home.scores'),
      Icon: ClipboardCheck,
      color: '#2cc3ff',
      to: '/challenges',
    },
    {
      key: 'claims',
      count: claimables,
      label: t('home.claims'),
      Icon: Gift,
      color: '#ffc94a',
      to: '/passe',
    },
  ].filter((item) => item.count > 0);

  const firstName = me?.user?.firstName || myLogin || '';

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div>
        <h1 className="font-gaming text-2xl sm:text-3xl font-extrabold text-text-strong">
          {t('home.greeting')} <span className="text-gold">{firstName}</span> 👋
        </h1>
        <p className="text-sm text-muted-2 mt-0.5">{t('home.sub')}</p>
      </div>

      {/* Bannière saisonnière « Piscine 2026 » */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative rounded-2xl overflow-hidden border border-[#2cc3ff]/40 shadow-[0_0_30px_rgba(44,195,255,0.18)]"
      >
        <img
          src="/season/piscine.webp"
          alt="Saison Piscine 2026"
          draggable={false}
          className="block w-full h-32 sm:h-44 object-cover select-none"
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(90deg, rgba(6,8,12,0.82) 0%, rgba(6,8,12,0.35) 45%, transparent 78%)' }}
        />
        <div className="absolute inset-y-0 left-0 flex flex-col justify-center px-5 sm:px-7">
          <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.24em] text-[#7fe0ff]">
            🏊 Saison en cours
          </span>
          <span className="font-gaming text-xl sm:text-2xl font-black text-white leading-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
            Piscine 2026
          </span>
        </div>
      </motion.div>

      {/* À faire */}
      {todo.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {todo.map((item, i) => (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3, ease: 'easeOut' }}
            >
              <Link
                to={item.to}
                className="flex items-center gap-3 card-hud rounded-2xl px-4 py-3.5 hover:brightness-110 transition-all group"
                style={{ borderColor: `${item.color}44` }}
              >
                <span
                  className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border"
                  style={{ color: item.color, background: `${item.color}14`, borderColor: `${item.color}40` }}
                >
                  <item.Icon className="w-5 h-5" strokeWidth={2.2} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-gaming text-xl font-extrabold tabular-nums leading-none" style={{ color: item.color }}>
                    {item.count}
                  </span>
                  <span className="block text-xs text-muted-2 font-semibold mt-0.5">{item.label}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-2 group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
              </Link>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="card-hud rounded-2xl">
          <EmptyState
            Icon={Swords}
            title={t('home.nothing')}
            hint={t('home.nothing.hint')}
            cta={{ label: t('empty.cta.challenge'), to: '/challenges' }}
            className="py-6"
          />
        </div>
      )}

      {/* Nouveautés à tester — vitrine pleine largeur */}
      <WhatsNewCard />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-start">
        <div className="space-y-4">
          {/* Dispo pour jouer (30 min) */}
          <HotPlayers />

          {/* Tournoi en avant */}
          {featuredTournament && (
            <Link
              to={`/tournaments/${encodeURIComponent(featuredTournament.tour.id)}`}
              className="block card-hud rounded-2xl px-4 py-3.5 hover:brightness-110 transition-all"
              style={{ borderColor: featuredTournament.live ? 'rgba(255,93,115,0.4)' : 'rgba(255,201,74,0.3)' }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border"
                  style={
                    featuredTournament.live
                      ? { color: '#ff5d73', background: '#ff5d7314', borderColor: '#ff5d7340' }
                      : { color: '#ffc94a', background: '#ffc94a14', borderColor: '#ffc94a40' }
                  }
                >
                  <Trophy className="w-5 h-5" strokeWidth={2.2} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-gaming text-sm font-extrabold text-text-strong truncate">
                      {featuredTournament.tour.name}
                    </span>
                    {featuredTournament.live && (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red/15 border border-red/40 text-[#ffb3bf] text-[9px] font-extrabold uppercase tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-red animate-pulse" />
                        {t('home.tournament.live')}
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-muted-2 mt-0.5">
                    {featuredTournament.live
                      ? t('home.tournament.liveHint')
                      : `${t('home.tournament.open')} · ${featuredTournament.tour.entries?.length ?? 0}/${featuredTournament.tour.capacity}`}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-2" strokeWidth={2.5} />
              </div>
            </Link>
          )}

          {/* Mini-quêtes de la semaine (idées d'activités) */}
          <WeeklyIdeasCard />

          {/* Au cluster en ce moment */}
          {online.length > 0 && (
            <div className="card-hud rounded-2xl px-4 py-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <MapPin className="w-4 h-4 text-[#4ade80]" strokeWidth={2.4} />
                <span className="font-gaming text-xs font-extrabold uppercase tracking-[0.14em] text-text-strong">
                  {t('home.cluster')}
                </span>
                <span className="text-[11px] font-extrabold tabular-nums text-[#4ade80]">{online.length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {online.map(([login, host]) => (
                  <PlayerLink
                    key={login}
                    login={login}
                    className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full bg-bg-2/60 border border-border/50 hover:border-[#4ade80]/50 transition-colors"
                  >
                    <span className="relative">
                      <Avatar login={login} imageUrl={imgByLogin.get(login) ?? null} size="xs" />
                      <OnlineBadge host={host} compact className="absolute -bottom-0.5 -right-0.5" />
                    </span>
                    <span className="text-xs font-semibold text-text">{login}</span>
                  </PlayerLink>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Activité récente */}
        <div className="card-hud rounded-2xl px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2.5">
            <Activity className="w-4 h-4 text-gold" strokeWidth={2.4} />
            <span className="font-gaming text-xs font-extrabold uppercase tracking-[0.14em] text-text-strong">
              {t('home.activity')}
            </span>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-2 py-4 text-center">{t('home.activity.empty')}</p>
          ) : (
            <div className="space-y-1.5">
              {recent.map((m) => {
                const gm = m.game ? GAME_META[m.game] : null;
                const winnerLogin =
                  m.winner === 'draw' ? null : m.winner === 'A' ? m.playerALogin : m.playerBLogin;
                const loserLogin =
                  m.winner === 'draw' ? null : m.winner === 'A' ? m.playerBLogin : m.playerALogin;
                const winnerDelta = m.winner === 'A' ? m.deltaA : m.deltaB;
                const upset = winnerLogin != null && winnerDelta >= UPSET_DELTA;
                return (
                  <div key={m.id} className="flex items-center gap-2 py-1">
                    <span
                      className="shrink-0 w-1 h-7 rounded-full"
                      style={{ background: gm?.color ?? '#7d6e54' }}
                      title={gm?.label}
                    />
                    <span className="flex-1 min-w-0 text-[13px] leading-tight">
                      {winnerLogin && loserLogin ? (
                        <>
                          <PlayerLink login={winnerLogin} className="font-bold text-text-strong hover:text-gold">
                            {winnerLogin}
                          </PlayerLink>{' '}
                          <span className="text-muted-2">{t('home.activity.beat')}</span>{' '}
                          <PlayerLink login={loserLogin} className="font-semibold text-muted-2 hover:text-gold">
                            {loserLogin}
                          </PlayerLink>{' '}
                          <span className="tabular-nums text-muted-2">
                            {m.scoreA}–{m.scoreB}
                          </span>
                          {upset && (
                            <span
                              className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-extrabold text-[#ff7a18]"
                              title={`+${winnerDelta} ELO`}
                            >
                              <Flame className="w-3 h-3" strokeWidth={2.6} />
                              UPSET
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-text">{m.playerALogin}</span>{' '}
                          <span className="text-muted-2">·</span>{' '}
                          <span className="font-semibold text-text">{m.playerBLogin}</span>{' '}
                          <span className="text-muted-2">{t('home.activity.draw')}</span>
                        </>
                      )}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted tabular-nums">
                      {fmtRelative(m.playedAt, lang).text}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
