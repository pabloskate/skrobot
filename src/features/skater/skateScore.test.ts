import { describe, expect, it } from 'vitest';
import type { GameLogEntry, ProvenTrick, TrickAttempt } from '@/features/records';
import { ROBOTS, isFlatgroundRobot, rawEloToDisplayRating } from '@/features/robots';
import { TRICK_BY_NAME, tricksFor } from '@/features/tricks';
import { eloLadderSpot, skillToDisplayRating, skillToRawElo } from './skillElo';
import {
  computeSkateScore,
  fitRobotEquivalentSkill,
  frontierSkill,
  ladderSpot,
  SKATE_SCORE_UNLOCK_GAMES,
  skateScoreUnlocked,
} from './skateScore';

const FLAT = tricksFor('flatground');
const id = (name: string) => TRICK_BY_NAME.get(name)?.id ?? name;

const proven = (names: string[]): Record<string, ProvenTrick> =>
  Object.fromEntries(
    names.map((name) => [id(name), { count: 1, lastDate: '2026-07-01', lastRobotId: 'shifty' }]),
  );

let gameCounter = 0;
/** A completed-game log entry with the given trick attempts. */
function game(attempts: TrickAttempt[], trickIdsLanded?: string[]): GameLogEntry {
  gameCounter += 1;
  return {
    version: 2,
    date: `2026-07-${String((gameCounter % 28) + 1).padStart(2, '0')}`,
    robotId: 'shifty',
    mode: 'screen',
    won: true,
    playerLetters: 1,
    robotLetters: 5,
    trickIdsLanded: trickIdsLanded ?? attempts.filter((a) => a.landed).map((a) => a.trickId),
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
      'regular-ollie': { attempts: 3, makes: 3, misses: 0, rate: 1, lastDate: '2026-07-01', lastRobotId: 'shifty' },
    };
    expect(fitRobotEquivalentSkill(stats)).toBeNull();
  });

  it('skips trick ids that are no longer in the catalog', () => {
    const stats = {
      'deleted-trick': { attempts: 20, makes: 20, misses: 0, rate: 1, lastDate: '2026-07-01', lastRobotId: 'shifty' },
    };
    expect(fitRobotEquivalentSkill(stats)).toBeNull();
  });

  it('places a beginner bag low on the scale', () => {
    // Lands easy tricks almost always, misses hard ones — classic beginner curve.
    const stats = {
      'regular-ollie': { attempts: 10, makes: 9, misses: 1, rate: 0.9, lastDate: '2026-07-01', lastRobotId: 'shifty' },
      'regular-pop-shuvit': { attempts: 10, makes: 8, misses: 2, rate: 0.8, lastDate: '2026-07-01', lastRobotId: 'shifty' },
      'regular-kickflip': { attempts: 8, makes: 3, misses: 5, rate: 0.375, lastDate: '2026-07-01', lastRobotId: 'shifty' },
      'regular-360-flip': { attempts: 6, makes: 0, misses: 6, rate: 0, lastDate: '2026-07-01', lastRobotId: 'shifty' },
    };
    const skill = fitRobotEquivalentSkill(stats)!;
    expect(skill).not.toBeNull();
    // Somewhere around kickflip difficulty (3): above pure-easy, well below advanced.
    expect(skill).toBeGreaterThan(1.5);
    expect(skill).toBeLessThan(5);
  });

  it('rates a consistent hard-trick player higher than a consistent easy-trick player', () => {
    const make = (rate: number, attempts = 10) => ({
      attempts,
      makes: Math.round(rate * attempts),
      misses: attempts - Math.round(rate * attempts),
      rate,
      lastDate: '2026-07-01',
      lastRobotId: 'shifty',
    });
    const easy = fitRobotEquivalentSkill({ 'regular-ollie': make(0.9), 'regular-pop-shuvit': make(0.85) })!;
    const hard = fitRobotEquivalentSkill({
      'regular-kickflip': make(0.9),
      'regular-heelflip': make(0.85),
      'regular-360-flip': make(0.6),
      'regular-hardflip': make(0.5),
    })!;
    expect(hard).toBeGreaterThan(easy);
  });
});

describe('computeSkateScore', () => {
  it('is null while locked', () => {
    const log = logOf(
      [{ trickId: 'regular-ollie', landed: true }],
      SKATE_SCORE_UNLOCK_GAMES - 1,
    );
    expect(computeSkateScore(log)).toBeNull();
  });

  it('fits from attempts once unlocked', () => {
    const perGame: TrickAttempt[] = [
      { trickId: 'regular-ollie', landed: true },
      { trickId: 'regular-pop-shuvit', landed: true },
      { trickId: 'regular-frontside-180', landed: true },
      { trickId: 'regular-kickflip', landed: true },
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
      version: 2 as const,
      date: `2026-07-0${i + 1}`,
      robotId: 'shifty',
      mode: 'screen' as const,
      won: true,
      playerLetters: 1,
      robotLetters: 5,
      trickIdsLanded: ['regular-ollie', 'regular-pop-shuvit', 'regular-kickflip', 'regular-heelflip'],
      // no trickAttempts — pre-tracking entries
    }));
    const score = computeSkateScore(legacy)!;
    expect(score.source).toBe('frontier');
    expect(score.skill).toBe(3); // mean of heelflip 4, kickflip 3, pop shuvit 2
  });

  it('is null when unlocked but with no trick evidence at all', () => {
    expect(computeSkateScore(logOf([], SKATE_SCORE_UNLOCK_GAMES))).toBeNull();
  });

  it('projects the skill onto the rating scale and brackets the measured ladder', () => {
    const perGame: TrickAttempt[] = [
      { trickId: 'regular-ollie', landed: true },
      { trickId: 'regular-pop-shuvit', landed: true },
      { trickId: 'regular-frontside-180', landed: true },
      { trickId: 'regular-kickflip', landed: true },
    ];
    const score = computeSkateScore(logOf(perGame, SKATE_SCORE_UNLOCK_GAMES))!;
    expect(score.rawElo).toBe(skillToRawElo(score.skill));
    expect(score.rating).toBe(rawEloToDisplayRating(score.rawElo));
    expect(score.peer.elo!).toBeLessThanOrEqual(score.rawElo);
    if (score.next) expect(score.next.elo!).toBeGreaterThan(score.rawElo);
    expect(score.tier).toBe(score.peer.tier);
  });
});

describe('skillToRawElo', () => {
  it('is monotonic and clamped to the calibrated table bounds', () => {
    expect(skillToRawElo(0.5)).toBe(skillToRawElo(1));
    expect(skillToRawElo(11)).toBe(skillToRawElo(10));
    let prev = -Infinity;
    for (let s = 1; s <= 10; s += 0.25) {
      const elo = skillToRawElo(s);
      expect(elo).toBeGreaterThanOrEqual(prev);
      prev = elo;
    }
  });

  it('matches the seeded bare-curve anchors in the middle band', () => {
    expect(skillToRawElo(7)).toBe(1415);
    expect(skillToRawElo(9)).toBe(2168);
  });

  it('maps onto the shared 800–2400 display rating', () => {
    expect(skillToDisplayRating(7)).toBe(rawEloToDisplayRating(1415));
    expect(skillToDisplayRating(10)).toBe(rawEloToDisplayRating(2770));
  });
});

describe('eloLadderSpot', () => {
  const ladder = ROBOTS.filter(isFlatgroundRobot);

  it('places below-everything at the bottom robot with a next', () => {
    const spot = eloLadderSpot(-1000);
    expect(spot.peer.id).toBe(ladder[0].id);
    expect(spot.next).not.toBeNull();
  });

  it('places above-everything at the top with no next', () => {
    const spot = eloLadderSpot(10_000);
    expect(spot.peer.id).toBe(ladder[ladder.length - 1].id);
    expect(spot.next).toBeNull();
  });

  it('peer is at or below the raw Elo, next is strictly above', () => {
    const spot = eloLadderSpot(1500);
    expect(spot.peer.elo!).toBeLessThanOrEqual(1500);
    expect(spot.next!.elo!).toBeGreaterThan(1500);
    expect(spot.next!.elo!).toBeGreaterThanOrEqual(spot.peer.elo!);
  });
});
