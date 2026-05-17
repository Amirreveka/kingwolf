const CACHE = 'kw-v3';
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Never cache API, WS, uploads
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads') || url.pathname.startsWith('/realtime')) return;

  // For navigation requests (HTML pages), always serve index.html from cache first
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('/index.html').then(cached => {
        const fresh = fetch('/index.html').then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put('/index.html', res.clone()));
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});

self.addEventListener('push', e => {
  if (!e.data) return;
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'KingWolf', body: e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(d.title || 'KingWolf', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag || 'kw-msg',
      renotify: true,
      requireInteraction: false,
      silent: false,
      vibrate: [200, 100, 200, 100, 200],
      timestamp: Date.now(),
      data: { url: d.url || '/', conversationId: d.conversationId },
      actions: [
        { action: 'open', title: 'باز کردن' },
        { action: 'dismiss', title: 'بستن' },
      ],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
