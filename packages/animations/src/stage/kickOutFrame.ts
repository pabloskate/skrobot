import { wheelRoll } from '../board/board';
import { clearFeet } from '../board/footContact';
import { cameraLift, fallSink } from '../camera/camera';
import { ASPHALT } from '../camera/view';
import { smoothstep, type V3 } from '../math';
import { bodyDims } from '../motion/fall/body';
import { boardAt, boardRigOf } from '../motion/fall/boardBody';
import { TAKEOVER_LEAD, hipsAt, kickOutAt, offLineRig, planKickOut, type KickOutPlan, type KickOutSetup } from '../motion/fall/kickOut';
import { UP } from '../motion/fall/footing';
import { STEP_OFF_JUMP } from '../motion/fall/stepOff';
import { IDENTITY, type Quat } from '../motion/fall/rotation';
import { travel } from '../motion/grind';
import { solveRig } from '../motion/rig';
import { SHOE_HALF_HEIGHT, type Rig } from '../motion/skeleton';
import { GROUND, ROLL_IN, X0, boardGlued, catchFraction, computeFrame, flightTime } from '../motion/trick';
import { stairDeckHeight, terrainSurface, type StairPlan } from '../sets/elToro/stairs';
import { GRAVITY } from '../units';
import { shiftRig, stairCrane, stairRig, stairShadowLevel } from './downhill';
import { stageArms } from './armLift';
import { kickedUp, onTheGround, posed, riderShadows, type StageFrame } from './frameParts';
import type { StagePlan } from './stage';

/**
 * A kick-out on the stage (motion/fall/kickOut.ts): up to the takeover it's
 * the landed attempt with the board turned off its line (stage.ts and
 * downhill.ts draw those frames); from there the rider and board are the
 * kick-out's, worked out where they really are (on the street, or at a
 * spot down its drop) and moved back into the frame by a camera that
 * follows the rider.
 */

/** Whether an attempt on this stage is a kick-out: on flat ground, or down a spot's drop. */
export const isKickOut = (stage: StagePlan) => !stage.landed && stage.fall === 'kickout' && !stage.grind;

/** The rider and board solved as the landed attempt has them at clock `t`, the board turned by `error`, on the stage. */
export function attemptRig(stage: StagePlan, t: number, error: Quat): Rig {
  const { spec, mechanics, style, fall, shankProgress } = stage;
  const f = computeFrame(t, spec, true, fall, shankProgress, style);
  return clearFeet(onTheGround(offLineRig(solveRig(f, spec, mechanics, style, 'landed'), error)));
}

/** The street's scroll under the landed attempt at clock `t`. */
const landedScroll = (stage: StagePlan, t: number) =>
  travel(computeFrame(t, stage.spec, true, stage.fall, stage.shankProgress, stage.style).streetDist) * stage.spec.dir;

/** How far the landed attempt's wheels have turned at clock `t`. */
const landedWheel = (stage: StagePlan, t: number) =>
  wheelRoll(travel(computeFrame(t, stage.spec, true, stage.fall, stage.shankProgress, stage.style).streetDist), travel(ROLL_IN + flightTime(stage.style)), stage.spec.dir, 0);

/** About how thick the limbs and body are round a joint (world units, a robot's), for how far off the ground the body is. */
const JOINT_RADIUS = 6;

/** How far the lowest part of a rider on their own is off the ground: the soles, or rolling, whatever's down. */
export function lowestOver(rig: Rig, ground: (x: number, z: number) => number, scale: number): number {
  const lowestSole = Math.min(...rig.legs.map((leg) => ground(leg.shoe.origin.x, leg.shoe.origin.z) - leg.shoe.origin.y - SHOE_HALF_HEIGHT));
  const joints = [rig.head.origin, rig.torso.origin, ...rig.arms.flatMap((arm) => [arm.shoulder, arm.elbow, arm.hand]), ...rig.legs.flatMap((leg) => [leg.hip, leg.knee])];
  return Math.min(lowestSole, ...joints.map((p) => ground(p.x, p.z) - p.y - JOINT_RADIUS * scale));
}

/** The camera's natural frequency following the rider (rad/s): critically damped, and led by their speed so it doesn't lag. */
const FOLLOW = 6;

/**
 * Where the camera has the frame from the takeover on: how far along (x)
 * and across (z) the street or the spot it's moved, following the rider's
 * hips. Sampled with the run.
 */
export interface Follow {
  start: number;
  dt: number;
  x: number[];
  z: number[];
}

export function followRider(plan: KickOutPlan, from: { x: number; vx: number; z: number; vz: number }): Follow {
  const { takeover } = plan;
  const dt = plan.run.dt;
  const hips0 = hipsAt(plan, takeover).hips;
  const offset = { x: hips0.x - from.x, z: hips0.z - from.z };
  const x: number[] = [];
  const z: number[] = [];
  let s = { x: from.x, z: from.z };
  let v = { x: from.vx, z: from.vz };
  for (let t = takeover; t <= plan.setup.end + dt; t += dt) {
    x.push(s.x);
    z.push(s.z);
    const { hips, velocity } = hipsAt(plan, t);
    const a = {
      x: FOLLOW * FOLLOW * (hips.x - offset.x - s.x) + 2 * FOLLOW * (velocity.x - v.x),
      z: FOLLOW * FOLLOW * (hips.z - offset.z - s.z) + 2 * FOLLOW * (velocity.z - v.z),
    };
    v = { x: v.x + a.x * dt, z: v.z + a.z * dt };
    s = { x: s.x + v.x * dt, z: s.z + v.z * dt };
  }
  return { start: takeover, dt, x, z };
}

export function followAt(follow: Follow, t: number): { x: number; z: number } {
  const at = Math.max(0, Math.min(follow.x.length - 1, (t - follow.start) / follow.dt));
  const i = Math.min(follow.x.length - 2, Math.floor(at));
  const k = at - i;
  return { x: follow.x[i] + (follow.x[i + 1] - follow.x[i]) * k, z: follow.z[i] + (follow.z[i + 1] - follow.z[i]) * k };
}

interface Planned {
  plan: KickOutPlan;
  follow: Follow;
  /** How much darker the attempt's shadows were than the kick-out's at the takeover (they're measured differently). */
  seam?: { board: number; body: number };
}

/** Seconds the shadows take to go from how dark the attempt had them to how dark the kick-out has them. */
export const SHADOW_SEAM_T = 0.3;

const plans = new WeakMap<StagePlan, Planned>();

/** The setup for a kick-out on flat ground: the street's x is the stage's plus its scroll. */
function flatSetup(stage: StagePlan): KickOutSetup {
  const { spec, style, skater } = stage;
  return {
    style,
    body: bodyDims(skater),
    regular: (t, error = IDENTITY) => shiftRig(posed(stageArms(stage, t, attemptRig(stage, t, error)), skater), { x: landedScroll(stage, t), y: 0, z: 0 }),
    wheel: (t) => landedWheel(stage, t),
    pop: ROLL_IN,
    glued: boardGlued(spec),
    gravity: GRAVITY,
    ground: () => ASPHALT,
    catchAt: ROLL_IN + catchFraction(style) * flightTime(style),
    touchdown: ROLL_IN + flightTime(style),
    end: stage.end,
  };
}

/**
 * The setup for a kick-out down a spot's drop. Its positions are the
 * spot's: the frame's plus how far down the route (x) and across it (z)
 * the frame is, so the steps and the ground past them are where the spot
 * has them, and the fall is under the drop's true gravity.
 */
function spotSetup(stage: StagePlan, stairs: StairPlan): KickOutSetup {
  const { spec, style, skater } = stage;
  const attempt = (t: number, error: Quat = IDENTITY) =>
    stairRig(stage, stairs, t, null, error === IDENTITY ? undefined : (rig) => offLineRig(rig, error), true);
  // Stepping off a made landing instead: the board's under the feet, and the legs hop the body off it.
  const hop = stage.stepOff;
  return {
    style,
    body: bodyDims(skater),
    regular: (t, error) => {
      const a = attempt(t, error);
      return shiftRig(a.rig, { x: a.route.x, y: 0, z: a.route.z });
    },
    wheel: (t) => {
      const a = attempt(t);
      return a.wheel(a.route.travel);
    },
    pop: stairs.pop,
    glued: hop != null || boardGlued(spec),
    gravity: GRAVITY,
    ground: (x, z) => ASPHALT - terrainSurface(stairs.terrain, x - X0, z),
    ...(stairs.terrain.brush && { drag: (x: number, z: number) => stairs.terrain.brush!(x - X0, z) }),
    catchAt: hop ? hop.at + TAKEOVER_LEAD : stairs.pop + catchFraction(style) * stairs.flight,
    touchdown: hop?.down ?? stairs.land,
    end: stage.end,
    ...(hop && { jump: { x: STEP_OFF_JUMP.along, y: UP.y * STEP_OFF_JUMP.up, z: 0 }, hopOut: STEP_OFF_JUMP.out }),
  };
}

/** The kick-out planned for a stage, once, with the camera that follows it. */
function planned(stage: StagePlan): Planned {
  const known = plans.get(stage);
  if (known) return known;
  const { stairs } = stage;
  const plan = planKickOut(stairs ? spotSetup(stage, stairs) : flatSetup(stage));
  const h = 1 / 240;
  let follow: Follow;
  if (stairs) {
    const route = (t: number) => stairRig(stage, stairs, t, null, undefined, true).route;
    const a = route(plan.takeover - h);
    const b = route(plan.takeover + h);
    const now = route(plan.takeover);
    follow = followRider(plan, { x: now.x, vx: (b.x - a.x) / (2 * h), z: now.z, vz: (b.z - a.z) / (2 * h) });
  } else {
    const scroll = (t: number) => landedScroll(stage, t);
    follow = followRider(plan, { x: scroll(plan.takeover), vx: (scroll(plan.takeover + h) - scroll(plan.takeover - h)) / (2 * h), z: 0, vz: 0 });
  }
  const made = { plan, follow };
  plans.set(stage, made);
  return made;
}

/** The kick-out planned for a stage, once. */
export const kickOutPlan = (stage: StagePlan): KickOutPlan => planned(stage).plan;

/** The kick-out's frame at clock `t`, from its takeover on; `attempt` is the attempt's frame it takes over from. */
export function kickOutFrame(stage: StagePlan, t: number, rate: number, attempt: (t: number) => StageFrame): StageFrame {
  const made = planned(stage);
  const frame = ownFrame(stage, t, rate);
  const fade = 1 - smoothstep((Math.min(t, stage.end) - made.plan.takeover) / SHADOW_SEAM_T);
  if (fade <= 0) return frame;
  if (!made.seam) {
    const was = attempt(made.plan.takeover).shadows;
    const now = ownFrame(stage, made.plan.takeover, rate).shadows;
    made.seam = { board: was.boardOpacity - now.boardOpacity, body: was.bodyOpacity - now.bodyOpacity };
  }
  const { shadows } = frame;
  return {
    ...frame,
    shadows: { ...shadows, boardOpacity: shadows.boardOpacity + made.seam.board * fade, bodyOpacity: shadows.bodyOpacity + made.seam.body * fade },
  };
}

function ownFrame(stage: StagePlan, t: number, rate: number): StageFrame {
  const { plan, follow } = planned(stage);
  const clock = Math.min(t, stage.end);
  const at = kickOutAt(plan, clock);
  const camera = followAt(follow, clock);
  // Flat ground has no across: the street is the same wherever the rider runs.
  const stairs = stage.stairs;
  const by = { x: -camera.x, y: 0, z: stairs ? -camera.z : 0 };
  const toFrame = (p: V3): V3 => ({ x: p.x + by.x, y: p.y, z: p.z + by.z });
  const rig = shiftRig(at.rig, by);
  const scale = bodyDims(stage.skater).scale;
  const ground = plan.setup.ground;
  const touchdown = plan.setup.touchdown;

  // The board's wheels turn as its track has them; the mark smears over a displayed frame.
  const wheelBefore = boardAt(plan.board, Math.max(plan.takeover, clock - rate / 60)).wheel;

  // Dust where the board comes down and where the first foot lands (or everywhere the rolling body hits), left where it was kicked up.
  const boardDown = plan.board.touchdown;
  const boardSpot = boardRigOf(boardAt(plan.board, boardDown)).center;
  const first = plan.run.footfalls[0];
  const puff = (from: number, p: V3, strength: number) => {
    const q = toFrame(p);
    return kickedUp(clock, from, q.x, strength, q.z, ground(p.x, p.z));
  };
  const hits = plan.roll ? plan.roll.hits.map((hit) => puff(hit.t, hit.at, Math.max(0.25, hit.strength * 0.8))).flat() : puff(first.on, first.at, 0.45);
  const dust = [...puff(boardDown, boardSpot, 0.7), ...hits];

  // The crane sinks only as far as a low head needs, from the touchdown on.
  const head = at.rig.head.origin;
  const headHeight = (ground(head.x, head.z) - head.y - (ASPHALT - GROUND)) / scale;
  const sink = smoothstep((clock - touchdown) / 0.3) * fallSink(headHeight);
  // The body's shadow fades with its lowest part off the ground: the soles, or rolling, whatever's down.
  const lowestPart = lowestOver(at.rig, ground, scale);
  const boardHeight = ground(at.board.center.x, at.board.center.z) - at.board.center.y - (ASPHALT - GROUND);
  const frame = {
    t,
    rig,
    span: null,
    wheels: { angle: at.wheel, sweep: at.wheel - wheelBefore },
    expression: at.expression,
    gaze: toFrame(at.gaze),
    dust,
  };
  if (!stairs) {
    // The crane rides the pop as the landed attempt does.
    const lift = cameraLift((clock - ROLL_IN) / flightTime(stage.style), stage.style.popHeight, headHeight, false) - sink;
    return {
      ...frame,
      lift,
      scroll: camera.x,
      stairs: null,
      shadows: riderShadows(rig, { board: Math.max(0, boardHeight), body: Math.max(0, lowestPart) }),
    };
  }
  // Down a drop the crane follows the deck as the landed attempt has it, down to the touchdown, then the ground under the rider.
  const level = (time: number) => {
    if (time < touchdown) return stairDeckHeight(stairs, time);
    const hips = hipsAt(plan, Math.min(time, stage.end)).hips;
    return terrainSurface(stairs.terrain, hips.x - X0, hips.z);
  };
  const lift = stairCrane(stairs, clock, level) - sink;
  const shadowY = stairShadowLevel(rig, stairs, camera.x, camera.z);
  return {
    ...frame,
    lift,
    scroll: camera.x,
    stairs: { dir: stairs.dir, shadowY, across: camera.z, ...(stage.obstacle ? { obstacle: stage.obstacle } : null) },
    shadows: riderShadows(rig, { board: Math.max(0, boardHeight), body: Math.max(0, lowestPart) }, ASPHALT - shadowY),
  };
}
