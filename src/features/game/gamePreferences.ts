'use client';

import { useSyncExternalStore } from 'react';
import type { GameFormat } from './engine';

const KEY = 'skaterobot-game-format';
const CHANGE_EVENT = 'skrobot-game-format';
const DEFAULT_FORMAT: GameFormat = 'skate';

export function getGameFormat(): GameFormat {
  if (typeof window === 'undefined') return DEFAULT_FORMAT;
  try {
    return localStorage.getItem(KEY) === 'sk8' ? 'sk8' : DEFAULT_FORMAT;
  } catch {
    return DEFAULT_FORMAT;
  }
}

export function setGameFormat(format: GameFormat): void {
  try {
    localStorage.setItem(KEY, format);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage can be unavailable in private browsing; keep the default.
  }
}

export function subscribeGameFormat(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key == null) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

export function useGameFormat(): GameFormat {
  return useSyncExternalStore(subscribeGameFormat, getGameFormat, () => DEFAULT_FORMAT);
}
