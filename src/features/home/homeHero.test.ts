import { describe, expect, it } from 'vitest';
import type { GameLogEntry, Record_ } from '@/features/records';
import { computeHero } from './homeHero';

const emptyRecords: Record<string, Record_> = {};

function logEntry(overrides: Partial<GameLogEntry>): GameLogEntry {
  return {
    date: '2026-06-26T00:00:00.000Z',
    robotId: 'shifty',
    mode: 'screen',
    won: true,
    playerLetters: 0,
    robotLetters: 5,
    tricksLanded: [],
    ...overrides,
  };
}

describe('computeHero', () => {
  it('welcomes brand-new players', () => {
    const hero = computeHero([], emptyRecords);

    expect(hero.kind).toBe('welcome');
    expect(hero.robot.id).toBe('shifty');
  });

  it('recommends the next unbeaten flatground robot when records move past welcome', () => {
    const hero = computeHero([], { shifty: { w: 1, l: 0 } });

    expect(hero.kind).toBe('next');
    expect(hero.robot.id).toBe('sacker');
  });

  it('offers a rematch from existing losses when the game log is empty', () => {
    const hero = computeHero([], { shifty: { w: 0, l: 1 } });

    expect(hero.kind).toBe('rematch');
    expect(hero.robot.id).toBe('shifty');
  });

  it('uses the latest game log entry when one exists', () => {
    const hero = computeHero([logEntry({ robotId: 'sacker', won: false })], {
      shifty: { w: 1, l: 0 },
      sacker: { w: 0, l: 1 },
    });

    expect(hero.kind).toBe('rematch');
    expect(hero.robot.id).toBe('sacker');
  });

  it('keeps climbing from the robot just beaten', () => {
    const hero = computeHero([logEntry({ robotId: 'sacker', won: true })], {
      shifty: { w: 1, l: 0 },
      sacker: { w: 1, l: 0 },
    });

    expect(hero.kind).toBe('next');
    expect(hero.robot.id).toBe('flipster');
  });
});
