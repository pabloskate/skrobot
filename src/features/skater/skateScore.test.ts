import { describe, expect, it } from 'vitest';
import type { GameLogEntry, ProvenTrick, TrickAttempt } from '@/features/records';
import { ROBOTS, isFlatgroundRobot } from '@/features/robots';
import { tricksFor } from '@/features/tricks';
import {
  computeSkateScore,
  fitRobotEquivalentSkill,
  frontierSkill,
  ladderSpot,
  SKATE_SCORE_UNLOCK_GAMES,
  skateScoreUnlocked,
} from './skateScore';

const FLAT = tricksFor('flatground');

const proven = (names: string[]): Record<string, ProvenTrick> =>
  Object.fromEntries(
    names.map((name) => [name, { count: 1, lastDate: '2026-07-01', lastRobotId: 'shifty' }]),
  );

let gameCounter = 0;
/** A completed-game log entry with the given trick attempts. */
function game(attempts: TrickAttempt[], tricksLanded?: string[]): GameLogEntry {
  gameCounter += 1;
  return {
    date: `2026-07-${String((gameCounter % 28) + 1).padStart(2, '0')}`,
    robotId: 'shifty',
    mode: 'screen',
    won: true,
    playerLetters: 1,
    robotLetters: 5,
    tricksLanded: tricksLanded ?? attempts.filter((a) => a.landed).map((a) => a.trick),
    trickAttempts: attempts,
  };
}

/** N games repeating the same per-game attempts. */
function logOf(attempts: TrickAttempt[], games: number): GameLogEntry[] {
  return Array.from({ length: games }, () => game(attempts));
}

describe('skateScoreUnlocked', () => {
  it('is locked before 8 completed games and unlocked at 8', () => {
    expect(SKATE_SCORE_UNLOCK_GAMES).toBe(8);
    expect(skateScoreUnlocked(logOf([], SKATE_SCORE_UNLOCK_GAMES - 1))).toBe(false);
    expect(skateScoreUnlocked(logOf([], SKATE_SCORE_UNLOCK_GAMES))).toBe(true);
  });
});

describe('frontierSkill', () => {
  it('is null until the bag has 3 tricks', () => {
    expect(frontierSkill(FLAT, proven(['Ollie', 'Kickflip']))).toBeNull();
  });

  it('is the mean difficulty of the 3 hardest tricks in the bag', () => {
    // top 3: heelflip 4, kickflip 3, pop shuvit 2
    expect(frontierSkill(FLAT, proven(['Ollie', 'Pop Shuvit', 'Kickflip', 'Heelflip']))).toBe(3);
  });

  it('is a frontier: a pile of easy tricks does not outrank hard ones', () => {
    const easy = proven(['Ollie', 'Fakie Ollie', 'Pop Shuvit', 'Frontside Shuvit', 'Frontside 180', 'Backside 180']);
    const hard = proven(['Kickflip', 'Heelflip', '360 Flip']);
    expect(frontierSkill(FLAT, hard)!).toBeGreaterThan(frontierSkill(FLAT, easy)!);
  });
});

describe('ladderSpot', () => {
  const ladder = ROBOTS.filter(isFlatgroundRobot).sort((a, b) => a.skill - b.skill);

  it('places a below-everyone bag at the bottom robot', () => {
    const spot = ladderSpot(0.5);
    expect(spot.peer.id).toBe(ladder[0].id);
    expect(spot.next).not.toBeNull();
  });

  it('places a top bag at the top robot with no next', () => {
    const spot = ladderSpot(ladder[ladder.length - 1].skill + 1);
    expect(spot.peer.id).toBe(ladder[ladder.length - 1].id);
    expect(spot.next).toBeNull();
  });

  it('peer is at or below the skill, next is strictly above', () => {
    const spot = ladderSpot(4);
    expect(spot.peer.skill).toBeLessThanOrEqual(4);
    expect(spot.next!.skill).toBeGreaterThan(4);
    expect(spot.next!.skill).toBeGreaterThanOrEqual(spot.peer.skill);
  });
});

describe('fitRobotEquivalentSkill', () => {
  it('returns null below the minimum tracked attempts', () => {
    const stats = {
      Ollie: { attempts: 3, makes: 3, misses: 0, rate: 1, lastDate: '2026-07-01', lastRobotId: 'shifty' },
    };
    expect(fitRobotEquivalentSkill(stats)).toBeNull();
  });

  it('skips trick names that are no longer in the catalog', () => {
    const stats = {
      'Deleted Trick': { attempts: 20, makes: 20, misses: 0, rate: 1, lastDate: '2026-07-01', lastRobotId: 'shifty' },
    };
    expect(fitRobotEquivalentSkill(stats)).toBeNull();
  });

  it('places a beginner bag low on the scale', () => {
    // Lands easy tricks almost always, misses hard ones — classic beginner curve.
    const stats = {
      Ollie: { attempts: 10, makes: 9, misses: 1, rate: 0.9, lastDate: '2026-07-01', lastRobotId: 'shifty' },
      'Pop Shuvit': { attempts: 10, makes: 8, misses: 2, rate: 0.8, lastDate: '2026-07-01', lastRobotId: 'shifty' },
      Kickflip: { attempts: 8, makes: 3, misses: 5, rate: 0.375, lastDate: '2026-07-01', lastRobotId: 'shifty' },
      '360 Flip': { attempts: 6, makes: 0, misses: 6, rate: 0, lastDate: '2026-07-01', lastRobotId: 'shifty' },
    };
    const skill = fitRobotEquivalentSkill(stats)!;
    expect(skill).not.toBeNull();
    // Somewhere around kickflip difficulty (3): above pure-easy, well below advanced.
    expect(skill).toBeGreaterThan(1.5);
    expect(skill).toBeLessThan(5);
  });

  it('rates a consistent hard-trick player higher than a consistent easy-trick player', () => {
    const make = (name: string, rate: number, attempts = 10) => ({
      attempts,
      makes: Math.round(rate * attempts),
      misses: attempts - Math.round(rate * attempts),
      rate,
      lastDate: '2026-07-01',
      lastRobotId: 'shifty',
    });
    const easy = fitRobotEquivalentSkill({ Ollie: make('Ollie', 0.9), 'Pop Shuvit': make('Pop Shuvit', 0.85) })!;
    const hard = fitRobotEquivalentSkill({
      Kickflip: make('Kickflip', 0.9),
      Heelflip: make('Heelflip', 0.85),
      '360 Flip': make('360 Flip', 0.6),
      Hardflip: make('Hardflip', 0.5),
    })!;
    expect(hard).toBeGreaterThan(easy);
  });
});

describe('computeSkateScore', () => {
  it('is null while locked', () => {
    const log = logOf(
      [{ trick: 'Ollie', landed: true }],
      SKATE_SCORE_UNLOCK_GAMES - 1,
    );
    expect(computeSkateScore(log)).toBeNull();
  });

  it('fits from attempts once unlocked', () => {
    const perGame: TrickAttempt[] = [
      { trick: 'Ollie', landed: true },
      { trick: 'Pop Shuvit', landed: true },
      { trick: 'Frontside 180', landed: true },
      { trick: 'Kickflip', landed: true },
    ];
    const score = computeSkateScore(logOf(perGame, SKATE_SCORE_UNLOCK_GAMES))!;
    expect(score).not.toBeNull();
    expect(score.source).toBe('attempts');
    expect(score.gamesPlayed).toBe(SKATE_SCORE_UNLOCK_GAMES);
    // Lands everything through kickflip difficulty — should sit in beginner band.
    expect(score.skill).toBeGreaterThan(2);
    expect(score.skill).toBeLessThan(5.5);
    expect(score.tier).toBe(score.peer.tier);
  });

  it('falls back to the frontier for legacy logs without attempt tracking', () => {
    const legacy: GameLogEntry[] = Array.from({ length: SKATE_SCORE_UNLOCK_GAMES }, (_, i) => ({
      date: `2026-07-0${i + 1}`,
      robotId: 'shifty',
      mode: 'screen' as const,
      won: true,
      playerLetters: 1,
      robotLetters: 5,
      tricksLanded: ['Ollie', 'Pop Shuvit', 'Kickflip', 'Heelflip'],
      // no trickAttempts — pre-tracking entries
    }));
    const score = computeSkateScore(legacy)!;
    expect(score.source).toBe('frontier');
    expect(score.skill).toBe(3); // mean of heelflip 4, kickflip 3, pop shuvit 2
  });

  it('is null when unlocked but with no trick evidence at all', () => {
    expect(computeSkateScore(logOf([], SKATE_SCORE_UNLOCK_GAMES))).toBeNull();
  });
});
