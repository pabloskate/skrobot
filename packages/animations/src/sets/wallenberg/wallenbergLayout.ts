/** World units per foot, shared with the existing five-foot rider scale. */
export const FOOT = 29;
const INCH = FOOT / 12;

/**
 * Jenkem's measured 51-inch height and 198-inch lip-to-lip length (2017),
 * over four curbs: three 15-inch blocks and the short street curb at the
 * bottom (6 inches), with equal treads between their lips.
 */
export const WALLENBERG_DROP = (51 / 12) * FOOT;
export const WALLENBERG_RUN = (198 / 12) * FOOT;
export const WALLENBERG_RISERS: readonly number[] = [15, 15, 15, 6].map((inches) => inches * INCH);
export const WALLENBERG_STEPS = WALLENBERG_RISERS.length;
export const WALLENBERG_TREAD = WALLENBERG_RUN / (WALLENBERG_STEPS - 1);
export const WALLENBERG_LANE_Z = 0;

/** Height of the `i`th tread over the top platform, counting down: 0 the platform itself, 4 the street below the last curb. */
export function wallenbergLevel(i: number): number {
  if (i >= WALLENBERG_STEPS) return -WALLENBERG_DROP;
  return -WALLENBERG_RISERS.slice(0, i).reduce((sum, rise) => sum + rise, 0);
}

/*
 * The plan, from photographs (docs/WALLENBERG_REFERENCE.md); +x runs down
 * the gap, and looking up it from the street +z is on the left.
 *
 * The curbs run square to the line from the side stairs (+z) toward the
 * court side (−z). The lower two run on out of sight; the top two end in
 * rounded corners, the second reaching further out, their sides sinking into
 * the broad asphalt slope that rises from the second tread back past them to
 * the gate. Behind the top platform the gym stands with its corner on the
 * line; the run-up is the alley between the gym's side wall and the low
 * ledge holding that slope back, the plywood roll-in standing free in it,
 * and a one-storey brick annex well behind against the gym's wall.
 */

/** Where the top two curbs round their corners on the court side, and how round. */
export const WALLENBERG_END_Z: readonly number[] = [-12, -20].map((feet) => feet * FOOT);
export const WALLENBERG_CORNER_R: readonly number[] = [3.5, 3.5].map((feet) => feet * FOOT);
/** The side stairs: the curbs stop at them; a flight per curb, of three steps but one at the short bottom curb. */
export const WALLENBERG_SIDE_STAIRS_Z0 = 22 * FOOT;
export const WALLENBERG_SIDE_STAIRS_Z1 = 29 * FOOT;
export const WALLENBERG_FLIGHTS: readonly number[] = [3, 3, 3, 1];
export const WALLENBERG_STEP_RUN = FOOT;
/** The roll-in's deck, its back edge clear of everything behind it. */
export const WALLENBERG_RAMP_DECK_X = -33 * FOOT;
/** The one-storey brick annex against the gym's side wall near its back, well behind the roll-in: front, back and roof. */
export const WALLENBERG_ANNEX_FRONT_X = -56 * FOOT;
export const WALLENBERG_ANNEX_X = -74 * FOOT;
export const WALLENBERG_ANNEX_HEIGHT = 10 * FOOT;
/** The gym: its front face behind the top platform, its side wall along the run-up. */
export const WALLENBERG_GYM_X = -8 * FOOT;
export const WALLENBERG_GYM_Z = 4.5 * FOOT;
export const WALLENBERG_GYM_FAR_Z = 44 * FOOT;
export const WALLENBERG_GYM_BACK_X = -80 * FOOT;
export const WALLENBERG_GYM_HEIGHT = 24 * FOOT;
/** The ledge along the alley's court side, holding the slope back. */
export const WALLENBERG_LEDGE_Z = -4.5 * FOOT;
/**
 * The slope on the court side: level with the second tread where the
 * second curb's face would run, rising back toward the gate at this grade,
 * to the level of the top platform and on past it, flat beyond the gate.
 */
export const WALLENBERG_SLOPE = 0.13;
export const WALLENBERG_GATE_X = -50 * FOOT;
export const WALLENBERG_FENCE_Z = -75 * FOOT;

/** Height of the court-side slope `x` along the line. */
export function wallenbergSlope(x: number): number {
  return wallenbergLevel(2) + WALLENBERG_SLOPE * (WALLENBERG_TREAD - Math.max(x, WALLENBERG_GATE_X - 10 * FOOT));
}

/** Where the slope comes level with tread `i` (0 the top platform, 1 the second block's top). */
export const slopeMeets = (i: number) => WALLENBERG_TREAD - (wallenbergLevel(i) - wallenbergLevel(2)) / WALLENBERG_SLOPE;

/**
 * The plywood roll-in, standing free on its own framing: an eight-foot deck,
 * a rounded lip, and a transition steepening to 65° just under it, down to
 * the alley floor.
 */
export const WALLENBERG_RAMP = (() => {
  const height = 8 * FOOT;
  const angle = (65 * Math.PI) / 180;
  const lip = 1.5 * FOOT;
  const top = WALLENBERG_RAMP_DECK_X + 3 * FOOT;
  const radius = height / (1 - Math.cos(angle)) - lip;
  const joint = top + lip * Math.sin(angle);
  return { height, angle, lip, radius, deck: WALLENBERG_RAMP_DECK_X, top, joint, bottom: joint + radius * Math.sin(angle), halfWidth: 3.25 * FOOT };
})();

/** Where the rider stands on the roll-in's deck, nose at the lip, and the nudge they drop in with. */
export const WALLENBERG_DROP_IN = { x: WALLENBERG_RAMP.top - 1 * FOOT, speed: 3.5 * FOOT };

/** Height of the roll-in's riding surface over the alley floor, `x` along the line. */
export function wallenbergRampHeight(x: number): number {
  const r = WALLENBERG_RAMP;
  if (x >= r.bottom) return 0;
  if (x >= r.joint) return r.radius - Math.sqrt(Math.max(0, r.radius ** 2 - (r.bottom - x) ** 2));
  if (x >= r.top) return r.height - r.lip + Math.sqrt(Math.max(0, r.lip ** 2 - (x - r.top) ** 2));
  return r.height;
}

/** The rider's line: down the roll-in, along the alley and the top platform, then the four curbs. */
export function wallenbergGround(x: number): number {
  if (x < 0) return wallenbergRampHeight(x);
  if (x >= WALLENBERG_RUN) return -WALLENBERG_DROP;
  return wallenbergLevel(Math.floor(x / WALLENBERG_TREAD) + 1);
}

/** Whether (x, z) is on the upper side of curb `i`: behind its face and, for the top two, inside their rounded ends. */
export function aboveCurb(i: number, x: number, z: number): boolean {
  const face = i * WALLENBERG_TREAD;
  if (x >= face) return false;
  if (i >= WALLENBERG_END_Z.length) return true;
  const end = WALLENBERG_END_Z[i];
  const r = WALLENBERG_CORNER_R[i];
  if (z <= end) return false;
  if (x <= face - r || z >= end + r) return true;
  return Math.hypot(x - (face - r), z - (end + r)) < r;
}

/** Where the court-side slope is: past the top block and the alley's ledge, behind the second curb's face. */
const onSlope = (x: number, z: number) => x < WALLENBERG_TREAD && z < (x < slopeMeets(0) ? WALLENBERG_LEDGE_Z : WALLENBERG_END_Z[0]);

/** Height down the side stairs, `x` along the line. */
export function sideStairHeight(x: number): number {
  if (x < 0) return 0;
  const i = Math.min(WALLENBERG_STEPS - 1, Math.floor(x / WALLENBERG_TREAD));
  const steps = WALLENBERG_FLIGHTS[i];
  const down = Math.min(steps, Math.floor((x - i * WALLENBERG_TREAD) / WALLENBERG_STEP_RUN) + 1);
  return wallenbergLevel(i) - (WALLENBERG_RISERS[i] * down) / steps;
}

/** Height of everything a rider, a board or a shadow can come down on, over the top platform. */
export function wallenbergSurface(x: number, z: number): number {
  if (x < 0 && Math.abs(z - WALLENBERG_LANE_Z) <= WALLENBERG_RAMP.halfWidth) return wallenbergRampHeight(x);
  if (z >= WALLENBERG_SIDE_STAIRS_Z0 && z < WALLENBERG_SIDE_STAIRS_Z1) return sideStairHeight(x);
  if (z >= WALLENBERG_SIDE_STAIRS_Z1) return Math.max(-WALLENBERG_DROP, Math.min(0, (-x / WALLENBERG_RUN) * WALLENBERG_DROP));
  let level = 0;
  while (level < WALLENBERG_STEPS && aboveCurb(WALLENBERG_STEPS - 1 - level, x, z)) level++;
  const blocks = wallenbergLevel(WALLENBERG_STEPS - level);
  return onSlope(x, z) ? Math.max(blocks, wallenbergSlope(x)) : blocks;
}
