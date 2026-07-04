import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, Swords, Trophy, Skull, UserPlus, CheckCheck, Flag, Users, Megaphone, type LucideIcon } from 'lucide-react';
import { api, type AppNotification } from '../lib/api';
import { useServerEvents } from '../hooks/useServerEvents';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { gameColor, GAME_EMOJI } from '../lib/gameVisuals';
import { setGame } from '../lib/gameMode';
import { useT } from '../lib/i18n';

const POLL_MS = 30_000;

// Les notifs de match (score à valider, résultat, contestation) remontent aussi
// dans la cloche, en plus de la bannière popup + la section Défis. Le « score à
// valider » et le « duel reçu » sont marqués lus automatiquement côté serveur dès
// qu'ils sont traités (validation/contestation/accept/refus) → pas de doublon
// non-lu qui traîne. Rien n'est masqué ici.
const HIDDEN_TYPES = new Set<string>([]);

const ICON_BY_TYPE: Record<string, LucideIcon> = {
  challenge_received: Swords,
  challenge_accepted: Swords,
  challenge_declined: Flag,
  matchmaking: Swords,
  match_pending: Swords,
  match_result: Trophy,
  match_rejected: Flag,
  ffa_pending: Users,
  ffa_result: Trophy,
  ffa_contested: Flag,
  tournament: Trophy,
  ops_targeted: Skull,
  new_player: UserPlus,
  announcement: Megaphone,
};

// Couleur de fond pour les notifs SANS jeu (sinon on prend la couleur du jeu).
// Opaque dans tous les cas : la cloche ne doit jamais laisser voir le site.
const COLOR_BY_TYPE: Record<string, string> = {
  ops_targeted: '#ff3d50',
  new_player: '#7fd66e',
  tournament: '#ffc94a',
  tournament_invite: '#ffc94a',
  badge: '#ffc94a',
  announcement: '#c08a4a',
};
const NEUTRAL_BG = '#26334a';

// ── Annonces dans la cloche ──────────────────────────────────────────────────
// Les annonces générales (cf. AnnouncementPopup) remontent aussi dans la cloche,
// comme des notifs synthétiques (id préfixé « ann: »). Leur état « lu » est suivi
// en localStorage (pas de notif serveur par annonce). Tant qu'une annonce non lue
// est présente, la pastille rouge clignote en douceur (cf. .soft-blink).
const ANN_SEEN_KEY = 'bell:seenAnnouncements';
function getSeenAnnouncements(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(ANN_SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
function markAnnouncementsSeen(ids: string[]) {
  if (ids.length === 0) return;
  const s = getSeenAnnouncements();
  for (const id of ids) s.add(id);
  try {
    localStorage.setItem(ANN_SEEN_KEY, JSON.stringify([...s]));
  } catch {
    /* quota plein / mode privé : on ignore */
  }
}
const DARK = '#0b0f17';

/** Couleur de fond pleine d'une notif : sa discipline, sinon un repli par type. */
function bgColor(n: AppNotification): string {
  if (n.game) return gameColor(n.game);
  return COLOR_BY_TYPE[n.type] ?? NEUTRAL_BG;
}

/** Mélange linéaire entre deux couleurs hex (#rrggbb). t=0 → a, t=1 → b. */
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + ((pb[i] ?? 0) - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Texte lisible (sombre ou clair) selon la luminance perçue du fond. */
function textOn(hex: string): string {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b >= 150 ? '#10131a' : '#ffffff';
}

/** Temps relatif court, localisé via i18n. */
function ago(iso: string, t: (key: string) => string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t('notif.ago.now');
  const m = Math.floor(s / 60);
  if (m < 60) return t('notif.ago.minutes').replace('{n}', String(m));
  const h = Math.floor(m / 60);
  if (h < 24) return t('notif.ago.hours').replace('{n}', String(h));
  const d = Math.floor(h / 24);
  return t('notif.ago.days').replace('{n}', String(d));
}

type Tab = 'todo' | 'inbox';

/**
 * Cloche de notifications : pastille rouge avec le compte non-lu. Au clic, un
 * panneau OPAQUE s'ouvre par-dessus le site, ancré SUR la cloche, avec deux
 * onglets :
 *   • À traiter → uniquement les notifs non lues (à actionner).
 *   • Inbox     → tout l'historique (lues comprises).
 * Chaque notif a un fond plein de la couleur de sa discipline.
 * Polling 30s + rafraîchissement instantané via SSE.
 *
 * `placement` : « up » (cloche en bas de la sidebar desktop) ouvre le panneau À
 * DROITE de la cloche, aligné en bas ; « down » (topbar mobile) l'ouvre SOUS la
 * cloche, aligné à droite. Dans les deux cas il reste accroché à l'icône.
 */
export function NotificationBell({ placement = 'down' }: { placement?: 'up' | 'down' } = {}) {
  const navigate = useNavigate();
  const t = useT();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  // Annonces non lues (suivi localStorage) — pilote le clignotement de la pastille.
  const [annUnread, setAnnUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('todo');
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Position fixe du panneau desktop (« up ») : calculée depuis la cloche pour pouvoir
  // le rendre via portal sur document.body (sinon il est rogné par l'overflow-hidden
  // de la sidebar et son z-index reste piégé dans le contexte d'empilement z-20).
  const [coords, setCoords] = useState<{ left: number; bottom: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [res, anns] = await Promise.all([
        api.notifications(),
        api.announcements().catch(() => []),
      ]);
      const visible = res.notifications.filter((n) => !HIDDEN_TYPES.has(n.type));
      // Annonces actives → notifs synthétiques (id « ann:<id> »), lu = vu en local.
      const seen = getSeenAnnouncements();
      const annItems: AppNotification[] = anns
        .filter((a) => a.active)
        .map((a) => ({
          id: `ann:${a.id}`,
          type: 'announcement',
          title: a.title,
          body: a.body,
          link: '/about',
          game: null,
          read: seen.has(a.id),
          createdAt: a.createdAt,
        }));
      const merged = [...annItems, ...visible].sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      );
      setItems(merged);
      // Recalcule le non-lu à partir des seules notifs visibles (sinon la pastille
      // compterait des notifs de match qu'on n'affiche plus).
      setUnread(visible.filter((n) => !n.read).length);
      setAnnUnread(annItems.filter((n) => !n.read).length);
    } catch {
      /* silencieux : la cloche ne doit pas casser l'app */
    }
  }, []);

  // Chargement initial + polling 30s.
  useEffect(() => {
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // Rafraîchissement instantané sur signal SSE.
  useServerEvents(load, ['notification']);

  // Fermeture au clic extérieur.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // Le panneau est rendu via portal (hors du containerRef), donc on teste
      // les deux : clic dans la cloche OU dans le panneau → on ne ferme pas.
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Fermeture sur Échap quand le panneau est ouvert.
  useEscapeKey(open, () => setOpen(false));

  // Desktop (« up ») : mesure la cloche pour ancrer le panneau (à sa droite, aligné en
  // bas) en coordonnées viewport. Recalculé à l'ouverture, au resize et au scroll.
  useLayoutEffect(() => {
    if (!open || placement !== 'up') return;
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCoords({ left: r.right + 8, bottom: window.innerHeight - r.bottom });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, placement]);

  const markAll = async () => {
    setUnread(0);
    setAnnUnread(0);
    // Annonces : marquées lues en local (id « ann:<id> » → on récupère l'<id>).
    markAnnouncementsSeen(
      items.filter((n) => n.id.startsWith('ann:')).map((n) => n.id.slice(4)),
    );
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await api.markNotificationsRead().catch(() => {});
  };

  const onClickItem = async (n: AppNotification) => {
    setOpen(false);
    // Annonce synthétique : pas de notif serveur → on la marque vue en local.
    if (n.id.startsWith('ann:')) {
      if (!n.read) {
        markAnnouncementsSeen([n.id.slice(4)]);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
        setAnnUnread((u) => Math.max(0, u - 1));
      }
      if (n.link) navigate(n.link);
      return;
    }
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      await api.markNotificationsRead([n.id]).catch(() => {});
    }
    // Bascule sur le mode du jeu d'origine avant de naviguer, pour atterrir sur
    // la page DANS la bonne discipline (ex. un défi smash ouvre Défis en mode smash).
    if (n.game) setGame(n.game);
    if (n.link) navigate(n.link);
  };

  // À traiter = non lues uniquement. Inbox = tout l'historique.
  const shown = tab === 'todo' ? items.filter((n) => !n.read) : items;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={t('notif.title')}
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg text-muted-2 hover:text-gold hover:bg-bg-2/60 transition-colors"
      >
        <Bell className="w-5 h-5" strokeWidth={2.2} />
        {unread + annUnread > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red text-white text-[9px] font-black tabular-nums ring-2 ring-bg-1 ${
              annUnread > 0 ? 'soft-blink' : ''
            }`}
          >
            {unread + annUnread > 9 ? '9+' : unread + annUnread}
          </span>
        )}
      </button>

      {open && renderPanel(
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label={t('notif.title')}
          style={
            placement === 'up'
              ? { zIndex: 2147483645, position: 'fixed', left: coords?.left, bottom: coords?.bottom }
              : { zIndex: 2147483645 }
          }
          className={`rounded-xl overflow-hidden animate-pop bg-bg-0 border border-gold/25 shadow-2xl shadow-black/60 ${
            placement === 'up'
              ? // Desktop : porté via portal sur document.body, ancré à DROITE de la
                // cloche (coordonnées viewport calculées plus haut) → échappe à
                // l'overflow-hidden de la sidebar et passe au premier plan.
                'w-80 max-w-[calc(100vw-1.5rem)]'
              : // Mobile : la cloche n'est pas au bord droit (GOD + avatar à sa
                // droite), donc on n'ancre PAS sur l'icône (le panneau partirait
                // hors écran). On le fixe au viewport : collé au bord droit sous
                // le header, largeur bornée pour ne jamais déborder.
                'fixed right-3 top-[calc(env(safe-area-inset-top)+3.75rem)] w-[min(20rem,calc(100vw-1.5rem))]'
          }`}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-gold/15 bg-bg-1">
            <span className="text-[11px] uppercase tracking-wider text-gold font-extrabold">{t('notif.title')}</span>
            {unread + annUnread > 0 && (
              <button
                onClick={markAll}
                className="inline-flex items-center gap-1 text-[10px] text-muted-2 hover:text-gold transition-colors font-bold"
              >
                <CheckCheck className="w-3.5 h-3.5" strokeWidth={2.5} />
                {t('notif.markAllRead')}
              </button>
            )}
          </div>

          {/* Onglets : À traiter (non lues) / Inbox (historique) */}
          <div className="flex gap-1 px-2 py-2 bg-bg-1 border-b border-gold/10">
            <button
              type="button"
              onClick={() => setTab('todo')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${
                tab === 'todo' ? 'bg-gold/15 text-gold' : 'text-muted-2 hover:text-text-strong'
              }`}
            >
              {t('notif.tab.todo')}
              {unread + annUnread > 0 && (
                <span className="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red text-white text-[9px] font-black tabular-nums">
                  {unread + annUnread > 9 ? '9+' : unread + annUnread}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab('inbox')}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${
                tab === 'inbox' ? 'bg-gold/15 text-gold' : 'text-muted-2 hover:text-text-strong'
              }`}
            >
              {t('notif.tab.inbox')}
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-1.5 space-y-1.5">
            {shown.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-2">
                {tab === 'todo' ? t('notif.empty.todo') : t('notif.empty.inbox')}
              </div>
            ) : (
              shown.map((n) => {
                const Icon = ICON_BY_TYPE[n.type] ?? Bell;
                const base = bgColor(n);
                // Non lue → fond plein vif de la discipline. Lue (inbox) → version
                // assombrie de la même teinte, pour de-emphaser sans transparence.
                const bg = n.read ? mix(base, DARK, 0.74) : base;
                const fg = n.read ? '#cdd6e4' : textOn(bg);
                const emoji = n.game ? GAME_EMOJI[n.game] : null;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onClickItem(n)}
                    style={{ backgroundColor: bg, color: fg, borderLeft: `3px solid ${base}` }}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left rounded-lg transition-transform hover:scale-[1.01] ${
                      n.type === 'announcement' && !n.read ? 'soft-blink' : ''
                    }`}
                  >
                    <span className="mt-0.5 flex-shrink-0" style={{ color: fg }}>
                      <Icon className="w-4 h-4" strokeWidth={2.4} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold truncate">
                        {emoji && <span className="mr-1">{emoji}</span>}
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="block text-[11px] leading-snug" style={{ opacity: 0.85 }}>
                          {n.body}
                        </span>
                      )}
                      <span className="block text-[10px] mt-0.5 font-mono" style={{ opacity: 0.7 }}>
                        {ago(n.createdAt, t)}
                      </span>
                    </span>
                    {!n.read && (
                      <span
                        className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: fg }}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );

  /**
   * Les DEUX variantes sont rendues via portal sur `document.body`. Sinon le panneau
   * est piégé dans le contexte d'empilement de son conteneur (header `.glass` en
   * mobile, sidebar `overflow-hidden` + `z-20` en desktop) et son z-index énorme ne
   * sert à rien : il passe DERRIÈRE le contenu de la page / est rogné. Le portal le
   * sort de ces boîtes ; le « up » est positionné en coordonnées viewport (cf. coords),
   * le « down » reste collé au bord droit du viewport.
   */
  function renderPanel(node: ReactNode): ReactNode {
    return createPortal(node, document.body);
  }
}
