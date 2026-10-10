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
  computeFrame,
  specFor,
  type FallVariant,
} from './trick';
import { WHEEL_BOTTOM, WHEEL_HALF_W, WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../board/board';
import { BOTTOM_LOCAL, TIP_X } from '../board/deck';
import { POP_RISE, solveRig } from './rig';
import { FOLLOW_POP } from '../camera/camera';
import {
  CROUCH_START,
  DECK_HALF_WIDTH,
  LAND_OMEGA,
  LAND_ZETA,
  PERSON_SCALE,
  POP_HEIGHT,
  SHIN,
  THIGH,
  RIDE_HEIGHT,
  SQUAT_FLOOR,
  TOUCHDOWN_HEIGHT,
  cruiseBob,
  hermite,
  softFloor,
} from './skeleton';
import { add3, clamp01, dot3, easeOutCubic, norm3, rotX, rotY, rotZ, scale3, smoothstep, sub3, type V3 } from '../math';
import {
  NO_SPIN,
  hopClock,
  hopFrame,
  hopMid,
  hopRate,
  landingOnRail,
  poppingOff,
  railSpinFor,
  railSpinShare,
  settledHeading,
  settledSpin,
  thenSpin,
  wrapSpin,
  type HopFrame,
  type HopPlan,
  type RailSpin,
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
/** Most of a spin onto the bar (a share) left for the bar to finish, however much it would let pivot (GrindSpec.railFinish). */
const SPIN_LEFT_MAX = 0.3;
/** Seconds before the pop off that a rider starts turning into a spin out. */
const SPIN_OUT_LEAD = 0.18;
/** How far the board rises popping off the end, and how far its wheels
 *  must then clear the bar's top (a dipped truck has further to come up). */
const OFF_POP = 12;
const OFF_CLEAR = 6;
/** Share of a trick's extra lift (see HopTrick) the pop off adds: it starts up on the bar. */
const EXIT_LIFT = 0.85;
/** The pop out: seconds the board takes to snap onto its tail. */
const SNAP = 0.07;
/**
 * Pop angles (degrees) off the ground and off the bar. Flatground snaps the
 * tail to 60 degrees; a hop onto a bar this low takes a little less.
 */
const FLAT_POP = 60;
const POP_IN = 44;
/**
 * A tre-style scoop strikes the tail before the board leaves the ground: the
 * tail is driven down to the snap over SCOOP_STRIKE seconds, the board
 * pivoting up off it, while the hop's flight is held back by up to SCOOP_HOLD
 * and caught up by twice that, so the board springs off the ground as the
 * tail strikes and keeps rising. Snapping it in half the time, with the flight
 * already rising, threw the whole board up in a frame and left it hanging: a
 * bounce, not a scoop.
 */
const SCOOP_STRIKE = 0.04;
const SCOOP_HOLD = 0.03;
const POP_OUT = 24;
const SLIDE_POP_OUT = 10;
/** Off one truck with the board already tipped toward the end it pops (a 5-0 off its tail), the snap levers on this much further. */
const TRUCK_POP_LEVER = 8;

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

/** A tre-style entry (a flip with a 360 shuv, no body spin): its pop is a scoop off the tail. */
const scoops = (entry: HopPlan | null) => entry != null && entry.trick.spec.flips === 1 && entry.trick.spec.yaw === 360 && entry.trick.spec.bodyYaw === 0;

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
  /** The pipe's radius. */
  radius: number;
  /**
   * Height of the ground at s: the top landing, the steps, the bottom landing.
   * Where it changes across the line too (a ledge across a gap), `z` is how far
   * across from the rail, toward the camera; a stair set's ignores it.
   */
  ground: (s: number, z?: number) => number;
  /** What a body lying on the steps rests on at s (and `z` across): the line of their edges, and the landings. */
  rest: (s: number, z?: number) => number;
  /** How fast a skater rolls in to it, world units a second. */
  speed: number;
  /**
   * The rail stands at the edge of the stairs (a side rail): past its far
   * side is a wall or a bank, not steps, so a slip falls back to the side
   * the grind came in from.
   */
  edge?: boolean;
  /**
   * A ledge reached across a gap rather than a rail beside the stairs (Miami's
   * granite triangle, off its terrace): the pop is fixed where the takeoff is,
   * `s` along the rail's line (short of its start) and at least `off` out from
   * it on the side the grind comes in from. The hop over the gap is the least
   * that brings the board's center down onto the rail `lock` past its start;
   * a higher popper or a trick in pops higher and comes down further along.
   */
  takeoff?: { s: number; off: number; lock: number };
  /**
   * The rail is a ledge's edge (Miami's slab): behind it, on the far side of
   * the approach, its top face falls away `fall` per unit across. A lock
   * can't hang through it: what it hangs over that side rests on it instead.
   */
  ledge?: { fall: number };
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
/** Share of a trick's hang time (HopTrick.lift) that a trick into a handrail adds over the rail; across a gap, to a ledge. */
const RAIL_TRICK_LIFT = 0.5;
const GAP_TRICK_LIFT = 0.35;
/**
 * Hopping on, the board keeps its center this far off the rail or bar (its
 * wheels clear of the pipe) until it's up over its line. A spin in swings the
 * deck's ends round, and a board angled in points its nose at the rail: both
 * keep their ends as far off.
 */
const RAIL_BESIDE = 15;
/**
 * The rider's legs keep off it too, the biggest who rides (a person: the
 * robot's legs grown PERSON_SCALE over the same feet), as thick as a person's
 * legs in jeans: thigh and shin radii. The robot, smaller, clears it by more.
 */
const LEG_THIGH = 8;
const LEG_SHIN = 6.5;
/** Air left between a leg and the rail going past it: the jeans don't brush it, whoever's in them. */
const LEG_AIR = 4;
/** How far a person's knees turn from the rig's toward the way they face: over the toes (riders/realistic/skaterPose.ts KNEE_FORWARD). */
const KNEE_TOWARD_TOES = 0.75;
/** Points along each bone, hip to knee and knee to ankle, checked against the rail. */
const LEG_POINTS = [0, 0.25, 0.5, 0.75, 1] as const;
/** The steepest line (degrees off the rail's) the solver lets an angled-in deck's reach assume. */
const APPROACH_MAX = 32;
/** An easy line in (degrees), and how much higher (world units) a skater pops to keep to it. */
const APPROACH_EASY = 6;
const APPROACH_LIFT = 16;
/** No higher than this an ollie onto it (world units, the board's rise), a slide a little higher: modest, as skaters pop onto rails. */
const APPROACH_APEX = 2.2 * 29;
const APPROACH_APEX_SLIDE = 2.6 * 29;
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

/** Board-local points a lock over a ledge's top must keep out of it: the deck's underside and the wheels' rims. */
const LEDGE_POINTS: V3[] = (() => {
  const pts: V3[] = [...BOTTOM_LOCAL];
  for (const x of [-WHEEL_X, WHEEL_X]) for (const z of [-WHEEL_Z - WHEEL_HALF_W, -WHEEL_Z + WHEEL_HALF_W, WHEEL_Z - WHEEL_HALF_W, WHEEL_Z + WHEEL_HALF_W]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      pts.push({ x: x + WHEEL_R * Math.cos(a), y: WHEEL_Y + WHEEL_R * Math.sin(a), z });
    }
  }
  return pts;
})();
/** How far a part resting on a ledge's top may sit in it (world units): touching, not through. */
const LEDGE_TOUCH = 0.3;
/** The most a lock tips up off a ledge's top, each way (degrees). */
const LEDGE_TIP_MAX = 45;

/**
 * A lock over a ledge's top (Miami's slab, falling away behind the edge),
 * `far` being the side it's on: whatever the pose hangs over that side
 * can't go through the top, so the board tips up off it, about what rides
 * the edge, by as little pitch and roll as lets every part clear. A
 * feeble's front wheels come to rest on the top, as on any ledge; a
 * boardslide's far truck lifts its end. Seated mid-ledge, where it's the
 * same all along.
 */
function ledgeLock(pose: BoardPose, spec: GrindSpec, rail: Handrail, far: 1 | -1): BoardPose {
  if (!rail.ledge) return pose;
  const s = (rail.start + rail.end) / 2;
  const tilt = pose.fall ?? 0;
  const into = (p: BoardPose) => ledgeDepth(onRail(p, spec.contact, rail, tilt, spec.dir, s), p, rail, far, s, spec.dir);
  if (into(pose) <= LEDGE_TOUCH) return pose;
  // Out in rings of pitch and roll, the least tip that clears.
  for (let ring = 1; ring <= LEDGE_TIP_MAX; ring++) {
    let best: BoardPose | null = null;
    let least = Infinity;
    for (let dp = -ring; dp <= ring; dp++) for (let dr = -ring; dr <= ring; dr++) {
      if (Math.max(Math.abs(dp), Math.abs(dr)) !== ring || dp * dp + dr * dr >= least) continue;
      const tipped = { ...pose, pitch: pose.pitch + dp, roll: pose.roll + dr };
      if (into(tipped) <= LEDGE_TOUCH) {
        best = tipped;
        least = dp * dp + dr * dr;
      }
    }
    if (best) return best;
  }
  return pose;
}

/**
 * How deep (world units) the board, its center at `center` in `pose` with the
 * rider `s` along the rail, goes into a ledge's top on the `far` side: as far
 * as the lowest of LEDGE_POINTS over there is under it (negative, clear).
 */
function ledgeDepth(center: V3, pose: BoardPose, rail: Handrail, far: 1 | -1, s: number, dir: 1 | -1): number {
  const fall = rail.ledge?.fall ?? 0;
  const attitude = poseDir(pose);
  let worst = -Infinity;
  for (const local of LEDGE_POINTS) {
    const q = add3(center, attitude(local));
    const across = far * (q.z - BAR_Z);
    if (across <= 0) continue;
    worst = Math.max(worst, q.y - (railTopY(rail, s + dir * (q.x - X0)) + fall * across));
  }
  return worst;
}

/**
 * Popping off a ledge, the snap off the lock (`popOut`, pitch) stops where
 * whatever it drives down meets the ledge's top, as a tail strikes it: no
 * further than the board stays out of it.
 */
function ledgePopOut(lock: BoardPose, popOut: number, spec: GrindSpec, rail: Handrail, far: 1 | -1): number {
  if (!rail.ledge) return popOut;
  const s = (rail.start + rail.end) / 2;
  const seat = onRail(lock, spec.contact, rail, lock.fall ?? 0, spec.dir, s);
  for (let k = 20; k > 0; k--) {
    const extra = ((popOut - lock.pitch) * k) / 20;
    const snap = snapped(seat, lock, extra, spec.pivot);
    if (ledgeDepth(snap.center, snap.pose, rail, far, s, spec.dir) <= LEDGE_TOUCH) return lock.pitch + extra;
  }
  return lock.pitch;
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
function rideFor(rail: Handrail, spec: GrindSpec, lock: BoardPose, style: SkateStyle, lift: number, across: number, turn: number, extra = 0) {
  const fall = Math.atan(rail.slope);
  const tilt = (spec.dir * fall * 180) / Math.PI;
  const friction = spec.slide ? SLIDE_FRICTION : GRIND_FRICTION;
  // Along the rail: gravity down it, less the rail's friction.
  const along = Math.max(0, GRAVITY * (Math.sin(fall) - friction * Math.cos(fall)));
  const accel = along * Math.cos(fall);
  const lean = Math.atan2(along * Math.cos(fall), GRAVITY - along * Math.sin(fall));
  const { speed } = rail;

  const popS = rail.takeoff?.s ?? rail.start - RAIL_POP_BEFORE;
  const under = GROUND - onRail(lock, spec.contact, rail, tilt, spec.dir, popS).y;
  // Across a gap the board comes down onto the rail the takeoff's `lock` past its start, where the
  // seat is `seat` over the deck. Rolling in at the rail's speed that's the least hop; a higher
  // popper or a trick in rises further over it, rolling in that much slower to come down in the
  // same place, the edge being short. The gap's hop already hangs longer than a flatground trick,
  // so a trick in asks for about a third less lift than onto a rail. Nothing is under the board until the
  // rail starts, so it turns in from the top of the arc.
  if (rail.takeoff) {
    const lockS = rail.start + rail.takeoff.lock;
    const seat = under - rail.slope * (lockS - popS);
    const leastT = (lockS - popS) / speed;
    const least = (seat + 0.5 * GRAVITY * leastT * leastT) / leastT;
    const more = Math.max(0, 0.5 * APEX_STYLE * (style.popHeight - 1)) + GAP_TRICK_LIFT * lift + (spinsIn(spec) ? RAIL_SPIN_ROOM : 0) + extra;
    const launch = Math.sqrt(least * least + 2 * GRAVITY * more);
    const upT = (launch + Math.sqrt(Math.max(0, launch * launch - 2 * GRAVITY * seat))) / GRAVITY;
    const ride = railRide(rail, spec, tilt, accel, lean, popS, lockS, launch / GRAVITY / upT, (lockS - popS) / upT);
    return { ride, upT, apex: (launch * launch) / (2 * GRAVITY) };
  }
  // How far a level board's wheels sit over where the lock seats its center.
  const wheels = Math.max(0, onRail(lock, spec.contact, rail, tilt, spec.dir, popS).y - onRail({ yaw: 0, pitch: 0, roll: 0 }, WHEELS_DOWN, rail, tilt, spec.dir, popS).y);
  const base = Math.max(2, RAIL_CLEAR + 0.5 * APEX_STYLE * (style.popHeight - 1) + RAIL_TRICK_LIFT * lift + (spinsIn(spec) ? RAIL_SPIN_ROOM : 0)) + extra;
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
  const ride = railRide(rail, spec, tilt, accel, lean, popS, popS + speed * upT, h.over);
  // The pop itself, off the top landing: the speed over the falling line, less the line's fall.
  const pop = launch - rail.slope * speed;
  return { ride, upT, apex: (pop * pop) / (2 * GRAVITY) };
}

/** The ride down a handrail from the lock at `lockS` to the pop off its end, rolling in at `speed` and speeding up down it. */
function railRide(rail: Handrail, spec: GrindSpec, tilt: number, accel: number, lean: number, popS: number, lockS: number, over: number, speed = rail.speed): HandrailRide {
  const offS = rail.end - END_MARGIN;
  const length = offS - lockS;
  const grindT = accel > 0 ? (Math.sqrt(speed * speed + 2 * accel * length) - speed) / accel : length / speed;
  return {
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
    over,
  };
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

/**
 * How fast (world units a second, along the way of travel) the board is
 * carried at a clock time: the street's speed past a flat bar; down a
 * handrail, rolling in, speeding up down it and off the bottom — or as fast
 * as it was going when it slipped.
 */
export function grindSpeed(plan: GrindPlan, time: number): number {
  const ride = plan.handrail;
  if (!ride) return travel(1);
  return riding(plan, ride, plan.fail == null ? time : Math.min(time, plan.fail)).speed;
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
  /** Degrees of roll the lock tips up off a ledge's top (ledgeLock), let go of as the board snaps off it; 0 elsewhere. */
  ledgeRoll: number;
  /** Board pitch at the instant it leaves the bar. */
  popOut: number;
  popIn: number;
  /** Seconds the entry takes to snap the board up from the ground. */
  popInRise: number;
  /** Flatground seconds per second of the hops, for the tricks popped into and out of the grind. */
  entryRate: number;
  exitRate: number;
  /** A body spin onto the bar: at one speed through the hop, the bar finishing it (RailSpin); null without one. */
  spinIn: RailSpin | null;
  /** Share of that spin still to go as the board touches down. */
  spinLeft: number;
  /** The board's center at touchdown, off where the lock seats it: short of its turn, it pivots on what rides the bar. */
  touchdown: V3;
  /**
   * A body spin out: the rider starts turning into it `lead` seconds before the
   * pop off, `angle` degrees of it by the pop, coming up to the spin's speed.
   */
  spinOut: { angle: number; lead: number } | null;
  /** Board center z rolling in. */
  /** Where the board's center is across (z) at the pop. */
  laneZ: number;
  /**
   * The approach: the board's sideways speed toward the bar (world units a
   * second in z), the same from the roll in through the hop until it locks,
   * and the heading (deg) that angles it and the rider along that line.
   */
  approachSpeed: number;
  approachYaw: number;
  /** How much higher (world units) the hop on pops than it needs to, for an easier line in. */
  approachLift: number;
  /** The carve onto the line in, as a share of its full time: tighter for a steep line close to the bar (carveTightness). */
  carveTight: number;
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
  // Down a handrail the lock tips with the rail, and the grind takes as long as the rail is. Over a
  // ledge's top it rests on it rather than hanging through it.
  const tipped: BoardPose = rail ? { ...level, fall: (spec.dir * Math.atan(rail.slope) * 180) / Math.PI } : level;
  const lock = rail?.ledge ? ledgeLock(tipped, spec, rail, far) : tipped;
  // A body spin onto the bar touches down as far short of its lock as what rides the bar lets it pivot there.
  const spinLeft = entry && entry.trick.spec.bodyYaw ? Math.min(SPIN_LEFT_MAX, spec.railFinish / Math.max(1, Math.abs(level.yaw))) : 0;
  // How far the board steps across a handrail onto its lock: from beside it to as far past it as the lock sits.
  const across = rail ? RAIL_BESIDE + far * (onBar(level, spec.contact).z - BAR_Z) : 0;
  // The hop on and the line in, for `extra` more height over the rail. A skater would rather pop a
  // little higher than cut in hard: they pop higher, up to APPROACH_LIFT, while the trick lets the
  // angle come down to APPROACH_EASY. A plain grind comes in nearly along the rail; a spin in or a
  // lock across it keeps its angle, the room it needs being across, not up.
  const hopOn = (extra: number) => {
    // A trick in that turns the deck carries the lock's turn round with it (turnShare): no extra time for it over the rail.
    const railed = rail ? rideFor(rail, spec, lock, style, spec.entry?.lift ?? 0, across, spinsIn(spec) ? 0 : level.yaw - heading, extra) : null;
    const lockCenter = railed ? onRail(lock, spec.contact, railed.ride.rail, railed.ride.tilt, spec.dir, railed.ride.lockS) : onBar(lock, spec.contact);
    const lockRise = GROUND - lockCenter.y;
    const apex = railed?.apex ?? Math.max(APEX + APEX_STYLE * (style.popHeight - 1) + (spec.entry?.lift ?? 0), APEX_MIN, lockRise + 12) + extra;
    const upT = railed?.upT ?? Math.sqrt((2 * apex) / GRAVITY) + Math.sqrt((2 * (apex - lockRise)) / GRAVITY);
    const rate = entry ? hopRate(entry, upT) : 1;
    const spin = spinLeft > 0 ? railSpinFor(upT, spinLeft) : null;
    // What's beside the rider through the hop, `along` ahead of the board's center: the rail (or
    // the bar, which starts just short of the lock) as its axis's physics y and its radius.
    const beside = (tau: number, along: number): { y: number; radius: number } | null => {
      if (railed) {
        const { rail, popS, speed } = railed.ride;
        const s = popS + speed * tau + along;
        if (s < rail.start || s > rail.end) return null;
        return { y: railTopY(rail, s) + rail.radius * Math.hypot(1, rail.slope), radius: rail.radius };
      }
      return along < travel(upT - tau) - LOCK_MARGIN ? null : { y: BAR_TOP_Y + BAR_HALF, radius: BAR_HALF };
    };
    const board = boardReach(entry, rate, spin, upT, level.yaw - heading, heading, (spec.dir === 1) === spec.popNose);
    const legs = legReach(spec, entry, rate, spin, upT, apex, mechanics, style, far, beside);
    const approach = approachLine(
      -far * (lockCenter.z - BAR_Z), upT, railed ? railed.ride.over : underBarShare(apex, upT),
      (s, angle) => Math.max(board(s, angle), legs(s, angle)),
      railed ? railed.ride.speed : travel(1),
      rail?.takeoff?.off ?? 0,
    );
    return { railed, lockCenter, lockRise, apex, upT, approach, spin };
  };
  // A trick in pops at least as high as the plain grind would. Across a gap the takeoff sets the
  // line in, so popping higher wouldn't ease it.
  const plainLift = spec.entry ? planGrind({ ...spec, entry: null }, mechanics, style, landed, fall, rail).approachLift : 0;
  let approachLift = plainLift;
  let on = hopOn(approachLift);
  const highest = (spec.slide ? APPROACH_APEX_SLIDE : APPROACH_APEX) + (spec.entry?.lift ?? 0);
  for (let extra = approachLift + 2; !rail?.takeoff && on.approach.angle > APPROACH_EASY && extra <= APPROACH_LIFT; extra += 2) {
    const higher = hopOn(extra);
    if (higher.approach.angle >= on.approach.angle - 0.5 || higher.apex > highest) break;
    on = higher;
    approachLift = extra;
  }
  const { railed, lockCenter, lockRise, apex, upT, approach, spin: spinIn } = on;
  const ride = railed ? railed.ride : null;
  const approachYaw = -spec.dir * far * approach.angle;
  // Touching down short of its turn, the board seats what rides the bar where the lock will, turned
  // that much less: it pivots on it into the lock.
  const left = spinIn ? 1 - railSpinShare(upT, spinIn) : 0;
  const seat = (pose: BoardPose) => (ride ? onRail(pose, spec.contact, ride.rail, ride.tilt, spec.dir, ride.lockS) : onBar(pose, spec.contact));
  const touchdown = sub3(seat({ ...lock, yaw: lock.yaw + (approachYaw - lock.yaw) * left }), seat(lock));
  // Off the trucks the board pops to a set angle, or further than the lock
  // already tips it that way (a 5-0's tail snaps down from where it rides);
  // a slide levers off the bar from whatever angle it was sliding at.
  const popEnd = spec.exitNose ? 1 : -1;
  const snapOut = spec.slide
    ? lock.pitch + popEnd * SLIDE_POP_OUT
    : popEnd * Math.max(POP_OUT, popEnd * lock.pitch + TRUCK_POP_LEVER);
  const popOut = rail?.ledge ? ledgePopOut(lock, snapOut, spec, rail, far) : snapOut;
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
  // with it, and comes down on the ground under where it lands. That's past
  // the rail's end, which can stand over the last step rather than the
  // landing (Hollywood's): so the landing height comes from the flight, and the
  // flight from the landing height, settled in two passes.
  const offLaunch = ride ? v1 - ride.rail.slope * ride.offSpeed : v1;
  const offFrom = ride ? onRail(lock, spec.contact, ride.rail, ride.tilt, spec.dir, ride.offS).y : 0;
  const flightTo = (y: number) => (offLaunch + Math.sqrt(offLaunch * offLaunch + 2 * GRAVITY * (y - offFrom))) / GRAVITY;
  let landY = ride ? deckOn(ride.rail.ground(ride.rail.end)) : GROUND;
  if (ride) for (let pass = 0; pass < 2; pass++) landY = deckOn(ride.rail.ground(ride.offS + ride.offSpeed * flightTo(landY)));
  const offRise = ride ? landY - offFrom : lockRise;
  const offT = (offLaunch + Math.sqrt(offLaunch * offLaunch + 2 * GRAVITY * offRise)) / GRAVITY;
  const land = off + offT;
  const exitRate = exit ? hopRate(exit, offT, true) : 1;
  // A spin out turns at one speed from the pop (the flatground trick's), and the rider comes up to it on the bar:
  // easing into the turn so they're turning at that speed by the pop, `angle` round by then.
  const exitTurn = exit ? settledHeading(exit) : 0;
  const k = (exitRate * SPIN_OUT_LEAD) / (2 * FLIP_T);
  const spinOut = exitTurn ? { angle: (exitTurn * k) / (1 + k), lead: SPIN_OUT_LEAD } : null;
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
    ledgeRoll: lock.roll - tipped.roll,
    popOut,
    popIn: (spec.popNose ? 1 : -1) * POP_IN,
    popInRise: scoops(entry) ? SCOOP_STRIKE : POP_RISE,
    entryRate: entry ? hopRate(entry, upT) : 1,
    exitRate,
    spinIn,
    spinLeft: left,
    touchdown,
    spinOut,
    approachLift,
    carveTight: carveTightness(approach.popOff, approach.across),
    laneZ: BAR_Z - far * approach.popOff,
    approachSpeed: far * approach.across,
    approachYaw,
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
  const spec = grindSpecFor(trick, { ledge: rail?.ledge != null });
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
  /** Degrees of `heading` that are the approach's angle in (plan.approachYaw), unwinding into the lock. */
  approach: number;
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
 * Rolling in: the rider carves onto the angled line over CARVE seconds,
 * settled on it SETTLED before the pop. A long, easy carve, begun several feet
 * before the pop (for a plain grind, as the attempt starts): turned in late
 * and quickly, the board swings round under the rider like a revert.
 */
const CARVE = 0.55;
const SETTLED = 0.15;
/** The furthest off the bar (world units, about 6 ft) a roll-in starts, and the tightest a carve gets (share of its time). */
const START_MAX = 180;
const CARVE_TIGHTEST = 0.5;
/** Coming down onto the lock, the board keeps this much higher per unit it still has to go sideways. */
const LOCK_SETTLE = 2;

/**
 * Carving onto the line in, at time `t` before the pop at `pop`: how far
 * (seconds at the line's sideways speed) the board still has to go across
 * to where it pops, and how far into the carve it is (0 straight, 1 on the
 * line). The sideways speed builds smoothly through the carve.
 */
export function carve(t: number, pop: number, tight = 1): { across: number; share: number } {
  const settled = SETTLED * tight, carving = CARVE * tight;
  const from = pop - settled - carving;
  const x = clamp01((t - from) / carving);
  // Seconds of full sideways speed still to come: the settled stretch, plus what's left of the carve.
  const across = Math.max(0, Math.min(settled, pop - t)) + carving * (0.5 - (x * x * x - (x * x * x * x) / 2));
  return { across, share: smoothstep(x) };
}

/**
 * How much tighter (shorter, later) the carve onto a steep line is, so it starts no further
 * than START_MAX off the bar: a skater lining up a hard angle close to a rail carves in sharply.
 */
function carveTightness(popOff: number, across: number): number {
  const reach = across * (SETTLED + CARVE / 2);
  return reach <= 1e-6 ? 1 : Math.max(CARVE_TIGHTEST, Math.min(1, (START_MAX - popOff) / reach));
}

/**
 * The line a grind rolls in on. Nothing pushes a skater sideways once they're
 * in the air, so the board crosses to the rail on the sideways speed it had
 * at the pop: that comes from the approach. A skater rolls in at an angle to
 * the rail and pops as close to it as the trick lets them: close enough to
 * come in nearly along it (a 50-50 hardly angles in), but far enough that the
 * board keeps clear of the rail until it's up over its line. A spin in swings
 * the deck's ends out as it comes round, so it pops further off and comes in
 * at more of an angle (a 360 flip into a blunt cuts in hard); so does a lock
 * across the rail (blunts, slides), the board having further to go.
 *
 * `lock`: where the board's center locks, off the rail's line on the side it
 * comes in from (negative past it). `over`: the share of the hop spent under
 * the rail's line. `reach(s, angle)`: how far off the line the board's center
 * must keep `s` through the hop, angled in by `angle` degrees. `speed`: the
 * rolling speed. `least`: how far off it the takeoff is, across a gap.
 * Returns how far off the line it pops (`popOff`), how fast it
 * closes in (`across`, world units a second), and the angle it comes in at.
 */
function approachLine(lock: number, upT: number, over: number, reach: (s: number, angle: number) => number, speed: number, least = 0) {
  let angle = 0;
  let popOff = RAIL_BESIDE;
  for (let pass = 0; pass < 4; pass++) {
    popOff = Math.max(RAIL_BESIDE, lock + 1, least);
    for (let k = 0; k <= 40; k++) {
      const s = (k / 40) * over;
      popOff = Math.max(popOff, (reach(s, angle) - lock * s) / (1 - s));
    }
    angle = Math.min(APPROACH_MAX, (Math.atan2(popOff - lock, upT * speed) * 180) / Math.PI);
  }
  const across = (popOff - lock) / upT;
  return { popOff, across, angle: (Math.atan2(across, speed) * 180) / Math.PI };
}

/**
 * How far off the rail's line the board's center keeps `s` through the hop
 * onto it, for the trick popped onto it, angled in by `angle` degrees: a
 * plain ollie RAIL_BESIDE; a deck turned across the line (a spin coming
 * round) reaches its nose or tail that much further.
 */
function boardReach(entry: HopPlan | null, entryRate: number, spin: RailSpin | null, upT: number, turn: number, settled: number, lowEndLeads: boolean) {
  return (s: number, angle: number) => {
    // Angled in, the leading end points at the rail. Popped off the trailing end (an ollie) it's
    // up and clear; popped off the leading end (a nollie, a fakie ollie) it's the low one, and
    // reaches toward the rail. A deck turned
    // across by a spin swings an end over toward it too, the angle adding to its turn.
    // The popped end is only low through the snap; the board levels out after it.
    let yaw = lowEndLeads ? angle * (1 - smoothstep((s * upT - POP_RISE) / POP_RISE)) : 0;
    if (entry && (entry.trick.spec.yaw !== 0 || entry.trick.spec.bodyYaw !== 0)) {
      const hop = hopFrame(entry, hopClock(s * upT, entryRate), spunIn(spin, s * upT));
      yaw = angle + hop.heading + hop.spin.yaw + turn * (turnShare(entry, settled, hop) ?? 0);
    }
    const a = (yaw * Math.PI) / 180;
    return TIP_X * Math.abs(Math.sin(a)) + HALF_WIDTH * Math.abs(Math.cos(a)) + RAIL_BESIDE - HALF_WIDTH;
  };
}

/**
 * How far off the rail's (or bar's) line the board's center keeps `s` through
 * the hop on, angled in by `angle` degrees, so the rider's legs clear it as
 * well as the board: a pop starts with the knees, and a flip's flicking foot,
 * out over the side of the board and below the rail's top. Every point of the
 * legs still too low to pass over the rail stands off it by the rail's radius
 * and the leg's thickness. The legs are the hop's own flatground rig (what the
 * grind wears until it hands over to the lock), grown to a person's, the board
 * rising as the hop rises; `beside(tau, along)` is the rail's axis and radius
 * `along` ahead of the board's center `tau` into the hop, or null where there's
 * none. `far` is the rail's side.
 */
function legReach(
  spec: GrindSpec,
  entry: HopPlan | null,
  rate: number,
  spin: RailSpin | null,
  upT: number,
  apex: number,
  mechanics: RiderMechanics,
  style: SkateStyle,
  far: 1 | -1,
  beside: (tau: number, along: number) => { y: number; radius: number } | null,
) {
  const hopSpec = entry?.trick.spec ?? specFor({ id: 'ollie', name: 'Ollie', base: 'Ollie', stance: spec.stance });
  const v0 = Math.sqrt(2 * GRAVITY * apex);
  // The legs at each moment asked about, off the board's center (physics axes; the board's height
  // added when it's asked): the angle turns them, the rail's height doesn't depend on it.
  const known = new Map<number, { p: V3; radius: number }[]>();
  const legsAt = (tau: number) => {
    const cached = known.get(tau);
    if (cached) return cached;
    const f = landingOnRail(computeFrame(hopClock(tau, rate), hopSpec, true, 'slam', 0.65, style), hopSpec, spunIn(spin, tau));
    const rig = solveRig(f, hopSpec, mechanics, style, 'landed');
    const points: { p: V3; radius: number }[] = [];
    // A person on this rig, as riders/human/humanRig.ts grows them: hips up from between the
    // ankles, pulled in toward the feet where a leg can't reach its ankle.
    const at = (p: V3): V3 => ({ x: p.x - f.board.x, y: p.y - f.board.y, z: p.z });
    const [l0, l1] = rig.legs;
    const feet = scale3(add3(at(l0.ankle), at(l1.ankle)), 0.5);
    const a = THIGH * PERSON_SCALE, b = SHIN * PERSON_SCALE;
    let shift: V3 = { x: 0, y: 0, z: 0 };
    for (let pass = 0; pass < 2; pass++) {
      for (const leg of rig.legs) {
        const d = sub3(at(leg.ankle), add3(add3(feet, scale3(sub3(at(leg.hip), feet), PERSON_SCALE)), shift));
        const len = Math.hypot(d.x, d.y, d.z);
        if (len > (a + b) * 0.995) shift = add3(shift, scale3(d, (len - (a + b) * 0.995) / len));
      }
    }
    for (const leg of rig.legs) {
      const ankle = at(leg.ankle);
      const hip = add3(add3(feet, scale3(sub3(at(leg.hip), feet), PERSON_SCALE)), shift);
      const down = norm3(sub3(ankle, hip));
      const offAxis = (v: V3) => sub3(v, scale3(down, dot3(v, down)));
      const d = Math.min(a + b - 1e-3, Math.hypot(ankle.x - hip.x, ankle.y - hip.y, ankle.z - hip.z));
      const along = (a * a - b * b + d * d) / (2 * d);
      const out = Math.sqrt(Math.max(0, a * a - along * along));
      // The knee bent the rig's way, and turned toward the toes as the realistic skater wears it: both kept clear.
      const bent = norm3(offAxis(sub3(at(leg.knee), at(leg.hip))));
      const toes = norm3(add3(scale3(bent, 1 - KNEE_TOWARD_TOES), scale3(norm3(offAxis(rig.torso.fwd)), KNEE_TOWARD_TOES)));
      for (const pole of [bent, toes]) {
        const knee = add3(add3(hip, scale3(down, along)), scale3(pole, out));
        for (const k of LEG_POINTS) {
          points.push({ p: add3(hip, scale3(sub3(knee, hip), k)), radius: LEG_THIGH });
          points.push({ p: add3(knee, scale3(sub3(ankle, knee), k)), radius: LEG_SHIN });
        }
      }
    }
    known.set(tau, points);
    return points;
  };
  return (s: number, angle: number) => {
    const tau = s * upT;
    const flown = scoops(entry) ? Math.max(0, tau - SCOOP_HOLD * (1 - smoothstep(tau / (2 * SCOOP_HOLD)))) : tau;
    const boardY = GROUND - (v0 * flown - 0.5 * GRAVITY * flown * flown);
    // Angled in, as the approach turns board and rider (approachYaw).
    const yaw = -spec.dir * far * angle;
    let reach = -Infinity;
    for (const { p, radius } of legsAt(tau)) {
      const q = rotY(p, yaw);
      const rail = beside(tau, spec.dir * q.x);
      if (!rail) continue;
      // How far over the rail's axis the point is (physics y is down), and the room it needs round it.
      const over = rail.y - (boardY + q.y);
      const room = rail.radius + radius + LEG_AIR;
      if (over >= room) continue;
      reach = Math.max(reach, far * q.z + (over <= 0 ? room : Math.sqrt(room * room - over * over)));
    }
    return reach;
  };
}

/** Share of a flat-bar hop spent with the wheels still under the bar's top: they cross its line only after. */
function underBarShare(apex: number, upT: number): number {
  const v0 = Math.sqrt(2 * GRAVITY * apex);
  const clear = Math.min(apex, BAR_TOP + WHEEL_BOTTOM + 3);
  return (v0 - Math.sqrt(Math.max(0, v0 * v0 - 2 * GRAVITY * clear))) / (GRAVITY * upT);
}

/** 0 → 1: how far round a body spin onto the bar has come `tau` seconds after the pop (railSpinShare); 1 without one. */
export const spunIn = (spin: RailSpin | null, tau: number) => (spin ? railSpinShare(tau, spin) : 1);

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
    approach: 0,
  };

  if (t < plan.pop) {
    const legs = loadAndPop(t, plan.pop, RIDE_HEIGHT + cruiseBob(t), ENTRY_SQUAT, onTakeoff, plan.pop - CROUCH_START - 0.14);
    // Rolling in, the rider carves onto the angled line and settles on it for the pop, board
    // and body pointed the way they're going.
    const { across, share } = carve(t, plan.pop, plan.carveTight);
    const yaw = plan.approachYaw * share;
    const center = { x: X0, y: GROUND, z: plan.laneZ - plan.approachSpeed * across };
    return {
      ...base,
      phase: 'approach',
      heading: yaw,
      approach: yaw,
      spin: NO_SPIN,
      center,
      ref: center,
      pose: { ...flat, yaw },
      noseFoot: popFeet[0],
      tailFoot: popFeet[1],
      overDeck: legs.overDeck,
      load: legs.load,
    };
  }

  if (t < plan.lockAt) {
    const tau = t - plan.pop;
    const s = tau / plan.upT;
    // A scoop holds the flight back while the tail strikes, then catches it up (SCOOP_STRIKE).
    const scoop = scoops(plan.entry);
    const flown = scoop ? Math.max(0, tau - SCOOP_HOLD * (1 - smoothstep(tau / (2 * SCOOP_HOLD)))) : tau;
    const rise = v0 * flown - 0.5 * GRAVITY * flown * flown;
    // The board rises clear of the bar's height before it's over the bar,
    // then turns into the trick as it comes down onto it. Beside a handrail
    // it waits until the rail has fallen away under its line, tipped to
    // match it, and then crosses over and turns in.
    const ramp = plan.entry ? ENTRY_LOCK_IN : LOCK_IN;
    const over = ride ? clamp01((s - ride.over) / (1 - ride.over)) : 0;
    const lockIn = ride ? smoothstep((over - 0.5) / 0.48) : smoothstep((s - ramp.from) / ramp.span);
    const trick = plan.entry ? hopFrame(plan.entry, hopClock(tau, plan.entryRate), spunIn(plan.spinIn, tau)) : null;
    // A spin in carries the board round into the lock with it: the lock's own turn comes on as the
    // spin does, so the board keeps turning one way, at one speed, down onto the bar, and the bar
    // finishes the turn (a 360 into a lipslide turns 270 or 450), rather than spinning round and
    // turning back, or stopping in the air. Without
    // one, over a handrail's line the board turns across it as it steps over; only dipping an end
    // below it waits until it's across.
    const turnIn = turnShare(plan.entry, plan.heading, trick)
      ?? (ride ? smoothstep((over - CROSS_FROM) / (CROSS_TO + 0.05 - CROSS_FROM)) : lockIn);
    const [noseFoot, tailFoot] = mixFeet(popFeet, spec.feet, smoothstep((s - 0.15) / 0.7));
    // Sideways, the board goes on at the speed the approach gave it: a straight line onto the lock.
    // Coming in across a bar, it settles onto it no sooner than it gets across: still above the
    // lock by as much as it has left to go sideways, so the far wheel clears the bar's top.
    const left = Math.abs(plan.approachSpeed) * Math.max(0, plan.upT - tau);
    const settle = LOCK_SETTLE * left * smoothstep((s - 0.7) / 0.25);
    // Still short of its turn as it comes down, it seats what rides the bar where the lock will.
    const ref = {
      x: X0,
      y: GROUND - rise - settle + plan.touchdown.y * lockIn,
      z: plan.laneZ + plan.approachSpeed * tau + plan.touchdown.z * lockIn,
    };
    // The pop turns the board about its middle, as on flatground: the tail
    // strike tips it up over the entry's snap and it levels off on flatground's
    // clock; a trick's own pitch comes straight from the flatground physics,
    // scaled to this pop.
    const strike = smoothstep(tau / plan.popInRise);
    let pop = strike * (trick ? (trick.flat.board.rot * POP_IN) / FLAT_POP : plan.popIn * (1 - smoothstep(tau / (0.3 * FLIP_T))));
    // A scoop drives the tail all the way down to the snap, whatever the trick's own
    // pitch has eased to by then, and hands over to it once the tail has struck.
    if (scoop && trick) {
      const handOver = smoothstep((tau - SCOOP_STRIKE) / SCOOP_STRIKE);
      pop = strike * plan.popIn * (1 - handOver) + pop * handOver;
    }
    // The rider's spin carries the board round; the lock's own turn comes on top. The angle the
    // approach came in at unwinds as the board turns into the lock, rider and all.
    const approach = plan.approachYaw * (1 - turnIn);
    const heading = (trick?.heading ?? 0) + approach;
    const board = {
      center: ref,
      pose: {
        // Hopping onto a handrail the board angles toward where it's heading across, until it turns into the lock.
        yaw: heading + (plan.lock.yaw - plan.heading) * turnIn,
        // The pop's own pitch gives way to the lock's as the board settles into it.
        pitch: plan.lock.pitch * lockIn + pop * (1 - lockIn),
        roll: plan.lock.roll * lockIn,
        ...(ride ? { fall: ride.tilt * smoothstep((s - ride.over + 0.2) / 0.35) } : null),
      },
    };
    // The tail strike pivots the board up off its tail: while the pop tips it,
    // seat its lowest point (a wheel, the tail) on the ground under the flight
    // until the hop lifts every part clear.
    if (trick && tau < POP_RISE) {
      board.center = { ...ref, y: Math.min(ref.y, GROUND + WHEEL_BOTTOM - entryBottom(board.pose, trick.spin)) };
    }
    return {
      ...base,
      phase: 'up',
      ...board,
      heading,
      approach,
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
    // The bar takes up what's left of a spin onto it, slowing it evenly to a stop: the board
    // pivots on what rides the bar into the lock.
    const spinning = plan.spinIn ? plan.spinLeft * (1 - Math.min(1, u / plan.spinIn.finishT)) ** 2 : 0;
    // Before a spin out the rider starts turning into it, up to its speed by the pop.
    const into = plan.spinOut ? plan.spinOut.angle * clamp01((t - (plan.off - plan.spinOut.lead)) / plan.spinOut.lead) ** 2 : 0;
    // Balance: a slow sway the board and arms share, faded in after the
    // lock-in and out before the pop.
    const settle = smoothstep(u / 0.3) * (1 - smoothstep((t - (plan.off - EXIT_CROUCH - 0.2)) / 0.2));
    const sway = Math.sin(u * Math.PI * 1.7 + 0.5) * settle;
    const oneTruck = spec.contact.at.x !== 0 && !spec.slide;
    // Snapping off a ledge, the board lets go of the roll that held it up off the top.
    const snapping = plan.ledgeRoll ? smoothstep((t - (plan.off - SNAP)) / SNAP) : 0;
    const held: BoardPose = {
      yaw: plan.lock.yaw + (spec.slide ? WOBBLE_SLIDE : WOBBLE_YAW) * sway + (plan.approachYaw - plan.lock.yaw) * spinning,
      pitch: plan.lock.pitch + (oneTruck ? WOBBLE_PITCH * sway : 0),
      roll: plan.lock.roll - plan.ledgeRoll * snapping,
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
      heading: plan.heading + (plan.approachYaw - plan.heading) * spinning + into,
      approach: plan.approachYaw * spinning,
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
    // 180 out carries rider and board round on top of that. The rider, already
    // turning into it on the bar, leads the board round until it catches up.
    const heading = plan.heading + (trick?.heading ?? 0);
    const lead = plan.spinOut && trick ? plan.spinOut.angle * (1 - trick.heading / (plan.endHeading - plan.heading)) : 0;
    const [noseFoot, tailFoot] = mixFeet(exitFeet, RIDE_FEET, smoothstep((s - 0.2) / 0.7));
    const ref = { x: X0, y: plan.landY - rise, z: plan.lockCenter.z };
    const board = snapped(
      ref,
      {
        yaw: heading + (plan.lock.yaw - plan.heading) * (1 - turnOut),
        pitch: plan.lock.pitch * (1 - level),
        roll: (plan.lock.roll - plan.ledgeRoll) * (1 - smoothstep(s / 0.5)),
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
        ? { heading: heading + lead, spin: thenSpin(base.spin, trick.spin), offDeck: trick.offDeck, flickOut: trick.flickOut }
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
 * Where across (z, in the grind's own frame) the board's center is on its
 * planned line at a clock time: carving in, crossing over in the hop, then on
 * the lock, and riding away from there.
 */
export function grindLane(plan: GrindPlan, time: number): number {
  if (time >= plan.lockAt) return plan.lockCenter.z;
  return time < plan.pop
    ? plan.laneZ - plan.approachSpeed * carve(time, plan.pop, plan.carveTight).across
    : plan.laneZ + plan.approachSpeed * (time - plan.pop);
}

/** Share of the board's sideways distance from its lock the crane follows on the way in. */
const CAMERA_TRACK = 0.6;

/**
 * The crane's sideways follow (world units, added to the camera's targetZ),
 * as the rider carves in on an angled line and hops across onto the bar: a
 * share of how far the board still is from where it locks; nothing once it's
 * on, so the grind itself is framed as it always was.
 */
export function grindCameraTrack(plan: GrindPlan, time: number): number {
  if (time >= plan.lockAt) return 0;
  const z = time < plan.pop
    ? plan.laneZ - plan.approachSpeed * carve(time, plan.pop, plan.carveTight).across
    : plan.laneZ + plan.approachSpeed * (time - plan.pop);
  return CAMERA_TRACK * (z - plan.lockCenter.z);
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
