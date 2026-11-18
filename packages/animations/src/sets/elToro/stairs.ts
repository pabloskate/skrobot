import type { Handrail } from '../../motion/grind';
import { SET_FOOT } from '../setScale';
import type { DropTerrain } from '../terrain';

/**
 * El Toro: the 20 stair at El Toro High School (Lake Forest, California),
 * for the three.js stage. Twenty steps falling 9.5 feet over 20 feet, laid
 * out in set units (setScale.ts): the steps, the drop a gap trick flies
 * (planned by stage/drop.ts, as every spot's is), and the center handrail.
 *
 * Distances down the stairs are measured from the lip (the top step's edge),
 * downhill positive; heights are over the top landing, up positive.
 */

export const STAIR_STEPS = 20;
/** Nine and a half feet down; geometry and physics share this drop. */
export const STAIR_DROP = 9.5 * SET_FOOT;
/** …over twenty feet, lip to bottom step. */
export const STAIR_RUN = 20 * SET_FOOT;
/** Twenty risers and the nineteen treads between them. */
export const RISER = STAIR_DROP / STAIR_STEPS;
export const TREAD = STAIR_RUN / (STAIR_STEPS - 1);
/** Board center past the bottom step at touchdown. */
const LAND_PAST = 4 * SET_FOOT;

export const EL_TORO_TERRAIN: DropTerrain = {
  drop: STAIR_DROP, run: STAIR_RUN, landPast: LAND_PAST, laneZ: 12 * SET_FOOT, ground: stairGround,
};

/** Height of the ground over the top landing, `u` down the stairs. */
export function stairGround(u: number): number {
  if (u < 0) return 0;
  if (u >= STAIR_RUN) return -STAIR_DROP;
  return -RISER * (Math.floor(u / TREAD) + 1);
}

/** Where a step's nosing line runs: through every step's top edge, from the lip down. */
export const nosingLine = (u: number) => (-u * RISER) / TREAD;

// ----- The center handrail -----

/** Galvanized pipe, its axis 36" over the nosings, as the code wants a handrail. */
export const RAIL_R = 2.4;
export const RAIL_TOP = 3 * SET_FOOT;
/** The straight rail runs on this far past the top and bottom steps. */
export const RAIL_EXT = 35;

/**
 * El Toro's center handrail as a grind sees it: a straight pipe from just
 * before the lip to just past the bottom step, its top (a radius over the
 * axis, square to the slope) falling with the nosings. A slip comes down
 * on the steps, and a body lying on them rests along the nosings.
 */
export const EL_TORO_RAIL: Handrail = {
  start: -RAIL_EXT,
  end: STAIR_RUN + RAIL_EXT,
  top: RAIL_TOP + RAIL_R * Math.hypot(1, RISER / TREAD),
  slope: RISER / TREAD,
  radius: RAIL_R,
  ground: stairGround,
  rest: (u) => Math.max(-STAIR_DROP, Math.min(0, nosingLine(u))),
  // A good roll for a rail: under the speed it takes to jump the set (20.6 feet a second), but not by much: the rail
  // is steep and the grind gains on it, so a skater comes off the bottom faster than the gap's flight.
  speed: 15 * SET_FOOT,
};
