import { add3, dot3, lerp3, norm3, rotY, rotZ, scale3, smoothstep, sub3, type V3 } from '../math';
import {
  LAND_OMEGA,
  LAND_ZETA,
  RIDE_HEIGHT,
  SHIN,
  SQUAT_FLOOR,
  THIGH,
  cruiseBob,
  frameOf,
  hermite,
  moveFrame,
  softFloor,
  type ArmRig,
  type Frame3,
  type LegRig,
  type Rig,
} from './skeleton';

/**
 * The body's dynamics and moves that the flatground rig (rig.ts), the grind
 * (grind.ts, grindRig.ts) and the stages share: the hips' crouch, pop,
 * flight and landing over the deck, the knee between a hip and an ankle,
 * and a whole rider moved, turned, or tipped.
 */

// ----- The hips over the deck -----

/**
 * The landing spring (LAND_OMEGA, LAND_ZETA): from `from`, moving at `speed`,
 * back to `rest`, `u` seconds on. A drop's harder landing springs back
 * slower, at `omega`.
 */
export function landingSpring(from: number, speed: number, rest: number, u: number, omega = LAND_OMEGA): number {
  const zeta = LAND_ZETA;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const a = from - rest;
  const b = (speed + zeta * omega * a) / wd;
  return rest + Math.exp(-zeta * omega * u) * (a * Math.cos(wd * u) + b * Math.sin(wd * u));
}

/** Hip height over the deck through a hop (s = 0 → 1): from `from` to `to`, sunk `tuck` under the straight line between them mid-flight. */
export const flightLegs = (from: number, to: number, tuck: number, s: number) =>
  from + (to - from) * s - 4 * tuck * s * (1 - s);

/**
 * The hips' speeds (up, per second) leaving and arriving on a hop of `T`
 * seconds: the legs' own, going flightLegs's way, plus a deck launched at
 * `lift / T` (4 times its rise; 0 for the legs alone).
 */
export const flightSpeeds = (lift: number, from: number, to: number, tuck: number, T: number) => ({
  takeoff: (lift + (to - from) - 4 * tuck) / T,
  touchdown: (-lift + (to - from) + 4 * tuck) / T,
});

/** Seconds the hips rest at the bottom of the crouch before the legs extend. */
export const CROUCH_HOLD = 0.02;
/** Seconds the legs take to extend into a pop, at least and at most. */
const EXTEND_MIN = 0.06;
export const EXTEND_MAX = 0.14;

/** Seconds the legs take to extend `rise` up from the crouch into the pop, leaving it at rest and reaching `takeoff` (up, per second). */
export const extendTime = (rise: number, takeoff: number) => Math.min(EXTEND_MAX, Math.max(EXTEND_MIN, (2.5 * rise) / takeoff));

/** Hips over the deck `s` (0 → 1) through that extension, from `squat` up to `pop`, and the crouch's load let go. */
export const extending = (squat: number, pop: number, takeoff: number, extendT: number, s: number) => ({
  overDeck: hermite(squat, pop, 0, takeoff * extendT, s),
  load: 1 - smoothstep(s),
});

/**
 * Riding away from a landing `u` seconds on (clock `t`): the hips spring
 * back up to RIDE_HEIGHT from `from`, arriving at `speed`, the cruising bob
 * comes back, and the arms come in from the air.
 */
export const rideAway = (t: number, u: number, from: number, speed: number) => ({
  overDeck: softFloor(landingSpring(from, speed, RIDE_HEIGHT, u), SQUAT_FLOOR) + cruiseBob(t) * smoothstep(u / 0.5),
  air: 1 - smoothstep(u / 0.4),
});

// ----- Legs -----

/** The knee nearest `near` that keeps both leg bones whole between `hip` and `ankle`. */
export function kneeBetween(hip: V3, ankle: V3, near: V3): V3 {
  const d = sub3(ankle, hip);
  const len = Math.max(1e-6, Math.hypot(d.x, d.y, d.z));
  const u = scale3(d, 1 / len);
  const along = Math.max(-THIGH, Math.min(THIGH, (THIGH * THIGH - SHIN * SHIN + len * len) / (2 * len)));
  const center = add3(hip, scale3(u, along));
  const off = sub3(near, center);
  const out = sub3(off, scale3(u, dot3(off, u)));
  return add3(center, scale3(norm3(out), Math.sqrt(Math.max(0, THIGH * THIGH - along * along))));
}

// ----- A whole rider moved -----

/** The upper body carried: every arm joint by `point`, the torso by `frame`, and the head by `head`. */
export function mapUpper(rig: Rig, point: (p: V3) => V3, frame: (f: Frame3) => Frame3, head = frame): Rig {
  return {
    ...rig,
    arms: rig.arms.map((a) => ({ ...a, shoulder: point(a.shoulder), elbow: point(a.elbow), hand: point(a.hand) })) as [ArmRig, ArmRig],
    torso: frame(rig.torso),
    head: head(rig.head),
  };
}

/** The body carried: every joint by `point`, and every frame (the shoes, torso and head) by `frame`. The board is the caller's. */
export function mapBody(rig: Rig, point: (p: V3) => V3, frame: (f: Frame3) => Frame3): Rig {
  return {
    ...mapUpper(rig, point, frame),
    legs: rig.legs.map((l) => ({ ...l, hip: point(l.hip), knee: point(l.knee), ankle: point(l.ankle), shoe: frame(l.shoe) })) as [LegRig, LegRig],
  };
}

/** A frame carried by a turn: its origin by `point`, rebuilt square on its axes turned by `turn`. */
export const turnedFrame = (f: Frame3, point: (p: V3) => V3, turn: (d: V3) => V3): Frame3 =>
  frameOf(point(f.origin), (d) => turn(add3(add3(scale3(f.fwd, d.x), scale3(f.up, -d.y)), scale3(f.side, d.z))));

/** A frame carried by a rigid motion axis by axis: its origin and points by `point`, its axes by `dir`. */
export const carriedFrame = (f: Frame3, point: (p: V3) => V3, dir: (d: V3) => V3): Frame3 => ({
  origin: point(f.origin),
  fwd: dir(f.fwd),
  up: dir(f.up),
  side: dir(f.side),
  at: (forward, up, side) => point(f.at(forward, up, side)),
});

/** The whole rider and board carried by a rigid motion: points by `point`, directions by `dir`. */
export function carriedRig(rig: Rig, point: (p: V3) => V3, dir: (d: V3) => V3): Rig {
  return {
    ...mapBody(rig, point, (f) => carriedFrame(f, point, dir)),
    board: {
      ...rig.board,
      center: point(rig.board.center),
      point: (local) => point(rig.board.point(local)),
      dir: (local) => dir(rig.board.dir(local)),
    },
  };
}

/** The whole rider and board moved by a world-space offset. */
export function shiftRig(rig: Rig, by: V3): Rig {
  const move = (p: V3) => add3(p, by);
  return {
    ...mapBody(rig, move, (f) => moveFrame(f, by)),
    board: { ...rig.board, center: move(rig.board.center), point: (local) => move(rig.board.point(local)) },
  };
}

/** The body turned `deg` about the vertical line through `at`. The board is the caller's. */
export function turnRig(rig: Rig, deg: number, at: V3): Rig {
  const point = (p: V3) => add3(at, rotY(sub3(p, at), deg));
  return {
    ...mapBody(rig, point, (f) => turnedFrame(f, point, (d) => rotY(d, deg))),
    bodyYawDeg: rig.bodyYawDeg + deg,
    headYawDeg: rig.headYawDeg + deg,
  };
}

/** The body tipped `deg` about the world's z through `at` (nose down for positive, as rotZ). The board is the caller's. */
export function tipRig(rig: Rig, deg: number, at: V3): Rig {
  if (!deg) return rig;
  const point = (p: V3) => add3(at, rotZ(sub3(p, at), deg));
  return mapBody(rig, point, (f) => turnedFrame(f, point, (d) => rotZ(d, deg)));
}

/**
 * The upper body twisted `deg` about the vertical line through the hips,
 * over legs that stay put: the shoulders and arms turn, and the head rides
 * along on the neck still looking where it was.
 */
export function twistUpper(rig: Rig, deg: number): Rig {
  if (!deg) return rig;
  const at = lerp3(rig.legs[0].hip, rig.legs[1].hip, 0.5);
  const point = (p: V3) => add3(at, rotY(sub3(p, at), deg));
  return mapUpper(rig, point, (f) => turnedFrame(f, point, (d) => rotY(d, deg)), (head) => moveFrame(head, sub3(point(head.origin), head.origin)));
}
