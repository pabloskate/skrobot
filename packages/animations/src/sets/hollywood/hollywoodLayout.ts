import type { Handrail } from '../../motion/grind';

/** Hollywood High's south-facing sixteen. Measurements are visual estimates;
 * see docs/HOLLYWOOD_REFERENCE.md, including the separate twelve-stair warning. */
export const HOLLYWOOD_FOOT = 29;
const F = HOLLYWOOD_FOOT;
export const HOLLYWOOD_STEPS = 16;
export const HOLLYWOOD_DROP = 8 * F;
export const HOLLYWOOD_RUN = 14 * F;
export const HOLLYWOOD_RISER = HOLLYWOOD_DROP / HOLLYWOOD_STEPS;
export const HOLLYWOOD_TREAD = HOLLYWOOD_RUN / (HOLLYWOOD_STEPS - 1);
export const HOLLYWOOD_WIDTH = 16 * F;
export const HOLLYWOOD_LEFT_Z = -HOLLYWOOD_WIDTH / 2;
export const HOLLYWOOD_RIGHT_Z = HOLLYWOOD_WIDTH / 2;
export const HOLLYWOOD_CENTER_Z = 0;
/** The open, parking-side half; the school occupies the positive-z boundary. */
export const HOLLYWOOD_LANE_Z = -4 * F;
export const HOLLYWOOD_SIDE_RAIL_Z = HOLLYWOOD_LEFT_Z + 0.4 * F;
export const HOLLYWOOD_WALL_RAIL_Z = HOLLYWOOD_RIGHT_Z - 0.35 * F;
/** Explicit aliases use the same across-stair ordering as the scene registry. */
export const HOLLYWOOD_LEFT_RAIL_Z = HOLLYWOOD_SIDE_RAIL_Z;
export const HOLLYWOOD_RIGHT_RAIL_Z = HOLLYWOOD_WALL_RAIL_Z;
export const HOLLYWOOD_RAIL_RADIUS = 2.2;
export const HOLLYWOOD_RAIL_HEIGHT = 3 * F;
export const HOLLYWOOD_RAIL_START = -F;
export const HOLLYWOOD_RAIL_END = HOLLYWOOD_RUN - 0.35 * F;
export const HOLLYWOOD_GRADE = HOLLYWOOD_RISER / HOLLYWOOD_TREAD;
export const HOLLYWOOD_BUILDING_END = HOLLYWOOD_RUN + 0.5 * F;
export const HOLLYWOOD_BUILDING_FACE = HOLLYWOOD_RIGHT_Z + 2;
export const HOLLYWOOD_BUILDING_TOP = 7.8 * F;

export function hollywoodGround(u: number): number {
  if (u < 0) return 0;
  if (u >= HOLLYWOOD_RUN) return -HOLLYWOOD_DROP;
  return -(Math.floor(u / HOLLYWOOD_TREAD) + 1) * HOLLYWOOD_RISER;
}

export const hollywoodNosing = (u: number) => -u * HOLLYWOOD_GRADE;

/** One continuous sloping top pipe; Hollywood's center rail has no lower bar. */
export const HOLLYWOOD_RAIL: Handrail = {
  start: HOLLYWOOD_RAIL_START,
  end: HOLLYWOOD_RAIL_END,
  top: HOLLYWOOD_RAIL_HEIGHT + HOLLYWOOD_RAIL_RADIUS * Math.hypot(1, HOLLYWOOD_GRADE),
  slope: HOLLYWOOD_GRADE,
  ground: hollywoodGround,
  rest: (u) => Math.max(-HOLLYWOOD_DROP, Math.min(0, hollywoodNosing(u))),
  speed: 12 * F,
};

/** Both real side handrails follow the same nosing grade. The school-side
 * pipe is wall mounted, so it deliberately has no vertical stair posts. */
export const HOLLYWOOD_RAIL_LINES = [
  { z: HOLLYWOOD_CENTER_Z, wallMounted: false },
  { z: HOLLYWOOD_SIDE_RAIL_Z, wallMounted: false },
  { z: HOLLYWOOD_WALL_RAIL_Z, wallMounted: true },
] as const;
