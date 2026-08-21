import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameLogEntry } from './records';
import { deriveProvenTricks, deriveTrickStats, getTrickMarks } from './records';

function entry(overrides: Partial<GameLogEntry>): GameLogEntry {
  return {
    date: '2026-07-01T10:00:00.000Z',
    robotId: 'shifty',
    mode: 'screen',
    won: true,
    playerLetters: 0,
    robotLetters: 5,
    tricksLanded: [],
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
  it('returns an empty map for an empty log', () => {
    expect(deriveProvenTricks([])).toEqual({});
  });

  it('counts lands per trick name across games', () => {
    const proven = deriveProvenTricks([
      entry({ tricksLanded: ['Kickflip', 'Pop Shuvit'] }),
      entry({ tricksLanded: ['Kickflip'] }),
    ]);
    expect(proven['Kickflip'].count).toBe(2);
    expect(proven['Pop Shuvit'].count).toBe(1);
    expect(proven['Heelflip']).toBeUndefined();
  });

  it('keeps the most recent game as the last land', () => {
    const proven = deriveProvenTricks([
      entry({ date: '2026-06-01T10:00:00.000Z', robotId: 'shifty', tricksLanded: ['Kickflip'] }),
      entry({ date: '2026-07-01T10:00:00.000Z', robotId: 'pivot', tricksLanded: ['Kickflip'] }),
    ]);
    expect(proven['Kickflip'].lastDate).toBe('2026-07-01T10:00:00.000Z');
    expect(proven['Kickflip'].lastRobotId).toBe('pivot');
  });

  it('counts a trick landed twice in one game twice', () => {
    const proven = deriveProvenTricks([entry({ tricksLanded: ['Kickflip', 'Kickflip'] })]);
    expect(proven['Kickflip'].count).toBe(2);
  });
});

describe('deriveTrickStats', () => {
  it('returns an empty map for an empty log', () => {
    expect(deriveTrickStats([])).toEqual({});
  });

  it('skips legacy entries logged before attempt tracking', () => {
    expect(deriveTrickStats([entry({ tricksLanded: ['Kickflip'] })])).toEqual({});
  });

  it('folds makes and misses across games into a consistency rate', () => {
    const stats = deriveTrickStats([
      entry({
        trickAttempts: [
          { trick: 'Kickflip', landed: true },
          { trick: 'Kickflip', landed: false },
        ],
      }),
      entry({
        trickAttempts: [
          { trick: 'Kickflip', landed: true },
          { trick: 'Pop Shuvit', landed: false },
        ],
      }),
    ]);
    expect(stats['Kickflip']).toMatchObject({ attempts: 3, makes: 2, misses: 1, rate: 2 / 3 });
    expect(stats['Pop Shuvit']).toMatchObject({ attempts: 1, makes: 0, misses: 1, rate: 0 });
  });

  it('counts every last-letter retry as its own attempt', () => {
    const stats = deriveTrickStats([
      entry({
        trickAttempts: [
          { trick: 'Heelflip', landed: false },
          { trick: 'Heelflip', landed: false },
        ],
      }),
    ]);
    expect(stats['Heelflip']).toMatchObject({ attempts: 2, makes: 0, misses: 2, rate: 0 });
  });

  it('keeps the most recent game as the last attempt', () => {
    const stats = deriveTrickStats([
      entry({
        date: '2026-06-01T10:00:00.000Z',
        robotId: 'shifty',
        trickAttempts: [{ trick: 'Kickflip', landed: true }],
      }),
      entry({
        date: '2026-07-01T10:00:00.000Z',
        robotId: 'pivot',
        trickAttempts: [{ trick: 'Kickflip', landed: false }],
      }),
    ]);
    expect(stats['Kickflip'].lastDate).toBe('2026-07-01T10:00:00.000Z');
    expect(stats['Kickflip'].lastRobotId).toBe('pivot');
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

  it('treats malformed mark storage as empty', () => {
    localStorage.setItem('skaterobot-trickbook', JSON.stringify(['learning']));
    expect(getTrickMarks()).toEqual({});
  });
});
