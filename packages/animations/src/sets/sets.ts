import type { TripodId } from '../camera/camera';
import { approachFar, type Handrail } from '../motion/grind';
import { grindSpecFor, type GrindSpec } from '../motion/grindDefinitions';
import { resolveRiderMechanics, type RiderMechanics } from '../motion/stance';
import type { RiderStance, SkateStyle, Trick } from '../types';
import { CENTER_Z, FAR_RAIL_Z, HILL_RAIL_Z } from './elToro/elToroLayout';
import { EL_TORO_RAIL, EL_TORO_TERRAIN, FOOT, stairTimeline, type DropTerrain } from './elToro/stairs';
import { HOLLYWOOD_DROP, HOLLYWOOD_RUN, HOLLYWOOD_LANE_Z, HOLLYWOOD_RAIL, HOLLYWOOD_CENTER_Z, HOLLYWOOD_LEFT_RAIL_Z, HOLLYWOOD_RIGHT_RAIL_Z, hollywoodGround } from './hollywood/hollywoodLayout';
import { WALLENBERG_DROP, WALLENBERG_RUN, WALLENBERG_LANE_Z, wallenbergGround } from './wallenberg/wallenbergLayout';
import { SUNSET_DROP, SUNSET_LAND_X, SUNSET_LANE_Z, SUNSET_POP_X, SUNSET_POP_Z, sunsetGround, sunsetSlope, sunsetSurface } from './sunset/sunsetLayout';

/**
 * The sets a trick can be staged at (the explorer calls them spots), and
 * what each one changes about the attempt. Everything that differs from set
 * to set and isn't its scenery is read from here: the stage plans stairs and
 * handrails from it, the renderer and the video recorder paint a far
 * panorama only where there is one, and the explorer offers tripods where
 * the set has them. Each set's scenery is its own folder under sets/, built
 * for the renderer in three/renderer.ts.
 */

export type StageSet = 'plaza' | 'waterfront' | 'el-toro' | 'hollywood-high' | 'wallenberg' | 'sunset-car-wash';

/**
 * Which handrail a grind rides where a set has several: the center one, or
 * a side one. The side isn't picked: it's the one the grind's approach puts
 * on the rider's far side, coming in from the stairs (a regular rider's
 * backside boardslide takes the right rail going down, a frontside one the
 * left).
 */
export type RailChoice = 'center' | 'side';

/** One of a set's handrails, by where it stands looking down the stairs. */
export type RailLine = 'center' | 'left' | 'right';

export interface SetRails {
  /** Side rails can be scenery only when a real wall or fence leaves no board clearance. */
  sideGrinds?: boolean;
  /** Every handrail here as a grind sees it: the same pipe over the same steps. */
  handrail: Handrail;
  /** Where each stands across the set (z, toward the camera; looking down the stairs, left is −z). */
  z: Readonly<Record<RailLine, number>>;
}

export interface SetInfo {
  id: StageSet;
  /** What the spot picker calls it. */
  label: string;
  /**
   * The drop a flatground trick goes down here (stairs, a gap, a bank;
   * sets/elToro/stairs.ts plans it), travel fixed downhill whatever the
   * stance; null on a flat spot.
   */
  terrain: DropTerrain | null;
  /** Whether this spot has a rail or bar to grind. */
  grinds: boolean;
  /** Where the spot is and what's there, for the spot picker. */
  description?: string;
  /** The handrails grinds ride down here; null where they ride the flat bar. */
  rails: SetRails | null;
  /** Its far panorama is SVG painted under the canvas, so the canvas leaves the sky see-through. */
  farPanorama: boolean;
  /** Filmers standing still at the set, beside the crane that follows the rider. */
  tripods: readonly TripodId[];
}

export const STAGE_SETS: readonly SetInfo[] = [
  { id: 'plaza', label: 'Plaza', terrain: null, grinds: true, rails: null, farPanorama: false, tripods: [] },
  { id: 'waterfront', label: 'Waterfront', terrain: null, grinds: true, rails: null, farPanorama: true, tripods: [] },
  {
    id: 'el-toro',
    label: 'El Toro',
    terrain: EL_TORO_TERRAIN,
    grinds: true,
    rails: { handrail: EL_TORO_RAIL, z: { center: CENTER_Z, left: HILL_RAIL_Z, right: FAR_RAIL_Z } },
    farPanorama: false,
    tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'hollywood-high', label: 'Hollywood 16', grinds: true,
    description: 'Hollywood High, Los Angeles · 16 stairs and the iconic center handrail.',
    terrain: { drop: HOLLYWOOD_DROP, run: HOLLYWOOD_RUN, landPast: 4 * FOOT, laneZ: HOLLYWOOD_LANE_Z, ground: hollywoodGround },
    rails: { handrail: HOLLYWOOD_RAIL, sideGrinds: false, z: { center: HOLLYWOOD_CENTER_Z, left: HOLLYWOOD_LEFT_RAIL_Z, right: HOLLYWOOD_RIGHT_RAIL_Z } },
    farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'wallenberg', label: 'Wallenberg', grinds: false,
    description: 'San Francisco · Four blocks, 51 inches down and 198 inches across.',
    terrain: { drop: WALLENBERG_DROP, run: WALLENBERG_RUN, landPast: 3 * FOOT, laneZ: WALLENBERG_LANE_Z, ground: wallenbergGround, runUp: 0.1 },
    rails: null, farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'sunset-car-wash', label: 'Sunset Car Wash', grinds: false,
    description: 'Sunset Boulevard, Los Angeles · Along the roof, a quarter-turn into the bank, then downhill.',
    terrain: {
      drop: SUNSET_DROP, run: SUNSET_LAND_X, landPast: 0, laneZ: SUNSET_LANE_Z,
      ground: sunsetGround, slope: sunsetSlope, surface: sunsetSurface,
      entry: { x: SUNSET_POP_X, z: SUNSET_POP_Z, yaw: -90 },
    },
    rails: null, farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
];

const BY_ID = new Map(STAGE_SETS.map((set) => [set.id, set]));

/** What a set changes about the attempt; the plaza for anything unknown. */
export const setInfo = (id: StageSet): SetInfo => BY_ID.get(id) ?? STAGE_SETS[0];

/** Timings derived from the very same geometry used by the stage and renderer. */
export function setTimeline(set: StageSet, style: SkateStyle | undefined, landed = true) {
  const terrain = setInfo(set).terrain;
  return terrain ? stairTimeline(style, landed, terrain) : null;
}

/**
 * The side rail a grind takes: the one at the edge of the stairs that its
 * approach puts on the rider's far side. Every attempt goes down the stairs,
 * so a fakie approach is turned round whole and its sides swap.
 */
export function sideRailFor(spec: GrindSpec, mechanics: RiderMechanics): 'left' | 'right' {
  const far = approachFar(spec, mechanics) * spec.dir;
  return far === 1 ? 'right' : 'left';
}

/** The handrail a trick rides at a set, or null where it isn't a grind or the set has no handrails. */
export function railLineFor(set: StageSet, trick: Pick<Trick, 'base' | 'stance'>, riderStance: RiderStance, choice: RailChoice): RailLine | null {
  const spec = grindSpecFor(trick);
  if (!spec || !setInfo(set).rails) return null;
  return choice === 'side' && setInfo(set).rails?.sideGrinds !== false ? sideRailFor(spec, resolveRiderMechanics(riderStance, trick.stance)) : 'center';
}
