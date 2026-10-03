import type { SkateStyle } from '../types';
import type { RiderMechanics } from '../stanceMechanics';
import { FLIP_T, ROLL_IN, X0, computeFrame, specFor } from '../TrickAnimation';
import { deckTopY } from './board';
import {
  FALL_CLEAR,
  FALL_SETTLE,
  FALL_SETTLE_CLEAR,
  GRAVITY,
  grindFrame,
  grindStreetDist,
  poseDir,
  slipBoard,
  slipSide,
  sprawlsAway,
  type BoardPose,
  type GrindFrame,
  type GrindPlan,
} from './grind';
import { BAR_Z } from './grindDefinitions';
import { NO_SPIN, hopClock, type TrickSpin } from './grindTricks';
import {
  add3,
  clamp01,
  cross3,
  dot3,
  lerp3,
  norm3,
  rad,
  rotX,
  rotY,
  rotZ,
  scale3,
  smoothstep,
  sub3,
  type V3,
} from './math';
import { solveRig } from './rig';
import {
  ANKLE_LIFT,
  DECK_HALF_WIDTH,
  ARM_AIR,
  ARM_LAND,
  ARM_LOAD,
  ARM_RIDE,
  FOREARM,
  HEAD_LOOK_FORWARD,
  HEAD_STEADY,
  HIP_BACK,
  HIP_CENTER,
  HIP_Z,
  KNEE_AIM_BACK,
  KNEE_AIM_FRONT,
  LEAN_REST,
  LEAN_SQUAT,
  LOOK_DOWN_OLLIE,
  PRE_WIND,
  RIDE_HEIGHT,
  SHOE_HALF_HEIGHT,
  SHOE_TOESIDE,
  SHOULDER,
  SQUAT_FLOOR,
  STANCE_BODY_YAW,
  THIGH,
  SHIN,
  TOE_REACH,
  UPPER_ARM,
  armDirs,
  frameOf,
  mixPose,
  moveFrame,
  softFloor,
  solveLeg,
  type ArmPose,
  type ArmRig,
  type BoardRig,
  type Frame3,
  type LegRig,
  type Rig,
} from './skeleton';

/**
 * Grind frame → world-space skeleton, built from the same parts as the
 * flatground rig: fixed-length legs solved by the same IK, the same arm
 * poses, torso hinge, and steady head.
 *
 * The difference is where the feet come from. On flatground the physics
 * hands the rig foot targets; here the soles are glued to the grip, so
 * wherever the grind puts the board — dipped over the bar, turned across it
 * — the feet go with it and the body stands on them. The hips ride between
 * the feet at the grind's height, the body turns with the board, and the
 * shoulders and head hold back some of that turn to stay square to the bar.
 *
 * A slip hands the body over to the shared flatground fall physics: the
 * rider drops off the bar, blending into the fall's first frame, and then
 * slams, bails, or stumbles exactly like a missed flatground trick.
 */

/** Arms out wide and a little low: balancing on the bar. */
const ARM_GRIND: Record<'front' | 'back', ArmPose> = {
  front: { out: 56, swing: 20, elbow: 34 },
  back: { out: 50, swing: -10, elbow: 30 },
};
/** Share of the board's turn the shoulders and the head hold back from. */
const TWIST_HOLD = 0.28;
const HEAD_HOLD = 0.5;
/** Head nod (deg) toward the bar while locked on it. */
const LOOK_DOWN_GRIND = 14;
/** Degrees the arms tip against the balance sway. */
const SWAY_ARMS = 12;
/** Where the knee aims at full toeside flick (deg from the nose toward toeside), and how far a flick lifts it. */
const FLICK_AIM_TOE = 14;
const FLICK_KNEE_LIFT = 0.7;
/** Longest hip-to-ankle reach the hips may ask of a leg (just short of straight). */
const REACH = THIGH + SHIN - 1.5;

/**
 * The board at a pose, with its deck optionally turned about its own axes
 * (a flip or shuv popped into or out of the grind). The turn is inside the
 * pose, so the deck spins on the attitude it is riding at.
 */
export function boardRigAt(center: V3, pose: BoardPose, spin: TrickSpin = NO_SPIN): BoardRig {
  const attitude = poseDir(pose);
  const dir = spin === NO_SPIN || (spin.flip === 0 && spin.yaw === 0)
    ? attitude
    : (local: V3) => attitude(rotY(rotX(local, spin.flip), spin.yaw));
  return {
    center,
    point: (local) => add3(center, dir(local)),
    dir,
    flipDeg: pose.roll + spin.flip,
    yawDeg: pose.yaw + spin.yaw,
    pitchDeg: pose.pitch,
  };
}

function bodyOn(g: GrindFrame, plan: GrindPlan, mechanics: RiderMechanics): Rig {
  const toeDir = mechanics.orientationSign;
  // The feet stand on the board's attitude; a deck flipping under them is
  // only drawn (the rig's board), never stood on.
  const board = boardRigAt(g.center, g.pose);
  // The trick under the feet: the one popped into the grind until the pop
  // off, then the one popped out of it, flicked by its own foot.
  const trick = g.t < plan.off ? plan.entry : plan.exit;
  const feetLift = trick ? trick.trick.feetLift * g.offDeck : 0;
  // A kickflip flicks off the heelside rail, a heelflip off the toeside one.
  const flickDir = trick ? -trick.trick.spec.flipDir * toeDir : 0;
  const flickReach = trick ? DECK_HALF_WIDTH + 5 + 4 * trick.style.flickStrength : 0;
  const restingBodyYaw = -STANCE_BODY_YAW * toeDir;
  const bodyYawDeg = g.pose.yaw + restingBodyYaw;
  // The board's own turn into the lock, past the rider's spin: the shoulders
  // and head hold back from this, not from a 180 the whole body made.
  const turn = g.pose.yaw - g.heading;
  // The board's heading without its tilt: the body and knees turn with it.
  const heading = (d: V3) => rotY(d, g.pose.yaw);

  // ----- Feet: soles on the grip, wherever the board is -----
  const footPlan = (side: 'left' | 'right') => {
    const isNose = mechanics.noseFoot === side;
    const x = isNose ? g.noseFoot : g.tailFoot;
    // Same stance on the deck as the flatground rig: toes across toward
    // toeside, the front foot raked toward the nose.
    const rake = isNose ? 24 : 8;
    const toe = rotY({ x: 0, y: 0, z: toeDir }, toeDir * rake);
    const along = rotY({ x: 1, y: 0, z: 0 }, toeDir * rake);
    const flicking = trick != null && trick.mechanics.flickFoot === side;
    const lane = toeDir * SHOE_TOESIDE - toe.z * TOE_REACH + (flicking ? flickDir * g.flickOut * flickReach : 0);
    // The sole sits 2 below the foot point (see solveRig's shoe placement), on
    // the deck where the shoe's center is, which the toe reaches past the foot.
    const footY = deckTopY(x + toe.x * TOE_REACH) - 2 - feetLift;
    const center: V3 = { x: x + toe.x * TOE_REACH, y: footY + 2 - SHOE_HALF_HEIGHT, z: lane + toe.z * TOE_REACH };
    const shoe = frameOf(board.point(center), (d) =>
      board.dir({ x: toe.x * d.x + along.x * d.z, y: d.y, z: toe.z * d.x + along.z * d.z }));
    const hipLocal: V3 = { x: 0, y: 0, z: side === 'left' ? -HIP_Z : HIP_Z };
    return { side, isNose, flicking, shoe, hipLocal, ankle: board.point({ x, y: footY - ANKLE_LIFT, z: lane }) };
  };
  const plans = [footPlan('left'), footPlan('right')] as const;

  // ----- Hips: between the feet, sliding back over the heels as they sink -----
  const squat = clamp01((RIDE_HEIGHT - g.overDeck) / (RIDE_HEIGHT - SQUAT_FLOOR));
  const shift = heading({ x: (HIP_CENTER * (g.noseFoot + g.tailFoot)) / 2, y: 0, z: -toeDir * HIP_BACK * squat });
  // The hips ride the un-snapped board, so a pop's snap is taken by the legs,
  // but never higher than both legs can still reach their feet from.
  let hipY = g.ref.y - g.overDeck;
  for (const plan of plans) {
    const hip = add3({ x: g.ref.x + shift.x, y: 0, z: g.ref.z + shift.z }, rotY(plan.hipLocal, bodyYawDeg));
    const across = Math.hypot(plan.ankle.x - hip.x, plan.ankle.z - hip.z);
    hipY = softFloor(hipY, plan.ankle.y - Math.sqrt(Math.max(0, REACH * REACH - across * across)), 3);
  }
  const anchor: V3 = { x: g.ref.x + shift.x, y: hipY, z: g.ref.z + shift.z };

  // Upper body: resting yaw, a hinge over the toes, then the board's turn,
  // held back a little. Into and out of a slide the shoulders wind up
  // against the turn that's coming.
  const leanX = -toeDir * (LEAN_REST + LEAN_SQUAT * squat);
  const spinWay = Math.sign(plan.lock.yaw - plan.heading);
  const windUp = plan.spec.slide ? (g.t < plan.lockAt ? -spinWay : spinWay) * PRE_WIND * g.load : 0;
  const torsoRelYaw = -turn * TWIST_HOLD + windUp;
  const upperDir = (d: V3, relYaw: number) => rotY(rotX(rotY(d, restingBodyYaw + relYaw), leanX), g.pose.yaw);
  const torsoPoint = (p: V3) => add3(anchor, upperDir(p, torsoRelYaw));
  const bodyPoint = (p: V3) => add3(anchor, rotY(p, bodyYawDeg));

  const leg = (plan: (typeof plans)[number]): LegRig => {
    const hip = bodyPoint(plan.hipLocal);
    // A foot flicked out over the toeside rail swings toward where the knee is
    // aimed: the knee comes round to face forward and lifts, so the leg never
    // runs along the aim and flips the knee to the other side. Out over the
    // heelside rail the knee stays over the toes.
    const flick = plan.flicking ? g.flickOut : 0;
    const rest = plan.isNose ? KNEE_AIM_FRONT : KNEE_AIM_BACK;
    const aim = rad(rest + (flickDir * toeDir > 0 ? (FLICK_AIM_TOE - rest) * flick : 0));
    const pole = heading({ x: Math.cos(aim), y: -0.12 - FLICK_KNEE_LIFT * flick, z: toeDir * Math.sin(aim) });
    const solved = solveLeg(hip, plan.ankle, pole, plan.shoe.up, true);
    return {
      side: plan.side,
      hip,
      knee: solved.knee,
      ankle: solved.ankle,
      shoe: moveFrame(plan.shoe, sub3(solved.ankle, plan.ankle)),
      flicking: plan.flicking,
    };
  };

  // ----- Arms: out for balance on the bar, tipping against the sway -----
  const press = squat * g.press;
  const awkward = plan.spec.stance === 'switch' || plan.spec.stance === 'fakie' ? 1 : 0;
  const arm = (side: 'left' | 'right'): ArmRig => {
    const front = mechanics.frontArm === side;
    const role = front ? 'front' : 'back';
    const sideZ = side === 'left' ? -1 : 1;
    let pose = mixPose(ARM_RIDE[role], ARM_GRIND[role], g.grind);
    pose = mixPose(pose, ARM_LOAD[role], g.load);
    pose = mixPose(pose, ARM_AIR[role], g.air);
    pose = mixPose(pose, ARM_LAND[role], press);
    pose = {
      out: pose.out + (front ? 1 : -1) * SWAY_ARMS * g.sway + awkward * 10 * g.air,
      swing: pose.swing,
      elbow: pose.elbow + awkward * 8 * g.air,
    };
    const [upper, fore] = armDirs(pose, sideZ);
    const shoulder: V3 = { x: SHOULDER.x, y: SHOULDER.y, z: sideZ * SHOULDER.z };
    const elbow = add3(shoulder, scale3(upper, UPPER_ARM));
    const hand = add3(elbow, scale3(fore, FOREARM));
    return { side, shoulder: torsoPoint(shoulder), elbow: torsoPoint(elbow), hand: torsoPoint(hand) };
  };

  // ----- Head: looks down the bar, and down at it -----
  const restingHeadYaw = -(STANCE_BODY_YAW - HEAD_LOOK_FORWARD) * toeDir;
  const headYawDeg = g.heading + turn * (1 - HEAD_HOLD) + restingHeadYaw;
  const headRelYaw = headYawDeg - g.pose.yaw - restingBodyYaw;
  const lookDown = LOOK_DOWN_OLLIE * g.air + LOOK_DOWN_GRIND * g.grind;
  const headDir = (d: V3) =>
    rotY(rotX(rotY(rotZ(d, lookDown), restingBodyYaw + headRelYaw), leanX * (1 - HEAD_STEADY)), g.pose.yaw);
  const neckTop = torsoPoint({ x: 0, y: -60, z: 0 });

  return {
    board: boardRigAt(g.center, g.pose, g.spin),
    legs: [leg(plans[0]), leg(plans[1])],
    arms: [arm('left'), arm('right')],
    torso: frameOf(torsoPoint({ x: 1, y: -14, z: 0 }), (d) => upperDir(d, torsoRelYaw)),
    head: frameOf(add3(neckTop, headDir({ x: 4, y: 0, z: 0 })), headDir),
    toeDir,
    flickZ: trick ? flickDir * g.flickOut * 9 * trick.style.flickStrength : 0,
    flickOut: g.flickOut,
    // The soles are on the grip unless the feet are up over a turning deck.
    onGrip: 1 - g.offDeck,
    bodyYawDeg,
    headYawDeg,
    hipOverDeck: g.overDeck,
  };
}

// ----- Slips -----

function moveRig(rig: Rig, by: V3): Rig {
  const mv = (p: V3) => add3(p, by);
  return {
    ...rig,
    board: { ...rig.board, center: mv(rig.board.center), point: (local) => mv(rig.board.point(local)) },
    legs: rig.legs.map((l) => ({ ...l, hip: mv(l.hip), knee: mv(l.knee), ankle: mv(l.ankle), shoe: moveFrame(l.shoe, by) })) as [LegRig, LegRig],
    arms: rig.arms.map((a) => ({ ...a, shoulder: mv(a.shoulder), elbow: mv(a.elbow), hand: mv(a.hand) })) as [ArmRig, ArmRig],
    torso: moveFrame(rig.torso, by),
    head: moveFrame(rig.head, by),
  };
}

/** A frame part way from `a` to `b`, kept square. */
function blendFrame(a: Frame3, b: Frame3, w: number): Frame3 {
  const fwd = norm3(lerp3(a.fwd, b.fwd, w));
  const side = norm3(cross3(lerp3(a.up, b.up, w), fwd));
  const up = cross3(fwd, side);
  return frameOf(lerp3(a.origin, b.origin, w), (d) => add3(add3(scale3(fwd, d.x), scale3(up, -d.y)), scale3(side, d.z)));
}

/** The knee nearest `near` that keeps both leg bones whole between `hip` and `ankle`. */
/** `ankle`, pulled toward `hip` if it's further than a straight leg reaches. */
function withinReach(hip: V3, ankle: V3): V3 {
  const d = sub3(ankle, hip);
  const len = Math.hypot(d.x, d.y, d.z);
  const reach = THIGH + SHIN - 1e-6;
  return len <= reach ? ankle : add3(hip, scale3(d, reach / len));
}

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

/**
 * Two poses of the same skeleton, blended joint by joint. The board is left
 * to the caller. `wholeLegs` keeps the knees where both leg bones stay whole,
 * for poses close enough that the knee never crosses the hip-ankle line.
 */
/**
 * Where a blended leg's knee points: `w` of the way round the hip-ankle line
 * from `a`'s knee to `b`'s. Swinging round the leg rather than cutting
 * straight across keeps the knee from flipping through the line when the
 * two poses bend it opposite ways.
 */
function swungKnee(hip: V3, ankle: V3, a: LegRig, b: LegRig, w: number): V3 {
  const axis = norm3(sub3(ankle, hip));
  const out = (leg: LegRig) => {
    const d = sub3(leg.knee, hip);
    return norm3(sub3(d, scale3(axis, dot3(d, axis))));
  };
  const from = out(a);
  const to = out(b);
  const turn = Math.atan2(dot3(cross3(from, to), axis), dot3(from, to)) * w;
  const swung = add3(scale3(from, Math.cos(turn)), scale3(cross3(axis, from), Math.sin(turn)));
  return add3(scale3(add3(hip, ankle), 0.5), swung);
}

function blendRig(a: Rig, b: Rig, w: number, wholeLegs = false): Rig {
  const lerp = (x: number, y: number) => x + (y - x) * w;
  return {
    ...b,
    legs: a.legs.map((l, i) => {
      const m = b.legs[i];
      const hip = lerp3(l.hip, m.hip, w);
      const ankle = lerp3(l.ankle, m.ankle, w);
      const knee = wholeLegs ? kneeBetween(hip, ankle, swungKnee(hip, ankle, l, m, w)) : lerp3(l.knee, m.knee, w);
      return { ...m, hip, knee, ankle, shoe: blendFrame(l.shoe, m.shoe, w) };
    }) as [LegRig, LegRig],
    arms: a.arms.map((arm, i) => {
      const m = b.arms[i];
      return { ...m, shoulder: lerp3(arm.shoulder, m.shoulder, w), elbow: lerp3(arm.elbow, m.elbow, w), hand: lerp3(arm.hand, m.hand, w) };
    }) as [ArmRig, ArmRig],
    torso: blendFrame(a.torso, b.torso, w),
    head: blendFrame(a.head, b.head, w),
    bodyYawDeg: lerp(a.bodyYawDeg, b.bodyYawDeg),
    headYawDeg: lerp(a.headYawDeg, b.headYawDeg),
    hipOverDeck: lerp(a.hipOverDeck, b.hipOverDeck),
  };
}

/** A rig turned `deg` about the vertical line through `at`. The board is left to the caller. */
function turnRig(rig: Rig, deg: number, at: V3): Rig {
  const pt = (p: V3) => add3(at, rotY(sub3(p, at), deg));
  const fr = (f: Frame3) => frameOf(pt(f.origin), (d) => rotY(add3(add3(scale3(f.fwd, d.x), scale3(f.up, -d.y)), scale3(f.side, d.z)), deg));
  return {
    ...rig,
    legs: rig.legs.map((l) => ({ ...l, hip: pt(l.hip), knee: pt(l.knee), ankle: pt(l.ankle), shoe: fr(l.shoe) })) as [LegRig, LegRig],
    arms: rig.arms.map((a) => ({ ...a, shoulder: pt(a.shoulder), elbow: pt(a.elbow), hand: pt(a.hand) })) as [ArmRig, ArmRig],
    torso: fr(rig.torso),
    head: fr(rig.head),
    bodyYawDeg: rig.bodyYawDeg + deg,
    headYawDeg: rig.headYawDeg + deg,
  };
}

/**
 * The shared flatground fall, `u` seconds after its touchdown. A rider spun
 * round by the entry trick falls as a fakie rider does, turned with them.
 */
function flatFall(u: number, plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle): Rig {
  const fall = plan.fall ?? 'slam';
  const ollie = ollieFor(plan);
  const spec = plan.spec.reversed ? { ...ollie, dir: -ollie.dir as 1 | -1 } : ollie;
  const rig = solveRig(computeFrame(ROLL_IN + FLIP_T + u, spec, false, fall, 0.65, style), spec, mechanics, style, fall);
  return plan.spec.reversed ? turnRig(rig, plan.heading, { x: X0, y: 0, z: 0 }) : rig;
}

export interface GrindRig {
  rig: Rig;
  frame: GrindFrame;
  falling: boolean;
}

/** Share of the hop onto the bar after which the flatground rider hands over to the grind's. */
const HANDOVER_FROM = 0.55;

/**
 * How close (world units) a flatground sole must be to the grip to be planted
 * on it, and past which it is left where the flatground rider holds it. The
 * flatground feet ride a flatground deck: a slightly different pop angle, and
 * a kick they rest a little into.
 */
const PLANT_HOLD = 8;
const PLANT_FREE = 16;

/**
 * Plant plain-hop feet on the grip. Entry tricks may lift their feet clear
 * of it, so only their nearby soles are planted; `k` releases the plant
 * while the entry deck turns under them.
 */
function planted(rig: Rig, board: BoardRig, k: number, allowLift: boolean): Rig {
  const ax = board.dir({ x: 1, y: 0, z: 0 });
  const ay = board.dir({ x: 0, y: 1, z: 0 });
  const legs = rig.legs.map((leg) => {
    const rel = sub3(leg.shoe.at(0, -SHOE_HALF_HEIGHT, 0), board.center);
    const x = dot3(rel, ax);
    const gap = dot3(rel, ay) - deckTopY(x);
    const kept = allowLift ? gap * smoothstep((Math.abs(gap) - PLANT_HOLD) / (PLANT_FREE - PLANT_HOLD)) : 0;
    // Only as far as the leg reaches: a foot pressing a popped end down
    // leaves it once the leg is straight.
    const ankle = withinReach(leg.hip, add3(leg.ankle, scale3(ay, (kept - gap) * k)));
    const by = sub3(ankle, leg.ankle);
    if (Math.hypot(by.x, by.y, by.z) < 1e-9) return leg;
    return { ...leg, knee: kneeBetween(leg.hip, ankle, leg.knee), ankle, shoe: moveFrame(leg.shoe, by) };
  }) as [LegRig, LegRig];
  return { ...rig, legs };
}

const ollieFor = (plan: GrindPlan) => specFor({ id: 'ollie', name: 'Ollie', base: 'Ollie', stance: plan.spec.stance });

/**
 * The hop onto the bar is ridden exactly as on flatground: roll-in, crouch,
 * pop, and the trick popped into the grind (an ollie for a plain grind) are
 * the flatground rig, carried along the hop's own path. Coming down onto the
 * bar the body hands over to the grind's.
 */
function withHop(rig: Rig, frame: GrindFrame, plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle): Rig {
  if (frame.t >= plan.lockAt) return rig;
  const tau = frame.t - plan.pop;
  const spec = plan.entry?.trick.spec ?? ollieFor(plan);
  const f = computeFrame(tau < 0 ? Math.max(0, frame.t) : hopClock(tau, plan.entryRate), spec, true, 'slam', 0.65, style);
  const carried = moveRig(solveRig(f, spec, mechanics, style, 'landed'), { x: 0, y: frame.ref.y - f.board.y, z: frame.ref.z });
  // Both bodies must face the same board heading before we blend them.
  // Flatground already supplies the entry trick's spin; add only the turn
  // into the lock. Otherwise a slide rotates the grip out from under feet
  // that still face straight ahead, which vertical planting cannot fix.
  const flat = turnRig(carried, frame.pose.yaw - frame.heading, frame.ref);
  const w = tau < 0 ? 0 : smoothstep((tau / plan.upT - HANDOVER_FROM) / (1 - HANDOVER_FROM));
  const body = planted(blendRig(flat, rig, w, true), boardRigAt(frame.center, frame.pose), 1 - frame.offDeck, plan.entry != null);
  return {
    ...body,
    flickZ: flat.flickZ + (rig.flickZ - flat.flickZ) * w,
    flickOut: flat.flickOut + (rig.flickOut - flat.flickOut) * w,
    onGrip: (rig.onGrip ?? 0) * w,
  };
}

export function solveGrindRig(time: number, plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle): GrindRig {
  if (plan.fail == null || time < plan.fail) {
    const frame = grindFrame(time, plan);
    return { rig: withHop(bodyOn(frame, plan, mechanics), frame, plan, mechanics, style), frame, falling: false };
  }
  const u = time - plan.fail;
  const at = grindFrame(plan.fail, plan);
  const onBar = bodyOn(at, plan, mechanics);
  // The rider comes down beside the bar, clear of it, on the slip's side.
  const hipZ = (onBar.legs[0].hip.z + onBar.legs[1].hip.z) / 2;
  const side = slipSide(plan);
  const clear = Math.max(FALL_CLEAR, Math.abs(hipZ - BAR_Z));
  const laneZ = BAR_Z + side * clear;
  const settle = sprawlsAway(plan) ? clear - FALL_SETTLE_CLEAR : 0;
  const fallen = (v: number) =>
    moveRig(flatFall(v, plan, mechanics, style), { x: 0, y: 0, z: laneZ - side * settle * smoothstep(v / FALL_SETTLE) });
  let body: Rig;
  if (u < plan.drop) {
    // Falling off the bar: the pose at the slip drops and drifts toward the
    // landing spot while it blends into the fall's first frame, and the feet
    // come off the grip.
    const w = smoothstep(u / plan.drop);
    const dropping = moveRig(onBar, { x: 0, y: 0.5 * GRAVITY * u * u, z: (laneZ - hipZ) * w });
    body = { ...blendRig(dropping, fallen(0), w), onGrip: 1 - w };
  } else {
    body = fallen(u - plan.drop);
  }
  const board = slipBoard(u, plan, at);
  return {
    rig: { ...body, board: boardRigAt(board.center, board.pose, at.spin) },
    frame: {
      ...at,
      t: time,
      phase: 'fall',
      center: board.center,
      pose: board.pose,
      load: 0,
      grind: 0,
      sway: 0,
      offDeck: 0,
      flickOut: 0,
      streetDist: grindStreetDist(time, plan),
      rail: at.rail * (1 - smoothstep(u / (plan.drop + 0.2))),
    },
    falling: true,
  };
}
