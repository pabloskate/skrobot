import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushAnalyticsEvents, trackAnalyticsEvent } from './api';

const store = new Map<string, string>();
const browserWindow = new EventTarget();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'navigator');
  Reflect.deleteProperty(globalThis, 'localStorage');
});

const started = {
  name: 'game_started' as const,
  properties: {
    gameId: 'game-id-123',
    robotId: 'shifty',
    mode: 'screen' as const,
    gameFormat: 'skate' as const,
    gameVariant: 'classic' as const,
  },
};

describe('analytics delivery', () => {
  it('queues offline and flushes when online', async () => {
    trackAnalyticsEvent(started, 'web');
    expect(JSON.parse(store.get('skrobot.analytics.queue.v1') ?? '[]')).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();

    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 202 }));
    await flushAnalyticsEvents();

    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(store.get('skrobot.analytics.queue.v1') ?? '[]')).toEqual([]);
  });

  it('retains events after a server failure', async () => {
    trackAnalyticsEvent(started, 'native');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    await flushAnalyticsEvents();

    expect(JSON.parse(store.get('skrobot.analytics.queue.v1') ?? '[]')).toHaveLength(1);
  });
});
