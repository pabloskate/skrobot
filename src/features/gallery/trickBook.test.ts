import { describe, expect, it } from 'vitest';
import type { ProvenTrick, TrickMark } from '@/features/records';
import { ROBOTS, isFlatgroundRobot } from '@/features/robots';
import { TRICK_BY_ID, tricksFor } from '@/features/tricks';
import {
  bagSkill,
  buildTrickBook,
  computeBookView,
  inBag,
  ladderSpot,
  nextUp,
} from './trickBook';

const FLAT = tricksFor('flatground');

const proven = (names: string[]): Record<string, ProvenTrick> =>
  Object.fromEntries(
    names.map((name) => [name, { count: 1, lastDate: '2026-07-01', lastRobotId: 'shifty' }]),
  );

describe('buildTrickBook', () => {
  it('marks every catalog trick with a state', () => {
    const book = buildTrickBook(FLAT, {}, {});
    expect(book.size).toBe(FLAT.length);
    for (const entry of book.values()) expect(entry.state).toBe('none');
  });

  it('proven (from the game log, by name) beats a player mark', () => {
    const marks: Record<string, TrickMark> = { 'regular-kickflip': 'learning' };
    const book = buildTrickBook(FLAT, marks, proven(['Kickflip']));
    expect(book.get('regular-kickflip')).toMatchObject({ state: 'proven' });
    expect(book.get('regular-kickflip')?.proven?.count).toBe(1);
  });

  it('applies claimed and learning marks by trick id', () => {
    const marks: Record<string, TrickMark> = {
      'regular-ollie': 'claimed',
      'regular-heelflip': 'learning',
    };
    const book = buildTrickBook(FLAT, marks, {});
    expect(book.get('regular-ollie')?.state).toBe('claimed');
    expect(book.get('regular-heelflip')?.state).toBe('learning');
  });

  it('counts proven and claimed as in the bag, learning as not', () => {
    const marks: Record<string, TrickMark> = {
      'regular-ollie': 'claimed',
      'regular-heelflip': 'learning',
    };
    const book = buildTrickBook(FLAT, marks, proven(['Kickflip']));
    expect(inBag(book.get('regular-kickflip'))).toBe(true);
    expect(inBag(book.get('regular-ollie'))).toBe(true);
    expect(inBag(book.get('regular-heelflip'))).toBe(false);
    expect(inBag(book.get('regular-pop-shuvit'))).toBe(false);
  });
});

describe('bagSkill', () => {
  it('is null until the bag has 3 tricks', () => {
    const book = buildTrickBook(FLAT, { 'regular-ollie': 'claimed', 'regular-kickflip': 'claimed' }, {});
    expect(bagSkill(FLAT, book)).toBeNull();
  });

  it('is the mean difficulty of the 3 hardest tricks in the bag', () => {
    const marks: Record<string, TrickMark> = {
      'regular-ollie': 'claimed', // 1
      'regular-pop-shuvit': 'claimed', // 2
      'regular-kickflip': 'claimed', // 3
      'regular-heelflip': 'claimed', // 4
    };
    const book = buildTrickBook(FLAT, marks, {});
    // top 3: heelflip 4, kickflip 3, pop shuvit 2
    expect(bagSkill(FLAT, book)).toBe(3);
  });

  it('is a frontier: a pile of easy tricks does not outrank hard ones', () => {
    const easy = buildTrickBook(
      FLAT,
      {
        'regular-ollie': 'claimed',
        'fakie-ollie': 'claimed',
        'regular-pop-shuvit': 'claimed',
        'regular-frontside-shuvit': 'claimed',
        'regular-frontside-180': 'claimed',
        'regular-backside-180': 'claimed',
      },
      {},
    );
    const hard = buildTrickBook(
      FLAT,
      {
        'regular-kickflip': 'claimed',
        'regular-heelflip': 'claimed',
        'regular-360-flip': 'claimed',
      },
      {},
    );
    expect(bagSkill(FLAT, hard)!).toBeGreaterThan(bagSkill(FLAT, easy)!);
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

describe('nextUp', () => {
  it('suggests the easiest tricks for an empty book', () => {
    const book = buildTrickBook(FLAT, {}, {});
    const picks = nextUp(FLAT, book);
    expect(picks).toHaveLength(2);
    expect(picks[0].name).toBe('Ollie');
  });

  it('never suggests a trick already in the bag', () => {
    const book = buildTrickBook(FLAT, { 'regular-ollie': 'claimed' }, {});
    for (const t of nextUp(FLAT, book, 10)) expect(t.id).not.toBe('regular-ollie');
  });

  it('puts learning-marked tricks first', () => {
    const book = buildTrickBook(FLAT, { 'regular-360-flip': 'learning' }, {});
    expect(nextUp(FLAT, book)[0].id).toBe('regular-360-flip');
  });

  it('prefers a new stance of a base already in the bag over easier new tricks', () => {
    const book = buildTrickBook(FLAT, { 'regular-kickflip': 'claimed' }, {});
    const picks = nextUp(FLAT, book);
    // fakie kickflip (difficulty 4) outranks the easier brand-new frontside 180 (2)
    expect(picks[0].id).toBe('fakie-kickflip');
    expect(TRICK_BY_ID.get(picks[0].id)?.base).toBe('Kickflip');
  });
});

describe('computeBookView', () => {
  it('summarizes counts, skill, ladder spot, and suggestions in one pass', () => {
    const marks: Record<string, TrickMark> = {
      'regular-ollie': 'claimed',
      'regular-pop-shuvit': 'claimed',
      'regular-heelflip': 'learning',
    };
    const view = computeBookView(FLAT, marks, proven(['Kickflip']));
    expect(view.bagCount).toBe(3); // ollie + pop shuvit + proven kickflip
    expect(view.learningCount).toBe(1);
    expect(view.skill).toBe(2); // (3 + 2 + 1) / 3
    expect(view.spot).not.toBeNull();
    expect(view.suggestions.length).toBeGreaterThan(0);
  });

  it('has no ladder spot or skill for an empty book', () => {
    const view = computeBookView(FLAT, {}, {});
    expect(view.bagCount).toBe(0);
    expect(view.skill).toBeNull();
    expect(view.spot).toBeNull();
  });
});
