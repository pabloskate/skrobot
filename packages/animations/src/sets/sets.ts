import type { TripodId } from '../camera/camera';
import { approachFar, type Handrail } from '../motion/grind';
import { grindSpecFor, type GrindSpec } from '../motion/grindDefinitions';
import { resolveRiderMechanics, type RiderMechanics } from '../motion/stance';
import { flatTimeline, type AttemptTimeline } from '../motion/trick';
import type { RiderStance, SkateStyle, Stance, Trick } from '../types';
import { CENTER_Z, FAR_RAIL_Z, HILL_RAIL_Z } from './elToro/elToroLayout';
import { EL_TORO_RAIL, EL_TORO_TERRAIN, SET_FOOT, stairTimeline, type DropTerrain } from './elToro/stairs';
import { SET_SCALE, stageHandrail, stageTerrain } from './setScale';
import { HOLLYWOOD_DROP, HOLLYWOOD_FENCE_TERRAIN, HOLLYWOOD_RUN, HOLLYWOOD_LANE_Z, HOLLYWOOD_RAIL, HOLLYWOOD_CENTER_Z, HOLLYWOOD_LEFT_RAIL_Z, HOLLYWOOD_RIGHT_RAIL_Z, hollywoodGround } from './hollywood/hollywoodLayout';
import { HOLLYWOOD_12_DROP, HOLLYWOOD_12_RUN, HOLLYWOOD_12_LANE_Z, HOLLYWOOD_12_RAIL, hollywood12Ground, hollywood12Surface } from './hollywood/hollywoodLayout';
import { WALLENBERG_DROP, WALLENBERG_DROP_IN, WALLENBERG_RUN, WALLENBERG_LANE_Z, wallenbergGround, wallenbergSurface } from './wallenberg/wallenbergLayout';
import { SUNSET_DROP, SUNSET_LAND_X, SUNSET_LANE_Z, SUNSET_POP_X, SUNSET_POP_Z, sunsetGround, sunsetSlope, sunsetSurface } from './sunset/sunsetLayout';
import { LYON_TERRAIN } from './lyon/lyonLayout';
import { LEAP_OF_FAITH_TERRAIN } from './leapOfFaith/leapOfFaithLayout';
import { MIAMI_BANK_TERRAIN, MIAMI_GAP_TERRAIN, MIAMI_LEDGES } from './miami/miamiLayout';
import { UC_DAVIS_TERRAIN } from './ucDavis/ucDavisLayout';
import { CARLSBAD_TERRAIN } from './carlsbad/carlsbadLayout';
import { EMAGE_RAIL, EMAGE_RAIL_Z, EMAGE_TERRAIN } from './emage/emageLayout';

/**
 * The sets a trick can be staged at (the explorer calls them spots), and
 * what each one changes about the attempt. Everything that differs from set
 * to set and isn't its scenery is read from here: the stage plans stairs and
 * handrails from it, the renderer and the video recorder paint a far
 * panorama only where there is one, and the explorer offers tripods where
 * the set has them. Each set's scenery is its own folder under sets/, built
 * for the renderer in three/renderer.ts.
 *
 * Each set lays itself out in set units; what's here is the stage's
 * (setScale.ts): the terrain, handrails, ledges and lines across the set
 * are scaled as they're registered.
 */

export type StageSet = 'plaza' | 'waterfront' | 'el-toro' | 'hollywood-high' | 'hollywood-high-12' | 'wallenberg' | 'sunset-car-wash' | 'lyon-25' | 'leap-of-faith' | 'miami-triangle' | 'uc-davis-gap' | 'carlsbad-gap' | 'emage-20';

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
 * triangular bank), or (Hollywood) the picket fence beside them, onto the
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
  /** A spot with just one physical side rail keeps every trick on that line. */
  fixedLine?: 'left' | 'right';
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
  /** Another flight within this location, sharing its spot card and scenery. */
  location?: StageSet;
  /** Name of the flight when a location offers several. */
  lineLabel?: string;
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

const HOLLYWOOD_STAIRS: DropTerrain = stageTerrain({ drop: HOLLYWOOD_DROP, run: HOLLYWOOD_RUN, landPast: 4 * SET_FOOT, laneZ: HOLLYWOOD_LANE_Z, ground: hollywoodGround });

/** A set's handrails, laid out in set units, on the stage. */
const stageRails = (handrail: Handrail, z: Readonly<Record<RailLine, number>>, sideGrinds?: boolean): SetRails => ({
  handrail: stageHandrail(handrail),
  z: { center: z.center * SET_SCALE, left: z.left * SET_SCALE, right: z.right * SET_SCALE },
  ...(sideGrinds != null && { sideGrinds }),
});

/** A set's ledges, laid out in set units, on the stage. */
const stageLedges = (ledges: Readonly<Record<'left' | 'right', PlacedLedge>>): Readonly<Record<'left' | 'right', PlacedLedge>> => {
  const place = ({ handrail, x, z, yaw }: PlacedLedge): PlacedLedge => ({ handrail: stageHandrail(handrail), x: x * SET_SCALE, z: z * SET_SCALE, yaw });
  return { left: place(ledges.left), right: place(ledges.right) };
};

const MIAMI_BANK = stageTerrain(MIAMI_BANK_TERRAIN);

export const STAGE_SETS: readonly SetInfo[] = [
  { id: 'plaza', label: 'Plaza', terrain: null, grinds: true, rails: null, farPanorama: false, tripods: [] },
  { id: 'waterfront', label: 'Waterfront', terrain: null, grinds: true, rails: null, farPanorama: true, tripods: [] },
  {
    id: 'el-toro',
    label: 'El Toro',
    terrain: stageTerrain(EL_TORO_TERRAIN),
    grinds: true,
    rails: stageRails(EL_TORO_RAIL, { center: CENTER_Z, left: HILL_RAIL_Z, right: FAR_RAIL_Z }),
    farPanorama: false,
    tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'hollywood-high', label: 'Hollywood High', lineLabel: '16 stair', grinds: true,
    description: 'Hollywood High, Los Angeles · The 16 and 12 descend opposite ends of one auditorium walkway, with center handrails and the fence beside the 16.',
    terrain: HOLLYWOOD_STAIRS,
    obstacles: [
      { id: 'stairs', label: 'Stairs', hint: 'down the stairs', terrain: HOLLYWOOD_STAIRS },
      { id: 'fence', label: 'Fence', hint: 'over the rail and fence, coming in at an angle', terrain: stageTerrain(HOLLYWOOD_FENCE_TERRAIN) },
    ],
    rails: stageRails(HOLLYWOOD_RAIL, { center: HOLLYWOOD_CENTER_Z, left: HOLLYWOOD_LEFT_RAIL_Z, right: HOLLYWOOD_RIGHT_RAIL_Z }, false),
    farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'hollywood-high-12', label: 'Hollywood 12', location: 'hollywood-high', lineLabel: '12 stair', grinds: true,
    description: 'The steeper north-facing 12, behind the 16 across the shared upper walkway.',
    terrain: stageTerrain({ drop: HOLLYWOOD_12_DROP, run: HOLLYWOOD_12_RUN, landPast: 4 * SET_FOOT, laneZ: HOLLYWOOD_12_LANE_Z, ground: hollywood12Ground, surface: hollywood12Surface }),
    // The street-side cheek has no grindable pipe; the wall rail is scenery.
    rails: stageRails(HOLLYWOOD_12_RAIL, { center: 0, left: -HOLLYWOOD_RIGHT_RAIL_Z, right: -HOLLYWOOD_LEFT_RAIL_Z }, false),
    farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'wallenberg', label: 'Wallenberg', grinds: false,
    description: 'San Francisco · Down the roll-in, then four blocks: 51 inches down and 198 inches across.',
    terrain: stageTerrain({
      drop: WALLENBERG_DROP, run: WALLENBERG_RUN, landPast: 3 * SET_FOOT, laneZ: WALLENBERG_LANE_Z,
      ground: wallenbergGround, surface: wallenbergSurface, dropIn: WALLENBERG_DROP_IN,
    }),
    rails: null, farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'sunset-car-wash', label: 'Roof to Bank', grinds: false,
    description: 'An unbranded roof-to-bank setting. Along the roof, a quarter-turn into the bank, then downhill.',
    terrain: stageTerrain({
      drop: SUNSET_DROP, run: SUNSET_LAND_X, landPast: 0, laneZ: SUNSET_LANE_Z,
      ground: sunsetGround, slope: sunsetSlope, surface: sunsetSurface,
      entry: { x: SUNSET_POP_X, z: SUNSET_POP_Z, yaw: -90 },
    }),
    rails: null, farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'lyon-25', label: '25 Stair', grinds: false,
    description: '25 stairs, 14.76 feet down and 21.29 feet across, in a redesigned courtyard.',
    terrain: stageTerrain(LYON_TERRAIN),
    rails: null, farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'leap-of-faith', label: 'Leap of Faith', grinds: false,
    description: 'Point Loma High School, San Diego · Over the walkway guardrail into the courtyard, a 14.3-foot drop in the classic Jamie Thomas setting.',
    terrain: stageTerrain(LEAP_OF_FAITH_TERRAIN),
    rails: null, farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'miami-triangle', label: 'Triangle Bank', grinds: true,
    description: 'A redesigned park setting. Gap from the raised deck onto a plain triangular bank, clear it to the plaza, or grind an edge.',
    terrain: MIAMI_BANK,
    obstacles: [
      { id: 'stairs', label: 'Bank', hint: 'off the deck onto the triangular bank, then down it', terrain: MIAMI_BANK },
      { id: 'triangle', label: 'Over', hint: 'over the whole triangle to the plaza', terrain: stageTerrain(MIAMI_GAP_TERRAIN) },
    ],
    rails: null, ledges: stageLedges(MIAMI_LEDGES), farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'uc-davis-gap', label: 'UC Davis Gap', grinds: false,
    description: 'Roessler Hall, UC Davis · Over the ivy bank beside the round planter. Estimated 24 ft 4 in across and 10 ft down in the classic filmed layout.',
    terrain: stageTerrain(UC_DAVIS_TERRAIN),
    rails: null, farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'carlsbad-gap', label: 'Carlsbad Gap', grinds: false,
    description: 'Carlsbad High, California · The original grass gap beside the yellow-edged 11 stair, with its curved retaining wall and uphill landing. Dimensions estimated from archival photos.',
    terrain: stageTerrain(CARLSBAD_TERRAIN),
    rails: null, farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
  {
    id: 'emage-20', label: 'Emage 20', grinds: true,
    description: 'Denver, Colorado · The riverside 20 stair inset into ten seating terraces, with its skateable river-side rail and the Platte River Bridge. Dimensions estimated from reference photos.',
    terrain: stageTerrain(EMAGE_TERRAIN),
    rails: { ...stageRails(EMAGE_RAIL, { center: EMAGE_RAIL_Z, left: EMAGE_RAIL_Z, right: EMAGE_RAIL_Z }), fixedLine: 'right' },
    farPanorama: false, tripods: ['bottom', 'side', 'top'],
  },
];

const BY_ID = new Map(STAGE_SETS.map((set) => [set.id, set]));

/** What a set changes about the attempt; the plaza for anything unknown. */
export const setInfo = (id: StageSet): SetInfo => BY_ID.get(id) ?? STAGE_SETS[0];

/** The location a flight belongs to: one spot card for both Hollywood flights. */
export const setLocation = (id: StageSet): SetInfo => setInfo(setInfo(id).location ?? id);

/** All flights of that location, in their picker order. */
export const setFlights = (id: StageSet): readonly SetInfo[] => {
  const location = setLocation(id).id;
  return STAGE_SETS.filter((set) => set.id === location || set.location === location);
};

/** Whether a spot offers `obstacle` to go over. */
export const hasObstacle = (set: StageSet, obstacle: Obstacle) => setInfo(set).obstacles?.some((o) => o.id === obstacle) ?? false;

/** The drop a gap trick takes at a set: the chosen obstacle where the set has it, else its stairs; null on a flat spot. */
export function setTerrain(set: StageSet, obstacle: Obstacle = 'stairs'): DropTerrain | null {
  const info = setInfo(set);
  return info.obstacles?.find((o) => o.id === obstacle)?.terrain ?? info.terrain;
}

/** A trick's moments at a set, from the very same geometry the stage and renderer use: down its drop, or on flat ground. */
export function setTimeline(set: StageSet, style: SkateStyle | undefined, landed = true, obstacle: Obstacle = 'stairs', stance: Stance = 'regular', base?: string): AttemptTimeline {
  const terrain = setTerrain(set, obstacle);
  return terrain ? stairTimeline(style, landed, terrain, stance, base) : flatTimeline(style, landed);
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

/** Whether a grind can approach a fixed side rail from the stairs. */
export function railApproachAllowed(set: StageSet, trick: Pick<Trick, 'base' | 'stance'>, riderStance: RiderStance): boolean {
  const fixedLine = setInfo(set).rails?.fixedLine;
  if (!fixedLine) return true;
  const spec = setGrindSpec(set, trick);
  return !spec || sideRailFor(spec, resolveRiderMechanics(riderStance, trick.stance)) === fixedLine;
}

/** The handrail a trick rides at a set, or null where it isn't a grind or the set has no handrails. */
export function railLineFor(set: StageSet, trick: Pick<Trick, 'base' | 'stance'>, riderStance: RiderStance, choice: RailChoice): RailLine | null {
  const spec = setGrindSpec(set, trick);
  const { rails, ledges } = setInfo(set);
  if (!spec || !(rails || ledges)) return null;
  const mechanics = resolveRiderMechanics(riderStance, trick.stance);
  if (ledges) return ledgeFor(spec, mechanics);
  if (rails?.fixedLine) return rails.fixedLine;
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
