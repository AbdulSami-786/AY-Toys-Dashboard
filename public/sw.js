// AY Toys offline support: keeps a copy of the app's own files so it opens without internet.
// The books themselves are kept in the browser database (src/store/storage.js); requests to the
// Google Sheet and to other sites always go to the network and are never stored here.

const CACHE = 'ay-app-v1';
const EXTRA = ['/favicon.svg', '/manifest.webmanifest'];
const assetsIn = (html) => [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);

// Fetch the current page, keep it and every file it uses, and drop files of older versions.
async function refresh() {
  const cache = await caches.open(CACHE);
  const res = await fetch('/', { cache: 'no-store' });
  if (!res.ok) return;
  const html = await res.clone().text();
  const assets = assetsIn(html);
  await Promise.all([...assets, ...EXTRA].map((u) => cache.add(u).catch(() => {})));
  await cache.put('/', res);
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/assets/') && !assets.includes(path)) await cache.delete(req);
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    refresh()
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google Sheet, fonts: straight to the network

  // the page: the newest one when the server answers quickly, else the saved copy
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        try {
          const res = await withTimeout(fetch(req), 5000);
          if (res.ok) e.waitUntil(refresh().catch(() => {}));
          return res;
        } catch {
          return (await caches.match('/')) || Response.error();
        }
      })(),
    );
    return;
  }

  // app files never change under the same name: saved copy first
  if (url.pathname.startsWith('/assets/') || EXTRA.includes(url.pathname)) {
    e.respondWith(
      (async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
        }
        return res;
      })(),
    );
  }
});
