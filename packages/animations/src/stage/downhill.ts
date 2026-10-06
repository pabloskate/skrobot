import type { HeadPose } from '../types';
import { FOLLOW_POP, LIGHT, fallSink } from '../camera/camera';
import { ASPHALT } from '../camera/view';
import { wheelRoll } from '../board/board';
import { clearFeet } from '../board/footContact';
import { rad, type V3 } from '../math';
import { handrailHeight, railTrack, type GrindPlan } from '../motion/grind';
import { kneeBetween, solveGrindRig } from '../motion/grindRig';
import { solveRig } from '../motion/rig';
import { LAND_OMEGA, LAND_ZETA, SQUAT_FLOOR, moveFrame, type Frame3, type LegRig, type Rig } from '../motion/skeleton';
import { GROUND, X0, computeFrame } from '../motion/trick';
import { bankRig } from './bank';
import {
  landingImpact,
  stairClock,
  stairDeckHeight,
  stairTrack,
  terrainSurface,
  stairLift,
  type StairPlan,
} from '../sets/elToro/stairs';
import { dustPuffs, expressionAt, grindExpression, groundLift, hipsOf, onTheGround, posed, riderShadows, DUST_T, type Puff, type StageFrame } from './frameParts';
import type { StagePlan } from './stage';

/**
 * Frames down a stair set: a flatground trick down the stairs (stairFrame),
 * and a grind down its handrail (railFrame). Both solve the motion exactly
 * as on flat ground, turn a backwards approach round whole so every attempt
 * goes downhill, and then put it on the slope: the set slides by how far
 * down it the rider is, the crane follows the board down, dust kicks up off
 * the top landing and the bottom one, and shadows fall on the steps.
 */

/**
 * Face a backwards flatground approach down the fixed +x stair set. This
 * is a rigid half-turn about the rider's origin, never a reflection: the
 * same physical feet, flick and FS/BS rotations survive in the new heading.
 * Transform point functions and frame axes together so collision checks,
 * normals, attached geometry and shadows all see the same world-space rig.
 */
function reverseHeading(rig: Rig): Rig {
  const point = (p: V3): V3 => ({ x: 2 * X0 - p.x, y: p.y, z: -p.z });
  const direction = (d: V3): V3 => ({ x: -d.x, y: d.y, z: -d.z });
  const frame = (f: Frame3): Frame3 => ({
    origin: point(f.origin),
    fwd: direction(f.fwd),
    up: direction(f.up),
    side: direction(f.side),
    at: (forward, up, side) => point(f.at(forward, up, side)),
  });
  return {
    ...rig,
    board: {
      ...rig.board,
      center: point(rig.board.center),
      point: (local) => point(rig.board.point(local)),
      dir: (local) => direction(rig.board.dir(local)),
      yawDeg: rig.board.yawDeg + 180,
    },
    legs: rig.legs.map((l) => ({ ...l, hip: point(l.hip), knee: point(l.knee), ankle: point(l.ankle), shoe: frame(l.shoe) })) as Rig['legs'],
    arms: rig.arms.map((a) => ({ ...a, shoulder: point(a.shoulder), elbow: point(a.elbow), hand: point(a.hand) })) as Rig['arms'],
    torso: frame(rig.torso),
    head: frame(rig.head),
    toeDir: rig.toeDir === 1 ? -1 : 1,
    flickZ: -rig.flickZ,
    bodyYawDeg: rig.bodyYawDeg + 180,
    headYawDeg: rig.headYawDeg + 180,
  };
}

/** The whole rider and board, moved by a world-space offset. */
function shiftRig(rig: Rig, by: V3): Rig {
  const move = (p: V3): V3 => ({ x: p.x + by.x, y: p.y + by.y, z: p.z + by.z });
  return {
    ...rig,
    board: { ...rig.board, center: move(rig.board.center), point: (local) => move(rig.board.point(local)) },
    legs: rig.legs.map((l) => ({ ...l, hip: move(l.hip), knee: move(l.knee), ankle: move(l.ankle), shoe: moveFrame(l.shoe, by) })) as [LegRig, LegRig],
    arms: rig.arms.map((a) => ({ ...a, shoulder: move(a.shoulder), elbow: move(a.elbow), hand: move(a.hand) })) as Rig['arms'],
    torso: moveFrame(rig.torso, by),
    head: moveFrame(rig.head, by),
  };
}

/**
 * The landing after a drop. The flatground rig's touchdown spring takes the
 * speed its own pop arrives with; the drop arrives faster, so the knees take
 * the difference too: the body sinks further into the landing, on the same
 * spring, never past the deepest squat the legs allow.
 */
function absorbDrop(rig: Rig, stairs: StairPlan, t: number, popHeight: number): Rig {
  const u = t - stairs.land;
  if (u <= 0) return rig;
  const wd = LAND_OMEGA * Math.sqrt(1 - LAND_ZETA * LAND_ZETA);
  const sink = (landingImpact(stairs, popHeight) / wd) * Math.exp(-LAND_ZETA * LAND_OMEGA * u) * Math.sin(wd * u);
  const room = Math.max(0, rig.hipOverDeck - SQUAT_FLOOR - 1);
  const e = sink > 0 && room > 0 ? room * Math.tanh(sink / room) : 0;
  if (e < 1e-3) return rig;
  const by = { x: 0, y: e, z: 0 };
  const down = (p: V3): V3 => ({ x: p.x, y: p.y + e, z: p.z });
  return {
    ...rig,
    legs: rig.legs.map((l) => {
      const hip = down(l.hip);
      return { ...l, hip, knee: kneeBetween(hip, l.ankle, down(l.knee)) };
    }) as [LegRig, LegRig],
    arms: rig.arms.map((a) => ({ ...a, shoulder: down(a.shoulder), elbow: down(a.elbow), hand: down(a.hand) })) as Rig['arms'],
    torso: moveFrame(rig.torso, by),
    head: moveFrame(rig.head, by),
    hipOverDeck: rig.hipOverDeck - e,
  };
}

/**
 * Seconds either side the camera averages the drop over, and how far ahead
 * of the rider it runs down the stairs. It rises with part of the pop, as
 * the flatground crane does, then eases down the stairs like a
 * filmer who knows where the landing is: arriving late would leave a
 * zoomed-in frame no room under the board at touchdown.
 */
const CAMERA_FOLLOW = 0.05;
const CAMERA_LEAD = 0.03;

/**
 * The crane's height going downhill, from the deck's height over the top
 * landing at each moment (`deckHeight`): up with part of the pop or the hop
 * onto a rail, never ahead of it, then down the slope a little ahead of the
 * board, smoothed so the camera never jerks at the pop or the landing.
 */
function craneDownhill(deckHeight: (t: number) => number, t: number): number {
  let sum = 0;
  let total = 0;
  for (let k = -6; k <= 6; k++) {
    const w = Math.exp(-((k / 2.4) ** 2) / 2);
    const spread = (k / 2.4) * CAMERA_FOLLOW;
    sum += w * (FOLLOW_POP * Math.max(0, deckHeight(t + spread)) + Math.min(0, deckHeight(t + CAMERA_LEAD + spread)));
    total += w;
  }
  return sum / total;
}

/**
 * The height (over the top landing) of the ground the sun casts a point's
 * shadow on: down the sun's line from `p` until it meets a step, `u` being
 * the rider's distance down the stairs.
 */
function shadowGround(p: V3, u: number, dir: 1 | -1, ground: (u: number, z: number) => number, across: number): number {
  const at = (s: number) => {
    const q = { x: p.x - LIGHT.x * s, y: p.y - LIGHT.y * s, z: p.z - LIGHT.z * s };
    return { up: ASPHALT - q.y, ground: ground(u + dir * (q.x - X0), across + q.z) };
  };
  let lo = 0;
  let hi = 0;
  for (let s = 4; s < 3000; s += 4) {
    const q = at(s);
    if (q.up <= q.ground) {
      hi = s;
      break;
    }
    lo = s;
  }
  if (hi === 0) return at(lo).ground;
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    const q = at(mid);
    if (q.up <= q.ground) hi = mid;
    else lo = mid;
  }
  return at(hi).ground;
}

/** The level (over the top landing) the rider's shadows fall at: the step the sun casts the middle of them onto. */
function shadowLevel(rig: Rig, u: number, dir: 1 | -1, ground: (u: number, z: number) => number, across = 0): number {
  const hips = hipsOf(rig);
  return shadowGround({ x: (hips.x + rig.board.center.x) / 2, y: (hips.y + rig.board.center.y) / 2, z: (hips.z + rig.board.center.z) / 2 }, u, dir, ground, across);
}

/**
 * One frame of a gap trick down a spot's stairs or onto its bank. The trick and
 * the rider are solved exactly as on flat ground, on the stairs' stretched
 * clock (stairClock), turned together for a backwards approach, then carried
 * down the drop together; the street rolls at the stairs' speed.
 */
export function stairFrame(stage: StagePlan, stairs: StairPlan, t: number, rate: number, headPose?: HeadPose | null): StageFrame {
  const { spec, mechanics, style, landed, fall, shankProgress } = stage;
  const clock = Math.max(0, Math.min(t, stage.end));
  const at = (time: number) => computeFrame(stairClock(stairs, time), spec, landed, fall, shankProgress, style);
  const f = at(clock);
  // Distance down the stairs (the lip at 0), and the street rolled by it.
  const track = (time: number) => stairTrack(stairs, time, time < 0 ? time : at(Math.min(time, stage.end)).streetDist);
  const route = track(t);
  const u = route.x;
  const dir = stairs.dir;
  // The rider is solved on flat ground and then carried down by `drop`; the
  // ground pass keeps the board out of the steps as they lie before that
  // carry (a low pop off the lip rises slower than its flatground arc, and
  // would otherwise sink the tail into the top landing).
  const ground = (x: number, z: number) => terrainSurface(stairs.terrain, x, z);
  const drop = stairLift(stairs, clock, style.popHeight, u);
  const stepUnder = (p: V3) => ASPHALT - (ground(u + dir * (p.x - X0), route.z + p.z) - drop);
  const flat = solveRig(f, spec, mechanics, style, landed ? 'landed' : fall);
  const heading = spec.dir === -1 ? 180 : 0;
  const downhill = heading ? reverseHeading(flat) : flat;
  const solved = clearFeet(onTheGround(downhill, stairs.terrain.slope ? undefined : stepUnder));
  const absorbed = absorbDrop(solved, stairs, clock, style.popHeight);
  const banked = bankRig(posed(absorbed, stage.skater, headPose), stairs, clock, u, route.yaw);
  const carried = shiftRig(banked, { x: 0, y: -drop, z: 0 });
  // Feet already cleared the grip before the rigid bank transform. Resolve
  // terrain contact by carrying this complete posed skeleton, not by solving
  // its knees again with robot bone lengths after humanRig has sized them.
  const clearance = stairs.terrain.slope ? groundLift(carried, p => ASPHALT - ground(u + p.x - X0, route.z + p.z)) : 0;
  const rig = clearance > 0 ? shiftRig(carried, { x: 0, y: -clearance, z: 0 }) : carried;
  const falling = !landed && f.motion.flight >= 1;
  const headHeight = GROUND - solved.head.origin.y;
  const lift = craneDownhill((time) => stairDeckHeight(stairs, time), clock) - (falling ? fallSink(headHeight) : 0);

  const touchdownTravel = track(stairs.land).travel;
  // Wheel angles are board-local: turning the entire rider must not reverse
  // the backwards roll inside that frame, including after a 180-degree trick.
  const roll = (d: number) => wheelRoll(d, touchdownTravel, spec.dir, rig.board.yawDeg + route.yaw - heading);
  const angle = roll(route.travel);

  // Dust off the lip at the pop and off the bottom at touchdown, left behind where it was kicked up.
  const dust: Puff[] = [];
  const kick = (from: number, along: number, ground: number, strength: number) => {
    const p = (clock - from) / DUST_T;
    const origin = track(from);
    if (p >= 0 && p < 1) dust.push(...dustPuffs(p,
      X0 + along * Math.cos(rad(origin.yaw)) + origin.x - u,
      strength, along * Math.sin(rad(origin.yaw)) + origin.z - route.z, ground));
  };
  kick(stairs.pop, spec.dir * (spec.nollie ? 32 : -32), ASPHALT, 0.8);
  kick(stairs.land, 0, ASPHALT - ground(stairs.terrain.run + stairs.terrain.landPast, stairs.terrain.laneZ), landed ? 1 : 0.8);

  const shadowY = shadowLevel(rig, u, dir, ground, route.z);
  return {
    t,
    rig,
    lift,
    scroll: u * dir,
    span: null,
    stairs: { dir, shadowY, across: route.z },
    wheels: { angle, sweep: angle - roll(track(t - rate / 60).travel) },
    expression: headPose?.expression ?? expressionAt(f.t, landed),
    dust,
    shadows: riderShadows(rig, {
      board: Math.max(0, stairDeckHeight(stairs, clock) - shadowY),
      body: Math.max(0, GROUND - f.body.y + drop - 60 - shadowY),
    }, ASPHALT - shadowY),
  };
}

/**
 * One frame of a grind down a set's handrail. The grind is solved as on the
 * flat bar with the rail's slope and speed-up (grind.ts), turned round whole
 * for a fakie approach so every grind goes down the same stairs, and set
 * over the rail it rides (the center one, or a side one). The set's own
 * rails cast their shadows per pixel.
 */
export function railFrame(stage: StagePlan, plan: GrindPlan, t: number, rate: number, headPose?: HeadPose | null): StageFrame {
  const { mechanics, style } = stage;
  const rail = plan.handrail!.rail;
  const grind = solveGrindRig(t, plan, mechanics, style);
  // How far down the stairs the rider is; the grind's own travel is down them either way round.
  const u = railTrack(plan, t);
  const heading = plan.spec.dir === -1 ? 180 : 0;
  const downhill = heading ? reverseHeading(grind.rig) : grind.rig;
  const stepUnder = (p: V3) => ASPHALT - rail.ground(u + (p.x - X0));
  const solved = clearFeet(onTheGround(downhill, stepUnder));
  // A person's arms keep off the steps under them (along their edges), not the top landing far above.
  const hipsAlong = u + hipsOf(solved).x - X0;
  const rig = posed(solved, stage.skater, headPose, ASPHALT - rail.rest(hipsAlong));
  // A fallen head is low over the steps under it, not under the top landing.
  const headHeight = GROUND - solved.head.origin.y - rail.rest(u + solved.head.origin.x - X0);
  const lift = craneDownhill((time) => handrailHeight(plan, time), t) - (grind.falling ? fallSink(headHeight) : 0);

  // Wheels spin with the travel down the rail as along the flat bar.
  const roll = (d: number) => wheelRoll(d, Infinity, plan.spec.dir, 0);
  const angle = roll(u);

  // Dust off the top landing at the pop, and the bottom one at touchdown or a slip; left where it was kicked up.
  const dust: Puff[] = [];
  const across = (z: number) => (heading ? -z : z);
  const kick = (from: number, x: number, z: number, strength: number) => {
    const p = (t - from) / DUST_T;
    const at = railTrack(plan, from);
    if (p >= 0 && p < 1) dust.push(...dustPuffs(p, x - (u - at), strength, z, ASPHALT - rail.ground(at + x - X0)));
  };
  const hips = hipsOf(rig);
  kick(plan.pop, X0 + plan.spec.dir * (plan.spec.popNose ? 32 : -32), across(plan.laneZ), 0.8);
  if (plan.fail == null) kick(plan.land, X0, across(plan.lockCenter.z), 1);
  else kick(plan.fail + plan.drop, hips.x, hips.z, 0.8);

  const shadowY = shadowLevel(rig, u, 1, rail.ground);
  return {
    t,
    rig,
    lift,
    scroll: u,
    span: null,
    stairs: { dir: 1, shadowY, across: stage.rail?.z ?? 0 },
    wheels: { angle, sweep: angle - roll(railTrack(plan, t - rate / 60)) },
    expression: headPose?.expression ?? grindExpression(t, plan),
    dust,
    shadows: riderShadows(rig, {
      board: Math.max(0, GROUND - rig.board.center.y - shadowY),
      body: Math.max(0, GROUND - hips.y - 60 - shadowY),
    }, ASPHALT - shadowY),
  };
}
