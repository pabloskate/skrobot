import type { SkateStyle } from '../types';
import type { RiderMechanics } from './stance';
import { FALL_T, FLIP_T, GROUND, ROLL_IN, X0, computeFrame, specFor } from './trick';
import { deckTopY } from '../board/board';
import { LEG_RADII, capsuleIntersectsBoard } from '../board/boardCollision';
import {
  FALL_CLEAR,
  FALL_SETTLE,
  FALL_SETTLE_CLEAR,
  GRAVITY,
  grindFrame,
  grindStreetDist,
  poseDir,
  railSink,
  railTrack,
  restFall,
  restY,
  slipBoard,
  slipSide,
  sprawlsAway,
  spunIn,
  type BoardPose,
  type GrindFrame,
  type GrindPlan,
} from './grind';
import { BAR_Z } from './grindDefinitions';
import { NO_SPIN, hopClock, landingOnRail, type TrickSpin } from './grindTricks';
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
} from '../math';
import { POP_RISE, SETUP_HANG, SETUP_RAMP, TUCK_MARGIN, TUCK_SLACK, measureTuck, solveRig, tuckAt, type Tuck, type TuckTrack } from './rig';
import { soleClearance } from './boardClearance';
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
  LAND_OMEGA,
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
/** Degrees the head looks further down a handrail, per degree it falls. */
const RAIL_LOOK = 0.5;

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

/** 0 → 1: how far an exit flip's flicking foot has set up on the bar: in
 *  over SETUP_RAMP ahead of the pop off, handing over to the flick after. */
function exitSetup(t: number, off: number): number {
  return smoothstep((t - off + EXIT_SETUP_LEAD) / SETUP_RAMP) * (1 - smoothstep((t - off) / 0.35));
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
    const flick = flicking ? flickDir * g.flickOut * flickReach : 0;
    // Setting up a flip out of the grind, its flicking foot shuffles out on
    // the bar before the pop off, as on flatground (see rig.ts SETUP_HANG).
    const exit = plan.exit;
    const setup = exit && exit.trick.spec.flipDir && exit.mechanics.flickFoot === side
      ? -exit.trick.spec.flipDir * toeDir * SETUP_HANG * exitSetup(g.t, plan.off)
      : 0;
    const lane = toeDir * SHOE_TOESIDE - toe.z * TOE_REACH + (Math.abs(setup) > Math.abs(flick) ? setup : flick);
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
  // Leaning down a handrail carries the hips ahead of the board, square to what the rider feels.
  if (g.lean) shift.x += Math.sin(rad(g.lean)) * g.overDeck;
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
  // held back a little — or, turning into the lock, out ahead of it (`lead`)
  // until the board comes round past them. Into and out of a slide the
  // shoulders wind up against the turn that's coming.
  const leanX = -toeDir * (LEAN_REST + LEAN_SQUAT * squat);
  const spinWay = Math.sign(plan.lock.yaw - plan.heading);
  const windUp = plan.spec.slide ? (g.t < plan.lockAt ? -spinWay : spinWay) * PRE_WIND * g.load : 0;
  const torsoRelYaw = -turn * TWIST_HOLD + (1 - TWIST_HOLD) * g.lead + windUp;
  // Down a handrail, the whole upper body leans with the hips.
  const tip = (d: V3) => (g.lean ? rotZ(d, g.lean) : d);
  const upperDir = (d: V3, relYaw: number) => tip(rotY(rotX(rotY(d, restingBodyYaw + relYaw), leanX), g.pose.yaw));
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
    // The shin keeps above the shoe as it would on a level bar: down a handrail the
    // slope tips every foot alike, and leaning the knees round it whips them across.
    const shinUp = g.pose.fall ? rotZ(plan.shoe.up, -g.pose.fall) : plan.shoe.up;
    const solved = solveLeg(hip, plan.ankle, pole, shinUp, true);
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
  // Down a handrail the eyes go further down it, to the landing.
  const railLook = plan.handrail ? RAIL_LOOK * Math.abs(plan.handrail.tilt) : 0;
  const lookDown = LOOK_DOWN_OLLIE * g.air + (LOOK_DOWN_GRIND + railLook) * g.grind;
  const headDir = (d: V3) =>
    tip(rotY(rotX(rotY(rotZ(d, lookDown), restingBodyYaw + headRelYaw), leanX * (1 - HEAD_STEADY)), g.pose.yaw));
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
/** A point the knee should bend toward once `leg`'s ankle moves to
 *  `ankle`: the way it bent before, across the new hip-ankle line. (Its old
 *  position can end up on the new line, or past it, and flip the knee.) */
function bentAsBefore(leg: LegRig, ankle: V3): V3 {
  const axis = norm3(sub3(leg.ankle, leg.hip));
  const d = sub3(leg.knee, leg.hip);
  const out = sub3(d, scale3(axis, dot3(d, axis)));
  return add3(scale3(add3(leg.hip, ankle), 0.5), out);
}

/** `ankle`, pulled toward `hip` if it's further than a straight leg reaches,
 *  easing into that over the last REACH_EASE so the foot never stops dead. */
function withinReach(hip: V3, ankle: V3): V3 {
  const d = sub3(ankle, hip);
  const len = Math.hypot(d.x, d.y, d.z);
  const from = THIGH + SHIN - 1e-6 - REACH_EASE;
  if (len <= from) return ankle;
  return add3(hip, scale3(d, (from + REACH_EASE * Math.tanh((len - from) / REACH_EASE)) / len));
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
 * A rig's upper body twisted `deg` about the vertical line through its hips,
 * over legs that stay put: the shoulders and arms turn, and the head rides
 * along on the neck still looking where it was.
 */
function twistUpper(rig: Rig, deg: number): Rig {
  if (!deg) return rig;
  const at = lerp3(rig.legs[0].hip, rig.legs[1].hip, 0.5);
  const pt = (p: V3) => add3(at, rotY(sub3(p, at), deg));
  const fr = (f: Frame3) => frameOf(pt(f.origin), (d) => rotY(add3(add3(scale3(f.fwd, d.x), scale3(f.up, -d.y)), scale3(f.side, d.z)), deg));
  return {
    ...rig,
    arms: rig.arms.map((a) => ({ ...a, shoulder: pt(a.shoulder), elbow: pt(a.elbow), hand: pt(a.hand) })) as [ArmRig, ArmRig],
    torso: fr(rig.torso),
    head: moveFrame(rig.head, sub3(pt(rig.head.origin), rig.head.origin)),
  };
}

/** A rig tipped `deg` about the world's z through `at` (nose down for positive, as rotZ). The board is left to the caller. */
function tipRig(rig: Rig, deg: number, at: V3): Rig {
  if (!deg) return rig;
  const pt = (p: V3) => add3(at, rotZ(sub3(p, at), deg));
  const fr = (f: Frame3) => frameOf(pt(f.origin), (d) => rotZ(add3(add3(scale3(f.fwd, d.x), scale3(f.up, -d.y)), scale3(f.side, d.z)), deg));
  return {
    ...rig,
    legs: rig.legs.map((l) => ({ ...l, hip: pt(l.hip), knee: pt(l.knee), ankle: pt(l.ankle), shoe: fr(l.shoe) })) as [LegRig, LegRig],
    arms: rig.arms.map((a) => ({ ...a, shoulder: pt(a.shoulder), elbow: pt(a.elbow), hand: pt(a.hand) })) as [ArmRig, ArmRig],
    torso: fr(rig.torso),
    head: fr(rig.head),
  };
}

/**
 * A rider fallen off a handrail, lying on the steps below it: the flatground
 * fall (laid out on level ground) tipped along the steps' edges about the
 * hips and set down on them, wherever the slide has carried it to.
 */
function onSteps(rig: Rig, plan: GrindPlan, time: number): Rig {
  const hips = lerp3(rig.legs[0].hip, rig.legs[1].hip, 0.5);
  const s = railTrack(plan, time) + plan.spec.dir * (hips.x - X0);
  const tipped = tipRig(rig, restFall(plan, s, 40), { x: hips.x, y: GROUND, z: hips.z });
  return moveRig(tipped, { x: 0, y: restY(plan, s) - GROUND, z: 0 });
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

/**
 * Off a rail at the edge of the stairs a slip falls back onto the steps,
 * even when the fall sprawls the other way, back toward the rail: the lane
 * sits as much further in as the sprawl carries the hips, so the body comes
 * to rest clear of the rail. Anywhere else the slip side follows the sprawl.
 */
function sprawlBack(plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle, side: 1 | -1): number {
  if (!plan.handrail?.rail.edge || sprawlsAway(plan)) return 0;
  const hipsZ = (rig: Rig) => (rig.legs[0].hip.z + rig.legs[1].hip.z) / 2;
  const toward = hipsZ(flatFall(FALL_T, plan, mechanics, style)) - hipsZ(flatFall(0, plan, mechanics, style));
  return Math.max(0, -side * toward);
}

export interface GrindRig {
  rig: Rig;
  frame: GrindFrame;
  falling: boolean;
}

/** Seconds before the pop off the bar that an exit flip starts setting up. */
const EXIT_SETUP_LEAD = 0.45;

/** Share of the hop onto the bar after which the flatground rider hands over to the grind's. */
const HANDOVER_FROM = 0.55;

/**
 * How close (world units) a flatground sole must be to the grip to be planted
 * on it, and past which it is left where the flatground rider holds it. The
 * flatground feet ride a flatground deck: a slightly different pop angle, and
 * a kick they rest a little into.
 */
const PLANT_HOLD = 8;
/** How far short of a straight leg a planted foot starts easing off the deck. */
const REACH_EASE = 4;
const PLANT_FREE = 16;

/**
 * Plant plain-hop feet on the grip. Entry tricks may lift their feet clear
 * of it, so only their nearby soles are planted; `k` releases the plant
 * while the entry deck turns under them.
 */
function planted(rig: Rig, board: BoardRig, k: number, allowLift: number): Rig {
  const ax = board.dir({ x: 1, y: 0, z: 0 });
  const ay = board.dir({ x: 0, y: 1, z: 0 });
  const legs = rig.legs.map((leg) => {
    const rel = sub3(leg.shoe.at(0, -SHOE_HALF_HEIGHT, 0), board.center);
    const x = dot3(rel, ax);
    const gap = dot3(rel, ay) - deckTopY(x);
    const kept = allowLift * gap * smoothstep((Math.abs(gap) - PLANT_HOLD) / (PLANT_FREE - PLANT_HOLD));
    // Only as far as the leg reaches: a foot pressing a popped end down
    // leaves it once the leg is straight.
    const ankle = withinReach(leg.hip, add3(leg.ankle, scale3(ay, (kept - gap) * k)));
    const by = sub3(ankle, leg.ankle);
    if (Math.hypot(by.x, by.y, by.z) < 1e-9) return leg;
    return { ...leg, knee: kneeBetween(leg.hip, ankle, bentAsBefore(leg, ankle)), ankle, shoe: moveFrame(leg.shoe, by) };
  }) as [LegRig, LegRig];
  return { ...rig, legs };
}

/** How freely the feet may leave the deck `tau` after the pop: a trick's feet follow a quicker scoop, then their flatground paths. */
const liftAllowed = (plan: GrindPlan, tau: number) => (plan.entry ? (plan.popInRise < POP_RISE ? smoothstep(tau / POP_RISE) : 1) : 0);

const ollieFor = (plan: GrindPlan) => specFor({ id: 'ollie', name: 'Ollie', base: 'Ollie', stance: plan.spec.stance });

/**
 * The hop onto the bar is ridden exactly as on flatground: roll-in, crouch,
 * pop, and the trick popped into the grind (an ollie for a plain grind) are
 * the flatground rig, carried along the hop's own path. Coming down onto the
 * bar the body hands over to the grind's. `place` puts the body's hips
 * where they fly before the feet stand on the deck under them.
 */
function withHop(rig: Rig, frame: GrindFrame, plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle, place = (body: Rig) => body): Rig {
  if (frame.t >= plan.lockAt) return place(rig);
  const tau = frame.t - plan.pop;
  const spec = plan.entry?.trick.spec ?? ollieFor(plan);
  const f = landingOnRail(computeFrame(tau < 0 ? Math.max(0, frame.t) : hopClock(tau, plan.entryRate), spec, true, 'slam', 0.65, style), spec, spunIn(plan.spinIn, tau));
  // Carried by its board: the flatground board drifts ahead of X0 through the flight,
  // and the feet were tucked around it there, so they keep their place on it.
  const carried = moveRig(solveRig(f, spec, mechanics, style, 'landed'), { x: frame.ref.x - f.board.x, y: frame.ref.y - f.board.y, z: frame.ref.z });
  // Both bodies must face the same board heading before we blend them.
  // Flatground already supplies the entry trick's spin; add only the turn
  // into the lock. Otherwise a slide rotates the grip out from under feet
  // that still face straight ahead, which vertical planting cannot fix.
  // The approach's angle in is the grind's own, not the flatground trick's: the body turns with it too.
  // Turning into the lock, the shoulders come round ahead of the board, as they do on the grind's own body.
  const flat = twistUpper(turnRig(carried, frame.pose.yaw - frame.heading + frame.approach, frame.ref), (1 - TWIST_HOLD) * frame.lead);
  const w = tau < 0 ? 0 : smoothstep((tau / plan.upT - HANDOVER_FROM) / (1 - HANDOVER_FROM));
  // Follow a quicker scoop with the feet, then release them onto their
  // flatground paths as its snap rejoins the shared animation.
  const body = planted(place(blendRig(flat, rig, w, true)), boardRigAt(frame.center, frame.pose), 1 - frame.offDeck, liftAllowed(plan, tau));
  return {
    ...body,
    flickZ: flat.flickZ + (rig.flickZ - flat.flickZ) * w,
    flickOut: flat.flickOut + (rig.flickOut - flat.flickOut) * w,
    onGrip: (rig.onGrip ?? 0) * w,
  };
}

const hipY = (rig: Rig) => (rig.legs[0].hip.y + rig.legs[1].hip.y) / 2;
const feetY = (rig: Rig) => (rig.legs[0].ankle.y + rig.legs[1].ankle.y) / 2;
/** The hips' height on a rider grown `grow` times the rig over the same feet (riders/human/humanRig.ts). */
const grownHipY = (rig: Rig, grow: number) => feetY(rig) + grow * (hipY(rig) - feetY(rig));

/** Seconds the legs' push up into a takeoff takes from the crouch, at least and at most. */
const PUSH_MIN = 0.06;
const PUSH_MAX = 0.2;
/** Seconds, at most, the knees take to soak up a landing the body arrived at faster than it rides away. */
const ARC_SOAK = 0.4;

/**
 * A hop the rider flies, in the drawn rider's hip heights: leaving at `y0`
 * at `start` with `rise` (upward speed), arriving at `end`. The legs push
 * the hips up into it over `push` seconds, from `from` moving at `fromV`
 * (physics y, down). `land` is how much faster downward the arc arrives
 * than the body's own hips ride away, which the knees soak up over `soak`.
 */
interface ArcHop { start: number; end: number; y0: number; rise: number; push: number; from: number; fromV: number; land: number; soak: number }

const ARC_HOPS = new WeakMap<GrindPlan, Map<string, ArcHop[]>>();

function arcHops(plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle, grow: number): ArcHop[] {
  let byRider = ARC_HOPS.get(plan);
  if (!byRider) ARC_HOPS.set(plan, (byRider = new Map()));
  const key = JSON.stringify([mechanics, style, grow]);
  const known = byRider.get(key);
  if (known) return known;
  const hipAt = (t: number) => grownHipY(untucked(t, plan, mechanics, style), grow);
  const dt = 1 / 240;
  const spans = [[plan.pop, plan.lockAt], ...(plan.fail == null ? [[plan.off, plan.land]] : [])];
  const hops = spans.map(([start, end], i) => {
    const span = end - start;
    // The arc leaves from the body's hips as they stand on the deck at the pop: the flatground
    // body springs into its pop pose on the pop itself, hips up further than its legs reach the deck.
    const y0 = hipAt(start - 1e-4);
    const y1 = hipAt(end);
    const rise = (y0 - y1 + 0.5 * GRAVITY * span * span) / span;
    // The push takes over from the body's hips at the bottom of their crouch,
    // however they move from there to the pop (up and down again, or up in a
    // frame): one rise into the arc's launch speed. It starts earlier if it
    // must to slow into the arc no harder than gravity, the legs only pushing.
    const longest = Math.min(PUSH_MAX, start - (spans[i - 1]?.[1] ?? -Infinity));
    let push = PUSH_MIN;
    let low = hipAt(start - push);
    for (let back = PUSH_MIN + dt; back <= longest; back += dt) {
      const y = hipAt(start - back);
      if (y > low) [push, low] = [back, y];
    }
    const pushFrom = (back: number) => ({ from: hipAt(start - back), fromV: (hipAt(start - back + dt) - hipAt(start - back - dt)) / (2 * dt) });
    let fit = push;
    for (let pass = 0; pass < 3; pass++) {
      // The length that ends the push slowing at gravity's own rate (the cubic's end, solved).
      const { from, fromV } = pushFrom(fit);
      const b = 4 * rise - 2 * fromV;
      const reach = b * b + 24 * GRAVITY * (from - y0);
      fit = Math.min(longest, Math.max(PUSH_MIN, reach > 0 ? (Math.sqrt(reach) - b) / (2 * GRAVITY) : 0));
    }
    push = Math.max(push, fit);
    const { from, fromV } = pushFrom(push);
    return { start, end, y0, rise, push, from, fromV, land: GRAVITY * span - rise - (hipAt(end + dt) - y1) / dt };
  });
  const arcs = hops.map((hop, i): ArcHop => {
    const next = hops[i + 1];
    return { ...hop, soak: next == null ? ARC_SOAK : Math.max(0, Math.min(ARC_SOAK, next.start - next.push - hop.end)) };
  });
  byRider.set(key, arcs);
  return arcs;
}

/**
 * Off the ground onto the bar, and off the bar to the ground, the rider is
 * the free body: the hips fly gravity's arc from where the pop leaves them to
 * where the landing takes them, nothing pushing them higher on the way. The
 * legs take up whatever the board does under them: tucked up over it, then
 * pushing it down onto the bar. The push into the pop meets the arc's launch
 * speed, and the knees soak up what the arc comes down with.
 *
 * They are the hips of the rider as drawn, `grow` times the rig over the
 * same feet (a person's, humanRig.ts), whose legs reach that much farther:
 * drawn on the rig's arc, a person's hips would rise as the feet pushed the
 * board down. This is their height at `time` (physics y), or null where the
 * body's own hips are left as they are.
 */
function arcHipY(rig: Rig, plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle, time: number, grow: number): number | null {
  if (plan.fail != null && time >= plan.fail) return null;
  let offset = 0;
  for (const hop of arcHops(plan, mechanics, style, grow)) {
    if (time > hop.start && time < hop.end) {
      const tau = time - hop.start;
      return hop.y0 - hop.rise * tau + 0.5 * GRAVITY * tau * tau;
    }
    if (time <= hop.start && time > hop.start - hop.push) {
      const x = (time - hop.start + hop.push) / hop.push;
      return (2 * x * x * x - 3 * x * x + 1) * hop.from
        + (x * x * x - 2 * x * x + x) * hop.fromV * hop.push
        + (3 * x * x - 2 * x * x * x) * hop.y0
        - (x * x * x - x * x) * hop.rise * hop.push;
    }
    if (time >= hop.end && time < hop.end + hop.soak) {
      const u = time - hop.end;
      offset += hop.land * u * Math.exp(-LAND_OMEGA * u) * (1 - smoothstep(u / hop.soak));
    }
  }
  return offset ? grownHipY(rig, grow) + offset : null;
}

/** The body untucked, its hips where the arc has them (null: its own), and the feet on the deck under them. */
function flown(time: number, plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle): { body: Rig; hipY: number | null } {
  const frame = grindFrame(time, plan);
  let y: number | null = null;
  // The feet stand on the deck once, under the hips the arc has: a foot the body's own hips had to let up
  // off it (a leg at full stretch) stands on it again once lower ones reach, and a foot lifting for the
  // flick is held to the deck no longer than it is on flatground.
  const body = withHop(bodyOn(frame, plan, mechanics), frame, plan, mechanics, style, (rig) => {
    y = arcHipY(rig, plan, mechanics, style, time, 1);
    return y == null ? rig : hipsAt(rig, y);
  });
  return { body, hipY: y };
}

/** Of a person's straight leg, the most riders/human/humanRig.ts lets reach before it pulls their hips in. */
const GROWN_REACH = 0.995;
/** World units over which a person's hips ease into the most their legs reach, held there by the robot's feet. */
const GROWN_EASE = 0.5;

/**
 * A person skates exactly the robot's board and feet, grown `grow` times the
 * rig over them (riders/human/humanRig.ts): the rig with the hips that draw
 * theirs at `y`, on their own arc, as high as their own legs reach those feet.
 */
function grownOver(rig: Rig, y: number, grow: number): Rig {
  let by = feetY(rig) + (y - feetY(rig)) / grow - hipY(rig);
  const feet = scale3(add3(rig.legs[0].ankle, rig.legs[1].ankle), 0.5);
  const reach = GROWN_REACH * grow * (THIGH + SHIN);
  for (const leg of rig.legs) {
    // Their hip, grown up from between the ankles, over this ankle: the highest their straight leg lets it,
    // eased into over the last GROWN_EASE so they never stop dead.
    const d = sub3(add3(feet, scale3(sub3(leg.hip, feet), grow)), leg.ankle);
    const top = (-Math.sqrt(Math.max(0, reach * reach - d.x * d.x - d.z * d.z)) - d.y) / grow;
    const x = (by - top) / GROWN_EASE;
    if (x < 1) by = top + GROWN_EASE * Math.exp(x - 1);
  }
  return hipsAt(rig, hipY(rig) + by, false);
}

/** World units, at most, the hips are held up over a leg that would sink into the board. */
const KNEES_CLEAR_MAX = 16;

/**
 * The hips go down no further than the legs clear the board: soaking up a
 * landing on a deck rolled up toward a knee (a crooked's), or folded over a
 * deck turning in under it (a noseblunt's), the knee stops where it meets the
 * board, and the hips over it. Raised only as far as that takes.
 */
function kneesClear(rig: Rig): Rig {
  const into = (r: Rig) => r.legs.some((leg) => capsuleIntersectsBoard(r.board, leg.knee, leg.ankle, LEG_RADII.knee, LEG_RADII.ankle)
    || capsuleIntersectsBoard(r.board, leg.hip, leg.knee, LEG_RADII.hip, LEG_RADII.knee));
  if (!into(rig)) return rig;
  const y = hipY(rig);
  if (into(hipsAt(rig, y - KNEES_CLEAR_MAX))) return rig;
  let lo = 0, hi = KNEES_CLEAR_MAX;
  for (let pass = 0; pass < 16; pass++) {
    const mid = (lo + hi) / 2;
    if (into(hipsAt(rig, y - mid))) lo = mid;
    else hi = mid;
  }
  return hipsAt(rig, y - hi);
}

/** The rig with its upper body raised or lowered to put the hips at `y`, the feet where they were (pulled in if a leg can't reach, unless `reach` is false). */
function hipsAt(rig: Rig, y: number, reach = true): Rig {
  const by = { x: 0, y: y - hipY(rig), z: 0 };
  if (Math.abs(by.y) < 1e-9) return rig;
  const mv = (p: V3) => add3(p, by);
  const legs = rig.legs.map((leg) => {
    const hip = mv(leg.hip);
    const ankle = reach ? withinReach(hip, leg.ankle) : leg.ankle;
    const knee = kneeBetween(hip, ankle, bentAsBefore({ ...leg, hip, knee: mv(leg.knee), ankle: mv(leg.ankle) }, ankle));
    return { ...leg, hip, knee, ankle, shoe: reach ? moveFrame(leg.shoe, sub3(ankle, leg.ankle)) : leg.shoe };
  }) as [LegRig, LegRig];
  return {
    ...rig,
    legs,
    arms: rig.arms.map((a) => ({ ...a, shoulder: mv(a.shoulder), elbow: mv(a.elbow), hand: mv(a.hand) })) as [ArmRig, ArmRig],
    torso: moveFrame(rig.torso, by),
    head: moveFrame(rig.head, by),
  };
}

// ----- Board tuck -----

/** Seconds between the moments a hop's tuck is measured at. */
const TUCK_STEP = 1 / 120;
/** Seconds before the lock over which a foot comes down into what of the board the lock itself stands it in. */
const TUCK_ONTO = 0.1;

const HOP_TUCKS = new WeakMap<GrindPlan, Map<string, TuckTrack>>();

/**
 * The rider's legs with each foot (left, right) lifted along its sole's up.
 * The knee swings with the leg: its bend turns as the hip-to-ankle line does,
 * so a foot drawn up across the body folds the leg without whipping the knee
 * round it.
 */
function tucked(rig: Rig, tuck: Tuck): Rig {
  if (!tuck[0] && !tuck[1]) return rig;
  const legs = rig.legs.map((leg, i) => {
    if (!tuck[i]) return leg;
    const by = scale3(leg.shoe.up, tuck[i]);
    const ankle = add3(leg.ankle, by);
    const from = norm3(sub3(leg.ankle, leg.hip));
    const to = norm3(sub3(ankle, leg.hip));
    const bend = sub3(leg.knee, leg.hip);
    const out = norm3(sub3(bend, scale3(from, dot3(bend, from))));
    // The shortest turn from the old line to the new, applied to the bend.
    const axis = cross3(from, to);
    const sin = Math.hypot(axis.x, axis.y, axis.z);
    const cos = dot3(from, to);
    const turned = sin < 1e-9 ? out : add3(
      add3(scale3(out, cos), scale3(cross3(scale3(axis, 1 / sin), out), sin)),
      scale3(axis, (dot3(axis, out) / (sin * sin)) * (1 - cos)),
    );
    const knee = kneeBetween(leg.hip, ankle, add3(scale3(add3(leg.hip, ankle), 0.5), turned));
    return { ...leg, knee, ankle, shoe: moveFrame(leg.shoe, by) };
  }) as [LegRig, LegRig];
  return { ...rig, legs };
}

/**
 * The board tucks the feet on a trick's hop onto the bar and off it, as on
 * flatground (rig.ts measureTuck), measured once per attempt against the
 * board the grind draws. The hop on wears the flatground rider, tucked around
 * the flatground board, but the grind's board isn't that board: the pop
 * pitches it about the bar's line rather than the deck's (so a half-turned
 * deck locks like any other), which puts the other end up once a shuv is past
 * half way, and it turns into the lock. Off the bar the grind's own feet only
 * lift a set height over a deck rolling a flip under them.
 */
function hopTuck(plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle): TuckTrack | null {
  if (!plan.entry && !plan.exit) return null;
  let byRider = HOP_TUCKS.get(plan);
  if (!byRider) HOP_TUCKS.set(plan, (byRider = new Map()));
  const key = JSON.stringify([mechanics, style]);
  const known = byRider.get(key);
  if (known) return known;
  // The feet only leave the deck in the air: on the bar, and on the ground, they stand on it.
  const times: number[] = [];
  const within: Array<readonly [number, number]> = [];
  const hop = (from: number, to: number) => {
    const n = Math.max(1, Math.ceil((to - from) / TUCK_STEP));
    for (let k = 0; k <= n; k++) {
      times.push(from + ((to - from) * k) / n);
      within.push([from, to]);
    }
  };
  if (plan.entry) hop(plan.pop, plan.lockAt);
  if (plan.exit && plan.fail == null) hop(plan.off, plan.land);
  const rigs = times.map((t) => flown(t, plan, mechanics, style).body);
  const track = measureTuck(times, (k, tuck) => tucked(rigs[k], tuck), undefined, within);
  if (plan.entry) {
    // A foot the lock stands partly in the board (a noseslide's toe over the nose's kick, as it rides the
    // whole slide) comes down into that much of it over the last TUCK_ONTO, not all at once on the lock.
    const lock = flown(plan.lockAt, plan, mechanics, style).body;
    const rest = lock.legs.map((leg) => {
      const left = soleClearance(lock.board, leg.shoe, leg.shoe.up);
      return left > TUCK_SLACK ? left + TUCK_MARGIN : 0;
    });
    times.forEach((t, k) => {
      if (within[k][1] !== plan.lockAt) return;
      const onto = smoothstep(1 - (plan.lockAt - t) / TUCK_ONTO);
      for (const i of [0, 1]) track.need[i][k] = Math.max(0, track.need[i][k] - rest[i] * onto);
    });
  }
  byRider.set(key, track);
  return track;
}

function untucked(time: number, plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle): Rig {
  const frame = grindFrame(time, plan);
  return withHop(bodyOn(frame, plan, mechanics), frame, plan, mechanics, style);
}

/**
 * The rider on the grind at `time`. `grow` is how much bigger than the rig
 * the rider is drawn, over the same feet (PERSON_SCALE for a person), whose
 * hips fly the hop's arc.
 */
export function solveGrindRig(time: number, plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle, grow = 1): GrindRig {
  if (grow !== 1) {
    const own = solveGrindRig(time, plan, mechanics, style);
    const y = own.falling ? null : arcHipY(untucked(time, plan, mechanics, style), plan, mechanics, style, time, grow);
    return y == null ? own : { ...own, rig: grownOver(own.rig, y, grow) };
  }
  if (plan.fail == null || time < plan.fail) {
    const frame = grindFrame(time, plan);
    const { body, hipY: y } = flown(time, plan, mechanics, style);
    const track = hopTuck(plan, mechanics, style);
    if (!track) return { rig: kneesClear(body), frame, falling: false };
    // The hips go back onto the arc over wherever the tuck has the feet.
    const rig = tucked(body, tuckAt(track, time));
    return { rig: kneesClear(y == null ? rig : hipsAt(rig, y)), frame, falling: false };
  }
  const u = time - plan.fail;
  const at = grindFrame(plan.fail, plan);
  const onBar = bodyOn(at, plan, mechanics);
  // The rider comes down beside the bar, clear of it, on the slip's side.
  const hipZ = (onBar.legs[0].hip.z + onBar.legs[1].hip.z) / 2;
  const side = slipSide(plan);
  const clear = Math.max(FALL_CLEAR, Math.abs(hipZ - BAR_Z));
  const laneZ = BAR_Z + side * (clear + sprawlBack(plan, mechanics, style, side));
  const settle = sprawlsAway(plan) ? clear - FALL_SETTLE_CLEAR : 0;
  const fallen = (v: number) => {
    const rig = moveRig(flatFall(v, plan, mechanics, style), { x: 0, y: 0, z: laneZ - side * settle * smoothstep(v / FALL_SETTLE) });
    return plan.handrail ? onSteps(rig, plan, time) : rig;
  };
  let body: Rig;
  if (u < plan.drop) {
    // Falling off the bar: the pose at the slip drops and drifts toward the
    // landing spot while it blends into the fall's first frame, and the feet
    // come off the grip.
    const w = smoothstep(u / plan.drop);
    // Off a handrail it was already sinking with the rail as it slipped.
    const dropping = moveRig(onBar, { x: 0, y: 0.5 * GRAVITY * u * u + railSink(plan, plan.fail) * u, z: (laneZ - hipZ) * w });
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
