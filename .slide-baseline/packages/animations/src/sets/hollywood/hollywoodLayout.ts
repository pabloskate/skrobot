import type { Handrail } from '../../motion/grind';
import type { DropTerrain } from '../elToro/stairs';

/** Hollywood High's south-facing sixteen. Measurements are visual estimates;
 * see docs/HOLLYWOOD_REFERENCE.md, including the separate twelve-stair warning. */
export const HOLLYWOOD_FOOT = 29;
const F = HOLLYWOOD_FOOT;
export const HOLLYWOOD_STEPS = 16;
export const HOLLYWOOD_DROP = 8 * F;
export const HOLLYWOOD_RUN = 16 * F;
export const HOLLYWOOD_RISER = HOLLYWOOD_DROP / HOLLYWOOD_STEPS;
export const HOLLYWOOD_TREAD = HOLLYWOOD_RUN / (HOLLYWOOD_STEPS - 1);
export const HOLLYWOOD_WIDTH = 16 * F;
export const HOLLYWOOD_LEFT_Z = -HOLLYWOOD_WIDTH / 2;
export const HOLLYWOOD_RIGHT_Z = HOLLYWOOD_WIDTH / 2;
export const HOLLYWOOD_CENTER_Z = 0;
/** The open, street-side half; the school occupies the positive-z boundary. */
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

/** The street side: the concrete cheek's outer face, the black picket fence
 * on the sidewalk below it, the wide sidewalk, and the road's near curb. */
export const HOLLYWOOD_CHEEK_Z = HOLLYWOOD_LEFT_Z - 0.65 * F;
export const HOLLYWOOD_FENCE_Z = HOLLYWOOD_LEFT_Z - 0.95 * F;
/** Its pickets' tops (7.25 ft over the sidewalk), as a height over the top landing; the spear tips stand a little over them. */
export const HOLLYWOOD_FENCE_TOP = -HOLLYWOOD_DROP + 7.25 * F;
export const HOLLYWOOD_FENCE_TIPS = HOLLYWOOD_FENCE_TOP + 7;
export const HOLLYWOOD_FENCE_START = -42 * F;
export const HOLLYWOOD_FENCE_END = HOLLYWOOD_RUN + 12 * F;
export const HOLLYWOOD_CURB_Z = HOLLYWOOD_LEFT_Z - 15 * F;
/** Four eleven-foot lanes, two each way, between the curbs. */
export const HOLLYWOOD_LANE_WIDTH = 11 * F;
export const HOLLYWOOD_FAR_CURB_Z = HOLLYWOOD_CURB_Z - 4 * HOLLYWOOD_LANE_WIDTH;
/** The road, half a foot under the sidewalks (the curbs' height). */
export const HOLLYWOOD_ROAD_Y = -HOLLYWOOD_DROP - 0.5 * F;

export function hollywoodGround(u: number): number {
  if (u < 0) return 0;
  if (u >= HOLLYWOOD_RUN) return -HOLLYWOOD_DROP;
  return -(Math.floor(u / HOLLYWOOD_TREAD) + 1) * HOLLYWOOD_RISER;
}

export const hollywoodNosing = (u: number) => -u * HOLLYWOOD_GRADE;

/** The cheek's sloping top: a hand over the nosings, level with the run-up above them and the sidewalk below. */
export const hollywoodCheekTop = (x: number) =>
  Math.max(-HOLLYWOOD_DROP + 0.4 * F, Math.min(0.4 * F, hollywoodNosing(x) + 0.15 * F));

/** The ground anywhere: the run-up and the steps, the cheek beside them, the sidewalk past it and the road. */
export function hollywoodSurface(x: number, z: number): number {
  if (z < HOLLYWOOD_CURB_Z && z > HOLLYWOOD_FAR_CURB_Z) return HOLLYWOOD_ROAD_Y;
  if (z < HOLLYWOOD_CHEEK_Z) return -HOLLYWOOD_DROP;
  if (z < HOLLYWOOD_LEFT_Z) return x < HOLLYWOOD_RUN + 0.4 * F ? hollywoodCheekTop(x) : -HOLLYWOOD_DROP;
  return hollywoodGround(x);
}

/** One continuous sloping top pipe; Hollywood's center rail has no lower bar. */
export const HOLLYWOOD_RAIL: Handrail = {
  start: HOLLYWOOD_RAIL_START,
  end: HOLLYWOOD_RAIL_END,
  top: HOLLYWOOD_RAIL_HEIGHT + HOLLYWOOD_RAIL_RADIUS * Math.hypot(1, HOLLYWOOD_GRADE),
  slope: HOLLYWOOD_GRADE,
  radius: HOLLYWOOD_RAIL_RADIUS,
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

// ----- Over the fence -----

/**
 * The other way down: over the side rail, the cheek and the picket fence
 * onto the sidewalk. The rider rolls across the run-up at an angle toward
 * the street (never more than 45° off the stairs: the run-up is a walkway
 * along them, and the gap is out and down, not sideways), pops at the lip
 * a few feet in from the center rail's post, and passes over the side rail
 * a few steps down, where it has dropped to the run-up's level; then on
 * over the fence, landing on the sidewalk well clear of it.
 *
 * Clearing all that takes a real pop whoever rides it (`pop`: a 2.8 ft
 * ollie), and some speed: the flight is 24 feet long. Spinning boards sweep
 * their ends back over the fence late in the flight, which is what sets
 * the length and the pop (hollywoodFence.test.ts holds every trick to it).
 */
export const HOLLYWOOD_FENCE_YAW = -32;
const FENCE_TURN = (HOLLYWOOD_FENCE_YAW * Math.PI) / 180;
const FENCE_POP = { x: -0.9 * F, z: -3 * F };
/** Down the line from the pop to touchdown. */
const FENCE_FLIGHT = 24 * F;
const fenceLine = (x: number) => FENCE_POP.z + (x - FENCE_POP.x) * Math.tan(FENCE_TURN);
const FENCE_LAND_X = FENCE_POP.x + FENCE_FLIGHT * Math.cos(FENCE_TURN);

export const HOLLYWOOD_FENCE_TERRAIN: DropTerrain = {
  drop: HOLLYWOOD_DROP,
  run: FENCE_LAND_X,
  landPast: 0,
  laneZ: fenceLine(FENCE_LAND_X),
  // The ground under the line; the surface has the rest of the spot for feet and shadows.
  ground: (u) => hollywoodSurface(u, fenceLine(u)),
  surface: hollywoodSurface,
  entry: { ...FENCE_POP, yaw: HOLLYWOOD_FENCE_YAW, hold: true },
  // An angled line runs out of run-up before the school wall: start just before the crouch.
  runUp: 0.15,
  pop: 1.4,
};
