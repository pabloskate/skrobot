import { describe, expect, it } from 'vitest';
import type { GameLogEntry } from './records';
import { deriveProvenTricks } from './records';

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
