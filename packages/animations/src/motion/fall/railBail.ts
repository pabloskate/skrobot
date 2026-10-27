import { HUMAN_SHIN, HUMAN_THIGH } from '../../riders/human/humanProportions';
import { FOOT, GRAVITY } from '../../units';
import { WHEEL_BOTTOM } from '../../board/board';
import { grindTimeline, handrailHeight, planGrind, railTopY, railTrack, travel, type GrindPlan, type GrindTimeline, type Handrail } from '../grind';
import { BAR_Z, grindSpecFor } from '../grindDefinitions';
import { resolveRiderMechanics } from '../stance';
import { resolveSkateStyle } from '../style';
import type { RiderStance, SkateStyle, Trick } from '../../types';
import { GROUND } from '../trick';
import { ANKLE_HEIGHT } from './body';

/**
 * Bailing off a rail: the grind is on, locked, and part way along it the
 * rider feels it going and jumps off rather than ride it down wrong:
 * forward, on along the rail and off past its end, or out to the side, back
 * toward the open ground they came in from. The legs throw them up and
 * away off the board; the board, shoved the other way by the same push,
 * clatters off the rail on its own; and the rider comes down on their feet
 * and runs or rolls it out, as off a kick-out (kickOut.ts does that part,
 * from the jump, with the rail solid under the board).
 *
 * Here: when along the lock they go, and how hard the legs throw them. The
 * jump is planned off the grind's own path (the board's center, and the
 * hips about a leg over it), the same for every rider, so a timeline knows
 * how long the attempt runs without solving anyone's body.
 */

export type RailBail = 'forward' | 'side';

export const RAIL_BAIL_OPTIONS: ReadonlyArray<{ id: RailBail; label: string }> = [
  { id: 'forward', label: 'Jump forward' },
  { id: 'side', label: 'Jump aside' },
];

/** Seconds the attempt runs on from the jump: the flight, the roll, up, the steps, and a look back at the board. */
export const RAIL_BAIL_T = 2.8;

/**
 * The jump's push, as the speed it gives the hips (world units a second): up, along the way of travel, and out to the
 * side. Forward, the legs drive on along the rail; aside, out and a little back against it. A standing jump's take-off
 * is about 8 feet a second up; off a moving board, braced, rather less.
 */
const JUMP = {
  forward: { up: 6.5 * FOOT, along: 4 * FOOT, out: 0 },
  side: { up: 6.5 * FOOT, along: -1 * FOOT, out: 7.5 * FOOT },
} as const;
/** A forward jump that can't carry past the rail's end before the grind would leave it goes off a little to the side too. */
const FORWARD_OUT = 3 * FOOT;
/** The least time locked before the rider can go (seconds), and as a share of the grind: the lock is seen. */
const LOCKED_LEAST = 0.32;
const LOCKED_SHARE = 0.3;
/** The latest the jump can go, before the grind would pop off (seconds). */
const BEFORE_OFF = 0.1;
/** How finely the jump's moment is looked for (seconds). */
const LOOK_STEP = 1 / 60;
/** A body's legs, for the plan: the bigger rider's (a person's), so the robot comes down with room to spare. */
const LEG = HUMAN_THIGH + HUMAN_SHIN;
/** The hips over the board's center riding the rail, and over the ground as the feet meet it (shares of the leg). */
const HIPS_OVER_DECK = 0.8;
const HIPS_LANDING = 0.9;
/** Down past a rail's end, the hips come down at least this far beyond it (world units): the legs clear its last post. */
const PAST_END = 1.5 * FOOT;
/**
 * Forward past a handrail's end, the hips are this high over its top (in legs) where they pass it, and for this far (in
 * legs) either side: the feet, a leg below them, clear its last post. Coming off near the bottom of a fast grind they
 * would otherwise skim it.
 */
const OVER_END = { high: 1, span: 0.6 } as const;
/** The ground a roll needs from where the feet come down: this far back and on (legs), level to within this much (world units). */
const LEVEL_ROOM = { back: 0.4, ahead: 3.4, rise: 1.5 } as const;

/**
 * Faster than this, all told, coming down (in sqrt(g * leg), the speed a leg's fall from its own length gives), the
 * rider rolls it out on level ground. Off a rail, the feet come down still across the way the body's going, as they
 * stood on the board, with the speed of the ride under them and the drop off the rail on it: there's no stride to
 * take it in, so they go down and over, where a ridden fall (rollOut.ts) runs out to twice that before it rolls.
 */
export const ROLL_ABOVE = 1.4;

export interface RailBailPlan {
  bail: RailBail;
  /** When the rider jumps (clock time). */
  at: number;
  /** The legs' throw, in the grind's way of travel: up, along it, and out (toward the side the rider came in from). */
  jump: { up: number; along: number; out: number };
  /** Which way across (the grind's own frame's z) the side the rider came in from is, from the rail. */
  side: 1 | -1;
  /** When the feet are about down (for the turn to run), and when the attempt ends. */
  down: number;
  end: number;
}

/** Where the board's center is on the grind's path at `t`: along the way of travel, and its physics height. */
function boardOnPath(plan: GrindPlan, t: number): { along: number; y: number } {
  if (plan.handrail) return { along: railTrack(plan, t), y: GROUND - handrailHeight(plan, t) };
  return { along: travel(t), y: plan.lockCenter.y };
}

/** Physics height of the ground `along` the way of travel, and `across` it (where that matters: off a ledge's side). */
const groundAt = (plan: GrindPlan, along: number, across = 0) => GROUND + WHEEL_BOTTOM - (plan.handrail ? plan.handrail.rail.ground(along, across) : 0);

/** Which way across the rail's own frame (its ground's `z`) the side the rider came in from is. */
const sideOf = (plan: GrindPlan): 1 | -1 => (Math.sign(plan.laneZ - BAR_Z) || -plan.far) as 1 | -1;
/** A handrail's frame is turned to run downhill: going the other way, across is the other way too. */
const acrossOf = (plan: GrindPlan) => (plan.handrail && plan.spec.dir === -1 ? -1 : 1);

/** Where the rail ends along the way of travel. */
const railEnd = (plan: GrindPlan) => (plan.handrail ? plan.handrail.rail.end : plan.barEnd);

/** Whether the hips, jumping at `at` with the legs' throw along it and up, pass over a handrail's end high enough for the feet to clear it. */
function overEnd(plan: GrindPlan, at: number, along: number, up: number): boolean {
  const ride = plan.handrail;
  if (!ride || ride.rail.ledge) return true;
  const h = 1 / 240;
  const a = boardOnPath(plan, at - h);
  const b = boardOnPath(plan, at + h);
  const now = boardOnPath(plan, at);
  const va = (b.along - a.along) / (2 * h) + along;
  const vy = (b.y - a.y) / (2 * h) - up;
  const y0 = now.y - HIPS_OVER_DECK * LEG;
  const end = ride.rail.end;
  const top = railTopY(ride.rail, end);
  for (let tau = 0; tau < 3; tau += 1 / 240) {
    const x = now.along + va * tau;
    if (x > end + OVER_END.span * LEG) break;
    if (x < end - OVER_END.span * LEG) continue;
    if (y0 + vy * tau + 0.5 * GRAVITY * tau * tau > top - OVER_END.high * LEG) return false;
  }
  return true;
}

/** Where along the hips come down, and when, jumping at `at` with the legs' throw along it, up, and out to the side. */
function landingFrom(plan: GrindPlan, at: number, along: number, up: number, out: number): { along: number; across: number; t: number } {
  const h = 1 / 240;
  const a = boardOnPath(plan, at - h);
  const b = boardOnPath(plan, at + h);
  const now = boardOnPath(plan, at);
  const va = (b.along - a.along) / (2 * h) + along;
  const vy = (b.y - a.y) / (2 * h) - up;
  const y0 = now.y - HIPS_OVER_DECK * LEG;
  // Off a ledge the ground under the board is the ledge's top: the hips come down where they've gone, beside it.
  // Standing on a ledge they're as high over it as coming down onto it: they've only come down once they've been off it.
  const vz = acrossOf(plan) * sideOf(plan) * out;
  let aloft = false;
  for (let tau = 0; tau < 3; tau += 1 / 240) {
    const x = now.along + va * tau;
    const y = y0 + vy * tau + 0.5 * GRAVITY * tau * tau;
    const down = y >= groundAt(plan, x, vz * tau) - ANKLE_HEIGHT - HIPS_LANDING * LEG;
    if (!down) aloft = true;
    else if (aloft && vy + GRAVITY * tau > 0) return { along: x, across: vz * tau, t: at + tau };
  }
  return { along: now.along + va * 3, across: vz * 3, t: at + 3 };
}

/** Whether the ground where the feet come down, and on past it, is level enough to roll across. */
function levelRoom(plan: GrindPlan, along: number, across: number): boolean {
  const y0 = groundAt(plan, along, across);
  for (let d = -LEVEL_ROOM.back; d <= LEVEL_ROOM.ahead + 1e-9; d += 0.2) {
    if (Math.abs(groundAt(plan, along + d * LEG, across) - y0) > LEVEL_ROOM.rise) return false;
  }
  return true;
}

/**
 * The bail off a grind: the first moment, once the lock has been seen, that a
 * jump that way comes down on level ground with room to roll (off a handrail,
 * past the stairs) and, forward, past the rail's end; or, where none along it
 * does, as late as the grind lets it go (a forward one then off to the side
 * a little, to come down beside the rail rather than on it).
 */
export function planRailBail(plan: GrindPlan, bail: RailBail): RailBailPlan {
  const grindT = plan.off - plan.lockAt;
  const first = plan.lockAt + Math.max(LOCKED_LEAST, LOCKED_SHARE * grindT);
  const last = Math.max(first, plan.off - BEFORE_OFF);
  const throwOf = JUMP[bail];
  const fits = (at: number) => {
    const land = landingFrom(plan, at, throwOf.along, throwOf.up, throwOf.out);
    if (!levelRoom(plan, land.along, land.across)) return null;
    if (bail === 'forward' && (land.along < railEnd(plan) + PAST_END || !overEnd(plan, at, throwOf.along, throwOf.up))) return null;
    return land;
  };
  let at = last;
  let land: { along: number; across: number; t: number } | null = null;
  for (let t = first; t <= last + 1e-9; t += LOOK_STEP) {
    land = fits(t);
    if (land) {
      at = t;
      break;
    }
  }
  const jump = { ...throwOf };
  if (!land) {
    if (bail === 'forward') jump.out = FORWARD_OUT;
    land = landingFrom(plan, at, jump.along, jump.up, jump.out);
  }
  // The side the rider came in from: the lane they rolled in on is that side of the rail.
  return { bail, at, jump, side: sideOf(plan), down: land.t, end: at + RAIL_BAIL_T };
}

export interface RailBailTimeline extends GrindTimeline {
  /** When the rider jumps off the rail, and about when their feet come down. */
  bail: number;
  down: number;
}

/** The timeline the stage plays for a grind bailed off this way (down `rail` where one is given), or null if the trick isn't one. */
export function railBailTimelineFor(
  trick: Pick<Trick, 'base' | 'stance'>,
  riderStance: RiderStance,
  style: SkateStyle | undefined,
  bail: RailBail,
  rail: Handrail | null = null,
): RailBailTimeline | null {
  const spec = grindSpecFor(trick, { ledge: rail?.ledge != null });
  if (!spec) return null;
  // Planned as the stage plans it: the grind ridden as landed up to the jump.
  const plan = planGrind(spec, resolveRiderMechanics(riderStance, trick.stance), resolveSkateStyle(style), true, 'kickout', rail);
  const jump = planRailBail(plan, bail);
  return { ...grindTimeline(plan), bail: jump.at, down: jump.down, end: jump.end };
}
