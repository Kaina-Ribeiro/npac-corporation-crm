/* global self, URL */
/* Service worker do NPAC CRM: só avisos (Web Push). Sem cache de páginas nem de dados. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Quem está com o chat aberto e em foco já vê a mensagem: sem alerta do sistema.
      const watching = windows.some(
        (w) =>
          w.focused && w.visibilityState === 'visible' && new URL(w.url).pathname.startsWith(url),
      );
      if (data.tag === 'chat' && watching) return;
      await self.registration.showNotification(data.title || 'NPAC CRM', {
        body: data.body || undefined,
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        data: { url },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ('navigate' in open) await open.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
