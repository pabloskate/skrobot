import type { TripodId } from '../camera/camera';
import { approachFar, type Handrail } from '../motion/grind';
import { grindSpecFor, type GrindSpec } from '../motion/grindDefinitions';
import { resolveRiderMechanics, type RiderMechanics } from '../motion/stance';
import { flatTimeline, type AttemptTimeline } from '../motion/trick';
import type { RiderStance, SkateStyle, Stance, Trick } from '../types';
import { stairTimeline } from '../stage/drop';
import { SET_SCALE, stageHandrail, stageTerrain } from './setScale';
import type { Obstacle, PlacedLedge, RailChoice, RailLine, SpotCard, SpotDefinition, SpotLine, SpotObstacle, SpotRails } from './spot';
import { SPOTS, type StageSet } from './spots';
import type { DropTerrain } from './terrain';

/**
 * The sets a trick can be staged at (the explorer calls them spots), and
 * what each one changes about the attempt. Everything that differs from set
 * to set and isn't its scenery is read from here: the stage plans stairs and
 * handrails from it, and the explorer offers tripods where the set has them.
 *
 * Each spot defines itself in its own folder (its `<spot>Spot.ts`, a
 * SpotDefinition: sets/spot.ts), laid out in set units, and sets/spots.ts
 * lists them. What's here is the stage's (setScale.ts): the terrain,
 * handrails, ledges and lines across the set are scaled as they're
 * registered. Each set's scenery is built for the renderer in
 * three/setPieces.ts.
 */

export type { Obstacle, PlacedLedge, RailChoice, RailLine, SpotCard, SpotLine, SpotProfile, SpotProfileMark } from './spot';
export type { StageSet } from './spots';

/** One way down a set, on the stage. */
export type SetObstacle = SpotObstacle;

/** A set's handrails, on the stage. */
export type SetRails = SpotRails;

export interface SetInfo {
  id: StageSet;
  /** What the spot picker calls it. */
  label: string;
  /** Its name in shared links, where that isn't its id; the id still opens. */
  slug?: string;
  /** Another flight within this location, sharing its spot card and scenery. */
  location?: StageSet;
  /** Name of the flight when a location offers several. */
  lineLabel?: string;
  /**
   * The drop a flatground trick goes down here (stairs, a gap, a bank;
   * stage/drop.ts plans it), travel fixed downhill whatever the
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
  /** Filmers standing still at the set, beside the crane that follows the rider. */
  tripods: readonly TripodId[];
  /** The filmer a player's visit opens on; the bottom one where omitted. */
  opens?: TripodId;
  /** Its card in the players' spot picker; a location without one isn't offered there. */
  card?: SpotCard;
  /** The ways to hit this flight, for the card; the first is where a visit starts. */
  lines?: readonly SpotLine[];
}

const FILMED: readonly TripodId[] = ['bottom', 'side', 'top'];

/** A spot's definition, laid out in set units, as the stage reads it. */
function stageSet(spot: SpotDefinition<StageSet>): SetInfo {
  // One drop named twice (the default, and first among the obstacles) stays one on the stage.
  const staged = new Map<DropTerrain, DropTerrain>();
  const terrain = (laid: DropTerrain): DropTerrain => {
    if (!staged.has(laid)) staged.set(laid, stageTerrain(laid));
    return staged.get(laid)!;
  };
  const ledge = ({ handrail, x, z, yaw }: PlacedLedge): PlacedLedge => ({ handrail: stageHandrail(handrail), x: x * SET_SCALE, z: z * SET_SCALE, yaw });
  const { rails, ledges, obstacles, filmers, location, ...rest } = spot;
  return {
    ...rest,
    ...(location !== undefined && { location: location as StageSet }),
    terrain: spot.terrain && terrain(spot.terrain),
    ...(obstacles && { obstacles: obstacles.map((o) => ({ ...o, terrain: terrain(o.terrain) })) }),
    rails: rails ? {
      ...rails,
      handrail: stageHandrail(rails.handrail),
      z: { center: rails.z.center * SET_SCALE, left: rails.z.left * SET_SCALE, right: rails.z.right * SET_SCALE },
    } : null,
    ...(ledges && { ledges: { left: ledge(ledges.left), right: ledge(ledges.right) } }),
    tripods: filmers ? FILMED : [],
  };
}

export const STAGE_SETS: readonly SetInfo[] = SPOTS.map(stageSet);

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
