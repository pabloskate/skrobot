import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPlayerStance, getTrickTracking, setPlayerStance, setTrickTracking } from './gamePreferences';

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

describe('trick tracking preference', () => {
  it('defaults to on when unset or invalid', () => {
    expect(getTrickTracking()).toBe(true);
    localStorage.setItem('skaterobot-trick-tracking', 'banana');
    expect(getTrickTracking()).toBe(true);
  });

  it('persists off and announces the same-tab change', () => {
    const { events } = installBrowserStorage();
    setTrickTracking(false);
    expect(getTrickTracking()).toBe(false);
    expect(events).toContain('skrobot-trick-tracking');
  });

  it('can be turned back on', () => {
    setTrickTracking(false);
    setTrickTracking(true);
    expect(getTrickTracking()).toBe(true);
  });
});
