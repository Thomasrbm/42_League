/* eslint-env serviceworker */
// Handlers Web Push — chargés dans le service worker Workbox via
// workbox.importScripts (cf. vite.config.ts). Affiche la notification reçue
// et ouvre/refocalise l'app sur le lien au clic.

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let n = {};
  try {
    n = event.data.json();
  } catch {
    n = { title: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(n.title || '42 League', {
      body: n.body || '',
      icon: '/apple-touch-icon.png',
      badge: '/favicon-32.png',
      data: { link: n.link || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(link);
          return c.focus();
        }
      }
      return clients.openWindow(link);
    }),
  );
});
