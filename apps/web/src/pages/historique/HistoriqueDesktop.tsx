import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Globe2, User, TrendingDown, TrendingUp } from 'lucide-react';
import { Panel } from '../../components/Panel';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useI18n, useT } from '../../lib/i18n';
import { SeasonFilterSelect } from '../../components/SeasonFilterSelect';
import { useHistoriqueLogic } from './shared/useHistoriqueLogic';
import { GlobalMatchCard, MyMatchCard, GlobalFfaCard, MyFfaCard } from './shared/MatchCards';
import { useGameMode } from '../../hooks/useGameMode';
import { GAME_META } from '../../lib/gameMeta';

/**
 * Vue desktop de l'Historique — pensée « dashboard esport » : on n'enferme plus
 * la liste dans une colonne étroite, on scinde l'écran en DEUX panneaux côte à
 * côte qui occupent toute la largeur :
 *   • à gauche, l'historique GLOBAL du babyfoot (toutes les games de la league) ;
 *   • à droite, MON historique perso, surmonté d'un bandeau de stats (W/L, WR, ELO net).
 * Chaque panneau scrolle indépendamment → la page reste compacte, jamais un long
 * ruban vertical.
 */
export function HistoriqueDesktop() {
  const t = useT();
  const { lang } = useI18n();
  // '' = saison en cours (défaut), 'all' = toutes, sinon une saison passée.
  const [seasonFilter, setSeasonFilter] = useState('');
  const data = useHistoriqueLogic(seasonFilter);
  const { game } = useGameMode();
  const { leaderboard } = useLeagueData();

  const imgByLogin = useMemo(
    () => new Map(leaderboard.map((u) => [u.login, u.imageUrl] as const)),
    [leaderboard],
  );

  // Stats perso agrégées — WR sur les seuls matchs (les FFA ont un rang, pas un
  // binaire V/D), mais l'ELO net inclut tout (matchs + FFA).
  const stats = useMemo(() => {
    const matchStats = data.mine.filter((i) => i.kind === 'match');
    const total = matchStats.length;
    const wins = matchStats.filter((i) => i.stat.won).length;
    const draws = matchStats.filter((i) => i.stat.draw).length;
    // Win-rate sur les parties décisives (les nulles n'y entrent pas).
    const decisive = total - draws;
    const netElo = data.mine.reduce(
      (acc, i) => acc + (i.kind === 'match' ? i.stat.delta : i.stat.myDelta),
      0,
    );
    return {
      total,
      wins,
      draws,
      losses: total - wins - draws,
      wr: decisive ? Math.round((wins / decisive) * 100) : 0,
      netElo,
    };
  }, [data.mine]);

  return (
    <Panel title={t('panel.history.title')} sub={t('history.global.sub')} accent="history">
      <div className="flex justify-end mb-4">
        <SeasonFilterSelect value={seasonFilter} onChange={setSeasonFilter} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:items-start">
        {/* ─── Colonne GLOBALE ─────────────────────────────────────────── */}
        <HistoColumn
          Icon={Globe2}
          title={`Tous les matchs de ${GAME_META[game].label.toLowerCase()}`}
          count={data.global.length}
        >
          {data.global.length === 0 ? (
            <EmptyState text={t('history.empty')} />
          ) : (
            data.global
              .slice(0, 80)
              .map((item, i) =>
                item.kind === 'match' ? (
                  <GlobalMatchCard
                    key={item.id}
                    match={item.match}
                    lang={lang}
                    imgByLogin={imgByLogin}
                    delay={Math.min(i, 10) * 0.015}
                  />
                ) : (
                  <GlobalFfaCard
                    key={item.id}
                    ffa={item.ffa}
                    lang={lang}
                    imgByLogin={imgByLogin}
                    delay={Math.min(i, 10) * 0.015}
                  />
                ),
              )
          )}
        </HistoColumn>

        {/* ─── Colonne PERSO ───────────────────────────────────────────── */}
        <HistoColumn
          Icon={User}
          title={t('history.tab.mine')}
          count={data.mine.length}
          header={data.mine.length > 0 ? <MyStatsStrip {...stats} /> : undefined}
        >
          {data.mine.length === 0 ? (
            <EmptyState text={t('history.empty.mine')} />
          ) : (
            data.mine
              .slice(0, 80)
              .map((item, i) =>
                item.kind === 'match' ? (
                  <MyMatchCard
                    key={item.id}
                    stat={item.stat}
                    lang={lang}
                    imgByLogin={imgByLogin}
                    delay={Math.min(i, 10) * 0.015}
                  />
                ) : (
                  <MyFfaCard
                    key={item.id}
                    stat={item.stat}
                    lang={lang}
                    imgByLogin={imgByLogin}
                    delay={Math.min(i, 10) * 0.015}
                  />
                ),
              )
          )}
        </HistoColumn>
      </div>
    </Panel>
  );
}

// ─── Panneau scrollable avec en-tête ──────────────────────────────────────────

interface HistoColumnProps {
  Icon: typeof Globe2;
  title: string;
  count: number;
  /** En-tête optionnel (bandeau de stats), affiché sous le titre. */
  header?: ReactNode;
  children: ReactNode;
}

function HistoColumn({ Icon, title, count, header, children }: HistoColumnProps) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-bg-1/30 overflow-hidden min-h-0 lg:sticky lg:top-0 lg:h-[calc(100dvh-7rem)]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-bg-2/40">
        <Icon className="w-4 h-4 text-gold" strokeWidth={2.5} />
        <h3 className="font-gaming text-xs font-extrabold uppercase tracking-[0.16em] text-text-strong">
          {title}
        </h3>
        <span className="ml-auto text-[10px] font-mono tabular-nums text-muted-2 bg-bg-2/60 px-2 py-0.5 rounded-md border border-border">
          {count}
        </span>
      </div>
      {header && <div className="px-3 pt-3">{header}</div>}
      {/* `min-h-0` borne ce conteneur dans la colonne → le scroll interne atteint
          bien le dernier match (sinon la liste paraissait coupée avant la fin). */}
      <div className="flex-1 min-h-0 px-3 pt-3 pb-6 space-y-2 overflow-y-auto overscroll-contain custom-scrollbar">
        {children}
      </div>
    </div>
  );
}

// ─── Bandeau de stats perso ───────────────────────────────────────────────────

interface MyStatsStripProps {
  total: number;
  wins: number;
  losses: number;
  wr: number;
  netElo: number;
}

function MyStatsStrip({ total, wins, losses, wr, netElo }: MyStatsStripProps) {
  const t = useT();
  const eloUp = netElo > 0;
  const EloIcon = eloUp ? TrendingUp : TrendingDown;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="grid grid-cols-3 gap-2 mb-1"
    >
      <Stat label={t('history.stat.games')} value={String(total)} sub={`${wins}${t('lb.abbr.win')} · ${losses}${t('lb.abbr.loss')}`} />
      <Stat label={t('history.stat.winRate')} value={`${wr}%`} accent={wr >= 50 ? 'accent' : 'red'} />
      <Stat
        label={t('history.stat.eloNet')}
        value={`${netElo > 0 ? '+' : ''}${netElo}`}
        accent={netElo === 0 ? 'muted' : eloUp ? 'accent' : 'red'}
        Icon={netElo !== 0 ? EloIcon : undefined}
      />
    </motion.div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent = 'gold',
  Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'gold' | 'accent' | 'red' | 'muted';
  Icon?: typeof TrendingUp;
}) {
  const color =
    accent === 'accent'
      ? 'text-accent'
      : accent === 'red'
        ? 'text-red'
        : accent === 'muted'
          ? 'text-muted-2'
          : 'text-gold';
  return (
    <div className="rounded-xl border border-border bg-bg-2/40 px-3 py-2 text-center">
      <div className="text-[9px] uppercase tracking-[0.16em] text-muted font-extrabold mb-0.5">
        {label}
      </div>
      <div
        className={`font-display font-black tabular-nums text-lg leading-none flex items-center justify-center gap-1 ${color}`}
      >
        {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={2.75} />}
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-2 font-medium mt-0.5">{sub}</div>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="text-4xl mb-3 opacity-50">🏓</div>
      <div className="text-sm text-muted-2 font-medium">{text}</div>
    </div>
  );
}
