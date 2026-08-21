const VERSION = 'skrobot-offline-v4';
const APP_CACHE = `${VERSION}:app`;
const RUNTIME_CACHE = `${VERSION}:runtime`;
const CACHE_REQUEST = 'SKROBOT_CACHE_APP';
const CACHE_READY = 'SKROBOT_OFFLINE_READY';
const NAVIGATION_TIMEOUT_MS = 4_000;

const APP_SHELL_URLS = [
  '/manifest.webmanifest',
  '/favicon.png',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-icon.png',
  '/app-icon.png',
  '/app-icon.svg',
  '/maskable-icon-512.png',
  '/icons.svg',
  '/hero.png',
  '/fonts/montserrat-latin.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await precacheAppShell();
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

self.addEventListener('message', (event) => {
  if (event.data?.type !== CACHE_REQUEST) return;

  event.waitUntil(
    (async () => {
      try {
        await precacheAppShell();
        event.ports[0]?.postMessage({ type: CACHE_READY, version: VERSION });
      } catch {
        event.ports[0]?.postMessage({ type: 'SKROBOT_OFFLINE_FAILED', version: VERSION });
      }
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
    event.respondWith(navigationResponse(request, event));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function precacheAppShell() {
  const cache = await caches.open(APP_CACHE);
  await Promise.all(APP_SHELL_URLS.map((url) => fetchAndCache(cache, url)));

  const response = await fetch('/', { cache: 'reload' });
  if (!response.ok) {
    throw new Error(`Could not cache app shell: HTTP ${response.status}`);
  }

  await cacheDocumentAssets(cache, response.clone());
  await cache.put('/', response);
}

async function cacheDocumentAssets(cache, response) {
  const html = await response.text();
  const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter(isCacheableBuildAsset);

  await Promise.all([...new Set(assetUrls)].map((url) => fetchAndCache(cache, url)));
}

function isCacheableBuildAsset(value) {
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin && url.pathname.startsWith('/_next/static/');
  } catch {
    return false;
  }
}

async function fetchAndCache(cache, url) {
  const request = new Request(url, { cache: 'reload' });
  const response = await fetch(request);
  if (!response.ok) {
    throw new Error(`Could not cache ${url}: HTTP ${response.status}`);
  }
  await cache.put(request, response.clone());
  return response;
}

async function networkOnly(request) {
  try {
    return await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);
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

async function navigationResponse(request, event) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match('/');
  if (self.navigator.onLine === false && cached) return cached;

  try {
    const response = await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);
    if (response.ok) {
      const assetDiscoveryResponse = response.clone();
      const cachedNavigationResponse = response.clone();
      event.waitUntil(
        (async () => {
          await cacheDocumentAssets(cache, assetDiscoveryResponse);
          await cache.put('/', cachedNavigationResponse);
        })(),
      );
      return response;
    }

    // A non-OK document (deploy blip, flaky captive portal, edge glitch) must
    // never surface to the native shell as a fatal error when we already have a
    // working cached shell to fall back on. Only propagate the bad status on a
    // true first-launch miss where no cache exists yet.
    return cached || response;
  } catch {
    return cached || Response.error();
  }
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
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
