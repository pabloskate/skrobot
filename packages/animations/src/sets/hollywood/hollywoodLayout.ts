import type { Handrail } from '../../motion/grind';
import type { DropTerrain } from '../elToro/stairs';
import { SET_FOOT } from '../setScale';
import type { SpotFilmers } from '../tripods';

/** Hollywood High's opposite flights off one walkway. Dimensions are visual
 * estimates, not a survey; see docs/HOLLYWOOD_REFERENCE.md. */
export const HOLLYWOOD_FOOT = SET_FOOT;
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

/** The north-facing twelve is more compact and steeper, not a scaled sixteen.
 * Both landings share the scene's estimated sidewalk datum. */
export const HOLLYWOOD_WALKWAY = 42 * F;
export const HOLLYWOOD_12_LIP = -HOLLYWOOD_WALKWAY;
export const HOLLYWOOD_12_STEPS = 12;
export const HOLLYWOOD_12_DROP = HOLLYWOOD_DROP;
export const HOLLYWOOD_12_RUN = 10.5 * F;
export const HOLLYWOOD_12_RISER = HOLLYWOOD_12_DROP / HOLLYWOOD_12_STEPS;
export const HOLLYWOOD_12_TREAD = HOLLYWOOD_12_RUN / (HOLLYWOOD_12_STEPS - 1);
export const HOLLYWOOD_12_GRADE = HOLLYWOOD_12_RISER / HOLLYWOOD_12_TREAD;
/** In the twelve's frame the street is +z, school −z: a half-turn, not a mirror. */
export const HOLLYWOOD_12_LANE_Z = -HOLLYWOOD_LANE_Z;
export const HOLLYWOOD_12_RAIL_END = HOLLYWOOD_12_RUN - 0.35 * F;

/** The street side: the concrete cheek's outer face, the black picket fence
 * on the sidewalk below it, the wide sidewalk, and the road's near curb. */
export const HOLLYWOOD_CHEEK_Z = HOLLYWOOD_LEFT_Z - 0.65 * F;
export const HOLLYWOOD_FENCE_Z = HOLLYWOOD_LEFT_Z - 0.95 * F;
/** Its pickets' tops (7.25 ft over the sidewalk), as a height over the top landing; the spear tips stand a little over them. */
export const HOLLYWOOD_FENCE_TOP = -HOLLYWOOD_DROP + 7.25 * F;
export const HOLLYWOOD_FENCE_TIPS = HOLLYWOOD_FENCE_TOP + 7;
export const HOLLYWOOD_FENCE_START = HOLLYWOOD_12_LIP - HOLLYWOOD_12_RUN - 12 * F;
export const HOLLYWOOD_FENCE_END = HOLLYWOOD_RUN + 12 * F;
export const HOLLYWOOD_CURB_Z = HOLLYWOOD_LEFT_Z - 15 * F;
/** Four eleven-foot lanes, two each way, between the curbs. */
export const HOLLYWOOD_LANE_WIDTH = 11 * F;
export const HOLLYWOOD_FAR_CURB_Z = HOLLYWOOD_CURB_Z - 4 * HOLLYWOOD_LANE_WIDTH;
/** The road, half a foot under the sidewalks (the curbs' height). */
export const HOLLYWOOD_ROAD_Y = -HOLLYWOOD_DROP - 0.5 * F;

export function hollywoodGround(u: number): number {
  if (u <= HOLLYWOOD_12_LIP) return hollywood12Ground(HOLLYWOOD_12_LIP - u);
  if (u < 0) return 0;
  if (u >= HOLLYWOOD_RUN) return -HOLLYWOOD_DROP;
  return -(Math.floor(u / HOLLYWOOD_TREAD) + 1) * HOLLYWOOD_RISER;
}

/** Ground going north down the twelve, in its own downhill (+x) frame. */
export function hollywood12Ground(u: number): number {
  if (u <= -HOLLYWOOD_WALKWAY) {
    const south = -HOLLYWOOD_WALKWAY - u;
    return south >= HOLLYWOOD_RUN ? -HOLLYWOOD_DROP : -(Math.floor(south / HOLLYWOOD_TREAD) + 1) * HOLLYWOOD_RISER;
  }
  if (u < 0) return 0;
  if (u >= HOLLYWOOD_12_RUN) return -HOLLYWOOD_12_DROP;
  return -(Math.floor(u / HOLLYWOOD_12_TREAD) + 1) * HOLLYWOOD_12_RISER;
}

export const hollywood12Nosing = (u: number) => -u * HOLLYWOOD_12_GRADE;
export const hollywood12CheekTop = (u: number) =>
  Math.max(-HOLLYWOOD_12_DROP + 0.4 * F, Math.min(0.4 * F, hollywood12Nosing(u) + 0.15 * F));

export const hollywoodNosing = (u: number) => -u * HOLLYWOOD_GRADE;

/** The cheek's sloping top: a hand over the nosings, level with the run-up above them and the sidewalk below. */
export const hollywoodCheekTop = (x: number) =>
  Math.max(-HOLLYWOOD_DROP + 0.4 * F, Math.min(0.4 * F, hollywoodNosing(x) + 0.15 * F));

/** The ground anywhere: the run-up and the steps, the cheek beside them, the sidewalk past it and the road. */
export function hollywoodSurface(x: number, z: number): number {
  if (z < HOLLYWOOD_CURB_Z && z > HOLLYWOOD_FAR_CURB_Z) return HOLLYWOOD_ROAD_Y;
  if (z < HOLLYWOOD_CHEEK_Z) return -HOLLYWOOD_DROP;
  if (z < HOLLYWOOD_LEFT_Z) {
    if (x < HOLLYWOOD_12_LIP) return x > HOLLYWOOD_12_LIP - HOLLYWOOD_12_RUN - 0.4 * F ? hollywood12CheekTop(HOLLYWOOD_12_LIP - x) : -HOLLYWOOD_DROP;
    return x < HOLLYWOOD_RUN + 0.4 * F ? hollywoodCheekTop(x) : -HOLLYWOOD_DROP;
  }
  return hollywoodGround(x);
}

export const hollywood12Surface = (x: number, z: number) => hollywoodSurface(HOLLYWOOD_12_LIP - x, -z);

/** One continuous sloping top pipe; Hollywood's center rail has no lower bar. */
export const HOLLYWOOD_RAIL: Handrail = {
  start: HOLLYWOOD_RAIL_START,
  end: HOLLYWOOD_RAIL_END,
  top: HOLLYWOOD_RAIL_HEIGHT + HOLLYWOOD_RAIL_RADIUS * Math.hypot(1, HOLLYWOOD_GRADE),
  slope: HOLLYWOOD_GRADE,
  radius: HOLLYWOOD_RAIL_RADIUS,
  ground: hollywoodGround,
  rest: (u) => Math.max(-HOLLYWOOD_DROP, Math.min(0, hollywoodNosing(u))),
  speed: 14 * F,
};

export const HOLLYWOOD_12_RAIL: Handrail = {
  start: HOLLYWOOD_RAIL_START,
  end: HOLLYWOOD_12_RAIL_END,
  top: HOLLYWOOD_RAIL_HEIGHT + HOLLYWOOD_RAIL_RADIUS * Math.hypot(1, HOLLYWOOD_12_GRADE),
  slope: HOLLYWOOD_12_GRADE,
  radius: HOLLYWOOD_RAIL_RADIUS,
  ground: hollywood12Ground,
  rest: (u) => Math.max(-HOLLYWOOD_12_DROP, Math.min(0, hollywood12Nosing(u))),
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
 * The rail and the fence's tips are about level with the run-up, so it's
 * fast and low: a 24 foot flight, popped only as high as the trick needs
 * to get its board over them (fencePop), at 14 to 16 mph.
 */
export const HOLLYWOOD_FENCE_YAW = -32;

/**
 * The pop over the fence (as a style's popHeight: twice it in feet of deck
 * rise), the same whoever rides it: just enough that the board clears the
 * side rail and the spear tips by about five inches, and the legs by a
 * foot, every stance both ways round (hollywoodFence.test.ts holds every
 * trick to it, and to not much more). The rail is the tight one: it's
 * crossed near the top, while the board's still tail-down off the pop.
 * A board that stays pointing down the line skims over at 1.4 feet; one
 * the trick turns across it swings its ends wide, back over the rail
 * late, and takes 1.9; an impossible's, wrapping round the back foot,
 * swings its free end down past the sole and takes 2.2.
 */
const FENCE_POP_ALONG = 0.7;
const FENCE_POP_ACROSS = 0.95;
const FENCE_POP_WRAP = 1.1;
/** Flips, and late shuvs: the board still lined up as it goes over the rail. */
const BOARD_ALONG = new Set([
  'Ollie', 'Ollie North', 'Kickflip', 'Heelflip', 'Double Kickflip', 'Double Heelflip',
  'Late Kickflip', 'Late Backside Shuvit', 'Late Frontside Shuvit',
]);
/** A trick's pop over the fence; without one, the most any takes. */
export function fencePop(base?: string): number {
  if (base === undefined || base === 'Impossible') return FENCE_POP_WRAP;
  return BOARD_ALONG.has(base) ? FENCE_POP_ALONG : FENCE_POP_ACROSS;
}
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
  trickPop: fencePop,
};

const lower = -HOLLYWOOD_DROP;

/** Where the filmers stand (tripods.ts): the sixteen's on its street side, and over the fence their own. */
export const HOLLYWOOD_FILMERS: SpotFilmers = {
  stairs: {
    line: HOLLYWOOD_LANE_Z,
    stands: {
      bottom: { u: HOLLYWOOD_RUN + 23 * F, z: HOLLYWOOD_LEFT_Z + 1.6 * F, height: lower + 2.8 * F, frame: 24 * F, place: 0.43 },
      side: { u: HOLLYWOOD_RUN + 6 * F, z: HOLLYWOOD_LEFT_Z - 14 * F, height: lower + 7 * F, frame: 23 * F, place: 0.53 },
      top: { u: -3 * F, z: HOLLYWOOD_LEFT_Z + 1.1 * F, height: 6.5 * F, frame: 19 * F, place: 0.48 },
    },
    across: {
      // The school runs along the right side to the bottom step: past its end, looking back up.
      side: { u: HOLLYWOOD_RUN + 14 * F, z: HOLLYWOOD_RIGHT_Z + 4 * F, height: lower + 5.5 * F, frame: 23 * F, place: 0.53 },
    },
  },
  obstacles: {
    // Over the fence: from the sidewalk the rider lands on, from down the
    // street, and from the top of the stairs behind the center rail, as
    // the classic clips were filmed.
    fence: {
      line: fenceLine,
      stands: {
        bottom: { u: 8 * F, z: HOLLYWOOD_CURB_Z + 1.5 * F, height: lower + 2.6 * F, frame: 22 * F, place: 0.45 },
        side: { u: 58 * F, z: HOLLYWOOD_FENCE_Z - 5 * F, height: lower + 5.5 * F, frame: 24 * F, place: 0.5 },
        top: { u: 2 * F, z: 3 * F, height: 5 * F, frame: 20 * F, place: 0.5 },
      },
      across: {
        // The stairs are on the line's right: down the sidewalk past the
        // landing instead, standing to see over the pickets.
        bottom: { u: 34 * F, z: HOLLYWOOD_FENCE_Z - 5 * F, height: lower + 5.5 * F, frame: 22 * F, place: 0.45 },
        // The sidewalk's on its left, a floor down: on the run-up inside the fence.
        top: { u: -6 * F, z: HOLLYWOOD_LEFT_Z + 2 * F, height: 5 * F, frame: 20 * F, place: 0.5 },
      },
    },
  },
};

/** The twelve's filmers, on its own street side. */
export const HOLLYWOOD_12_FILMERS: SpotFilmers = {
  stairs: {
    line: HOLLYWOOD_12_LANE_Z,
    stands: {
      bottom: { u: HOLLYWOOD_12_RUN + 23 * F, z: HOLLYWOOD_RIGHT_Z - 1.6 * F, height: lower + 2.8 * F, frame: 22 * F, place: 0.43 },
      // Above the pickets and in front of the street-tree canopy.
      side: { u: HOLLYWOOD_12_RUN + 6 * F, z: HOLLYWOOD_RIGHT_Z + 4 * F, height: lower + 10 * F, frame: 23 * F, place: 0.53 },
      top: { u: -3 * F, z: HOLLYWOOD_RIGHT_Z - 1.1 * F, height: 6.5 * F, frame: 18 * F, place: 0.48 },
    },
    across: {
      // No pickets to see over on the left: standing on the bottom landing.
      side: { u: HOLLYWOOD_12_RUN + 6 * F, z: HOLLYWOOD_12_LANE_Z - 8 * F, height: lower + 5.5 * F, frame: 23 * F, place: 0.53 },
    },
  },
};
