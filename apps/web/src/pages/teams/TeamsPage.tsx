/**
 * TeamsPage — liste de toutes les équipes 2v2 de l'utilisateur.
 *
 * Route : /teams
 * Accessible depuis :
 *   - Desktop : item de nav "Équipes" dans la sidebar
 *   - Mobile  : section "Mes Équipes" de la page Profil
 *
 * Affiche pour chaque équipe :
 *   - Avatars du duo en overlap + nom
 *   - ELO équipe + rang
 *   - Win rate + W/L
 *   - Navigation vers /team/:id au tap
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Swords, TrendingUp, TrendingDown, Plus, ChevronRight } from 'lucide-react';
import { PullToRefresh } from '../../mobile/primitives/PullToRefresh';
import { StaggerList, StaggerItem } from '../../mobile/motion/StaggerList';
import { Panel } from '../../components/Panel';
import { Spinner } from '../../components/Spinner';
import { useViewport } from '../../hooks/useViewport';
import { useLeagueData } from '../../hooks/useLeagueData';
import { api, type BabyfootTeamEntry } from '../../lib/api';
import { haptic } from '../../mobile/feedback/useHaptic';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GOLD_GRAD = 'linear-gradient(135deg, #d4a04a 0%, #8a5e10 50%, #c79122 100%)';

function MiniAvatar({
  login, imageUrl, size = 36, zOffset = false,
}: {
  login: string;
  imageUrl?: string | null;
  size?: number;
  zOffset?: boolean;
}) {
  return (
    <div
      className="rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center font-display font-black text-[#1a1100]"
      style={{
        width: size, height: size, fontSize: size * 0.38,
        border: '2px solid rgba(255,201,74,0.5)',
        outline: zOffset ? '2px solid rgba(21,18,14,1)' : undefined,
      }}
    >
      {imageUrl
        ? <img src={imageUrl} alt={login} className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center" style={{ background: GOLD_GRAD }}>
            {login[0]?.toUpperCase()}
          </div>}
    </div>
  );
}

function DuoAvatars({ team, size = 36 }: { team: BabyfootTeamEntry; size?: number }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size + size * 0.45, height: size }}>
      <div style={{ position: 'absolute', right: 0 }}>
        <MiniAvatar login={team.player2Login} imageUrl={team.player2ImageUrl} size={size} />
      </div>
      <div style={{ position: 'absolute', left: 0 }}>
        <MiniAvatar login={team.player1Login} imageUrl={team.player1ImageUrl} size={size} zOffset />
      </div>
    </div>
  );
}

// ─── Carte d'équipe ───────────────────────────────────────────────────────────

function TeamCard({ team, index: _index }: { team: BabyfootTeamEntry; index: number }) {
  const navigate = useNavigate();
  const games = team.wins + team.losses;
  const wr = games === 0 ? 0 : Math.round((team.wins / games) * 100);
  const teamName = team.name ?? `${team.player1Login} & ${team.player2Login}`;
  const isUp = wr >= 50;

  const rankLabel =
    team.rank === 1 ? '🥇'
    : team.rank === 2 ? '🥈'
    : team.rank === 3 ? '🥉'
    : `#${team.rank}`;

  return (
    <motion.button
      type="button"
      onClick={() => {
        haptic('light');
        navigate(`/team/${team.id}`);
      }}
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -2 }}
      className="w-full flex items-center gap-4 card-hud rounded-2xl px-4 py-3.5 border border-gold/15 hover:border-gold/35 transition-all text-start tap-transparent group"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,215,120,0.04)' }}
    >
      {/* Rank */}
      <div className="font-display text-sm font-black tabular-nums text-muted-2 w-8 text-center flex-shrink-0">
        {rankLabel}
      </div>

      {/* Avatars */}
      <DuoAvatars team={team} size={36} />

      {/* Nom + joueurs */}
      <div className="flex-1 min-w-0">
        <div className="font-display text-sm font-black text-text-strong truncate group-hover:text-gold transition-colors">
          {teamName}
        </div>
        {team.name && (
          <div className="text-[10px] text-muted-2 font-mono truncate mt-0.5">
            {team.player1Login} &amp; {team.player2Login}
          </div>
        )}
        {!team.name && (
          <div className="text-[10px] text-muted font-medium mt-0.5">
            {games} match{games !== 1 ? 's' : ''} joué{games !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-end">
          <div className="font-display text-base font-black text-gold tabular-nums leading-none">
            {team.elo}
          </div>
          <div className="text-[9px] text-muted uppercase tracking-wider font-bold">ELO</div>
        </div>
        {games > 0 && (
          <div className="text-end">
            <div className={`font-mono text-sm font-extrabold tabular-nums leading-none flex items-center gap-0.5 ${isUp ? 'text-[#7fd66e]' : 'text-red'}`}>
              {isUp
                ? <TrendingUp className="w-3 h-3" strokeWidth={2.5} />
                : <TrendingDown className="w-3 h-3" strokeWidth={2.5} />}
              {wr}%
            </div>
            <div className="text-[9px] text-muted uppercase tracking-wider font-bold">WR</div>
          </div>
        )}
        <ChevronRight className="w-4 h-4 text-muted group-hover:text-gold transition-colors" strokeWidth={2.5} />
      </div>
    </motion.button>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyTeams() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-5 text-center px-4">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, rgba(255,201,74,0.15), rgba(255,83,102,0.1))',
          border: '2px dashed rgba(255,201,74,0.3)',
        }}
      >
        <Users className="w-8 h-8 text-gold/60" strokeWidth={1.5} />
      </motion.div>
      <div>
        <div className="font-display text-lg font-black text-text-strong mb-1">
          Aucune équipe 2v2
        </div>
        <div className="text-sm text-muted-2 max-w-[240px] leading-relaxed">
          Déclare un match en duo pour créer ton premier duo Babyfoot.
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigate('/challenges')}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-extrabold uppercase tracking-wider text-sm text-[#1a0d00] tap-transparent"
        style={{
          background: 'linear-gradient(135deg, #ffc94a, #e0932a)',
          boxShadow: '0 4px 16px rgba(255,201,74,0.35)',
        }}
      >
        <Plus className="w-4 h-4" strokeWidth={3} />
        Déclarer un 2v2
      </button>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function TeamsPage() {
  const { me } = useLeagueData();
  const myLogin = me?.login;
  const { isMobile } = useViewport();
  const location = useLocation();

  const [teams, setTeams] = useState<BabyfootTeamEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!myLogin) return;
    setLoading(true);
    try {
      const data = await api.myTeams(myLogin);
      setTeams(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  // Recharge à chaque navigation vers cette page (location.key change à chaque visite).
  useEffect(() => { void load(); }, [myLogin, location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stats globales
  const stats = useMemo(() => {
    if (teams.length === 0) return null;
    const bestElo = Math.max(...teams.map((t) => t.elo));
    const totalGames = teams.reduce((s, t) => s + t.wins + t.losses, 0);
    const totalWins = teams.reduce((s, t) => s + t.wins, 0);
    const bestWR = teams.length > 0
      ? Math.max(...teams.map((t) => {
          const g = t.wins + t.losses;
          return g === 0 ? 0 : Math.round((t.wins / g) * 100);
        }))
      : 0;
    return { bestElo, totalGames, totalWins, bestWR };
  }, [teams]);

  const sorted = useMemo(() => [...teams].sort((a, b) => a.rank - b.rank), [teams]);

  // ── Mobile ──────────────────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <PullToRefresh onRefresh={load}>
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(255,201,74,0.2), rgba(255,83,102,0.15))' }}
            >
              <Swords className="w-4.5 h-4.5 text-gold" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-display text-xl font-black text-text-strong">Mes Équipes</div>
              <div className="text-[10px] text-muted uppercase tracking-wider font-bold">Babyfoot 2v2</div>
            </div>
          </div>

          {/* Stats rapides */}
          {stats && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-3 gap-2"
            >
              {[
                { label: 'Meilleur ELO', value: stats.bestElo, tone: 'text-gold' },
                { label: 'Meilleur WR', value: `${stats.bestWR}%`, tone: stats.bestWR >= 50 ? 'text-[#7fd66e]' : 'text-red' },
                { label: 'Matchs', value: stats.totalGames, tone: 'text-text-strong' },
              ].map(({ label, value, tone }) => (
                <div key={label} className="card-hud rounded-xl px-2 py-2.5 text-center">
                  <div className={`font-display text-base font-black tabular-nums leading-none ${tone}`}>{value}</div>
                  <div className="text-[9px] text-muted uppercase tracking-wider font-bold mt-0.5">{label}</div>
                </div>
              ))}
            </motion.div>
          )}

          {/* Liste */}
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : sorted.length === 0 ? (
            <EmptyTeams />
          ) : (
            <StaggerList className="space-y-2" stagger={0.04}>
              {sorted.map((team, i) => (
                <StaggerItem key={team.id}>
                  <TeamCard team={team} index={i} />
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </div>
      </PullToRefresh>
    );
  }

  // ── Desktop ─────────────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">

      {/* Panneau gauche : stats globales */}
      <Panel title="Vue d'ensemble" sub="Babyfoot 2v2">
        {stats ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Duos actifs', value: teams.length, tone: 'text-gold' },
                { label: 'Meilleur ELO', value: stats.bestElo, tone: 'text-gold' },
                { label: 'Matchs joués', value: stats.totalGames, tone: 'text-text-strong' },
                { label: 'Meilleur WR', value: `${stats.bestWR}%`, tone: stats.bestWR >= 50 ? 'text-[#7fd66e]' : 'text-red' },
              ].map(({ label, value, tone }) => (
                <div key={label} className="card-hud rounded-xl px-3 py-2.5">
                  <div className={`font-display text-xl font-black tabular-nums leading-none ${tone}`}>{value}</div>
                  <div className="text-[9px] text-muted uppercase tracking-wider font-bold mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            <div className="text-[10px] text-muted-2 text-center italic leading-relaxed">
              Chaque duo a son propre ELO indépendant de ton ELO solo.
              La synergie fait la différence.
            </div>
          </div>
        ) : !loading ? (
          <EmptyTeams />
        ) : (
          <div className="flex justify-center py-8"><Spinner /></div>
        )}
      </Panel>

      {/* Panneau droit : liste complète */}
      <div className="xl:col-span-2">
        <Panel title="Mes Équipes" sub={`${teams.length} duo${teams.length !== 1 ? 's' : ''} · Babyfoot`}>
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : sorted.length === 0 ? (
            <EmptyTeams />
          ) : (
            <StaggerList className="space-y-2" stagger={0.035}>
              {sorted.map((team, i) => (
                <StaggerItem key={team.id}>
                  <TeamCard team={team} index={i} />
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </Panel>
      </div>
    </div>
  );
}
