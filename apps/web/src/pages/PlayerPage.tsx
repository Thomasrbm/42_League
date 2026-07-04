import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Swords, UserPlus, UserCheck } from 'lucide-react';
import { Panel } from '../components/Panel';
import { Tooltip } from '../components/Tooltip';
import { Button } from '../components/Button';
import { Palmares } from '../components/Palmares';
import { EloChart } from '../components/EloChart';
import { FollowLists } from '../components/FollowLists';
import { ProfileHeroCard } from './profil/mobile/ProfileHeroCard';
import { ProfilHistory } from './profil/shared/ProfilHistory';
import { MyTeamsSection } from './profil/mobile/MyTeamsSection';
import { SectionHeader } from './profil/shared/SectionHeader';
import { computeProfilStats } from './profil/shared/useProfilLogic';
import {
  api,
  type UserProfile,
  type FollowPrefs,
} from '../lib/api';
import { fmtCountdown } from '../lib/format';
import { useLeagueData } from '../hooks/useLeagueData';
import { useGameMode } from '../hooks/useGameMode';
import { useFlash } from '../hooks/useFlash';
import { useConfirm } from '../hooks/useConfirm';
import { useI18n, useT } from '../lib/i18n';

export function PlayerPage() {
  const { login: rawLogin } = useParams<{ login: string }>();
  const login = rawLogin ?? '';
  const navigate = useNavigate();
  const t = useT();
  const { me, opsMe, matches, playedDarts, refresh, activeSeasonId } = useLeagueData();
  const { game } = useGameMode();
  const flash = useFlash();
  const confirm = useConfirm();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [titleDraft, setTitleDraft] = useState('');
  const [following, setFollowing] = useState(false);
  const [followPrefs, setFollowPrefs] = useState<FollowPrefs | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await api.userProfile(login);
      setProfile(p);
      setTitleDraft(p.user.title ?? '');
      setFollowing(!!p.following);
      setFollowPrefs(p.followPrefs ?? null);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [login]);

  const DEFAULT_PREFS: FollowPrefs = {
    notifyTournament: true,
    notifyTop3: true,
    notifyTrophy: true,
    notifyOps: true,
  };

  const toggleFollow = async () => {
    if (following) {
      setFollowing(false);
      setFollowPrefs(null);
      await api.unfollow(login).catch(() => load());
    } else {
      setFollowing(true);
      setFollowPrefs(DEFAULT_PREFS);
      await api.follow(login).catch(() => load());
    }
  };

  const setPref = async (key: keyof FollowPrefs, val: boolean) => {
    setFollowPrefs((prev) => (prev ? { ...prev, [key]: val } : prev));
    await api.updateFollowPrefs(login, { [key]: val }).catch(() => {});
  };

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Panel title={login || t('player.defaultName')} sub={t('profil.subtitle')}>
        <div className="text-center text-muted-2 py-10">{t('common.loading')}</div>
      </Panel>
    );
  }
  if (!profile) {
    return (
      <Panel title={login} sub={t('profil.subtitle')}>
        <div className="text-center text-muted-2 py-10">
          {login} {t('profil.notRegistered')}
        </div>
      </Panel>
    );
  }

  const p = profile;
  const myLogin = me?.login;
  const isMe = myLogin === p.user.login;

  // Mêmes stats que le profil perso (calcul pur partagé), isolées par discipline
  // depuis l'historique global — agencement strictement identique à `ProfilMobile`.
  const { stats, recentMatches } = computeProfilStats(p.user, p.user.login, matches, game, activeSeasonId);

  return (
    <div className="space-y-5">
      {/* Carte héro — même design que le profil perso (sans le sélecteur de titre) */}
      <ProfileHeroCard stats={stats} user={p.user} badges={p.badges} customBadges={p.customBadges} titleColor={p.titleColor} equippedBadge={p.equippedBadge} equippedBanner={p.equippedBanner} isMe={isMe} coins={p.coins} />

      {/* Actions propres à la fiche d'un autre joueur : suivre + head-to-head */}
      {!isMe && myLogin && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={following ? 'ghost' : 'primary'} size="sm" onClick={toggleFollow} className="flex-1">
            {following ? (
              <>
                <UserCheck className="w-3.5 h-3.5 mr-1.5" strokeWidth={2.5} />
                {t('player.following')}
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5 mr-1.5" strokeWidth={2.5} />
                {t('player.follow')}
              </>
            )}
          </Button>
          <Tooltip label={t('h2h.tip')} side="bottom" wide className="flex-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() =>
                navigate(`/h2h?a=${encodeURIComponent(myLogin)}&b=${encodeURIComponent(p.user.login)}`)
              }
            >
              <Swords className="w-3.5 h-3.5 mr-1.5" strokeWidth={2.5} />
              Head-to-Head
            </Button>
          </Tooltip>
        </div>
      )}

      {/* Configuration du suivi — préférences de notif quand on suit ce joueur */}
      {!isMe && myLogin && following && followPrefs && (
        <div className="card-hud rounded-xl p-4 border-gold/20">
          <div className="font-gaming text-[10px] uppercase tracking-[0.18em] text-gold/80 font-extrabold mb-3 flex items-center gap-2">
            <span className="inline-block w-1 h-2.5 bg-gradient-to-b from-gold/80 to-gold-dim/80 rounded-sm" />
            {t('player.notify.heading.a')} {p.user.login}{t('player.notify.heading.b')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <FollowToggle label={t('player.notify.tournament')} on={followPrefs.notifyTournament} onChange={(v) => setPref('notifyTournament', v)} />
            <FollowToggle label={t('player.notify.top3')} on={followPrefs.notifyTop3} onChange={(v) => setPref('notifyTop3', v)} />
            <FollowToggle label={t('player.notify.trophy')} on={followPrefs.notifyTrophy} onChange={(v) => setPref('notifyTrophy', v)} hint={t('player.notify.soon')} />
            <FollowToggle label={t('player.notify.ops')} on={followPrefs.notifyOps} onChange={(v) => setPref('notifyOps', v)} />
          </div>
        </div>
      )}

      {me?.isAdmin && (
        <div className="p-3 bg-bg-2 border border-border rounded flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gold">
            {t('player.admin.title')}
          </span>
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            maxLength={40}
            placeholder={t('player.admin.placeholder')}
            className="flex-1 min-w-[160px] px-3 py-1.5 bg-bg-0 border border-border rounded-lg text-sm focus:border-gold outline-none transition-colors"
          />
          <Button
            size="sm"
            onClick={async () => {
              try {
                const tval = titleDraft.trim();
                await api.setUserTitle(p.user.login, tval || null);
                flash.show(tval ? `${t('player.admin.titleSet')} « ${tval} »` : t('player.admin.titleRemoved'));
                await load();
                await refresh();
              } catch (err) {
                flash.show(err instanceof Error ? err.message : String(err), 'error');
              }
            }}
          >
            {t('player.admin.save')}
          </Button>
          {p.user.title && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  await api.setUserTitle(p.user.login, null);
                  flash.show(t('player.admin.titleRemoved'));
                  await load();
                  await refresh();
                } catch (err) {
                  flash.show(err instanceof Error ? err.message : String(err), 'error');
                }
              }}
            >
              {t('player.admin.clear')}
            </Button>
          )}
        </div>
      )}

      <DeclareOpsBox
        playerLogin={p.user.login}
        isMe={isMe}
        opsMe={opsMe}
        onDeclared={async () => {
          await load();
          await refresh();
        }}
        confirm={confirm}
        flash={flash}
      />

      {/* Courbe d'évolution ELO — comme sur son propre profil */}
      {recentMatches.length >= 2 && (
        <section>
          <SectionHeader title={t('profil.eloEvolution')} />
          <div className="card-hud rounded-2xl px-4 pt-3 pb-4 border-gold/20">
            <EloChart
              matches={matches}
              myLogin={p.user.login}
              currentElo={stats.elo}
              game={game}
              height={150}
            />
          </div>
        </section>
      )}

      {/* Réseau du joueur (following / followers, style GitHub) */}
      <section>
        <SectionHeader title={t('profil.network')} />
        <FollowLists following={p.followingList ?? []} followers={p.followersList ?? []} isMe={isMe} />
      </section>

      {/* Matchs récents — même liste que le profil perso */}
      <section>
        <SectionHeader title={t('profil.recent')} badge={stats.total} />
        <ProfilHistory login={p.user.login} matches={matches} darts={playedDarts} user={p.user} limit={10} showFullHistoryLink />
      </section>

      {/* Équipes 2v2 — uniquement en Babyfoot */}
      {game === 'babyfoot' && (
        <section>
          <SectionHeader title={t('profil.myTeams')} />
          <MyTeamsSection myLogin={p.user.login} />
        </section>
      )}

      {/* Palmarès par saison */}
      {p.palmares && p.palmares.length > 0 && (
        <Palmares entries={p.palmares} />
      )}
    </div>
  );
}

function FollowToggle({
  label,
  on,
  onChange,
  hint,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
        on ? 'border-gold/40 bg-gold/[0.06]' : 'border-border bg-bg-2/40'
      }`}
    >
      <span className="text-xs text-text flex items-center gap-1.5">
        {label}
        {hint && <span className="text-[9px] text-muted-2 uppercase tracking-wider">({hint})</span>}
      </span>
      <span
        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-gold/70' : 'bg-bg-3'}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 ${on ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}

interface DeclareOpsBoxProps {
  playerLogin: string;
  isMe: boolean;
  opsMe: ReturnType<typeof useLeagueData>['opsMe'];
  onDeclared: () => Promise<void>;
  confirm: ReturnType<typeof useConfirm>;
  flash: ReturnType<typeof useFlash>;
}

function DeclareOpsBox({
  playerLogin,
  isMe,
  opsMe,
  onDeclared,
  confirm,
  flash,
}: DeclareOpsBoxProps) {
  const t = useT();
  const { locale } = useI18n();
  if (isMe) return null;

  // Already this player's ops owner
  if (opsMe?.current && opsMe.current.targetLogin === playerLogin) {
    return (
      <div className="p-3 border border-red/50 bg-red/[0.06] rounded text-red text-sm font-semibold">
        ☠ {playerLogin} {t('ops.isYourOps.a')} {fmtCountdown(opsMe.current.expiresAt)} {t('ops.isYourOps.b')}
      </div>
    );
  }

  const reasons: string[] = [];
  if (opsMe?.current) {
    reasons.push(
      t('ops.alreadyActive')
        .replace('{target}', opsMe.current.targetLogin)
        .replace('{date}', new Date(opsMe.current.expiresAt).toLocaleDateString(locale)),
    );
  } else if (opsMe?.canDeclareAt) {
    reasons.push(t('ops.cooldown').replace('{time}', fmtCountdown(opsMe.canDeclareAt)));
  }
  // NB : une cible peut être l'ops de plusieurs traqueurs à la fois — qu'elle
  // soit déjà ciblée par quelqu'un d'autre ne nous empêche pas de la cibler.
  // De même, traquer quelqu'un (owns un ops actif) ne la protège pas d'être
  // ciblée en retour. Les seuls vrais blocages restent côté traqueur : avoir
  // déjà un ops actif, ou être en cooldown (gérés ci-dessus).

  if (reasons.length > 0) {
    return (
      <div className="p-3 border border-border bg-bg-2/60 rounded text-sm text-muted-2 space-y-1.5">
        <div className="text-red font-extrabold text-[10px] uppercase tracking-wider">
          {t('ops.unavailable')}
        </div>
        {reasons.map((r, i) => (
          <div key={i}>{r}</div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-3 border border-red/40 bg-red/[0.04] rounded">
      <div className="text-red font-extrabold text-[10px] uppercase tracking-wider mb-2">
        ☠ OPS
      </div>
      <div className="text-sm text-text mb-3 leading-relaxed space-y-1.5">
        <p>
          {t('ops.declare.intro.a')} {playerLogin} {t('ops.declare.intro.b')} <span className="font-semibold">{t('ops.declare.hunt24')}</span>.
        </p>
        <ul className="space-y-1 pl-3 border-l border-red/30 text-muted-2 text-[13px]">
          <li>{t('ops.declare.rule1.a')} <span className="text-text font-semibold">{t('ops.declare.rule1.b')}</span>.</li>
          <li>{t('ops.declare.rule2.a')} <span className="text-red font-semibold">{t('ops.declare.rule2.b')}</span>.</li>
          <li>{t('ops.declare.rule3')}</li>
        </ul>
      </div>
      <Button
        variant="danger"
        size="sm"
        onClick={async () => {
          const ok = await confirm({
            title: t('ops.declare.confirm.title').replace('{player}', playerLogin),
            message: t('ops.declare.confirm.msg').replace('{player}', playerLogin),
          });
          if (!ok) return;
          try {
            await api.declareOps(playerLogin);
            flash.show(t('ops.declared').replace('{player}', playerLogin));
            await onDeclared();
          } catch (err) {
            flash.show(err instanceof Error ? err.message : String(err), 'error');
          }
        }}
      >
        {t('ops.declare.btn')}
      </Button>
    </div>
  );
}
