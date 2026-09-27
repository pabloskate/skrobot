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
const TRACKING_KEY = 'skaterobot-trick-tracking';
const TRACKING_CHANGE_EVENT = 'skrobot-trick-tracking';
const DEFAULT_TRACKING = true;

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

/**
 * Whether matches feed per-trick evidence (attempts + proven lands) into the
 * player's stats. Default ON: the whole point of the app is consistency data,
 * so a tracked game requires attributing every attempt — a missed set must
 * name the trick it missed. When OFF, games still count toward the W/L record
 * but record no trick evidence, and missed sets pass without naming a trick.
 */
export function getTrickTracking(): boolean {
  if (typeof window === 'undefined') return DEFAULT_TRACKING;
  try {
    return localStorage.getItem(TRACKING_KEY) !== 'off';
  } catch {
    return DEFAULT_TRACKING;
  }
}

export function setTrickTracking(enabled: boolean): void {
  try {
    localStorage.setItem(TRACKING_KEY, enabled ? 'on' : 'off');
    window.dispatchEvent(new Event(TRACKING_CHANGE_EVENT));
  } catch {
    // Storage can be unavailable in private browsing; keep the default.
  }
}

function subscribeTrickTracking(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === TRACKING_KEY || event.key == null) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(TRACKING_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(TRACKING_CHANGE_EVENT, onStoreChange);
  };
}

export function useTrickTracking(): boolean {
  return useSyncExternalStore(subscribeTrickTracking, getTrickTracking, () => DEFAULT_TRACKING);
}
