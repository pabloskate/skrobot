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
 * `BARE_SKILL_ELO` was produced with seed 20260820 by giving the bare player 400
 * balanced games against every calibrated flatground robot at each 0.25 skill
 * step. Games ran through the production reducer in `scripts/robot-elo-core.ts`,
 * then Bradley-Terry fit the player against the fixed `ROBOT_ELO_BY_ID` strengths.
 * Both are anchored at 1500, so the resulting raw Elo and roster Elo live on one
 * scale and are directly comparable.
 */
const BARE_SKILL_ELO: readonly (readonly [skill: number, rawElo: number])[] = [
  [1, -700],
  [1.25, -700],
  [1.5, -700],
  [1.75, -675],
  [2, -601],
  [2.25, -432],
  [2.5, -312],
  [2.75, -198],
  [3, -95],
  [3.25, -53],
  [3.5, 34],
  [3.75, 124],
  [4, 208],
  [4.25, 265],
  [4.5, 343],
  [4.75, 424],
  [5, 596],
  [5.25, 706],
  [5.5, 826],
  [5.75, 929],
  [6, 1039],
  [6.25, 1120],
  [6.5, 1215],
  [6.75, 1314],
  [7, 1415],
  [7.25, 1508],
  [7.5, 1620],
  [7.75, 1726],
  [8, 1820],
  [8.25, 1872],
  [8.5, 1985],
  [8.75, 2074],
  [9, 2168],
  [9.25, 2294],
  [9.5, 2433],
  [9.75, 2576],
  [10, 2770],
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
