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
import { LIGHT, cameraLift, fallSink } from '../scene/camera';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z, boardShadowPoints, wheelRoll, type WheelSpin } from '../scene/board';
import { barSpan, grindCameraLift, grindStreetDist, planGrind, type GrindPlan } from '../scene/grind';
import { grindSpecFor, type GrindSpec } from '../scene/grindDefinitions';
import { kneeBetween, solveGrindRig } from '../scene/grindRig';
import { clamp01, easeOutCubic, hull, mixHex, type V3 } from '../scene/math';
import { barShadowParts, type BarSpan } from '../scene/rail';
import type { Expression, RobotLook } from '../scene/robot';
import { solveRig } from '../scene/rig';
import { moveFrame, tiltHead, type LegRig, type Rig } from '../scene/skeleton';
import type { HeadPose } from '../scene/TrickScene';
import { BOTTOM_LOCAL, TOP_LOCAL } from '../scene/deck';
import type { Skater } from '../skaters';
import { ASPHALT } from './view';
import { clearFeet } from './footContact';
import { humanRig } from './humanRig';

/**
 * What TrickScene3D draws on one frame, worked out exactly the way TrickScene
 * works it out: the same trick physics (computeFrame), the same rider and
 * grind solvers, the same crane lift, street scroll, wheel roll, face, dust
 * and cast shadows. Only the drawing differs, so the two renderers can be
 * compared frame for frame. Nothing here touches three.js.
 */

/** Everything fixed for one attempt. */
export interface StagePlan {
  spec: Spec;
  grind: GrindPlan | null;
  mechanics: RiderMechanics;
  style: SkateStyle;
  landed: boolean;
  fall: FallVariant;
  shankProgress: number;
  /** Clock time the attempt ends at. */
  end: number;
  look: RobotLook;
  /** Who rides: the robot, or a human skater with a person's reach (humanRig.ts). */
  skater: Skater;
  /** Underside graphic and its stripe. */
  board: { graphic: string; stripe: string };
}

export function planStage(
  robot: Robot,
  trick: Trick,
  options: { landed: boolean; riderStance: RiderStance; style: SkateStyle; fall: FallVariant; shankProgress: number; skater?: Skater },
): StagePlan {
  const { landed, riderStance, style, fall, shankProgress, skater = 'robot' } = options;
  const spec = specFor(trick);
  const grindSpec: GrindSpec | null = grindSpecFor(trick);
  const mechanics = resolveRiderMechanics(riderStance, spec.stance);
  const grind = grindSpec ? planGrind(grindSpec, mechanics, style, landed, fall) : null;
  const accent = readableAccent(robot.avatar.accent);
  return {
    spec,
    grind,
    mechanics,
    style,
    landed,
    fall,
    shankProgress,
    end: grind?.end ?? ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T),
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
 */
export function groundHull(pts: V3[], r: number, minZ = -Infinity): GroundPolygon {
  const out: Array<{ x: number; y: number }> = [];
  for (const p of pts) {
    const t = Math.max(0, ASPHALT - p.y) / -LIGHT.y;
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
export function bodyShadows(rig: Rig): GroundPolygon[] {
  const box = (frame: Rig['torso'], f: number, u: number, s: number) => {
    const pts: V3[] = [];
    for (const a of [-f, f]) for (const b of [-u, u]) for (const c of [-s, s]) pts.push(frame.at(a, b, c));
    return pts;
  };
  const out = [groundHull([...box(rig.torso, 10, 23, 14), ...box(rig.head, 13, 14, 17)], 1)];
  for (const leg of rig.legs) out.push(groundHull([leg.hip, leg.knee, leg.ankle, leg.shoe.at(8, 0, 0), leg.shoe.at(-8, 0, 0)], 3.5));
  for (const arm of rig.arms) out.push(groundHull([arm.shoulder, arm.elbow, arm.hand], 3));
  return out;
}

const DUST_T = 0.36;

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
 * asphalt. The grind hop pops the board about its middle at deck height, so
 * the tail and back wheels swing below the ground (TrickScene paints the
 * board over its ground, which hides it). Lifting by just the overlap pivots
 * the pop on the tail touching the ground instead, as a real one does. The
 * pop snaps the tail down in a single frame, so the overlap does too: the
 * knees take it up, and the hips, torso, arms, and head stay exactly where
 * TrickScene draws them, rising over the frames its rider does.
 */
export function onTheGround(rig: Rig): Rig {
  let sunk = 0;
  for (const p of BOARD_HULL) sunk = Math.max(sunk, rig.board.point(p).y - ASPHALT);
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
  const { spec, grind: plan, mechanics, style, landed, fall, shankProgress } = stage;
  const clock = Math.max(0, Math.min(t, stage.end));
  const f: Frame = computeFrame(clock, spec, landed, fall, shankProgress, style);
  const grind = plan ? solveGrindRig(t, plan, mechanics, style) : null;
  const solved = clearFeet(onTheGround(grind ? grind.rig : solveRig(f, spec, mechanics, style, landed ? 'landed' : fall)));
  const tilted = headPose ? { ...solved, head: tiltHead(solved.head, headPose.pitch, headPose.roll) } : solved;
  const rig = stage.skater === 'human' ? humanRig(tilted) : tilted;
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
  const puff = (progress: number, atX: number, strength: number, atZ = 0) => {
    const grow = easeOutCubic(progress);
    const fade = (1 - progress) ** 2;
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const spread = (0.35 + (i % 3) * 0.3) * side;
      dust.push({
        center: { x: atX + spread * 40 * grow, y: ASPHALT - 14 * grow * (1 - grow * 0.4) - (i % 3) * 2, z: atZ + ((i % 3) - 1) * 10 * grow },
        radius: (2.4 + 4.6 * grow) * strength,
        opacity: 0.85 * fade,
      });
    }
  };
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
