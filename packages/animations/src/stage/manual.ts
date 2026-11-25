import { WHEEL_X, WHEEL_Y } from '../board/board';
import { clearFeet } from '../board/footContact';
import { add3, lerp3, norm3, rotZ, scale3, smoothstep, sub3, type V3 } from '../math';
import { carriedFrame, kneeBetween, turnedFrame } from '../motion/dynamics';
import type { CatchStance } from '../motion/rig';
import {
  FOREARM,
  SHIN,
  THIGH,
  UPPER_ARM,
  armDirs,
  type ArmPose,
  type ArmRig,
  type BoardRig,
  type LegRig,
  type Rig,
} from '../motion/skeleton';
import type { StairPlan } from './drop';

/**
 * Bank manuals and nose manuals: balancing on one truck down a sloped bank
 * (Triangle Bank's slab) and levelling back to all four wheels as the board
 * drops off the low edge onto the plaza.
 *
 * The feet are the rig solver's (`manualStance`, a motion/rig.ts catch
 * stance): they cross in the air to where a manual is stood (the balancing
 * foot out past the truck on the tail or the nose, flush with its kick, the
 * other over the inner bolts) and catch the board there. A foot isn't moved
 * along the grip once it's on it: that would move the board.
 *
 * The rest is solved here, in the bank-local upright frame before
 * `stageArms`, `posed` (`humanRig`), and `bankRig`: the contact wheel's axle
 * stays fixed on the wheel-contact plane while the board pivots by ±pitch
 * with the feet on it, the hips shift over the contact truck, the torso
 * stays upright against the steep slope, the arms spread wide to balance,
 * and the knees re-solve with exact leg lengths so both robots and human
 * skaters inherit identical contact geometry and anatomy.
 */

/** Seconds before touchdown the rider tilts the board into the manual lock-in (after catch and apex clearance). */
export const MANUAL_ENTER_T = 0.15;
/** Board pitch relative to the bank (degrees): manual lifts the downhill truck, nose manual lifts the uphill truck. */
export const MANUAL_PITCH_DEG = 18;
export const NOSE_MANUAL_PITCH_DEG = 16;

/** Target shoe centers along the deck (board-local x): balance foot out on the tail/nose past the truck, other foot near the inner bolts. */
const BALANCE_FOOT_X = 36;
const LIFTED_FOOT_X = 14;

/**
 * Center-of-mass balance shift toward the contact truck (on top of the rig's own: its hips already ride between
 * the feet, so part of the way toward the balancing one), vertical poise, and upper-body counter-tip (deg).
 */
const HIP_SHIFT_X = 12;
const HIP_LIFT_Y = 4;
const MIN_LEG_CLEAR = 31;
const MAX_LEG_REACH = THIGH + SHIN - 1.5;
const MANUAL_TORSO_TIP = 7;
const NOSE_MANUAL_TORSO_TIP = 11;

/** Wide tightrope balance arms held while manualing down the bank. */
const ARM_MANUAL: Record<'front' | 'back', ArmPose> = {
  front: { out: 74, swing: 12, elbow: 28 },
  back: { out: 68, swing: -14, elbow: 26 },
};

/** 0 → 1 → 0 envelope of a bank manual: in just before touchdown, held down the bank, leveled off the lip onto the plaza. */
export function manualBlend(plan: StairPlan, t: number): number {
  if (plan.bankRide === 'ride' || !plan.landed) return 0;
  const enterFrom = plan.land - MANUAL_ENTER_T;
  if (t <= enterFrom) return 0;
  if (t < plan.land) return smoothstep((t - enterFrom) / MANUAL_ENTER_T);
  const lip = plan.lip ?? plan.land + 0.25;
  const plaza = plan.ledges[0]?.t ?? lip + 0.16;
  if (t <= lip) return 1;
  if (t < plaza) return 1 - smoothstep((t - lip) / Math.max(1e-6, plaza - lip));
  return 0;
}

/**
 * Where a bank manual's feet catch the board and stand (a rig catch stance),
 * for the foot that balances it: the rider's nose foot or tail foot,
 * whichever is over the contact truck. Held down the bank; rolling off its
 * lip the board is in the air again, and the feet go back to riding stance
 * before it meets the plaza. Undefined for a bank ridden on four wheels.
 */
export function manualStance(plan: StairPlan, t: number, balance: 'nose' | 'tail'): CatchStance | undefined {
  if (plan.bankRide === 'ride' || !plan.landed) return undefined;
  const lip = plan.lip ?? plan.land + 0.25;
  const plaza = plan.ledges[0]?.t ?? lip + 0.16;
  const hold = t <= lip ? 1 : 1 - smoothstep((t - lip) / Math.max(1e-6, plaza - lip));
  return balance === 'nose'
    ? { nose: BALANCE_FOOT_X, tail: -LIFTED_FOOT_X, hold }
    : { nose: LIFTED_FOOT_X, tail: -BALANCE_FOOT_X, hold };
}

/**
 * Pose `rig`, its feet already in the manual's stance (`manualStance`), into a bank manual or nose manual in the
 * bank-local frame, before `stageArms`, `humanRig`, and `bankRig`.
 */
export function manualRig(
  rig: Rig,
  plan: StairPlan,
  t: number,
  frontArm: 'left' | 'right',
): Rig {
  const m = manualBlend(plan, t);
  if (m <= 0) return rig;

  const isNose = plan.bankRide === 'nose-manual';
  const sign = isNose ? 1 : -1;
  const deg = sign * (isNose ? NOSE_MANUAL_PITCH_DEG : MANUAL_PITCH_DEG) * m;
  const pivot: V3 = {
    x: rig.board.center.x + sign * WHEEL_X,
    y: rig.board.center.y + WHEEL_Y,
    z: rig.board.center.z,
  };
  const boardPt = (p: V3): V3 => add3(pivot, rotZ(sub3(p, pivot), deg));
  const boardDir = (d: V3): V3 => rotZ(d, deg);

  const board: BoardRig = {
    ...rig.board,
    center: boardPt(rig.board.center),
    point: (local) => boardPt(rig.board.point(local)),
    dir: (local) => boardDir(rig.board.dir(local)),
    pitchDeg: rig.board.pitchDeg + deg,
  };

  // The feet stand where they caught the board, and pitch rigidly with it.
  const feet = rig.legs.map((l) => ({
    ankle: boardPt(l.ankle),
    shoe: carriedFrame(l.shoe, boardPt, boardDir),
  }));

  // Shift the hips over the balancing truck, keeping both legs within anatomical clearance and reach.
  let hipDelta: V3 = { x: sign * HIP_SHIFT_X * m, y: -HIP_LIFT_Y * m, z: 0 };
  for (let i = 0; i < 2; i++) {
    const h = add3(rig.legs[i].hip, hipDelta);
    const across = Math.hypot(feet[i].ankle.x - h.x, feet[i].ankle.z - h.z);
    const minVertical = Math.sqrt(Math.max(0, MIN_LEG_CLEAR * MIN_LEG_CLEAR - across * across));
    const vertical = feet[i].ankle.y - h.y;
    if (vertical < minVertical) hipDelta = { ...hipDelta, y: hipDelta.y - (minVertical - vertical) };
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 2; i++) {
      const h = add3(rig.legs[i].hip, hipDelta);
      const d = sub3(feet[i].ankle, h);
      const len = Math.hypot(d.x, d.y, d.z);
      if (len > MAX_LEG_REACH) hipDelta = add3(hipDelta, scale3(d, (len - MAX_LEG_REACH) / len));
    }
  }

  const hipMid = scale3(add3(rig.legs[0].hip, rig.legs[1].hip), 0.5);
  const hipPivot = add3(hipMid, hipDelta);
  // Counter-tip the upper body so the rider stays upright and balanced against the steep bank slope.
  const counterTip = -(isNose ? NOSE_MANUAL_TORSO_TIP : MANUAL_TORSO_TIP) * m;
  const upperPt = (p: V3): V3 => add3(hipPivot, rotZ(sub3(add3(p, hipDelta), hipPivot), counterTip));
  const upperDir = (d: V3): V3 => rotZ(d, counterTip);

  const torso = turnedFrame(rig.torso, upperPt, upperDir);
  const head = turnedFrame(rig.head, upperPt, upperDir);

  const worldFromTorso = (v: V3): V3 =>
    add3(add3(scale3(torso.fwd, v.x), scale3(torso.up, -v.y)), scale3(torso.side, v.z));

  const arms = rig.arms.map((arm): ArmRig => {
    const shoulder = upperPt(arm.shoulder);
    const u0 = norm3(sub3(upperPt(arm.elbow), shoulder));
    const f0 = norm3(sub3(upperPt(arm.hand), upperPt(arm.elbow)));
    const isFront = arm.side === frontArm;
    const role = isFront ? 'front' : 'back';
    const sideZ: 1 | -1 = arm.side === 'left' ? -1 : 1;
    const sway = Math.sin((t - plan.land) * 14 + (isFront ? 0 : Math.PI)) * 5;
    const [uLocal, fLocal] = armDirs(
      {
        out: ARM_MANUAL[role].out + sway * 0.6,
        swing: ARM_MANUAL[role].swing + sway,
        elbow: ARM_MANUAL[role].elbow,
      },
      sideZ,
    );
    const u = norm3(lerp3(u0, worldFromTorso(uLocal), m));
    const f = norm3(lerp3(f0, worldFromTorso(fLocal), m));
    const elbow = add3(shoulder, scale3(u, UPPER_ARM));
    const hand = add3(elbow, scale3(f, FOREARM));
    return { ...arm, shoulder, elbow, hand };
  }) as [ArmRig, ArmRig];

  const legs = rig.legs.map((l, i): LegRig => {
    const hip = add3(l.hip, hipDelta);
    const { ankle, shoe } = feet[i];
    const nearKnee = add3(l.knee, scale3(add3(hipDelta, sub3(ankle, l.ankle)), 0.5));
    return { ...l, hip, ankle, shoe, knee: kneeBetween(hip, ankle, nearKnee) };
  }) as [LegRig, LegRig];

  const hipOverDeck = board.center.y - (legs[0].hip.y + legs[1].hip.y) / 2;
  return clearFeet({ ...rig, board, legs, arms, torso, head, hipOverDeck });
}
