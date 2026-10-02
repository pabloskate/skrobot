'use client';

import { useId, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import type { RiderStance, Robot, Trick } from '../types';
import { resolveRiderMechanics } from '../stanceMechanics';
import { readableAccent } from '../robotColors';
import { resolveSkateStyle } from '../skateStyle';
import { useTrickPlayback } from '../useTrickPlayback';
import {
  computeFrame,
  specFor,
  randomFallVariant,
  randomShankProgress,
  W,
  H,
  GROUND,
  X0,
  SKY_PAD,
  JUMP,
  ROLL_IN,
  FLIP_T,
  STREET_DASH_PERIOD,
  STREET_DASH_SECONDS,
  type BackgroundSceneId,
  type FallVariant,
} from '../TrickAnimation';
import { LIGHT, PALETTE, cameraLift, fallSink, makeCamera, zoomedViewBox, type Camera, type SceneCamera } from './camera';
import { drawBackdrop } from './backdrop';
import { boardShadowPoints, drawBoard, wheelRoll, type BoardBar } from './board';
import { resetKeys } from './draw';
import { barSpan, grindCameraLift, grindStreetDist, planGrind, type GrindPlan } from './grind';
import { BAR_TOP_Y, BAR_Z, grindSpecFor } from './grindDefinitions';
import { solveGrindRig } from './grindRig';
import { clamp01, easeOutCubic, hull, mixHex, pathOf, type P2, type V3 } from './math';
import { barShadowParts, drawBar } from './rail';
import { drawRobot, type Expression } from './robot';
import { solveRig } from './rig';
import { tiltHead, type Rig } from './skeleton';

/**
 * TrickScene — a from-scratch look for the trick animation: a new toy-robot
 * character, a golden-hour skate plaza, and a crane camera that rises with
 * the pop. The trick motion is untouched: the board, feet, spins, and flick
 * come from the shared computeFrame physics and the New 3D mapping, so this
 * is a drop-in alternative to TrickAnimation3D with the same props. The
 * rider's body on top of that is solved physically in rig.ts (ballistic
 * hips, fixed-length legs, absorbed landings).
 *
 * Grinds and slides (grind.ts) are Scene-only: the robot ollies onto a flat
 * bar that scrolls with the plaza, locks into the trick, and pops off the
 * end. The same props drive them; the trick's base picks the grind and its
 * side ("Backside Smith Grind"), and any tricks popped into and out of it
 * ("Kickflip into Backside Smith Grind Kickflip Out").
 */

/** A head move layered on the rider's own, and optionally a face. */
export interface HeadPose {
  /** Degrees; positive tips the face up. */
  pitch: number;
  /** Degrees about the face's forward axis. */
  roll: number;
  expression?: Expression;
}

/**
 * A beat played on the stage before the trick, such as the robot calling its
 * set. The robot cruises in the trick's t = 0 pose with the street rolling,
 * so the last lead-in frame is the attempt's first. Every callback runs on
 * the trick's clock, which is negative during the lead-in. Only the first run
 * has the lead-in: a replay is just the trick.
 */
export interface LeadIn {
  seconds: number;
  /** Stage button label during the lead-in, when the trick may still be a secret. */
  label: string;
  /** Head pose over the rider's own, or null for none. May run past t = 0. */
  head?: (t: number) => HeadPose | null;
  /** Drawn over the stage. May run past t = 0. */
  overlay?: (t: number) => ReactNode;
  /** A tap on the stage before this time jumps to it. */
  skipTo?: number;
  /** Fires once, when the trick's clock reaches t = 0. */
  onEnd?: () => void;
}

interface Props {
  robot: Robot;
  trick: Trick;
  landed: boolean;
  onDone: () => void;
  playbackRate?: number;
  /** Show the in-stage .5x / 1x playback toggle. */
  showSpeedToggle?: boolean;
  /** Accepted for prop parity with the other renderers; the plaza is fixed. */
  backgroundSceneId?: BackgroundSceneId;
  fallVariant?: FallVariant;
  /** Freeze the animation on the current frame. */
  paused?: boolean;
  /** Whether the robot knew the trick; false forces shank. */
  knewIt?: boolean;
  /** The rider's natural footedness. Trick stance is resolved separately. */
  riderStance?: RiderStance;
  /** Render one frozen frame at this absolute time (seconds). */
  fixedTime?: number;
  leadIn?: LeadIn;
  /** Where the crane films from; the stock 3/4 view when omitted. Keep it inside SCENE_CAMERA_BOUNDS. */
  camera?: SceneCamera;
  /** Magnify the picture about the rider: 1 is stock, more is closer, less shows more of the plaza. Perspective stays the camera's. */
  zoom?: number;
}

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

/** How close (world units) the board must be to the bar for their parts to interleave. */
const BAR_REACH = 52;

const hipX = (rig: Rig) => (rig.legs[0].hip.x + rig.legs[1].hip.x) / 2;
const hipZ = (rig: Rig) => (rig.legs[0].hip.z + rig.legs[1].hip.z) / 2;

/** Where a point's shadow falls on the ground along the sun's rays. */
function cast(p: V3): V3 {
  const t = Math.max(0, GROUND - p.y) / -LIGHT.y;
  return { x: p.x - LIGHT.x * t, y: GROUND, z: p.z - LIGHT.z * t };
}

/**
 * Hull of cast points, each widened by `r` so thin limbs still shade. The
 * hull is taken on the ground (x, z) and clipped to the near plane before
 * projecting, so a bar's shadow running past the camera stays whole.
 */
function shadowPath(cam: Camera, pts: V3[], r: number): string {
  const out: P2[] = [];
  for (const p of pts) {
    const c = cast(p);
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) {
      out.push({ x: c.x + dx, y: c.z + dz });
    }
  }
  const ground = cam.clipPolygon(hull(out).map((q) => ({ x: q.x, y: GROUND, z: q.y })));
  return ground.length < 3 ? '' : pathOf(ground.map((p) => cam.project(p)));
}

function robotShadow(cam: Camera, rig: Rig): string[] {
  const box = (frame: Rig['torso'], f: number, u: number, s: number) => {
    const pts: V3[] = [];
    for (const a of [-f, f]) for (const b of [-u, u]) for (const c of [-s, s]) pts.push(frame.at(a, b, c));
    return pts;
  };
  const paths = [shadowPath(cam, [...box(rig.torso, 10, 23, 14), ...box(rig.head, 13, 14, 17)], 1)];
  for (const leg of rig.legs) {
    paths.push(shadowPath(cam, [leg.hip, leg.knee, leg.ankle, leg.shoe.at(8, 0, 0), leg.shoe.at(-8, 0, 0)], 3.5));
  }
  for (const arm of rig.arms) paths.push(shadowPath(cam, [arm.shoulder, arm.elbow, arm.hand], 3));
  return paths;
}

export default function TrickScene({
  robot,
  trick,
  landed,
  onDone,
  playbackRate = 1,
  showSpeedToggle = true,
  fallVariant,
  paused = false,
  knewIt,
  riderStance = 'regular',
  fixedTime,
  leadIn,
  camera,
  zoom = 1,
}: Props) {
  const idBase = useId().replace(/:/g, '');
  const skateStyle = useMemo(() => resolveSkateStyle(robot.skateStyle), [robot.skateStyle]);
  const forcedFall = !landed && knewIt === false ? ('shank' as FallVariant) : undefined;
  const [randomizedFallVariant] = useState<FallVariant>(randomFallVariant);
  const [shankProgress] = useState(randomShankProgress);
  const [spec] = useState(() => specFor(trick));
  const [grindSpec] = useState(() => grindSpecFor(trick));
  const resolvedFallVariant = forcedFall ?? fallVariant ?? randomizedFallVariant;
  const mechanics = resolveRiderMechanics(riderStance, spec.stance);
  const plan = grindSpec ? planGrind(grindSpec, mechanics, skateStyle, landed, resolvedFallVariant) : null;
  const {
    frame: f, time: t, firstRun, isPlaying, staticTime, speedToggleVisible, effectivePlaybackRate,
    selectedPlaybackRate, replay, seek, togglePlaybackRate,
  } = useTrickPlayback({
    spec, landed, resolvedFallVariant, shankProgress, skateStyle,
    onDone, paused, playbackRate, showSpeedToggle, fixedTime,
    leadIn: leadIn?.seconds, onLeadInEnd: leadIn?.onEnd, end: plan?.end,
  });
  const lead = firstRun ? leadIn : undefined;
  const inLeadIn = lead != null && t < 0;

  resetKeys();

  const grind = plan ? solveGrindRig(t, plan, mechanics, skateStyle) : null;
  const solved = grind ? grind.rig : solveRig(f, spec, mechanics, skateStyle, landed ? 'landed' : resolvedFallVariant);
  const pose = lead?.head?.(t) ?? null;
  const rig: Rig = pose ? { ...solved, head: tiltHead(solved.head, pose.pitch, pose.roll) } : solved;
  const falling = grind ? grind.falling : !landed && f.motion.flight >= 1;
  // The camera frames the rider's own head, so a head pose never moves it.
  const headHeight = GROUND - solved.head.origin.y;
  const lift = plan && grind
    ? grindCameraLift(plan, t, grind.frame.rail, falling ? fallSink(headHeight) : 0)
    : cameraLift(f.motion.flight, skateStyle.popHeight, headHeight, falling);
  const cam = makeCamera(lift, camera);

  const viewTop = -SKY_PAD;
  const viewBottom = H;
  const view = zoomedViewBox(zoom, { x: 0, y: viewTop, width: W, height: H + SKY_PAD });
  const viewBox = `${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.width.toFixed(2)} ${view.height.toFixed(2)}`;
  // During a lead-in the rider holds the t = 0 pose while the street keeps rolling.
  const streetDist = t < 0 ? t : grind ? grind.frame.streetDist : f.streetDist;
  const travel = (dist: number) => (dist / STREET_DASH_SECONDS) * STREET_DASH_PERIOD;
  const scroll = travel(streetDist) * spec.dir;
  const ids = {
    sky: `${idBase}-sky`,
    glow: `${idBase}-glow`,
    ground: `${idBase}-ground`,
    lawn: `${idBase}-lawn`,
    haze: `${idBase}-haze`,
  };
  const shadowBlurId = `${idBase}-shadow`;
  const backdrop = drawBackdrop(cam, scroll, ids, viewTop, viewBottom);
  // The bar is laid out in street distance, so it scrolls with the plaza.
  const span = plan ? barSpan(plan, streetDist) : null;

  // ----- Shadows: the real silhouette cast along the sun, softened. -----
  const boardHeight = Math.max(0, GROUND - (grind ? rig.board.center.y : f.board.y));
  const hipY = (rig.legs[0].hip.y + rig.legs[1].hip.y) / 2;
  const bodyHeight = Math.max(0, GROUND - (grind ? hipY : f.body.y) - 60);
  const heightFade = (h: number) => 1 - 0.55 * clamp01(h / JUMP);
  const shadowColor = PALETTE.shadow;
  const shadows = (
    <g key="shadows" filter={`url(#${shadowBlurId})`}>
      {span ? (
        <g fill={shadowColor} opacity={0.3}>
          {barShadowParts(span).map((pts, i) => <path key={i} d={shadowPath(cam, pts, 0.8)} />)}
        </g>
      ) : null}
      <path d={shadowPath(cam, boardShadowPoints(rig.board), 1.5)} fill={shadowColor} opacity={0.34 * heightFade(boardHeight)} />
      <g opacity={0.3 * heightFade(bodyHeight)} fill={shadowColor}>
        {robotShadow(cam, rig).map((d, i) => <path key={i} d={d} />)}
      </g>
    </g>
  );

  // ----- Pop and touchdown dust -----
  const dust: ReactElement[] = [];
  const puff = (key: string, progress: number, atX: number, strength: number, atZ = 0) => {
    const grow = easeOutCubic(progress);
    const fade = (1 - progress) ** 2;
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const spread = (0.35 + (i % 3) * 0.3) * side;
      const p = cam.project({ x: atX + spread * 40 * grow, y: GROUND - 14 * grow * (1 - grow * 0.4) - (i % 3) * 2, z: atZ + ((i % 3) - 1) * 10 * grow });
      dust.push(<circle key={`${key}${i}`} cx={p.x} cy={p.y} r={(2.4 + 4.6 * grow) * p.s * strength} fill={PALETTE.dust} opacity={0.85 * fade} />);
    }
  };
  const DUST_T = 0.36;
  if (plan && grind) {
    const dustAt = (key: string, at: number, x: number, z: number, strength: number) => {
      const p = (t - at) / DUST_T;
      if (p >= 0 && p < 1) puff(key, p, x, strength, z);
    };
    dustAt('pop', plan.pop, X0 + (plan.spec.popNose ? 32 : -32), plan.laneZ, 0.8);
    if (plan.fail == null) dustAt('land', plan.land, X0, plan.lockCenter.z, 1);
    else dustAt('slam', plan.fail + plan.drop, hipX(rig), hipZ(rig), 0.8);
  } else {
    const popP = (f.t - ROLL_IN) / DUST_T;
    if (popP >= 0 && popP < 1) puff('pop', popP, X0 + (spec.nollie ? 32 : -32), 0.8);
    const landP = (f.t - ROLL_IN - FLIP_T) / DUST_T;
    if (landP >= 0 && landP < 1) puff('land', landP, f.board.x, landed ? 1 : 0.8);
  }

  // ----- Rider -----
  const accent = readableAccent(robot.avatar.accent);
  const look = { body: robot.avatar.body, accent, variant: robot.avatar.variant };
  // Wheels roll with the street. The mark smears over one displayed frame
  // (1/60 s of wall time), so it spans as far as the wheel turns between frames.
  const shutterT = t - effectivePlaybackRate / 60;
  const shutterDist = shutterT <= 0
    ? shutterT
    : plan
      ? grindStreetDist(shutterT, plan)
      : computeFrame(shutterT, spec, landed, resolvedFallVariant, shankProgress, skateStyle).streetDist;
  // A grind's wheels never touch down on a heading of their own: they roll
  // up to the bar and coast through the rest of it.
  const roll = (dist: number) => plan
    ? wheelRoll(travel(dist), Infinity, spec.dir, 0)
    : wheelRoll(travel(dist), travel(ROLL_IN + FLIP_T), spec.dir, rig.board.yawDeg);
  const wheelAngle = roll(streetDist);
  const wheels = { angle: wheelAngle, sweep: wheelAngle - roll(shutterDist) };

  // ----- The bar -----
  // Up on (or over) the bar, the board sorts its own parts around it: far
  // wheels behind, deck on top. Anywhere else the whole rider is on one side
  // of it, in front or behind.
  let barBoard: BoardBar | undefined;
  let barBehind: ReactElement | null = null;
  let barFront: ReactElement | null = null;
  if (span) {
    const bar = drawBar(cam, span);
    const c = rig.board.center;
    const alongside = c.x > span.x0 - BAR_REACH && c.x < span.x1 + BAR_REACH;
    if (alongside && Math.abs(c.z - BAR_Z) < BAR_REACH && c.y < BAR_TOP_Y + 6) {
      barBoard = { el: bar, cover: bar, clipId: `${idBase}-bar`, z: BAR_Z, top: BAR_TOP_Y };
    } else if (hipZ(rig) > BAR_Z) {
      barBehind = <g key="bar">{bar}</g>;
    } else {
      barFront = <g key="bar">{bar}</g>;
    }
  }
  const board = drawBoard(cam, rig.board, { graphic: accent, stripe: mixHex(robot.avatar.body, '#ffffff', 0.35) }, wheels, barBoard);
  const expression = pose?.expression ?? (plan ? grindExpression(t, plan) : expressionAt(f.t, landed));
  const rider = drawRobot(cam, rig, look, expression, <g key="board">{board}</g>);

  return (
    <div
      className={`trick-anim trick-anim--3d trick-scene ${isPlaying && staticTime == null ? 'trick-anim--moving' : ''}`}
      style={{ background: PALETTE.concrete }}
      data-renderer="scene"
      data-rider-stance={riderStance}
      data-nose-foot={mechanics.noseFoot}
      data-toe-side={mechanics.orientationSign}
      data-board-flip={rig.board.flipDeg.toFixed(1)}
      data-board-yaw={rig.board.yawDeg.toFixed(1)}
      data-board-height={(grind ? boardHeight : GROUND - f.board.y).toFixed(1)}
      data-rotation-progress={f.motion.rotation.toFixed(3)}
      data-flick-depth={rig.flickZ.toFixed(1)}
      data-current-body-yaw={rig.bodyYawDeg.toFixed(1)}
      data-current-head-yaw={rig.headYawDeg.toFixed(1)}
      data-camera-lift={lift.toFixed(1)}
      data-wheel-roll={wheels.angle.toFixed(4)}
      data-playback-rate={effectivePlaybackRate}
      data-time={t.toFixed(3)}
      data-grind={plan ? `${plan.spec.side} ${plan.spec.base}` : undefined}
      data-grind-entry={plan?.entry ? plan.entry.trick.base : undefined}
      data-grind-exit={plan?.exit ? `${plan.spec.exitNose ? 'Nollie ' : ''}${plan.exit.trick.base}` : undefined}
      data-grind-phase={grind ? grind.frame.phase : undefined}
      data-bar-x0={span ? span.x0.toFixed(1) : undefined}
    >
      <button
        type="button"
        className="trick-anim-3d__replay"
        aria-label={inLeadIn ? lead.label : `Replay ${robot.name} attempting ${trick.name}`}
        aria-roledescription="trick animation"
        onClick={() => {
          if (!inLeadIn) replay();
          else if (lead.skipTo != null && t < lead.skipTo) seek(lead.skipTo);
        }}
      >
        <svg viewBox={viewBox} xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
          <defs>
            {backdrop.defs}
            <filter id={shadowBlurId} x="-30%" y="-60%" width="160%" height="220%">
              <feGaussianBlur stdDeviation="1.8" />
            </filter>
          </defs>
          <g aria-hidden="true">{backdrop.layers}</g>
          {shadows}
          {dust}
          {barBehind}
          {rider}
          {barFront}
        </svg>
      </button>
      {lead?.overlay?.(t)}
      {speedToggleVisible && !inLeadIn && (
        <button
          type="button"
          className="trick-anim-3d__speed-toggle"
          aria-label={`Animation speed ${selectedPlaybackRate === 1 ? '1x' : '.5x'}; switch to ${selectedPlaybackRate === 1 ? '.5x' : '1x'}`}
          title={`Animation speed: ${selectedPlaybackRate === 1 ? '1x' : '.5x'}`}
          onClick={togglePlaybackRate}
        >
          {selectedPlaybackRate === 1 ? '1x' : '.5x'}
        </button>
      )}
    </div>
  );
}
