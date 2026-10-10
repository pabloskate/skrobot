import type { TripodId } from '../camera/camera';
import { approachFar, type Handrail } from '../motion/grind';
import { grindSpecFor, type GrindSpec } from '../motion/grindDefinitions';
import { resolveRiderMechanics, type RiderMechanics } from '../motion/stance';
import type { RiderStance, SkateStyle, Trick } from '../types';
import { CENTER_Z, FAR_RAIL_Z, HILL_RAIL_Z } from './elToro/elToroLayout';
import { EL_TORO_RAIL, EL_TORO_TERRAIN, FOOT, stairTimeline, type DropTerrain } from './elToro/stairs';
import { HOLLYWOOD_DROP, HOLLYWOOD_FENCE_TERRAIN, HOLLYWOOD_RUN, HOLLYWOOD_LANE_Z, HOLLYWOOD_RAIL, HOLLYWOOD_CENTER_Z, HOLLYWOOD_LEFT_RAIL_Z, HOLLYWOOD_RIGHT_RAIL_Z, hollywoodGround } from './hollywood/hollywoodLayout';
import { WALLENBERG_DROP, WALLENBERG_DROP_IN, WALLENBERG_RUN, WALLENBERG_LANE_Z, wallenbergGround, wallenbergSurface } from './wallenberg/wallenbergLayout';
import { SUNSET_DROP, SUNSET_LAND_X, SUNSET_LANE_Z, SUNSET_POP_X, SUNSET_POP_Z, sunsetGround, sunsetSlope, sunsetSurface } from './sunset/sunsetLayout';
import { LYON_TERRAIN } from './lyon/lyonLayout';
import { LEAP_OF_FAITH_TERRAIN } from './leapOfFaith/leapOfFaithLayout';
import { MIAMI_BANK_TERRAIN, MIAMI_GAP_TERRAIN, MIAMI_LEDGES } from './miami/miamiLayout';

/**
 * The sets a trick can be staged at (the explorer calls them spots), and
 * what each one changes about the attempt. Everything that differs from set
 * to set and isn't its scenery is read from here: the stage plans stairs and
 * handrails from it, the renderer and the video recorder paint a far
 * panorama only where there is one, and the explorer offers tripods where
 * the set has them. Each set's scenery is its own folder under sets/, built
 * for the renderer in three/renderer.ts.
 */

export type StageSet = 'plaza' | 'waterfront' | 'el-toro' | 'hollywood-high' | 'wallenberg' | 'sunset-car-wash' | 'lyon-25' | 'leap-of-faith' | 'miami-triangle';

/**
 * Which handrail a grind rides where a set has several: the center one, or
 * a side one. The side isn't picked: it's the one the grind's approach puts
 * on the rider's far side, coming in from the stairs (a regular rider's
 * frontside grinds and slides take the right rail going down, backside ones
 * the left).
 */
export type RailChoice = 'center' | 'side';

/** One of a set's handrails, by where it stands looking down the stairs. */
export type RailLine = 'center' | 'left' | 'right';

/**
 * What a gap trick goes over where a spot has more than one way down: its
 * stairs (the spot's main line, whatever it is: Miami's is the gap onto the
 * granite triangle), or (Hollywood) the picket fence beside them, onto the
 * sidewalk, or (Miami) clear over the whole triangle to the plaza.
 */
export type Obstacle = 'stairs' | 'fence' | 'triangle';

export interface SetObstacle {
  id: Obstacle;
  /** What the obstacle picker calls it, and what it says the line is. */
  label: string;
  hint: string;
  terrain: DropTerrain;
}

export interface SetRails {
  /** Side rails can be scenery only when a real wall or fence leaves no board clearance. */
  sideGrinds?: boolean;
  /** Every handrail here as a grind sees it: the same pipe over the same steps. */
  handrail: Handrail;
  /** Where each stands across the set (z, toward the camera; looking down the stairs, left is −z). */
  z: Readonly<Record<RailLine, number>>;
}

/**
 * A ledge to grind that isn't one of a stair set's handrails (Miami's slab
 * edges): its own line, running from (`x`, `z`) in the set at `yaw` degrees
 * off +x toward +z, ridden as `handrail` is in that line's own frame.
 */
export interface PlacedLedge {
  handrail: Handrail;
  x: number;
  z: number;
  yaw: number;
}

export interface SetInfo {
  id: StageSet;
  /** What the spot picker calls it. */
  label: string;
  /**
   * The drop a flatground trick goes down here (stairs, a gap, a bank;
   * sets/elToro/stairs.ts plans it), travel fixed downhill whatever the
   * stance; the default one where `obstacles` offers a choice; null on a
   * flat spot.
   */
  terrain: DropTerrain | null;
  /** Where a gap trick can go here when there's a choice, the stairs (`terrain`) first; omitted where there's one way down. */
  obstacles?: readonly SetObstacle[];
  /** Whether this spot has a rail or bar to grind. */
  grinds: boolean;
  /** Where the spot is and what's there, for the spot picker. */
  description?: string;
  /** The handrails grinds ride down here; null where they ride the flat bar (or `ledges`). */
  rails: SetRails | null;
  /**
   * Ledges either side instead, each at its own angle (Miami's slab edges,
   * looking down the line): the grind takes the one with the ledge's top on
   * the far side of its approach. No choice of center or side.
   */
  ledges?: Readonly<Record<'left' | 'right', PlacedLedge>>;
  /** Its far panorama is SVG painted under the canvas, so the canvas leaves the sky see-through. */
  farPanorama: boolean;
  /** Filmers standing still at the set, beside the crane that follows the rider. */
  tripods: readonly TripodId[];
}

const HOLLYWOOD_STAIRS: DropTerrain = { drop: HOLLYWOOD_DROP, run: HOLLYWOOD_RUN, landPast: 4 * FOOT, laneZ: HOLLYWOOD_LANE_Z, ground: hollywoodGround };

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
    description: 'Hollywood High, Los Angeles · 16 stairs, the iconic center handrail, and the fence beside them.',
    terrain: HOLLYWOOD_STAIRS,
    obstacles: [
      { id: 'stairs', label: 'Stairs', hint: 'down the stairs', terrain: HOLLYWOOD_STAIRS },
      { id: 'fence', label: 'Fence', hint: 'over the rail and fence, coming in at an angle', terrain: HOLLYWOOD_FENCE_TERRAIN },
    ],
    rails: { handrail: HOLLYWOOD_RAIL, sideGrinds: false, z: { center: HOLLYWOOD_CENTER_Z, left: HOLLYWOOD_LEFT_RAIL_Z, right: HOLLYWOOD_RIGHT_RAIL_Z } },
    farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'wallenberg', label: 'Wallenberg', grinds: false,
    description: 'San Francisco · Down the roll-in, then four blocks: 51 inches down and 198 inches across.',
    terrain: {
      drop: WALLENBERG_DROP, run: WALLENBERG_RUN, landPast: 3 * FOOT, laneZ: WALLENBERG_LANE_Z,
      ground: wallenbergGround, surface: wallenbergSurface, dropIn: WALLENBERG_DROP_IN,
    },
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
  {
    id: 'lyon-25', label: 'Lyon 25', grinds: false,
    description: 'Cité internationale, Lyon · 25 stairs, 14.76 feet down and 21.29 feet across, beside the terracotta buildings.',
    terrain: LYON_TERRAIN,
    rails: null, farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'leap-of-faith', label: 'Leap of Faith', grinds: false,
    description: 'Point Loma High School, San Diego · Over the walkway guardrail into the courtyard, a 14.3-foot drop in the classic Jamie Thomas setting.',
    terrain: LEAP_OF_FAITH_TERRAIN,
    rails: null, farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'miami-triangle', label: 'Miami Triangle', grinds: true,
    description: 'Bayfront Park, Miami · Off the tip of the Challenger Memorial terrace onto the tilted granite triangle, over it to the plaza, or down one of its edges.',
    terrain: MIAMI_BANK_TERRAIN,
    obstacles: [
      { id: 'stairs', label: 'Bank', hint: 'off the terrace tip onto the granite triangle, then down it', terrain: MIAMI_BANK_TERRAIN },
      { id: 'triangle', label: 'Over', hint: 'over the whole triangle to the plaza', terrain: MIAMI_GAP_TERRAIN },
    ],
    rails: null, ledges: MIAMI_LEDGES, farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
];

const BY_ID = new Map(STAGE_SETS.map((set) => [set.id, set]));

/** What a set changes about the attempt; the plaza for anything unknown. */
export const setInfo = (id: StageSet): SetInfo => BY_ID.get(id) ?? STAGE_SETS[0];

/** Whether a spot offers `obstacle` to go over. */
export const hasObstacle = (set: StageSet, obstacle: Obstacle) => setInfo(set).obstacles?.some((o) => o.id === obstacle) ?? false;

/** The drop a gap trick takes at a set: the chosen obstacle where the set has it, else its stairs; null on a flat spot. */
export function setTerrain(set: StageSet, obstacle: Obstacle = 'stairs'): DropTerrain | null {
  const info = setInfo(set);
  return info.obstacles?.find((o) => o.id === obstacle)?.terrain ?? info.terrain;
}

/** Timings derived from the very same geometry used by the stage and renderer. */
export function setTimeline(set: StageSet, style: SkateStyle | undefined, landed = true, obstacle: Obstacle = 'stairs') {
  const terrain = setTerrain(set, obstacle);
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

/**
 * The ledge a grind takes where a set has one either side (Miami's slab):
 * the one whose top is on the far side of its approach. Coming in from
 * outside a ledge, that's the opposite of a side rail at the stairs' edge.
 */
export function ledgeFor(spec: GrindSpec, mechanics: RiderMechanics): 'left' | 'right' {
  return sideRailFor(spec, mechanics) === 'right' ? 'left' : 'right';
}

/** The grind a trick names as it's ridden at a set: onto a ledge (Miami's), blunts stand up less. */
export const setGrindSpec = (set: StageSet, trick: Pick<Trick, 'base' | 'stance'>): GrindSpec | null =>
  grindSpecFor(trick, { ledge: setInfo(set).ledges != null });

/** The handrail a trick rides at a set, or null where it isn't a grind or the set has no handrails. */
export function railLineFor(set: StageSet, trick: Pick<Trick, 'base' | 'stance'>, riderStance: RiderStance, choice: RailChoice): RailLine | null {
  const spec = setGrindSpec(set, trick);
  const { rails, ledges } = setInfo(set);
  if (!spec || !(rails || ledges)) return null;
  const mechanics = resolveRiderMechanics(riderStance, trick.stance);
  if (ledges) return ledgeFor(spec, mechanics);
  return choice === 'side' && rails?.sideGrinds !== false ? sideRailFor(spec, mechanics) : 'center';
}

/** What a trick grinds at a set: the handrail or ledge it rides (in its own frame), or null on a flat bar or for a flatground trick. */
export function setHandrail(set: StageSet, trick: Pick<Trick, 'base' | 'stance'>, riderStance: RiderStance, choice: RailChoice): Handrail | null {
  const line = railLineFor(set, trick, riderStance, choice);
  const { rails, ledges } = setInfo(set);
  if (!line) return null;
  if (ledges) return ledges[line === 'left' ? 'left' : 'right'].handrail;
  return line === 'center' ? rails!.handrail : { ...rails!.handrail, edge: true };
}
