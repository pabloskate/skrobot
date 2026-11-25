import { add3, cross3, dot3, lerp3, norm3, scale3, sub3, turnAbout, type V3 } from '../../math';
import { carriedFrame } from '../dynamics';
import { ARM_RADII, HAND_RADIUS, LEG_RADII, SHOE_HALF_HEIGHT, SHOE_HALF_LENGTH, SHOE_HALF_WIDTH, type Frame3, type Rig } from '../skeleton';
import type { BodyDims } from './body';
import { CHEST, PERSON_SKULL, ROBOT_HEAD } from './rollOut';

/**
 * Where a body's own parts are inside one another: the legs and arms as the
 * tapered capsules they're drawn as, the chest and a robot's head as rounded
 * boxes, a person's skull as a ball. A fall that poses limbs in the world
 * (a foot held to the ground, a hand reaching for it) checks the pose here,
 * so a thigh can't be drawn through the chest it hangs from.
 */

/** A ball on a limb: where, how big, and which part it's on. */
interface Ball {
  at: V3;
  r: number;
}

type Solid = (p: V3) => number;

/** Distance outside a rounded box in `frame` (negative: inside it). */
const roundedBox = (frame: Frame3, center: V3, half: readonly [number, number, number], round: number): Solid => p => {
  const d = sub3(p, center);
  const q = [Math.abs(dot3(d, frame.fwd)) - (half[0] - round), Math.abs(dot3(d, frame.up)) - (half[1] - round), Math.abs(dot3(d, frame.side)) - (half[2] - round)];
  return Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)) + Math.min(Math.max(q[0], q[1], q[2]), 0) - round;
};

/** Balls along a tapered capsule from `a` to `b`, over the share of it from `from` to 1. */
function along(a: V3, b: V3, ra: number, rb: number, from = 0, count = 6): Ball[] {
  const balls: Ball[] = [];
  for (let i = 0; i < count; i++) {
    const k = from + (1 - from) * i / (count - 1);
    balls.push({ at: lerp3(a, b, k), r: ra + (rb - ra) * k });
  }
  return balls;
}

/** A shoe, as balls down its middle and at its four corners' rounding. */
function shoeBalls(shoe: Frame3, k: number): Ball[] {
  const r = SHOE_HALF_HEIGHT * k;
  const reach = (SHOE_HALF_LENGTH - SHOE_HALF_HEIGHT) * k;
  const out = (SHOE_HALF_WIDTH - SHOE_HALF_HEIGHT) * k;
  const balls: Ball[] = [];
  for (const f of [-1, -1 / 3, 1 / 3, 1]) for (const s of [-1, 1]) balls.push({ at: shoe.at(f * reach, 0, s * out), r });
  return balls;
}

export interface SelfContact {
  /** How far the deepest limb is into the trunk or head (negative: all clear of them, by this much). */
  trunk: number;
  /** How far the two legs are into each other at their deepest. */
  legs: number;
  /** How far an arm is into the chest, head or a leg at its deepest. */
  arms: number;
}

/**
 * The share of a thigh, from the hip, that's the hip itself: the joint sits
 * inside the chest's rounded bottom, so only the thigh past it can be through
 * the chest. Likewise an upper arm at its shoulder.
 */
const HIP_SOCKET = 0.45;
const SHOULDER_SOCKET = 0.6;

function deepest(balls: Ball[], solid: Solid): number {
  let depth = -Infinity;
  for (const ball of balls) depth = Math.max(depth, ball.r - solid(ball.at));
  return depth;
}

function between(a: Ball[], b: Ball[]): number {
  let depth = -Infinity;
  for (const p of a) for (const q of b) {
    depth = Math.max(depth, p.r + q.r - Math.hypot(p.at.x - q.at.x, p.at.y - q.at.y, p.at.z - q.at.z));
  }
  return depth;
}

/** The chest and head as solids. */
export function trunkSolids(rig: Rig, body: BodyDims): { chest: Solid; head: Solid } {
  const k = body.scale;
  const { torso, head } = rig;
  const chest = roundedBox(torso, torso.at(0, CHEST.raise * k, 0), [CHEST.half[0] * k, CHEST.half[1] * k, CHEST.half[2] * k], CHEST.r * k);
  if (k === 1) return { chest, head: roundedBox(head, head.origin, ROBOT_HEAD.half, ROBOT_HEAD.r) };
  const skull = head.at(PERSON_SKULL.f, PERSON_SKULL.u, 0);
  return { chest, head: p => Math.hypot(p.x - skull.x, p.y - skull.y, p.z - skull.z) - PERSON_SKULL.r };
}

/** One leg past its hip socket, as balls: thigh, shin and shoe. */
export function legBalls(leg: Rig['legs'][number], k: number): Ball[] {
  return [
    ...along(leg.hip, leg.knee, LEG_RADII.hip * k, LEG_RADII.knee * k, HIP_SOCKET),
    ...along(leg.knee, leg.ankle, LEG_RADII.knee * k, LEG_RADII.ankle * k),
    ...shoeBalls(leg.shoe, k),
  ];
}

/** One arm past its shoulder, as balls: upper arm, forearm and hand. */
export function armBalls(arm: Rig['arms'][number], k: number): Ball[] {
  return [
    ...along(arm.shoulder, arm.elbow, ARM_RADII.shoulder * k, ARM_RADII.elbow * k, SHOULDER_SOCKET, 3),
    ...along(arm.elbow, arm.hand, ARM_RADII.elbow * k, ARM_RADII.wrist * k, 0, 4),
    { at: arm.hand, r: HAND_RADIUS * k },
  ];
}

export function selfContact(rig: Rig, body: BodyDims): SelfContact {
  const k = body.scale;
  const { chest, head } = trunkSolids(rig, body);
  const legs = rig.legs.map(leg => legBalls(leg, k));
  const arms = rig.arms.map(arm => armBalls(arm, k));
  return {
    trunk: Math.max(...legs.map(leg => Math.max(deepest(leg, chest), deepest(leg, head)))),
    legs: between(legs[0], legs[1]),
    arms: Math.max(...arms.map(arm => Math.max(deepest(arm, chest), deepest(arm, head), between(arm, legs[0]), between(arm, legs[1])))),
  };
}

/** The most the legs are spread from each other (degrees). */
const SPREAD_MOST = 30;
/** Passes of spreading them by as much as takes their deepest point out: each is as smooth as the pose, so a leg never snaps. */
const PASSES = 4;

/** A leg turned about an axis through its hip. */
export function turnLeg(leg: Rig['legs'][number], axis: V3, degrees: number): Rig['legs'][number] {
  const point = (p: V3) => add3(leg.hip, turnAbout(sub3(p, leg.hip), axis, degrees));
  return { ...leg, knee: point(leg.knee), ankle: point(leg.ankle), shoe: carriedFrame(leg.shoe, point, d => turnAbout(d, axis, degrees)) };
}

const degrees = (radians: number) => (radians * 180) / Math.PI;

/** The rig with its legs spread at the hips, each out to its own side, by as much as they're in each other. */
export function legsApart(rig: Rig, body: BodyDims, loose: number): Rig {
  if (loose <= 0) return rig;
  const k = body.scale;
  const hipLine = norm3(sub3(rig.legs[1].hip, rig.legs[0].hip));
  // About the axis square to its thigh and the hips' line.
  const abduct = (leg: Rig['legs'][number], deg: number) => {
    const axis = cross3(sub3(leg.knee, leg.hip), hipLine);
    const size = Math.hypot(axis.x, axis.y, axis.z);
    return size < 1e-3 ? leg : turnLeg(leg, scale3(axis, 1 / size), deg);
  };
  let spread = 0;
  const parted = (deg: number) => [abduct(rig.legs[0], -deg), abduct(rig.legs[1], deg)] as Rig['legs'];
  for (let pass = 0; pass < PASSES; pass++) {
    const pair = parted(spread);
    const into = between(legBalls(pair[0], k), legBalls(pair[1], k));
    if (into <= 0) break;
    spread = Math.min(SPREAD_MOST, spread + degrees(into / 2 / (0.6 * (body.thigh + body.shin))));
  }
  return spread > 0 ? { ...rig, legs: parted(spread * loose) } : rig;
}
