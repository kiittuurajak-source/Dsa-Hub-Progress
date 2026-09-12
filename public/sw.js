// DSA Progress Hub — offline app-shell service worker.
// Scope: cache this app's own static build output + pages so the dashboard,
// question data, editor, descriptions, and test cases (all bundled into the
// JS build) remain usable offline. Never touches Supabase or other
// cross-origin requests — those are left to the network/app's own
// online/offline + outbox handling.

const SHELL_CACHE = 'dph-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== SHELL_CACHE).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests to our own origin. Everything else (Supabase,
  // POST/PUT/DELETE, third-party) passes straight through to the network.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Build assets are content-hashed and immutable — cache-first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // Pages / navigations: network-first, falling back to the last cached
  // copy when offline so the app shell still loads.
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/manifest.json') {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          const cached = await cache.match(req);
          return cached || cache.match('/');
        }
      })
    );
  }
});
