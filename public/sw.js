const VERSION = 'skrobot-offline-v1';
const APP_CACHE = `${VERSION}:app`;
const RUNTIME_CACHE = `${VERSION}:runtime`;

const APP_SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.png',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-icon.png',
  '/app-icon.png',
  '/app-icon.svg',
  '/icons.svg',
  '/hero.png',
];

const FONT_ORIGINS = new Set(['https://fonts.googleapis.com', 'https://fonts.gstatic.com']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      await cache.addAll(APP_SHELL_URLS);
      await cacheDiscoveredShellAssets(cache);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('skrobot-offline-') && !name.startsWith(VERSION))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(networkOnly(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.origin === self.location.origin || FONT_ORIGINS.has(url.origin)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function cacheDiscoveredShellAssets(cache) {
  try {
    const response = await fetch('/', { cache: 'reload' });
    if (!response.ok) return;

    await cache.put('/', response.clone());
    const html = await response.text();
    const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((assetUrl) => assetUrl.startsWith('/_next/static/'));

    await Promise.allSettled(assetUrls.map((assetUrl) => cache.add(assetUrl)));
  } catch {
    // The static public assets still give us the best available cached shell.
  }
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }
}

async function navigationResponse(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put('/', response.clone());
      await cacheDiscoveredShellAssets(cache);
    }
    return response;
  } catch {
    return (await cache.match('/')) || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(APP_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const revalidate = fetch(request)
    .then(async (response) => {
      if (response.ok || response.type === 'opaque') {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  return cached || (await revalidate) || Response.error();
}
