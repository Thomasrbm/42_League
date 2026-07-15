import { motion } from 'framer-motion';
import { TOURNAMENT_ELO_PLACEMENTS, tournamentEloForPlacement } from '@42-league/shared';
import { Avatar } from '../Avatar';
import { PanelTitle } from './LivePanel';
import type { LiveTournament, TournamentMatch } from '../../lib/api';
import { type Standing, poolStandings } from '../../lib/tournamentStandings';
import { avatarMap, partnerOf } from '../../lib/liveTournament';

// ─────────────────────────────────────────────────────────────────────────────
// Colonne gauche — « Classement & enjeux ». Tableau clair et ALIGNÉ : colonnes
// explicites (Joués · Victoires · Goal average) au lieu de lettres seules, et une
// colonne « Enjeu » qui dit ce que chaque place rapporte / ce qu'il reste à faire
// pour se qualifier. Gère 1v1, 2v2, ligue ET poules.
// ─────────────────────────────────────────────────────────────────────────────

const GREEN = '#7fd66e';

// Gabarit de colonnes partagé en-tête ⇄ lignes pour un alignement parfait. En `fr`
// (relatif au panneau, pas au viewport) → tient toujours dans la colonne étroite.
const GRID = '1.2fr 5fr 1.7fr 2fr 2.2fr 2.4fr';

const GAME_LABEL: Record<string, string> = {
  babyfoot: 'BABYFOOT',
  smash: 'SMASH',
  chess: 'ÉCHECS',
  streetfighter: 'STREET FIGHTER',
  flechettes: 'FLÉCHETTES',
};

function largestPow2AtMost(n: number): number {
  let p = 2;
  while (p * 2 <= n) p *= 2;
  return p;
}

export function EnjeuxPanel({
  standings,
  tournament,
  matches,
}: {
  standings: Standing[];
  tournament: LiveTournament;
  matches: TournamentMatch[];
}) {
  const gameLabel = GAME_LABEL[tournament.game ?? 'babyfoot'] ?? '';
  const isPools = tournament.format === 'pools';
  const pools = isPools ? poolStandings(matches) : [];
  const hasPoolData = pools.some((p) => p.standings.length > 0);

  return (
    <section className="flex flex-col min-h-0 h-full rounded-xl border border-border/60 bg-bg-1/70 shadow-rivet overflow-hidden">
      <PanelTitle>
        Classement &amp; enjeux <span className="text-muted-2 font-normal">({gameLabel})</span>
      </PanelTitle>

      {isPools && hasPoolData ? (
        <PoolsView pools={pools} tournament={tournament} />
      ) : (
        <LeagueView standings={standings} tournament={tournament} />
      )}
    </section>
  );
}

// En-tête de colonnes (libellés en toutes lettres).
function HeaderRow({ is2v2 }: { is2v2: boolean }) {
  return (
    <div
      className="grid items-end gap-[0.4vw] px-[0.5vw] pb-[0.4vh] text-[0.82vh] uppercase tracking-tight text-muted-2 font-semibold shrink-0"
      style={{ gridTemplateColumns: GRID }}
    >
      <span className="text-center">#</span>
      <span className="truncate">{is2v2 ? 'Équipe' : 'Joueur'}</span>
      <span className="text-center leading-[1.05]">Joués</span>
      <span className="text-center leading-[1.05]">Victoires</span>
      <span className="text-center leading-[1.05]">Goal average</span>
      <span className="text-end pe-[0.2vw] leading-[1.05]">Enjeu</span>
    </div>
  );
}

// ── Vue LIGUE / ÉLIMINATION (classement unique au goal average) ────────────────

function LeagueView({
  standings,
  tournament,
}: {
  standings: Standing[];
  tournament: LiveTournament;
}) {
  const entries = tournament.entries ?? [];
  const avatars = avatarMap(entries);
  const is2v2 = tournament.mode === '2v2';
  const rows = standings.slice(0, 12);

  // Enjeux (miroir de la page de contrôle) : barème par PLACEMENT final
  // (1er +100, 2e +75, 3e +50, 4e +25 — identique amical/officiel).
  const eloMax = TOURNAMENT_ELO_PLACEMENTS[0];
  const effectiveQualify = Math.min(
    64,
    Math.max(2, tournament.leagueQualifyCount ?? largestPow2AtMost(standings.length || 2)),
  );
  const highlightQualify = Math.min(effectiveQualify, standings.length);
  const championPrize =
    tournament.kind === 'official' && tournament.prizeKind && tournament.prizeKind !== 'none'
      ? tournament.prizeKind === 'coins'
        ? `${tournament.prizeCoins ?? 0} 🪙`
        : (tournament.prizeItem?.name ?? 'cosmétique')
      : null;

  // Goal average du dernier qualifié → « écart à rattraper » des places suivantes.
  const cutoffDiff = standings[highlightQualify - 1]?.diff ?? 0;

  if (standings.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[1.6vh] text-muted-2 px-4 text-center">
        En attente des premiers résultats…
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 flex-1 px-[0.6vw] pb-[0.8vh]">
      {/* Aide : critère de classement + zone de qualification. */}
      <div className="flex items-center justify-between px-[0.5vw] mb-[0.5vh] shrink-0">
        <span className="text-[1.0vh] uppercase tracking-[0.12em] text-gold/70 font-mono">
          Classé au goal&nbsp;average
        </span>
        <span className="text-[1.0vh] text-teal font-semibold uppercase tracking-[0.08em]">
          ● Top {highlightQualify} qualifié{highlightQualify > 1 ? 's' : ''}
        </span>
      </div>

      <HeaderRow is2v2={is2v2} />

      <div className="flex flex-col gap-[0.4vh] min-h-0 flex-1 overflow-hidden">
        {rows.map((s, i) => {
          const qualified = i < highlightQualify;
          const gap = Math.max(0, cutoffDiff - s.diff);
          return (
            <StandingRow
              key={s.login}
              s={s}
              rank={i + 1}
              champion={i === 0}
              qualified={qualified}
              avatarUrl={avatars.get(s.login) ?? null}
              partner={is2v2 ? partnerOf(s.login, entries) : null}
              enjeu={
                i === 0
                  ? { tone: 'champion', main: `🏆 +${eloMax}`, title: championPrize ?? undefined }
                  : qualified
                    ? tournamentEloForPlacement(i + 1) > 0
                      // Podium projeté (2e/3e/4e) : +75/+50/+25 si le rang tient en finale.
                      ? { tone: 'qualified', main: `+${tournamentEloForPlacement(i + 1)}` }
                      : { tone: 'qualified', main: 'Qualifié' }
                    : gap > 0
                      ? { tone: 'gap', main: `−${gap}`, sub: 'qualif' }
                      : { tone: 'gap', main: '=' }
              }
            />
          );
        })}
      </div>

      {championPrize && (
        <div className="mt-[0.4vh] text-center text-[1.15vh] text-gold/80 shrink-0">
          🏆 Champion remporte : <span className="font-bold">{championPrize}</span>
        </div>
      )}
    </div>
  );
}

// ── Vue POULES (un mini-classement par poule) ──────────────────────────────────

function PoolsView({
  pools,
  tournament,
}: {
  pools: ReturnType<typeof poolStandings>;
  tournament: LiveTournament;
}) {
  const entries = tournament.entries ?? [];
  const avatars = avatarMap(entries);
  const is2v2 = tournament.mode === '2v2';
  const qualPerPool = 2;

  return (
    <div className="flex flex-col min-h-0 flex-1 px-[0.6vw] pb-[0.8vh] overflow-hidden">
      <div className="px-[0.5vw] mb-[0.4vh] text-[1.0vh] uppercase tracking-[0.12em] text-gold/70 font-mono shrink-0">
        Phase de poules · top {qualPerPool} qualifié{qualPerPool > 1 ? 's' : ''} par poule
      </div>
      <HeaderRow is2v2={is2v2} />
      <div className="flex flex-col gap-[0.6vh] min-h-0 flex-1 overflow-hidden">
        {pools.map(({ poolIndex, standings }) => (
          <div key={poolIndex} className="flex flex-col min-h-0">
            <div className="flex items-center gap-[0.4vw] px-[0.5vw] mb-[0.3vh] shrink-0">
              <span className="text-[1.2vh] font-gaming font-bold uppercase tracking-wider text-text-strong">
                Poule {poolIndex + 1}
              </span>
              <span className="h-px flex-1 bg-border/50" />
            </div>
            <div className="flex flex-col gap-[0.3vh]">
              {standings.slice(0, 6).map((s, i) => {
                const qualified = i < qualPerPool && i < standings.length - 1;
                return (
                  <StandingRow
                    key={s.login}
                    s={s}
                    rank={i + 1}
                    champion={false}
                    qualified={qualified}
                    avatarUrl={avatars.get(s.login) ?? null}
                    partner={is2v2 ? partnerOf(s.login, entries) : null}
                    enjeu={qualified ? { tone: 'qualified', main: 'Qualifié' } : { tone: 'gap', main: '' }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Ligne de classement partagée ───────────────────────────────────────────────

type Enjeu = {
  tone: 'champion' | 'qualified' | 'gap';
  main: string;
  sub?: string;
  title?: string;
};

function StandingRow({
  s,
  rank,
  champion,
  qualified,
  avatarUrl,
  partner,
  enjeu,
}: {
  s: Standing;
  rank: number;
  champion: boolean;
  qualified: boolean;
  avatarUrl: string | null;
  partner: string | null;
  enjeu: Enjeu;
}) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

  return (
    <motion.div
      layout
      className={`grid items-center gap-[0.4vw] rounded-lg px-[0.5vw] py-[0.45vh] border ${
        champion
          ? 'border-gold/50 bg-gold/[0.10] shadow-[inset_0_0_18px_rgba(255,201,74,0.08)]'
          : qualified
            ? 'border-teal/30 bg-teal/[0.06]'
            : 'border-border/40 bg-bg-2/40'
      }`}
      style={{ gridTemplateColumns: GRID }}
    >
      {/* Rang (médaille pour le podium) */}
      <span
        className={`text-center font-display font-black tabular-nums leading-none ${
          medal ? 'text-[1.8vh]' : champion ? 'text-gold text-[1.6vh]' : qualified ? 'text-teal text-[1.6vh]' : 'text-muted-2 text-[1.6vh]'
        }`}
      >
        {medal ?? rank}
      </span>

      {/* Joueur / équipe */}
      <div className="flex items-center gap-[0.4vw] min-w-0">
        <Avatar login={s.login} imageUrl={avatarUrl} size="sm" />
        <div className="flex flex-col min-w-0 leading-tight">
          <span className="text-[1.45vh] text-text-strong font-semibold truncate">{s.login}</span>
          {partner && <span className="text-[1.0vh] text-muted-2 truncate">&amp; {partner}</span>}
        </div>
      </div>

      {/* Joués */}
      <span className="text-center text-[1.5vh] tabular-nums text-muted-2">{s.played}</span>

      {/* Victoires */}
      <span className="text-center text-[1.6vh] tabular-nums font-bold" style={{ color: s.wins > 0 ? GREEN : undefined }}>
        {s.wins}
      </span>

      {/* Goal average (critère de classement) */}
      <span
        className={`text-center font-display font-black tabular-nums text-[1.75vh] leading-none ${
          s.diff < 0 ? 'text-red' : s.diff === 0 ? 'text-muted-2' : ''
        }`}
        style={s.diff > 0 ? { color: GREEN } : undefined}
      >
        {s.diff > 0 ? `+${s.diff}` : s.diff}
      </span>

      {/* Enjeu */}
      <span className="text-end pe-[0.2vw] whitespace-nowrap">
        <EnjeuChip enjeu={enjeu} />
      </span>
    </motion.div>
  );
}

function EnjeuChip({ enjeu }: { enjeu: Enjeu }) {
  if (!enjeu.main) return <span className="text-[1.1vh] text-muted-2">—</span>;
  if (enjeu.tone === 'champion') {
    return (
      <span
        className="inline-block text-[1.15vh] font-bold text-gold drop-shadow-[0_0_8px_rgba(255,201,74,0.4)]"
        title={enjeu.title}
      >
        {enjeu.main}
      </span>
    );
  }
  if (enjeu.tone === 'qualified') {
    return <span className="text-[1.15vh] font-semibold text-teal">{enjeu.main}</span>;
  }
  // gap
  return (
    <span className="inline-flex flex-col items-end leading-none">
      <span className="text-[1.2vh] font-mono font-semibold text-muted-2">{enjeu.main}</span>
      {enjeu.sub && <span className="text-[0.8vh] uppercase tracking-wide text-muted-2/70">{enjeu.sub}</span>}
    </span>
  );
}
