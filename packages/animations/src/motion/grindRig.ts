import type { SkateStyle } from '../types';
import { tailFirst, type RiderMechanics } from './stance';
import { FALL_T, GROUND, POP_RISE, ROLL_IN, X0, catchFraction, computeFrame, flightTime } from './trick';
import { GRAVITY } from '../units';
import { deckTopY } from '../board/board';
import { capsuleIntersectsBoard } from '../board/boardCollision';
import { PERSON_REACH, grownFrom } from '../riders/human/humanRig';
import {
  FALL_CLEAR,
  FALL_SETTLE,
  FALL_SETTLE_CLEAR,
  contentKey,
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
import { NO_SPIN, SHANK_AT, flatHop, ollieSpec, riderClock, spinTurn, type TrickSpin } from './grindTricks';
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
  smootherstep,
  smoothstep,
  sub3,
  type V3,
} from '../math';
import { kneeBetween, mapUpper, shiftRig, tipRig, turnRig, twistUpper } from './dynamics';
import { FLICK_STYLE_REACH, SETUP_HANG, SETUP_RAMP, measureTuck, solveRig, tuckAt, type Tuck, type TuckTrack } from './rig';
import { soleClearance } from './boardClearance';
import {
  ANKLE_LIFT,
  DECK_HALF_WIDTH,
  ARM_AIR,
  ARM_LAND,
  ARM_LOAD,
  ARM_RIDE,
  FOOT_OVER_SOLE,
  FOOT_RAKE,
  FOREARM,
  HEAD_STEADY,
  HIP_BACK,
  HIP_CENTER,
  HEAD_OFF_NECK,
  HIP_Z,
  KNEE_AIM_BACK,
  KNEE_AIM_FRONT,
  LAND_OMEGA,
  LEG_RADII,
  LEAN_REST,
  LEAN_SQUAT,
  LOOK_DOWN_OLLIE,
  NECK_TOP,
  PRE_WIND,
  RIDE_HEIGHT,
  SHOE_HALF_HEIGHT,
  SHOE_TOESIDE,
  SHOULDER,
  SQUAT_FLOOR,
  STANCE_BODY_YAW,
  SWITCH_ARMS,
  THIGH,
  SHIN,
  TOE_REACH,
  TORSO_ORIGIN,
  UPPER_ARM,
  armDirs,
  frameOf,
  mixPose,
  moveFrame,
  softFloor,
  solveLeg,
  upperBodyTurn,
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
 * (a flip or shuv popped into or out of the grind), or wrapped round the
 * scooping foot (an impossible's: spinTurn). The turn is inside the pose, so
 * the deck spins on the attitude it is riding at. `center` is where the pose
 * has the board; a wrap carries the deck's own middle off it.
 */
export function boardRigAt(center: V3, pose: BoardPose, spin: TrickSpin = NO_SPIN): BoardRig {
  const attitude = poseDir(pose);
  const turn = spin === NO_SPIN || (spin.flip === 0 && spin.yaw === 0 && !spin.rest && !spin.wrap) ? null : spinTurn(spin);
  const dir = turn ? (local: V3) => attitude(turn.dir(local)) : attitude;
  const point = turn ? (local: V3) => add3(center, attitude(turn.point(local))) : (local: V3) => add3(center, attitude(local));
  return {
    center: point({ x: 0, y: 0, z: 0 }),
    point,
    dir,
    flipDeg: pose.roll + spin.flip,
    yawDeg: pose.yaw + spin.yaw + (spin.wrap?.deg ?? 0),
    pitchDeg: pose.pitch,
  };
}

/**
 * An impossible's scooping foot keeps the spot it holds under its sole, as
 * on flatground (rig.ts): the deck goes where the foot takes that spot, as
 * firmly as it holds it. On the hop on the foot is the flatground rider's,
 * holding the flatground board; off the bar it's the grind's own.
 */
function heldBoard(rig: Rig, frame: GrindFrame, plan: GrindPlan): Rig {
  const wrap = frame.spin.wrap;
  const trick = frame.t < plan.off ? plan.entry : plan.exit;
  if (!wrap || wrap.hold <= 0 || !trick) return rig;
  const leg = rig.legs[trick.mechanics.popFoot === 'left' ? 0 : 1];
  const sole = leg.shoe.at(0, -SHOE_HALF_HEIGHT, 0);
  // The spot is the pivot on the deck's top, in the rider's axes (whatever the deck rests turned by):
  // the wrap leaves it where the scoop has it, turning the deck's top about it.
  const wrapped = spinTurn({ ...frame.spin, flip: 0, yaw: 0, rest: 0 });
  const under = add3(frame.center, poseDir(frame.pose)(wrapped.point({ x: wrap.pivot.x, y: deckTopY(wrap.pivot.x), z: wrap.pivot.z })));
  const by = scale3(sub3(sole, under), wrap.hold);
  return { ...rig, board: boardRigAt(add3(frame.center, by), frame.pose, frame.spin) };
}

/** 0 → 1: how far an exit flip's flicking foot has set up on the bar: in
 *  over SETUP_RAMP ahead of the pop off, handing over to the flick after. */
function exitSetup(t: number, off: number): number {
  return smoothstep((t - off + EXIT_SETUP_LEAD) / SETUP_RAMP) * (1 - smoothstep((t - off) / 0.35));
}

/**
 * 0 → 1: how far round to rolling tail first the rider is (stance.ts
 * tailFirst), through the spin onto the bar and then the one off it. The
 * rider's own spin is the heading less the approach's angle; the one off
 * starts with its wind-up on the bar.
 */
function rolling(g: GrindFrame, plan: GrindPlan): number {
  const from = plan.spec.dir === -1 ? 1 : 0;
  const spun = g.heading - g.approach;
  if (g.t < plan.off - (plan.spinOut?.lead ?? 0)) return tailFirst(from, plan.heading, spun);
  return tailFirst(tailFirst(from, plan.heading, plan.heading), plan.endHeading - plan.heading, spun - plan.heading);
}

/**
 * Where along the board (its yaw's x) the hips sit over a deck pitched
 * `pitch` along its length, down to the end on the bar, from `level`, where
 * they sit over a level one; and how much lower (physics y) that puts them.
 * The rider sinks back over that end, toward the lower foot, as far as both
 * legs then bend alike, `overDeck` over the deck under them: centered over a
 * blunt's 35 degrees, the leg down to the tail hangs straight and the other
 * folds up under the raised nose.
 */
function tippedHips(noseX: number, tailX: number, pitch: number, overDeck: number, level: number): { along: number; down: number } {
  if (!pitch) return { along: level, down: 0 };
  // The hips as far from one ankle as the other, `overDeck` over the deck pitched `p`.
  const even = (p: number) => {
    const ankle = (x: number) => rotZ({ x, y: deckTopY(x) - FOOT_OVER_SOLE - ANKLE_LIFT, z: 0 }, p);
    const n = ankle(noseX), t = ankle(tailX);
    const slope = Math.tan(rad(p));
    return (n.x * n.x + n.y * n.y - t.x * t.x - t.y * t.y + 2 * overDeck * (n.y - t.y)) / (2 * (n.x - t.x + slope * (n.y - t.y)));
  };
  const along = level + even(pitch) - even(0);
  return { along, down: along * Math.tan(rad(pitch)) };
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
  // An impossible's scooping foot stays down on the spot it holds, driving it
  // round (heldBoard keeps the deck under it); the other comes up off it.
  const wrap = g.spin.wrap;
  const holding = (side: 'left' | 'right') => (wrap && trick?.mechanics.popFoot === side ? wrap.hold : 0);
  // A kickflip flicks off the heelside rail, a heelflip off the toeside one.
  const flickDir = trick ? -trick.trick.spec.flipDir * toeDir : 0;
  const flickReach = trick ? DECK_HALF_WIDTH + 5 + FLICK_STYLE_REACH * trick.style.flickStrength : 0;
  const restingBodyYaw = -STANCE_BODY_YAW * toeDir;
  const bodyYawDeg = g.pose.yaw + restingBodyYaw;
  // The shoulders and head sit the way the board is rolling, as on flatground
  // (rig.ts): a spin onto the bar or off it carries them round with it.
  const rest = upperBodyTurn(plan.spec.stance === 'switch', rolling(g, plan));
  const chestYaw = -rest.chest * toeDir;
  // The board's own turn into the lock, past the rider's spin: the shoulders
  // and head hold back from this, not from a 180 the whole body made.
  const turn = g.pose.yaw - g.heading;
  // The board's heading without its tilt: the body and knees turn with it.
  const heading = (d: V3) => rotY(d, g.pose.yaw);

  // ----- Feet: soles on the grip, wherever the board is -----
  const footPlan = (side: 'left' | 'right') => {
    const isNose = mechanics.noseFoot === side;
    const held = holding(side);
    const scoop = held && wrap ? wrap.scoop : { x: 0, y: 0, z: 0 };
    const x = (isNose ? g.noseFoot : g.tailFoot) + scoop.x * held;
    // Same stance on the deck as the flatground rig: toes across toward
    // toeside, the front foot raked toward the nose.
    const rake = isNose ? FOOT_RAKE.nose : FOOT_RAKE.tail;
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
    // The sole sits FOOT_OVER_SOLE below the foot point (as solveRig places the shoe), on
    // the deck where the shoe's center is, which the toe reaches past the foot.
    const footY = deckTopY(x + toe.x * TOE_REACH) - FOOT_OVER_SOLE - feetLift * (1 - held) + scoop.y * held;
    const center: V3 = { x: x + toe.x * TOE_REACH, y: footY + FOOT_OVER_SOLE - SHOE_HALF_HEIGHT, z: lane + toe.z * TOE_REACH };
    const shoe = frameOf(board.point(center), (d) =>
      board.dir({ x: toe.x * d.x + along.x * d.z, y: d.y, z: toe.z * d.x + along.z * d.z }));
    const hipLocal: V3 = { x: 0, y: 0, z: side === 'left' ? -HIP_Z : HIP_Z };
    return { side, isNose, flicking, shoe, hipLocal, ankle: board.point({ x, y: footY - ANKLE_LIFT, z: lane }) };
  };
  const plans = [footPlan('left'), footPlan('right')] as const;

  // ----- Hips: between the feet, sliding back over the heels as they sink -----
  const squat = clamp01((RIDE_HEIGHT - g.overDeck) / (RIDE_HEIGHT - SQUAT_FLOOR));
  // Over a deck tipped down to the end on the bar (a blunt's tail, a 5-0's) the hips sink back over that
  // end; one hanging its other end down beside the bar (a smith's, a willy's) is stood on over the truck.
  const stand = g.stand ?? g.pose.pitch;
  const onLowEnd = Math.sign(plan.spec.contact.at.x) === Math.sign(stand);
  const tipped = tippedHips(g.noseFoot, g.tailFoot, onLowEnd ? stand : 0, g.overDeck, (HIP_CENTER * (g.noseFoot + g.tailFoot)) / 2);
  const shift = heading({ x: tipped.along, y: 0, z: -toeDir * HIP_BACK * squat });
  // Leaning down a handrail carries the hips ahead of the board, square to what the rider feels.
  if (g.lean) shift.x += Math.sin(rad(g.lean)) * g.overDeck;
  // The hips ride the un-snapped board, so a pop's snap is taken by the legs,
  // but never higher than both legs can still reach their feet from.
  let hipY = g.ref.y - g.overDeck + tipped.down * (g.sunk ?? 1);
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
  const torsoRelYaw = chestYaw - restingBodyYaw - turn * TWIST_HOLD + (1 - TWIST_HOLD) * g.lead + windUp;
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
  const guarded = plan.spec.stance === 'switch' ? (1 - g.air) * (1 - g.grind) : 0;
  const arm = (side: 'left' | 'right'): ArmRig => {
    const front = mechanics.frontArm === side;
    const role = front ? 'front' : 'back';
    const sideZ = side === 'left' ? -1 : 1;
    let pose = mixPose(ARM_RIDE[role], ARM_GRIND[role], g.grind);
    pose = mixPose(pose, ARM_LOAD[role], g.load);
    pose = mixPose(pose, ARM_AIR[role], g.air);
    pose = mixPose(pose, ARM_LAND[role], press);
    pose = {
      out: pose.out + (front ? 1 : -1) * SWAY_ARMS * g.sway + awkward * 10 * g.air + SWITCH_ARMS.out * guarded,
      swing: pose.swing,
      elbow: pose.elbow + awkward * 8 * g.air + SWITCH_ARMS.elbow * guarded,
    };
    const [upper, fore] = armDirs(pose, sideZ);
    const shoulder: V3 = { x: SHOULDER.x, y: SHOULDER.y, z: sideZ * SHOULDER.z };
    const elbow = add3(shoulder, scale3(upper, UPPER_ARM));
    const hand = add3(elbow, scale3(fore, FOREARM));
    return { side, shoulder: torsoPoint(shoulder), elbow: torsoPoint(elbow), hand: torsoPoint(hand) };
  };

  // ----- Head: looks down the bar, and down at it -----
  const headYawDeg = g.heading + turn * (1 - HEAD_HOLD) - rest.head * toeDir;
  const headRelYaw = headYawDeg - g.pose.yaw - restingBodyYaw;
  // Down a handrail the eyes go further down it, to the landing.
  const railLook = plan.handrail ? RAIL_LOOK * Math.abs(plan.handrail.tilt) : 0;
  const lookDown = LOOK_DOWN_OLLIE * g.air + (LOOK_DOWN_GRIND + railLook) * g.grind;
  const headDir = (d: V3) =>
    tip(rotY(rotX(rotY(rotZ(d, lookDown), restingBodyYaw + headRelYaw), leanX * (1 - HEAD_STEADY)), g.pose.yaw));
  const neckTop = torsoPoint(NECK_TOP);

  return {
    board: boardRigAt(g.center, g.pose, g.spin),
    legs: [leg(plans[0]), leg(plans[1])],
    arms: [arm('left'), arm('right')],
    torso: frameOf(torsoPoint(TORSO_ORIGIN), (d) => upperDir(d, torsoRelYaw)),
    head: frameOf(add3(neckTop, headDir(HEAD_OFF_NECK)), headDir),
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

/** A frame part way from `a` to `b`, kept square. */
function blendFrame(a: Frame3, b: Frame3, w: number): Frame3 {
  const fwd = norm3(lerp3(a.fwd, b.fwd, w));
  const side = norm3(cross3(lerp3(a.up, b.up, w), fwd));
  const up = cross3(fwd, side);
  return frameOf(lerp3(a.origin, b.origin, w), (d) => add3(add3(scale3(fwd, d.x), scale3(up, -d.y)), scale3(side, d.z)));
}

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

/** The knee between a hip and an ankle (dynamics.ts), as the fall code and the stages ask for it here. */
export { kneeBetween };

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

/**
 * A rider fallen off a handrail, lying on the steps below it: the flatground
 * fall (laid out on level ground) tipped along the steps' edges about the
 * hips and set down on them, wherever the slide has carried it to.
 */
function onSteps(rig: Rig, plan: GrindPlan, time: number): Rig {
  const hips = lerp3(rig.legs[0].hip, rig.legs[1].hip, 0.5);
  const s = railTrack(plan, time) + plan.spec.dir * (hips.x - X0);
  const tipped = tipRig(rig, restFall(plan, s, 40), { x: hips.x, y: GROUND, z: hips.z });
  return shiftRig(tipped, { x: 0, y: restY(plan, s) - GROUND, z: 0 });
}

/**
 * The shared flatground fall, `u` seconds after its touchdown. A rider spun
 * round by the entry trick falls as a fakie rider does, turned with them.
 */
function flatFall(u: number, plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle): Rig {
  const fall = plan.fall ?? 'slam';
  const ollie = ollieFor(plan);
  const spec = plan.spec.reversed ? { ...ollie, dir: -ollie.dir as 1 | -1 } : ollie;
  const rig = solveRig(computeFrame(ROLL_IN + flightTime(style) + u, spec, false, fall, SHANK_AT, style), spec, mechanics, style, fall);
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

/**
 * Share of the hop onto the bar after which the flatground rider hands over
 * to the grind's, done by the lock; with a trick in, the share of the way to
 * its catch, done by then: the feet come down on the deck where the lock has
 * them, and the grind's body takes the board down onto the bar from there.
 */
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

/**
 * How freely the feet may leave the deck `tau` after the pop: a trick's feet
 * stand on it up to the pop, follow the snap off it, then their flatground
 * paths. (The flatground rider starts a foot up ahead of the board needing
 * the room, which on a quick pop is before the pop.)
 */
const liftAllowed = (plan: GrindPlan, tau: number) => (plan.entry ? smoothstep(tau / POP_RISE) : 0);

const ollieFor = (plan: GrindPlan) => ollieSpec(plan.spec.stance);

/**
 * The hop onto the bar is ridden exactly as on flatground: roll-in, crouch,
 * pop, and the trick popped into the grind (an ollie for a plain grind) are
 * the flatground rig, carried along the hop's own path. This is that rider
 * at a frame, carried and turned onto the grind's board; null from the lock
 * on, where the grind's own body stands alone.
 */
function hopRider(frame: GrindFrame, plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle): Rig | null {
  if (frame.t >= plan.lockAt) return null;
  const tau = frame.t - plan.pop;
  const spec = plan.entry?.trick.spec ?? ollieFor(plan);
  const { f, rig } = flatHop(spec, tau < 0 ? Math.max(0, frame.t) : riderClock(style, tau, plan.entryRate), spunIn(plan.spinIn, tau), mechanics, style);
  // Carried by its board: the flatground board drifts ahead of X0 through the flight,
  // and the feet were tucked around it there, so they keep their place on it.
  const carried = shiftRig(rig, { x: frame.ref.x - f.board.x, y: frame.ref.y - f.board.y, z: frame.ref.z });
  // Both bodies must face the same board heading before we blend them.
  // Flatground already supplies the entry trick's spin; add only the turn
  // into the lock. Otherwise a slide rotates the grip out from under feet
  // that still face straight ahead, which vertical planting cannot fix.
  // The approach's angle in is the grind's own, not the flatground trick's: the body turns with it too.
  // Turning into the lock, the shoulders come round ahead of the board, as they do on the grind's own body.
  return twistUpper(turnRig(carried, frame.pose.yaw - frame.heading + frame.approach, frame.ref), (1 - TWIST_HOLD) * frame.lead);
}

/**
 * The grind's own body `rig` with the hop's flatground rider (hopRider)
 * blended over it: coming down onto the bar the body hands over to the
 * grind's. `place` puts the body's hips where they fly before the feet stand
 * on the deck under them.
 */
function withHop(
  rig: Rig,
  frame: GrindFrame,
  plan: GrindPlan,
  mechanics: RiderMechanics,
  style: SkateStyle,
  place = (body: Rig) => body,
  flat = hopRider(frame, plan, mechanics, style),
): Rig {
  if (!flat) return place(rig);
  const tau = frame.t - plan.pop;
  const w = tau < 0 ? 0 : smoothstep((tau / (plan.entry ? plan.entryCaught : plan.upT) - HANDOVER_FROM) / (1 - HANDOVER_FROM));
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

// ----- What an attempt measures once -----

/**
 * What an attempt measures once for a rider (the hops' arcs, the board's
 * tuck, a slip's sprawl), kept two ways: with the plan, for the lookup every
 * frame makes, and by what the attempt is (attemptKey), so an attempt planned
 * again (a stage re-planned for the same trick, a combo planned once more)
 * finds it too. Each is a pure function of the plan's numbers and the rider
 * and style playing it, so either way it's the same.
 */
interface AttemptCache<T> {
  byPlan: WeakMap<GrindPlan, Map<string, T>>;
  byAttempt: Map<string, T>;
}

const attemptCache = <T>(): AttemptCache<T> => ({ byPlan: new WeakMap(), byAttempt: new Map() });

/** Attempts kept by what they are, at most, as rig.ts keeps its tuck tracks: past it they start over. */
const ATTEMPTS_KEPT = 512;

/** Content keys → short ids, so a cache's keys stay short. Ids are never reused, so starting over only forgets. */
const ATTEMPT_IDS = new Map<string, number>();
const PLAN_IDS = new WeakMap<GrindPlan, number>();
let attemptCount = 0;

/** What an attempt is: the same id for every plan with the same numbers. */
function attemptKey(plan: GrindPlan): number {
  let id = PLAN_IDS.get(plan);
  if (id != null) return id;
  const key = contentKey(plan);
  id = ATTEMPT_IDS.get(key);
  if (id == null) {
    if (ATTEMPT_IDS.size >= ATTEMPTS_KEPT) ATTEMPT_IDS.clear();
    ATTEMPT_IDS.set(key, (id = ++attemptCount));
  }
  PLAN_IDS.set(plan, id);
  return id;
}

/** `make()`'s value for this attempt and `rider` (the rider and style's content key), made once. */
function cachedFor<T>(cache: AttemptCache<T>, plan: GrindPlan, rider: string, make: () => T): T {
  let byRider = cache.byPlan.get(plan);
  if (!byRider) cache.byPlan.set(plan, (byRider = new Map()));
  if (byRider.has(rider)) return byRider.get(rider) as T;
  const key = `${attemptKey(plan)} ${rider}`;
  let value: T;
  if (cache.byAttempt.has(key)) value = cache.byAttempt.get(key) as T;
  else {
    value = make();
    if (cache.byAttempt.size >= ATTEMPTS_KEPT) cache.byAttempt.clear();
    cache.byAttempt.set(key, value);
  }
  byRider.set(rider, value);
  return value;
}

const hipY = (rig: Rig) => (rig.legs[0].hip.y + rig.legs[1].hip.y) / 2;
const feetY = (rig: Rig) => (rig.legs[0].ankle.y + rig.legs[1].ankle.y) / 2;
const middle = (a: V3, b: V3) => scale3(add3(a, b), 0.5);
/** The hips' height on a rider grown `grow` times the rig over the same feet (riders/human/humanRig.ts). */
const grownHipY = (rig: Rig, grow: number) => grownFrom(middle(rig.legs[0].ankle, rig.legs[1].ankle), middle(rig.legs[0].hip, rig.legs[1].hip), grow).y;

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

const ARC_HOPS = attemptCache<ArcHop[]>();

function arcHops(plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle, grow: number): ArcHop[] {
  return cachedFor(ARC_HOPS, plan, contentKey([mechanics, style, grow]), () => measureArcHops(plan, mechanics, style, grow));
}

function measureArcHops(plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle, grow: number): ArcHop[] {
  // The fit below asks for the same moments more than once.
  const hips = new Map<number, number>();
  const hipAt = (t: number) => {
    let y = hips.get(t);
    if (y === undefined) hips.set(t, (y = grownHipY(untucked(t, plan, mechanics, style), grow)));
    return y;
  };
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
  return hops.map((hop, i): ArcHop => {
    const next = hops[i + 1];
    return { ...hop, soak: next == null ? ARC_SOAK : Math.max(0, Math.min(ARC_SOAK, next.start - next.push - hop.end)) };
  });
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

/**
 * The two bodies a frame's rider is made of: the grind's own, and the hop's
 * flatground rider over it before the lock (hopRider). Solving a person, the
 * rig and the person's arc both stand on these, so they're solved once.
 */
interface Bodies {
  frame: GrindFrame;
  own: Rig;
  flat: Rig | null;
}

function bodiesAt(time: number, plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle, frame = grindFrame(time, plan)): Bodies {
  return { frame, own: bodyOn(frame, plan, mechanics), flat: hopRider(frame, plan, mechanics, style) };
}

/** The body untucked, its hips where the arc has them (null: its own), and the feet on the deck under them. */
function flown(
  time: number,
  plan: GrindPlan,
  mechanics: RiderMechanics,
  style: SkateStyle,
  { frame, own, flat } = bodiesAt(time, plan, mechanics, style),
): { body: Rig; hipY: number | null } {
  let y: number | null = null;
  // The feet stand on the deck once, under the hips the arc has: a foot the body's own hips had to let up
  // off it (a leg at full stretch) stands on it again once lower ones reach, and a foot lifting for the
  // flick is held to the deck no longer than it is on flatground.
  const body = withHop(own, frame, plan, mechanics, style, (rig) => {
    y = arcHipY(rig, plan, mechanics, style, time, 1);
    return y == null ? rig : hipsAt(rig, y);
  }, flat);
  return { body: heldBoard(body, frame, plan), hipY: y };
}

/** World units over which a person's hips ease into the most their legs reach, held there by the robot's feet. */
const GROWN_EASE = 0.5;

/**
 * A person skates exactly the robot's board and feet, grown `grow` times the
 * rig over them (riders/human/humanRig.ts): the rig with the hips that draw
 * theirs at `y`, on their own arc, as high as their own legs reach those feet.
 */
function grownOver(rig: Rig, y: number, grow: number): Rig {
  let by = feetY(rig) + (y - feetY(rig)) / grow - hipY(rig);
  const feet = middle(rig.legs[0].ankle, rig.legs[1].ankle);
  const reach = PERSON_REACH * grow * (THIGH + SHIN);
  for (const leg of rig.legs) {
    // Their hip, grown up from between the ankles, over this ankle: the highest their straight leg lets it,
    // eased into over the last GROWN_EASE so they never stop dead.
    const d = sub3(grownFrom(feet, leg.hip, grow), leg.ankle);
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
  return { ...mapUpper(rig, mv, (f) => moveFrame(f, by)), legs };
}

// ----- Board tuck -----

/** Seconds between the moments a hop's tuck is measured at. */
const TUCK_STEP = 1 / 120;
/** Seconds over which a foot comes down into what of the board it stands in where the feet come down on it. */
const TUCK_ONTO = 0.1;
/** Seconds over which a foot standing in the board to pop off the bar comes up out of it: quickly, as the board turns under it. */
const TUCK_OFF = 0.05;

const HOP_TUCKS = attemptCache<TuckTrack>();

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
  return cachedFor(HOP_TUCKS, plan, contentKey([mechanics, style]), () => measureHopTuck(plan, mechanics, style));
}

function measureHopTuck(plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle): TuckTrack {
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
  // Off the bar the feet come down onto the board as it's caught, and ride it down from there.
  const caught = plan.exit && plan.fail == null
    ? Math.min(plan.land, plan.off + (catchFraction(plan.exit.style) * flightTime(plan.exit.style)) / plan.exitRate)
    : null;
  if (caught != null) hop(plan.off, caught);
  // A foot that stands partly in the board where the feet come down on it (a noseslide's toe over the
  // nose's kick, as it rides the whole slide; a heel on the tail's kick off the bar) comes down into
  // that much of it over the last TUCK_ONTO, not all at once; and one standing in it to pop off the bar
  // (the foot on the tail's kick) comes up out of it over the first TUCK_OFF.
  const allowed: [number[], number[]] = [times.map(() => 0), times.map(() => 0)];
  const allow = (from: number, to: number, at: number, share: (t: number) => number) => {
    const body = flown(at, plan, mechanics, style).body;
    const rest = body.legs.map((leg) => Math.max(0, soleClearance(body.board, leg.shoe, leg.shoe.up)));
    times.forEach((t, k) => {
      if (within[k][0] !== from || within[k][1] !== to) return;
      for (const i of [0, 1]) allowed[i][k] = Math.max(allowed[i][k], rest[i] * share(t));
    });
  };
  if (plan.entry) allow(plan.pop, plan.lockAt, plan.lockAt, (t) => smoothstep(1 - (plan.lockAt - t) / TUCK_ONTO));
  if (caught != null) {
    allow(plan.off, caught, plan.off, (t) => smoothstep(1 - (t - plan.off) / TUCK_OFF));
    allow(plan.off, caught, caught, (t) => smoothstep(1 - (caught - t) / TUCK_ONTO));
  }
  // An impossible's scooping foot stands on the spot it holds (heldBoard): only the other foot clears the deck.
  times.forEach((t, k) => {
    const trick = t < plan.off ? plan.entry : plan.exit;
    if (trick && (grindFrame(t, plan).spin.wrap?.hold ?? 0) > 0.5) allowed[trick.mechanics.popFoot === 'left' ? 0 : 1][k] = Infinity;
  });
  const rigs = times.map((t) => flown(t, plan, mechanics, style).body);
  return measureTuck(times, (k, tuck) => tucked(rigs[k], tuck), within, allowed);
}

function untucked(time: number, plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle, { frame, own, flat } = bodiesAt(time, plan, mechanics, style)): Rig {
  return withHop(own, frame, plan, mechanics, style, undefined, flat);
}

/** How much further in a slip off an edge rail lands (sprawlBack): one rider's, measured once. */
const SPRAWLS = attemptCache<number>();

/**
 * The rider on the grind at `time`. `grow` is how much bigger than the rig
 * the rider is drawn, over the same feet (PERSON_SCALE for a person), whose
 * hips fly the hop's arc.
 */
export function solveGrindRig(time: number, plan: GrindPlan, mechanics: RiderMechanics, style: SkateStyle, grow = 1): GrindRig {
  if (plan.fail != null && time >= plan.fail) return slipped(time, plan, plan.fail, mechanics, style);
  const bodies = bodiesAt(time, plan, mechanics, style);
  const { frame } = bodies;
  const { body, hipY: y } = flown(time, plan, mechanics, style, bodies);
  const track = hopTuck(plan, mechanics, style);
  let feet = body;
  if (track) {
    // The hips go back onto the arc over wherever the tuck has the feet.
    const lifted = tucked(body, tuckAt(track, time));
    feet = y == null ? lifted : hipsAt(lifted, y);
  }
  const rig = kneesClear(feet);
  if (grow === 1) return { rig, frame, falling: false };
  // A person flies their own arc over the same feet, off the same bodies.
  const grown = arcHipY(untucked(time, plan, mechanics, style, bodies), plan, mechanics, style, time, grow);
  return { rig: grown == null ? rig : grownOver(rig, grown, grow), frame, falling: false };
}

/** The rider at `time`, past the slip off the bar at `fail` (plan.fail): falling to the ground beside it. */
function slipped(time: number, plan: GrindPlan, fail: number, mechanics: RiderMechanics, style: SkateStyle): GrindRig {
  const u = time - fail;
  const at = grindFrame(fail, plan);
  const onBar = bodyOn(at, plan, mechanics);
  // The rider comes down beside the bar, clear of it, on the slip's side.
  const hipZ = (onBar.legs[0].hip.z + onBar.legs[1].hip.z) / 2;
  const side = slipSide(plan);
  const clear = Math.max(FALL_CLEAR, Math.abs(hipZ - BAR_Z));
  const back = cachedFor(SPRAWLS, plan, contentKey([mechanics, style]), () => sprawlBack(plan, mechanics, style, side));
  const laneZ = BAR_Z + side * (clear + back);
  const settle = sprawlsAway(plan) ? clear - FALL_SETTLE_CLEAR : 0;
  const fallen = (v: number) => {
    const rig = shiftRig(flatFall(v, plan, mechanics, style), { x: 0, y: 0, z: laneZ - side * settle * smoothstep(v / FALL_SETTLE) });
    return plan.handrail ? onSteps(rig, plan, time) : rig;
  };
  let body: Rig;
  if (u < plan.drop) {
    // Falling off the bar: the pose at the slip drops and drifts toward the
    // landing spot while it blends into the fall's first frame, and the feet
    // come off the grip.
    const w = smootherstep(u / plan.drop);
    // Off a handrail it was already sinking with the rail as it slipped.
    const dropping = shiftRig(onBar, { x: 0, y: 0.5 * GRAVITY * u * u + railSink(plan, fail) * u, z: (laneZ - hipZ) * w });
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
