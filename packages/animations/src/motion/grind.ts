import { BAR_Z, BAR_TOP, BAR_HALF, BAR_TOP_Y, type Bearing, type GrindSpec, grindSpecFor } from './grindDefinitions';
import type { RiderStance, SkateStyle, Trick } from '../types';
import { resolveRiderMechanics, type RiderMechanics } from './stance';
import { resolveSkateStyle } from './style';
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
} from './trick';
import { WHEEL_BOTTOM, WHEEL_HALF_W, WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../board/board';
import { BOTTOM_LOCAL, TIP_X } from '../board/deck';
import { POP_RISE } from './rig';
import { FOLLOW_POP } from '../camera/camera';
import {
  CROUCH_START,
  DECK_HALF_WIDTH,
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
import { clamp01, easeOutCubic, rotX, rotY, rotZ, smoothstep, type V3 } from '../math';
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
  type HopFrame,
  type HopPlan,
  type TrickSpin,
} from './grindTricks';

/**
 * Grinds and slides, on a flat bar or down a set's handrail.
 *
 * Flatground tricks come from the shared computeFrame physics. A grind is
 * its own trick motion, so it lives here. An attempt rolls in beside a flat bar, ollies up and across onto it, locks
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
/** A tre-style scoop must snap before the taller entry hop lifts the tail away. */
const SCOOP_POP_RISE = 0.03;
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
  /**
   * A handrail's fall: the whole pose above tipped about the world's z (the
   * horizontal across the rail), down the way of travel. The lock poses are
   * authored on a level bar; on a down rail the same pose rides tipped with it.
   */
  fall?: number;
}

export const poseDir = (pose: BoardPose) => (local: V3): V3 => {
  const turned = rotY(rotZ(rotX(local, pose.roll), pose.pitch), pose.yaw);
  return pose.fall ? rotZ(turned, pose.fall) : turned;
};

/** Lowest solid point of a scooping deck, including the tilted wheel rims. */
function entryBottom(pose: BoardPose, spin: TrickSpin): number {
  const attitude = poseDir(pose);
  const dir = (p: V3) => attitude(rotY(rotX(p, spin.flip), spin.yaw));
  let low = Math.max(...BOTTOM_LOCAL.map((p) => dir(p).y));
  const rim = WHEEL_R * Math.hypot(dir({ x: 1, y: 0, z: 0 }).y, dir({ x: 0, y: 1, z: 0 }).y)
    + WHEEL_HALF_W * Math.abs(dir({ x: 0, y: 0, z: 1 }).y);
  for (const x of [-WHEEL_X, WHEEL_X]) for (const z of [-WHEEL_Z, WHEEL_Z]) {
    low = Math.max(low, dir({ x, y: WHEEL_Y, z }).y + rim);
  }
  return low;
}

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

// ----- Down a handrail -----

/**
 * A rail falling away down a stair set, for grinding in place of the flat
 * bar. Laid out the stairs' own way: `s` is world units along the way of
 * travel from the top step's edge, and heights are over the top landing, up
 * positive. The rider rolls in on the top landing beside it.
 */
export interface Handrail {
  /** Where the rail starts and ends along the way of travel. */
  start: number;
  end: number;
  /** Height of the line along the rail's top at s = 0, and how far it falls per unit along. */
  top: number;
  slope: number;
  /** Height of the ground at s: the top landing, the steps, the bottom landing. */
  ground: (s: number) => number;
  /** What a body lying on the steps rests on at s: the line of their edges, and the landings. */
  rest: (s: number) => number;
  /** How fast a skater rolls in to it, world units a second. */
  speed: number;
  /**
   * The rail stands at the edge of the stairs (a side rail): past its far
   * side is a wall or a bank, not steps, so a slip falls back to the side
   * the grind came in from.
   */
  edge?: boolean;
}

/**
 * How a grind rides a handrail. The skater rolls in beside it and pops as it
 * starts, not far back from it, and no higher than they need: carried along
 * at speed, they find the rail falling away under them, so a modest ollie
 * gets the board up over its line and it comes down onto it several steps
 * down. The board waits beside the rail until it's over that line, then
 * steps across and turns into the lock. Down the rail it speeds up —
 * gravity along the slope less a waxed rail's friction, which trucks have
 * less of than the wood of a slide — and pops off the bottom onto the landing.
 */
export interface HandrailRide {
  rail: Handrail;
  /** Degrees the rail tips the lock pose about the horizontal across it (BoardPose.fall): down the way of travel. */
  tilt: number;
  /** World units a second along the way of travel: rolling in, and off the bottom. */
  speed: number;
  offSpeed: number;
  /** How fast the grind gains speed down the rail (world units a second, each second, along the way of travel). */
  accel: number;
  /**
   * Degrees the body leans down the rail while locked (about z, as `tilt`):
   * square to what it feels as the rail speeds it up, gravity less the
   * speed-up, between upright and square to the slope.
   */
  lean: number;
  /** Where the board's center is along the rail at the pop, the lock, and the pop off. */
  popS: number;
  lockS: number;
  offS: number;
  /** Seconds locked on the rail: as long as it takes to get down it. */
  grindT: number;
  /** Share of the hop on spent under the rail's line, beside it: the board crosses over it only after. */
  over: number;
  /** How far off the rail the board's center is where it starts across (RAIL_BESIDE, or more mid-spin). */
  beside: number;
}

/** The pop on: this far before the rail starts, the board's center beside it. */
const RAIL_POP_BEFORE = 29;
/**
 * How far the wheels of a board level with the rail rise over its top
 * against its fall, at the top of the hop: room to cross over it.
 */
const RAIL_CLEAR = 6;
/** The wheels' bottoms, end to end: what crosses over the rail first, the board level with it. */
const WHEELS_DOWN: Bearing = {
  at: { x: 0, y: WHEEL_BOTTOM, z: 0 },
  lines: [[{ x: -WHEEL_X, y: WHEEL_BOTTOM, z: 0 }, { x: WHEEL_X, y: WHEEL_BOTTOM, z: 0 }]],
};
/** Share of a trick's hang time (HopTrick.lift) that a trick into a handrail adds over the rail. */
const RAIL_TRICK_LIFT = 0.5;
/** Rolling in beside a handrail, the board's center this far off it, either side. */
const RAIL_LANE = 34;
/**
 * Hopping on, the board edges in toward the rail but keeps its center this
 * far off it (its wheels clear of the pipe) until it's up over the rail's
 * line. A spin in swings the deck's ends round, so keeps them as far off.
 */
const RAIL_BESIDE = 15;
/** The board's half width across, wheels included. */
const HALF_WIDTH = Math.max(DECK_HALF_WIDTH, WHEEL_Z + WHEEL_HALF_W);
/** A spin in pops this much higher onto a handrail, for longer over its line to step across in. */
const RAIL_SPIN_ROOM = 8;
/**
 * Stepping across a handrail onto a lock past it (a blunt, a slide), the
 * board's center moves sideways no faster than this on average (world units
 * a second): a long step across pops a little higher, up to RAIL_ACROSS_ROOM,
 * for the time to make it.
 */
const RAIL_ACROSS_SPEED = 200;
/** Likewise turning into the lock over the rail (a slide's quarter turn): no faster than this on average (degrees a second). */
const RAIL_TURN_SPEED = 300;
const RAIL_ACROSS_ROOM = 14;
/** How much of the sideways motion the board's heading follows, angling it toward the rail as it goes. */
const RAIL_ANGLE = 0.4;
/** The step across, as shares of the hop left once the board is over the rail's line. */
const CROSS_FROM = 0.05;
const CROSS_TO = 0.8;
/** A spin into the grind turns the deck round in the hop: its ends swing out to either side. */
const spinsIn = (spec: GrindSpec) => spec.entry != null && (spec.entry.spec.yaw !== 0 || spec.entry.spec.bodyYaw !== 0);
/** Kinetic friction on a waxed rail: a truck's hanger, and a deck's wood. */
const GRIND_FRICTION = 0.2;
const SLIDE_FRICTION = 0.27;

/** Physics y of a handrail's top line at `s` along it. */
const railTopY = (rail: Handrail, s: number) => GROUND + WHEEL_BOTTOM - (rail.top - rail.slope * s);

/** Physics y of the board's center rolling on ground `height` over the top landing. */
const deckOn = (height: number) => GROUND - height;

/**
 * Board center that seats a bearing on a handrail, with the rider `s` along
 * it and the board's center at x = X0. The rail is a level bar tipped down
 * the slope, so the pose seats on a level bar first and the seat tips with
 * it: whatever part rides the bar rides the rail the same way, across it or
 * along it. Then it slides along the rail until the center is back over X0.
 */
function onRail(pose: BoardPose, bearing: Bearing, rail: Handrail, tilt: number, dir: 1 | -1, s: number): V3 {
  const level = onBar({ yaw: pose.yaw, pitch: pose.pitch, roll: pose.roll }, bearing);
  const o = rotZ({ x: level.x - X0, y: level.y - BAR_TOP_Y, z: level.z - BAR_Z }, tilt);
  return { x: X0, y: railTopY(rail, s - dir * o.x) + o.y, z: BAR_Z + o.z };
}

/**
 * The ride down a handrail for a grind or a slide, locked in `lock` (tipped
 * with the rail), with `lift` more rise over the rail for a trick into it.
 *
 * The hop on is solved against the rail's own line: from the pop the seat
 * the board will lock into falls away at the rail's slope times the speed,
 * so the board rises over it at its pop speed plus that, starting as far
 * under it as the seat is over the top landing there. Its arc over that
 * line peaks high enough for the wheels of a board still level with the
 * rail to pass RAIL_CLEAR (and `lift`) over its top — more for a lock that
 * dips an end below it — and comes back down onto it: that is the lock,
 * wherever along the rail the speed has carried it by then. The board
 * crosses over once its wheels are over the rail.
 */
function rideFor(rail: Handrail, spec: GrindSpec, lock: BoardPose, style: SkateStyle, lift: number, across: number, turn: number) {
  const fall = Math.atan(rail.slope);
  const tilt = (spec.dir * fall * 180) / Math.PI;
  const friction = spec.slide ? SLIDE_FRICTION : GRIND_FRICTION;
  // Along the rail: gravity down it, less the rail's friction.
  const along = Math.max(0, GRAVITY * (Math.sin(fall) - friction * Math.cos(fall)));
  const accel = along * Math.cos(fall);
  const lean = Math.atan2(along * Math.cos(fall), GRAVITY - along * Math.sin(fall));
  const { speed } = rail;

  const popS = rail.start - RAIL_POP_BEFORE;
  const under = GROUND - onRail(lock, spec.contact, rail, tilt, spec.dir, popS).y;
  // How far a level board's wheels sit over where the lock seats its center.
  const wheels = Math.max(0, onRail(lock, spec.contact, rail, tilt, spec.dir, popS).y - onRail({ yaw: 0, pitch: 0, roll: 0 }, WHEELS_DOWN, rail, tilt, spec.dir, popS).y);
  const base = Math.max(2, RAIL_CLEAR + 0.5 * APEX_STYLE * (style.popHeight - 1) + RAIL_TRICK_LIFT * lift + (spinsIn(spec) ? RAIL_SPIN_ROOM : 0));
  // The hop for a given room over the rail: its time, and the share of it spent under the rail's line.
  const hop = (room: number) => {
    const launch = Math.sqrt(2 * GRAVITY * (under + wheels + room));
    const upT = (launch + Math.sqrt(2 * GRAVITY * (wheels + room))) / GRAVITY;
    return { room, launch, upT, over: (launch - Math.sqrt(2 * GRAVITY * room)) / (GRAVITY * upT) };
  };
  // A long step across (`across` from beside the rail to the lock) or a big turn into it (`turn`, deg)
  // pops a little higher, for the time over the rail's line to make it.
  const needs = Math.max(across / RAIL_ACROSS_SPEED, Math.abs(turn) / RAIL_TURN_SPEED);
  let h = hop(base);
  while (h.room < base + RAIL_ACROSS_ROOM && (CROSS_TO - CROSS_FROM) * (1 - h.over) * h.upT < needs) h = hop(h.room + 1);
  const { launch, upT } = h;
  const lockS = popS + speed * upT;

  const offS = rail.end - END_MARGIN;
  const length = offS - lockS;
  const grindT = accel > 0 ? (Math.sqrt(speed * speed + 2 * accel * length) - speed) / accel : length / speed;
  const ride: HandrailRide = {
    rail,
    tilt,
    speed,
    offSpeed: speed + accel * grindT,
    accel,
    lean: (spec.dir * lean * 180) / Math.PI,
    popS,
    lockS,
    offS,
    grindT,
    over: h.over,
    beside: RAIL_BESIDE,
  };
  // The pop itself, off the top landing: the speed over the falling line, less the line's fall.
  const pop = launch - rail.slope * speed;
  return { ride, upT, apex: (pop * pop) / (2 * GRAVITY) };
}

/**
 * How far along a handrail (from its top step's edge, along the way of
 * travel) the board's center is at a clock time: at the approach speed up
 * to the lock, speeding up down the rail, off the bottom at the speed it
 * left with, and after a slip skidding to a stop as the flatground fall does.
 */
export function railTrack(plan: GrindPlan, time: number): number {
  const ride = plan.handrail;
  if (!ride) return travel(grindStreetDist(time, plan));
  if (plan.fail == null || !plan.fall || time <= plan.fail) return riding(plan, ride, time).s;
  const k = FALL_DECAY[plan.fall];
  const slip = riding(plan, ride, plan.fail);
  return slip.s + (slip.speed * (1 - Math.exp(-k * (time - plan.fail)))) / k;
}

/** Where along a handrail and how fast, riding it out: the approach speed, the speed-up down it, the speed off its bottom. */
function riding(plan: GrindPlan, ride: HandrailRide, t: number): { s: number; speed: number } {
  if (t <= plan.lockAt) return { s: ride.lockS - ride.speed * (plan.lockAt - t), speed: ride.speed };
  if (t <= plan.off) {
    const u = t - plan.lockAt;
    return { s: ride.lockS + ride.speed * u + 0.5 * ride.accel * u * u, speed: ride.speed + ride.accel * u };
  }
  return { s: ride.offS + ride.offSpeed * (t - plan.off), speed: ride.offSpeed };
}

/** How fast (world units a second, down) a grind is sinking with the handrail at a clock time: none off it, or on a flat bar. */
export function railSink(plan: GrindPlan, time: number): number {
  const ride = plan.handrail;
  return ride && time > plan.lockAt && time < plan.off ? ride.rail.slope * riding(plan, ride, time).speed : 0;
}

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
  /** Seconds the entry takes to snap the board up from the ground. */
  popInRise: number;
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
  /**
   * Popping off: the board center's height over where it lands, and how fast
   * it leaves upward. Off a flat bar, the lock-in height and the pop's
   * speed; off a handrail, less the speed it was already falling with.
   */
  offRise: number;
  offLaunch: number;
  /** Physics y of the board's center riding away: the asphalt, or the landing at the bottom of the stairs. */
  landY: number;
  /** Down a stair set's handrail; null on the flat bar. */
  handrail: HandrailRide | null;
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

/**
 * World z direction from the lane a grind rolls in on across the bar to its
 * far side, in the grind's own frame (travel along spec.dir): the bar is on
 * the rider's toeside or heelside as the grind's name says.
 */
export function approachFar(spec: GrindSpec, mechanics: RiderMechanics): 1 | -1 {
  const toeDir = mechanics.orientationSign;
  return (spec.toesideApproach ? toeDir : -toeDir) as 1 | -1;
}

export function planGrind(
  spec: GrindSpec,
  mechanics: RiderMechanics,
  style: SkateStyle,
  landed: boolean,
  fall: FallVariant,
  rail: Handrail | null = null,
): GrindPlan {
  const toeDir = mechanics.orientationSign;
  const far = approachFar(spec, mechanics);
  const entry = spec.entry ? { trick: spec.entry, mechanics, style } : null;
  const exit = spec.exit ? { trick: spec.exit, mechanics: poppingOff(mechanics, spec.exitNose), style } : null;
  const heading = entry ? settledHeading(entry) : 0;
  const entrySpin = entry ? settledSpin(entry) : NO_SPIN;
  // The lock as the rider rides it, then turned with them: a half turn puts
  // the bar on their other side and points the nose back up it.
  const riderFar = spec.reversed ? -far : far;
  const level: BoardPose = { yaw: heading - riderFar * spec.yaw, pitch: spec.pitch, roll: -riderFar * spec.roll };
  // Down a handrail the lock tips with the rail, and the grind takes as long as the rail is.
  const lock: BoardPose = rail ? { ...level, fall: (spec.dir * Math.atan(rail.slope) * 180) / Math.PI } : level;
  // How far the board steps across a handrail onto its lock: from beside it to as far past it as the lock sits.
  const across = rail ? RAIL_BESIDE + far * (onBar(level, spec.contact).z - BAR_Z) : 0;
  // A trick in that turns the deck carries the lock's turn round with it (turnShare): no extra time for it over the rail.
  const railed = rail ? rideFor(rail, spec, lock, style, spec.entry?.lift ?? 0, across, spinsIn(spec) ? 0 : level.yaw - heading) : null;
  const lockCenter = railed ? onRail(lock, spec.contact, railed.ride.rail, railed.ride.tilt, spec.dir, railed.ride.lockS) : onBar(lock, spec.contact);
  // Beside a handrail the lane and where it starts across leave room for the deck's swing.
  const lane = railed ? railLane(railed.ride, entry, entry ? hopRate(entry, railed.upT) : 1, railed.upT, -far * (lockCenter.z - BAR_Z), level.yaw - heading, heading) : null;
  const ride = railed && lane ? { ...railed.ride, beside: lane.beside } : null;
  // Off the trucks the board pops to a set angle; a slide levers off the
  // bar from whatever angle it was sliding at.
  const popOut = spec.slide
    ? lock.pitch + (spec.exitNose ? 1 : -1) * SLIDE_POP_OUT
    : (spec.exitNose ? 1 : -1) * POP_OUT;
  const lockRise = GROUND - lockCenter.y;
  const apex = railed?.apex ?? Math.max(APEX + APEX_STYLE * (style.popHeight - 1) + (spec.entry?.lift ?? 0), APEX_MIN, lockRise + 12);
  const upT = railed?.upT ?? Math.sqrt((2 * apex) / GRAVITY) + Math.sqrt((2 * (apex - lockRise)) / GRAVITY);
  // The board's height over the bar's top at the lock: a flat bar's is BAR_TOP under the lock-in height.
  const overBar = ride ? lockRise - (GROUND - railTopY(ride.rail, ride.lockS)) : lockRise - BAR_TOP;
  const plainOffPop = Math.max(OFF_POP, ride ? WHEEL_BOTTOM + OFF_CLEAR - overBar : BAR_TOP + WHEEL_BOTTOM + OFF_CLEAR - lockRise);
  const offPop = plainOffPop + EXIT_LIFT * (spec.exit?.lift ?? 0);
  const v1 = Math.sqrt(2 * GRAVITY * offPop);
  const pop = ROLL_IN;
  const lockAt = pop + upT;
  const grindT = ride ? ride.grindT : GRIND_T;
  const off = lockAt + grindT;
  // Off a handrail the board leaves from the bottom of it, already falling
  // with it, and comes down on the landing.
  const landY = ride ? deckOn(ride.rail.ground(ride.rail.end)) : GROUND;
  const offRise = ride ? landY - onRail(lock, spec.contact, ride.rail, ride.tilt, spec.dir, ride.offS).y : lockRise;
  const offLaunch = ride ? v1 - ride.rail.slope * ride.offSpeed : v1;
  const offT = (offLaunch + Math.sqrt(offLaunch * offLaunch + 2 * GRAVITY * offRise)) / GRAVITY;
  const land = off + offT;
  const fail = landed ? null
    : fall === 'slam' ? lockAt + 0.16
      : fall === 'shank' ? lockAt + grindT * 0.5
        : off - SNAP;
  // A slip falls to the ground: a flat bar's asphalt, or the steps under a handrail.
  const slipFrom = (t: number) => {
    if (!ride) return lockRise;
    const u = t - lockAt;
    const s = ride.lockS + ride.speed * u + 0.5 * ride.accel * u * u;
    return Math.max(1, deckOn(ride.rail.rest(s)) - onRail(lock, spec.contact, ride.rail, ride.tilt, spec.dir, s).y);
  };
  const drop = Math.sqrt((2 * (fail == null ? lockRise : slipFrom(fail))) / GRAVITY);
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
    popInRise: entry && entry.trick.spec.flips === 1 && entry.trick.spec.yaw === 360 && entry.trick.spec.bodyYaw === 0
      ? SCOOP_POP_RISE : POP_RISE,
    entryRate: entry ? hopRate(entry, upT) : 1,
    exitRate: exit ? hopRate(exit, offT, true) : 1,
    laneZ: BAR_Z - far * (lane ? lane.lane : Math.max(far === 1 ? BEHIND_GAP : APPROACH_GAP, far * (BAR_Z - lockCenter.z) + CROSS_MIN)),
    lockCenter,
    apex,
    lockRise,
    offPop,
    exitLift: offPop - plainOffPop,
    offRise,
    offLaunch,
    landY,
    handrail: ride,
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

/** The timeline the stage plays for a grind (down `rail` where one is given), or null if the trick isn't one. */
export function grindTimelineFor(
  trick: Pick<Trick, 'base' | 'stance'>,
  riderStance: RiderStance,
  style: SkateStyle | undefined,
  landed: boolean,
  fall: FallVariant,
  rail: Handrail | null = null,
): GrindTimeline | null {
  const spec = grindSpecFor(trick);
  if (!spec) return null;
  return grindTimeline(planGrind(spec, resolveRiderMechanics(riderStance, trick.stance), resolveSkateStyle(style), landed, fall, rail));
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
  /** Degrees the body leans down a handrail (HandrailRide.lean); 0 on a flat bar. */
  lean: number;
  streetDist: number;
  /** 0 → 1: how far the crane has risen with the bar. */
  rail: number;
}

/**
 * The board's z hopping onto a handrail, `s` through the hop: from the lane
 * it edges in beside the rail, no closer than RAIL_BESIDE (RAIL_SPIN_GAP
 * with a spin in) while it's still under the rail's line, then steps across
 * onto it, moving sideways without a hitch where the two meet.
 */
function ontoRail(plan: GrindPlan, ride: HandrailRide, s: number): number {
  const side = Math.sign(plan.laneZ - BAR_Z) || 1;
  return BAR_Z + side * offRail(side * (plan.laneZ - BAR_Z), ride.beside, side * (plan.lockCenter.z - BAR_Z), ride.over, s);
}

/** Degrees the board angles toward its sideways motion `s` through the hop onto a handrail (RAIL_ANGLE of the way). */
function railAngle(plan: GrindPlan, ride: HandrailRide, s: number): number {
  const e = 0.01;
  const across = (ontoRail(plan, ride, s + e) - ontoRail(plan, ride, s - e)) / (2 * e * plan.upT);
  return (-plan.spec.dir * RAIL_ANGLE * Math.atan2(across, ride.speed) * 180) / Math.PI;
}

/**
 * The board's distance off a handrail hopping on (positive on the side it
 * rolls in on), `s` through the hop: from `lane` it edges in to `beside` by
 * the time it's over the rail's line (`over`), and steps across to `lock`
 * around the top of its arc over that line, where it has the most room —
 * moving sideways without a hitch where the two meet.
 */
function offRail(lane: number, beside: number, lock: number, over: number, s: number): number {
  const from = 0.12;
  const cross = over + CROSS_FROM * (1 - over);
  const to = over + CROSS_TO * (1 - over);
  const near = Math.min(lane, beside);
  // Locked on its own side of the rail, clear of it: straight there.
  if (lock >= RAIL_BESIDE) return hermite(lane, lock, 0, 0, clamp01((s - from) / (to - from)));
  // Sideways speed where it reaches the rail: the step across's average, kept gentle enough that the edge in never overshoots.
  const speed = -Math.min((near - lock) / (to - cross), (3 * (lane - near)) / (cross - from));
  if (s < cross) return hermite(lane, near, 0, speed * (cross - from), clamp01((s - from) / (cross - from)));
  return hermite(near, lock, speed * (to - cross), 0, clamp01((s - cross) / (to - cross)));
}

/**
 * How far off a handrail the board rolls in (`lane`) and how far it waits
 * from it to start across (`beside`), for the trick popped onto it. A
 * plain ollie on edges in to RAIL_BESIDE. A spin in swings the deck's ends
 * out across as it comes round, so while the board is still under the
 * rail's line it keeps as far off as the deck reaches at that moment: wide
 * at first, closing in as the spin comes back to lie along the rail.
 */
function railLane(ride: HandrailRide, entry: HopPlan | null, entryRate: number, upT: number, lock: number, turn: number, settled: number): { lane: number; beside: number } {
  // `lock` is where the board locks on, off the rail the same way as the lane (negative: across it);
  // a spin in brings in `turn`, the lock's own turn past the rider's spin, as it comes round to `settled`.
  const need = (s: number) => {
    if (!entry || (entry.trick.spec.yaw === 0 && entry.trick.spec.bodyYaw === 0)) return RAIL_BESIDE;
    const hop = hopFrame(entry, hopClock(s * upT, entryRate), true);
    const across = ((hop.heading + hop.spin.yaw + turn * (turnShare(entry, settled, hop) ?? 0)) * Math.PI) / 180;
    return TIP_X * Math.abs(Math.sin(across)) + HALF_WIDTH * Math.abs(Math.cos(across)) + RAIL_BESIDE - HALF_WIDTH;
  };
  const beside = need(ride.over + CROSS_FROM * (1 - ride.over));
  const samples = Array.from({ length: 41 }, (_, i) => (i / 40) * ride.over);
  const needs = samples.map(need);
  let lane = Math.max(RAIL_LANE, beside, lock + CROSS_MIN);
  for (let i = 0; i < 60 && samples.some((s, k) => offRail(lane, beside, lock, ride.over, s) < needs[k] - 1e-6); i++) lane += 1;
  return { lane, beside };
}

/**
 * 0 → 1: how far round a trick into the grind that turns the deck has come
 * (the rider's spin, of the `settled` heading it ends on; or a shuv's own),
 * for the lock's own turn to ride along with. Null for a trick that doesn't
 * turn the deck, which turns into the lock on its own.
 */
function turnShare(entry: HopPlan | null, settled: number, hop: HopFrame | null): number | null {
  if (!entry || !hop) return null;
  if (settled) return clamp01(hop.heading / settled);
  return entry.trick.spec.yaw ? clamp01(hop.rotation) : null;
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
  const { spec, handrail: ride } = plan;
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
  // A handrail goes on falling under the board after the lock, so the legs take less of the landing on it.
  const onArrive = v0 - GRAVITY * plan.upT + upLegs1 + (ride ? ride.rail.slope * ride.speed : 0);
  const offTakeoff = v1 + offLegs0;
  const offArrive = plan.offLaunch - GRAVITY * plan.offT + offLegs1;
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
    lean: 0,
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
    // then turns into the trick as it comes down onto it. Beside a handrail
    // it waits until the rail has fallen away under its line, tipped to
    // match it, and then crosses over and turns in.
    const ramp = plan.entry ? ENTRY_LOCK_IN : LOCK_IN;
    const over = ride ? clamp01((s - ride.over) / (1 - ride.over)) : 0;
    const lockIn = ride ? smoothstep((over - 0.5) / 0.48) : smoothstep((s - ramp.from) / ramp.span);
    const trick = plan.entry ? hopFrame(plan.entry, hopClock(tau, plan.entryRate), true) : null;
    // A spin in carries the board round into the lock with it: the lock's own turn comes on as the
    // spin does, so the board keeps turning one way and arrives in the lock as the spin comes round
    // (a 360 into a lipslide turns 270 or 450), rather than spinning round and turning back. Without
    // one, over a handrail's line the board turns across it as it steps over; only dipping an end
    // below it waits until it's across.
    const turnIn = turnShare(plan.entry, plan.heading, trick)
      ?? (ride ? smoothstep((over - CROSS_FROM) / (CROSS_TO + 0.05 - CROSS_FROM)) : lockIn);
    const [noseFoot, tailFoot] = mixFeet(popFeet, spec.feet, smoothstep((s - 0.15) / 0.7));
    const ref = { x: X0, y: GROUND - rise, z: ride ? ontoRail(plan, ride, s) : mix(plan.laneZ, plan.lockCenter.z, smoothstep((s - 0.25) / 0.5)) };
    // The pop turns the board about its middle, as on flatground: the tail
    // strike tips it up over the entry's snap and it levels off on flatground's
    // clock; a trick's own pitch comes straight from the flatground physics,
    // scaled to this pop.
    const strike = smoothstep(tau / plan.popInRise);
    const pop = strike * (trick ? (trick.flat.board.rot * POP_IN) / FLAT_POP : plan.popIn * (1 - smoothstep(tau / (0.3 * FLIP_T))));
    // The rider's spin carries the board round; the lock's own turn comes on top.
    const heading = trick?.heading ?? 0;
    const board = {
      center: ref,
      pose: {
        // Hopping onto a handrail the board angles toward where it's heading across, until it turns into the lock.
        yaw: heading + (plan.lock.yaw - plan.heading) * turnIn + (ride ? railAngle(plan, ride, s) * (1 - turnIn) : 0),
        pitch: plan.lock.pitch * lockIn + pop,
        roll: plan.lock.roll * lockIn,
        ...(ride ? { fall: ride.tilt * smoothstep((s - ride.over + 0.2) / 0.35) } : null),
      },
    };
    // A quick scoop can put a wheel below the flight arc for a frame. Seat
    // the actual board on the ground until the hop lifts every part clear.
    if (plan.popInRise < POP_RISE && trick && tau < POP_RISE) {
      board.center = { ...ref, y: Math.min(ref.y, GROUND + WHEEL_BOTTOM - entryBottom(board.pose, trick.spin)) };
    }
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
      ...(ride ? { fall: ride.tilt } : null),
    };
    // Down a handrail the board rides it down as the rider speeds along it.
    const ref = ride ? onRail(held, spec.contact, ride.rail, ride.tilt, spec.dir, railTrack(plan, t)) : onBar(held, spec.contact);
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
      lean: ride ? ride.lean * smoothstep(u / 0.25) * (1 - exit) : 0,
      rail: 1,
    };
  }

  if (t < plan.land) {
    const tau = t - plan.off;
    const s = tau / plan.offT;
    const rise = plan.offRise + plan.offLaunch * tau - 0.5 * GRAVITY * tau * tau;
    const level = smoothstep(s / 0.42);
    const turnOut = smoothstep((s - 0.06) / 0.62);
    const trick = plan.exit ? hopFrame(plan.exit, hopClock(tau, plan.exitRate)) : null;
    // The board turns out of the lock to the way the rider is headed, and a
    // 180 out carries rider and board round on top of that.
    const heading = plan.heading + (trick?.heading ?? 0);
    const [noseFoot, tailFoot] = mixFeet(exitFeet, RIDE_FEET, smoothstep((s - 0.2) / 0.7));
    const ref = { x: X0, y: plan.landY - rise, z: plan.lockCenter.z };
    const board = snapped(
      ref,
      {
        yaw: heading + (plan.lock.yaw - plan.heading) * (1 - turnOut),
        pitch: plan.lock.pitch * (1 - level),
        roll: plan.lock.roll * (1 - smoothstep(s / 0.5)),
        // Off the bottom of a handrail the board keeps the rail's slope a while, levelling for the landing.
        ...(ride ? { fall: ride.tilt * (1 - smoothstep(s / 0.6)) } : null),
      },
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
  const center = { x: X0, y: plan.landY, z: plan.lockCenter.z };
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
 * fall carries the body away from the bar instead of back under it. Off a
 * rail at the edge of the stairs it's always back onto the steps, the side
 * the grind came in from.
 */
export function slipSide(plan: GrindPlan): 1 | -1 {
  if (plan.handrail?.rail.edge) return (-plan.far) as 1 | -1;
  const off = plan.lockCenter.z - BAR_Z;
  return Math.abs(off) > 12 ? (Math.sign(off) as 1 | -1) : ((plan.toeDir * plan.spec.dir) as 1 | -1);
}

/** Whether the shared flatground fall sprawls toward the slip side. */
export function sprawlsAway(plan: GrindPlan): boolean {
  return slipSide(plan) === plan.toeDir * plan.spec.dir;
}

/**
 * Degrees the ground tips something lying on it `s` along a handrail's
 * stairs, `reach` either side (down the way of travel, as BoardPose.fall):
 * along the steps' edges on the stairs, level on the landings.
 */
export function restFall(plan: GrindPlan, s: number, reach = 30): number {
  const ride = plan.handrail;
  if (!ride) return 0;
  const drop = ride.rail.rest(s - reach) - ride.rail.rest(s + reach);
  return (plan.spec.dir * Math.atan2(drop, 2 * reach) * 180) / Math.PI;
}

/** Physics y of the board's center lying on the ground `s` along the way of travel: the asphalt, or a handrail's steps. */
export function restY(plan: GrindPlan, s: number): number {
  return plan.handrail ? deckOn(plan.handrail.rail.rest(s)) : GROUND;
}

/**
 * The board after a slip: it squirts out from under the feet with a small
 * kick (enough to lift the hanging truck over the bar), drops to the
 * ground, settles flat, and skids on the way the shared fall physics sends it.
 * Under a handrail the ground is the steps, so it settles along them.
 */
export function slipBoard(u: number, plan: GrindPlan, at: GrindFrame): { center: V3; pose: BoardPose } {
  const fall = plan.fall ?? 'slam';
  const side = slipSide(plan);
  const c0 = at.center;
  const zEnd = BAR_Z + side * Math.max(FALL_CLEAR + 16, Math.abs(c0.z - BAR_Z) + 16);
  const kick = Math.sqrt(2 * GRAVITY * SLIP_KICK);
  const leave = BOARD_LEAVE[fall] * easeOutCubic(clamp01(u / 0.8));
  // Along the way of travel, where it slipped and where it is now.
  const from = plan.handrail ? railTrack(plan, at.t) : 0;
  const along = plan.handrail ? railTrack(plan, at.t + u) + leave : 0;
  const drop = restY(plan, from) - c0.y;
  // Seconds until the board meets the ground.
  const down = (kick + Math.sqrt(kick * kick + 2 * GRAVITY * drop)) / GRAVITY;
  const y = Math.min(restY(plan, along), c0.y - kick * u + 0.5 * GRAVITY * u * u);
  const flat = smoothstep(u / down);
  return {
    center: {
      x: X0 + plan.spec.dir * leave,
      y,
      z: mix(c0.z, zEnd, smoothstep(u / 0.35)),
    },
    pose: {
      yaw: at.pose.yaw - plan.spec.dir * side * 28 * easeOutCubic(clamp01(u / 0.8)),
      pitch: at.pose.pitch * (1 - flat),
      roll: at.pose.roll * (1 - flat),
      ...(plan.handrail ? { fall: mix(at.pose.fall ?? 0, restFall(plan, along), flat) } : null),
    },
  };
}

/**
 * Down a handrail: the height of the board's center over its rolling height
 * on the top landing (up positive) along the planned path, without the
 * balance sway or the pops' snaps — up off the top landing, down the rail,
 * off the bottom onto the landing. After a slip it comes down onto the steps.
 */
export function handrailHeight(plan: GrindPlan, time: number): number {
  const ride = plan.handrail;
  if (!ride) return 0;
  const t = Math.max(0, time);
  const air = (from: number, launch: number, tau: number) => from + launch * tau - 0.5 * GRAVITY * tau * tau;
  const planned = (at: number) => {
    if (at <= plan.pop) return 0;
    if (at < plan.lockAt) return air(0, Math.sqrt(2 * GRAVITY * plan.apex), at - plan.pop);
    if (at < plan.off) return plan.lockRise - ride.rail.slope * (railTrack(plan, at) - ride.lockS);
    if (at < plan.land) return GROUND - plan.landY + air(plan.offRise, plan.offLaunch, at - plan.off);
    return GROUND - plan.landY;
  };
  if (plan.fail == null || t <= plan.fail) return planned(t);
  const from = planned(plan.fail);
  const ground = GROUND - restY(plan, railTrack(plan, t));
  return Math.max(ground, air(from, 0, t - plan.fail));
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
