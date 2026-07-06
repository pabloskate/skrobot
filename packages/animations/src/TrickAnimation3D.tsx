'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { Robot, Trick } from './types';
import {
  computeFrame,
  specFor,
  knee,
  darken,
  randomFallVariant,
  W,
  H,
  GROUND,
  X0,
  SKY_PAD,
  FOOT_Y,
  JUMP,
  ROLL_IN,
  FLIP_T,
  LAND_T,
  FALL_T,
  HOLD,
  type BackgroundSceneId,
  type FallVariant,
} from './TrickAnimation';

/**
 * True-3D take on TrickAnimation. The physics is the same computeFrame the
 * side view uses; only the rendering differs. Instead of faking rotations
 * with scaleX/scaleY squash, the board and skater are modeled as 3D points
 * and rotated with real rotation matrices:
 *
 *   flip (kickflip/heelflip)  → rotation around the board's long axis
 *   shuvit / spin yaw         → rotation around the vertical axis
 *   pop, spin dip, impossible → rotation around the lateral axis
 *   body 180s / 360s / bigspins → skater rotation around the vertical axis
 *
 * Everything is projected through a fixed 3/4 perspective camera onto the
 * same SVG stage, and painter's-algorithm depth sorting replaces the
 * hand-tuned 2D z-order rules (e.g. the flick foot passes behind the deck
 * automatically because it really is farther from the camera).
 */

interface Props {
  robot: Robot;
  trick: Trick;
  landed: boolean;
  onDone: () => void;
  playbackRate?: number;
  backgroundSceneId?: BackgroundSceneId;
  fallVariant?: FallVariant;
  /** Freeze the animation on the current frame (e.g. to grab a screenshot). */
  paused?: boolean;
  /** Whether the robot knew the trick; false forces the "shank" fall. */
  knewIt?: boolean;
}

// ---------- 3D math ----------
// World space matches the 2D stage: x = travel direction (right), y = DOWN
// (SVG convention, so computeFrame values drop in unchanged), z = toward the
// camera. Ground plane is y = GROUND.

interface V3 {
  x: number;
  y: number;
  z: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const rotX = (p: V3, deg: number): V3 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
};
const rotY = (p: V3, deg: number): V3 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
};
const rotZ = (p: V3, deg: number): V3 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
};

// Camera: yawed 26° so we look slightly along the street (skater approaches
// the viewer), pitched 13° down so the ground plane reads as a plane.
const CAM_YAW = rad(-26);
const CAM_PITCH = rad(13);
const PERSP = 1000;
const COS_A = Math.cos(CAM_YAW);
const SIN_A = Math.sin(CAM_YAW);
const COS_B = Math.cos(CAM_PITCH);
const SIN_B = Math.sin(CAM_PITCH);

interface Proj {
  x: number;
  y: number;
  /** Perspective scale at this depth (1 at the stage anchor). */
  s: number;
  /** Camera-space depth; larger = closer to the viewer. */
  depth: number;
}

function project(p: V3): Proj {
  const dx = p.x - X0;
  const wy = GROUND - p.y; // world-up height
  const x1 = dx * COS_A + p.z * SIN_A;
  const z1 = -dx * SIN_A + p.z * COS_A;
  const y2 = wy * COS_B - z1 * SIN_B;
  const z2 = wy * SIN_B + z1 * COS_B;
  const s = PERSP / (PERSP - z2);
  return { x: X0 + x1 * s, y: GROUND - y2 * s, s, depth: z2 };
}

/** Camera-space depth component of a direction (for facing tests). */
function dirDepth(d: V3): number {
  const z1 = -d.x * SIN_A + d.z * COS_A;
  return -d.y * SIN_B + z1 * COS_B;
}

// ---------- Depth-sorted primitives ----------

interface Prim {
  depth: number;
  el: ReactElement;
}

interface StrokeOpts {
  width: number;
  opacity?: number;
  cap?: 'round' | 'butt';
  depthBias?: number;
}

function pushLine(prims: Prim[], key: string, a: V3, b: V3, stroke: string, opts: StrokeOpts) {
  const pa = project(a);
  const pb = project(b);
  const s = (pa.s + pb.s) / 2;
  prims.push({
    depth: (pa.depth + pb.depth) / 2 + (opts.depthBias ?? 0),
    el: (
      <line
        key={key}
        x1={pa.x}
        y1={pa.y}
        x2={pb.x}
        y2={pb.y}
        stroke={stroke}
        strokeWidth={opts.width * s}
        strokeLinecap={opts.cap ?? 'round'}
        opacity={opts.opacity ?? 1}
      />
    ),
  });
}

/** A filled rounded shape with an ink outline, drawn as two stacked
 *  round-cap strokes (the 3D stand-in for the 2D rounded rects). */
function pushCapsule(
  prims: Prim[],
  key: string,
  a: V3,
  b: V3,
  width: number,
  fill: string,
  inkWidth: number,
  opacity = 1,
  depthBias = 0
) {
  const pa = project(a);
  const pb = project(b);
  const s = (pa.s + pb.s) / 2;
  prims.push({
    depth: (pa.depth + pb.depth) / 2 + depthBias,
    el: (
      <g key={key} opacity={opacity}>
        {inkWidth > 0 && (
          <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="currentColor" strokeWidth={(width + inkWidth * 2) * s} strokeLinecap="round" />
        )}
        <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={fill} strokeWidth={width * s} strokeLinecap="round" />
      </g>
    ),
  });
}

function pushDot(
  prims: Prim[],
  key: string,
  p: V3,
  r: number,
  fill: string,
  stroke?: string,
  strokeWidth = 0,
  opacity = 1,
  depthBias = 0
) {
  const pp = project(p);
  prims.push({
    depth: pp.depth + depthBias,
    el: (
      <circle
        key={key}
        cx={pp.x}
        cy={pp.y}
        r={r * pp.s}
        fill={fill}
        stroke={stroke}
        strokeWidth={stroke ? strokeWidth * pp.s : undefined}
        opacity={opacity}
      />
    ),
  });
}

function pushPoly(prims: Prim[], key: string, pts: V3[], fill: string, strokeWidth: number, depthBias = 0) {
  const proj = pts.map(project);
  const depth = proj.reduce((sum, p) => sum + p.depth, 0) / proj.length;
  const sAvg = proj.reduce((sum, p) => sum + p.s, 0) / proj.length;
  const d = proj.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';
  prims.push({
    depth: depth + depthBias,
    el: <path key={key} d={d} fill={fill} stroke="currentColor" strokeWidth={strokeWidth * sAvg} strokeLinejoin="round" />,
  });
}

function projectedPath(pts: V3[]): string {
  return pts.map((p, i) => {
    const pp = project(p);
    return `${i ? 'L' : 'M'} ${pp.x.toFixed(1)} ${pp.y.toFixed(1)}`;
  }).join(' ');
}

function projectedPolyPath(pts: V3[]): string {
  return `${projectedPath(pts)} Z`;
}

// ---------- Board geometry ----------
// Local board frame: x = long axis, y = down, z = lateral (width). The kicks
// mirror the side-view deck path.

const DECK_PROFILE: ReadonlyArray<[number, number]> = [
  [-44, -5],
  [-34, -3],
  [-24, -2],
  [0, -1.2],
  [24, -2],
  [34, -3],
  [44, -5],
];
const DECK_HALF_W = 8.5;
const WHEEL_X = 28;
const WHEEL_Y = 8;
const WHEEL_Z = 7;

/** Board local → world: flip around the long axis first, then pitch, then
 *  yaw, all around the pivot (pivot = board center except impossibles, which
 *  wrap the board around the popping foot exactly like the 2D transform). */
function boardPoint(local: V3, flipDeg: number, pitchDeg: number, yawDeg: number, center: V3, pivot: V3): V3 {
  const q = rotX(local, flipDeg);
  const off: V3 = { x: center.x - pivot.x + q.x, y: center.y - pivot.y + q.y, z: center.z - pivot.z + q.z };
  const r = rotY(rotZ(off, pitchDeg), yawDeg);
  return { x: pivot.x + r.x, y: pivot.y + r.y, z: pivot.z + r.z };
}

// ---------- Skater geometry ----------
// Local skater frame: hip at origin, y down (matches computeFrame's body
// frame). Fall rotation (bodyRot) spins around the lateral axis through the
// 2D pivot; body yaw spins around the vertical axis through the hips.

const BODY_PIVOT_Y = FOOT_Y - 2;
// Feet stand ON the deck (half width 8.5), so the straddle is subtle — a wide
// straddle plants the boots off the rails and the legs read as crossed.
const FOOT_Z = 2.2;
const KNEE_Z = 3.4;

function skaterPoint(local: V3, bodyRotDeg: number, bodyYawDeg: number, hip: V3): V3 {
  let q: V3 = { x: local.x, y: local.y - BODY_PIVOT_Y, z: local.z };
  q = rotZ(q, bodyRotDeg);
  q = { x: q.x, y: q.y + BODY_PIVOT_Y, z: q.z };
  q = rotY(q, bodyYawDeg);
  return { x: hip.x + q.x, y: hip.y + q.y, z: hip.z + q.z };
}

// ---------- Component ----------

export default function TrickAnimation3D({
  robot,
  trick,
  landed,
  onDone,
  playbackRate = 1,
  fallVariant,
  paused = false,
  knewIt,
}: Props) {
  const forcedFall = !landed && knewIt === false ? ('shank' as FallVariant) : undefined;
  const [randomizedFallVariant] = useState<FallVariant>(() => randomFallVariant(knewIt));
  // In 3D, switch can't be faked with a 2D scaleX mirror — the skater model
  // always faces +x with chest toward +z. Instead, simulate switch as the
  // physical equivalent of riding backward + popping the nose: dir=-1 reverses
  // the street movement (like fakie) and nollie=true pops the nose (the
  // "nollie foot"). The spin directions auto-correct because spinFix = -dir
  // flips sign, compensating for the reversed travel direction.
  const [spec] = useState(() => {
    const base = specFor(trick);
    if (trick.stance === 'switch') {
      return { ...base, dir: -1 as const, nollie: true };
    }
    return base;
  });
  const resolvedFallVariant = forcedFall ?? fallVariant ?? randomizedFallVariant;
  const [frame, setFrame] = useState(() => computeFrame(0, spec, landed, resolvedFallVariant));
  const [isPlaying, setIsPlaying] = useState(true);
  const [replayNonce, setReplayNonce] = useState(0);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const pausedRef = useRef(paused);
  const effectivePlaybackRate = Math.max(0.05, playbackRate);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const end = ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T);
    const durationMs = ((end + HOLD) / effectivePlaybackRate) * 1000;
    const finish = () => {
      setIsPlaying(false);
      if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current();
      }
    };
    let raf = 0;
    let lastNow: number | null = null;
    let animationTime = 0;
    const tick = (now: number) => {
      if (lastNow === null) lastNow = now;
      const dt = (now - lastNow) / 1000;
      lastNow = now;
      if (!pausedRef.current) {
        animationTime += dt * effectivePlaybackRate;
      }
      setFrame(computeFrame(Math.min(animationTime, end), spec, landed, resolvedFallVariant));
      if (animationTime >= end + HOLD) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    let failSafe = 0;
    const armFailSafe = () => {
      failSafe = window.setTimeout(() => {
        if (pausedRef.current) {
          armFailSafe();
          return;
        }
        setFrame(computeFrame(end, spec, landed, resolvedFallVariant));
        finish();
      }, durationMs + 500);
    };
    armFailSafe();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(failSafe);
    };
  }, [spec, landed, resolvedFallVariant, effectivePlaybackRate, replayNonce]);

  const replay = () => {
    setIsPlaying(true);
    setFrame(computeFrame(0, spec, landed, resolvedFallVariant));
    setReplayNonce((current) => current + 1);
  };

  const colors = robot.avatar;
  const f = frame;
  const prims: Prim[] = [];

  // The face/chest is modeled on the camera side (+z) and rotY(+deg) turns +z
  // toward +x, so a frontside spin (chest sweeps toward the direction of
  // travel) is POSITIVE here for a forward rider and negative for fakie.
  // computeFrame bakes spinDir with frontside = -1, hence the -dir flip.
  const spinFix = -spec.dir;
  const yawDeg3d = spinFix * f.spin3d.yawDeg;
  const bodyYawDeg3d = spinFix * f.spin3d.bodyYawDeg;
  // Toeside is the camera side (+z) except in switch; a kickflip's griptape
  // must tip toward the heels, so switch mirrors the flip axis too.
  const toeDir = spec.stance === 'switch' ? -1 : 1;
  const rawFlightP = (f.t - ROLL_IN) / FLIP_T;
  const catchP3d = clamp01(rawFlightP / 0.85);
  const spinP3d = rawFlightP < 0 ? 0 : rawFlightP >= 1 ? 1 : spec.late ? clamp01((rawFlightP - 0.38) / 0.30) : catchP3d;
  const isForwardFlip = spec.forwardFlip;
  const flipDeg3d = toeDir * f.spin3d.flipDeg;
  const pitchDeg3d = f.board.rot + (isForwardFlip ? Math.sin(spinP3d * Math.PI) * 42 * toeDir : 0);
  const yawDegBoard3d = yawDeg3d;

  // ----- Board -----
  const boardCenter: V3 = { x: f.board.x, y: f.board.y, z: 0 };
  const isImpossible = spec.roll !== 0;
  const popFoot = isImpossible ? (spec.nollie ? f.footR : f.footL) : null;
  const pivot: V3 = popFoot ? { x: f.body.x + popFoot.x, y: f.body.y + popFoot.y, z: 0 } : boardCenter;
  const B = (local: V3) => boardPoint(local, flipDeg3d, pitchDeg3d, yawDegBoard3d, boardCenter, pivot);

  // Deck top surface: griptape (ink) when the top faces the camera, accent
  // graphic when we see the underside — the 3D version of the 2D sy flip.
  const deckNormal = rotY(rotZ(rotX({ x: 0, y: -1, z: 0 }, flipDeg3d), pitchDeg3d), yawDegBoard3d);
  const deckFill = dirDepth(deckNormal) >= 0 ? 'currentColor' : colors.accent;
  const deckPts: V3[] = [
    ...DECK_PROFILE.map(([u, v]) => ({ x: u, y: v, z: -DECK_HALF_W })),
    ...[...DECK_PROFILE].reverse().map(([u, v]) => ({ x: u, y: v, z: DECK_HALF_W })),
  ].map(B);
  pushPoly(prims, 'deck', deckPts, deckFill, 2);

  // Trucks (hanger + axle) and wheels.
  for (const side of [-1, 1] as const) {
    const tx = side * WHEEL_X;
    pushLine(prims, `hanger${side}`, B({ x: tx, y: 1, z: 0 }), B({ x: tx, y: WHEEL_Y - 1, z: 0 }), 'currentColor', {
      width: 4,
      opacity: 0.45,
    });
    pushLine(prims, `axle${side}`, B({ x: tx, y: WHEEL_Y, z: -WHEEL_Z }), B({ x: tx, y: WHEEL_Y, z: WHEEL_Z }), 'currentColor', {
      width: 2.5,
      opacity: 0.45,
    });
    for (const wz of [-1, 1] as const) {
      const c = B({ x: tx, y: WHEEL_Y, z: wz * WHEEL_Z });
      pushDot(prims, `wheel${side}${wz}`, c, 5, '#fbfbf3', 'currentColor', 2);
      pushDot(prims, `hub${side}${wz}`, c, 1.8, colors.accent, undefined, 0, 1, 0.6);
    }
  }

  // ----- Skater -----
  // Facing shading matches the 2D rule: switch/fakie start on the dark back
  // side, and body rotation flips which side the camera sees.
  const stanceSign = spec.stance === 'switch' || spec.stance === 'fakie' ? -1 : 1;
  const showBack = stanceSign * f.body.sx < 0;
  const bodyFill = showBack ? darken(colors.body) : colors.body;

  const hip: V3 = { x: f.body.x, y: f.body.y, z: 0 };
  const S = (local: V3) => skaterPoint(local, f.body.rot, bodyYawDeg3d, hip);

  // Flick-foot lateral swing: on flip tricks footR leaves the deck sideways —
  // toward the heels for kickflips, toward the toes for heelflips — the true-3D
  // version of the 2D flickBehind z-order rule. Runs on the same catch/late
  // clock as the flip so the foot is back over the bolts for the catch.
  let flickZ = 0;
  if (spec.flipDir && rawFlightP >= 0 && rawFlightP < 1) {
    const flickAmount = 9;
    flickZ = -spec.flipDir * toeDir * flickAmount * Math.sin(spinP3d * Math.PI);
  }

  const kneeL = knee(f.footL);
  const kneeR = knee(f.footR);
  const hip3 = S({ x: 0, y: 0, z: 0 });
  const footL3 = S({ x: f.footL.x, y: f.footL.y, z: -FOOT_Z });
  const footR3 = S({ x: f.footR.x, y: f.footR.y, z: FOOT_Z + flickZ });
  // Both knees protrude toward toeside (same z side), matching the 2D IK
  // which always bends both knees forward — splitting them to opposite z
  // sides makes the shins cross under the 3/4 camera.
  const kneeL3 = S({ x: kneeL.x, y: kneeL.y, z: toeDir * KNEE_Z });
  const kneeR3 = S({ x: kneeR.x, y: kneeR.y, z: toeDir * KNEE_Z + flickZ * 0.55 });

  // Legs
  pushLine(prims, 'thighL', hip3, kneeL3, 'currentColor', { width: 6.5 });
  pushLine(prims, 'shinL', kneeL3, footL3, 'currentColor', { width: 6.5 });
  pushLine(prims, 'thighR', hip3, kneeR3, 'currentColor', { width: 6.5 });
  pushLine(prims, 'shinR', kneeR3, footR3, 'currentColor', { width: 6.5 });
  pushDot(prims, 'kneeL', kneeL3, 3.6, colors.accent, 'currentColor', 1.2, 1, 0.4);
  pushDot(prims, 'kneeR', kneeR3, 3.6, colors.accent, 'currentColor', 1.2, 1, 0.4);

  // Boots point ACROSS the deck toward toeside (a skate stance), not along the
  // long axis like skis, with a slight forward rake so they still read as feet.
  const pushBoot = (key: string, foot: { x: number; y: number }, centerZ: number) => {
    const heel = S({ x: foot.x - 2, y: foot.y, z: centerZ - toeDir * 3.5 });
    const toe = S({ x: foot.x + 3, y: foot.y, z: centerZ + toeDir * 6.5 });
    pushCapsule(prims, key, heel, toe, 7, colors.accent, 2, 1, 0.8);
    pushDot(prims, `${key}Toe`, toe, 2.5, '#fbfbf3', 'currentColor', 1.1, 1, 1);
  };
  pushBoot('bootL', f.footL, -FOOT_Z);
  pushBoot('bootR', f.footR, FOOT_Z + flickZ);

  // Arms — the back arm sits on the far side of the torso, the front arm on
  // the camera side; body yaw swaps them for real.
  const shoulderB = S({ x: 5, y: -38, z: -6 });
  const handB = S({ x: 5 + Math.sin(f.armBack) * 30, y: -38 + Math.cos(f.armBack) * 30, z: -7 });
  pushLine(prims, 'armB', shoulderB, handB, colors.accent, { width: 6.5, opacity: 0.45 });
  pushDot(prims, 'handB', handB, 4, colors.accent, undefined, 0, 0.5, 0.2);

  const shoulderF = S({ x: 5, y: -38, z: 6 });
  const handF = S({ x: 5 + Math.sin(f.armFront) * 30, y: -38 + Math.cos(f.armFront) * 30, z: 7 });
  pushLine(prims, 'armF', shoulderF, handF, colors.accent, { width: 6.5 });
  pushDot(prims, 'handF', handF, 4.5, colors.accent, 'currentColor', 1.5, 1, 0.2);
  pushDot(prims, 'shoulderF', shoulderF, 4.5, colors.accent, 'currentColor', 1.5, 1, 0.4);

  // Torso + hip joint
  pushCapsule(prims, 'torso', S({ x: 1, y: -11, z: 0 }), S({ x: 1, y: -39, z: 0 }), 22, bodyFill, 2.5);
  pushDot(prims, 'hip', hip3, 4.5, colors.accent, 'currentColor', 1.5, 1, 11);

  // Neck + head
  pushLine(prims, 'neck', S({ x: 7, y: -50, z: 0 }), S({ x: 7, y: -56, z: 0 }), colors.accent, { width: 3 });
  pushCapsule(prims, 'head', S({ x: 5, y: -65, z: 0 }), S({ x: 9, y: -65, z: 0 }), 22, bodyFill, 2.5);
  // Visor rides the camera side of the head, so 180s genuinely turn the face
  // away (depth sorting hides it behind the head capsule).
  pushCapsule(prims, 'visor', S({ x: 2.5, y: -65.5, z: 4 }), S({ x: 11.5, y: -65.5, z: 4 }), 9, 'currentColor', 0, 0.85);
  pushDot(prims, 'eye', S({ x: 12, y: -65.5, z: 4.5 }), 2.4, colors.accent, undefined, 0, 1, 0.3);

  // Antenna
  pushLine(prims, 'antenna', S({ x: 7, y: -76, z: 0 }), S({ x: 7, y: -84, z: 0 }), 'currentColor', { width: 2.5 });
  pushDot(prims, 'antennaBall', S({ x: 7, y: -85.5, z: 0 }), 3, colors.accent, 'currentColor', 1.5, 1, 0.2);

  prims.sort((a, b) => a.depth - b.depth);

  // ----- Ground: a projected mini skate spot, not the 2D scene backdrop -----
  const spotLeft = -180;
  const spotRight = W + 180;
  const spotBackZ = -92;
  const spotFrontZ = 170;
  const wallTop = -SKY_PAD - 12;
  const floorPath = projectedPolyPath([
    { x: spotLeft, y: GROUND, z: spotBackZ },
    { x: spotRight, y: GROUND, z: spotBackZ },
    { x: spotRight, y: GROUND, z: spotFrontZ },
    { x: spotLeft, y: GROUND, z: spotFrontZ },
  ]);
  const backWallPath = projectedPolyPath([
    { x: spotLeft, y: wallTop, z: spotBackZ },
    { x: spotRight, y: wallTop, z: spotBackZ },
    { x: spotRight, y: GROUND, z: spotBackZ },
    { x: spotLeft, y: GROUND, z: spotBackZ },
  ]);
  const backEdge = projectedPath([
    { x: spotLeft, y: GROUND, z: spotBackZ },
    { x: spotRight, y: GROUND, z: spotBackZ },
  ]);

  const shadowFor = (x: number, height: number, baseR: number, key: string) => {
    const p = project({ x, y: GROUND, z: 0 });
    const hf = clamp01(height / JUMP);
    const rx = baseR * p.s * (1 - 0.35 * hf);
    return (
      <ellipse
        key={key}
        className="trick-anim-3d__deck-shadow"
        cx={p.x}
        cy={p.y}
        rx={rx}
        ry={Math.max(2, rx * 0.2)}
        opacity={0.9 * (1 - 0.55 * hf)}
      />
    );
  };
  const boardShadow = shadowFor(f.board.x, Math.max(0, GROUND - f.board.y), 46, 'shadowBoard');
  const skaterShadow = shadowFor(f.body.x, Math.max(0, GROUND - f.body.y - (FOOT_Y - 2)), 30, 'shadowSkater');

  return (
    <div
      className={`trick-anim trick-anim--3d ${isPlaying ? 'trick-anim--moving' : ''}`}
      aria-label={`Replay ${robot.name} attempting ${trick.name} in 3D`}
      aria-roledescription="trick animation"
      role="button"
      tabIndex={0}
      onClick={replay}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        replay();
      }}
    >
      <svg viewBox={`0 ${-SKY_PAD} ${W} ${H + SKY_PAD}`} xmlns="http://www.w3.org/2000/svg">
        <path className="trick-anim-3d__back-wall" d={backWallPath} />
        <path className="trick-anim-3d__floor-plane" d={floorPath} />
        <path className="trick-anim-3d__back-edge" d={backEdge} />
        {boardShadow}
        {skaterShadow}

        {/* Depth-sorted board + skater */}
        {prims.map((p) => p.el)}
      </svg>
    </div>
  );
}
