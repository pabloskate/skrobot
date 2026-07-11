'use client';

import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import type { Robot, Trick } from './types';
import {
  computeFrame,
  specFor,
  knee,
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
  STREET_DASH_PERIOD,
  STREET_DASH_SECONDS,
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
// the viewer), pitched gently down so the ground reads as a plane without
// looking like a steep hill (higher pitch = flatter street).
const CAM_YAW = rad(-26);
const CAM_PITCH = rad(18);
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

// ---------- Fixed 3D sky: blue backdrop + sun + soft clouds ----------

/** A puffy cloud from a few overlapping ellipses, projected at a sky depth. */
function cloudAt(key: string, x: number, y: number, z: number, scale: number, opacity: number): ReactElement {
  const puffs: Array<[number, number, number, number]> = [
    [0, 0, 18, 10],
    [-16, 2, 14, 8],
    [16, 3, 13, 7.5],
    [-6, -6, 12, 8],
    [8, -5, 11, 7],
  ];
  return (
    <g key={key} className="trick-anim-3d__cloud" opacity={opacity}>
      {puffs.map(([dx, dy, rx, ry], i) => {
        const p = project({ x: x + dx * scale, y: y + dy * scale, z });
        return (
          <ellipse
            key={i}
            cx={p.x}
            cy={p.y}
            rx={rx * scale * p.s}
            ry={ry * scale * p.s}
          />
        );
      })}
    </g>
  );
}

function buildSkyScenery(backZ: number): ReactElement[] {
  const z = backZ + 6;
  const sun = project({ x: X0 + 70, y: GROUND - 88, z });
  return [
    <circle key="sun" className="trick-anim-3d__scenery-sun" cx={sun.x} cy={sun.y} r={30 * sun.s} opacity={0.85} />,
    <circle key="sunGlow" className="trick-anim-3d__scenery-sun" cx={sun.x} cy={sun.y} r={48 * sun.s} opacity={0.28} />,
    cloudAt('cloudA', 60, GROUND - 118, z + 4, 1.05, 0.72),
    cloudAt('cloudB', 220, GROUND - 138, z, 0.85, 0.62),
    cloudAt('cloudC', 390, GROUND - 110, z + 2, 1.15, 0.7),
    cloudAt('cloudD', 470, GROUND - 150, z - 2, 0.7, 0.5),
  ];
}

// ---------- Board geometry ----------
// Local board frame: x = long axis, y = down, z = lateral (width). The kicks
// mirror the side-view deck path. Planform is a full-width middle with
// elliptical nose/tail caps so corners read rounded (not a sharp box).

// Kick curve: longer tips + steeper rise near the ends so nose/tail read
// bigger and more concave, with a milder belly in the middle.
const DECK_PROFILE: ReadonlyArray<[number, number]> = [
  [-48, -8],
  [-42, -6.2],
  [-36, -4],
  [-28, -2.2],
  [-16, -1.4],
  [0, -1.1],
  [16, -1.4],
  [28, -2.2],
  [36, -4],
  [42, -6.2],
  [48, -8],
];
const DECK_TIP_X = 48;
const DECK_HALF_W = 8.5;
/** Radius of the rounded nose/tail caps in board units. */
const DECK_CORNER_R = 9.5;
const DECK_OUTLINE_SAMPLES = 40;
const WHEEL_X = 28;
const WHEEL_Y = 8;
const WHEEL_Z = 7;

/** Kick height (local y) along the long axis via the side-view profile. */
function deckKickY(x: number): number {
  if (x <= DECK_PROFILE[0][0]) return DECK_PROFILE[0][1];
  for (let i = 1; i < DECK_PROFILE.length; i++) {
    const [x0, y0] = DECK_PROFILE[i - 1];
    const [x1, y1] = DECK_PROFILE[i];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return DECK_PROFILE[DECK_PROFILE.length - 1][1];
}

/** Half-width of the deck planform at long-axis x. Full width through the
 *  middle; elliptical caps near each tip so nose/tail corners are soft. */
function deckHalfWidth(x: number): number {
  const ax = Math.abs(x);
  const roundStart = DECK_TIP_X - DECK_CORNER_R;
  if (ax <= roundStart) return DECK_HALF_W;
  const u = (ax - roundStart) / DECK_CORNER_R;
  if (u >= 1) return 0;
  return DECK_HALF_W * Math.sqrt(1 - u * u);
}

/** Closed local-space outline: left rail nose→tail, then right rail tail→nose. */
function buildDeckOutlineLocal(): V3[] {
  const pts: V3[] = [];
  const n = DECK_OUTLINE_SAMPLES;
  for (let i = 0; i <= n; i++) {
    const x = -DECK_TIP_X + (2 * DECK_TIP_X * i) / n;
    pts.push({ x, y: deckKickY(x), z: -deckHalfWidth(x) });
  }
  // Skip tip endpoints (already on left rail where half-width → 0).
  for (let i = n - 1; i >= 1; i--) {
    const x = -DECK_TIP_X + (2 * DECK_TIP_X * i) / n;
    pts.push({ x, y: deckKickY(x), z: deckHalfWidth(x) });
  }
  return pts;
}

const DECK_OUTLINE_LOCAL = buildDeckOutlineLocal();

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
const FOOT_Z = 2.6;
const KNEE_Z = 3.4;
// Compact skate-boot dimensions. Keep them short so both boots stay on the
// rails under the 3/4 camera instead of reading as long sausages hanging off.
const BOOT_HEEL_Z = 2.4;
const BOOT_TOE_Z = 3.8;
const BOOT_W = 5.2;
const ANKLE_LIFT = 2.2;

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
  const skyGradId = useId().replace(/:/g, '');
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
  // Dolphin keeps its original nose-dive pitch; varials leave forwardPitchDeg
  // at 0 and only get the mild board.rot pitch from computeFrame.
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
  // Outline uses rounded nose/tail caps (see buildDeckOutlineLocal).
  const deckNormal = rotY(rotZ(rotX({ x: 0, y: -1, z: 0 }, flipDeg3d), pitchDeg3d), yawDegBoard3d);
  const deckFill = dirDepth(deckNormal) >= 0 ? 'currentColor' : colors.accent;
  const deckPts: V3[] = DECK_OUTLINE_LOCAL.map(B);
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
  // Shin ends at the ankle (slightly above the sole) so the boot cuff reads
  // as a shoe rather than a line stabbed through the middle of a sausage.
  const ankleL3 = S({ x: f.footL.x, y: f.footL.y - ANKLE_LIFT, z: -FOOT_Z });
  const ankleR3 = S({ x: f.footR.x, y: f.footR.y - ANKLE_LIFT, z: FOOT_Z + flickZ });
  // Both knees protrude toward toeside (same z side), matching the 2D IK
  // which always bends both knees forward — splitting them to opposite z
  // sides makes the shins cross under the 3/4 camera.
  const kneeL3 = S({ x: kneeL.x, y: kneeL.y, z: toeDir * KNEE_Z });
  const kneeR3 = S({ x: kneeR.x, y: kneeR.y, z: toeDir * KNEE_Z + flickZ * 0.55 });

  // Legs
  pushLine(prims, 'thighL', hip3, kneeL3, 'currentColor', { width: 6.5 });
  pushLine(prims, 'shinL', kneeL3, ankleL3, 'currentColor', { width: 6.5 });
  pushLine(prims, 'thighR', hip3, kneeR3, 'currentColor', { width: 6.5 });
  pushLine(prims, 'shinR', kneeR3, ankleR3, 'currentColor', { width: 6.5 });
  pushDot(prims, 'kneeL', kneeL3, 3.6, colors.accent, 'currentColor', 1.2, 1, 0.4);
  pushDot(prims, 'kneeR', kneeR3, 3.6, colors.accent, 'currentColor', 1.2, 1, 0.4);

  // Boots: compact skate stance (across the deck, slight forward rake), with a
  // short cuff at the ankle so they match the 2D rounded-rect boots instead of
  // long white-tipped sausages hanging off the rails.
  const pushBoot = (key: string, foot: { x: number; y: number }, centerZ: number, ankle: V3) => {
    const soleY = foot.y + 0.6;
    const heel = S({ x: foot.x - 1.2, y: soleY, z: centerZ - toeDir * BOOT_HEEL_Z });
    const mid = S({ x: foot.x + 1.2, y: soleY, z: centerZ + toeDir * 0.6 });
    const toe = S({ x: foot.x + 3.6, y: soleY, z: centerZ + toeDir * BOOT_TOE_Z });
    // Cuff: ankle → mid-boot so the shin meets a clean shoe top.
    pushCapsule(prims, `${key}Cuff`, ankle, mid, BOOT_W - 0.6, colors.accent, 1.5, 1, 0.9);
    // Sole body: short heel→toe capsule, no white toe tip.
    pushCapsule(prims, key, heel, toe, BOOT_W, colors.accent, 1.8, 1, 1.1);
    // Soft toe end-cap (same accent) so the tip reads rounded without a blob.
    pushDot(prims, `${key}Toe`, toe, BOOT_W * 0.38, colors.accent, 'currentColor', 1.1, 1, 1.2);
    pushDot(prims, `${key}Heel`, heel, BOOT_W * 0.32, colors.accent, 'currentColor', 1.0, 1, 1.0);
  };
  pushBoot('bootL', f.footL, -FOOT_Z, ankleL3);
  pushBoot('bootR', f.footR, FOOT_Z + flickZ, ankleR3);

  // Arms — far/near sides of the torso; body yaw swaps them for real.
  // Fully opaque in 3D: depth sorting already puts the back arm behind the
  // torso (the 2D fade is only needed for the side-view fake depth cue).
  // One shoulder ball only (matches 2D). Drawing both front+back joints stacks
  // them into a double-ball under the 3/4 camera.
  const shoulderB = S({ x: 5, y: -38, z: -6 });
  const handB = S({ x: 5 + Math.sin(f.armBack) * 30, y: -38 + Math.cos(f.armBack) * 30, z: -7 });
  pushLine(prims, 'armB', shoulderB, handB, colors.accent, { width: 6.5 });
  pushDot(prims, 'handB', handB, 4.5, colors.accent, 'currentColor', 1.5, 1, 0.2);

  const shoulderF = S({ x: 5, y: -38, z: 6 });
  const handF = S({ x: 5 + Math.sin(f.armFront) * 30, y: -38 + Math.cos(f.armFront) * 30, z: 7 });
  pushLine(prims, 'armF', shoulderF, handF, colors.accent, { width: 6.5 });
  pushDot(prims, 'handF', handF, 4.5, colors.accent, 'currentColor', 1.5, 1, 0.2);

  const nearShoulder =
    project(shoulderF).depth >= project(shoulderB).depth ? shoulderF : shoulderB;
  pushDot(prims, 'shoulder', nearShoulder, 4.5, colors.accent, 'currentColor', 1.5, 1, 0.4);

  // Torso + hip joint
  pushCapsule(prims, 'torso', S({ x: 1, y: -11, z: 0 }), S({ x: 1, y: -39, z: 0 }), 22, colors.body, 2.5);
  pushDot(prims, 'hip', hip3, 4.5, colors.accent, 'currentColor', 1.5, 1, 11);

  // Neck + head
  pushLine(prims, 'neck', S({ x: 7, y: -50, z: 0 }), S({ x: 7, y: -56, z: 0 }), colors.accent, { width: 3 });
  pushCapsule(prims, 'head', S({ x: 5, y: -65, z: 0 }), S({ x: 9, y: -65, z: 0 }), 22, colors.body, 2.5);
  // Visor rides the camera side of the head, so 180s genuinely turn the face
  // away (depth sorting hides it behind the head capsule).
  pushCapsule(prims, 'visor', S({ x: 2.5, y: -65.5, z: 4 }), S({ x: 11.5, y: -65.5, z: 4 }), 9, 'currentColor', 0, 0.85);
  pushDot(prims, 'eye', S({ x: 12, y: -65.5, z: 4.5 }), 2.4, colors.accent, undefined, 0, 1, 0.3);

  // Antenna
  pushLine(prims, 'antenna', S({ x: 7, y: -76, z: 0 }), S({ x: 7, y: -84, z: 0 }), 'currentColor', { width: 2.5 });
  pushDot(prims, 'antennaBall', S({ x: 7, y: -85.5, z: 0 }), 3, colors.accent, 'currentColor', 1.5, 1, 0.2);

  prims.sort((a, b) => a.depth - b.depth);

  // ----- Ground: oversized projected floor so the 3/4 camera never leaves a
  // seam at the viewBox edges (the old tight spot made a diagonal wall cut
  // on wider layouts when the CSS sky showed through). -----
  const spotLeft = -900;
  const spotRight = W + 900;
  const spotBackZ = -160;
  const spotFrontZ = 560;
  const floorPath = projectedPolyPath([
    { x: spotLeft, y: GROUND, z: spotBackZ },
    { x: spotRight, y: GROUND, z: spotBackZ },
    { x: spotRight, y: GROUND, z: spotFrontZ },
    { x: spotLeft, y: GROUND, z: spotFrontZ },
  ]);
  // Soft horizon line only (no solid back wall — that panel's left edge was
  // the diagonal seam on wide screens).
  const backEdge = projectedPath([
    { x: spotLeft, y: GROUND, z: spotBackZ },
    { x: spotRight, y: GROUND, z: spotBackZ },
  ]);

  // Scrolling street dashes on the floor. Same clock + dir as the 2D CSS
  // dashes: ground slides opposite travel, so fakie (dir=-1) reverses free.
  const dashPeriod = STREET_DASH_PERIOD;
  const dashLen = 46;
  const scroll =
    ((f.streetDist / STREET_DASH_SECONDS) * STREET_DASH_PERIOD * spec.dir) % dashPeriod;
  // Positive phase shifts dashes toward -x for dir=+1 (ground flows back).
  const phase = ((-scroll) % dashPeriod + dashPeriod) % dashPeriod;
  // One center strip under the travel path (matches the single 2D street line).
  const dashZ = 18;
  const streetDashes: ReactElement[] = [];
  let dashIdx = 0;
  for (let x = spotLeft + phase; x < spotRight + dashPeriod; x += dashPeriod) {
    const a: V3 = { x, y: GROUND, z: dashZ };
    const b: V3 = { x: x + dashLen, y: GROUND, z: dashZ };
    const pa = project(a);
    const pb = project(b);
    const s = (pa.s + pb.s) / 2;
    streetDashes.push(
      <line
        key={`dash${dashIdx++}`}
        className="trick-anim-3d__street-dash"
        x1={pa.x}
        y1={pa.y}
        x2={pb.x}
        y2={pb.y}
        strokeWidth={Math.max(1.2, 2.4 * s)}
        opacity={0.28}
      />
    );
  }

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
  const skyScenery = buildSkyScenery(spotBackZ);

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
        <defs>
          <linearGradient id={skyGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7ec8f0" />
            <stop offset="48%" stopColor="#a8daf5" />
            <stop offset="78%" stopColor="#d6eefb" />
            <stop offset="100%" stopColor="#dce7ed" />
          </linearGradient>
        </defs>
        {/* Full-frame sky under everything so projected floor edges never
            leak the container background on wide layouts. */}
        <rect
          fill={`url(#${skyGradId})`}
          x={0}
          y={-SKY_PAD}
          width={W}
          height={H + SKY_PAD}
        />
        <g aria-hidden="true">{skyScenery}</g>
        <path className="trick-anim-3d__floor-plane" d={floorPath} />
        <path className="trick-anim-3d__back-edge" d={backEdge} />
        {streetDashes}
        {boardShadow}
        {skaterShadow}

        {/* Depth-sorted board + skater */}
        {prims.map((p) => p.el)}
      </svg>
    </div>
  );
}
