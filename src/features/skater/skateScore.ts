import type { GameLogEntry, ProvenTrick, TrickStat } from '@/features/records';
import { deriveProvenTricks, deriveTrickStats } from '@/features/records';
import type { Robot, Tier } from '@/features/robots';
import { isFlatgroundRobot, ROBOTS } from '@/features/robots';
import type { Trick } from '@/features/tricks';
import { TRICK_BY_ID, TRICKS } from '@/features/tricks';
import { eloLadderSpot, skillToDisplayRating, skillToRawElo } from './skillElo';
import { playerConsistencyCurve } from './skillCurve';

/** Completed games (screen or voice) needed before the skate score unlocks. */
export const SKATE_SCORE_UNLOCK_GAMES = 8;

export function skateScoreUnlocked(log: GameLogEntry[]): boolean {
  return log.length >= SKATE_SCORE_UNLOCK_GAMES;
}

/**
 * The player's effective skill on the robots' 1-10 scale: the mean difficulty of
 * the 3 hardest proven tricks. A frontier metric on purpose — a big bag of
 * ollies shouldn't outrank a small bag with a kickflip in it. Null until the bag
 * has 3 tricks (too little signal to place someone on the ladder).
 */
export function frontierSkill(
  tricks: Trick[],
  proven: Record<string, ProvenTrick>,
): number | null {
  const difficulties = tricks
    .filter((t) => proven[t.id] != null)
    .map((t) => t.difficulty)
    .sort((a, b) => b - a);
  if (difficulties.length < 3) return null;
  const top = difficulties.slice(0, 3);
  const mean = top.reduce((sum, d) => sum + d, 0) / top.length;
  return Math.round(mean * 10) / 10;
}

export interface LadderSpot {
  /** The flatground robot whose skill the player's skating rides like. */
  peer: Robot;
  /** The next flatground robot up the ladder, if the player isn't at the top. */
  next: Robot | null;
}

/** Place a 1-10 skill on the flatground robot ladder: peer at or below, next above. */
export function ladderSpot(skill: number): LadderSpot {
  const ladder = ROBOTS.filter(isFlatgroundRobot).sort((a, b) => a.skill - b.skill);
  const peer = [...ladder].reverse().find((r) => r.skill <= skill) ?? ladder[0];
  const next = ladder.find((r) => r.skill > skill) ?? null;
  return { peer, next };
}

// --- Robot-equivalent fit ------------------------------------------------

/** Below this many tracked attempts the fit is noise — fall back to the frontier. */
const MIN_FIT_ATTEMPTS = 10;
/** Cap per-trick weight so grinding one trick can't dominate the fit. */
const MAX_WEIGHT_PER_TRICK = 8;

/**
 * Robot-equivalent skill: fit the player's per-trick make rates onto the same
 * a smooth curve over skill-difficulty headroom and solve for the skill that best
 * explains the observed attempts. This estimates the player only; robot behavior
 * comes from explicit per-trick data.
 * Returns null when there isn't enough tracked attempt data to trust the fit.
 *
 * Attempts are selection-biased (players set tricks they like), but robot-chosen
 * copy attempts push the other way — and riding the robots' own curve keeps the
 * number on exactly the same ruler as the roster.
 */
export function fitRobotEquivalentSkill(stats: Record<string, TrickStat>): number | null {
  const rows: { difficulty: number; rate: number; weight: number }[] = [];
  let totalAttempts = 0;
  for (const [trickId, stat] of Object.entries(stats)) {
    const trick = TRICK_BY_ID.get(trickId);
    if (!trick) continue; // removed catalog entries remain recorded but cannot be scored
    totalAttempts += stat.attempts;
    rows.push({
      difficulty: trick.difficulty,
      rate: stat.rate,
      weight: Math.min(stat.attempts, MAX_WEIGHT_PER_TRICK),
    });
  }
  if (rows.length === 0 || totalAttempts < MIN_FIT_ATTEMPTS) return null;

  // Anchor: one step past the hardest trick the player ever attempts, assumed
  // shaky. Without it a perfect record fits to the ceiling — landing 100% of a
  // small bag is evidence of a floor ("never tried anything harder"), not proof
  // of pro skill. Real misses above the anchor easily outvote it.
  const hardest = Math.max(...rows.map((r) => r.difficulty));
  rows.push({ difficulty: hardest + 1, rate: 0.15, weight: 3 });

  let best = 1;
  let bestError = Infinity;
  for (let s = 1; s <= 10; s += 0.05) {
    let error = 0;
    for (const row of rows) {
      const predicted = playerConsistencyCurve(s - row.difficulty);
      error += row.weight * (row.rate - predicted) ** 2;
    }
    if (error < bestError) {
      bestError = error;
      best = s;
    }
  }
  return Math.round(best * 10) / 10;
}

// --- The score -----------------------------------------------------------

export interface SkateScore {
  /** 1-10, on the robots' skill scale. */
  skill: number;
  /** Raw Bradley-Terry Elo, on the same 1500-anchored scale as the robot roster. */
  rawElo: number;
  /** Friendly 800–2400 display rating, comparable to `robotDisplayRating`. */
  rating: number;
  /** Beginner / Intermediate / Advanced / Pro — the tier of the robot you ride like. */
  tier: Tier;
  /** Flatground robot at or below your measured Elo. */
  peer: Robot;
  /** Next robot up the measured ladder, null at the top. */
  next: Robot | null;
  gamesPlayed: number;
  /** Where the number came from: the attempt-based curve fit, or the bag frontier. */
  source: 'attempts' | 'frontier';
}

/**
 * The player's skate score, or null while it's still locked (fewer than 8
 * completed games) or there's no trick evidence at all.
 * Prefers the attempt-based robot-equivalent fit; falls back to the bag frontier
 * for logs recorded before attempt tracking. Derived fresh from the log every
 * time — the log's 200-game cap makes the score a rolling window of current form.
 *
 * The returned `skill` (1-10) is the browser-facing tuning number; the `rating`
 * and `peer`/`next` are placed on the *calibrated* robot ladder (raw Elo), so the
 * score is directly comparable to `robotDisplayRating` on the roster.
 */
export function computeSkateScore(log: GameLogEntry[]): SkateScore | null {
  if (!skateScoreUnlocked(log)) return null;
  const stats = deriveTrickStats(log);
  const proven = deriveProvenTricks(log);
  const fit = fitRobotEquivalentSkill(stats);
  const frontier = frontierSkill(TRICKS, proven);
  const skill = fit ?? frontier;
  if (skill === null) return null;
  const rawElo = skillToRawElo(skill);
  const spot = eloLadderSpot(rawElo);
  return {
    skill,
    rawElo,
    rating: skillToDisplayRating(skill),
    tier: spot.peer.tier,
    peer: spot.peer,
    next: spot.next,
    gamesPlayed: log.length,
    source: fit !== null ? 'attempts' : 'frontier',
  };
}
