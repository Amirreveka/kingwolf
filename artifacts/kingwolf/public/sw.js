const CACHE = 'kw-v5';
const PRECACHE = ['/', '/index.html', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // allSettled: if any file missing, install still succeeds
      Promise.allSettled(PRECACHE.map(url => c.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
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

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Skip: API, WebSocket, uploads — always go to network
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/uploads') ||
    url.pathname.startsWith('/realtime') ||
    url.pathname.startsWith('/auth')
  ) return;

  // Navigation (page loads) → NETWORK FIRST to prevent stale-HTML white screen
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(res => {
          if (res.ok) {
            caches.open(CACHE).then(c => c.put('/index.html', res.clone()));
          }
          return res;
        })
        .catch(() =>
          caches.match('/index.html').then(cached =>
            cached || new Response('<h1>آفلاین</h1>', { headers: { 'Content-Type': 'text/html;charset=utf-8' }, status: 503 })
          )
        )
    );
    return;
  }

  // Static assets (JS, CSS, fonts, images) → cache-first, update in background
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => null);
      return cached || fetchPromise || new Response('', { status: 503 });
    })
  );
});

// Push notifications
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
        { action: 'open',    title: 'باز کردن' },
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
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
