/**
 * Authored grind/slide lock poses, contact geometry, and name parsing.
 * Playback timing and rider motion live in grind.ts and grindRig.ts; tricks
 * popped into and out of a grind in grindTricks.ts.
 */
import type { Stance, Trick } from '../types';
import { GROUND } from '../TrickAnimation';
import { HANGER_BOTTOM, WHEEL_X, deckBottomY } from './board';
import { rotZ, type V3 } from './math';
import { hopTrickFor, type HopTrick } from './grindTricks';

export type GrindSide = 'frontside' | 'backside';
/** The end of the board a trick out of a grind pops off: the rider's tail, or their nose (a nollie). */
export type PopEnd = 'tail' | 'nose';

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
 * What the board levers off popping out of the grind: the truck it rides
 * (on both trucks, the popped end's), or for a slide the edge of the bar on
 * the side the pop pushes down, so the rest of the deck rises clear of it.
 */
function popPivot(contact: Contact, nose: boolean): V3 {
  const slidePivot = (x: number): V3 => ({ x, y: deckBottomY(x), z: 0 });
  switch (contact) {
    case 'trucks': return BEARINGS[nose ? 'nose truck' : 'tail truck'].at;
    case 'middle': return slidePivot((nose ? 1 : -1) * BAR_HALF);
    case 'nose': return slidePivot(SLIDE_X + BAR_HALF);
    case 'tail': return slidePivot(-SLIDE_X - BAR_HALF);
    case 'tail blunt': return slidePivot(-BLUNT_EDGE);
    case 'nose blunt': return slidePivot(BLUNT_EDGE);
    default: return BEARINGS[contact].at;
  }
}

/**
 * The ends of the board free to pop a trick out of a grind. Weight centered
 * over the bar (both trucks, the middle of the deck) can be thrown onto either
 * end, so a 50-50 or a boardslide can be popped out off the tail or the nose.
 * Riding one end (a truck, a kick, a blunt), only that end is over the bar to
 * snap: a 5-0 or a tailslide pops out off the tail, a nosegrind, a crooked
 * grind, or a noseslide off the nose.
 */
const popEnds = (contact: Contact): readonly PopEnd[] => {
  const x = BEARINGS[contact].at.x;
  return x === 0 ? ['tail', 'nose'] : x < 0 ? ['tail'] : ['nose'];
};

// ----- Names -----

/** Joins the entry trick to the grind in a trick's base name. */
const ENTRY_JOINER = ' into ';
/** Marks the pop end of a trick out, and ends its name. */
const NOLLIE = 'Nollie ';
const OUT = ' Out';

/** "Kickflip" + "Frontside Lipslide" → "Kickflip into Frontside Lipslide". */
export const joinGrindBase = (entry: string, grind: string) => `${entry}${ENTRY_JOINER}${grind}`;

/**
 * "Backside 5-0 Grind" + "Kickflip" off the tail → "Backside 5-0 Grind Kickflip Out";
 * "Crooked Grind" + "Kickflip" off the nose → "Crooked Grind Nollie Kickflip Out".
 */
export const joinGrindExit = (grind: string, exit: string, end: PopEnd) =>
  `${grind} ${end === 'nose' ? NOLLIE : ''}${exit}${OUT}`;

/** Grind names, longest first, so a short name never claims the start of a longer one. */
const NAMES_LONGEST_FIRST = Object.keys(GRINDS).sort((a, b) => b.length - a.length);
const SIDE_LEAD = /^(frontside|fs|backside|bs)\s+/i;

export interface GrindExitName {
  /** The flatground trick, e.g. 'Kickflip'. */
  base: string;
  end: PopEnd;
}

/**
 * A trick's base name in parts: the trick popped into the grind (if any), the
 * grind with its side, and the trick popped out of it (if any). An "Out" that
 * doesn't follow a known grind is left on the grind, which then names none.
 */
export function splitGrindBase(base: string): { entry: string | null; grind: string; exit: GrindExitName | null } {
  const at = base.search(/\s+into\s+/i);
  const entry = at < 0 ? null : base.slice(0, at);
  const grind = at < 0 ? base : base.slice(at).replace(/^\s+into\s+/i, '');
  const out = /\s+out$/i.exec(grind);
  if (!out) return { entry, grind, exit: null };
  const body = grind.slice(0, out.index);
  const lead = SIDE_LEAD.exec(body)?.[0] ?? '';
  const name = NAMES_LONGEST_FIRST.find((n) => body.startsWith(`${n} `, lead.length));
  if (!name) return { entry, grind, exit: null };
  const split = lead.length + name.length;
  const trick = body.slice(split).trim();
  const nollie = trick.toLowerCase().startsWith(NOLLIE.toLowerCase());
  return {
    entry,
    grind: body.slice(0, split),
    exit: { base: nollie ? trick.slice(NOLLIE.length).trim() : trick, end: nollie ? 'nose' : 'tail' },
  };
}

/** The catalog grind a name with or without its side names, if any. */
function grindDef(grind: string): { name: string; def: GrindDef; side: GrindSide | null } | null {
  let name = grind.trim();
  let side: GrindSide | null = null;
  const lead = SIDE_LEAD.exec(name);
  if (lead) {
    side = /^f/i.test(lead[1]) ? 'frontside' : 'backside';
    name = name.slice(lead[0].length);
  }
  const def = GRINDS[name];
  return def ? { name, def, side } : null;
}

/** The ends a trick out of this grind ("5-0 Grind", "Backside Nosegrind") can pop off; none for an unknown name. */
export function exitEndsFor(grind: string): readonly PopEnd[] {
  const found = grindDef(grind);
  return found ? popEnds(found.def.contact) : [];
}

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
  entry: HopTrick | null;
  /** The flatground trick popped out of it off the end, if any; `exitNose` says which end. */
  exit: HopTrick | null;
}

/**
 * The grind a trick names, or null for anything else. The base may lead
 * with its side ("Frontside ", "Backside ", "FS ", "BS "); without one it
 * takes the side most often skated. It may also lead with a flatground trick
 * to pop into it ("Kickflip into Frontside Lipslide") and end with one to pop
 * out of it off the tail or the nose ("Frontside 5-0 Grind Kickflip Out",
 * "Crooked Grind Nollie Kickflip Out"). A trick that can't be popped into or
 * out of a grind (see canEnterGrind), or off an end the grind doesn't ride
 * (see exitEndsFor), makes the whole name no grind.
 */
export function grindSpecFor(trick: Pick<Trick, 'base' | 'stance'>): GrindSpec | null {
  const { entry: entryBase, grind, exit: exitName } = splitGrindBase(trick.base);
  const entry = entryBase == null ? null : hopTrickFor(entryBase, trick.stance);
  if (entryBase != null && !entry) return null;
  const found = grindDef(grind);
  if (!found) return null;
  const { name, def } = found;
  const side = found.side ?? def.side;
  const exit = exitName == null ? null : hopTrickFor(exitName.base, exitName.end === 'nose' ? 'nollie' : 'regular');
  if (exitName != null && (!exit || !popEnds(def.contact).includes(exitName.end))) return null;
  const reversed = entry?.reverses ?? false;
  // Without a trick out, the board pops off the end it rides, or the tail.
  const exitNose = exitName ? exitName.end === 'nose' : popEnds(def.contact)[0] === 'nose';
  const slide = def.contact !== 'trucks' && !def.contact.endsWith(' truck');
  return {
    base: name,
    side,
    stance: trick.stance,
    dir: trick.stance === 'fakie' ? -1 : 1,
    slide,
    contact: BEARINGS[def.contact],
    pivot: popPivot(def.contact, exitNose),
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
    exit,
  };
}
