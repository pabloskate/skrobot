import { add3, cross3, dot3, norm3, scale3, sub3, type V3 } from '../../math';
import { LEG_RADII } from '../../board/boardCollision';
import { HUMAN_FOREARM, HUMAN_HEAD, HUMAN_SCALE, HUMAN_SHIN, HUMAN_THIGH, HUMAN_UPPER_ARM } from '../../riders/human/humanProportions';
import { HUMAN_SHOULDER, HUMAN_SHOULDER_DROP } from '../../riders/human/humanRig';
import { skaterInfo, type Skater } from '../../riders/skaters';
import {
  ANKLE_LIFT,
  FOREARM,
  HIP_Z,
  SHIN,
  SHOE_HALF_HEIGHT,
  SHOULDER,
  THIGH,
  TOE_REACH,
  type ArmRig,
  type BoardRig,
  type LegRig,
  type Rig,
  UPPER_ARM,
} from '../skeleton';
import { frameFrom, frameQuat, qframe, qrot, type Quat } from './rotation';

/**
 * A rider's body as the falls drive it: posed whole, at the size it's drawn.
 *
 * The rig the tricks solve is the robot's, and a person is grown from it over
 * the same feet (riders/human/humanRig.ts). That's right for a pose on a
 * board, where the feet are the board's, but not for a body on its own feet:
 * grown from them, a stride is still the robot's stride under legs half again
 * as long. So a fall poses the body at its own size, from the measurements
 * here, and the rig it makes is the one the renderers draw (no humanRig).
 */

export interface BodyDims {
  /** How much bigger than the robot's rig: 1, or a person's PERSON_SCALE. */
  scale: number;
  /** Hip joints off the pelvis' middle. */
  hipHalf: number;
  thigh: number;
  shin: number;
  /** The torso frame's origin off the hips' middle, along the torso's (fwd, up). */
  torso: { f: number; u: number };
  /** Shoulder joints, along the torso's (fwd, up, side). */
  shoulder: { f: number; u: number; s: number };
  /** The neck's top up the torso, the head's origin off it along the head's (fwd, up), and the neck's base up the torso (the head swings about it). */
  neck: number;
  neckBase: number;
  head: { f: number; u: number };
  upperArm: number;
  forearm: number;
}

const ROBOT: BodyDims = {
  scale: 1,
  hipHalf: HIP_Z,
  thigh: THIGH,
  shin: SHIN,
  torso: { f: 1, u: 14 },
  shoulder: { f: SHOULDER.x, u: -SHOULDER.y, s: SHOULDER.z },
  neck: 60,
  neckBase: 35,
  head: { f: 4, u: 0 },
  upperArm: UPPER_ARM,
  forearm: FOREARM,
};

/** The robot's rig as humanRig grows it (same frames, hips up, shoulders in and down, the head a little less). */
const PERSON: BodyDims = (() => {
  const k = HUMAN_SCALE;
  // humanRig grows the head out from its pivot on the neck by HUMAN_HEAD and the rest by k.
  const pivot = { f: 1.5, u: -15 };
  const headGrow = HUMAN_HEAD;
  return {
    scale: k,
    hipHalf: HIP_Z * k,
    thigh: HUMAN_THIGH,
    shin: HUMAN_SHIN,
    torso: { f: 1 * k, u: 14 * k },
    shoulder: { f: SHOULDER.x * k, u: (-SHOULDER.y - HUMAN_SHOULDER_DROP) * k, s: HUMAN_SHOULDER * k },
    neck: 60 * k,
    neckBase: 35 * k,
    head: { f: pivot.f * k + (4 - pivot.f) * headGrow, u: pivot.u * k - pivot.u * headGrow },
    upperArm: HUMAN_UPPER_ARM * k,
    forearm: HUMAN_FOREARM * k,
  };
})();

export const bodyDims = (skater: Skater): BodyDims => (skaterInfo(skater).person ? PERSON : ROBOT);

/** Shoe center → ankle, in the shoe's frame (rig.ts puts the ankle over the heel end, ANKLE_LIFT less the sole). */
export const ANKLE_IN_SHOE = { f: -TOE_REACH, u: ANKLE_LIFT - 2 } as const;
/** The ankle's height over the ground under a flat shoe: up from the shoe's middle, which is its half height off the sole. */
export const ANKLE_HEIGHT = ANKLE_IN_SHOE.u + SHOE_HALF_HEIGHT;
/** A planted sole, a robot's (world units): where the weight can be on it, heel to toe and either side of its middle. */
export const SOLE = { heel: -7, toe: 8, half: 3.5 } as const;
/** How far either side of its middle a sole lies on the ground, for the slope and the edges under it (world units, a robot's). */
export const SOLE_HALF_WIDTH = 5;
/** How far (world units) a sole may sit into a board's grip: soles rest on it, and are rounded. */
export const SOLE_GRACE = 1.5;

/**
 * How thick (radii, world units, a robot's: robot3d.ts's widths halved) each part is, for keeping the board and the
 * ground out of it: the legs' as the board's collisions have them, the arms', and the trunk's and head's.
 */
export const LIMB_RADII = { ...LEG_RADII, upperArm: 5, forearm: 4.4, hand: 5.8, trunk: 13, head: 15 } as const;

/** A shoe: its center and its turn (fwd to the toe, up out of the sole). */
export interface ShoePose {
  at: V3;
  q: Quat;
}

/** Everything a fall poses; the rig is made from it. Left, then right, for the pairs. */
export interface BodyPose {
  /** Midpoint of the hip joints. */
  hips: V3;
  /** Pelvis: facing, up; its side runs toward the right hip. */
  pelvis: Quat;
  torso: Quat;
  head: Quat;
  shoes: [ShoePose, ShoePose];
  /** Which way each knee bends, off its hip-ankle line. */
  knees: [V3, V3];
  /** Each arm's upper-arm and forearm direction. */
  arms: [{ upper: V3; fore: V3 }, { upper: V3; fore: V3 }];
}

/** Two-bone IK: the knee (or elbow) for a chain of `a` then `b` from `root` to `end`, bent toward `pole`. */
export function twoBone(root: V3, end: V3, a: number, b: number, pole: V3): V3 {
  const d = sub3(end, root);
  const len = Math.max(1e-6, Math.hypot(d.x, d.y, d.z));
  const u = scale3(d, 1 / len);
  const reach = Math.min(len, a + b - 1e-3);
  const along = Math.max(-a, Math.min(a, (a * a - b * b + reach * reach) / (2 * reach)));
  const out = Math.sqrt(Math.max(0, a * a - along * along));
  let w = sub3(pole, scale3(u, dot3(pole, u)));
  const wl = Math.hypot(w.x, w.y, w.z);
  w = wl > 1e-6 ? scale3(w, 1 / wl) : norm3({ x: -u.y, y: u.x, z: 0 });
  return add3(root, add3(scale3(u, along), scale3(w, out)));
}

export const ankleOf = (shoe: ShoePose): V3 =>
  add3(shoe.at, add3(qrot(shoe.q, { x: ANKLE_IN_SHOE.f, y: 0, z: 0 }), qrot(shoe.q, { x: 0, y: -ANKLE_IN_SHOE.u, z: 0 })));

const SIDES = ['left', 'right'] as const;

/** The rig for a pose, standing by `board`. */
export function rigOf(pose: BodyPose, body: BodyDims, board: BoardRig, toeDir: 1 | -1, free: number): Rig {
  const pelvis = frameFrom(pose.hips, pose.pelvis);
  const torso = frameFrom(add3(pose.hips, add3(scale3(qrot(pose.torso, { x: 1, y: 0, z: 0 }), body.torso.f), scale3(qrot(pose.torso, { x: 0, y: -1, z: 0 }), body.torso.u))), pose.torso);
  const chest = frameFrom(pose.hips, pose.torso);
  const legs = SIDES.map((side, i): LegRig => {
    const hip = pelvis.at(0, 0, (i === 0 ? -1 : 1) * body.hipHalf);
    const shoe = frameFrom(pose.shoes[i].at, pose.shoes[i].q);
    const ankle = ankleOf(pose.shoes[i]);
    return { side, hip, knee: twoBone(hip, ankle, body.thigh, body.shin, pose.knees[i]), ankle, shoe, flicking: false };
  }) as [LegRig, LegRig];
  const arms = SIDES.map((side, i): ArmRig => {
    const shoulder = chest.at(body.shoulder.f, body.shoulder.u, (i === 0 ? -1 : 1) * body.shoulder.s);
    const elbow = add3(shoulder, scale3(norm3(pose.arms[i].upper), body.upperArm));
    return { side, shoulder, elbow, hand: add3(elbow, scale3(norm3(pose.arms[i].fore), body.forearm)) };
  }) as [ArmRig, ArmRig];
  // The neck bends from its base: the head turned off the chest swings its top round with it. A rider's stands straight
  // up the chest (rig.ts), so the body coming off the board bends it more as it's freed.
  const headAxes = frameFrom(pose.hips, pose.head);
  const swung = add3(chest.at(0, body.neckBase, 0), scale3(headAxes.up, body.neck - body.neckBase));
  const neckTop = add3(scale3(chest.at(0, body.neck, 0), 1 - free), scale3(swung, free));
  const head = frameFrom(add3(neckTop, add3(scale3(headAxes.fwd, body.head.f), scale3(headAxes.up, body.head.u))), pose.head);
  const facing = pelvis.fwd;
  return {
    board,
    legs,
    arms,
    torso,
    head,
    toeDir,
    flickZ: 0,
    flickOut: 0,
    bodyYawDeg: (Math.atan2(-facing.z, facing.x) * 180) / Math.PI,
    headYawDeg: (Math.atan2(-head.fwd.z, head.fwd.x) * 180) / Math.PI,
    hipOverDeck: board.center.y - pose.hips.y,
    free,
  };
}

/** The pose a rig is in: how a fall picks up from a rider mid-trick. */
export function poseOf(rig: Rig): BodyPose {
  const [left, right] = rig.legs[0].side === 'left' ? rig.legs : [rig.legs[1], rig.legs[0]];
  const hips = scale3(add3(left.hip, right.hip), 0.5);
  const side = norm3(sub3(right.hip, left.hip));
  const up = norm3(sub3(rig.torso.up, scale3(side, dot3(rig.torso.up, side))));
  // Physics frames are left-handed: forward is side × up.
  const pelvis = qframe(cross3(side, up), up);
  const kneeOf = (leg: LegRig) => {
    const axis = norm3(sub3(leg.ankle, leg.hip));
    const off = sub3(leg.knee, leg.hip);
    return norm3(sub3(off, scale3(axis, dot3(off, axis))));
  };
  const [la, ra] = rig.arms[0].side === 'left' ? rig.arms : [rig.arms[1], rig.arms[0]];
  const aim = (arm: ArmRig) => ({ upper: norm3(sub3(arm.elbow, arm.shoulder)), fore: norm3(sub3(arm.hand, arm.elbow)) });
  const shoe = (leg: LegRig): ShoePose => ({ at: leg.shoe.origin, q: frameQuat(leg.shoe) });
  return {
    hips,
    pelvis,
    torso: frameQuat(rig.torso),
    head: frameQuat(rig.head),
    shoes: [shoe(left), shoe(right)],
    knees: [kneeOf(left), kneeOf(right)],
    arms: [aim(la), aim(ra)],
  };
}

/**
 * Share of the body's mass in each part (Dempster's, as Winter tabulates
 * them), and how far down each limb bone its own center sits.
 */
export const MASS = { head: 0.081, trunk: 0.497, upperArm: 0.028, foreHand: 0.022, thigh: 0.1, shank: 0.0465, foot: 0.0145 } as const;
const LIMB_CENTER = { upperArm: 0.436, foreHand: 0.682, thigh: 0.433, shank: 0.433 } as const;

/** The body's center of mass in a rig. */
export function centerOfMass(rig: Rig): V3 {
  let sum: V3 = { x: 0, y: 0, z: 0 };
  const add = (p: V3, m: number) => { sum = add3(sum, scale3(p, m)); };
  const along = (a: V3, b: V3, k: number) => add3(a, scale3(sub3(b, a), k));
  const hips = scale3(add3(rig.legs[0].hip, rig.legs[1].hip), 0.5);
  const neck = scale3(add3(rig.arms[0].shoulder, rig.arms[1].shoulder), 0.5);
  add(along(hips, neck, 0.5), MASS.trunk);
  add(rig.head.origin, MASS.head);
  for (const arm of rig.arms) {
    add(along(arm.shoulder, arm.elbow, LIMB_CENTER.upperArm), MASS.upperArm);
    add(along(arm.elbow, arm.hand, LIMB_CENTER.foreHand), MASS.foreHand);
  }
  for (const leg of rig.legs) {
    add(along(leg.hip, leg.knee, LIMB_CENTER.thigh), MASS.thigh);
    add(along(leg.knee, leg.ankle, LIMB_CENTER.shank), MASS.shank);
    add(leg.shoe.origin, MASS.foot);
  }
  return sum;
}
