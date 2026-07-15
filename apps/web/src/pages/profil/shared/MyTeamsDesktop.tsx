import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronRight, Swords } from 'lucide-react';
import { api, type BabyfootTeamEntry } from '../../../lib/api';
import { useT } from '../../../lib/i18n';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GOLD_GRAD = 'linear-gradient(135deg, #d4a04a 0%, #8a5e10 50%, #c79122 100%)';

function MiniAvatar({ login, imageUrl }: { login: string; imageUrl?: string | null }) {
  return (
    <div className="w-8 h-8 rounded-full overflow-hidden border border-gold/40 flex-shrink-0">
      {imageUrl
        ? <img src={imageUrl} alt={login} className="w-full h-full object-cover" />
        : (
          <div
            className="w-full h-full flex items-center justify-center font-display font-black text-[10px] text-[#1a1100]"
            style={{ background: GOLD_GRAD }}
          >
            {login[0]?.toUpperCase()}
          </div>
        )}
    </div>
  );
}

// ─── Ligne d'équipe dans la liste ─────────────────────────────────────────────

function TeamRow({ team }: { team: BabyfootTeamEntry }) {
  const navigate = useNavigate();
  const games = team.wins + team.losses;
  const winRate = games === 0 ? 0 : Math.round((team.wins / games) * 100);
  const teamName = team.name ?? `${team.player1Login} & ${team.player2Login}`;

  return (
    <button
      type="button"
      onClick={() => navigate(`/team/${team.id}`)}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-transparent hover:border-gold/25 hover:bg-gold/5 transition-all group text-start tap-transparent"
    >
      {/* Duo avatars */}
      <div className="relative flex-shrink-0" style={{ width: 44, height: 32 }}>
        <div className="absolute right-0 top-0">
          <MiniAvatar login={team.player2Login} />
        </div>
        <div style={{ position: 'absolute', left: 0, top: 0, outline: '2px solid rgba(21,18,14,1)', borderRadius: '50%' }}>
          <MiniAvatar login={team.player1Login} />
        </div>
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-text-strong truncate group-hover:text-gold transition-colors">
          {teamName}
        </div>
        {team.name && (
          <div className="text-[10px] text-muted-2 font-mono truncate">
            {team.player1Login} &amp; {team.player2Login}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 flex-shrink-0 text-end">
        <div>
          <div className="font-display text-sm font-black text-gold tabular-nums leading-none">{team.elo}</div>
          <div className="text-[9px] text-muted uppercase tracking-wider font-bold">ELO</div>
        </div>
        {games > 0 && (
          <div>
            <div className={`font-mono text-sm font-extrabold tabular-nums leading-none ${winRate >= 50 ? 'text-gold' : 'text-red'}`}>
              {winRate}%
            </div>
            <div className="text-[9px] text-muted uppercase tracking-wider font-bold">WR</div>
          </div>
        )}
        <span className="text-[10px] font-mono text-muted-2 tabular-nums w-8 text-end">
          {team.rank === 1 ? '🥇' : team.rank === 2 ? '🥈' : team.rank === 3 ? '🥉' : `#${team.rank}`}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-muted group-hover:text-gold transition-colors" strokeWidth={2.5} />
      </div>
    </button>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface MyTeamsDesktopProps {
  myLogin: string;
}

/**
 * Section "Mes Équipes 2v2" pour le profil desktop.
 * Affiche un bouton-accordéon qui déroule la liste des équipes.
 * Se positionne dans le panneau gauche du ProfilDesktop.
 */
export function MyTeamsDesktop({ myLogin }: MyTeamsDesktopProps) {
  const t = useT();
  const [teams, setTeams] = useState<BabyfootTeamEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api.myTeams(myLogin)
      .then((data) => { if (alive) setTeams(data); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [myLogin]);

  return (
    <div className="mt-4">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl card-hud border border-gold/20 hover:border-gold/40 transition-all group"
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center border border-gold/40 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, rgba(255,201,74,0.2), rgba(255,201,74,0.06))' }}
          >
            <Swords className="w-3.5 h-3.5 text-gold" strokeWidth={2.5} />
          </div>
          <div className="text-start">
            <div className="text-sm font-extrabold text-text-strong uppercase tracking-wide">
              {t('profil.myTeams')}
            </div>
            <div className="text-[10px] text-muted font-medium">
              {loading ? '…' : teams.length === 0 ? t('profil.noTeam') : `${teams.length} ${teams.length > 1 ? t('profil.duos') : t('profil.duo')} · ${t('game.babyfoot')}`}
            </div>
          </div>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted group-hover:text-gold transition-colors" strokeWidth={2.5} />
        </motion.div>
      </button>

      {/* Dropdown */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-2 space-y-0.5">
              {loading && (
                <div className="space-y-2 py-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-14 card-hud rounded-xl animate-pulse opacity-50" />
                  ))}
                </div>
              )}

              {!loading && teams.length === 0 && (
                <div className="text-center py-6 text-sm text-muted-2 italic">
                  {t('profil.noTeamHintDesktop')}
                </div>
              )}

              {!loading && teams.map((team) => (
                <TeamRow key={team.id} team={team} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
