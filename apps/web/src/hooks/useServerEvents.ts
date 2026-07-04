import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { getApiBase } from '../lib/config';
import { getToken } from '../lib/storage';

/**
 * S'abonne au flux SSE `/events` et appelle `onEvent` (debouncé) à chaque
 * événement dont le type figure dans `types`.
 *
 * Conçu pour des vues qui veulent se rafraîchir en temps réel sans passer par
 * le contexte global `useLeagueData` (ex. le GOD panel, qui a son propre state
 * local par onglet).
 *
 * Sécurité : l'URL du flux porte un token en query string (EventSource ne peut
 * pas envoyer de header Authorization). On n'y met JAMAIS le Bearer 30 jours —
 * une query string fuite dans les logs / l'historique / le header Referer. On
 * échange d'abord le Bearer contre un token éphémère de scope SSE
 * (GET /auth/stream-token, TTL ~60 s) et c'est lui qu'on passe en ?token=.
 *
 * Comme ce token est court, on gère la reconnexion nous-mêmes : à chaque coupure
 * on redemande un token frais et on rouvre l'EventSource (l'auto-reconnexion
 * native rejouerait la même URL avec un token expiré).
 *
 * Le callback est conservé dans une ref → changer son identité entre deux
 * rendus NE relance PAS la connexion (seul `types` / `enabled` le font).
 *
 * `fireOnReopen` (défaut true) : au retour au premier plan (focus / online /
 * visibilité), on rejoue `onEvent` une fois pour rattraper ce qu'on a manqué en
 * veille. Parfait pour un re-fetch, mais à désactiver si `onEvent` a un effet de
 * bord visible (ex. animation) qu'on ne veut déclencher QUE sur un vrai event.
 */
export function useServerEvents(
  onEvent: (event?: { type: string; data: unknown }) => void,
  types: string[],
  {
    enabled = true,
    debounceMs = 300,
    fireOnReopen = true,
  }: { enabled?: boolean; debounceMs?: number; fireOnReopen?: boolean } = {},
) {
  const cbRef = useRef<(event?: { type: string; data: unknown }) => void>(onEvent);
  useEffect(() => {
    cbRef.current = onEvent;
  }, [onEvent]);

  // Clé stable : évite de relancer la connexion si l'appelant passe un nouveau
  // tableau à chaque rendu mais avec le même contenu.
  const typesKey = types.join(',');

  useEffect(() => {
    if (!enabled) return;
    if (!getToken()) return;

    let closed = false;
    let es: EventSource | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let backoffMs = 1000;

    const fire = (event?: { type: string; data: unknown }) => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => cbRef.current(event), debounceMs);
    };

    const scheduleReconnect = () => {
      if (closed || reconnect) return;
      reconnect = setTimeout(() => {
        reconnect = undefined;
        void connect();
      }, backoffMs);
      // Backoff plafonné : évite de marteler le serveur s'il est down.
      backoffMs = Math.min(backoffMs * 2, 30_000);
    };

    const connect = async () => {
      if (closed) return;
      let streamToken: string;
      try {
        ({ token: streamToken } = await api.streamToken());
      } catch {
        // Bearer invalide/expiré ou serveur indispo → on retente plus tard.
        scheduleReconnect();
        return;
      }
      if (closed) return;

      const url = `${getApiBase()}/events?token=${encodeURIComponent(streamToken)}`;
      es = new EventSource(url);

      es.addEventListener('open', () => {
        backoffMs = 1000; // connexion saine → on réinitialise le backoff.
      });
      for (const type of typesKey.split(',')) {
        es.addEventListener(type, (e) => {
          let data: unknown = undefined;
          const raw = (e as MessageEvent).data;
          if (typeof raw === 'string' && raw.length > 0) {
            try {
              data = JSON.parse(raw);
            } catch {
              data = raw;
            }
          }
          fire({ type, data });
        });
      }
      es.onerror = () => {
        // EventSource tenterait de rejouer la MÊME URL (token bientôt expiré) :
        // on coupe et on rouvre avec un token frais.
        es?.close();
        es = undefined;
        scheduleReconnect();
      };
    };

    // Réveil mobile : au retour au premier plan (ou réseau revenu), la connexion
    // peut être morte sans avoir déclenché `onerror`. On force une reconnexion
    // avec token frais + un re-fetch pour rattraper ce qu'on a manqué en veille.
    let reopenTimer: ReturnType<typeof setTimeout> | undefined;
    const reopen = () => {
      if (closed) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (reopenTimer) clearTimeout(reopenTimer);
      reopenTimer = setTimeout(() => {
        if (closed) return;
        if (reconnect) {
          clearTimeout(reconnect);
          reconnect = undefined;
        }
        backoffMs = 1000;
        es?.close();
        es = undefined;
        void connect();
        // Rattrapage des events manqués en veille — seulement si l'appelant le
        // veut (sinon un effet de bord visible se rejouerait à chaque focus).
        if (fireOnReopen) fire();
      }, 150);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') reopen();
    };
    window.addEventListener('online', reopen);
    window.addEventListener('focus', reopen);
    // `pageshow` : restauration depuis le bfcache (iOS Safari surtout) où la
    // connexion SSE a été gelée sans `onerror` → on rouvre.
    window.addEventListener('pageshow', reopen);
    document.addEventListener('visibilitychange', onVisibility);

    void connect();

    return () => {
      closed = true;
      if (debounce) clearTimeout(debounce);
      if (reconnect) clearTimeout(reconnect);
      if (reopenTimer) clearTimeout(reopenTimer);
      window.removeEventListener('online', reopen);
      window.removeEventListener('focus', reopen);
      window.removeEventListener('pageshow', reopen);
      document.removeEventListener('visibilitychange', onVisibility);
      es?.close();
    };
  }, [enabled, typesKey, debounceMs, fireOnReopen]);
}
