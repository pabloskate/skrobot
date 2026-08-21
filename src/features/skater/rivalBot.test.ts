import { describe, expect, it } from 'vitest';
import type { GameLogEntry, TrickAttempt } from '@/features/records';
import { buildBag, ROBOT_BY_ID } from '@/features/robots';
import { tricksFor } from '@/features/tricks';
import { buildRivalRobot, isRivalId, resolveRobot, RIVAL_ID, rivalDelta, rivalFavorites } from './rivalBot';
import { SKATE_SCORE_UNLOCK_GAMES } from './skateScore';

const FLAT = tricksFor('flatground');

let gameCounter = 0;
function game(attempts: TrickAttempt[]): GameLogEntry {
  gameCounter += 1;
  return {
    date: `2026-08-${String((gameCounter % 28) + 1).padStart(2, '0')}`,
    robotId: 'shifty',
    mode: 'screen',
    won: true,
    playerLetters: 1,
    robotLetters: 5,
    tricksLanded: attempts.filter((a) => a.landed).map((a) => a.trick),
    trickAttempts: attempts,
  };
}

/** An 8-game log where the player lands basics and some kickflips. */
function beginnerLog(): GameLogEntry[] {
  const perGame: TrickAttempt[] = [
    { trick: 'Ollie', landed: true },
    { trick: 'Pop Shuvit', landed: true },
    { trick: 'Frontside 180', landed: true },
    { trick: 'Kickflip', landed: true },
    { trick: 'Heelflip', landed: false },
  ];
  return Array.from({ length: SKATE_SCORE_UNLOCK_GAMES }, () => game(perGame));
}

describe('isRivalId', () => {
  it('matches only the rival id', () => {
    expect(isRivalId(RIVAL_ID)).toBe(true);
    expect(isRivalId('shifty')).toBe(false);
  });
});

describe('rivalDelta', () => {
  it('starts half a skill point above the player', () => {
    expect(rivalDelta(undefined)).toBe(0.5);
    expect(rivalDelta({ w: 0, l: 0 })).toBe(0.5);
  });

  it('gets harder when the player wins, softer when they lose', () => {
    expect(rivalDelta({ w: 2, l: 0 })).toBe(1);
    expect(rivalDelta({ w: 0, l: 2 })).toBe(0.1); // clamped at the floor
    expect(rivalDelta({ w: 3, l: 1 })).toBe(1);
  });

  it('clamps at the cap no matter how lopsided the record', () => {
    expect(rivalDelta({ w: 40, l: 0 })).toBe(1.5);
  });
});

describe('rivalFavorites', () => {
  it('picks the cheapest bases the player has not proven — the tricks they chase', () => {
    // Player has ollie/180s/shuvits — kickflip should be the very next chase.
    const provenNames = ['Ollie', 'Pop Shuvit', 'Frontside Shuvit', 'Frontside 180', 'Backside 180'];
    const proven = Object.fromEntries(
      provenNames.map((name) => [name, { count: 1, lastDate: '2026-08-01', lastRobotId: 'shifty' }]),
    );
    const favorites = rivalFavorites(proven);
    // Cheapest unproven bases: ollie north (2), then kickflip (3), then heelflip (4).
    expect(favorites).toEqual(['Ollie North', 'Kickflip', 'Heelflip']);
    for (const fav of favorites) {
      expect(provenNames).not.toContain(fav);
    }
  });

  it('never doubles up on a base through stance variants', () => {
    const favorites = rivalFavorites({});
    expect(new Set(favorites).size).toBe(favorites.length);
  });
});

describe('buildRivalRobot', () => {
  it('is null while the skate score is locked', () => {
    expect(buildRivalRobot([], {})).toBeNull();
    expect(buildRivalRobot(beginnerLog().slice(0, SKATE_SCORE_UNLOCK_GAMES - 1), {})).toBeNull();
  });

  it('skates at the player score plus the delta', () => {
    const rival = buildRivalRobot(beginnerLog(), {})!;
    expect(rival).not.toBeNull();
    // Beginner log ⇒ score in the 2-5 band; rival sits 0.5 above, roster-floored.
    expect(rival.skill).toBeGreaterThan(2);
    expect(rival.skill).toBeLessThan(6);
  });

  it('gets harder after the player beats it', () => {
    const log = beginnerLog();
    const before = buildRivalRobot(log, {})!;
    const after = buildRivalRobot(log, { [RIVAL_ID]: { w: 2, l: 0 } })!;
    expect(after.skill).toBeCloseTo(before.skill + 0.5, 5);
  });

  it('never exceeds the top of the roster', () => {
    // A pro-level log: lands tre flips and hardflips consistently.
    const proGame: TrickAttempt[] = [
      { trick: '360 Flip', landed: true },
      { trick: 'Hardflip', landed: true },
      { trick: 'Kickflip', landed: true },
      { trick: 'Laser Flip', landed: true },
      { trick: 'Impossible', landed: true },
    ];
    const log = Array.from({ length: SKATE_SCORE_UNLOCK_GAMES }, () => game(proGame));
    const rival = buildRivalRobot(log, { [RIVAL_ID]: { w: 30, l: 0 } })!;
    expect(rival.skill).toBeLessThanOrEqual(9.2);
  });

  it('has a real bag: rivals the player where they are and reaches past them', () => {
    const log = beginnerLog();
    const rival = buildRivalRobot(log, {})!;
    const bag = buildBag(rival, FLAT);
    // Shares the player's world...
    expect(bag.has('regular-pop-shuvit')).toBe(true);
    // ...but never the elite tier.
    expect(bag.has('regular-360-double-kickflip')).toBe(false);
    expect(bag.has('regular-bs-bigspin-heelflip')).toBe(false);
    // And its signatures are the player's next tricks, not the player's bag.
    for (const fav of rival.favorites) expect(fav).not.toBe('Ollie');
  });
});

describe('resolveRobot', () => {
  it('resolves roster robots without needing the log', () => {
    expect(resolveRobot('shifty', [], {})?.id).toBe('shifty');
  });

  it('resolves the rival from current form (for saved-game resume)', () => {
    const rival = resolveRobot(RIVAL_ID, beginnerLog(), {})!;
    expect(rival.id).toBe(RIVAL_ID);
  });

  it('returns undefined for the rival while locked, and for unknown ids', () => {
    expect(resolveRobot(RIVAL_ID, [], {})).toBeUndefined();
    expect(resolveRobot('nobody', beginnerLog(), {})).toBeUndefined();
  });

  it('is not in the static roster', () => {
    expect(ROBOT_BY_ID.has(RIVAL_ID)).toBe(false);
  });
});
