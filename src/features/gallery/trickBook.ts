import type { ProvenTrick, TrickMark } from '@/features/records';
import type { Robot } from '@/features/robots';
import { ROBOTS, isFlatgroundRobot } from '@/features/robots';
import type { Trick } from '@/features/tricks';

/**
 * The player's trick book: the trick catalog overlaid with their personal state.
 * `proven` comes from the game log (landed in a real game — can't be unset from
 * the UI) and is the only way into the bag. `learning` is a player-set mark for
 * tricks they're working on — it feeds "next up" suggestions but doesn't count
 * as bagged.
 */
export type BookState = 'proven' | 'learning' | 'none';

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
    const p = proven[trick.name];
    if (p) book.set(trick.id, { state: 'proven', proven: p });
    else if (marks[trick.id]) book.set(trick.id, { state: marks[trick.id] });
    else book.set(trick.id, { state: 'none' });
  }
  return book;
}

export function inBag(entry: BookEntry | undefined): boolean {
  return entry?.state === 'proven';
}

/**
 * The player's effective skill on the robots' 1-10 scale: the mean difficulty of
 * the 3 hardest tricks in the bag. A frontier metric on purpose — a big bag of
 * ollies shouldn't outrank a small bag with a kickflip in it. Null until the bag
 * has 3 tricks (too little signal to place someone on the ladder).
 */
export function bagSkill(tricks: Trick[], book: TrickBook): number | null {
  const bag = tricks.filter((t) => inBag(book.get(t.id)));
  if (bag.length < 3) return null;
  const top = bag
    .map((t) => t.difficulty)
    .sort((a, b) => b - a)
    .slice(0, 3);
  const mean = top.reduce((sum, d) => sum + d, 0) / top.length;
  return Math.round(mean * 10) / 10;
}

export interface LadderSpot {
  /** The flatground robot whose skill the player's bag rides like. */
  peer: Robot;
  /** The next flatground robot up the ladder, if the player isn't at the top. */
  next: Robot | null;
}

export function ladderSpot(skill: number): LadderSpot {
  const ladder = ROBOTS.filter(isFlatgroundRobot).sort((a, b) => a.skill - b.skill);
  const peer = [...ladder].reverse().find((r) => r.skill <= skill) ?? ladder[0];
  const next = ladder.find((r) => r.skill > skill) ?? null;
  return { peer, next };
}

/** Everything the gallery header/cards need, computed in one pass. */
export interface BookView {
  book: TrickBook;
  bagCount: number;
  learningCount: number;
  skill: number | null;
  spot: LadderSpot | null;
  suggestions: Trick[];
}

export function computeBookView(
  tricks: Trick[],
  marks: Record<string, TrickMark>,
  proven: Record<string, ProvenTrick>,
): BookView {
  const book = buildTrickBook(tricks, marks, proven);
  const bagCount = tricks.filter((t) => inBag(book.get(t.id))).length;
  const learningCount = tricks.filter((t) => book.get(t.id)?.state === 'learning').length;
  const skill = bagSkill(tricks, book);
  return {
    book,
    bagCount,
    learningCount,
    skill,
    spot: skill === null ? null : ladderSpot(skill),
    suggestions: nextUp(tricks, book),
  };
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
