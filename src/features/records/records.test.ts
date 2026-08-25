import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameLogEntry } from './records';
import {
  deriveProvenTricks,
  deriveTrickStats,
  getGameLog,
  getRecords,
  getTrickMarks,
  recordCompletedMatch,
  subscribeRecords,
} from './records';

function entry(overrides: Partial<GameLogEntry>): GameLogEntry {
  return {
    version: 2,
    date: '2026-07-01T10:00:00.000Z',
    robotId: 'shifty',
    mode: 'screen',
    won: true,
    playerLetters: 0,
    robotLetters: 5,
    trickIdsLanded: [],
    ...overrides,
  };
}

function installLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
}

beforeEach(() => {
  installLocalStorage();
});

afterEach(() => {
  localStorage.clear();
});

describe('deriveProvenTricks', () => {
  it('counts lands by stable trick id across games', () => {
    const proven = deriveProvenTricks([
      entry({ trickIdsLanded: ['regular-kickflip', 'regular-pop-shuvit'] }),
      entry({ trickIdsLanded: ['regular-kickflip'] }),
    ]);
    expect(proven['regular-kickflip'].count).toBe(2);
    expect(proven['regular-pop-shuvit'].count).toBe(1);
    expect(proven['regular-heelflip']).toBeUndefined();
  });

  it('keeps the most recent game as the last land', () => {
    const proven = deriveProvenTricks([
      entry({ date: '2026-06-01T10:00:00.000Z', robotId: 'shifty', trickIdsLanded: ['regular-kickflip'] }),
      entry({ date: '2026-07-01T10:00:00.000Z', robotId: 'pivot', trickIdsLanded: ['regular-kickflip'] }),
    ]);
    expect(proven['regular-kickflip'].lastDate).toBe('2026-07-01T10:00:00.000Z');
    expect(proven['regular-kickflip'].lastRobotId).toBe('pivot');
  });

  it('counts a trick landed twice in one game twice', () => {
    const proven = deriveProvenTricks([
      entry({ trickIdsLanded: ['regular-kickflip', 'regular-kickflip'] }),
    ]);
    expect(proven['regular-kickflip'].count).toBe(2);
  });
});

describe('deriveTrickStats', () => {
  it('skips entries logged before attempt tracking', () => {
    expect(deriveTrickStats([entry({ trickIdsLanded: ['regular-kickflip'] })])).toEqual({});
  });

  it('folds makes and misses into a consistency rate', () => {
    const stats = deriveTrickStats([
      entry({
        trickAttempts: [
          { trickId: 'regular-kickflip', landed: true },
          { trickId: 'regular-kickflip', landed: false },
        ],
      }),
      entry({
        trickAttempts: [
          { trickId: 'regular-kickflip', landed: true },
          { trickId: 'regular-pop-shuvit', landed: false },
        ],
      }),
    ]);
    expect(stats['regular-kickflip']).toMatchObject({ attempts: 3, makes: 2, misses: 1, rate: 2 / 3 });
    expect(stats['regular-pop-shuvit']).toMatchObject({ attempts: 1, makes: 0, misses: 1, rate: 0 });
  });

  it('counts every last-letter retry as its own attempt', () => {
    const stats = deriveTrickStats([
      entry({
        trickAttempts: [
          { trickId: 'regular-heelflip', landed: false },
          { trickId: 'regular-heelflip', landed: false },
        ],
      }),
    ]);
    expect(stats['regular-heelflip']).toMatchObject({ attempts: 2, makes: 0, misses: 2, rate: 0 });
  });
});

describe('stored data migration and writes', () => {
  it('migrates legacy display-name logs to versioned trick ids', () => {
    localStorage.setItem('skaterobot-gamelog', JSON.stringify([{
      date: '2026-07-01T10:00:00.000Z',
      robotId: 'shifty',
      mode: 'screen',
      won: true,
      playerLetters: 0,
      robotLetters: 5,
      tricksLanded: ['Kickflip', 'Half Cab'],
      trickAttempts: [{ trick: 'Kickflip', landed: true }],
    }]));

    expect(getGameLog()[0]).toMatchObject({
      version: 2,
      trickIdsLanded: ['regular-kickflip', 'fakie-backside-180'],
      trickAttempts: [{ trickId: 'regular-kickflip', landed: true }],
    });
    expect(JSON.parse(localStorage.getItem('skaterobot-gamelog') ?? '[]')[0].tricksLanded).toBeUndefined();
  });

  it('records W/L and evidence through one operation and notifies same-tab subscribers', () => {
    const notify = vi.fn();
    const unsubscribe = subscribeRecords(notify);
    recordCompletedMatch({
      date: '2026-07-01T10:00:00.000Z',
      robotId: 'shifty',
      mode: 'screen',
      won: true,
      playerLetters: 0,
      robotLetters: 5,
      trickIdsLanded: ['regular-kickflip'],
      trickAttempts: [{ trickId: 'regular-kickflip', landed: true }],
    });

    expect(getRecords()).toEqual({ shifty: { w: 1, l: 0 } });
    expect(getGameLog()).toHaveLength(1);
    expect(notify).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('drops malformed aggregate records', () => {
    localStorage.setItem('skaterobot-records', JSON.stringify({ shifty: { w: -1, l: 2 }, pivot: { w: 3, l: 1 } }));
    expect(getRecords()).toEqual({ pivot: { w: 3, l: 1 } });
  });
});

describe('getTrickMarks', () => {
  it('keeps learning marks', () => {
    localStorage.setItem('skaterobot-trickbook', JSON.stringify({ 'regular-kickflip': 'learning' }));
    expect(getTrickMarks()).toEqual({ 'regular-kickflip': 'learning' });
  });

  it('drops legacy claimed marks and rewrites storage', () => {
    localStorage.setItem(
      'skaterobot-trickbook',
      JSON.stringify({ 'regular-ollie': 'claimed', 'regular-kickflip': 'learning' }),
    );
    expect(getTrickMarks()).toEqual({ 'regular-kickflip': 'learning' });
    expect(JSON.parse(localStorage.getItem('skaterobot-trickbook') ?? '{}')).toEqual({
      'regular-kickflip': 'learning',
    });
  });
});
