'use client';

import { useSyncExternalStore } from 'react';

function onlineSnapshot(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

function subscribeToOnlineStatus(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeToOnlineStatus, onlineSnapshot, () => true);
}
