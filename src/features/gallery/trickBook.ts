import type { ProvenTrick, TrickMark, TrickStat } from '@/features/records';
import type { Trick } from '@/features/tricks';

/**
 * The player's trick book: the trick catalog overlaid with their personal state.
 * `proven` comes from the game log (landed in a real game — can't be unset from
 * the UI) and is the only way into the bag. `learning` is a player-set mark for
 * tricks they're working on — it feeds "next up" suggestions but doesn't count
 * as bagged.
 */
type BookState = 'proven' | 'learning' | 'none';

export interface BookEntry {
  state: BookState;
  proven?: ProvenTrick;
}

export type TrickBook = Map<string, BookEntry>;

export function buildTrickBook(
  tricks: Trick[],
  marks: Record<string, TrickMark>,
  proven: Record<string, ProvenTrick>,
): TrickBook {
  const book: TrickBook = new Map();
  for (const trick of tricks) {
    const p = proven[trick.id];
    if (p) book.set(trick.id, { state: 'proven', proven: p });
    else if (marks[trick.id]) book.set(trick.id, { state: marks[trick.id] });
    else book.set(trick.id, { state: 'none' });
  }
  return book;
}

export function inBag(entry: BookEntry | undefined): boolean {
  return entry?.state === 'proven';
}

/** Everything the gallery tabs need, computed in one pass. */
export interface BookView {
  book: TrickBook;
  bagCount: number;
  learningCount: number;
  /** The Learning tab's queue: starred tricks first, then suggestions. */
  queue: LearningItem[];
  /** Per-trick consistency from tracked game attempts, keyed by stable trick id.
   * Empty until games logged with attempt tracking exist. */
  stats: Record<string, TrickStat>;
}

export function computeBookView(
  tricks: Trick[],
  marks: Record<string, TrickMark>,
  proven: Record<string, ProvenTrick>,
  stats: Record<string, TrickStat> = {},
): BookView {
  const book = buildTrickBook(tricks, marks, proven);
  const bagCount = tricks.filter((t) => inBag(book.get(t.id))).length;
  const learningCount = tricks.filter((t) => book.get(t.id)?.state === 'learning').length;
  return {
    book,
    bagCount,
    learningCount,
    queue: learningQueue(tricks, book),
    stats,
  };
}

/** One row of the Learning tab's queue. */
export interface LearningItem {
  trick: Trick;
  /** True when the player starred it (their stated intent), false when suggested. */
  starred: boolean;
  /** Short human reason shown under the trick name. */
  why: string;
}

/**
 * The Learning tab's queue: every starred trick (easiest first — it's the
 * player's list, we don't reorder their intent) followed by a few suggestions
 * from `nextUp`. The hero card is simply queue[0]. Never empty: with no stars
 * and no bag it degrades to the easiest catalog tricks, so a brand-new skater
 * still gets an onboarding ramp.
 */
export function learningQueue(tricks: Trick[], book: TrickBook, suggestedLimit = 3): LearningItem[] {
  const bagBases = new Set(tricks.filter((t) => inBag(book.get(t.id))).map((t) => t.base));
  const whyFor = (t: Trick): string => {
    if (bagBases.has(t.base) && t.base !== t.name) return `Builds on your ${t.base}`;
    return 'A fresh trick to learn';
  };

  const starred: LearningItem[] = tricks
    .filter((t) => book.get(t.id)?.state === 'learning')
    .sort((a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name))
    .map((t) => ({ trick: t, starred: true, why: 'On your list' }));

  const suggested: LearningItem[] = nextUp(tricks, book, starred.length + suggestedLimit)
    .filter((t) => book.get(t.id)?.state !== 'learning')
    .slice(0, suggestedLimit)
    .map((t) => ({ trick: t, starred: false, why: whyFor(t) }));

  return [...starred, ...suggested];
}

/**
 * The 1-2 cheapest tricks just past the player's bag, preferring tricks marked
 * `learning` (they told us what they're working on) and then new stances of
 * bases they already have (a fakie kickflip is closer than a brand-new trick).
 */
export function nextUp(tricks: Trick[], book: TrickBook, limit = 2): Trick[] {
  const bagBases = new Set(tricks.filter((t) => inBag(book.get(t.id))).map((t) => t.base));
  const rank = (t: Trick): number => {
    if (book.get(t.id)?.state === 'learning') return 0;
    return bagBases.has(t.base) ? 1 : 2;
  };
  return tricks
    .filter((t) => !inBag(book.get(t.id)))
    .sort((a, b) => rank(a) - rank(b) || a.difficulty - b.difficulty || a.name.localeCompare(b.name))
    .slice(0, limit);
}
