'use client';

import { useEffect } from 'react';

const CACHE_REQUEST = 'SKROBOT_CACHE_APP';
const CACHE_READY = 'SKROBOT_OFFLINE_READY';
const READY_STORAGE_KEY = 'skrobot-offline-ready-version';
const CACHE_REQUEST_TIMEOUT_MS = 20_000;

interface CacheResult {
  type?: string;
  version?: string;
}

function requestOfflineCache(worker: ServiceWorker): Promise<CacheResult> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error('Offline cache timed out'));
    }, CACHE_REQUEST_TIMEOUT_MS);

    channel.port1.onmessage = (event: MessageEvent<CacheResult>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data);
    };

    worker.postMessage({ type: CACHE_REQUEST }, [channel.port2]);
  });
}

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        try {
          await registration.update();
        } catch {
          // An installed worker can still serve the cached app while offline.
        }

        const readyRegistration = await navigator.serviceWorker.ready;
        const worker = readyRegistration.active;
        if (!worker) return;

        const result = await requestOfflineCache(worker);
        if (result.type !== CACHE_READY || !result.version) return;

        localStorage.setItem(READY_STORAGE_KEY, result.version);
        window.dispatchEvent(
          new CustomEvent('skrobot:offline-ready', { detail: { version: result.version } }),
        );
      } catch {
        // Offline support is best-effort; the app must keep running if registration fails.
      }
    };

    void register();
  }, []);

  return null;
}
