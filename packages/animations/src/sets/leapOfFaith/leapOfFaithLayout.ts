import { FOOT, type DropTerrain } from '../elToro/stairs';

/** Point Loma High's original 1997 courtyard gap. The requested 14.3 ft is
 * authoritative here; secondary reports disagree. See docs/LEAP_OF_FAITH_REFERENCE.md. */
export const LEAP_OF_FAITH_FOOT = FOOT;
export const LEAP_OF_FAITH_DROP = 14.3 * FOOT;
export const LEAP_OF_FAITH_LIP_X = 0;
/** The skater rolls out toward the court across the head of the stairs and
 * ollies three feet short of the top step, in line with the center pipe,
 * angled 35° over the stair's bay-side rail into the open drop in front of
 * the undercroft. Crossing that rail a few steps down lets the pop stay low. */
export const LEAP_OF_FAITH_POP_X = -3 * FOOT;
export const LEAP_OF_FAITH_POP_Z = 4.5 * FOOT;
export const LEAP_OF_FAITH_YAW = -35;
export const LEAP_OF_FAITH_RUN = 11 * FOOT;
export const LEAP_OF_FAITH_LAND_X = LEAP_OF_FAITH_RUN;
const turn = LEAP_OF_FAITH_YAW * Math.PI / 180;
export const leapOfFaithLineZ = (x: number) => LEAP_OF_FAITH_POP_Z + (x - LEAP_OF_FAITH_POP_X) * Math.tan(turn);
export const LEAP_OF_FAITH_LANE_Z = leapOfFaithLineZ(LEAP_OF_FAITH_LAND_X);

/** The walkway runs along the facade (x = 0, toward −z). At its end the
 * short upper flight leaves it at 90°, descending straight out toward the
 * court (+x) with its rail along z = 0. The faceted landing turns the long
 * lower flight 90° again, parallel to the facade, descending away from the
 * walkway (+z). Counts and widths are photo estimates. */
/** Stair-local across offsets: 0 is the bay-side rail, X0 the far side. */
export const LEAP_OF_FAITH_STAIR_X0 = -9 * FOOT;
export const LEAP_OF_FAITH_STAIR_X1 = 0;
export const LEAP_OF_FAITH_STAIR_WIDTH = -LEAP_OF_FAITH_STAIR_X0;
export const LEAP_OF_FAITH_STAIR_RUN = 9 * FOOT;
export const LEAP_OF_FAITH_STEPS = 10;
export const LEAP_OF_FAITH_MID_DROP = LEAP_OF_FAITH_DROP * LEAP_OF_FAITH_STEPS / 27;
export const LEAP_OF_FAITH_RISER = LEAP_OF_FAITH_MID_DROP / LEAP_OF_FAITH_STEPS;
export const LEAP_OF_FAITH_TREAD = LEAP_OF_FAITH_STAIR_RUN / (LEAP_OF_FAITH_STEPS - 1);
/** s is distance along the stair's bay-side rail, not world x or z. The
 * landing turns about its inner corner; BEND_LENGTH is its outer arc. */
export const LEAP_OF_FAITH_BEND_DEGREES = 90;
export const LEAP_OF_FAITH_BEND_LENGTH = LEAP_OF_FAITH_STAIR_WIDTH * Math.PI / 2;
export const LEAP_OF_FAITH_MID_END_Z = LEAP_OF_FAITH_STAIR_RUN + LEAP_OF_FAITH_BEND_LENGTH;
export const LEAP_OF_FAITH_LOWER_RUN = 16 * FOOT;
export const LEAP_OF_FAITH_LOWER_STEPS = 17;
export const LEAP_OF_FAITH_STAIR_END_Z = LEAP_OF_FAITH_MID_END_Z + LEAP_OF_FAITH_LOWER_RUN;
export const LEAP_OF_FAITH_RAIL_HEIGHT = 3 * FOOT;
export const LEAP_OF_FAITH_RAIL_RADIUS = 1.7;
export const LEAP_OF_FAITH_BALCONY_BACK = -42 * FOOT;
export const LEAP_OF_FAITH_BALCONY_END_Z = -56 * FOOT;
export const LEAP_OF_FAITH_ALCOVE_Z = -5 * FOOT;
export const LEAP_OF_FAITH_ALCOVE_BACK = -10 * FOOT;
export const LEAP_OF_FAITH_ROOF_Y = 12 * FOOT;
/** The walkway's floor carries on behind the head of the stairs. */
export const LEAP_OF_FAITH_HEAD_Z = 20 * FOOT;

/** World heading of the stair's downhill direction, radians from +x toward +z. */
export function leapOfFaithStairHeading(s: number): number {
  const bend = Math.max(0, Math.min(1, (s - LEAP_OF_FAITH_STAIR_RUN) / LEAP_OF_FAITH_BEND_LENGTH));
  return bend * LEAP_OF_FAITH_BEND_DEGREES * Math.PI / 180;
}

/** Plan coordinates for a cross-section of the real stair: out from the
 * walkway, round two flat landing facets, then along the facade. */
export function leapOfFaithStairPoint(across: number, s: number): { x: number; z: number } {
  const run = LEAP_OF_FAITH_STAIR_RUN, width = LEAP_OF_FAITH_STAIR_WIDTH;
  if (s <= run) return { x: s, z: -across };
  const at = (p: number) => {
    const a = p * LEAP_OF_FAITH_BEND_DEGREES * Math.PI / 180, r = width + across;
    return { x: run + r * Math.sin(a), z: width - r * Math.cos(a) };
  };
  if (s < LEAP_OF_FAITH_MID_END_Z) {
    const bend = (s - run) / LEAP_OF_FAITH_BEND_LENGTH;
    const lo = bend < 0.5 ? 0 : 0.5, hi = lo + 0.5;
    const a = at(lo), b = at(hi), t = (bend - lo) / (hi - lo);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  }
  const p = at(1);
  return { x: p.x, z: p.z + s - LEAP_OF_FAITH_MID_END_Z };
}

export const LEAP_OF_FAITH_LANDING_OUTLINE = [
  leapOfFaithStairPoint(0, LEAP_OF_FAITH_STAIR_RUN),
  leapOfFaithStairPoint(0, LEAP_OF_FAITH_STAIR_RUN + LEAP_OF_FAITH_BEND_LENGTH / 2),
  leapOfFaithStairPoint(0, LEAP_OF_FAITH_MID_END_Z),
  leapOfFaithStairPoint(LEAP_OF_FAITH_STAIR_X0, LEAP_OF_FAITH_STAIR_RUN),
];

function onLanding(x: number, z: number): boolean {
  let inside = false;
  const points = LEAP_OF_FAITH_LANDING_OUTLINE;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Step height at stair distance s; convert through stairPoint for world x/z. */
export function leapOfFaithStairGround(s: number): number {
  if (s <= 0) return 0;
  if (s >= LEAP_OF_FAITH_STAIR_END_Z) return -LEAP_OF_FAITH_DROP;
  if (s > LEAP_OF_FAITH_MID_END_Z) {
    const step = Math.floor((s - LEAP_OF_FAITH_MID_END_Z) / (LEAP_OF_FAITH_LOWER_RUN / (LEAP_OF_FAITH_LOWER_STEPS - 1))) + 1;
    return -LEAP_OF_FAITH_MID_DROP - step * (LEAP_OF_FAITH_DROP - LEAP_OF_FAITH_MID_DROP) / LEAP_OF_FAITH_LOWER_STEPS;
  }
  if (s >= LEAP_OF_FAITH_STAIR_RUN) return -LEAP_OF_FAITH_MID_DROP;
  return -Math.min(LEAP_OF_FAITH_STEPS, Math.floor(s / LEAP_OF_FAITH_TREAD) + 1) * LEAP_OF_FAITH_RISER;
}

/** Smooth top pipe over the stair nosings, including the walkway and landing. */
export const leapOfFaithRailBase = (s: number) => s <= LEAP_OF_FAITH_MID_END_Z
  ? Math.max(-LEAP_OF_FAITH_MID_DROP, Math.min(0, -s * LEAP_OF_FAITH_RISER / LEAP_OF_FAITH_TREAD))
  : Math.max(-LEAP_OF_FAITH_DROP, -LEAP_OF_FAITH_MID_DROP - (s - LEAP_OF_FAITH_MID_END_Z) * (LEAP_OF_FAITH_DROP - LEAP_OF_FAITH_MID_DROP) / LEAP_OF_FAITH_LOWER_RUN);
export const leapOfFaithRailTop = (s: number) => leapOfFaithRailBase(s) + LEAP_OF_FAITH_RAIL_HEIGHT + LEAP_OF_FAITH_RAIL_RADIUS;

/** Top of the walkway rail (x = 0), the stair's bay-side rail (z = 0) or its
 * center pipe within `reach` of a plan point, or null away from all three. */
export function leapOfFaithGuardTop(x: number, z: number, reach: number): number | null {
  const walkway = Math.abs(x) <= reach && z <= reach && z >= LEAP_OF_FAITH_BALCONY_END_Z;
  const onFlight = x >= -reach && x <= LEAP_OF_FAITH_STAIR_RUN;
  const stair = onFlight && (Math.abs(z) <= reach || Math.abs(z - LEAP_OF_FAITH_STAIR_WIDTH / 2) <= reach);
  if (stair) return leapOfFaithRailTop(Math.max(0, x));
  return walkway ? leapOfFaithRailTop(0) : null;
}

/** Ground a rider or shadow actually meets. Looking at the facade from the
 * court, the stairs are on the left (+z) and the undercroft on the right (−z). */
export function leapOfFaithSurface(x: number, z: number): number {
  const width = LEAP_OF_FAITH_STAIR_WIDTH, run = LEAP_OF_FAITH_STAIR_RUN;
  if (x < 0 && x >= LEAP_OF_FAITH_BALCONY_BACK && z <= LEAP_OF_FAITH_HEAD_Z && z >= LEAP_OF_FAITH_BALCONY_END_Z) return 0;
  if (x >= 0 && x < run && z > 0 && z <= width) return leapOfFaithStairGround(x);
  if (onLanding(x, z)) return -LEAP_OF_FAITH_MID_DROP;
  const across = x - run - width, down = z - width;
  if (across >= LEAP_OF_FAITH_STAIR_X0 && across < 0 && down >= 0 && down < LEAP_OF_FAITH_LOWER_RUN) return leapOfFaithStairGround(LEAP_OF_FAITH_MID_END_Z + down);
  return -LEAP_OF_FAITH_DROP;
}

/** Heights on the diagonal jump line; rollout remains on the open courtyard. */
export const leapOfFaithGround = (x: number) => leapOfFaithSurface(x, leapOfFaithLineZ(x));

export const LEAP_OF_FAITH_TERRAIN: DropTerrain = {
  drop: LEAP_OF_FAITH_DROP,
  run: LEAP_OF_FAITH_RUN,
  landPast: 0,
  laneZ: LEAP_OF_FAITH_LANE_Z,
  ground: leapOfFaithGround,
  surface: leapOfFaithSurface,
  entry: { x: LEAP_OF_FAITH_POP_X, z: LEAP_OF_FAITH_POP_Z, yaw: LEAP_OF_FAITH_YAW, hold: true },
  runUp: 0.35,
  // The stair rail is part of the real gap. All styles must pop over it;
  // this is the lowest pop that keeps every flip and spin 0.2 ft clear.
  pop: 2,
};
