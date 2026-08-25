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
    version: 2,
    trickIdsLanded: [],
    ...overrides,
  };
}

describe('computeHero', () => {
  it('welcomes brand-new players with the easiest flatground robot', () => {
    const hero = computeHero([], emptyRecords);

    expect(hero.kind).toBe('welcome');
    // Baily includes old-school disciplines, so Sacker is the softest remaining flatground opener.
    expect(hero.robot.id).toBe('sacker');
  });

  it('recommends the next unbeaten flatground robot when records move past welcome', () => {
    const hero = computeHero([], { baily: { w: 1, l: 0 } });

    expect(hero.kind).toBe('next');
    expect(hero.robot.id).toBe('sacker');
  });

  it('offers a rematch from existing losses when the game log is empty', () => {
    const hero = computeHero([], { baily: { w: 0, l: 1 } });

    expect(hero.kind).toBe('rematch');
    expect(hero.robot.id).toBe('baily');
  });

  it('uses the latest game log entry when one exists', () => {
    const hero = computeHero([logEntry({ robotId: 'sacker', won: false })], {
      baily: { w: 1, l: 0 },
      sacker: { w: 0, l: 1 },
    });

    expect(hero.kind).toBe('rematch');
    expect(hero.robot.id).toBe('sacker');
  });

  it('keeps climbing from the robot just beaten', () => {
    const hero = computeHero([logEntry({ robotId: 'sacker', won: true })], {
      baily: { w: 1, l: 0 },
      sacker: { w: 1, l: 0 },
    });

    expect(hero.kind).toBe('next');
    // Magnet is the next robot above Gutsy in the simulated Elo ladder.
    expect(hero.robot.id).toBe('fronty');
  });

  it('ignores rival games — the ladder hero always reflects the last roster game', () => {
    const hero = computeHero(
      [logEntry({ robotId: 'sacker', won: true }), logEntry({ robotId: 'rival', won: false })],
      { sacker: { w: 1, l: 0 }, rival: { w: 0, l: 1 } },
    );

    expect(hero.kind).toBe('next');
    expect(hero.robot.id).toBe('fronty');
  });

  it('treats a rival-only log like no log at all', () => {
    const hero = computeHero([logEntry({ robotId: 'rival', won: true })], { rival: { w: 1, l: 0 } });

    expect(hero.kind).toBe('welcome');
  });
});
