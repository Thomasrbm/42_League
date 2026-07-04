import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Crown } from 'lucide-react';
import { EloBoostBadge } from '../../components/EloBoost';
import { HeroCardFrame } from '../../components/HeroCardFrame';
import { useProfileFx } from '../../hooks/useProfileFx';
import { Panel } from '../../components/Panel';
import { Avatar } from '../../components/Avatar';
import { StatCard } from '../../components/StatCard';
import { RankBadge } from '../../components/RankBadge';
import { BadgesRow } from '../../components/Badges';
import { Palmares } from '../../components/Palmares';
import { EloChart } from '../../components/EloChart';
import { PlayerLink } from '../../components/PlayerLink';
import { ProfilHistory } from './shared/ProfilHistory';
import { displayTitle } from '../../lib/cosmeticTitles';
import { TitlePicker } from '../../components/TitlePicker';
import { BannerPicker } from '../../components/BannerPicker';
import { FollowLists } from '../../components/FollowLists';
import { TournamentCup } from '../../components/TournamentCup';
import { SmashTrophy } from '../../components/SmashTrophy';
import { ChessTrophy } from '../../components/ChessTrophy';
import { FavoriteCharsRow } from '../../components/FavoriteCharsRow';
import { FavoriteCharsEditor } from '../../components/FavoriteCharsEditor';
import { favoritesForGame, type FightingGame } from '../../lib/chars';
import { XpBar } from '../../components/XpBar';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useGameMode } from '../../hooks/useGameMode';
import { useI18n, useT } from '../../lib/i18n';
import { fmtCountdown } from '../../lib/format';
import { pickRating } from '../../lib/gameStats';
import { OPS_FORCED_MATCHES } from '../../lib/api';

/**
 * Vue desktop du profil — version dense en infos avec stat cards.
 * Identique à l'ancienne ProfilPage, juste déplacée pour le Split View.
 */
export function ProfilDesktop() {
  const t = useT();
  const { locale } = useI18n();
  const { me, matches, playedDarts, opsMe, leaderboard, tournaments, refresh } = useLeagueData();
  const { game, isSmash } = useGameMode();
  const [editGame, setEditGame] = useState<FightingGame | null>(null);

  const stats = useMemo(() => {
    const meUser = me?.user;
    const myLogin = me?.login;
    const my = matches.filter(
      (m) =>
        (m.game ?? 'babyfoot') === game &&
        // Le 2v2 babyfoot a son propre ELO/historique : il n'entre PAS dans les
        // stats 1v1 de la discipline (catégorie à part, cf. ProfilHistory).
        m.mode !== '2v2' &&
        (m.playerALogin === myLogin || m.playerBLogin === myLogin),
    );
    const wins = my.filter((m) => {
      const youAreA = m.playerALogin === myLogin;
      return (youAreA && m.winner === 'A') || (!youAreA && m.winner === 'B');
    }).length;
    const draws = my.filter((m) => m.winner === 'draw').length;
    const total = my.length;
    // Win-rate sur les parties décisives (les nulles n'y entrent pas).
    const decisive = total - draws;
    const winRate = decisive === 0 ? 0 : Math.round((wins / decisive) * 100);
    const moves = my
      .filter((m) => m.countedForElo)
      .map((m) => (m.playerALogin === myLogin ? m.deltaA : m.deltaB));
    const totalDelta = moves.reduce((s, d) => s + d, 0);
    // Tournois remportés du mode courant (la liste `tournaments` est déjà filtrée
    // par discipline), séparés amicaux / officiels (coupe rouge = officiel).
    let officialTitles = 0;
    let friendlyTitles = 0;
    for (const tour of tournaments) {
      if (tour.status !== 'finished' || tour.winnerLogin !== myLogin) continue;
      if (tour.kind === 'official') officialTitles++;
      else friendlyTitles++;
    }
    const rating = meUser ? pickRating(meUser, game) : { elo: 1000, matchesPlayed: 0 };
    return {
      elo: rating.elo,
      matchesPlayed: rating.matchesPlayed,
      total,
      wins,
      draws,
      losses: total - wins - draws,
      winRate,
      totalDelta,
      officialTitles,
      friendlyTitles,
    };
  }, [me, matches, tournaments, game, isSmash]);

  if (!me?.user) {
    return (
      <Panel title={t('panel.profil.title')}>
        <div className="text-center text-muted-2 py-10">{t('profil.unavailable')}</div>
      </Panel>
    );
  }

  const u = me.user;
  // Effet cosmétique (boost ELO « EN FEU » / Apôtre de Sheldon) — alimente le
  // cadre, l'aura et le badge de la carte profil. Dérivé une seule fois.
  const boostUntil = u.eloMultUntil ?? null;
  const fx = useProfileFx({ title: u.title, eloMultUntil: boostUntil });
  const { boosted, sheldon: isSheldon } = fx;
  // Cosmétiques équipés (boutique) — profil perso.
  const titleColor = me.titleColor ?? null;
  // Titre équipé : null si aucun → « sans éclat. » GRISÉ (état NONE), pas en or.
  const equippedTitle = displayTitle(u.login, u.title, null);
  const isTarnished = !equippedTitle;
  const titleLabel = equippedTitle ?? t('profil.title.tarnished');
  const effectiveTitleColor = isTarnished ? null : titleColor;
  const equippedBadge = me.equippedBadge ?? null;
  const equippedBanner = me.equippedBanner ?? null;
  // Jeux de combat où je suis inscrit → afficher/éditer mes persos favoris.
  const fightingGames = (['smash', 'streetfighter'] as const).filter((g) =>
    (u.games ?? ['babyfoot']).includes(g),
  );
  const myEntry = leaderboard.find((x) => x.login === u.login);
  const myRank = myEntry?.rank ?? 0;
  const isTop1 = myRank === 1;
  // Prénom + nom depuis l'intra. Fallback login si absent.
  const realName =
    [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
    [myEntry?.firstName, myEntry?.lastName].filter(Boolean).join(' ').trim();

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      <Panel title={t('panel.profil.title')} sub={t('panel.profil.sub')} accent="user">
      {/* Hero : avatar · identité · bloc ELO — fond doré + halo holographique animé.
          NB carte desktop : la bordure est une CLASSE Tailwind (pas fx.frame) et
          l'ombre un inline keyé par effet ; gradient 3-arrêts (`flat`), conic sans
          couche compositeur, unique filet laiton en haut, ni grille HUD ni shimmer. */}
      <HeroCardFrame
        fx={fx}
        radius="rounded-2xl"
        className="mb-6"
        gradient="flat"
        neutralBorderClass="border-gold/35"
        effectBorderClass={{ sheldon: 'border-green-500/70', boost: 'border-orange-500/70' }}
        neutralBoxShadow="inset 0 1px 0 rgba(255,215,120,0.15), inset 0 -1px 0 rgba(0,0,0,0.5), 0 12px 32px -12px rgba(255,201,74,0.25)"
        effectBoxShadow={{
          sheldon:
            'inset 0 1px 0 rgba(57,255,20,0.18), inset 0 -1px 0 rgba(0,0,0,0.6), 0 12px 40px -8px rgba(57,255,20,0.35)',
          boost:
            'inset 0 1px 0 rgba(255,140,60,0.25), inset 0 -1px 0 rgba(0,0,0,0.6), 0 12px 40px -8px rgba(255,80,20,0.45)',
        }}
        // Conic desktop : opacité 0.20, 32 s, flou 48 px, SANS couche compositeur.
        conic={{ opacity: 0.2, duration: 32, blur: 48, gpu: false }}
        // Filet laiton unique en haut (dégradé), pas de tuyaux haut+bas.
        brass={{ variant: 'hairline' }}
        hudGrid={false}
        // Bannière équipée (boutique) = fond de la carte + voile sombre.
        banner={
          equippedBanner ? (
            <>
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none scale-105"
                style={{
                  backgroundImage: `url(${equippedBanner})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  // Léger flou + désaturation : la bannière reste reconnaissable mais
                  // ses détails ne « mangent » plus le texte par-dessus.
                  filter: 'blur(2px) saturate(0.85)',
                }}
              />
              {/* Voile lisibilité : assombrissement global + dégradé renforcé en haut
                  (titre) et en bas (stats) → contraste garanti du texte. */}
              <div aria-hidden className="absolute inset-0 pointer-events-none bg-black/60" />
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 35%, rgba(0,0,0,0.2) 65%, rgba(0,0,0,0.6) 100%)',
                }}
              />
            </>
          ) : null
        }
      >
        {/* Titre équipé — bannière dorée centrée en HAUT de la carte. Par défaut
            « sans éclat. » quand aucun titre n'est équipé. Le sélecteur (cette vue
            est toujours soi) est une simple flèche à droite. */}
        <div className="relative z-10 pt-3.5 pb-1 flex items-center justify-center px-5">
          <span
            className="inline-flex items-center gap-1.5 max-w-[80%]"
            style={isTarnished ? undefined : { color: effectiveTitleColor ?? '#ffc94a' }}
          >
            <span className={`text-lg leading-none opacity-70 ${isTarnished ? 'text-muted-2' : ''}`}>❝</span>
            <span className={`italic text-lg font-bold tracking-wide truncate ${isTarnished ? 'text-muted-2' : ''}`}>
              {titleLabel}
            </span>
            <span className={`text-lg leading-none opacity-70 ${isTarnished ? 'text-muted-2' : ''}`}>❞</span>
          </span>
          <BannerPicker className="absolute left-5" />
          <TitlePicker className="absolute right-5" />
        </div>

        <div className="relative z-10 p-5 pt-3 flex items-center gap-5">
          {/* Avatar + glow + dot présence */}
          <div className="relative flex-shrink-0">
            <div
              className="absolute -inset-1.5 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(255,201,74,0.4) 0%, transparent 70%)', filter: 'blur(12px)' }}
            />
            <Avatar
              login={u.login}
              imageUrl={u.imageUrl}
              size="xl"
              className="relative ring-2 ring-gold/45 ring-offset-2 ring-offset-bg-2"
              // La carte porte déjà l'aura complète → pas de double effet sur la PP.
              fx={false}
            />
          </div>

          {/* Identité */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="font-display text-3xl font-black text-text-strong truncate tracking-tight min-w-0">
                {realName ?? <span className="font-mono text-2xl font-bold text-muted-2">@{u.login}</span>}
              </div>
              {((me.badges && me.badges.length > 0) || equippedBadge || (me.customBadges?.length ?? 0) > 0) && (
                <div className="flex-shrink-0">
                  <BadgesRow
                    codes={me.badges ?? []}
                    extra={[...(equippedBadge ? [equippedBadge] : []), ...(me.customBadges ?? [])]}
                    size="md"
                  />
                </div>
              )}
            </div>
            {realName && <div className="text-xs text-muted-2 font-mono truncate">@{u.login}</div>}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-2 font-bold uppercase tracking-wider bg-bg-1/80 border border-border/60 rounded-full px-2.5 py-1">
                <MapPin className="w-3 h-3 text-gold/70" strokeWidth={2.5} />
                {u.campus ?? '—'}
              </span>
              {myRank > 0 && (
                <motion.span
                  initial={{ scale: 0, rotate: -15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.25 }}
                  className={`inline-flex items-center gap-1 font-mono text-[11px] font-extrabold tabular-nums rounded-full px-2.5 py-1 ${
                    isTop1 ? 'metal-plate-gold shadow-gold-glow' : 'bg-bg-1/80 text-gold border border-gold/40'
                  }`}
                >
                  {isTop1 && <Crown className="w-3 h-3" strokeWidth={2.5} />}#{myRank}
                </motion.span>
              )}
            </div>
          </div>

          {/* Bloc ELO mis en valeur — libellé "ELO" centré au-dessus du nombre. */}
          <div className="text-center flex-shrink-0 pl-2">
            <div className="mb-1 flex items-center justify-center gap-1.5 text-[10px] text-muted uppercase tracking-[0.28em] font-extrabold">
              ELO
              <RankBadge elo={stats.elo} rank={myRank} size="xs" asLink />
            </div>
            <div
              className="font-display text-[2.75rem] leading-none font-black tabular-nums"
              style={boosted
                ? { color: '#ffb347', textShadow: '0 1px 0 rgba(0,0,0,0.6), 0 0 24px rgba(255,120,24,0.7)' }
                : { textShadow: '0 1px 0 rgba(0,0,0,0.6), 0 0 18px rgba(255,201,74,0.35)' }
              }
            >
              {stats.elo}
            </div>
            {boosted && !isSheldon && <EloBoostBadge until={boostUntil} className="mt-1.5" />}
          </div>
        </div>
      </HeroCardFrame>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <StatCard value={String(stats.elo)} label={t('profil.elo')} tone="teal" />
        <StatCard value={String(stats.matchesPlayed)} label={t('profil.matchesElo')} tone="teal" />
        <StatCard
          value={`${stats.winRate}%`}
          label={t('profil.winRate')}
          tone={stats.winRate >= 50 ? 'win' : 'loss'}
        />
        <StatCard
          value={`${stats.totalDelta >= 0 ? '+' : ''}${stats.totalDelta}`}
          label={t('profil.delta')}
          tone={stats.totalDelta >= 0 ? 'win' : 'loss'}
        />
      </div>

      <div className="space-y-1.5 card-hud rounded-xl px-4 py-3">
        <KV label={t('profil.wins')} value={String(stats.wins)} tone="win" />
        <KV label={t('profil.losses')} value={String(stats.losses)} tone="loss" />
      </div>

      {/* Passe de combat : niveau + barre d'XP + accès à la page /passe */}
      {typeof me.level === 'number' && (
        <div className="mt-4">
          <XpBar
            level={me.level}
            xpIntoLevel={me.xpIntoLevel ?? 0}
            xpForNextLevel={me.xpForNextLevel ?? 0}
          />
        </div>
      )}

      {/* Tournois remportés — amicaux vs officiels (coupe rouge = officiel). */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <TitlesCard
          label={t('profil.officialTitlesWon')}
          value={stats.officialTitles}
          accent="#ff6b6b"
          game={game}
        />
        <TitlesCard
          label={t('profil.friendlyTitlesWon')}
          value={stats.friendlyTitles}
          accent={isSmash ? '#ff4d5c' : game === 'streetfighter' ? '#ff7a18' : game === 'chess' ? '#56c46e' : '#ffc94a'}
          game={game}
        />
      </div>

      {/* Persos favoris — un gros rond logo par jeu de combat (clic = sélecteur). */}
      {fightingGames.length > 0 && (
        <div className="mt-4 card-hud rounded-xl px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.14em] font-extrabold text-muted-2 mb-2 text-center">
            {t('favorites.label')}
          </div>
          <div className="flex items-center justify-center gap-5">
            {fightingGames.map((g) => (
              <FavoriteCharsRow key={g} game={g} ids={favoritesForGame(u, g)} onEdit={() => setEditGame(g)} />
            ))}
          </div>
        </div>
      )}

      {/* Following / Followers (style GitHub) */}
      <div className="mt-4">
        <FollowLists />
      </div>

      {/* Inventaire : déplacé dans la Boutique (onglet Inventaire). */}

      {/* Mes Équipes 2v2 — retiré du desktop (visible sur mobile uniquement) */}

      </Panel>

      <Panel title={t('profil.evolutionRivalry')} sub={t('profil.evolutionRivalrySub')}>
      {/* ELO progression chart */}
      <div className="mb-6 card-hud rounded-xl px-4 pt-3 pb-4 border-gold/20">
        <div className="font-gaming text-[10px] uppercase tracking-[0.18em] text-gold/80 font-extrabold mb-3 flex items-center gap-2">
          <span className="inline-block w-1 h-2.5 bg-gradient-to-b from-gold/80 to-gold-dim/80 rounded-sm" />
          {t('profil.eloEvolution')}
          <div className="flex-1 h-px bg-gradient-to-r from-gold/20 to-transparent ml-1" />
        </div>
        <EloChart
          matches={matches}
          myLogin={u.login}
          currentElo={stats.elo}
          game={game}
          height={240}
        />
      </div>

      {me.palmares && me.palmares.length > 0 && (
        <div className="mb-6">
          <Palmares entries={me.palmares} />
        </div>
      )}

      <OpsWidget opsMe={opsMe} locale={locale} t={t} />

      {/* Historique récent — filtrable par mode (Tous + disciplines jouées),
          rendu partagé avec le profil mobile et la fiche des autres joueurs. */}
      <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-text-strong mb-3 mt-6">
        {t('profil.recent')}
      </div>
      <ProfilHistory login={u.login} matches={matches} darts={playedDarts} user={u} limit={20} />
      </Panel>

      {editGame && (
        <FavoriteCharsEditor
          games={[editGame]}
          initial={{ [editGame]: favoritesForGame(u, editGame) }}
          onClose={() => setEditGame(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function TitlesCard({
  label,
  value,
  accent,
  game,
}: {
  label: string;
  value: number;
  accent: string;
  game: 'babyfoot' | 'smash' | 'chess' | 'streetfighter' | 'flechettes';
}) {
  return (
    <div className="card-hud rounded-xl px-3 py-2.5 flex items-center gap-2.5">
      {game === 'smash' || game === 'streetfighter' ? (
        <SmashTrophy accent={accent} className="w-9 h-9 shrink-0" />
      ) : game === 'chess' ? (
        <ChessTrophy accent={accent} className="w-9 h-9 shrink-0" />
      ) : (
        <TournamentCup accent={accent} className="w-9 h-9 shrink-0" />
      )}
      <div className="min-w-0">
        <div className="font-display text-2xl font-black tabular-nums leading-none" style={{ color: accent }}>
          {value}
        </div>
        <div className="text-[9px] uppercase tracking-wider text-muted-2 font-bold mt-0.5 leading-tight">
          {label}
        </div>
      </div>
    </div>
  );
}

function KV({ label, value, tone }: { label: string; value: string; tone: 'win' | 'loss' }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-gold/10 last:border-0 pb-1.5 last:pb-0">
      <span className="text-muted-2 font-medium uppercase tracking-wider text-xs">{label}</span>
      <span className={`font-display font-extrabold tabular-nums ${tone === 'win' ? 'text-gold' : 'text-red'}`}>
        {value}
      </span>
    </div>
  );
}

interface OpsWidgetProps {
  opsMe: ReturnType<typeof useLeagueData>['opsMe'];
  locale: string;
  t: (key: string) => string;
}

function OpsWidget({ opsMe, locale, t }: OpsWidgetProps) {
  return (
    <div className="mt-4 card-hud rounded-xl p-4 border-red/45">
      <div className="font-gaming flex items-center gap-2 mb-3 text-red font-extrabold text-xs uppercase tracking-[0.16em]">
        <span className="inline-block w-1 h-3 bg-red rounded-sm" />
        <span className="text-base">☠</span>
        <span>{t('profil.opsTitle')}</span>
      </div>

      {!opsMe && (
        <div className="text-sm text-muted-2">
          {t('profil.opsHint')}
        </div>
      )}

      {opsMe?.current && (
        <PlayerLink login={opsMe.current.targetLogin} className="block">
          <div className="flex items-center gap-3">
            <Avatar
              login={opsMe.current.target?.login ?? opsMe.current.targetLogin}
              imageUrl={opsMe.current.target?.imageUrl ?? null}
              size="md"
            />
            <div className="min-w-0">
              <div className="font-extrabold text-text-strong">{opsMe.current.targetLogin}</div>
              <div className="text-[11px] text-muted-2">
                {t('profil.opsHuntsUntil')}{' '}
                {new Date(opsMe.current.expiresAt).toLocaleDateString(locale)} ·{' '}
                {fmtCountdown(opsMe.current.expiresAt)} {t('profil.opsRemaining')}
              </div>
              {/* Quota de matchs forcés restant à imposer à la cible (sur 3). */}
              <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gold/15 border border-gold/30 text-[10px] font-extrabold uppercase tracking-wider text-gold tabular-nums">
                ⚔ {t('profil.opsForcedLeft')
                  .replace('{n}', String(Math.max(0, OPS_FORCED_MATCHES - (opsMe.current.forcedUsed ?? 0))))
                  .replace('{max}', String(OPS_FORCED_MATCHES))}
              </div>
            </div>
          </div>
        </PlayerLink>
      )}

      {!opsMe?.current && opsMe?.canDeclareAt && (
        <div className="text-sm text-muted-2">
          {t('profil.opsCooldown')} {fmtCountdown(opsMe.canDeclareAt)}
        </div>
      )}

      {opsMe?.targetedBy && (
        <>
          <div className="text-[10px] text-muted-2 uppercase tracking-wider mt-3 mb-1.5">
            {t('profil.opsTargetedBy')}
          </div>
          <PlayerLink login={opsMe.targetedBy.ownerLogin} className="block">
            <div className="flex items-center gap-3">
              <Avatar
                login={opsMe.targetedBy.owner?.login ?? opsMe.targetedBy.ownerLogin}
                imageUrl={opsMe.targetedBy.owner?.imageUrl ?? null}
                size="md"
              />
              <div className="min-w-0">
                <div className="font-extrabold text-text-strong">{opsMe.targetedBy.ownerLogin}</div>
                <div className="text-[11px] text-muted-2">
                  {t('profil.opsHuntsYou')} {fmtCountdown(opsMe.targetedBy.expiresAt)}
                </div>
              </div>
            </div>
          </PlayerLink>
        </>
      )}
    </div>
  );
}
