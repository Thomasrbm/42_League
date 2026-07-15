import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { api, type BabyfootTeamEntry } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { haptic } from '../../../mobile/feedback/useHaptic';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GOLD_GRAD = 'linear-gradient(135deg, #d4a04a 0%, #8a5e10 50%, #c79122 100%)';

function MiniAvatar({ login, imageUrl }: { login: string; imageUrl?: string | null }) {
  return (
    <div className="w-7 h-7 rounded-full overflow-hidden border border-gold/40 flex-shrink-0">
      {imageUrl
        ? <img src={imageUrl} alt={login} className="w-full h-full object-cover" />
        : (
          <div
            className="w-full h-full flex items-center justify-center font-display font-black text-[9px] text-[#1a1100]"
            style={{ background: GOLD_GRAD }}
          >
            {login[0]?.toUpperCase()}
          </div>
        )}
    </div>
  );
}

// ─── Carte d'équipe (format compact horizontal) ───────────────────────────────

function TeamCard({ team }: { team: BabyfootTeamEntry }) {
  const navigate = useNavigate();
  const games = team.wins + team.losses;
  const winRate = games === 0 ? 0 : Math.round((team.wins / games) * 100);
  const teamName = team.name ?? `${team.player1Login} & ${team.player2Login}`;

  return (
    <motion.button
      type="button"
      onClick={() => {
        haptic('light');
        navigate(`/team/${team.id}`);
      }}
      whileTap={{ scale: 0.97 }}
      className="flex-shrink-0 w-44 flex flex-col gap-2 card-hud rounded-2xl p-3.5 border border-gold/15 hover:border-gold/30 transition-all text-start tap-transparent"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,215,120,0.06)' }}
    >
      {/* Avatars en overlap + rank */}
      <div className="flex items-center justify-between">
        <div className="relative flex-shrink-0" style={{ width: 40, height: 28 }}>
          <div className="absolute right-0 top-0">
            <MiniAvatar login={team.player2Login} />
          </div>
          <div style={{ position: 'absolute', left: 0, top: 0, outline: '2px solid rgba(21,18,14,1)', borderRadius: '50%' }}>
            <MiniAvatar login={team.player1Login} />
          </div>
        </div>
        <span className="text-[10px] font-mono font-extrabold text-muted-2 tabular-nums">
          {team.rank === 1 ? '🥇' : team.rank === 2 ? '🥈' : team.rank === 3 ? '🥉' : `#${team.rank}`}
        </span>
      </div>

      {/* Team name */}
      <div className="min-w-0">
        <div className="text-[11px] font-extrabold text-text-strong truncate leading-tight">
          {teamName}
        </div>
        {team.name && (
          <div className="text-[9px] text-muted font-mono truncate mt-0.5">
            {team.player1Login} &amp; {team.player2Login}
          </div>
        )}
      </div>

      {/* ELO + win rate */}
      <div className="flex items-end justify-between">
        <div>
          <div className="font-display text-lg font-black text-gold tabular-nums leading-none">
            {team.elo}
          </div>
          <div className="text-[9px] text-muted uppercase tracking-wider font-bold">ELO</div>
        </div>
        {games > 0 && (
          <div className="text-end">
            <div className={`font-mono text-sm font-extrabold tabular-nums leading-none ${winRate >= 50 ? 'text-gold' : 'text-red'}`}>
              {winRate}%
            </div>
            <div className="text-[9px] text-muted uppercase tracking-wider font-bold">WR</div>
          </div>
        )}
      </div>

      {/* Arrow */}
      <div className="flex items-center justify-end text-muted-2">
        <ChevronRight className="w-3 h-3" strokeWidth={2.5} />
      </div>
    </motion.button>
  );
}

// ─── Section principale ───────────────────────────────────────────────────────

interface MyTeamsSectionProps {
  myLogin: string;
}

/**
 * Section "Mes Équipes 2v2" pour le profil mobile.
 * Affiche un strip horizontal scrollable de cartes d'équipes.
 * Charge les équipes depuis `GET /teams?login=...`.
 */
export function MyTeamsSection({ myLogin }: MyTeamsSectionProps) {
  const t = useT();
  const [teams, setTeams] = useState<BabyfootTeamEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.myTeams(myLogin)
      .then((data) => { if (alive) setTeams(data); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [myLogin]);

  if (loading) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {[1, 2].map((i) => (
          <div key={i} className="flex-shrink-0 w-44 h-36 card-hud rounded-2xl animate-pulse opacity-50" />
        ))}
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="card-hud rounded-2xl px-4 py-5 text-center">
        <div className="text-2xl mb-2 opacity-50">⚽</div>
        <div className="text-xs font-medium text-muted-2">
          {t('profil.noTeamHintMobile')}
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-4 px-4 overflow-x-auto scrollbar-none scroll-smooth-touch">
      <div className="flex gap-3 pb-1 min-w-min">
        {teams.map((team) => (
          <TeamCard key={team.id} team={team} />
        ))}
      </div>
    </div>
  );
}
