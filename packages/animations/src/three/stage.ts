import type { RiderStance, Robot, SkateStyle, Trick } from '../types';
import { resolveRiderMechanics, type RiderMechanics } from '../stanceMechanics';
import { readableAccent } from '../robotColors';
import {
  computeFrame,
  specFor,
  FALL_T,
  FLIP_T,
  GROUND,
  JUMP,
  LAND_T,
  ROLL_IN,
  STREET_DASH_PERIOD,
  STREET_DASH_SECONDS,
  X0,
  type FallVariant,
  type Frame,
  type Spec,
} from '../TrickAnimation';
import { FOLLOW_POP, LIGHT, cameraLift, fallSink } from '../scene/camera';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z, boardShadowPoints, wheelRoll, type WheelSpin } from '../scene/board';
import { barSpan, grindCameraLift, grindStreetDist, handrailHeight, planGrind, railTrack, type GrindPlan } from '../scene/grind';
import { grindSpecFor, type GrindSpec } from '../scene/grindDefinitions';
import { kneeBetween, solveGrindRig } from '../scene/grindRig';
import { clamp01, easeOutCubic, hull, mixHex, type V3 } from '../scene/math';
import { barShadowParts, type BarSpan } from '../scene/rail';
import type { Expression, RobotLook } from '../scene/robot';
import { solveRig } from '../scene/rig';
import { LAND_OMEGA, LAND_ZETA, SQUAT_FLOOR, moveFrame, tiltHead, type Frame3, type LegRig, type Rig } from '../scene/skeleton';
import type { StageSet } from '../scene/setKit';
import {
  STAIR_DROP,
  landingImpact,
  planStairs,
  stairClock,
  stairDeckHeight,
  stairDistance,
  stairGround,
  stairLift,
  stageRail,
  type StairPlan,
} from '../scene/stairs';
import type { HeadPose } from '../scene/TrickScene';
import { BOTTOM_LOCAL, TOP_LOCAL } from '../scene/deck';
import type { Skater } from '../skaters';
import { ASPHALT } from './view';
import { clearFeet } from './footContact';
import { humanRig } from './humanRig';
import { CENTER_Z, RIDER_LANE_Z } from './elToroLayout';

/**
 * What TrickScene3D draws on one frame, worked out exactly the way TrickScene
 * works it out: the same trick physics (computeFrame), the same rider and
 * grind solvers, the same crane lift, street scroll, wheel roll, face, dust
 * and cast shadows. Flatground can be compared frame for frame; the 3D-only
 * stairs add their drop and fixed downhill heading. Nothing here touches three.js.
 */

/** Everything fixed for one attempt. */
export interface StagePlan {
  spec: Spec;
  /** A grind: on the flat bar, or at El Toro down its center handrail (`grind.handrail`). */
  grind: GrindPlan | null;
  /** Down El Toro's 20 stair (a flatground trick on that set); null on flat ground. */
  stairs: StairPlan | null;
  mechanics: RiderMechanics;
  style: SkateStyle;
  landed: boolean;
  fall: FallVariant;
  shankProgress: number;
  /** Clock time the attempt ends at. */
  end: number;
  look: RobotLook;
  /** The robot, or a human/humanoid with a person's reach (humanRig.ts). */
  skater: Skater;
  /** Underside graphic and its stripe. */
  board: { graphic: string; stripe: string };
}

export function planStage(
  robot: Robot,
  trick: Trick,
  options: { landed: boolean; riderStance: RiderStance; style: SkateStyle; fall: FallVariant; shankProgress: number; skater?: Skater; set?: StageSet },
): StagePlan {
  const { landed, riderStance, style, fall, shankProgress, skater = 'robot', set = 'plaza' } = options;
  const spec = specFor(trick);
  const grindSpec: GrindSpec | null = grindSpecFor(trick);
  const mechanics = resolveRiderMechanics(riderStance, spec.stance);
  // At El Toro a grind rides the center handrail down the stairs; a flatground trick goes down them.
  const grind = grindSpec ? planGrind(grindSpec, mechanics, style, landed, fall, stageRail(set)) : null;
  const stairs = set === 'el-toro' && !grind ? planStairs(style, landed) : null;
  const accent = readableAccent(robot.avatar.accent);
  return {
    spec,
    grind,
    stairs,
    mechanics,
    style,
    landed,
    fall,
    shankProgress,
    end: grind?.end ?? stairs?.end ?? ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T),
    look: { body: robot.avatar.body, accent, variant: robot.avatar.variant },
    skater,
    board: { graphic: accent, stripe: mixHex(robot.avatar.body, '#ffffff', 0.35) },
  };
}

/** A dust puff: a disc in the world, seen face-on. */
export interface Puff {
  center: V3;
  radius: number;
  opacity: number;
}

/** A shadow outline on the ground, as (x, z) points. */
export type GroundPolygon = Array<{ x: number; z: number }>;

export interface StageFrame {
  /** The trick's clock (seconds). */
  t: number;
  rig: Rig;
  /** Crane height over its stock position. */
  lift: number;
  /** World units the street has rolled under the rider (signed by travel). */
  scroll: number;
  /** The bar's ends this frame, for a grind. */
  span: BarSpan | null;
  /**
   * Down a stair set: the fixed +x downhill direction, independent of stance,
   * the height (three's y) the cast shadows are laid at — the step the
   * rider's shadow falls on — and where across the set the rider's line runs
   * (the set's own z under the stage's z = 0): down the left-hand flight, or
   * on the center rail for a grind. Null on flat ground, where shadows lie
   * on the asphalt.
   */
  stairs: { dir: 1 | -1; shadowY: number; across: number } | null;
  wheels: WheelSpin;
  expression: Expression;
  dust: Puff[];
  shadows: {
    bar: GroundPolygon[];
    board: GroundPolygon;
    body: GroundPolygon[];
    /** Opacity of the board's and the rider's shadows: both fade as they rise. */
    boardOpacity: number;
    bodyOpacity: number;
  };
}

const travel = (dist: number) => (dist / STREET_DASH_SECONDS) * STREET_DASH_PERIOD;

function grindExpression(t: number, plan: GrindPlan): Expression {
  if (t < plan.pop) return 'open';
  if (plan.fail != null && t >= plan.fail) return t > plan.fail + 0.06 ? 'wince' : 'focus';
  if (t < plan.land) return 'focus';
  return t > plan.land + 0.14 ? 'happy' : 'focus';
}

function expressionAt(t: number, landed: boolean): Expression {
  const touchdown = ROLL_IN + FLIP_T;
  if (t < ROLL_IN) return 'open';
  if (t < touchdown) return 'focus';
  if (landed) return t > touchdown + 0.14 ? 'happy' : 'focus';
  return t > touchdown + 0.06 ? 'wince' : 'focus';
}

/**
 * The ground hull of points cast along the sun onto the asphalt, each
 * widened by `r` (setKit's shadowPath, kept on the ground), and cut off where
 * the ground ends at `minZ` (a sea wall) so it never lands on water.
 *
 * Given a `plane` (a physics height), points are cast along the sun's line
 * onto that level instead, from above or below it: on a stair set every
 * surface finds its shadow by casting itself onto the same level (elToro3d.ts).
 */
export function groundHull(pts: V3[], r: number, minZ = -Infinity, plane?: number): GroundPolygon {
  const out: Array<{ x: number; y: number }> = [];
  for (const p of pts) {
    const t = (plane == null ? Math.max(0, ASPHALT - p.y) : plane - p.y) / -LIGHT.y;
    const c = { x: p.x - LIGHT.x * t, z: p.z - LIGHT.z * t };
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) out.push({ x: c.x + dx, y: c.z + dz });
  }
  let ground = hull(out);
  if (Number.isFinite(minZ)) {
    const cut: typeof ground = [];
    for (let i = 0; i < ground.length; i++) {
      const a = ground[i];
      const b = ground[(i + 1) % ground.length];
      if (a.y >= minZ) cut.push(a);
      if ((a.y >= minZ) !== (b.y >= minZ)) cut.push({ x: a.x + ((b.x - a.x) * (minZ - a.y)) / (b.y - a.y), y: minZ });
    }
    ground = cut;
  }
  return ground.map((q) => ({ x: q.x, z: q.y }));
}

/** The rider's cast silhouettes: torso and head together, then each leg and arm. */
export function bodyShadows(rig: Rig, plane?: number): GroundPolygon[] {
  const box = (frame: Rig['torso'], f: number, u: number, s: number) => {
    const pts: V3[] = [];
    for (const a of [-f, f]) for (const b of [-u, u]) for (const c of [-s, s]) pts.push(frame.at(a, b, c));
    return pts;
  };
  const out = [groundHull([...box(rig.torso, 10, 23, 14), ...box(rig.head, 13, 14, 17)], 1, -Infinity, plane)];
  for (const leg of rig.legs) out.push(groundHull([leg.hip, leg.knee, leg.ankle, leg.shoe.at(8, 0, 0), leg.shoe.at(-8, 0, 0)], 3.5, -Infinity, plane));
  for (const arm of rig.arms) out.push(groundHull([arm.shoulder, arm.elbow, arm.hand], 3, -Infinity, plane));
  return out;
}

const DUST_T = 0.36;

/** A puff of dust `progress` (0 → 1) through its life, kicked up off the ground (a physics height) at (x, z). */
export function dustPuffs(progress: number, atX: number, strength: number, atZ = 0, ground = ASPHALT): Puff[] {
  const grow = easeOutCubic(progress);
  const fade = (1 - progress) ** 2;
  const out: Puff[] = [];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const spread = (0.35 + (i % 3) * 0.3) * side;
    out.push({
      center: { x: atX + spread * 40 * grow, y: ground - 14 * grow * (1 - grow * 0.4) - (i % 3) * 2, z: atZ + ((i % 3) - 1) * 10 * grow },
      radius: (2.4 + 4.6 * grow) * strength,
      opacity: 0.85 * fade,
    });
  }
  return out;
}

/** Board-local points that must stay on or above the asphalt: the deck's outline and every wheel's rim. */
const BOARD_HULL: V3[] = (() => {
  const pts: V3[] = [...TOP_LOCAL, ...BOTTOM_LOCAL];
  for (const x of [-WHEEL_X, WHEEL_X]) {
    for (const z of [-WHEEL_Z, WHEEL_Z]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        pts.push({ x: x + Math.sin(a) * WHEEL_R, y: WHEEL_Y + Math.cos(a) * WHEEL_R, z });
      }
    }
  }
  return pts;
})();

/**
 * The board and feet lifted until no part of the board is under the
 * asphalt (or, given `groundUnder`, the ground's physics height under a point). The grind hop pops the board about its middle at deck height, so
 * the tail and back wheels swing below the ground (TrickScene paints the
 * board over its ground, which hides it). Lifting by just the overlap pivots
 * the pop on the tail touching the ground instead, as a real one does. The
 * pop snaps the tail down in a single frame, so the overlap does too: the
 * knees take it up, and the hips, torso, arms, and head stay exactly where
 * TrickScene draws them, rising over the frames its rider does.
 */
export function onTheGround(rig: Rig, groundUnder: (p: V3) => number = () => ASPHALT): Rig {
  let sunk = 0;
  for (const local of BOARD_HULL) {
    const p = rig.board.point(local);
    sunk = Math.max(sunk, p.y - groundUnder(p));
  }
  if (sunk <= 0) return rig;
  const up = (p: V3): V3 => ({ x: p.x, y: p.y - sunk, z: p.z });
  const by = { x: 0, y: -sunk, z: 0 };
  return {
    ...rig,
    board: { ...rig.board, center: up(rig.board.center), point: (local) => up(rig.board.point(local)) },
    legs: rig.legs.map((l) => {
      const ankle = up(l.ankle);
      return { ...l, knee: kneeBetween(l.hip, ankle, l.knee), ankle, shoe: moveFrame(l.shoe, by) };
    }) as [LegRig, LegRig],
    hipOverDeck: rig.hipOverDeck - sunk,
  };
}

/**
 * One frame of the attempt at clock time `t`. `rate` is the playback rate,
 * which sets how far the wheel's printed mark smears over a displayed frame.
 */
export function stageFrame(stage: StagePlan, t: number, rate: number, headPose?: HeadPose | null): StageFrame {
  if (stage.stairs) return stairFrame(stage, stage.stairs, t, rate, headPose);
  if (stage.grind?.handrail) return railFrame(stage, stage.grind, t, rate, headPose);
  const { spec, grind: plan, mechanics, style, landed, fall, shankProgress } = stage;
  const clock = Math.max(0, Math.min(t, stage.end));
  const f: Frame = computeFrame(clock, spec, landed, fall, shankProgress, style);
  const grind = plan ? solveGrindRig(t, plan, mechanics, style) : null;
  const solved = clearFeet(onTheGround(grind ? grind.rig : solveRig(f, spec, mechanics, style, landed ? 'landed' : fall)));
  const tilted = headPose ? { ...solved, head: tiltHead(solved.head, headPose.pitch, headPose.roll) } : solved;
  const rig = stage.skater === 'human' || stage.skater === 'humanoid' ? humanRig(tilted) : tilted;
  const falling = grind ? grind.falling : !landed && f.motion.flight >= 1;
  // A presentation head move never shifts the camera or the attempt's motion.
  const headHeight = GROUND - solved.head.origin.y;
  const lift = plan && grind
    ? grindCameraLift(plan, t, grind.frame.rail, falling ? fallSink(headHeight) : 0)
    : cameraLift(f.motion.flight, style.popHeight, headHeight, falling);

  const streetDist = t < 0 ? t : grind ? grind.frame.streetDist : f.streetDist;
  const scroll = travel(streetDist) * spec.dir;
  const span = plan ? barSpan(plan, streetDist) : null;

  // Wheels roll with the street; the mark smears over one displayed frame.
  const shutterT = t - rate / 60;
  const shutterDist = shutterT <= 0
    ? shutterT
    : plan
      ? grindStreetDist(shutterT, plan)
      : computeFrame(shutterT, spec, landed, fall, shankProgress, style).streetDist;
  const roll = (dist: number) => plan
    ? wheelRoll(travel(dist), Infinity, spec.dir, 0)
    : wheelRoll(travel(dist), travel(ROLL_IN + FLIP_T), spec.dir, rig.board.yawDeg);
  const angle = roll(streetDist);

  // Pop and touchdown dust.
  const dust: Puff[] = [];
  const puff = (progress: number, atX: number, strength: number, atZ = 0) => dust.push(...dustPuffs(progress, atX, strength, atZ));
  const hipX = (rig.legs[0].hip.x + rig.legs[1].hip.x) / 2;
  const hipZ = (rig.legs[0].hip.z + rig.legs[1].hip.z) / 2;
  if (plan && grind) {
    const dustAt = (at: number, x: number, z: number, strength: number) => {
      const p = (t - at) / DUST_T;
      if (p >= 0 && p < 1) puff(p, x, strength, z);
    };
    dustAt(plan.pop, X0 + (plan.spec.popNose ? 32 : -32), plan.laneZ, 0.8);
    if (plan.fail == null) dustAt(plan.land, X0, plan.lockCenter.z, 1);
    else dustAt(plan.fail + plan.drop, hipX, hipZ, 0.8);
  } else {
    const popP = (f.t - ROLL_IN) / DUST_T;
    if (popP >= 0 && popP < 1) puff(popP, X0 + (spec.nollie ? 32 : -32), 0.8);
    const landP = (f.t - ROLL_IN - FLIP_T) / DUST_T;
    if (landP >= 0 && landP < 1) puff(landP, f.board.x, landed ? 1 : 0.8);
  }

  // Shadows: the same cast silhouettes TrickScene softens onto the ground.
  const boardHeight = Math.max(0, GROUND - (grind ? rig.board.center.y : f.board.y));
  const hipY = (rig.legs[0].hip.y + rig.legs[1].hip.y) / 2;
  const bodyHeight = Math.max(0, GROUND - (grind ? hipY : f.body.y) - 60);
  const heightFade = (h: number) => 1 - 0.55 * clamp01(h / JUMP);

  return {
    t,
    rig,
    lift,
    scroll,
    span,
    stairs: null,
    wheels: { angle, sweep: angle - roll(shutterDist) },
    expression: headPose?.expression ?? (plan ? grindExpression(t, plan) : expressionAt(f.t, landed)),
    dust,
    shadows: {
      // The bar's posts stand on the asphalt, below where TrickScene stops them.
      bar: span ? barShadowParts(span).map((pts) => groundHull(pts.map((p) => (p.y >= GROUND ? { ...p, y: ASPHALT } : p)), 0.8)) : [],
      board: groundHull(boardShadowPoints(rig.board), 1.5),
      body: bodyShadows(rig),
      boardOpacity: 0.34 * heightFade(boardHeight),
      bodyOpacity: 0.3 * heightFade(bodyHeight),
    },
  };
}

// ----- Down the stairs -----

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
 * The landing off nine feet. The flatground rig's touchdown spring takes the
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

/** The crane's height down the stairs: the deck's (some of it over the lip), smoothed so the camera never jerks at the pop or the landing. */
function stairCameraHeight(stairs: StairPlan, t: number): number {
  let sum = 0;
  let total = 0;
  for (let k = -6; k <= 6; k++) {
    const w = Math.exp(-((k / 2.4) ** 2) / 2);
    // Up with part of the pop, never ahead of it; down the stairs a little ahead.
    const spread = (k / 2.4) * CAMERA_FOLLOW;
    sum += w * (FOLLOW_POP * Math.max(0, stairDeckHeight(stairs, t + spread)) + Math.min(0, stairDeckHeight(stairs, t + CAMERA_LEAD + spread)));
    total += w;
  }
  return sum / total;
}

/**
 * The height (over the top landing) of the ground the sun casts a point's
 * shadow on: down the sun's line from `p` until it meets a step, `u` being
 * the rider's distance down the stairs.
 */
function shadowGround(p: V3, u: number, dir: 1 | -1): number {
  const at = (s: number) => {
    const q = { x: p.x - LIGHT.x * s, y: p.y - LIGHT.y * s };
    return { up: ASPHALT - q.y, ground: stairGround(u + dir * (q.x - X0)) };
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

/**
 * One frame of a flatground trick down El Toro's 20 stair. The trick and
 * the rider are solved exactly as on flat ground, on the stairs' stretched
 * clock (stairClock), turned together for a backwards approach, then carried
 * down the drop together; the street rolls
 * at the stairs' speed, the crane follows the drop, dust kicks up off the lip
 * and the landing, and the shadows fall on the steps.
 */
function stairFrame(stage: StagePlan, stairs: StairPlan, t: number, rate: number, headPose?: HeadPose | null): StageFrame {
  const { spec, mechanics, style, landed, fall, shankProgress } = stage;
  const clock = Math.max(0, Math.min(t, stage.end));
  const at = (time: number) => computeFrame(stairClock(stairs, time), spec, landed, fall, shankProgress, style);
  const f = at(clock);
  // Distance down the stairs (the lip at 0), and the street rolled by it.
  const distance = (time: number) => stairDistance(stairs, time, time < 0 ? time : at(Math.min(time, stage.end)).streetDist);
  const u = distance(t);
  const dir = stairs.dir;
  // The rider is solved on flat ground and then carried down by `drop`; the
  // ground pass keeps the board out of the steps as they lie before that
  // carry (a low pop off the lip rises slower than its flatground arc, and
  // would otherwise sink the tail into the top landing).
  const drop = stairLift(stairs, clock, style.popHeight);
  const stepUnder = (p: V3) => ASPHALT - (stairGround(u + dir * (p.x - X0)) - drop);
  const flat = solveRig(f, spec, mechanics, style, landed ? 'landed' : fall);
  const heading = spec.dir === -1 ? 180 : 0;
  const downhill = heading ? reverseHeading(flat) : flat;
  const solved = clearFeet(onTheGround(downhill, stepUnder));
  const absorbed = absorbDrop(solved, stairs, clock, style.popHeight);
  const tilted = headPose ? { ...absorbed, head: tiltHead(absorbed.head, headPose.pitch, headPose.roll) } : absorbed;
  const posed = stage.skater === 'human' || stage.skater === 'humanoid' ? humanRig(tilted) : tilted;
  const rig = shiftRig(posed, { x: 0, y: -drop, z: 0 });
  const falling = !landed && f.motion.flight >= 1;
  const headHeight = GROUND - solved.head.origin.y;
  const lift = stairCameraHeight(stairs, clock) - (falling ? fallSink(headHeight) : 0);

  const touchdownU = distance(stairs.land);
  // Wheel angles are board-local: turning the entire rider must not reverse
  // the backwards roll inside that frame, including after a 180-degree trick.
  const roll = (d: number) => wheelRoll(d, touchdownU, spec.dir, rig.board.yawDeg - heading);
  const angle = roll(u);

  // Dust off the lip at the pop and off the bottom at touchdown, left behind where it was kicked up.
  const dust: Puff[] = [];
  const kick = (from: number, x: number, ground: number, strength: number) => {
    const p = (clock - from) / DUST_T;
    if (p >= 0 && p < 1) dust.push(...dustPuffs(p, x - dir * (u - distance(from)), strength, 0, ground));
  };
  kick(stairs.pop, X0 + spec.dir * (spec.nollie ? 32 : -32), ASPHALT, 0.8);
  kick(stairs.land, X0, ASPHALT + STAIR_DROP, landed ? 1 : 0.8);

  // Shadows go down onto the step under the rider's.
  const hips = { x: (rig.legs[0].hip.x + rig.legs[1].hip.x) / 2, y: (rig.legs[0].hip.y + rig.legs[1].hip.y) / 2, z: 0 };
  const middle = { x: (hips.x + rig.board.center.x) / 2, y: (hips.y + rig.board.center.y) / 2, z: 0 };
  const shadowY = shadowGround(middle, u, dir);
  const plane = ASPHALT - shadowY;
  const deck = stairDeckHeight(stairs, clock);
  const boardHeight = Math.max(0, deck - shadowY);
  const bodyHeight = Math.max(0, GROUND - f.body.y + drop - 60 - shadowY);
  const heightFade = (h: number) => 1 - 0.55 * clamp01(h / JUMP);

  return {
    t,
    rig,
    lift,
    scroll: u * dir,
    span: null,
    stairs: { dir, shadowY, across: RIDER_LANE_Z },
    wheels: { angle, sweep: angle - roll(distance(t - rate / 60)) },
    expression: headPose?.expression ?? expressionAt(f.t, landed),
    dust,
    shadows: {
      bar: [],
      board: groundHull(boardShadowPoints(rig.board), 1.5, -Infinity, plane),
      body: bodyShadows(rig, plane),
      boardOpacity: 0.34 * heightFade(boardHeight),
      bodyOpacity: 0.3 * heightFade(bodyHeight),
    },
  };
}

// ----- Down the handrail -----

/**
 * The crane down El Toro's handrail: up with part of the hop onto it, as
 * over the flat bar, then down the rail with the board and onto the
 * landing, smoothed and led as down the stairs (stairCameraHeight).
 */
function railCameraHeight(plan: GrindPlan, t: number): number {
  let sum = 0;
  let total = 0;
  for (let k = -6; k <= 6; k++) {
    const w = Math.exp(-((k / 2.4) ** 2) / 2);
    const spread = (k / 2.4) * CAMERA_FOLLOW;
    sum += w * (FOLLOW_POP * Math.max(0, handrailHeight(plan, t + spread)) + Math.min(0, handrailHeight(plan, t + CAMERA_LEAD + spread)));
    total += w;
  }
  return sum / total;
}

/**
 * One frame of a grind down El Toro's center handrail. The grind is solved
 * as on the flat bar with the rail's slope and speed-up (grind.ts), turned
 * round whole for a fakie approach so every grind goes down the same
 * stairs, and set over the rail: the set slides by how far down it the
 * rider is, the crane follows the board down, dust kicks up off the top
 * landing and the bottom one, and the shadows fall on the steps.
 */
function railFrame(stage: StagePlan, plan: GrindPlan, t: number, rate: number, headPose?: HeadPose | null): StageFrame {
  const { mechanics, style } = stage;
  const rail = plan.handrail!.rail;
  const grind = solveGrindRig(t, plan, mechanics, style);
  // How far down the stairs the rider is; the grind's own travel is down them either way round.
  const u = railTrack(plan, t);
  const heading = plan.spec.dir === -1 ? 180 : 0;
  const downhill = heading ? reverseHeading(grind.rig) : grind.rig;
  const stepUnder = (p: V3) => ASPHALT - rail.ground(u + (p.x - X0));
  const solved = clearFeet(onTheGround(downhill, stepUnder));
  const tilted = headPose ? { ...solved, head: tiltHead(solved.head, headPose.pitch, headPose.roll) } : solved;
  // A person's arms keep off the steps under them (along their edges), not the top landing far above.
  const hipsAlong = u + (solved.legs[0].hip.x + solved.legs[1].hip.x) / 2 - X0;
  const rig = stage.skater === 'human' || stage.skater === 'humanoid' ? humanRig(tilted, ASPHALT - rail.rest(hipsAlong)) : tilted;
  // A fallen head is low over the steps under it, not under the top landing.
  const headHeight = GROUND - solved.head.origin.y - rail.rest(u + solved.head.origin.x - X0);
  const lift = railCameraHeight(plan, t) - (grind.falling ? fallSink(headHeight) : 0);

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
  kick(plan.pop, X0 + plan.spec.dir * (plan.spec.popNose ? 32 : -32), across(plan.laneZ), 0.8);
  if (plan.fail == null) kick(plan.land, X0, across(plan.lockCenter.z), 1);
  else kick(plan.fail + plan.drop, (rig.legs[0].hip.x + rig.legs[1].hip.x) / 2, (rig.legs[0].hip.z + rig.legs[1].hip.z) / 2, 0.8);

  // Shadows go down onto the step under the rider's.
  const hips = { x: (rig.legs[0].hip.x + rig.legs[1].hip.x) / 2, y: (rig.legs[0].hip.y + rig.legs[1].hip.y) / 2, z: 0 };
  const middle = { x: (hips.x + rig.board.center.x) / 2, y: (hips.y + rig.board.center.y) / 2, z: 0 };
  const shadowY = shadowGround(middle, u, 1);
  const plane = ASPHALT - shadowY;
  const boardHeight = Math.max(0, GROUND - rig.board.center.y - shadowY);
  const bodyHeight = Math.max(0, GROUND - hips.y - 60 - shadowY);
  const heightFade = (h: number) => 1 - 0.55 * clamp01(h / JUMP);

  return {
    t,
    rig,
    lift,
    scroll: u,
    span: null,
    stairs: { dir: 1, shadowY, across: CENTER_Z },
    wheels: { angle, sweep: angle - roll(railTrack(plan, t - rate / 60)) },
    expression: headPose?.expression ?? grindExpression(t, plan),
    dust,
    shadows: {
      // The set's own rails cast their shadows per pixel.
      bar: [],
      board: groundHull(boardShadowPoints(rig.board), 1.5, -Infinity, plane),
      body: bodyShadows(rig, plane),
      boardOpacity: 0.34 * heightFade(boardHeight),
      bodyOpacity: 0.3 * heightFade(bodyHeight),
    },
  };
}
