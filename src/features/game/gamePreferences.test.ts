import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPlayerStance, setPlayerStance } from './gamePreferences';

function installBrowserStorage() {
  const store = new Map<string, string>();
  const events: string[] = [];

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      dispatchEvent: (event: Event) => events.push(event.type),
    },
  });

  return { events, store };
}

beforeEach(() => {
  installBrowserStorage();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('player stance preference', () => {
  it('defaults invalid or missing values to regular', () => {
    expect(getPlayerStance()).toBe('regular');
    localStorage.setItem('skaterobot-player-stance', 'mongo');
    expect(getPlayerStance()).toBe('regular');
  });

  it('persists goofy and announces the same-tab change', () => {
    const { events } = installBrowserStorage();
    setPlayerStance('goofy');
    expect(getPlayerStance()).toBe('goofy');
    expect(events).toContain('skrobot-player-stance');
  });
});
