import { SET_FOOT, RISER, STAIR_DROP, STAIR_RUN, TREAD, nosingLine } from './stairs';
import type { SpotFilmers } from '../tripods';

/** The rails' pipe, height and run past the steps: the center one is the one grinds ride (stairs.ts). */
export { RAIL_EXT, RAIL_R, RAIL_TOP } from './stairs';

// ----- Layout: distances down the stairs (u, from the lip), across the set (z, toward the camera), heights over the top landing -----

/** The right flight runs from the planted bank to the single center rail. */
export const HILL_EDGE = -6 * SET_FOOT;
export const CENTER_Z = 6 * SET_FOOT;
/** Six feet left of the center rail when looking up the stairs. */
export const RIDER_LANE_Z = CENTER_Z + 6 * SET_FOOT;
/** Two equal twelve-foot flights, with the rail at the exact center of the stairs. */
export const WALL_Z = CENTER_Z + (CENTER_Z - HILL_EDGE);
export const WALL_THICK = 20;
export const WALL_H = 1.5 * SET_FOOT;
export const HILL_RAIL_Z = HILL_EDGE + 24;
export const FAR_RAIL_Z = WALL_Z - 24;
/** A mid rail half way up the handrails. */
export const RAIL_MID = 1.5 * SET_FOOT;
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
export const BUILDING_END = -18 * SET_FOOT;
export const BUILDING_LENGTH = 96 * SET_FOOT;
/** The school keeps its position, with an open upper walkway beside the stairs. */
export const BUILDING_FACE = CENTER_Z + 20 * SET_FOOT + 90;
export const BUILDING_DEPTH = 125 * SET_FOOT - BUILDING_FACE;
export const BUILDING_BACK = BUILDING_FACE + BUILDING_DEPTH;
export const BUILDING_H = 11 * SET_FOOT;
export const ROOF_RISE = 6.5 * SET_FOOT;
export const EAVE = 38;
/** The landings and the slopes beside the stairs run off toward the horizon. */
export const FAR = 30000;
/** Drawn with no frame down the stairs or the rail to place it, the lip waits this far ahead, out of reach. */
export const LIP_AWAY = 3200;

/** The embankment either side of the stairs: level with each landing, sloping with the steps between. */
export const hill = (u: number) => Math.max(-STAIR_DROP, Math.min(0, nosingLine(u) - HILL_DROP));
/** The side wall's top: a foot and a half over the steps, level over each landing. */
export const wallTop = (u: number) => Math.max(-STAIR_DROP, Math.min(0, nosingLine(u))) + WALL_H;

/**
 * El Toro's ground paint, sampled from the photographs (refs/palette.json) and set as the sunlit colour each
 * face is authored in (the look lights it). The rails' two are the old set's, unchanged.
 */
export const ET = {
  /** The run-up walk and the top landing: pale, a touch greyer than the apron below. */
  walk: '#cac1a7',
  /** The landing apron below the stairs. */
  landing: '#d0c5a9',
  /** The older, darker paving the rollaway runs on past the apron (refs/51). */
  paving: '#aea996',
  /** Treads, risers and the rubbed noses (refs/07, 43, 55): warm pale buff, not grey. */
  tread: '#c6bea4',
  riser: '#cbc3a9',
  nosing: '#dcd6bd',
  /** The sloped concrete band beside the steps on the canopy side, and its curb. */
  band: '#cfbc99',
  /** Dry umber bank dirt, and the lawns at the bottom. */
  dirt: '#8c7a5e',
  grass: '#7f8d55',
  rail: '#6f7975',
  railLit: '#bfc5bb',
} as const;

/**
 * Where El Toro's filmers stand (tripods.ts), in the set's own layout. All
 * three stand on the side wall's side, clear of the rider's line, the rail,
 * and the ride away.
 */
export const EL_TORO_FILMERS: SpotFilmers = {
  stairs: {
    line: RIDER_LANE_Z,
    stands: {
      // Crouched on the bottom landing a little off the line, where the ride away rolls up to.
      bottom: { u: STAIR_RUN + 30 * SET_FOOT, z: WALL_Z - SET_FOOT, height: 3 * SET_FOOT - STAIR_DROP, frame: 30 * SET_FOOT, place: 0.42 },
      // Well up the grass bank past the side wall, on a long lens across the set.
      side: { u: 0.6 * STAIR_RUN, z: WALL_Z + 20 * SET_FOOT, height: hill(0.6 * STAIR_RUN) + 5 * SET_FOOT, frame: 30 * SET_FOOT, place: 0.52 },
      // At the top beside the side wall, holding the camera up to see down the set.
      top: { u: -40, z: WALL_Z + 3 * SET_FOOT, height: 6 * SET_FOOT, frame: 20 * SET_FOOT, place: 0.48 },
    },
  },
};
