import { FOOT, RISER, STAIR_DROP, STAIR_RUN, TREAD, nosingLine } from './stairs';

/** The rails' pipe, height and run past the steps: the center one is the one grinds ride (stairs.ts). */
export { RAIL_EXT, RAIL_R, RAIL_TOP } from './stairs';

// ----- Layout: distances down the stairs (u, from the lip), across the set (z, toward the camera), heights over the top landing -----

/** The right flight runs from the planted bank to the single center rail. */
export const HILL_EDGE = -6 * FOOT;
export const CENTER_Z = 6 * FOOT;
/** Six feet left of the center rail when looking up the stairs. */
export const RIDER_LANE_Z = CENTER_Z + 6 * FOOT;
/** Two equal twelve-foot flights, with the rail at the exact center of the stairs. */
export const WALL_Z = CENTER_Z + (CENTER_Z - HILL_EDGE);
export const WALL_THICK = 20;
export const WALL_H = 1.5 * FOOT;
export const HILL_RAIL_Z = HILL_EDGE + 24;
export const FAR_RAIL_Z = WALL_Z - 24;
/** A mid rail half way up the handrails. */
export const RAIL_MID = 1.5 * FOOT;
/** Posts, at these distances down the stairs. */
export const POSTS = [0.5, 6.5, 12.5, 18.5].map((k) => k * TREAD);
/** The hill lies just under the steps' inner corners, so their ends stand out of the dirt. */
export const HILL_DROP = 0.55 * RISER;
/** The side wall runs from a little before the lip to a little past the bottom step. */
export const WALL_U0 = -60;
export const WALL_U1 = STAIR_RUN + 60;
/** The bed planted along the wall's far side, and the bare dirt of the hill before it grasses over. */
export const BED = 70;
export const DIRT_WIDTH = 520;
/**
 * The school building beside the run-up, across the set from the dirt hill: block walls,
 * blue lockers along the side the run-up passes, a pitched roof overhanging
 * it. Its end faces down the stairs a little back from the lip.
 */
export const BUILDING_END = -50;
export const BUILDING_LENGTH = 1400;
/** The school keeps its position, with an open upper walkway beside the stairs. */
export const BUILDING_FACE = CENTER_Z + 20 * FOOT + 90;
export const BUILDING_DEPTH = 420;
export const BUILDING_BACK = BUILDING_FACE + BUILDING_DEPTH;
export const BUILDING_H = 11 * FOOT;
export const ROOF_RISE = 80;
export const EAVE = 38;
/** The landings and the slopes beside the stairs run off toward the horizon. */
export const FAR = 30000;
/** Drawn with no frame down the stairs or the rail to place it, the lip waits this far ahead, out of reach. */
export const LIP_AWAY = 3200;

/** The embankment either side of the stairs: level with each landing, sloping with the steps between. */
export const hill = (u: number) => Math.max(-STAIR_DROP, Math.min(0, nosingLine(u) - HILL_DROP));
/** The side wall's top: a foot and a half over the steps, level over each landing. */
export const wallTop = (u: number) => Math.max(-STAIR_DROP, Math.min(0, nosingLine(u))) + WALL_H;

export const ET = {
  concrete: '#bdbbad',
  joint: '#817f72',
  tread: '#c9c7ba',
  riser: '#b8b6a9',
  nosing: '#d0cfc2',
  dirt: '#887456',
  wall: '#bcb8a6',
  planter: '#7c8061',
  grass: '#8b9468',
  rail: '#6f7975',
  railLit: '#bfc5bb',
} as const;
