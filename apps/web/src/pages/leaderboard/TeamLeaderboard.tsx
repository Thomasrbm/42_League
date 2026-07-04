import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Swords } from 'lucide-react';
import { StaggerList, StaggerItem } from '../../mobile/motion/StaggerList';
import { PlayerLink } from '../../components/PlayerLink';
import { TeamPodium } from './TeamPodium';
import { api, type BabyfootTeamEntry, type LeaderboardEntry } from '../../lib/api';
import { useLeagueData } from '../../hooks/useLeagueData';
import { useT } from '../../lib/i18n';
import { CampusScopeToggle, type CampusScope } from './campusScope';

// ─── Avatar d'un joueur dans la carte d'équipe ───────────────────────────────

const GOLD_GRAD = 'linear-gradient(135deg, #d4a04a 0%, #8a5e10 50%, #c79122 100%)';

function PlayerAvatar({ login, imageUrl, size = 8 }: { login: string; imageUrl?: string | null; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full overflow-hidden border-2 border-gold/30 flex-shrink-0`;
  return (
    <div className={cls}>
      {imageUrl ? (
        <img src={imageUrl} alt={login} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center font-display font-black text-[#1a1100]"
          style={{ fontSize: `${size * 1.5}px`, background: GOLD_GRAD }}
        >
          {login[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}

// ─── Carte d'équipe ───────────────────────────────────────────────────────────

interface TeamCardProps {
  entry: BabyfootTeamEntry & {
    player1ImageUrl?: string | null;
    player2ImageUrl?: string | null;
  };
  isTop: boolean;
}

const RANK_STYLES: Record<number, string> = {
  1: 'text-yellow-400',
  2: 'text-slate-300',
  3: 'text-amber-600',
};

function TeamCard({ entry, isTop }: TeamCardProps) {
  const rankLabel = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;
  const games = entry.wins + entry.losses;
  const winRate = games === 0 ? 0 : Math.round((entry.wins / games) * 100);

  return (
    <motion.div
      className={`relative card-hud rounded-2xl px-4 py-3 flex items-center gap-3 ${
        isTop ? 'border border-gold/25 shadow-[0_0_20px_rgba(255,201,74,0.08)]' : ''
      }`}
    >
      {/* Rank */}
      <div
        className={`w-9 text-center font-display font-black tabular-nums text-sm flex-shrink-0 ${
          RANK_STYLES[entry.rank] ?? 'text-muted-2'
        }`}
      >
        {rankLabel}
      </div>

      {/* Duo avatars — overlap */}
      <div className="relative flex-shrink-0 w-12 h-8">
        <div className="absolute left-0 top-0">
          <PlayerAvatar login={entry.player1Login} imageUrl={entry.player1ImageUrl} size={8} />
        </div>
        <div className="absolute left-4 top-0 ring-2 ring-bg-1">
          <PlayerAvatar login={entry.player2Login} imageUrl={entry.player2ImageUrl} size={8} />
        </div>
      </div>

      {/* Team name + player links */}
      <div className="flex-1 min-w-0">
        {entry.name && (
          <div className="font-gaming text-xs font-extrabold text-text-strong uppercase tracking-wide truncate">
            {entry.name}
          </div>
        )}
        <div className="flex items-center gap-1 text-[10px] text-muted-2 font-medium truncate">
          <PlayerLink login={entry.player1Login}>
            <span className="hover:text-gold transition-colors">{entry.player1Login}</span>
          </PlayerLink>
          <span className="text-muted/50">&amp;</span>
          <PlayerLink login={entry.player2Login}>
            <span className="hover:text-gold transition-colors">{entry.player2Login}</span>
          </PlayerLink>
        </div>
      </div>

      {/* ELO */}
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className="font-display text-sm font-black text-gold tabular-nums leading-none">
          {entry.elo}
        </span>
        {games > 0 && (
          <span className="text-[9px] text-muted font-mono tabular-nums leading-none">
            {winRate}% · {games}G
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyTeams() {
  const t = useT();
  return (
    <div className="flex flex-col items-center py-14 px-4 gap-4">
      <div
        className="w-16 h-16 rounded-2xl border border-gold/25 flex items-center justify-center"
        style={{ background: 'rgba(255,201,74,0.06)' }}
      >
        <Swords className="w-7 h-7 text-gold/50" strokeWidth={1.5} />
      </div>
      <div className="text-center">
        <div className="text-sm font-extrabold text-text-strong">{t('lb.teams.emptyTitle')}</div>
        <div className="text-xs text-muted-2 mt-1 leading-relaxed">
          {t('lb.teams.emptyBody1')}<br />{t('lb.teams.emptyBody2')}
        </div>
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

/**
 * Classement des équipes Babyfoot 2v2, trié par ELO de l'entité BabyfootTeam.
 *
 * Les avatars sont dénormalisés depuis le leaderboard individuel pour éviter
 * un appel réseau supplémentaire.
 */
export function TeamLeaderboard({
  campusScope = 'all',
  onCampusScopeChange,
  myCampus,
}: {
  /** Vue campus : 'mine' = duos dont les deux joueurs sont du campus, 'all' = tous. */
  campusScope?: CampusScope;
  onCampusScopeChange?: (v: CampusScope) => void;
  myCampus?: string | null;
} = {}) {
  const t = useT();
  const { leaderboard } = useLeagueData();

  const [teams, setTeams] = useState<BabyfootTeamEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    api
      .teamLeaderboard()
      .then((data) => {
        if (alive) setTeams(data);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  // Dénormalise les avatars depuis le leaderboard individuel.
  const avatarByLogin = new Map<string, string | null>(
    leaderboard.map((u: LeaderboardEntry) => [u.login, u.imageUrl]),
  );

  const enriched = teams.map((t) => ({
    ...t,
    player1ImageUrl: avatarByLogin.get(t.player1Login) ?? null,
    player2ImageUrl: avatarByLogin.get(t.player2Login) ?? null,
  }));

  // Cloisonnement campus : un duo « de campus » a ses DEUX joueurs du campus. Si
  // aucun duo ne porte d'info campus (données anciennes), on reste global. Les
  // rangs sont re-numérotés de façon contiguë au sein de la vue affichée.
  const hasCampus = teams.some((t) => t.player1Campus || t.player2Campus);
  const scoped =
    campusScope === 'mine' && myCampus && hasCampus
      ? enriched.filter((t) => t.player1Campus === myCampus && t.player2Campus === myCampus)
      : enriched;
  const ranked = scoped.map((t, i) => ({ ...t, rank: i + 1 }));

  const toggle = onCampusScopeChange ? (
    <div className="mb-3 max-w-[240px]">
      <CampusScopeToggle value={campusScope} onChange={onCampusScopeChange} myCampus={myCampus} />
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card-hud rounded-2xl h-16 animate-pulse opacity-60" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 text-sm text-red/80 font-medium">{t('lb.teams.error')}</div>
    );
  }

  if (ranked.length === 0) {
    return (
      <div>
        {toggle}
        <EmptyTeams />
      </div>
    );
  }

  // Top 3 → podium « duo », le reste (rang 4+) → liste.
  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <div>
      {toggle}
      <TeamPodium top3={podium} />
      {rest.length > 0 && (
        <StaggerList className="space-y-2" stagger={0.04}>
          {rest.map((entry) => (
            <StaggerItem key={entry.id}>
              <div className="cv-row">
                <TeamCard entry={entry} isTop={false} />
              </div>
            </StaggerItem>
          ))}
        </StaggerList>
      )}
    </div>
  );
}
