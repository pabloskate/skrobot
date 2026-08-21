import { describe, expect, it } from 'vitest';
import type { ProvenTrick, TrickMark } from '@/features/records';
import { TRICK_BY_ID, tricksFor } from '@/features/tricks';
import { buildTrickBook, computeBookView, inBag, learningQueue, nextUp } from './trickBook';

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

  it('applies learning marks by trick id', () => {
    const marks: Record<string, TrickMark> = {
      'regular-ollie': 'learning',
      'regular-heelflip': 'learning',
    };
    const book = buildTrickBook(FLAT, marks, {});
    expect(book.get('regular-ollie')?.state).toBe('learning');
    expect(book.get('regular-heelflip')?.state).toBe('learning');
  });

  it('counts only proven as in the bag, learning as not', () => {
    const marks: Record<string, TrickMark> = {
      'regular-ollie': 'learning',
    };
    const book = buildTrickBook(FLAT, marks, proven(['Kickflip', 'Ollie']));
    expect(inBag(book.get('regular-kickflip'))).toBe(true);
    expect(inBag(book.get('regular-ollie'))).toBe(true); // proven, not the learning mark
    expect(inBag(book.get('regular-heelflip'))).toBe(false);
    expect(inBag(book.get('regular-pop-shuvit'))).toBe(false);
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
    const book = buildTrickBook(FLAT, {}, proven(['Ollie']));
    for (const t of nextUp(FLAT, book, 10)) expect(t.id).not.toBe('regular-ollie');
  });

  it('puts learning-marked tricks first', () => {
    const book = buildTrickBook(FLAT, { 'regular-360-flip': 'learning' }, {});
    expect(nextUp(FLAT, book)[0].id).toBe('regular-360-flip');
  });

  it('prefers a new stance of a base already in the bag over easier new tricks', () => {
    const book = buildTrickBook(FLAT, {}, proven(['Kickflip']));
    const picks = nextUp(FLAT, book);
    // fakie kickflip (difficulty 4) outranks the easier brand-new frontside 180 (2)
    expect(picks[0].id).toBe('fakie-kickflip');
    expect(TRICK_BY_ID.get(picks[0].id)?.base).toBe('Kickflip');
  });
});

describe('learningQueue', () => {
  it('degrades to easiest-first suggestions for a brand-new skater', () => {
    const queue = learningQueue(FLAT, buildTrickBook(FLAT, {}, {}));
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((item) => !item.starred)).toBe(true);
    expect(queue[0].trick.name).toBe('Ollie');
    expect(queue[0].why).toBe('A fresh trick to learn');
  });

  it('puts starred tricks first, easiest first within the stars', () => {
    const marks: Record<string, TrickMark> = {
      'regular-heelflip': 'learning',
      'regular-backside-180': 'learning',
    };
    const queue = learningQueue(FLAT, buildTrickBook(FLAT, marks, {}));
    expect(queue[0].trick.id).toBe('regular-backside-180');
    expect(queue[1].trick.id).toBe('regular-heelflip');
    expect(queue.slice(0, 2).every((item) => item.starred && item.why === 'On your list')).toBe(true);
  });

  it('suggests tricks that build on the bag, and never bagged or starred ones', () => {
    const marks: Record<string, TrickMark> = { 'regular-360-flip': 'learning' };
    const book = buildTrickBook(FLAT, marks, proven(['Kickflip']));
    const queue = learningQueue(FLAT, book);
    const suggested = queue.filter((item) => !item.starred);
    expect(suggested.length).toBeGreaterThan(0);
    for (const item of suggested) {
      expect(inBag(book.get(item.trick.id))).toBe(false);
      expect(book.get(item.trick.id)?.state).not.toBe('learning');
    }
    // fakie kickflip builds on the bagged kickflip
    const fakieKickflip = suggested.find((item) => item.trick.id === 'fakie-kickflip');
    expect(fakieKickflip?.why).toBe('Builds on your Kickflip');
  });

  it('caps suggestions but never the starred list', () => {
    const marks: Record<string, TrickMark> = Object.fromEntries(
      ['regular-heelflip', 'regular-varial-kickflip', 'regular-hardflip', 'regular-bigspin'].map(
        (id) => [id, 'learning'],
      ),
    );
    const queue = learningQueue(FLAT, buildTrickBook(FLAT, marks, {}));
    expect(queue.filter((item) => item.starred)).toHaveLength(4);
    expect(queue.filter((item) => !item.starred)).toHaveLength(3);
  });
});

describe('computeBookView', () => {
  it('summarizes counts and queue in one pass', () => {
    const marks: Record<string, TrickMark> = {
      'regular-heelflip': 'learning',
    };
    const view = computeBookView(FLAT, marks, proven(['Ollie', 'Pop Shuvit', 'Kickflip']));
    expect(view.bagCount).toBe(3); // proven: ollie + pop shuvit + kickflip
    expect(view.learningCount).toBe(1);
    expect(view.queue.length).toBeGreaterThan(0);
    expect(view.queue[0].trick.id).toBe('regular-heelflip'); // starred first
  });

  it('has an empty bag and still suggests next tricks', () => {
    const view = computeBookView(FLAT, {}, {});
    expect(view.bagCount).toBe(0);
    expect(view.queue.length).toBeGreaterThan(0);
  });
});
