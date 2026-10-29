import { add3, clamp01, cross3, dot3, scale3, smoothstep, sub3, turnAbout, type V3 } from '../math';
import { ARM_RADII, HAND_RADIUS, LEG_RADII, type ArmRig, type LegRig, type Rig } from './skeleton';

/**
 * The arms kept out of the legs.
 *
 * The arms are posed off the chest (skeleton.ts ARM_RIDE …, grindRig.ts
 * ARM_GRIND) and the legs off the board, and neither made room for the
 * other: a knee folded up toward its shoulder (a noseblunt's or a
 * noseslide's raised tail, the legs swung round under the chest onto a
 * slide, a pop's tuck) came up straight through the hand hanging there.
 *
 * A rider doesn't wait for the knee to knock the arm aside: the arm goes up
 * and out over it as the knee comes up, stays there while it's up, and comes
 * back down after. So the lift is planned over the whole attempt, not frame
 * by frame: `armRoom` measures how far each arm would have to turn up and
 * out about its shoulder to clear the legs at a moment, and `liftOver` takes
 * those through the attempt to the lift the arm is held at: each room is
 * reached a little ahead of when it's needed and let go of a little after,
 * so the arm rises once, holds over a knee that wobbles under it, and
 * settles, on its own timing rather than the knee's. Always up and out to
 * its own side, so the lift never swings an arm round ahead of a knee or
 * behind it.
 */

/** Degrees an arm turns up and out per step looking for room, and the most it's lifted. */
const LIFT_STEP = 3;
const LIFT_MAX = 120;
/** Air (world units) the lift leaves between an arm and a leg. */
const AIR = 0.5;
/** Seconds an arm takes to go up out of a knee's way, and to come back down after it. */
const LIFT_TIME = 0.3;
/** The longest dip (seconds) between two lifts an arm is held up through. */
const LIFT_HOLD = 0.8;

/** A tapered capsule: the hull of a ball at each end (a ball, if they're the same point). */
interface Limb {
  a: V3;
  b: V3;
  ra: number;
  rb: number;
}

const armLimbs = (arm: ArmRig): Limb[] => [
  { a: arm.shoulder, b: arm.elbow, ra: ARM_RADII.shoulder, rb: ARM_RADII.elbow },
  { a: arm.elbow, b: arm.hand, ra: ARM_RADII.elbow, rb: ARM_RADII.wrist },
  { a: arm.hand, b: arm.hand, ra: HAND_RADIUS, rb: HAND_RADIUS },
];

const legLimbs = (leg: LegRig): Limb[] => [
  { a: leg.hip, b: leg.knee, ra: LEG_RADII.hip, rb: LEG_RADII.knee },
  { a: leg.knee, b: leg.ankle, ra: LEG_RADII.knee, rb: LEG_RADII.ankle },
];

/** The closest points of segments p (p.a → p.b) and q, as shares `s` and `t` along them, and how far apart they are. */
function closest(p: Limb, q: Limb): { s: number; t: number; gap: number } {
  const dp = sub3(p.b, p.a);
  const dq = sub3(q.b, q.a);
  const r = sub3(p.a, q.a);
  const pp = dot3(dp, dp);
  const qq = dot3(dq, dq);
  const f = dot3(dq, r);
  let s = 0;
  let t = 0;
  if (pp < 1e-9) {
    t = qq < 1e-9 ? 0 : clamp01(f / qq);
  } else {
    const c = dot3(dp, r);
    if (qq < 1e-9) {
      s = clamp01(-c / pp);
    } else {
      const pq = dot3(dp, dq);
      const den = pp * qq - pq * pq;
      s = den > 1e-9 ? clamp01((pq * f - c * qq) / den) : 0;
      t = (pq * s + f) / qq;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / pp);
      } else if (t > 1) {
        t = 1;
        s = clamp01((pq - c) / pp);
      }
    }
  }
  const d = sub3(add3(p.a, scale3(dp, s)), add3(q.a, scale3(dq, t)));
  return { s, t, gap: Math.hypot(d.x, d.y, d.z) };
}

/** How far (world units) `arm` is into either leg, as Robot3D draws them; negative, how far it's clear of both. */
export function armInLegs(arm: ArmRig, legs: readonly LegRig[]): number {
  let deepest = -Infinity;
  for (const leg of legs) {
    for (const bone of legLimbs(leg)) {
      for (const limb of armLimbs(arm)) {
        const { s, t, gap } = closest(limb, bone);
        deepest = Math.max(deepest, limb.ra + (limb.rb - limb.ra) * s + bone.ra + (bone.rb - bone.ra) * t - gap);
      }
    }
  }
  return deepest;
}

/** `arm` turned `deg` up and out to its own side about its shoulder, bend and all. */
function lifted(rig: Rig, arm: ArmRig, deg: number): ArmRig {
  if (deg === 0) return arm;
  const { torso } = rig;
  // The turn that takes an arm hanging down the chest out to its own side.
  const axis = scale3(cross3(torso.side, torso.up), Math.sign(dot3(sub3(arm.shoulder, torso.origin), torso.side)) || 1);
  const turn = (p: V3) => add3(arm.shoulder, turnAbout(sub3(p, arm.shoulder), axis, deg));
  return { ...arm, elbow: turn(arm.elbow), hand: turn(arm.hand) };
}

/** The least turn (deg) up and out about its shoulder that takes each arm clear of the legs: 0 where it already is. */
export function armRoom(rig: Rig): [number, number] {
  return rig.arms.map((arm) => {
    const over = (deg: number) => armInLegs(lifted(rig, arm, deg), rig.legs) + AIR;
    if (over(0) <= 0) return 0;
    // Stepped, not bisected from the start: turning an upper arm that grazes the
    // thigh beside it can sink it further in before it comes out over the knee.
    for (let hi = LIFT_STEP; hi <= LIFT_MAX; hi += LIFT_STEP) {
      if (over(hi) > 0) continue;
      let lo = hi - LIFT_STEP;
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        if (over(mid) > 0) lo = mid;
        else hi = mid;
      }
      return hi;
    }
    return LIFT_MAX;
  }) as [number, number];
}

/** `rig` with each arm turned up and out `lift` degrees (the same rig if neither is). */
export function armsLifted(rig: Rig, lift: readonly [number, number]): Rig {
  if (lift[0] === 0 && lift[1] === 0) return rig;
  return { ...rig, arms: [lifted(rig, rig.arms[0], lift[0]), lifted(rig, rig.arms[1], lift[1])] };
}

/** Each arm's lift (deg) at a time. */
export type ArmLift = (t: number) => [number, number];

/** The most over a window `[i - back, i + ahead]` of `xs`, for each i. */
const widest = (xs: readonly number[], back: number, ahead: number) =>
  xs.map((_, i) => Math.max(...xs.slice(Math.max(0, i - back), i + ahead + 1)));
/** The least over a window `[i - back, i + ahead]` of `xs`, for each i. */
const narrowest = (xs: readonly number[], back: number, ahead: number) =>
  xs.map((_, i) => Math.min(...xs.slice(Math.max(0, i - back), i + ahead + 1)));

/**
 * The lift each arm is held at through an attempt, from the room it needed
 * every `step` seconds from the start (`armRoom`).
 *
 * Each room is held for half of LIFT_TIME either side of its moment; a dip
 * between two holds shorter than LIFT_HOLD is held through, so an arm over a
 * knee that settles a little stays up; and the holds are eased into and out
 * of with a bell as wide as that half either side, so the arm goes up over
 * LIFT_TIME, is at each room by the moment it's needed, and comes down over
 * LIFT_TIME after, never in a jerk.
 */
export function liftOver(rooms: ReadonlyArray<readonly [number, number]>, step: number): ArmLift {
  const half = Math.max(1, Math.round(LIFT_TIME / 2 / step));
  const hold = Math.round(LIFT_HOLD / 2 / step);
  const bell = Array.from({ length: 2 * half + 1 }, (_, i) => 1 - smoothstep(Math.abs(i - half) / (half + 1)));
  const sum = bell.reduce((a, b) => a + b, 0);
  // The attempt's first and last poses hold before and after it, and so does the room they need.
  const pad = half + hold;
  const arm = (side: 0 | 1) => {
    const room = rooms.map((r) => r[side]);
    const padded = [...Array<number>(pad).fill(room[0] ?? 0), ...room, ...Array<number>(pad).fill(room[room.length - 1] ?? 0)];
    const held = widest(padded, half, half);
    const bridged = narrowest(widest(held, hold, hold), hold, hold);
    const at = (i: number) => bridged[Math.max(0, Math.min(bridged.length - 1, i))];
    return bridged.map((_, i) => bell.reduce((acc, w, j) => acc + w * at(i - half + j), 0) / sum);
  };
  const sides = [arm(0), arm(1)];
  return (t) => {
    const x = Math.max(0, Math.min(sides[0].length - 1, t / step + pad));
    const i = Math.min(Math.floor(x), sides[0].length - 2);
    const k = x - i;
    const sample = (lift: number[]) => lift[i] + (lift[i + 1] - lift[i]) * k;
    return [sample(sides[0]), sample(sides[1])];
  };
}
