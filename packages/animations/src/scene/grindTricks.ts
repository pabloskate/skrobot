import type { SkateStyle, Stance } from '../types';
import { flickExtension, orientTrickRotation, type RiderMechanics } from '../stanceMechanics';
import { FLIP_T, ROLL_IN, catchFraction, computeFrame, specFor, type Frame, type Spec } from '../TrickAnimation';
import { smoothstep } from './math';

/**
 * A flatground trick popped into or out of a grind ("Kickflip into Frontside
 * Lipslide", "Backside 5-0 Grind Kickflip Out").
 *
 * The grind owns the whole attempt: the roll-in, the hop onto the bar, the
 * lock, the pop off. A trick is a layer on top of one of the hops — onto the
 * bar or off the end — and owns nothing else. It borrows the shared
 * flatground physics for the rotation (computeFrame, so the flip, shuv, spin,
 * and catch clocks match flatground and follow the robot's rotation speed),
 * plays it over a window of the hop, and hands back:
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
 * A trick out pops off one end of the board, the rider's tail or (named
 * "Nollie") their nose, and which ends are free to pop depends on the grind
 * (see exitEndsFor in grindDefinitions.ts).
 *
 * Only tricks that keep the board's long axis level qualify: dolphin flips
 * and impossibles pitch it end over end.
 */

/** How the deck has turned under the feet (deg): flipped about its long axis, shuved about its vertical. */
export interface TrickSpin {
  flip: number;
  yaw: number;
}

export const NO_SPIN: TrickSpin = { flip: 0, yaw: 0 };

/** A flatground trick played over a hop onto or off the bar. */
export interface HopTrick {
  /** The flatground trick's name, e.g. 'Kickflip'. */
  base: string;
  /** Its flatground physics spec. */
  spec: Spec;
  /** Extra rise (world units) the hop needs: flips and spins want hang time. */
  lift: number;
  /** How high the feet ride over the deck (world units) while it turns under them. */
  feetLift: number;
  /** The rider lands facing the other way: a 180 or a bigspin. */
  reverses: boolean;
}

/**
 * The flatground trick a hop can carry, or null if it can't. `stance` sets
 * the end it pops off: 'nollie' pops the nose, anything else the tail.
 */
export function hopTrickFor(base: string, stance: Stance): HopTrick | null {
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
export const canEnterGrind = (base: string) => hopTrickFor(base, 'regular') !== null;

/** Can this flatground trick be popped out of a grind? The same tricks as into one; the grind decides which end. */
export const canExitGrind = canEnterGrind;

/**
 * The rider popping a trick off one end of the board: the same feet and
 * footing as on the bar, with the pop moved to that end and the flick to the
 * other foot (a nollie flip pops with the front foot and flicks with the back).
 */
export function poppingOff(mechanics: RiderMechanics, nose: boolean): RiderMechanics {
  return {
    ...mechanics,
    popFoot: nose ? mechanics.noseFoot : mechanics.tailFoot,
    flickFoot: nose ? mechanics.tailFoot : mechanics.noseFoot,
  };
}

/** A trick as one hop plays it: the rider popping it, and the robot's style. */
export interface HopPlan {
  trick: HopTrick;
  mechanics: RiderMechanics;
  style: SkateStyle;
}

/** Latest share of the hop the trick may be caught at: the board has the rest to settle. */
const CATCH_BY = 0.85;

/**
 * Flatground seconds per second of the hop. The trick plays at flatground
 * speed from the pop, so the flick, the flip and the catch look as they do on
 * flatground; only a hop too short to catch it by CATCH_BY speeds it up.
 */
export const hopRate = (hop: HopPlan, hopT: number) =>
  Math.max(1, (catchFraction(hop.style) * FLIP_T) / (CATCH_BY * hopT));

/** The flatground clock `tau` seconds after the pop, held at touchdown once the trick is done. */
export const hopClock = (tau: number, rate: number) => ROLL_IN + Math.min(FLIP_T, Math.max(0, tau) * rate);

export interface HopFrame {
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

/** The trick at flatground clock `t` (see hopClock); touchdown holds the finished rotation. */
export function hopFrame(hop: HopPlan, t: number): HopFrame {
  const f = computeFrame(t, hop.trick.spec, true, 'slam', 0.65, hop.style);
  const turned = orientTrickRotation(hop.mechanics, f.spin3d);
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
    offDeck: hop.trick.feetLift > 0 ? smoothstep(rotation / 0.3) * (1 - smoothstep((rotation - 0.62) / 0.38)) : 0,
    // Flatground snaps the foot out with the pop; the hop is over in half the
    // time and the legs are already folded around it, so the flick eases out
    // over the first quarter of the spin instead.
    flickOut: hop.trick.spec.flipDir ? flickExtension(rotation) * smoothstep(rotation / 0.25) : 0,
  };
}

/** Where the deck rests once the trick is done. */
export const settledSpin = (hop: HopPlan): TrickSpin => hopFrame(hop, ROLL_IN + FLIP_T).spin;

/** How far round the rider ends up (deg, signed): 0, ±180, or ±360. */
export const settledHeading = (hop: HopPlan): number => hopFrame(hop, ROLL_IN + FLIP_T).heading;

/** Seconds after the pop the trick is half way round, for scrubbers and contact sheets. */
export const hopMid = (hop: HopPlan, rate: number) => (0.5 * catchFraction(hop.style) * FLIP_T) / rate;

/**
 * The deck turned by `first`, then by `then`, both about the rider's axes.
 * `first` must be settled (whole flips and a half or whole shuv) so the sum is
 * still a flip and a shuv. A half shuv points the deck's long axis the other
 * way, so a flip after it rolls the other way about the deck's own axis.
 */
export function thenSpin(first: TrickSpin, then: TrickSpin): TrickSpin {
  const reversed = Math.abs(Math.round(first.yaw / 180)) % 2 === 1;
  return { flip: first.flip + (reversed ? -then.flip : then.flip), yaw: first.yaw + then.yaw };
}

/** A settled spin with whole turns taken out, for the deck at rest. */
export const wrapSpin = (spin: TrickSpin): TrickSpin => ({ flip: wrapTurns(spin.flip), yaw: wrapTurns(spin.yaw) });
