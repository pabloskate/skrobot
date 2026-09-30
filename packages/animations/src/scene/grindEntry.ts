import type { SkateStyle, Stance } from '../types';
import { flickExtension, orientTrickRotation, type RiderMechanics } from '../stanceMechanics';
import { FLIP_T, ROLL_IN, catchFraction, computeFrame, specFor, type Frame, type Spec } from '../TrickAnimation';
import { smoothstep } from './math';

/**
 * A flatground trick popped into a grind ("Kickflip into Frontside Lipslide",
 * "Backside 180 into Frontside Nosegrind").
 *
 * The grind owns the whole attempt: the roll-in, the hop onto the bar, the
 * lock, the pop off. The entry trick is a layer on top of the hop and owns
 * nothing else. It borrows the shared flatground physics for the rotation
 * (computeFrame, so the flip, shuv, spin, and catch clocks match flatground
 * and follow the robot's rotation speed), plays it over a window of the hop,
 * and hands back:
 *
 * - `heading`: how far the rider has spun (180s, 360s, bigspins). The rider
 *   and the board's attitude turn with it, so it is part of the grind's pose.
 * - `spin`: how far the deck has turned under the feet on top of that (flips,
 *   shuvs, a bigspin's extra half turn). It composes inside the grind's board
 *   pose, about the board's own axes, so it never changes where the lock goes.
 * - `offDeck` and `flickOut`: how far the feet have left the deck and how far
 *   the flicking foot is out over the rail, for the rider's body.
 *
 * The spin ends on a whole number of flips and a half or whole shuv. A deck
 * turned half way round is the same deck, so the lock pose, the bar contact,
 * and the pop off are all solved exactly as for a plain grind.
 *
 * Naming a spin into a grind. Nose and tail are the rider's: the nose is the
 * end under the front foot, whichever way it is travelling. A 180 or a bigspin
 * turns the rider around, so they reach the bar riding fakie, and the grind
 * after "into" is named the way they then ride it: its side is where the bar
 * is at the lock, and its truck or kick is theirs. "Backside 180 into
 * Frontside Nosegrind" rolls in with the bar on the heelside, spins, and
 * grinds the front-foot truck — trailing now, so it sits like a switch 5-0 —
 * with the bar on the toeside. A bigspin's board comes round a full turn, half
 * a turn past the rider, and a deck turned half way round is the same deck:
 * it locks exactly like the 180. A 360 comes back round to the plain grind.
 *
 * Only tricks that keep the board's long axis level qualify: dolphin flips
 * and impossibles pitch it end over end.
 */

/** Joins the entry trick to the grind in a trick's base name. */
export const ENTRY_JOINER = ' into ';

/** "Kickflip" + "Frontside Lipslide" → "Kickflip into Frontside Lipslide". */
export const joinGrindBase = (entry: string, grind: string) => `${entry}${ENTRY_JOINER}${grind}`;

/** The entry trick (if any) and the grind of a trick's base name. */
export function splitGrindBase(base: string): { entry: string | null; grind: string } {
  const at = base.search(/\s+into\s+/i);
  if (at < 0) return { entry: null, grind: base };
  const rest = base.slice(at).replace(/^\s+into\s+/i, '');
  return { entry: base.slice(0, at), grind: rest };
}

/** How the deck has turned under the feet (deg): flipped about its long axis, shuved about its vertical. */
export interface TrickSpin {
  flip: number;
  yaw: number;
}

export const NO_SPIN: TrickSpin = { flip: 0, yaw: 0 };

export interface EntryTrick {
  /** The flatground trick's name, e.g. 'Kickflip'. */
  base: string;
  /** Its flatground physics spec. */
  spec: Spec;
  /** Extra apex (world units) the hop needs: flips and spins want hang time. */
  lift: number;
  /** How high the feet ride over the deck (world units) while it turns under them. */
  feetLift: number;
  /** The rider lands facing the other way: a 180 or a bigspin. */
  reverses: boolean;
}

/** The flatground trick a grind can be popped from, or null if it can't be. */
export function entryTrickFor(base: string, stance: Stance): EntryTrick | null {
  const name = base.trim();
  const spec = specFor({ id: name, name, base: name, stance });
  const turnsBoard = spec.flips > 0 || spec.yaw > 0;
  if (!turnsBoard || spec.bodyYaw % 180 !== 0 || spec.roll !== 0 || spec.forwardFlip) return null;
  // A 180 or 360 carries the board round under planted feet; only a flip or
  // a shuv past the rider's own spin turns it out from under them.
  const underFeet = spec.flips > 0 || spec.yaw !== spec.bodyYaw;
  return {
    base: name,
    spec,
    lift: spec.flips * 36 + (spec.yaw / 180) * 16,
    feetLift: spec.flips > 0 ? 18 : underFeet ? 6 : 0,
    reverses: spec.bodyYaw % 360 === 180,
  };
}

/** Can this flatground trick be popped into a grind? */
export const canEnterGrind = (base: string) => entryTrickFor(base, 'regular') !== null;

/** The entry trick as one attempt plays it: rider, and the robot's style. */
export interface EntryPlan {
  trick: EntryTrick;
  mechanics: RiderMechanics;
  style: SkateStyle;
}

/** Latest share of the hop the trick may be caught at: the board has the rest to settle into the lock. */
const CATCH_BY = 0.85;

/**
 * Flatground seconds per second of the hop. The trick plays at flatground
 * speed from the pop, so the flick, the flip and the catch look as they do on
 * flatground; only a hop too short to catch it by CATCH_BY speeds it up.
 */
export const entryRate = (entry: EntryPlan, upT: number) =>
  Math.max(1, (catchFraction(entry.style) * FLIP_T) / (CATCH_BY * upT));

/** The flatground clock `tau` seconds after the pop, held at touchdown once the trick is done. */
export const entryClock = (tau: number, rate: number) => ROLL_IN + Math.min(FLIP_T, Math.max(0, tau) * rate);

export interface EntryFrame {
  /** The flatground physics at this moment of the trick. */
  flat: Frame;
  /** World yaw (deg) the rider has spun through. */
  heading: number;
  spin: TrickSpin;
  /** 0 → 1 through the flatground trick's rotation. */
  rotation: number;
  /** 0 → 1: how far the feet have come off the deck. */
  offDeck: number;
  /** 0 → 1: how far the flicking foot is out over the rail. */
  flickOut: number;
}

/** An angle with whole turns taken out: 720 → 0, 180 → 180, -540 → -180. */
const wrapTurns = (deg: number) => deg - 360 * Math.trunc(deg / 360) || 0;

/** The trick at flatground clock `t` (see entryClock); touchdown holds the finished rotation. */
export function entryFrame(entry: EntryPlan, t: number): EntryFrame {
  const f = computeFrame(t, entry.trick.spec, true, 'slam', 0.65, entry.style);
  const turned = orientTrickRotation(entry.mechanics, f.spin3d);
  const done = t >= ROLL_IN + FLIP_T;
  const rotation = f.motion.rotation;
  // The rider's spin is the heading; the deck's turn past it is the spin.
  const yaw = turned.yawDeg - turned.bodyYawDeg;
  return {
    flat: f,
    heading: turned.bodyYawDeg,
    spin: {
      flip: done ? wrapTurns(turned.flipDeg) : turned.flipDeg,
      yaw: done ? wrapTurns(yaw) : yaw,
    },
    rotation,
    // Feet leave the deck as the board starts to turn and come back for the catch.
    offDeck: entry.trick.feetLift > 0 ? smoothstep(rotation / 0.3) * (1 - smoothstep((rotation - 0.62) / 0.38)) : 0,
    // Flatground snaps the foot out with the pop; the hop is over in half the
    // time and the legs are already folded around it, so the flick eases out
    // over the first quarter of the spin instead.
    flickOut: entry.trick.spec.flipDir ? flickExtension(rotation) * smoothstep(rotation / 0.25) : 0,
  };
}

/** Where the deck rests once the trick is done, for the rest of the attempt. */
export const settledSpin = (entry: EntryPlan): TrickSpin => entryFrame(entry, ROLL_IN + FLIP_T).spin;

/** How far round the rider ends up (deg, signed): 0, ±180, or ±360. */
export const settledHeading = (entry: EntryPlan): number => entryFrame(entry, ROLL_IN + FLIP_T).heading;

/** Seconds after the pop the trick is half way round, for scrubbers and contact sheets. */
export const entryMid = (entry: EntryPlan, rate: number) => (0.5 * catchFraction(entry.style) * FLIP_T) / rate;
