import type { Handrail } from '../motion/grind';
import type { DropTerrain } from './terrain';
import type { SpotFilmers } from './tripods';

/**
 * One spot, as its own folder describes it: everything about it that isn't
 * its scenery. A spot's `<spot>Spot.ts` exports one of these, laid out in
 * the spot's own set units (setScale.ts), and sets/spots.ts lists them.
 * Every registry is built from that list: what the stage plans from
 * (sets.ts), where the filmers stand (tripods.ts), and the pickers, links
 * and spot cards the explorers show. Its scenery is drawn by its `<spot>3d.ts`,
 * which three/setPieces.ts lists, so three.js stays out of this entry.
 */

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

/** One way down a spot. */
export interface SpotObstacle {
  id: Obstacle;
  /** What the obstacle picker calls it, and what it says the line is. */
  label: string;
  hint: string;
  terrain: DropTerrain;
}

/** A spot's handrails. */
export interface SpotRails {
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

/**
 * One way to hit a spot, in a skater's words, for its card: a gap trick
 * over something, or a grind down a rail. `id` names it among the spot's
 * lines; omitted, it is the obstacle's (a gap), or `rail` / `side-rail`.
 */
export interface SpotLine {
  label: string;
  hit: 'gap' | 'rail';
  /** What a gap trick goes over; the spot's stairs when omitted. */
  obstacle?: Obstacle;
  /** Which handrail a grind goes down; the center one when omitted. */
  rail?: RailChoice;
  id?: string;
}

/** A stroke over a spot's profile: a rail, a building, planting. */
export interface SpotProfileMark {
  d: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  /** Filled in at this opacity as well as stroked. */
  fillOpacity?: number;
}

/**
 * A spot in profile for its card, as SVG path data in a 72 by 40 box: what
 * you drop off and where you land (`ground`, left to right, filled in below
 * it), and whatever stands on it.
 */
export interface SpotProfile {
  ground: string;
  strokeWidth?: number;
  marks?: readonly SpotProfileMark[];
}

/** The ground level most profiles land on. */
export const PROFILE_GROUND = 36;

/** A stair profile's path from (x, top): `count` steps of `run` by `rise` (negative to climb). */
export function stairProfile(x: number, top: number, count: number, run: number, rise: number): string {
  let d = '';
  for (let i = 0; i < count; i++) d += ` H${x + run * (i + 1)} V${top + rise * (i + 1)}`;
  return d;
}

/** A location's card in the players' spot picker. */
export interface SpotCard {
  /** Where in the world it is. */
  where: string;
  /** What's there, in a few words. */
  feature: string;
  profile?: SpotProfile;
}

export interface SpotDefinition<Id extends string = string> {
  id: Id;
  /** What the spot picker calls it. */
  label: string;
  /** Its name in shared links, where that isn't its id; the id still opens. */
  slug?: string;
  /** Another flight within this location (its id), sharing its spot card and scenery. */
  location?: string;
  /** Name of the flight when a location offers several. */
  lineLabel?: string;
  /** Where the spot is and what's there, for the spot picker. */
  description?: string;
  /** Whether this spot has a rail or bar to grind. */
  grinds: boolean;
  /**
   * The drop a flatground trick goes down here (stairs, a gap, a bank;
   * stage/drop.ts plans it), travel fixed downhill whatever the stance; the
   * default one where `obstacles` offers a choice; null on a flat spot.
   */
  terrain: DropTerrain | null;
  /** Where a gap trick can go here when there's a choice, the stairs (`terrain`) first; omitted where there's one way down. */
  obstacles?: readonly SpotObstacle[];
  /** The handrails grinds ride down here; omitted where they ride the flat bar (or `ledges`). */
  rails?: SpotRails;
  /**
   * Ledges either side instead, each at its own angle (Miami's slab edges,
   * looking down the line): the grind takes the one with the ledge's top on
   * the far side of its approach. No choice of center or side.
   */
  ledges?: Readonly<Record<'left' | 'right', PlacedLedge>>;
  /** Where its filmers stand (tripods.ts); omitted, the crane films everything here. */
  filmers?: SpotFilmers;
  /** Its card in the players' spot picker; a location without one isn't offered there. */
  card?: SpotCard;
  /** The ways to hit this flight, for the card; the first is where a visit starts. */
  lines?: readonly SpotLine[];
}

/** A spot's definition, keeping its id as written so the registry's ids are a closed set. */
export const defineSpot = <const Id extends string>(spot: SpotDefinition<Id>): SpotDefinition<Id> => spot;
