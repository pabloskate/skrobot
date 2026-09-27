import type { Robot } from '@/features/robots';
import {
  isFlatgroundRobot,
  rawEloToDisplayRating,
  ROBOTS,
} from '@/features/robots';

/**
 * Skate score → robot rating.
 *
 * The skate score is the player's fitted skill (1–10). Robot land rates are now
 * explicit data rather than curve outputs, so the fit is only a stable player
 * metric; the Elo projection places it against the measured roster ladder.
 *
 * `BARE_SKILL_ELO` was produced with seed 20260906 by giving the bare player 400
 * balanced games against every calibrated flatground robot at each 0.25 skill
 * step (`node scripts/calibrate-player-rating.mjs`). Games use the production
 * reducer, then fit the player against fixed `ROBOT_ELO_BY_ID` strengths.
 * Adjacent sampling reversals are pooled to keep the rating projection monotonic.
 * The projection uses the roster's fixed Elo scale, recalibrated after the
 * Pro reliability review in docs/PRO_ROBOT_RELIABILITY_REVIEW.md.
 */
const BARE_SKILL_ELO: readonly (readonly [skill: number, rawElo: number])[] = [
  [1, 91],
  [1.25, 230],
  [1.5, 321],
  [1.75, 443],
  [2, 580],
  [2.25, 660],
  [2.5, 781],
  [2.75, 884],
  [3, 990],
  [3.25, 1043],
  [3.5, 1145],
  [3.75, 1217],
  [4, 1289],
  [4.25, 1340],
  [4.5, 1401],
  [4.75, 1465],
  [5, 1543],
  [5.25, 1578],
  [5.5, 1653],
  [5.75, 1727],
  [6, 1802],
  [6.25, 1862],
  [6.5, 1939],
  [6.75, 2007],
  [7, 2104],
  [7.25, 2157],
  [7.5, 2236],
  [7.75, 2286],
  [8, 2374],
  [8.25, 2436],
  [8.5, 2493],
  [8.75, 2581],
  [9, 2626],
  [9.25, 2720],
  [9.5, 2787],
  [9.75, 2866],
  [10, 3000],
];

/** Raw Elo for a bare-curve skill, linearly interpolated and clamped to [1, 10]. */
export function skillToRawElo(skill: number): number {
  const s = Math.min(10, Math.max(1, skill));
  const points = BARE_SKILL_ELO;
  if (s <= points[0][0]) return points[0][1];
  if (s >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 1; i < points.length; i += 1) {
    const [hiSkill, hiElo] = points[i];
    if (s <= hiSkill) {
      const [loSkill, loElo] = points[i - 1];
      const ratio = (s - loSkill) / (hiSkill - loSkill);
      return Math.round(loElo + (hiElo - loElo) * ratio);
    }
  }
  return points[points.length - 1][1];
}

/** The friendly 800–2400 display rating for a bare-curve skill, on the robots' scale. */
export function skillToDisplayRating(skill: number): number {
  return rawEloToDisplayRating(skillToRawElo(skill));
}

export interface EloLadderSpot {
  /** The flatground robot just at or below the player's measured Elo. */
  peer: Robot;
  /** The next flatground robot up the ladder, null at the top. */
  next: Robot | null;
}

/**
 * Place a measured Elo on the flatground ladder ordered by the *calibrated*
 * rating (not the hand-tuned skill), so a given rating pairs you against robots
 * of the same strength. Below the whole field → easiest robot; above → top with
 * no `next`.
 */
export function eloLadderSpot(rawElo: number): EloLadderSpot {
  const ladder = ROBOTS.filter(isFlatgroundRobot).sort((a, b) => a.elo! - b.elo!);
  const peer = [...ladder].reverse().find((r) => r.elo! <= rawElo) ?? ladder[0];
  const next = ladder.find((r) => r.elo! > rawElo) ?? null;
  return { peer, next };
}
