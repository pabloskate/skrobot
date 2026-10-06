import type { HeadPose, RiderStance, SkateStyle, Trick } from '../types';
import { cameraLift, fallSink } from '../camera/camera';
import { ASPHALT } from '../camera/view';
import { clearFeet } from '../board/footContact';
import { wheelRoll } from '../board/board';
import { barSpan, grindCameraLift, grindCameraTrack, grindStreetDist, planGrind, travel, type GrindPlan } from '../motion/grind';
import { grindSpecFor } from '../motion/grindDefinitions';
import { solveGrindRig } from '../motion/grindRig';
import { solveRig } from '../motion/rig';
import { resolveRiderMechanics, type RiderMechanics } from '../motion/stance';
import { FALL_T, FLIP_T, GROUND, LAND_T, ROLL_IN, X0, computeFrame, specFor, type FallVariant, type Spec } from '../motion/trick';
import type { Skater } from '../riders/skaters';
import { barShadowParts } from '../sets/bar';
import { planStairs, type StairPlan } from '../sets/elToro/stairs';
import { setInfo, sideRailFor, type RailChoice, type RailLine, type StageSet } from '../sets/sets';
import { railFrame, stairFrame } from './downhill';
import { gazeAt } from './gaze';
import {
  expressionAt,
  grindExpression,
  groundHull,
  hipsOf,
  kickedUp,
  onTheGround,
  posed,
  riderShadows,
  type StageFrame,
} from './frameParts';

export { groundHull, onTheGround, type GroundPolygon, type Puff, type StageFrame } from './frameParts';

/**
 * The stage: an attempt planned once (planStage) and then worked out frame by
 * frame (stageFrame) into everything the renderer draws: the rider's rig,
 * the crane's lift, the street's scroll, the wheels' roll, the face, dust,
 * and cast shadows. The motion comes from the solvers in motion/ untouched;
 * the stage puts it in the world. Flat ground and the flat bar are here;
 * down a stair set and its handrail are in downhill.ts. Nothing here
 * touches three.js.
 */

/** Everything fixed for one attempt. */
export interface StagePlan {
  spec: Spec;
  /** A grind: on the flat bar, or down a set's handrail (`grind.handrail`). */
  grind: GrindPlan | null;
  /** Down a set's handrails: which one the grind rides, and where it stands across the set (z). Null otherwise. */
  rail: { line: RailLine; z: number } | null;
  /** A gap trick down a fixed obstacle, including a bank landing; null on flat ground. */
  stairs: StairPlan | null;
  mechanics: RiderMechanics;
  style: SkateStyle;
  landed: boolean;
  fall: FallVariant;
  shankProgress: number;
  /** Clock time the attempt ends at. */
  end: number;
  /** The robot, or a human/humanoid with a person's reach (humanRig.ts). */
  skater: Skater;
}

export function planStage(
  trick: Trick,
  options: {
    landed: boolean;
    riderStance: RiderStance;
    style: SkateStyle;
    fall: FallVariant;
    shankProgress: number;
    skater?: Skater;
    set?: StageSet;
    /** Where the set has several handrails: the center one, or the side one the grind's approach takes. */
    rail?: RailChoice;
  },
): StagePlan {
  const { landed, riderStance, style, fall, shankProgress, skater = 'robot', set = 'plaza', rail: choice = 'center' } = options;
  const spec = specFor(trick);
  const grindSpec = grindSpecFor(trick);
  const mechanics = resolveRiderMechanics(riderStance, spec.stance);
  // Where the set has handrails a grind rides one down the stairs; where it has a drop a flatground trick goes down it.
  const { rails, terrain, grinds } = setInfo(set);
  const line: RailLine | null = grindSpec && rails ? (choice === 'side' && rails.sideGrinds !== false ? sideRailFor(grindSpec, mechanics) : 'center') : null;
  // A side rail stands at the edge of the stairs, with nothing past it to fall onto.
  const handrail = rails && line ? (line === 'center' ? rails.handrail : { ...rails.handrail, edge: true }) : null;
  const grind = grindSpec && grinds ? planGrind(grindSpec, mechanics, style, landed, fall, handrail) : null;
  const stairs = terrain && !grind ? planStairs(style, landed, terrain) : null;
  return {
    spec,
    grind,
    rail: rails && line ? { line, z: rails.z[line] } : null,
    stairs,
    mechanics,
    style,
    landed,
    fall,
    shankProgress,
    end: grind?.end ?? stairs?.end ?? ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T),
    skater,
  };
}

/**
 * One frame of the attempt at clock time `t`. `rate` is the playback rate,
 * which sets how far the wheel's printed mark smears over a displayed frame.
 */
export function stageFrame(stage: StagePlan, t: number, rate: number, headPose?: HeadPose | null): StageFrame {
  const frame = frameAt(stage, t, rate, headPose);
  // Where the rider is looking (stage/gaze.ts): the obstacle, then the board, then the way ahead.
  // A presentation head move (a lead-in) is choreographed instead, and wins.
  if (headPose) return frame;
  return { ...frame, gaze: gazeAt(stage, frame, (at) => frameAt(stage, at, 1)) };
}

function frameAt(stage: StagePlan, t: number, rate: number, headPose?: HeadPose | null): StageFrame {
  if (stage.stairs) return stairFrame(stage, stage.stairs, t, rate, headPose);
  if (stage.grind?.handrail) return railFrame(stage, stage.grind, t, rate, headPose);
  const { spec, grind: plan, mechanics, style, landed, fall, shankProgress } = stage;
  const clock = Math.max(0, Math.min(t, stage.end));
  const f = computeFrame(clock, spec, landed, fall, shankProgress, style);
  const grind = plan ? solveGrindRig(t, plan, mechanics, style) : null;
  const solved = clearFeet(onTheGround(grind ? grind.rig : solveRig(f, spec, mechanics, style, landed ? 'landed' : fall)));
  const rig = posed(solved, stage.skater, headPose);
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
  const hips = hipsOf(rig);
  const dust = plan && grind
    ? [
      ...kickedUp(t, plan.pop, X0 + (plan.spec.popNose ? 32 : -32), 0.8, plan.laneZ),
      ...(plan.fail == null ? kickedUp(t, plan.land, X0, 1, plan.lockCenter.z) : kickedUp(t, plan.fail + plan.drop, hips.x, 0.8, hips.z)),
    ]
    : [
      ...kickedUp(f.t, ROLL_IN, X0 + (spec.nollie ? 32 : -32), 0.8),
      ...kickedUp(f.t, ROLL_IN + FLIP_T, f.board.x, landed ? 1 : 0.8),
    ];

  // The bar's posts stand on the asphalt, below the ground line the bar is laid out from.
  const barShadows = span ? barShadowParts(span).map((pts) => groundHull(pts.map((p) => (p.y >= GROUND ? { ...p, y: ASPHALT } : p)), 0.8)) : [];
  return {
    t,
    rig,
    lift,
    ...(plan ? { track: grindCameraTrack(plan, clock) } : null),
    scroll,
    span,
    stairs: null,
    wheels: { angle, sweep: angle - roll(shutterDist) },
    expression: headPose?.expression ?? (plan ? grindExpression(t, plan) : expressionAt(f.t, landed)),
    dust,
    shadows: riderShadows(rig, {
      board: Math.max(0, GROUND - (grind ? rig.board.center.y : f.board.y)),
      body: Math.max(0, GROUND - (grind ? hips.y : f.body.y) - 60),
    }, undefined, barShadows),
  };
}
