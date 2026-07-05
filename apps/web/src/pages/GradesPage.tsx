import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Crown } from 'lucide-react';
import {
  RANK_TIERS,
  rankTier,
  rankTierForRank,
  GRANDMASTER,
  GRANDMASTER_TOP_N,
  GRANDMASTER_MIN_ELO,
  type RankTier,
  type RankTierKey,
} from '@42-league/shared';
import { Avatar } from '../components/Avatar';
import { TierEmblem } from '../components/TierEmblem';
import { tierImage } from '../lib/tierImages';
import { useLeagueData } from '../hooks/useLeagueData';
import type { LeaderboardEntry } from '../lib/api';

// ─── Constantes de mise en page ────────────────────────────────────────────────

/** ELO de départ de la frise (un peu avant Étain pour respirer). */
const TRACK_MIN = 850;
/**
 * Part horizontale réservée au barème ELO. Les (100 − x)% de droite forment la
 * bande terminale « Grand Master » (positionnelle : top N de la discipline, hors
 * ELO) — posée à la suite des paliers, dans leur continuité.
 */
const ELO_SPAN_PCT = 85;
/** Deux joueurs à ≤ N ELO d'écart sont regroupés dans une même colonne. */
const CLUSTER_RADIUS = 18;
/** Avatars empilés (superposés) avant le badge "+N". Le reste se lit au survol. */
const MAX_PER_COL = 3;

/** Couleur du palier Diamant (prérequis Grand Master), pour le texte d'info. */
const DIAMANT_COLOR = RANK_TIERS.find((t) => t.key === 'diamant')?.color ?? '#5fd0e0';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Emblème (blason) du palier, cadré rond — cf. `public/<tier>.png`. */
function TierIcon({
  tierKey,
  label,
  className,
  style,
}: {
  tierKey: RankTierKey;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={tierImage(tierKey)}
      alt={label ?? ''}
      loading="lazy"
      draggable={false}
      className={`rounded-full object-cover select-none ${className ?? ''}`}
      style={style}
    />
  );
}

function fullName(e: { firstName?: string | null; lastName?: string | null; login: string }) {
  const n = [e.firstName, e.lastName].filter(Boolean).join(' ').trim();
  return n || e.login;
}

interface Cluster {
  center: number;
  pct: number;
  entries: LeaderboardEntry[];
}

function buildClusters(entries: LeaderboardEntry[], toPct: (elo: number) => number): Cluster[] {
  if (!entries.length) return [];
  const sorted = [...entries].sort((a, b) => a.elo - b.elo);
  const groups: LeaderboardEntry[][] = [];
  for (const entry of sorted) {
    const last = groups[groups.length - 1];
    const tail = last?.[last.length - 1];
    if (last && tail && entry.elo - tail.elo <= CLUSTER_RADIUS) last.push(entry);
    else groups.push([entry]);
  }
  return groups.map((g) => {
    const center = g.reduce((s, e) => s + e.elo, 0) / g.length;
    return { center, pct: toPct(center), entries: g };
  });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function GradesPage() {
  const navigate = useNavigate();
  const { leaderboard, me } = useLeagueData();
  const myLogin = me?.login;

  const trackMax = useMemo(
    () => Math.max(leaderboard.reduce((m, e) => Math.max(m, e.elo), 1500) + 120, 1520),
    [leaderboard],
  );

  const toPct = useMemo(
    () => (elo: number) =>
      Math.max(0, Math.min(ELO_SPAN_PCT, ((elo - TRACK_MIN) / (trackMax - TRACK_MIN)) * ELO_SPAN_PCT)),
    [trackMax],
  );

  const clusters = useMemo(() => buildClusters(leaderboard, toPct), [leaderboard, toPct]);

  // Nombre de joueurs par palier.
  const countByTier = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of leaderboard) {
      const k = rankTier(e.elo).key;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [leaderboard]);

  const champion = leaderboard.find((e) => e.rank === 1) ?? null;

  // Grand Master : grade POSITIONNEL (top N de la discipline) superposé au barème
  // ELO, MAIS réservé aux joueurs déjà Diamant — on compte donc les vrais éligibles.
  const gmCount = leaderboard.filter(
    (e) => rankTierForRank(e.elo, e.rank).key === 'grandmaster',
  ).length;

  // Mon standing.
  const myEntry = leaderboard.find((e) => e.login === myLogin) ?? null;
  const isGm = !!myEntry && rankTierForRank(myEntry.elo, myEntry.rank).key === 'grandmaster';
  const myTier = myEntry ? rankTier(myEntry.elo) : null;
  const nextTier = myEntry ? RANK_TIERS.find((t) => t.min > myEntry.elo) ?? null : null;
  const ptsToNext = nextTier && myEntry ? nextTier.min - myEntry.elo : null;
  const tierProgress =
    myEntry && nextTier && myTier
      ? Math.min(100, Math.max(2, ((myEntry.elo - myTier.min) / (nextTier.min - myTier.min)) * 100))
      : null;

  // Segments de la frise : un par palier ELO, PUIS la bande terminale Grand Master
  // (top N de la discipline) posée à la suite, dans la continuité des autres.
  const segments = [
    ...RANK_TIERS.map((tier, i) => {
      const nextMin = RANK_TIERS[i + 1]?.min ?? trackMax;
      const left = toPct(Math.max(tier.min, TRACK_MIN));
      const right = toPct(Math.min(nextMin, trackMax));
      return { tier, left, width: right - left, isLast: false };
    }),
    { tier: GRANDMASTER, left: ELO_SPAN_PCT, width: 100 - ELO_SPAN_PCT, isLast: true },
  ];

  // Bornes ELO affichées sous la frise (début + chaque changement de palier).
  const boundaries = [
    { elo: TRACK_MIN, color: RANK_TIERS[0]?.color ?? '#9aa4ad' },
    ...RANK_TIERS.slice(1).map((t) => ({ elo: t.min, color: t.color })),
  ];

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      {/* ─── Hero : Mon grade ─────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-3xl card-hud"
      >
        {/* Halo radial + rayons soleil */}
        <div
          className="absolute inset-x-0 top-0 h-56 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 80% at 50% 0%, rgba(255,201,74,0.22), transparent 65%)' }}
        />
        <div aria-hidden className="absolute inset-0 hud-grid opacity-40 pointer-events-none" />

        <div className="relative p-5 sm:p-6">
          {/* En-tête : retour + titre */}
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-2 hover:text-gold hover:bg-gold/10 transition-colors flex-shrink-0"
              aria-label="Retour"
            >
              <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
            </button>
            <span className="inline-block w-1 h-4 bg-gradient-to-b from-gold via-gold to-gold-dim rounded-sm" />
            <div className="min-w-0">
              <h1 className="font-gaming text-base sm:text-lg font-extrabold uppercase tracking-[0.16em] text-text-strong leading-none">
                Frise des grades
              </h1>
              <div className="text-[10px] text-muted font-bold uppercase tracking-[0.14em] mt-1">
                {leaderboard.length} joueur{leaderboard.length !== 1 ? 's' : ''} classé{leaderboard.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Mon standing */}
          {myEntry && myTier ? (
            (() => {
            // Grade affiché dans la pastille de la pp : Grand Master (positionnel) prime sur l'ELO.
            const displayTier = isGm ? GRANDMASTER : myTier;
            return (
            <div className="flex items-center gap-4 sm:gap-6 flex-wrap sm:flex-nowrap">
              {/* Avatar + anneau du palier */}
              <div className="relative flex-shrink-0">
                <div
                  className="absolute -inset-2 rounded-full pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${myTier.color}55 0%, transparent 70%)`, filter: 'blur(10px)' }}
                />
                <div className="relative rounded-full p-[3px]" style={{ background: `linear-gradient(135deg, ${myTier.color}, ${myTier.color}55)` }}>
                  <Avatar login={myEntry.login} imageUrl={myEntry.imageUrl} size="lg" className="ring-2 ring-bg-1" />
                </div>
                {/* Pastille palier — Grand Master abrégé en « GM » pour tenir dans la case */}
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full font-gaming text-[9px] font-extrabold uppercase tracking-wider whitespace-nowrap ring-2 ring-bg-1 max-w-[120%]"
                  style={{ background: displayTier.color, color: '#0f141c' }}
                >
                  <TierIcon tierKey={displayTier.key} label={displayTier.label} className="w-3 h-3 flex-shrink-0 ring-1 ring-black/20" />
                  <span className="truncate">
                    {displayTier.key === 'grandmaster' ? 'GM' : displayTier.label}
                  </span>
                </div>
              </div>

              {/* ELO + progression */}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted uppercase tracking-[0.28em] font-extrabold mb-0.5">
                  Mon ELO
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-[2.75rem] sm:text-5xl font-black tabular-nums leading-none text-gold-emboss">
                    {myEntry.elo}
                  </span>
                  {myEntry.rank > 0 && (
                    <span className="font-mono text-xs font-extrabold text-muted-2 tabular-nums">#{myEntry.rank}</span>
                  )}
                </div>

                {/* Barre de progression vers le palier suivant */}
                {tierProgress !== null && nextTier && ptsToNext !== null ? (
                  <div className="mt-3 max-w-md">
                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider mb-1">
                      <span style={{ color: myTier.color }}>{myTier.label}</span>
                      <span className="text-muted-2 normal-case tracking-normal font-bold">
                        encore <span className="text-text-strong tabular-nums">{ptsToNext}</span> pts
                      </span>
                      <span style={{ color: nextTier.color }}>{nextTier.label}</span>
                    </div>
                    <div className="relative h-2.5 rounded-full overflow-hidden bg-bg-3 border border-border/60">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${tierProgress}%` }}
                        transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="h-full rounded-full relative"
                        style={{ background: `linear-gradient(90deg, ${myTier.color}, ${nextTier.color})` }}
                      >
                        <span className="absolute inset-0 [background:linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.35)_50%,transparent_60%)]" />
                      </motion.div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: myTier.color }}>
                    <Crown className="w-3.5 h-3.5" strokeWidth={2.5} /> Grade maximal atteint
                  </div>
                )}
              </div>
            </div>
            );
            })()
          ) : (
            <div className="text-sm text-muted-2 py-4">Joue une partie pour apparaître dans la frise.</div>
          )}
        </div>
      </motion.section>

      {/* ─── La frise ─────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
        className="relative card-hud overflow-hidden p-5 sm:p-6"
      >
        <div aria-hidden className="absolute inset-0 hud-diag pointer-events-none opacity-50" />
        <header className="relative mb-5 flex items-baseline gap-2.5">
          <span className="inline-block w-1 h-4 bg-gradient-to-b from-gold via-gold to-gold-dim rounded-sm" />
          <h2 className="font-gaming text-base font-extrabold uppercase tracking-[0.16em] text-text-strong leading-none">
            La frise
          </h2>
          <span className="text-[10px] font-bold text-muted normal-case tracking-[0.1em] ml-1">
            où en es-tu ?
          </span>
        </header>

        {leaderboard.length === 0 ? (
          <div className="text-center text-muted-2 py-12 text-sm">Aucun joueur dans ce mode.</div>
        ) : (
          <div className="relative overflow-x-auto custom-scrollbar pb-2">
            <div className="relative mx-auto" style={{ minWidth: 680, height: 260 }}>
              <FriseTrack
                clusters={clusters}
                segments={segments}
                boundaries={boundaries}
                myEntry={myEntry}
                myTierColor={myTier?.color}
                championLogin={champion?.login}
                toPct={toPct}
              />
            </div>
          </div>
        )}
      </motion.section>

      {/* ─── Les paliers ──────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="relative card-hud overflow-hidden p-5 sm:p-6"
      >
        <header className="relative mb-4 flex items-baseline gap-2.5">
          <span className="inline-block w-1 h-4 bg-gradient-to-b from-gold via-gold to-gold-dim rounded-sm" />
          <h2 className="font-gaming text-base font-extrabold uppercase tracking-[0.16em] text-text-strong leading-none">
            Les paliers
          </h2>
        </header>

        {/* Règle de fin de saison : soft reset d'un grade (Or → Argent…). */}
        <p className="relative text-[11px] leading-relaxed text-muted-2 mb-2 -mt-1">
          En fin de saison, chacun redémarre au plancher du grade{' '}
          <span className="font-extrabold text-text">juste en dessous</span> du sien
          (Or → Argent, Diamant → Or…). Les{' '}
          <span className="font-extrabold" style={{ color: RANK_TIERS[1]?.color ?? '#cd7f32' }}>Bronze</span>{' '}
          restent à 1000. L'ELO ne descend jamais sous{' '}
          <span className="font-extrabold" style={{ color: RANK_TIERS[0]?.color ?? '#9aa4ad' }}>975</span>{' '}
          — et battre un joueur coincé au plancher ne rapporte presque rien.
        </p>

        {/* Règle Grand Master : top N de la discipline ET déjà Diamant. */}
        <p className="relative text-[11px] leading-relaxed text-muted-2 mb-4">
          Le grade{' '}
          <span className="font-extrabold" style={{ color: GRANDMASTER.color }}>Grand Master</span>{' '}
          récompense le top {GRANDMASTER_TOP_N} de chaque mode — mais il faut{' '}
          <span className="font-extrabold">déjà être{' '}
            <span style={{ color: DIAMANT_COLOR }}>Diamant</span></span>{' '}
          ({GRANDMASTER_MIN_ELO} ELO) pour y prétendre.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {RANK_TIERS.map((tier, i) => (
            <TierCard
              key={tier.key}
              tier={tier}
              max={RANK_TIERS[i + 1]?.min ?? null}
              count={countByTier.get(tier.key) ?? 0}
              isMine={!isGm && myTier?.key === tier.key}
              delay={i * 0.05}
            />
          ))}
          {/* Grand Master « à la suite » des autres : même carte, top N de la discipline. */}
          <TierCard
            key="grandmaster"
            tier={GRANDMASTER}
            max={null}
            count={gmCount}
            isMine={isGm}
            delay={RANK_TIERS.length * 0.05}
          />
        </div>
      </motion.section>
    </div>
  );
}

// ─── La frise (track + avatars) ────────────────────────────────────────────────

function FriseTrack({
  clusters,
  segments,
  boundaries,
  myEntry,
  myTierColor,
  championLogin,
  toPct,
}: {
  clusters: Cluster[];
  segments: { tier: RankTier; left: number; width: number; isLast: boolean }[];
  boundaries: { elo: number; color: string }[];
  myEntry: LeaderboardEntry | null;
  myTierColor?: string;
  championLogin?: string;
  toPct: (elo: number) => number;
}) {
  const TRACK_H = 52;
  const TRACK_BOTTOM = 34; // espace réservé sous la barre pour les ELO

  return (
    <>
      {/* ── Colonnes d'avatars ── */}
      {clusters.map((cluster, ci) => {
        const tier = rankTier(cluster.center);
        const hasMe = cluster.entries.some((e) => e.login === myEntry?.login);
        // Du mieux classé au moins bien, pour la pile ET le popover.
        const sorted = [...cluster.entries].sort((a, b) => a.rank - b.rank);
        const pile = sorted.slice(0, MAX_PER_COL);
        const overflow = sorted.length - pile.length;
        const multi = cluster.entries.length > 1;
        return (
          <div
            key={ci}
            className="group absolute flex flex-col-reverse items-center"
            style={{ left: `${cluster.pct}%`, bottom: TRACK_BOTTOM + TRACK_H + 8, transform: 'translateX(-50%)' }}
          >
            {/* Connecteur vers la barre */}
            <div className="w-px flex-shrink-0" style={{ height: 8, background: `${tier.color}${hasMe ? 'dd' : '50'}` }} />

            {/* Pile compacte d'avatars superposés. Détail complet au survol. */}
            <div className="relative flex flex-col-reverse items-center">
              {pile.map((entry, i) => {
                const isMe = entry.login === myEntry?.login;
                const isChamp = entry.login === championLogin;
                return (
                  <Link
                    key={entry.login}
                    to={`/player/${entry.login}`}
                    title={`${fullName(entry)} · ${entry.elo} ELO`}
                    className="block flex-shrink-0 relative transition-transform hover:!scale-110 hover:!z-20"
                    style={{ marginBottom: i === 0 ? 0 : -9, zIndex: MAX_PER_COL - i }}
                  >
                    {isChamp && (
                      <Crown
                        className="absolute -top-3 left-1/2 -translate-x-1/2 w-3.5 h-3.5 text-gold z-10 drop-shadow-[0_1px_3px_rgba(255,201,74,0.7)]"
                        strokeWidth={2.5}
                        fill="currentColor"
                      />
                    )}
                    <div
                      className="rounded-full ring-1 ring-bg-1"
                      style={
                        isMe
                          ? { padding: 2, background: `linear-gradient(135deg, ${myTierColor ?? '#ffc94a'}, ${myTierColor ?? '#ffc94a'}66)` }
                          : undefined
                      }
                    >
                      <Avatar login={entry.login} imageUrl={entry.imageUrl} size={isMe ? 'sm' : 'xs'} className={isMe ? 'ring-1 ring-bg-1' : ''} />
                    </div>
                  </Link>
                );
              })}

              {overflow > 0 && (
                <div
                  className="flex items-center justify-center rounded-full font-extrabold flex-shrink-0 ring-1 ring-bg-1"
                  style={{ width: 22, height: 22, fontSize: 8, marginBottom: -9, zIndex: 0, color: tier.color, border: `1px solid ${tier.color}55`, background: `${tier.color}1a` }}
                >
                  +{overflow}
                </div>
              )}

              {/* Popover au survol : qui est exactement à ce stade. */}
              {multi && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 w-max max-w-[210px]">
                  <div className="rounded-lg border border-border/70 bg-bg-1/95 backdrop-blur px-2 py-1.5 shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
                    <div
                      className="text-[8px] font-gaming font-extrabold uppercase tracking-widest mb-1"
                      style={{ color: tier.color }}
                    >
                      {cluster.entries.length} au même stade
                    </div>
                    {sorted.map((entry) => (
                      <div key={entry.login} className="flex items-center gap-1.5 py-0.5">
                        <Avatar login={entry.login} imageUrl={entry.imageUrl} size="xs" />
                        <span className="text-[10px] text-text truncate flex-1">{fullName(entry)}</span>
                        <span className="text-[9px] font-mono tabular-nums text-muted-2">{entry.elo}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* ── Aiguille « ma position » ── */}
      {myEntry && (
        <div
          className="absolute pointer-events-none z-10"
          style={{
            left: `${toPct(myEntry.elo)}%`,
            bottom: TRACK_BOTTOM + TRACK_H,
            height: 260 - (TRACK_BOTTOM + TRACK_H) - 8,
            width: 2,
            transform: 'translateX(-50%)',
            background: `linear-gradient(to bottom, transparent 0%, ${myTierColor ?? '#ffc94a'}66 55%, ${myTierColor ?? '#ffc94a'} 100%)`,
          }}
        >
          <span
            className="absolute -top-1 left-1/2 -translate-x-1/2 text-[8px] font-gaming font-extrabold uppercase tracking-widest whitespace-nowrap px-1.5 py-0.5 rounded"
            style={{ background: `${myTierColor ?? '#ffc94a'}`, color: '#0f141c' }}
          >
            Toi
          </span>
        </div>
      )}

      {/* ── La barre (segments par palier) ── */}
      <div className="absolute left-0 right-0 overflow-hidden rounded-xl" style={{ bottom: TRACK_BOTTOM, height: TRACK_H }}>
        {segments.map(({ tier, left, width }) => (
          <div
            key={tier.key}
            className="absolute inset-y-0 flex flex-col items-center justify-center overflow-hidden"
            style={{
              left: `${left}%`,
              width: `${width}%`,
              background: `linear-gradient(180deg, ${tier.color}33 0%, ${tier.color}14 50%, ${tier.color}33 100%)`,
              borderRight: `1px solid ${tier.color}45`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.45)',
            }}
          >
            {/* reflet brossé */}
            <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <TierIcon
              tierKey={tier.key}
              label={tier.label}
              className="w-5 h-5 mb-0.5 flex-shrink-0 ring-1"
              style={{ ['--tw-ring-color' as string]: `${tier.color}66` }}
            />
            <span
              className="font-gaming text-[9px] font-extrabold uppercase tracking-[0.14em] leading-none truncate px-1"
              style={{ color: tier.color }}
            >
              {tier.label}
            </span>
          </div>
        ))}
        {/* contour global */}
        <div className="absolute inset-0 rounded-xl pointer-events-none" style={{ border: '1px solid rgba(255,255,255,0.06)' }} />
      </div>

      {/* ── ELO sous chaque changement de palier ── */}
      {boundaries.map((b, i) => (
        <div
          key={i}
          className="absolute flex flex-col items-center pointer-events-none"
          style={{ left: `${toPct(b.elo)}%`, bottom: 0, transform: 'translateX(-50%)' }}
        >
          {/* tick montant vers la barre */}
          <div style={{ width: 1, height: 8, background: `${b.color}80` }} />
          <span className="font-mono text-[10px] font-extrabold tabular-nums mt-1" style={{ color: b.color }}>
            {b.elo}
          </span>
        </div>
      ))}
    </>
  );
}

// ─── Carte d'un palier (grille du bas) ─────────────────────────────────────────

function TierCard({
  tier,
  max,
  count,
  isMine,
  delay,
}: {
  tier: RankTier;
  max: number | null;
  count: number;
  isMine: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.16, 1, 0.3, 1] }}
      className="relative metal-plate rounded-xl p-3 text-center overflow-hidden"
      style={isMine ? { boxShadow: `inset 0 0 0 1px ${tier.color}, 0 0 18px ${tier.color}40` } : undefined}
    >
      {isMine && (
        <span
          className="absolute top-1.5 right-1.5 text-[7px] font-gaming font-extrabold uppercase tracking-widest px-1 py-0.5 rounded"
          style={{ background: tier.color, color: '#0f141c' }}
        >
          Toi
        </span>
      )}
      <TierEmblem tier={tier} size={52} rounded="lg" className="mx-auto mb-2" />
      <div className="font-gaming text-xs font-extrabold uppercase tracking-[0.12em]" style={{ color: tier.color }}>
        {tier.label}
      </div>
      {/* Plage ELO du palier — ou « Top N » pour le Grand Master (positionnel). */}
      <div className="font-mono text-[10px] font-bold text-muted-2 tabular-nums mt-0.5">
        {tier.key === 'grandmaster' ? `Top ${GRANDMASTER_TOP_N}` : max ? `${tier.min} – ${max - 1}` : `${tier.min} +`}
      </div>
      {/* Prérequis Grand Master : être déjà Diamant. */}
      {tier.key === 'grandmaster' && (
        <div className="text-[8.5px] font-bold uppercase tracking-wider mt-0.5" style={{ color: DIAMANT_COLOR }}>
          Diamant requis
        </div>
      )}
      <div className="mt-2 pt-2 border-t border-border/50">
        <span className="font-display text-lg font-black tabular-nums text-text-strong leading-none">{count}</span>
        <span className="text-[9px] text-muted uppercase tracking-wider font-extrabold ml-1">
          joueur{count !== 1 ? 's' : ''}
        </span>
      </div>
    </motion.div>
  );
}
