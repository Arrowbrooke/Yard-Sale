const APP_URL = '/Yard-Sale/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data?.json() || {};
  } catch {
    message = { body: event.data?.text() || 'A new home was added to the yard sale map.' };
  }

  const options = {
    body: message.body || 'A new home was added to the yard sale map.',
    icon: 'apple-touch-icon.png',
    badge: 'apple-touch-icon.png',
    tag: message.tag || 'new-yard-sale',
    data: { url: message.url || APP_URL },
    vibrate: [120, 80, 120]
  };

  event.waitUntil(self.registration.showNotification(message.title || 'New yard sale 🍂', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || APP_URL, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const windowClient of windows) {
      if (windowClient.url.startsWith(self.location.origin + APP_URL) && 'focus' in windowClient) {
        await windowClient.navigate(destination);
        return windowClient.focus();
      }
    }
    return self.clients.openWindow(destination);
  })());
});
