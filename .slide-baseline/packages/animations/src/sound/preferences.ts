'use client';

import { useSyncExternalStore } from 'react';
import { getAudioContext } from './audio';

const KEY = 'skaterobot-sound-effects';
const CHANGE = 'skrobot-sound-effects';
let sessionValue = false;
let sessionOnly = false;

/** Effects are opt-in; an absent or unknown saved value is silent. */
export function getSoundEffects(): boolean {
  if (typeof window === 'undefined') return false;
  if (sessionOnly) return sessionValue;
  try {
    return window.localStorage.getItem(KEY) === 'on';
  } catch {
    return sessionValue;
  }
}

export function setSoundEffects(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  sessionValue = enabled;
  try {
    window.localStorage.setItem(KEY, enabled ? 'on' : 'off');
    sessionOnly = false;
  } catch {
    // The toggle still works for this visit when storage is unavailable.
    sessionOnly = true;
  }
  // Resume within the toggle's user gesture, so enabling works immediately on Safari too.
  if (enabled) getAudioContext();
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(changed: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) changed();
  };
  window.addEventListener(CHANGE, changed);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE, changed);
    window.removeEventListener('storage', onStorage);
  };
}

/** One device preference shared by game effects, Explorer playback and downloads. */
export function useSoundEffects(): boolean {
  return useSyncExternalStore(subscribe, getSoundEffects, () => false);
}
