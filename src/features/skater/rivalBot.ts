import type { GameLogEntry, ProvenTrick, Record_ } from '@/features/records';
import { deriveProvenTricks } from '@/features/records';
import type { Robot } from '@/features/robots';
import { ROBOT_BY_ID } from '@/features/robots';
import { tricksFor } from '@/features/tricks';
import { computeSkateScore, ladderSpot } from './skateScore';

/**
 * The adaptive rival: a generated opponent that skates at the player's level,
 * plus a step. Not a clone — because bag membership is difficulty-driven, at
 * score + delta the rival lands what the player lands AND scrapes into tricks
 * the player can't do yet. Its signatures are the player's next-frontier tricks,
 * so it literally sets the tricks they're chasing.
 */

export const RIVAL_ID = 'rival';
export const RIVAL_NAME = 'Nemesis';

export function isRivalId(id: string): boolean {
  return id === RIVAL_ID;
}

// --- Win adjustment ------------------------------------------------------
// The rival starts half a skill point above you and self-corrects on results:
// beat it and it comes back +0.25 stronger, lose and it eases off. All-time
// net W/L is self-balancing — a capped delta you keep beating stops growing.

const BASE_DELTA = 0.5;
const STEP_DELTA = 0.25;
const MIN_DELTA = 0.1;
const MAX_DELTA = 1.5;

/** How far above the player's score the rival skates, given past results vs it. */
export function rivalDelta(record: Record_ | undefined): number {
  const net = (record?.w ?? 0) - (record?.l ?? 0);
  const delta = BASE_DELTA + STEP_DELTA * net;
  return Math.round(Math.min(MAX_DELTA, Math.max(MIN_DELTA, delta)) * 100) / 100;
}

/** Roster bounds — the rival never skates below the easiest or above the hardest robot. */
const MIN_RIVAL_SKILL = 2;
const MAX_RIVAL_SKILL = 9.2;

const FLATGROUND = tricksFor('flatground');

/**
 * The rival's signature tricks: the cheapest base tricks just past the player's
 * proven bag — what they're chasing next. The favorites boost makes the rival
 * unusually strong at exactly those, so it pushes the player forward instead of
 * mirroring the bag they already own.
 */
export function rivalFavorites(proven: Record<string, ProvenTrick>, limit = 3): string[] {
  const provenBases = new Set(
    FLATGROUND.filter((t) => proven[t.name] != null).map((t) => t.base),
  );
  const seen = new Set<string>();
  const picks: string[] = [];
  const byDifficulty = [...FLATGROUND].sort(
    (a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name),
  );
  for (const trick of byDifficulty) {
    if (provenBases.has(trick.base) || seen.has(trick.base)) continue;
    seen.add(trick.base);
    picks.push(trick.base);
    if (picks.length === limit) break;
  }
  return picks;
}

/**
 * Build the rival robot for the player's current form, or null while the skate
 * score is locked (fewer than 8 completed games). Rebuilt from the latest log
 * on every game launch — the rival adapts between games, never mid-game, so a
 * saved match always resumes against a coherent opponent.
 */
export function buildRivalRobot(
  log: GameLogEntry[],
  records: Record<string, Record_>,
): Robot | null {
  const score = computeSkateScore(log);
  if (!score) return null;
  const delta = rivalDelta(records[RIVAL_ID]);
  const skill =
  Math.round(Math.min(MAX_RIVAL_SKILL, Math.max(MIN_RIVAL_SKILL, score.skill + delta)) * 10) / 10;
  const spot = ladderSpot(skill);
  const behaviorSource = spot.next && Math.abs(spot.next.skill - skill) < Math.abs(spot.peer.skill - skill)
    ? spot.next
    : spot.peer;
  return {
    id: RIVAL_ID,
    behaviorId: behaviorSource.id,
    name: RIVAL_NAME,
    tier: spot.peer.tier,
    tagline: 'Always one trick ahead',
    summary:
      'Nemesis trains on your game log. It copies the explicit bag of the closest roster rival above your current level. Beat it and it comes back stronger.',
    skill,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: rivalFavorites(deriveProvenTricks(log)),
    avatar: { body: '#2b2d42', accent: '#ef233c', variant: 3 },
    rpsTaunts: {
      countdown: ['I have been studying your game log.', 'Calculating your weaknesses...'],
      win: ['Nemesis sets first. Naturally.', 'I adapt. You set next.'],
      lose: ['Interesting. You take the toss.', 'Noted. You go first.'],
      tie: ['Stalemate. Again.', 'Evenly matched. Once more.'],
    },
  };
}

/**
 * Roster lookup that also resolves the rival — for saved-game resume. The rival
 * is rebuilt at the player's CURRENT score, so resuming an old saved match
 * against it meets the rival as it skates today, not as it skated at save time.
 */
export function resolveRobot(
  id: string,
  log: GameLogEntry[],
  records: Record<string, Record_>,
): Robot | undefined {
  return ROBOT_BY_ID.get(id) ?? (isRivalId(id) ? (buildRivalRobot(log, records) ?? undefined) : undefined);
}
