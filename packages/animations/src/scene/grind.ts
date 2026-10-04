import { BAR_Z, BAR_TOP, BAR_HALF, BAR_TOP_Y, type Bearing, type GrindSpec, grindSpecFor } from './grindDefinitions';
import type { RiderStance, SkateStyle, Trick } from '../types';
import { resolveRiderMechanics, type RiderMechanics } from '../stanceMechanics';
import { resolveSkateStyle } from '../skateStyle';
import {
  FALL_T,
  FLIP_T,
  GROUND,
  LAND_T,
  ROLL_IN,
  STREET_DASH_PERIOD,
  STREET_DASH_SECONDS,
  X0,
  type FallVariant,
} from '../TrickAnimation';
import { WHEEL_BOTTOM } from './board';
import { POP_RISE } from './rig';
import { FOLLOW_POP } from './camera';
import {
  CROUCH_START,
  LAND_OMEGA,
  LAND_ZETA,
  POP_HEIGHT,
  RIDE_HEIGHT,
  SQUAT_FLOOR,
  TOUCHDOWN_HEIGHT,
  cruiseBob,
  hermite,
  softFloor,
} from './skeleton';
import { clamp01, easeOutCubic, rotX, rotY, rotZ, smoothstep, type V3 } from './math';
import {
  NO_SPIN,
  hopClock,
  hopFrame,
  hopMid,
  hopRate,
  poppingOff,
  settledHeading,
  settledSpin,
  thenSpin,
  wrapSpin,
  type HopPlan,
  type TrickSpin,
} from './grindTricks';

/**
 * Grinds and slides on a flat bar, for TrickScene.
 *
 * Flatground tricks come from the shared computeFrame physics. A grind is
 * its own trick motion, so it lives here and only the Scene renders it. An
 * attempt rolls in beside a flat bar, ollies up and across onto it, locks
 * into the trick, holds it while the bar slides by at street speed, pops off
 * the end, and rides away — or slips off and falls.
 *
 * A flatground trick can be popped into the grind ("Kickflip into Frontside
 * Lipslide", see grindTricks.ts). A flip or a shuv only turns the deck during
 * the hop onto the bar. A 180, 360, or bigspin turns the rider too; after a
 * half turn they reach the bar riding fakie, and from the lock on it is the
 * plain grind as a fakie rider does it, turned to face the way they travel.
 *
 * One can be popped out of it too ("Backside 5-0 Grind Kickflip Out"): the
 * pop off the end levers off the end the trick names, rises higher to give
 * the trick room, and the trick turns the deck (and a 180 the rider) on the
 * way down. Until the pop off, the attempt is the plain grind's.
 *
 * World space is the physics stage: x travel, y down, z toward the camera.
 * The rider stays at X0 and the plaza scrolls under them, so the bar is laid
 * out in street distance and scrolls with the ground. That is what keeps it
 * standing still in the plaza while the robot moves along it.
 *
 * The board is posed directly: a lock pose per trick (which part of the board
 * rides the bar, and how it's turned, dipped, and tipped), with the board's
 * center solved every frame so the lowest of that part sits exactly on top
 * of the bar. Each pop snaps the board about what it pops against — the
 * tail on the ground, the truck on the bar — while the rider's hips follow
 * the un-snapped board, so the feet ride the snap and the legs take it up.
 */

// ----- Motion constants -----

/** Gravity for the hops on and off the bar, world units / s². */
export const GRAVITY = 1150;
/** Seconds locked on the bar. */
const GRIND_T = 1.1;
/** How far the bar runs behind the board's center at lock-in, and past it at pop off. */
const LOCK_MARGIN = 60;
const END_MARGIN = 36;
/** Board rise at the top of the ollie onto the bar, and its per-style swing. */
const APEX = 64;
const APEX_STYLE = 18;
/** Lowest apex that still carries the wheels over the bar's top with room. */
const APEX_MIN = BAR_TOP + 21;
/**
 * How the board turns into its lock pose over the hop (fraction of the hop):
 * from where, and over how much. A trick into the grind turns the deck first
 * and settles it into the lock later.
 */
const LOCK_IN = { from: 0.35, span: 0.5 };
const ENTRY_LOCK_IN = { from: 0.5, span: 0.45 };
/** How far the board rises popping off the end, and how far its wheels
 *  must then clear the bar's top (a dipped truck has further to come up). */
const OFF_POP = 12;
const OFF_CLEAR = 6;
/** Share of a trick's extra lift (see HopTrick) the pop off adds: it starts up on the bar. */
const EXIT_LIFT = 0.85;
/** How far from the bar's centerline the board rolls in, and at least how
 *  far it moves across to lock in. */
const APPROACH_GAP = 26;
/**
 * The lane when the rider rolls in behind the bar, with the bar between them
 * and the camera. The camera sits low, so depth barely shows on screen: at
 * APPROACH_GAP the wheels sit only ~8 px above the bar's base, and a rider the
 * bar is drawn over reads as standing in front of it too.
 */
const BEHIND_GAP = 56;
const CROSS_MIN = 14;
/** The pop out: seconds the board takes to snap onto its tail. */
const SNAP = 0.07;
/**
 * Pop angles (degrees) off the ground and off the bar. Flatground snaps the
 * tail to 60 degrees; a hop onto a bar this low takes a little less.
 */
const FLAT_POP = 60;
const POP_IN = 44;
const POP_OUT = 24;
const SLIDE_POP_OUT = 10;

/** Hip heights over the deck: locked on the bar, and the crouches that load each pop. */
const GRIND_HEIGHT = 50;
const ENTRY_SQUAT = 43;
const EXIT_SQUAT = 42;
/** Seconds the rider sinks before popping off the end. */
const EXIT_CROUCH = 0.26;
/** Knee tuck (how far the hips sink below a straight line) hopping on and off. */
const TUCK_ON = 12;
const TUCK_OFF = 6;
/**
 * Hopping on with a trick under the feet: the knees tuck less (the feet are
 * already up around the turning deck), and the hips rise with the feet by
 * this share of their rise over the deck.
 */
const TUCK_TRICK = 5;
const TRICK_HIP_LIFT = 0.9;

/** Board-local x of the nose and tail feet: rolling, and loaded to pop. */
const RIDE_FEET = [12, -25] as const;
const TAIL_POP_FEET = [10, -34] as const;
const NOSE_POP_FEET = [34, -8] as const;
const POP_FOOT_X = 34;

/** Street decay after a slip (as the shared fall physics) and where the board ends up. */
const FALL_DECAY: Record<FallVariant, number> = { slam: 2.4, bail: 1.3, shank: 1.9 };
const BOARD_LEAVE: Record<FallVariant, number> = { slam: 85, bail: -70, shank: 38 };
/** How far beside the bar a fallen rider lands, and how high a slipping board kicks up. */
export const FALL_CLEAR = 32;
/**
 * When the fall sprawls away from the bar on its own, the lane eases back to
 * this over FALL_SETTLE seconds: the sprawl already clears the bar, and
 * lane plus sprawl would carry a fakie slam out of shot.
 */
export const FALL_SETTLE_CLEAR = 10;
export const FALL_SETTLE = 0.45;
const SLIP_KICK = 16;

/** Degrees of balance wobble while locked. */
const WOBBLE_YAW = 1.4;
const WOBBLE_PITCH = 2;
const WOBBLE_SLIDE = 2.6;

// ----- Plan -----

/** Board orientation in the rig's angles (degrees): rotY, then rotZ, then rotX. */
export interface BoardPose {
  yaw: number;
  pitch: number;
  roll: number;
}

export const poseDir = (pose: BoardPose) => (local: V3): V3 =>
  rotY(rotZ(rotX(local, pose.roll), pose.pitch), pose.yaw);

/**
 * Board center that seats a bearing on the bar, at x = X0: its point over
 * the bar's centerline, and the lowest of its lines within the bar's width
 * on the bar's top. A tipped truck rides the low end of its hanger.
 */
function onBar(pose: BoardPose, bearing: Bearing): V3 {
  const dir = poseDir(pose);
  const a = dir(bearing.at);
  let low = -Infinity;
  for (const line of bearing.lines) {
    const pts = line.map(dir);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (Math.abs(p.z - a.z) <= BAR_HALF) low = Math.max(low, p.y);
      if (i === 0) continue;
      // Where the segment crosses the bar's edges.
      const q = pts[i - 1];
      for (const edge of [a.z - BAR_HALF, a.z + BAR_HALF]) {
        if ((p.z - edge) * (q.z - edge) < 0) low = Math.max(low, q.y + ((p.y - q.y) * (edge - q.z)) / (p.z - q.z));
      }
    }
  }
  return { x: X0, y: BAR_TOP_Y - (low === -Infinity ? a.y : low), z: BAR_Z - a.z };
}

/**
 * The board snapped `extra` degrees of pitch past `pose` about board-local
 * `pivot`, which stays put: a tail hitting the ground, a truck on the bar.
 */
function snapped(center: V3, pose: BoardPose, extra: number, pivot: V3): { center: V3; pose: BoardPose } {
  const turned = { ...pose, pitch: pose.pitch + extra };
  if (extra === 0) return { center, pose: turned };
  const before = poseDir(pose)(pivot);
  const after = poseDir(turned)(pivot);
  return {
    center: { x: center.x + before.x - after.x, y: center.y + before.y - after.y, z: center.z + before.z - after.z },
    pose: turned,
  };
}

/** Street distance (seconds at full speed) → world units travelled. */
export const travel = (dist: number) => (dist / STREET_DASH_SECONDS) * STREET_DASH_PERIOD;

export interface GrindPlan {
  spec: GrindSpec;
  /** The trick popped into the grind, played for this rider and style. */
  entry: HopPlan | null;
  /** The trick popped out of it, played for this rider popping off its end. */
  exit: HopPlan | null;
  toeDir: 1 | -1;
  /** World z direction from the approach side of the bar to its far side. */
  far: 1 | -1;
  /** World yaw (deg) the entry trick spins the rider through: 0, ±180, or ±360. */
  heading: number;
  /** The same once the trick out has spun them too: how they ride away. */
  endHeading: number;
  /** The deck turned under the feet riding away, by the tricks in and out. */
  endSpin: TrickSpin;
  /** The lock pose, turned through `heading`. */
  lock: BoardPose;
  /** Board pitch at the instant it leaves the bar. */
  popOut: number;
  popIn: number;
  /** Flatground seconds per second of the hops, for the tricks popped into and out of the grind. */
  entryRate: number;
  exitRate: number;
  /** Board center z rolling in. */
  laneZ: number;
  lockCenter: V3;
  /** Board center rise above rolling height: top of the hop on, and at lock-in. */
  apex: number;
  lockRise: number;
  /** How far the board rises over the lock-in height popping off, and how much of that is for the trick out. */
  offPop: number;
  exitLift: number;
  upT: number;
  offT: number;
  /** Clock times: tail snap, lock-in, pop off, back on the ground. */
  pop: number;
  lockAt: number;
  off: number;
  land: number;
  /** When the rider slips off the bar, or null when they ride it out. */
  fail: number | null;
  fall: FallVariant | null;
  /** Seconds a slip takes to fall from the bar to the ground. */
  drop: number;
  end: number;
  /** The bar's ends, in world units along the direction of travel, at street distance 0. */
  barStart: number;
  barEnd: number;
}

export function planGrind(
  spec: GrindSpec,
  mechanics: RiderMechanics,
  style: SkateStyle,
  landed: boolean,
  fall: FallVariant,
): GrindPlan {
  const toeDir = mechanics.orientationSign;
  const far = (spec.toesideApproach ? toeDir : -toeDir) as 1 | -1;
  const entry = spec.entry ? { trick: spec.entry, mechanics, style } : null;
  const exit = spec.exit ? { trick: spec.exit, mechanics: poppingOff(mechanics, spec.exitNose), style } : null;
  const heading = entry ? settledHeading(entry) : 0;
  const entrySpin = entry ? settledSpin(entry) : NO_SPIN;
  // The lock as the rider rides it, then turned with them: a half turn puts
  // the bar on their other side and points the nose back up it.
  const riderFar = spec.reversed ? -far : far;
  const lock: BoardPose = { yaw: heading - riderFar * spec.yaw, pitch: spec.pitch, roll: -riderFar * spec.roll };
  const lockCenter = onBar(lock, spec.contact);
  // Off the trucks the board pops to a set angle; a slide levers off the
  // bar from whatever angle it was sliding at.
  const popOut = spec.slide
    ? lock.pitch + (spec.exitNose ? 1 : -1) * SLIDE_POP_OUT
    : (spec.exitNose ? 1 : -1) * POP_OUT;
  const lockRise = GROUND - lockCenter.y;
  const apex = Math.max(APEX + APEX_STYLE * (style.popHeight - 1) + (spec.entry?.lift ?? 0), APEX_MIN, lockRise + 12);
  const upT = Math.sqrt((2 * apex) / GRAVITY) + Math.sqrt((2 * (apex - lockRise)) / GRAVITY);
  const plainOffPop = Math.max(OFF_POP, BAR_TOP + WHEEL_BOTTOM + OFF_CLEAR - lockRise);
  const offPop = plainOffPop + EXIT_LIFT * (spec.exit?.lift ?? 0);
  const v1 = Math.sqrt(2 * GRAVITY * offPop);
  const offT = (v1 + Math.sqrt(v1 * v1 + 2 * GRAVITY * lockRise)) / GRAVITY;
  const pop = ROLL_IN;
  const lockAt = pop + upT;
  const off = lockAt + GRIND_T;
  const land = off + offT;
  const fail = landed ? null
    : fall === 'slam' ? lockAt + 0.16
      : fall === 'shank' ? lockAt + GRIND_T * 0.5
        : off - SNAP;
  const drop = Math.sqrt((2 * lockRise) / GRAVITY);
  return {
    spec,
    entry,
    exit,
    toeDir,
    far,
    heading,
    endHeading: heading + (exit ? settledHeading(exit) : 0),
    endSpin: exit ? wrapSpin(thenSpin(entrySpin, settledSpin(exit))) : entrySpin,
    lock,
    popOut,
    popIn: (spec.popNose ? 1 : -1) * POP_IN,
    entryRate: entry ? hopRate(entry, upT) : 1,
    exitRate: exit ? hopRate(exit, offT, true) : 1,
    laneZ: BAR_Z - far * Math.max(far === 1 ? BEHIND_GAP : APPROACH_GAP, far * (BAR_Z - lockCenter.z) + CROSS_MIN),
    lockCenter,
    apex,
    lockRise,
    offPop,
    exitLift: offPop - plainOffPop,
    upT,
    offT,
    pop,
    lockAt,
    off,
    land,
    fail,
    fall: landed ? null : fall,
    drop,
    end: fail == null ? land + LAND_T : fail + drop + FALL_T,
    barStart: travel(lockAt) - LOCK_MARGIN,
    barEnd: travel(off) + END_MARGIN,
  };
}

/** Key times of a grind attempt, for scrubbers and contact sheets. */
export interface GrindTimeline {
  pop: number;
  /** Middle of the trick popped into the grind, or null for an ollie on. */
  trickIn: number | null;
  lock: number;
  off: number;
  /** Middle of the trick popped out of the grind, or null for a plain pop off (and after a slip). */
  trickOut: number | null;
  land: number;
  fail: number | null;
  end: number;
}

export function grindTimeline(plan: GrindPlan): GrindTimeline {
  return {
    pop: plan.pop,
    trickIn: plan.entry ? plan.pop + hopMid(plan.entry, plan.entryRate) : null,
    lock: plan.lockAt,
    off: plan.off,
    trickOut: plan.exit && plan.fail == null ? plan.off + hopMid(plan.exit, plan.exitRate) : null,
    land: plan.land,
    fail: plan.fail,
    end: plan.end,
  };
}

/** The timeline TrickScene plays for a grind, or null if the trick isn't one. */
export function grindTimelineFor(
  trick: Pick<Trick, 'base' | 'stance'>,
  riderStance: RiderStance,
  style: SkateStyle | undefined,
  landed: boolean,
  fall: FallVariant,
): GrindTimeline | null {
  const spec = grindSpecFor(trick);
  if (!spec) return null;
  return grindTimeline(planGrind(spec, resolveRiderMechanics(riderStance, trick.stance), resolveSkateStyle(style), landed, fall));
}

// ----- Motion -----

export type GrindPhase = 'approach' | 'up' | 'lock' | 'off' | 'ride' | 'fall';

export interface GrindFrame {
  t: number;
  phase: GrindPhase;
  center: V3;
  /** The board's attitude as the grind wants it. The feet stand on this. */
  pose: BoardPose;
  /** World yaw (deg) the rider has spun through so far; `pose` turns with it. */
  heading: number;
  /** The deck turned under the feet by the tricks popped into and out of the grind, on top of `pose`. */
  spin: TrickSpin;
  /** 0 → 1: feet off the deck while it turns, and the flicking foot out over the rail. */
  offDeck: number;
  flickOut: number;
  /** Where the board's center would be without the pop's snap: the hips ride this. */
  ref: V3;
  /** Board-local x of the nose-side and tail-side feet. */
  noseFoot: number;
  tailFoot: number;
  /** Hip height over the board's center. */
  overDeck: number;
  /** 0 → 1: loading a pop, in the air, locked on the bar, pressing out of a landing. */
  load: number;
  air: number;
  grind: number;
  press: number;
  /** -1 → 1 balance sway while locked. */
  sway: number;
  streetDist: number;
  /** 0 → 1: how far the crane has risen with the bar. */
  rail: number;
}

/** Damped spring from `from` (moving at `speed`) back to `rest`, `u` seconds on. */
function spring(from: number, speed: number, rest: number, u: number): number {
  const w = LAND_OMEGA;
  const z = LAND_ZETA;
  const wd = w * Math.sqrt(1 - z * z);
  const a = from - rest;
  const b = (speed + z * w * a) / wd;
  return rest + Math.exp(-z * w * u) * (a * Math.cos(wd * u) + b * Math.sin(wd * u));
}

/** Hip height over the deck through a hop (s = 0 → 1): extend, tuck, reach down. */
const hopLegs = (tuck: number, s: number) =>
  POP_HEIGHT + (TOUCHDOWN_HEIGHT - POP_HEIGHT) * s - 4 * tuck * s * (1 - s);

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mixFeet = (a: readonly [number, number], b: readonly [number, number], k: number): [number, number] =>
  [mix(a[0], b[0], k), mix(a[1], b[1], k)];

/**
 * Hips load and explode into a pop: a crouch that starts `crouch` seconds
 * before the snap, then an extension timed so the hips leave the bottom at
 * rest and reach POP_HEIGHT at `at` moving at `takeoff`.
 */
function loadAndPop(t: number, at: number, from: number, squat: number, takeoff: number, crouch: number) {
  const extendT = Math.min(0.14, Math.max(0.06, (2.5 * (POP_HEIGHT - squat)) / Math.max(1, takeoff)));
  const bottom = at - extendT;
  if (t < bottom) {
    const c = smoothstep((t - (bottom - crouch)) / (crouch - 0.02));
    return { overDeck: from + (squat - from) * c, load: c };
  }
  const s = (t - bottom) / extendT;
  return { overDeck: hermite(squat, POP_HEIGHT, 0, takeoff * extendT, s), load: 1 - smoothstep(s) };
}

/** The grind as ridden out: every phase from roll-in to ride away. */
export function grindFrame(time: number, plan: GrindPlan): GrindFrame {
  const { spec } = plan;
  const t = Math.max(0, time);
  const v0 = Math.sqrt(2 * GRAVITY * plan.apex);
  const v1 = Math.sqrt(2 * GRAVITY * plan.offPop);
  // Hip speeds (over the deck, up positive) where the board leaves or meets
  // something: the hips carry their world speed across, the board's doesn't.
  const tuckOn = plan.entry ? TUCK_TRICK : TUCK_ON;
  const upLegs0 = (TOUCHDOWN_HEIGHT - POP_HEIGHT - 4 * tuckOn) / plan.upT;
  const upLegs1 = (TOUCHDOWN_HEIGHT - POP_HEIGHT + 4 * tuckOn) / plan.upT;
  const offLegs0 = (TOUCHDOWN_HEIGHT - POP_HEIGHT - 4 * TUCK_OFF) / plan.offT;
  const offLegs1 = (TOUCHDOWN_HEIGHT - POP_HEIGHT + 4 * TUCK_OFF) / plan.offT;
  const onTakeoff = v0 + upLegs0;
  const onArrive = v0 - GRAVITY * plan.upT + upLegs1;
  const offTakeoff = v1 + offLegs0;
  const offArrive = v1 - GRAVITY * plan.offT + offLegs1;
  const popFeet = spec.popNose ? NOSE_POP_FEET : TAIL_POP_FEET;
  const exitFeet: [number, number] = spec.exitNose
    ? [POP_FOOT_X, spec.feet[1]]
    : [spec.feet[0], -POP_FOOT_X];
  const flat: BoardPose = { yaw: 0, pitch: 0, roll: 0 };
  // A finished trick leaves the deck turned a whole or half way round, which
  // is the same deck: the rest of the attempt holds it there.
  const base = {
    t: time,
    heading: plan.heading,
    spin: plan.entry ? settledSpin(plan.entry) : NO_SPIN,
    offDeck: 0,
    flickOut: 0,
    load: 0,
    air: 0,
    grind: 0,
    press: 0,
    sway: 0,
    streetDist: time,
    rail: 0,
  };

  if (t < plan.pop) {
    const legs = loadAndPop(t, plan.pop, RIDE_HEIGHT + cruiseBob(t), ENTRY_SQUAT, onTakeoff, plan.pop - CROUCH_START - 0.14);
    const center = { x: X0, y: GROUND, z: plan.laneZ };
    return {
      ...base,
      phase: 'approach',
      heading: 0,
      spin: NO_SPIN,
      center,
      ref: center,
      pose: flat,
      noseFoot: popFeet[0],
      tailFoot: popFeet[1],
      overDeck: legs.overDeck,
      load: legs.load,
    };
  }

  if (t < plan.lockAt) {
    const tau = t - plan.pop;
    const s = tau / plan.upT;
    const rise = v0 * tau - 0.5 * GRAVITY * tau * tau;
    // The board rises clear of the bar's height before it's over the bar,
    // then turns into the trick as it comes down onto it.
    const across = smoothstep((s - 0.25) / 0.5);
    const ramp = plan.entry ? ENTRY_LOCK_IN : LOCK_IN;
    const lockIn = smoothstep((s - ramp.from) / ramp.span);
    const trick = plan.entry ? hopFrame(plan.entry, hopClock(tau, plan.entryRate), true) : null;
    const [noseFoot, tailFoot] = mixFeet(popFeet, spec.feet, smoothstep((s - 0.15) / 0.7));
    const ref = { x: X0, y: GROUND - rise, z: mix(plan.laneZ, plan.lockCenter.z, across) };
    // The pop turns the board about its middle, as on flatground: the tail
    // strike tips it up over POP_RISE and it levels off on flatground's
    // clock; a trick's own pitch comes straight from the flatground physics,
    // scaled to this pop.
    const strike = smoothstep(tau / POP_RISE);
    const pop = strike * (trick ? (trick.flat.board.rot * POP_IN) / FLAT_POP : plan.popIn * (1 - smoothstep(tau / (0.3 * FLIP_T))));
    // The rider's spin carries the board round; the lock's own turn comes on top.
    const heading = trick?.heading ?? 0;
    const board = {
      center: ref,
      pose: {
        yaw: heading + (plan.lock.yaw - plan.heading) * lockIn,
        pitch: plan.lock.pitch * lockIn + pop,
        roll: plan.lock.roll * lockIn,
      },
    };
    return {
      ...base,
      phase: 'up',
      ...board,
      heading,
      ...(trick ? { spin: trick.spin, offDeck: trick.offDeck, flickOut: trick.flickOut } : null),
      ref,
      noseFoot,
      tailFoot,
      // The hips ride up with feet that have left the deck, so the legs stay
      // open instead of folding tight around them.
      overDeck: hopLegs(tuckOn, s) + (trick && plan.entry ? TRICK_HIP_LIFT * trick.offDeck * plan.entry.trick.feetLift : 0),
      air: smoothstep(tau / 0.16),
      rail: smoothstep(s),
    };
  }

  if (t < plan.off) {
    const u = t - plan.lockAt;
    // Balance: a slow sway the board and arms share, faded in after the
    // lock-in and out before the pop.
    const settle = smoothstep(u / 0.3) * (1 - smoothstep((t - (plan.off - EXIT_CROUCH - 0.2)) / 0.2));
    const sway = Math.sin(u * Math.PI * 1.7 + 0.5) * settle;
    const oneTruck = spec.contact.at.x !== 0 && !spec.slide;
    const held: BoardPose = {
      yaw: plan.lock.yaw + (spec.slide ? WOBBLE_SLIDE : WOBBLE_YAW) * sway,
      pitch: plan.lock.pitch + (oneTruck ? WOBBLE_PITCH * sway : 0),
      roll: plan.lock.roll,
    };
    const ref = onBar(held, spec.contact);
    const snap = smoothstep((t - (plan.off - SNAP)) / SNAP);
    const board = snapped(ref, held, (plan.popOut - held.pitch) * snap, spec.pivot);
    const legsHeld = spring(TOUCHDOWN_HEIGHT, onArrive, GRIND_HEIGHT, u) + Math.sin(u * 9) * 0.8 * settle;
    const crouchStart = plan.off - 0.14 - EXIT_CROUCH;
    const legs = loadAndPop(t, plan.off, legsHeld, EXIT_SQUAT, offTakeoff, EXIT_CROUCH);
    const exit = smoothstep((t - crouchStart) / (EXIT_CROUCH - 0.04));
    const [noseFoot, tailFoot] = mixFeet(spec.feet, exitFeet, exit);
    return {
      ...base,
      phase: 'lock',
      ...board,
      ref,
      noseFoot,
      tailFoot,
      overDeck: t < crouchStart ? legsHeld : legs.overDeck,
      load: t < crouchStart ? 0 : legs.load,
      air: 1 - smoothstep(u / 0.25),
      grind: smoothstep(u / 0.25),
      press: 1 - smoothstep(u / 0.5),
      sway,
      rail: 1,
    };
  }

  if (t < plan.land) {
    const tau = t - plan.off;
    const s = tau / plan.offT;
    const rise = plan.lockRise + v1 * tau - 0.5 * GRAVITY * tau * tau;
    const level = smoothstep(s / 0.42);
    const turnOut = smoothstep((s - 0.06) / 0.62);
    const trick = plan.exit ? hopFrame(plan.exit, hopClock(tau, plan.exitRate)) : null;
    // The board turns out of the lock to the way the rider is headed, and a
    // 180 out carries rider and board round on top of that.
    const heading = plan.heading + (trick?.heading ?? 0);
    const [noseFoot, tailFoot] = mixFeet(exitFeet, RIDE_FEET, smoothstep((s - 0.2) / 0.7));
    const ref = { x: X0, y: GROUND - rise, z: plan.lockCenter.z };
    const board = snapped(
      ref,
      { yaw: heading + (plan.lock.yaw - plan.heading) * (1 - turnOut), pitch: plan.lock.pitch * (1 - level), roll: plan.lock.roll * (1 - smoothstep(s / 0.5)) },
      (plan.popOut - plan.lock.pitch) * (1 - level),
      spec.pivot,
    );
    return {
      ...base,
      phase: 'off',
      ...board,
      ...(trick && plan.exit
        ? { heading, spin: thenSpin(base.spin, trick.spin), offDeck: trick.offDeck, flickOut: trick.flickOut }
        : null),
      ref,
      noseFoot,
      tailFoot,
      // As on the hop on, the hips ride up with feet that have left the deck.
      overDeck: hopLegs(TUCK_OFF, s) + (trick && plan.exit ? TRICK_HIP_LIFT * trick.offDeck * plan.exit.trick.feetLift : 0),
      air: smoothstep(tau / 0.12),
      grind: 1 - smoothstep(tau / 0.15),
      rail: 1 - smoothstep(s),
    };
  }

  const u = t - plan.land;
  const settle = smoothstep(u / 0.5);
  const center = { x: X0, y: GROUND, z: plan.lockCenter.z };
  return {
    ...base,
    phase: 'ride',
    heading: plan.endHeading,
    spin: plan.endSpin,
    center,
    ref: center,
    pose: { ...flat, yaw: plan.endHeading },
    noseFoot: RIDE_FEET[0],
    tailFoot: RIDE_FEET[1],
    overDeck: softFloor(spring(TOUCHDOWN_HEIGHT, offArrive, RIDE_HEIGHT, u), SQUAT_FLOOR) + cruiseBob(t) * settle,
    air: 1 - smoothstep(u / 0.4),
    press: 1 - smoothstep(u / 0.6),
  };
}

/** Street distance at a clock time: full speed, easing to a stop after a slip. */
export function grindStreetDist(time: number, plan: GrindPlan): number {
  if (plan.fail == null || !plan.fall || time <= plan.fail) return time;
  const k = FALL_DECAY[plan.fall];
  return plan.fail + (1 - Math.exp(-k * (time - plan.fail))) / k;
}

/** The bar's two ends in world x at a street distance. */
export function barSpan(plan: GrindPlan, streetDist: number): { x0: number; x1: number } {
  const moved = travel(streetDist);
  const a = X0 + plan.spec.dir * (plan.barStart - moved);
  const b = X0 + plan.spec.dir * (plan.barEnd - moved);
  return { x0: Math.min(a, b), x1: Math.max(a, b) };
}

/**
 * Which side of the bar a slip ends up on: the side the board already hangs
 * off (nose- and tailslides), else the side the shared flatground slam
 * sprawls toward (toeside rolling forward, heelside rolling fakie), so the
 * fall carries the body away from the bar instead of back under it.
 */
export function slipSide(plan: GrindPlan): 1 | -1 {
  const off = plan.lockCenter.z - BAR_Z;
  return Math.abs(off) > 12 ? (Math.sign(off) as 1 | -1) : ((plan.toeDir * plan.spec.dir) as 1 | -1);
}

/** Whether the shared flatground fall sprawls toward the slip side. */
export function sprawlsAway(plan: GrindPlan): boolean {
  return slipSide(plan) === plan.toeDir * plan.spec.dir;
}

/**
 * The board after a slip: it squirts out from under the feet with a small
 * kick (enough to lift the hanging truck over the bar), drops to the
 * ground, settles flat, and skids on the way the shared fall physics sends it.
 */
export function slipBoard(u: number, plan: GrindPlan, at: GrindFrame): { center: V3; pose: BoardPose } {
  const fall = plan.fall ?? 'slam';
  const side = slipSide(plan);
  const c0 = at.center;
  const zEnd = BAR_Z + side * Math.max(FALL_CLEAR + 16, Math.abs(c0.z - BAR_Z) + 16);
  const kick = Math.sqrt(2 * GRAVITY * SLIP_KICK);
  const drop = GROUND - c0.y;
  // Seconds until the board meets the ground.
  const down = (kick + Math.sqrt(kick * kick + 2 * GRAVITY * drop)) / GRAVITY;
  const y = Math.min(GROUND, c0.y - kick * u + 0.5 * GRAVITY * u * u);
  const flat = smoothstep(u / down);
  return {
    center: {
      x: X0 + plan.spec.dir * BOARD_LEAVE[fall] * easeOutCubic(clamp01(u / 0.8)),
      y,
      z: mix(c0.z, zEnd, smoothstep(u / 0.35)),
    },
    pose: {
      yaw: at.pose.yaw - plan.spec.dir * side * 28 * easeOutCubic(clamp01(u / 0.8)),
      pitch: at.pose.pitch * (1 - flat),
      roll: at.pose.roll * (1 - flat),
    },
  };
}

/**
 * Crane height for a grind: it rides up with the bar (following the
 * lock-in height, on an ease that starts and ends at rest), adds the flatground
 * crane's lift over the hop on and a trick out's higher pop off, and sinks
 * after a slip like a flatground slam.
 */
export function grindCameraLift(plan: GrindPlan, time: number, rail: number, sink: number): number {
  const t = Math.max(0, time);
  const hop = t > plan.pop && t < plan.lockAt
    ? FOLLOW_POP * (plan.apex - plan.lockRise) * Math.sin((Math.PI * (t - plan.pop)) / plan.upT) ** 2
    : t > plan.off && t < plan.land && plan.fail == null
      ? FOLLOW_POP * plan.exitLift * Math.sin((Math.PI * (t - plan.off)) / plan.offT) ** 2
      : 0;
  return FOLLOW_POP * plan.lockRise * rail + hop - sink;
}
