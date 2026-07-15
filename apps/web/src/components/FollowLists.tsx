import { useEffect, useState } from 'react';
import { Users, UserPlus } from 'lucide-react';
import { api, type FollowEdge } from '../lib/api';
import { Avatar } from './Avatar';
import { PlayerLink } from './PlayerLink';

type Tab = 'following' | 'followers';

interface FollowListsProps {
  /** Réseau d'un autre joueur (fiche `PlayerPage`). Si fourni → pas d'auto-fetch du sien. */
  following?: FollowEdge[];
  followers?: FollowEdge[];
  /** true = profil perso (libellés vides à la 2e personne). Défaut true. */
  isMe?: boolean;
}

/**
 * Bloc « following / followers » façon GitHub : deux onglets avec compteurs,
 * listes cliquables (chaque ligne renvoie vers la fiche du joueur).
 * Sans props → réseau de l'utilisateur courant (auto-fetch). Avec props
 * `following`/`followers` → réseau du joueur consulté.
 */
export function FollowLists({ following: followingProp, followers: followersProp, isMe = true }: FollowListsProps = {}) {
  const controlled = followingProp !== undefined || followersProp !== undefined;
  const [followingState, setFollowingState] = useState<FollowEdge[] | null>(null);
  const [followersState, setFollowersState] = useState<FollowEdge[] | null>(null);
  const [tab, setTab] = useState<Tab>('following');

  useEffect(() => {
    if (controlled) return;
    api.follows().then(setFollowingState).catch(() => setFollowingState([]));
    api.followers().then(setFollowersState).catch(() => setFollowersState([]));
  }, [controlled]);

  const following = controlled ? (followingProp ?? []) : followingState;
  const followers = controlled ? (followersProp ?? []) : followersState;

  const followingCount = following?.length ?? 0;
  const followersCount = followers?.length ?? 0;
  const rows = tab === 'following' ? following : followers;
  // /follows → relation `followee` ; /followers → relation `follower`.
  const userOf = (e: FollowEdge) =>
    tab === 'following'
      ? { login: e.followeeLogin, ...(e.followee ?? {}) }
      : { login: e.followerLogin, ...(e.follower ?? {}) };

  return (
    <div className="card-hud rounded-xl p-4">
      <div className="flex gap-1 p-1 rounded-lg bg-bg-2/60 border border-border/40 mb-3">
        <TabBtn active={tab === 'following'} onClick={() => setTab('following')} Icon={UserPlus}>
          Following <Count n={followingCount} active={tab === 'following'} />
        </TabBtn>
        <TabBtn active={tab === 'followers'} onClick={() => setTab('followers')} Icon={Users}>
          Followers <Count n={followersCount} active={tab === 'followers'} />
        </TabBtn>
      </div>

      {rows === null ? (
        <div className="text-center text-muted-2 text-sm py-6">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-2 text-sm py-6">
          {tab === 'following'
            ? isMe
              ? 'Tu ne suis personne pour le moment.'
              : 'Ne suit personne pour le moment.'
            : isMe
              ? 'Personne ne te suit encore.'
              : 'Aucun abonné pour le moment.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto scrollbar-none">
          {rows.map((e) => {
            const u = userOf(e);
            return (
              <PlayerLink
                key={e.id}
                login={u.login}
                className="!flex items-center gap-2.5 p-2 rounded-lg border border-border/50 bg-bg-2/30 hover:border-gold/40"
              >
                <Avatar login={u.login} imageUrl={u.imageUrl ?? null} size="sm" />
                <div className="min-w-0">
                  <div className="font-semibold text-text-strong truncate text-sm leading-tight">
                    {u.login}
                  </div>
                  {'elo' in u && typeof u.elo === 'number' && (
                    <div className="text-[10px] text-muted-2">
                      <span className="text-teal font-bold">{u.elo}</span> ELO
                    </div>
                  )}
                </div>
              </PlayerLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Count({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={`ms-1 inline-flex items-center justify-center min-w-[18px] px-1 rounded-full text-[10px] font-mono tabular-nums ${
        active ? 'bg-gold/20 text-gold' : 'bg-bg-1 text-muted-2'
      }`}
    >
      {n}
    </span>
  );
}

function TabBtn({
  active,
  onClick,
  Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md text-[11px] font-extrabold uppercase tracking-[0.1em] transition-all ${
        active ? 'bg-gold/10 border border-gold/30 text-gold' : 'text-muted-2 hover:text-text border border-transparent'
      }`}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
      {children}
    </button>
  );
}
