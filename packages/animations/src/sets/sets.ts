import type { TripodId } from '../camera/camera';
import { approachFar, type Handrail } from '../motion/grind';
import { grindSpecFor, type GrindSpec } from '../motion/grindDefinitions';
import { resolveRiderMechanics, type RiderMechanics } from '../motion/stance';
import type { RiderStance, Trick } from '../types';
import { CENTER_Z, FAR_RAIL_Z, HILL_RAIL_Z } from './elToro/elToroLayout';
import { EL_TORO_RAIL } from './elToro/stairs';

/**
 * The sets a trick can be staged at (the explorer calls them spots), and
 * what each one changes about the attempt. Everything that differs from set
 * to set and isn't its scenery is read from here: the stage plans stairs and
 * handrails from it, the renderer and the video recorder paint a far
 * panorama only where there is one, and the explorer offers tripods where
 * the set has them. Each set's scenery is its own folder under sets/, built
 * for the renderer in three/renderer.ts.
 */

export type StageSet = 'plaza' | 'waterfront' | 'el-toro';

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
   * A stair set: flatground tricks go down it (sets/elToro/stairs.ts), and
   * travel is fixed downhill whatever the stance.
   */
  stairs: boolean;
  /** The handrails grinds ride down here; null where they ride the flat bar. */
  rails: SetRails | null;
  /** Its far panorama is SVG painted under the canvas, so the canvas leaves the sky see-through. */
  farPanorama: boolean;
  /** Filmers standing still at the set, beside the crane that follows the rider. */
  tripods: readonly TripodId[];
}

export const STAGE_SETS: readonly SetInfo[] = [
  { id: 'plaza', label: 'Plaza', stairs: false, rails: null, farPanorama: false, tripods: [] },
  { id: 'waterfront', label: 'Waterfront', stairs: false, rails: null, farPanorama: true, tripods: [] },
  {
    id: 'el-toro',
    label: 'El Toro',
    stairs: true,
    rails: { handrail: EL_TORO_RAIL, z: { center: CENTER_Z, left: HILL_RAIL_Z, right: FAR_RAIL_Z } },
    farPanorama: false,
    tripods: ['bottom', 'side', 'top'],
  },
];

const BY_ID = new Map(STAGE_SETS.map((set) => [set.id, set]));

/** What a set changes about the attempt; the plaza for anything unknown. */
export const setInfo = (id: StageSet): SetInfo => BY_ID.get(id) ?? STAGE_SETS[0];

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
  return choice === 'side' ? sideRailFor(spec, resolveRiderMechanics(riderStance, trick.stance)) : 'center';
}
