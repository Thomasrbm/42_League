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
  ChevronRight,
  Sparkles,
  Zap,
  TrendingUp,
  PartyPopper,
  ShoppingBag,
  Orbit,
  Medal,
  ChevronsUp,
  Target,
  Coins,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { PlayerLink } from '../components/PlayerLink';
import { useLeagueData } from '../hooks/useLeagueData';
import { api, type StakeMatchDTO } from '../lib/api';
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
    to: '/challenges',
    Icon: Clock,
    color: '#2cc3ff',
    title: 'Cooldown 48h',
    desc: 'Tes défis en attente s’auto-valident passé 48h — fini les défis fantômes qui traînent.',
  },
  {
    to: '/shop/propose',
    Icon: Sparkles,
    color: '#ff5d73',
    title: 'Crée tes cosmétiques',
    desc: 'Propose une bannière ou un titre et gagne coins, XP ou ton nom dessus s’il est retenu.',
  },
  {
    to: '/grades',
    Icon: Medal,
    color: '#ffc94a',
    title: 'Refonte des grades',
    desc: 'Nouveaux paliers resserrés (étain → diamant) et fins de saison revues.',
  },
  {
    to: '/passe',
    Icon: Zap,
    color: '#ff9500',
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
    to: '/profile#taunt-emote',
    Icon: PartyPopper,
    color: '#ff5d73',
    title: 'Émotes de victoire',
    desc: 'Nargue tes victimes après un 1v1 — à choisir sur ton profil.',
  },
];

/** Bandeau très visible « Match à enjeu annoncé » — n'apparaît que s'il existe un
 *  match à enjeu à venir sur lequel parier (auto-rafraîchi). */
function StakeMatchBanner() {
  const [m, setM] = useState<StakeMatchDTO | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .stakeMatches()
        .then((d) => {
          if (!alive) return;
          const soonest =
            d.announced.find((x) => new Date(x.scheduledAt).getTime() > Date.now()) ?? null;
          setM(soonest);
        })
        .catch(() => {});
    void load();
    const iv = setInterval(() => void load(), 20000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);
  if (!m) return null;
  const mins = Math.max(0, Math.floor((new Date(m.scheduledAt).getTime() - Date.now()) / 60000));
  const cd = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Link
        to="/enjeu"
        className="relative block card-hud rounded-2xl px-4 py-3.5 overflow-hidden border !border-gold/50 shadow-gold-glow hover:brightness-110 transition-all"
      >
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{ background: 'radial-gradient(ellipse at top left, rgb(var(--accent-gold) / 0.12), transparent 55%)' }}
        />
        <div className="relative flex items-center gap-3">
          <span className="shrink-0 w-10 h-10 rounded-xl bg-gold/20 border border-gold/50 flex items-center justify-center text-gold animate-pulse">
            <Zap className="w-5 h-5" strokeWidth={2.5} />
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-gold">
              ⚡ Match à enjeu annoncé
            </span>
            <div className="text-sm font-gaming font-black text-text-strong truncate">
              {m.playerA.login} <span className="text-muted-2 font-bold">vs</span> {m.playerB.login}
            </div>
            <div className="text-[11px] text-muted-2 truncate">
              {GAME_META[m.game].label} · cotes ×{m.multA.toFixed(1)} / ×{m.multB.toFixed(1)} · clôture dans {cd}
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-gold text-bg-0 font-extrabold text-[12px] px-3 py-1.5">
            Parier
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

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

      {/* Nouveauté PHARE — mise en avant, plus grosse que les autres. */}
      <Link
        to="/enjeu"
        className="relative block mb-2.5 rounded-xl overflow-hidden border border-gold/60 bg-gradient-to-br from-gold/20 via-bg-2/40 to-bg-2/40 px-4 py-3.5 hover:brightness-110 transition-all group"
      >
        <div className="flex items-center gap-3">
          <span className="shrink-0 w-11 h-11 rounded-xl bg-gold/20 border border-gold/50 flex items-center justify-center text-gold">
            <Zap className="w-6 h-6" strokeWidth={2.4} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2">
              <span className="text-[15px] font-gaming font-black text-text-strong leading-tight">
                Matchs à enjeu
              </span>
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-gold bg-gold/15 border border-gold/50 rounded-full px-2 py-0.5 animate-pulse">
                Nouveau
              </span>
            </span>
            <span className="block text-[12px] text-muted-2 leading-snug mt-0.5">
              Défie un joueur, misez gros chacun, et toute la ligue parie sur vous — grosse cote à la clé.
              1 match à enjeu par jour.
            </span>
          </span>
          <ChevronRight
            className="shrink-0 w-5 h-5 text-gold group-hover:translate-x-0.5 transition-all"
            strokeWidth={2.5}
          />
        </div>
      </Link>

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
  const { me, challenges, pending, tournaments, matches, leaderboard } = useLeagueData();
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
          className="block w-full h-52 sm:h-72 lg:h-80 object-cover object-center select-none"
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
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.07, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                to={item.to}
                className="group relative flex items-center gap-3 rounded-2xl px-4 py-3.5 overflow-hidden transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97]"
                style={{
                  background: `radial-gradient(120% 130% at 0% 0%, ${item.color}30 0%, ${item.color}12 45%, rgba(14,16,22,0.9) 100%)`,
                  border: `1.5px solid ${item.color}66`,
                  boxShadow: `0 0 22px -6px ${item.color}88, inset 0 1px 0 ${item.color}33`,
                }}
              >
                {/* Reflet qui balaie au survol */}
                <span
                  className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out"
                  style={{ background: `linear-gradient(105deg, transparent 35%, ${item.color}44 50%, transparent 65%)` }}
                />
                <span
                  className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border transition-transform duration-150 group-hover:scale-110 group-hover:-rotate-6"
                  style={{ color: item.color, background: `${item.color}22`, borderColor: `${item.color}66`, boxShadow: `0 0 16px -4px ${item.color}` }}
                >
                  <item.Icon className="w-5 h-5" strokeWidth={2.4} />
                </span>
                <span className="flex-1 min-w-0 relative">
                  <span
                    className="block font-gaming text-2xl font-black tabular-nums leading-none"
                    style={{ color: item.color, textShadow: `0 0 18px ${item.color}88` }}
                  >
                    {item.count}
                  </span>
                  <span className="block text-xs text-text font-bold mt-0.5">{item.label}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-text-strong/70 group-hover:translate-x-1 transition-transform relative" strokeWidth={2.6} />
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
      <StakeMatchBanner />

      <WhatsNewCard />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-start">
        <div className="space-y-4">
          {/* Tournoi en avant */}
          {featuredTournament &&
            (featuredTournament.live ? (
              /* EN COURS : carte agrandie, gros bouton « Parier » + prime gambler. */
              <div
                className="card-hud rounded-2xl p-5 space-y-4"
                style={{
                  borderColor: 'rgba(255,93,115,0.45)',
                  background: 'linear-gradient(180deg, rgba(255,93,115,0.07), transparent 70%)',
                }}
              >
                <Link
                  to={`/tournaments/${encodeURIComponent(featuredTournament.tour.id)}`}
                  className="flex items-center gap-3.5 group"
                >
                  <span
                    className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center border"
                    style={{ color: '#ff5d73', background: '#ff5d7314', borderColor: '#ff5d7340' }}
                  >
                    <Trophy className="w-7 h-7" strokeWidth={2.2} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-gaming text-lg font-black text-text-strong truncate group-hover:text-white transition-colors">
                        {featuredTournament.tour.name}
                      </span>
                      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red/15 border border-red/40 text-[#ffb3bf] text-[10px] font-extrabold uppercase tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-red animate-pulse" />
                        {t('home.tournament.live')}
                      </span>
                    </span>
                    <span className="block text-[13px] text-muted-2 mt-1">
                      {t('home.tournament.betLive')}
                    </span>
                  </span>
                </Link>
                <Link
                  to={`/tournaments/${encodeURIComponent(featuredTournament.tour.id)}?tab=bets`}
                  className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-gold text-black font-gaming font-black text-base uppercase tracking-[0.14em] hover:brightness-110 transition-all shadow-[0_0_24px_rgba(255,201,74,0.25)]"
                >
                  <Coins className="w-5 h-5" strokeWidth={2.4} />
                  {t('home.tournament.bet')}
                </Link>
                <p className="text-center text-[12px] font-bold text-gold/90">
                  {t('home.tournament.gamblerBonus')}
                </p>
              </div>
            ) : (
              /* INSCRIPTIONS : carte compacte. */
              <Link
                to={`/tournaments/${encodeURIComponent(featuredTournament.tour.id)}`}
                className="block card-hud rounded-2xl px-4 py-3.5 hover:brightness-110 transition-all"
                style={{ borderColor: 'rgba(255,201,74,0.3)' }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border"
                    style={{ color: '#ffc94a', background: '#ffc94a14', borderColor: '#ffc94a40' }}
                  >
                    <Trophy className="w-5 h-5" strokeWidth={2.2} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="font-gaming text-sm font-extrabold text-text-strong truncate block">
                      {featuredTournament.tour.name}
                    </span>
                    <span className="block text-[11px] text-muted-2 mt-0.5">
                      {`${t('home.tournament.open')} · ${featuredTournament.tour.entries?.length ?? 0}/${featuredTournament.tour.capacity}`}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-2" strokeWidth={2.5} />
                </div>
              </Link>
            ))}

          {/* Mini-quêtes de la semaine (idées d'activités) */}
          <WeeklyIdeasCard />
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
            <div className="space-y-1">
              {recent.map((m) => {
                const gm = m.game ? GAME_META[m.game] : null;
                const winnerLogin =
                  m.winner === 'draw' ? null : m.winner === 'A' ? m.playerALogin : m.playerBLogin;
                const loserLogin =
                  m.winner === 'draw' ? null : m.winner === 'A' ? m.playerBLogin : m.playerALogin;
                const winnerDelta = m.winner === 'A' ? m.deltaA : m.deltaB;
                const upset = winnerLogin != null && winnerDelta >= UPSET_DELTA;
                return (
                  <div key={m.id} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
                    {/* Pastille du jeu : logo + accent de couleur */}
                    <span
                      className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border"
                      style={{ background: gm ? gm.bgColor : 'rgba(125,110,84,0.12)', borderColor: gm ? gm.borderColor : 'rgba(125,110,84,0.4)' }}
                      title={gm?.label}
                    >
                      {gm ? gm.icon(true, 18) : <Swords className="w-4 h-4 text-muted-2" strokeWidth={2.2} />}
                    </span>

                    {winnerLogin && loserLogin ? (
                      <div className="flex-1 min-w-0 flex items-center gap-1.5 text-[13px] leading-tight flex-wrap">
                        <PlayerLink login={winnerLogin} className="flex items-center gap-1 font-bold text-text-strong hover:text-gold">
                          <Avatar login={winnerLogin} imageUrl={imgByLogin.get(winnerLogin) ?? null} size="xs" />
                          <span className="truncate max-w-[92px]">{winnerLogin}</span>
                        </PlayerLink>
                        <span className="text-muted-2 shrink-0">{t('home.activity.beat')}</span>
                        <PlayerLink login={loserLogin} className="flex items-center gap-1 font-semibold text-muted-2 hover:text-gold">
                          <Avatar login={loserLogin} imageUrl={imgByLogin.get(loserLogin) ?? null} size="xs" />
                          <span className="truncate max-w-[92px]">{loserLogin}</span>
                        </PlayerLink>
                        <span className="tabular-nums text-muted-2 shrink-0">
                          {m.scoreA}–{m.scoreB}
                        </span>
                        {upset && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-[#ff7a18] shrink-0"
                            title={`+${winnerDelta} ELO`}
                          >
                            <Flame className="w-3 h-3" strokeWidth={2.6} />
                            UPSET
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0 flex items-center gap-1.5 text-[13px] leading-tight flex-wrap">
                        <PlayerLink login={m.playerALogin} className="flex items-center gap-1 font-semibold text-text hover:text-gold">
                          <Avatar login={m.playerALogin} imageUrl={imgByLogin.get(m.playerALogin) ?? null} size="xs" />
                          <span className="truncate max-w-[92px]">{m.playerALogin}</span>
                        </PlayerLink>
                        <span className="text-muted-2 shrink-0">{t('home.activity.draw')}</span>
                        <PlayerLink login={m.playerBLogin} className="flex items-center gap-1 font-semibold text-text hover:text-gold">
                          <Avatar login={m.playerBLogin} imageUrl={imgByLogin.get(m.playerBLogin) ?? null} size="xs" />
                          <span className="truncate max-w-[92px]">{m.playerBLogin}</span>
                        </PlayerLink>
                      </div>
                    )}
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
