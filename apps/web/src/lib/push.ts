import { api } from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Web Push côté client — abonnement/désabonnement de CET appareil.
// Le SW est celui de la PWA (vite-plugin-pwa) ; les handlers push vivent dans
// public/sw-push.js, injectés via workbox.importScripts.
// ─────────────────────────────────────────────────────────────────────────────

export type PushState = 'unsupported' | 'denied' | 'on' | 'off';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Base64 URL-safe → Uint8Array (format attendu par pushManager.subscribe). */
function b64ToUint8(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/** Active le push sur cet appareil. Jette une erreur affichable si refus/config. */
export async function enablePush(): Promise<void> {
  const { enabled, key } = await api.pushVapidKey();
  if (!enabled || !key) throw new Error('Notifications push non configurées côté serveur.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permission refusée par le navigateur.');
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToUint8(key) as BufferSource,
    }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('Abonnement navigateur invalide.');
  }
  await api.pushSubscribe({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
