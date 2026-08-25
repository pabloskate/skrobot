'use client';

import { useSyncExternalStore } from 'react';
import type { GameFormat, GameVariant } from './engine';

export type PlayerStance = 'regular' | 'goofy';

const KEY = 'skaterobot-game-format';
const CHANGE_EVENT = 'skrobot-game-format';
const DEFAULT_FORMAT: GameFormat = 'skate';
const VARIANT_KEY = 'skaterobot-game-variant';
const VARIANT_CHANGE_EVENT = 'skrobot-game-variant';
const DEFAULT_VARIANT: GameVariant = 'classic';
const STANCE_KEY = 'skaterobot-player-stance';
const STANCE_CHANGE_EVENT = 'skrobot-player-stance';
const DEFAULT_STANCE: PlayerStance = 'regular';

function getGameFormat(): GameFormat {
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

function subscribeGameFormat(onStoreChange: () => void): () => void {
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

function getGameVariant(): GameVariant {
  if (typeof window === 'undefined') return DEFAULT_VARIANT;
  try {
    return localStorage.getItem(VARIANT_KEY) === 'defense' ? 'defense' : 'classic';
  } catch {
    return DEFAULT_VARIANT;
  }
}

export function setGameVariant(variant: GameVariant): void {
  try {
    localStorage.setItem(VARIANT_KEY, variant);
    window.dispatchEvent(new Event(VARIANT_CHANGE_EVENT));
  } catch {
    // Storage can be unavailable in private browsing; keep the default.
  }
}

function subscribeGameVariant(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === VARIANT_KEY || event.key == null) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(VARIANT_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(VARIANT_CHANGE_EVENT, onStoreChange);
  };
}

export function useGameVariant(): GameVariant {
  return useSyncExternalStore(subscribeGameVariant, getGameVariant, () => DEFAULT_VARIANT);
}

export function getPlayerStance(): PlayerStance {
  if (typeof window === 'undefined') return DEFAULT_STANCE;
  try {
    return localStorage.getItem(STANCE_KEY) === 'goofy' ? 'goofy' : DEFAULT_STANCE;
  } catch {
    return DEFAULT_STANCE;
  }
}

export function setPlayerStance(stance: PlayerStance): void {
  try {
    localStorage.setItem(STANCE_KEY, stance);
    window.dispatchEvent(new Event(STANCE_CHANGE_EVENT));
  } catch {
    // Storage can be unavailable in private browsing; keep the default.
  }
}

function subscribePlayerStance(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === STANCE_KEY || event.key == null) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(STANCE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(STANCE_CHANGE_EVENT, onStoreChange);
  };
}

export function usePlayerStance(): PlayerStance {
  return useSyncExternalStore(subscribePlayerStance, getPlayerStance, () => DEFAULT_STANCE);
}
