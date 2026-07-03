'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        await registration.update();
      } catch {
        // Offline support is best-effort; the app must keep running if registration fails.
      }
    };

    void register();
  }, []);

  return null;
}
