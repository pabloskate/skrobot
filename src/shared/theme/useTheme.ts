'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

/** localStorage key, shared by the hook and the pre-paint init script. */
export const THEME_STORAGE_KEY = 'skrobot:theme';

/**
 * Runs in <head> before React hydrates so the saved (or system) theme is applied
 * before first paint — no flash of the wrong palette. Keep in sync with useTheme.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`;

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

// The DOM (`data-theme` on <html>) is the source of truth; React subscribes to it
// via useSyncExternalStore so SSR/hydration stay consistent with no setState-in-effect.
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getServerSnapshot = (): Theme => 'light';

/**
 * Reads/writes the active theme. The init script (themeInitScript) applies
 * `data-theme` on <html> before paint; the CSS variables in globals.css key off
 * it. This hook reflects that value into React and flips it on toggle.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // private mode / storage disabled — theme still applies for this session.
    }
    listeners.forEach((l) => l());
  }, []);

  const toggle = useCallback(() => {
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, setTheme, toggle };
}
