/**
 * Authored grind/slide lock poses, contact geometry, and name parsing.
 * Playback timing and rider motion live in grind.ts and grindRig.ts.
 */
import type { Stance, Trick } from '../types';
import { GROUND } from '../TrickAnimation';
import { HANGER_BOTTOM, WHEEL_X, deckBottomY } from './board';
import { rotZ, type V3 } from './math';
import { entryTrickFor, splitGrindBase, type EntryTrick } from './grindEntry';

export type GrindSide = 'frontside' | 'backside';

// ----- The bar -----

/** World z of the bar's centerline. */
export const BAR_Z = 0;
/** Height of the bar's top above the asphalt. */
export const BAR_TOP = 30;
/** Half the bar's square section. */
export const BAR_HALF = 3.2;
/** World y of the bar's top surface. */
export const BAR_TOP_Y = GROUND - BAR_TOP;
/** Where the kick's underside sits on the bar in a nose- or tailslide. */
const SLIDE_X = 39;
/** Rake of the kick's underside there: tipping the board this far lays the kick flat on the bar. */
const KICK_DEG = (Math.atan2(deckBottomY(SLIDE_X - 3) - deckBottomY(SLIDE_X + 3), 6) * 180) / Math.PI;
/**
 * A blunt: how steeply it stands the board up (degrees), and where along the
 * kick the deck rests on the bar's near edge. The bar sits in the pocket
 * between that kick and its truck, whose wheels hang past the far side.
 */
const BLUNT_DEG = 35;
const BLUNT_EDGE = 35;
/** Half the length of a truck hanger's bearing line, and of the deck around a slide's contact. */
const HANGER_HALF = 5.1;
const DECK_REACH = 8;

// ----- Catalog -----

type Contact = 'trucks' | 'tail truck' | 'nose truck' | 'middle' | 'nose' | 'tail' | 'tail blunt' | 'nose blunt';

interface GrindDef {
  contact: Contact;
  /** Lock pose, degrees: nose toward the bar's far side, nose down, far edge down. */
  yaw: number;
  pitch: number;
  roll: number;
  /** Board-local x of the nose-side and tail-side feet while locked. */
  feet: readonly [number, number];
  /** Side assumed when the name doesn't give one. */
  side: GrindSide;
}

/**
 * Lock poses. "Far side" is the side of the bar away from the approach.
 * Smith and feeble ride the back truck with the front of the board dipped
 * on the near and far side; willy is the same off the front truck. Crooked
 * cocks the nose over the bar, pinched: nose pressed down and the board
 * tipped onto its near edge. Overcrook swings the board over it instead.
 * A blunt swings the other end over and stands the board up past a slide:
 * the bluntslide's tail rests on the bar's near edge with the back wheels
 * hooked down past its far side and the nose up over it; the noseblunt is
 * the same off the nose, tail up.
 */
const GRINDS: Record<string, GrindDef> = {
  '50-50 Grind': { contact: 'trucks', yaw: 0, pitch: 0, roll: 0, feet: [22, -24], side: 'frontside' },
  '5-0 Grind': { contact: 'tail truck', yaw: 0, pitch: -11, roll: 0, feet: [14, -31], side: 'backside' },
  Nosegrind: { contact: 'nose truck', yaw: 0, pitch: 11, roll: 0, feet: [31, -14], side: 'frontside' },
  'Crooked Grind': { contact: 'nose truck', yaw: 30, pitch: 16, roll: -24, feet: [34, -12], side: 'backside' },
  'Overcrooked Grind': { contact: 'nose truck', yaw: -18, pitch: 8, roll: 12, feet: [32, -12], side: 'frontside' },
  'Smith Grind': { contact: 'tail truck', yaw: -24, pitch: 22, roll: -8, feet: [16, -29], side: 'backside' },
  'Feeble Grind': { contact: 'tail truck', yaw: 24, pitch: 22, roll: 8, feet: [16, -29], side: 'frontside' },
  'Salad Grind': { contact: 'tail truck', yaw: -15, pitch: -8, roll: 0, feet: [14, -30], side: 'backside' },
  'Suski Grind': { contact: 'tail truck', yaw: 15, pitch: -8, roll: 0, feet: [14, -30], side: 'frontside' },
  'Willy Grind': { contact: 'nose truck', yaw: 24, pitch: -22, roll: -8, feet: [29, -16], side: 'backside' },
  Boardslide: { contact: 'middle', yaw: 90, pitch: 0, roll: 0, feet: [22, -22], side: 'backside' },
  Lipslide: { contact: 'middle', yaw: -90, pitch: 0, roll: 0, feet: [22, -22], side: 'frontside' },
  // The kick lies flat on the bar and the rest of the board angles up off it.
  Noseslide: { contact: 'nose', yaw: 90, pitch: KICK_DEG, roll: 0, feet: [32, -12], side: 'backside' },
  Tailslide: { contact: 'tail', yaw: -90, pitch: -KICK_DEG, roll: 0, feet: [12, -32], side: 'frontside' },
  Bluntslide: { contact: 'tail blunt', yaw: 90, pitch: -BLUNT_DEG, roll: 0, feet: [20, -34], side: 'backside' },
  'Noseblunt Slide': { contact: 'nose blunt', yaw: -90, pitch: BLUNT_DEG, roll: 0, feet: [34, -20], side: 'backside' },
};

/** Every grind and slide TrickScene can put on the bar, in rough order of difficulty. */
export const GRIND_BASES: readonly string[] = Object.keys(GRINDS);

/**
 * What bears on the bar: a point that sits over its centerline, and the
 * board-local lines around it (truck hangers, the deck's underside) whose
 * lowest point over the bar rests on its top.
 */
export interface Bearing {
  at: V3;
  lines: V3[][];
}

const hanger = (x: number): V3[] => [{ x, y: HANGER_BOTTOM, z: -HANGER_HALF }, { x, y: HANGER_BOTTOM, z: HANGER_HALF }];
const underside = (cx: number): V3[] => {
  const pts: V3[] = [];
  for (let x = cx - DECK_REACH; x <= cx + DECK_REACH; x += 1) pts.push({ x, y: deckBottomY(x), z: 0 });
  return pts;
};

/**
 * The underside over the bar's centerline when the deck at board-local
 * `edge` rests on the bar's near edge, pitched `deg`: BAR_HALF on toward
 * the middle, measured level.
 */
function overBar(edge: number, deg: number): V3 {
  const level = (x: number) => rotZ({ x, y: deckBottomY(x), z: 0 }, deg).x;
  let x = edge;
  while (Math.abs(level(x) - level(edge)) < BAR_HALF) x -= Math.sign(edge) * 0.01;
  return { x, y: deckBottomY(x), z: 0 };
}
const TAIL_BLUNT = overBar(-BLUNT_EDGE, -BLUNT_DEG);
const NOSE_BLUNT = overBar(BLUNT_EDGE, BLUNT_DEG);

const BEARINGS: Record<Contact, Bearing> = {
  trucks: { at: { x: 0, y: HANGER_BOTTOM, z: 0 }, lines: [hanger(-WHEEL_X), hanger(WHEEL_X)] },
  'tail truck': { at: { x: -WHEEL_X, y: HANGER_BOTTOM, z: 0 }, lines: [hanger(-WHEEL_X)] },
  'nose truck': { at: { x: WHEEL_X, y: HANGER_BOTTOM, z: 0 }, lines: [hanger(WHEEL_X)] },
  middle: { at: { x: 0, y: deckBottomY(0), z: 0 }, lines: [underside(0)] },
  nose: { at: { x: SLIDE_X, y: deckBottomY(SLIDE_X), z: 0 }, lines: [underside(SLIDE_X)] },
  tail: { at: { x: -SLIDE_X, y: deckBottomY(-SLIDE_X), z: 0 }, lines: [underside(-SLIDE_X)] },
  'tail blunt': { at: TAIL_BLUNT, lines: [underside(TAIL_BLUNT.x)] },
  'nose blunt': { at: NOSE_BLUNT, lines: [underside(NOSE_BLUNT.x)] },
};

/**
 * What a slide levers off popping out: the edge of the bar on the side the
 * pop pushes down, so the rest of the deck rises clear of it.
 */
const slidePivot = (x: number): V3 => ({ x, y: deckBottomY(x), z: 0 });
const SLIDE_PIVOTS: Partial<Record<Contact, V3>> = {
  middle: slidePivot(-BAR_HALF),
  nose: slidePivot(SLIDE_X + BAR_HALF),
  tail: slidePivot(-SLIDE_X - BAR_HALF),
  'tail blunt': slidePivot(-BLUNT_EDGE),
  'nose blunt': slidePivot(BLUNT_EDGE),
};

export interface GrindSpec {
  /** Catalog name without the side, e.g. '50-50 Grind'. */
  base: string;
  side: GrindSide;
  stance: Stance;
  /** Travel direction: fakie rides backwards (-1). */
  dir: 1 | -1;
  slide: boolean;
  /** The part of the board that rides the top of the bar. */
  contact: Bearing;
  /** Board-local point the pop out pivots on (on the bar). */
  pivot: V3;
  yaw: number;
  pitch: number;
  roll: number;
  feet: readonly [number, number];
  /** Is the bar on the rider's toeside on the way in? */
  toesideApproach: boolean;
  /** The entry trick spins the rider round to face the other way (a 180 or a bigspin). */
  reversed: boolean;
  /** Pops onto the bar off the nose (nollie). */
  popNose: boolean;
  /** Pops off the end off the nose. */
  exitNose: boolean;
  /** The flatground trick popped into the grind, if any. */
  entry: EntryTrick | null;
}

/**
 * The grind a trick names, or null for anything else. The base may lead
 * with its side ("Frontside ", "Backside ", "FS ", "BS "); without one it
 * takes the side most often skated. It may also lead with a flatground trick
 * to pop into it ("Kickflip into Frontside Lipslide"); one that can't be
 * popped into a grind (see canEnterGrind) makes the whole name no grind.
 */
export function grindSpecFor(trick: Pick<Trick, 'base' | 'stance'>): GrindSpec | null {
  const { entry: entryBase, grind } = splitGrindBase(trick.base);
  const entry = entryBase == null ? null : entryTrickFor(entryBase, trick.stance);
  if (entryBase != null && !entry) return null;
  let name = grind.trim();
  let side: GrindSide | null = null;
  const lead = /^(frontside|fs|backside|bs)\s+/i.exec(name);
  if (lead) {
    side = /^f/i.test(lead[1]) ? 'frontside' : 'backside';
    name = name.slice(lead[0].length);
  }
  const def = GRINDS[name];
  if (!def) return null;
  side ??= def.side;
  const reversed = entry?.reverses ?? false;
  const exitNose = def.contact === 'nose truck' || def.contact === 'nose' || def.contact === 'nose blunt';
  const slide = def.contact !== 'trucks' && !def.contact.endsWith(' truck');
  return {
    base: name,
    side,
    stance: trick.stance,
    dir: trick.stance === 'fakie' ? -1 : 1,
    slide,
    contact: BEARINGS[def.contact],
    pivot: SLIDE_PIVOTS[def.contact]
      ?? BEARINGS[def.contact === 'trucks' ? (exitNose ? 'nose truck' : 'tail truck') : def.contact].at,
    yaw: def.yaw,
    pitch: def.pitch,
    roll: def.roll,
    feet: def.feet,
    // Grinds and slides are named for the side of the body facing the bar
    // on the way in. A frontside boardslide swings the nose over the bar and
    // turns the body backside; a frontside lipslide swings the tail over and
    // turns it frontside. Bluntslides turn like noseslides, noseblunts like
    // tailslides. After a 180 the side is the one the rider rides it on, so
    // they rolled in with the bar on the other side.
    toesideApproach: (side === 'frontside') !== reversed,
    reversed,
    popNose: trick.stance === 'nollie',
    exitNose,
    entry,
  };
}
