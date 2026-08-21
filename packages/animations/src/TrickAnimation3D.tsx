'use client';

import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import type { RiderStance, Robot, Trick } from './types';
import { orientTrickRotation, resolveRiderMechanics } from './stanceMechanics';
import {
  computeFrame,
  specFor,
  knee,
  clampFootReach,
  darken,
  randomFallVariant,
  randomShankProgress,
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
  /** Show the in-stage .5x / 1x playback toggle. */
  showSpeedToggle?: boolean;
  backgroundSceneId?: BackgroundSceneId;
  fallVariant?: FallVariant;
  /** Freeze the animation on the current frame (e.g. to grab a screenshot). */
  paused?: boolean;
  /** Whether the robot knew the trick; false forces shank. true can still roll it. */
  knewIt?: boolean;
  /** The rider's natural footedness. Trick stance is resolved separately. */
  riderStance?: RiderStance;
  /** Render a single frozen frame at this absolute animation time (seconds,
   *  clamped to the trick's duration). Disables playback, replay, and onDone —
   *  used by the playground contact sheet to lay out key poses side by side. */
  fixedTime?: number;
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
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

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

// ---------- Lighting ----------
// One directional key light placed to agree with the drawn sun (high, to the
// right, slightly behind the rider). World y is DOWN, so the vector pointing
// *at* the light has a negative y. Everything with a real surface normal —
// the deck faces, the rails, the wheels — gets a Lambert term from this; the
// limbs are capsules with no single normal, so they take a screen-space
// highlight instead (see pushCapsule). Same light for both, so the shading
// reads as one scene rather than two unrelated tricks.

const norm3 = (v: V3): V3 => {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
};
const LIGHT_DIR = norm3({ x: 0.46, y: -0.82, z: 0.34 });
/** Screen-space light direction (y down), used for capsule highlights. */
const LIGHT_SCREEN = (() => {
  const a = project({ x: X0, y: GROUND - 40, z: 0 });
  const b = project({
    x: X0 + LIGHT_DIR.x * 40,
    y: GROUND - 40 + LIGHT_DIR.y * 40,
    z: LIGHT_DIR.z * 40,
  });
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
})();

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};
const rgbToHex = (r: number, g: number, b: number) =>
  `#${((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).padStart(6, '0')}`;
/** Mix a hex color toward white by `amount` (0–1). */
const lighten = (hex: string, amount: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
};
/** Lambert term for a surface normal, clamped to an ambient floor so nothing
 *  goes fully black — this is a bright outdoor scene with sky bounce. */
function lambert(n: V3): number {
  const d = n.x * LIGHT_DIR.x + n.y * LIGHT_DIR.y + n.z * LIGHT_DIR.z;
  return clamp01(0.5 + 0.5 * d);
}
/** Apply a Lambert term to a base color: lit faces gain white, shaded faces
 *  lose value. `strength` scales the whole effect for subtler materials. */
function shade(hex: string, lam: number, strength = 1): string {
  const k = (lam - 0.5) * 2 * strength;
  return k >= 0 ? lighten(hex, k * 0.34) : darken(hex, -k * 0.34);
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

/** A filled rounded shape with an ink outline, drawn as stacked round-cap
 *  strokes (the 3D stand-in for the 2D rounded rects). A limb has no single
 *  surface normal, so its volume comes from two offset strokes instead: a
 *  narrow highlight on the lit side of the cylinder and a narrow core shadow
 *  on the other. Both ride the shared LIGHT_SCREEN direction, so every limb,
 *  the torso, and the head are lit from the same place as the deck faces. */
function pushCapsule(
  prims: Prim[],
  key: string,
  a: V3,
  b: V3,
  width: number,
  fill: string,
  inkWidth: number,
  opacity = 1,
  depthBias = 0,
  /** 0 disables the volume shading (flat detail panels, decals). */
  shading = 1
) {
  const pa = project(a);
  const pb = project(b);
  const s = (pa.s + pb.s) / 2;
  // Screen-space perpendicular to the segment, flipped to point at the light.
  let px = -(pb.y - pa.y);
  let py = pb.x - pa.x;
  const pm = Math.hypot(px, py) || 1;
  px /= pm;
  py /= pm;
  if (px * LIGHT_SCREEN.x + py * LIGHT_SCREEN.y < 0) {
    px = -px;
    py = -py;
  }
  const w = width * s;
  return prims.push({
    depth: (pa.depth + pb.depth) / 2 + depthBias,
    el: (
      <g key={key} opacity={opacity}>
        {inkWidth > 0 && (
          <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="currentColor" strokeWidth={w + inkWidth * 2 * s} strokeLinecap="round" />
        )}
        <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={fill} strokeWidth={w} strokeLinecap="round" />
        {shading > 0 && (
          <line
            x1={pa.x + px * w * 0.3}
            y1={pa.y + py * w * 0.3}
            x2={pb.x + px * w * 0.3}
            y2={pb.y + py * w * 0.3}
            stroke={lighten(fill, 0.45)}
            strokeWidth={w * 0.22}
            strokeLinecap="round"
            opacity={0.35 * shading}
          />
        )}
      </g>
    ),
  }) - 1;
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
  // Layered mountain silhouettes anchor the horizon: a tall hazy far range,
  // then a lower greener ridge. Bases extend below ground so the floor plane
  // (drawn after this group) clips them cleanly. Both layers are OPAQUE
  // solid fills mixed from the scene variables — translucency would darken
  // every overlap and dissolve the ridgelines. The far range leans toward
  // the horizon haze (aerial perspective); the ridge stays close to the
  // floor green, so background themes (sunset, skyline…) keep both in palette.
  const left = X0 - 900;
  const right = W + 900;
  const mountainRange = (
    key: string,
    peaks: ReadonlyArray<readonly [number, number]>,
    fill: string,
  ): ReactElement => {
    // Shoulder points either side of each summit break the silhouette into
    // ridges instead of perfect triangles.
    const outline: V3[] = [{ x: left, y: GROUND, z: backZ }];
    for (const [dx, h] of peaks) {
      outline.push({ x: X0 + dx - 34, y: GROUND - h * 0.82, z: backZ });
      outline.push({ x: X0 + dx, y: GROUND - h, z: backZ });
      outline.push({ x: X0 + dx + 38, y: GROUND - h * 0.78, z: backZ });
    }
    outline.push({ x: right, y: GROUND, z: backZ });
    outline.push({ x: right, y: GROUND + 60, z: backZ });
    outline.push({ x: left, y: GROUND + 60, z: backZ });
    return (
      <path
        key={key}
        className="trick-anim-3d__mountain"
        d={projectedPolyPath(outline)}
        fill={fill}
      />
    );
  };
  const FAR_PEAKS: ReadonlyArray<readonly [number, number]> = [
    [-820, 44], [-650, 74], [-500, 38], [-340, 86], [-170, 54],
    [-10, 80], [150, 46], [320, 90], [470, 56], [630, 84], [790, 48], [950, 70],
  ];
  const NEAR_PEAKS: ReadonlyArray<readonly [number, number]> = [
    [-740, 26], [-560, 40], [-380, 22], [-200, 44], [-30, 28],
    [140, 46], [310, 24], [480, 42], [660, 26], [840, 38], [1010, 22],
  ];
  return [
    mountainRange(
      'mountainsFar',
      FAR_PEAKS,
      'color-mix(in srgb, var(--spot-floor, #95c07f) 42%, var(--spot-sky-horizon, #d6eefb))',
    ),
    mountainRange(
      'mountainsNear',
      NEAR_PEAKS,
      'color-mix(in srgb, var(--spot-floor, #95c07f) 82%, var(--spot-sky-horizon, #d6eefb))',
    ),
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
/** Top face — dark gray griptape (distinct from the underside graphic). */
const GRIP_TAPE = '#2f2f33';
/** Bottom face — warm maple-ish wood so flips read clearly against grip. */
const DECK_WOOD = '#c9a66b';

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

/** Closed local-space outline: left rail nose→tail, then right rail tail→nose.
 *  `offsetY` shifts the loop along the deck's own normal, which is how the top
 *  and bottom faces of the (now solid) deck are generated from one profile. */
function buildDeckOutlineLocal(offsetY = 0): V3[] {
  const pts: V3[] = [];
  const n = DECK_OUTLINE_SAMPLES;
  for (let i = 0; i <= n; i++) {
    const x = -DECK_TIP_X + (2 * DECK_TIP_X * i) / n;
    pts.push({ x, y: deckKickY(x) + offsetY, z: -deckHalfWidth(x) });
  }
  // Skip tip endpoints (already on left rail where half-width → 0).
  for (let i = n - 1; i >= 1; i--) {
    const x = -DECK_TIP_X + (2 * DECK_TIP_X * i) / n;
    pts.push({ x, y: deckKickY(x) + offsetY, z: deckHalfWidth(x) });
  }
  return pts;
}

/** Deck thickness in board units (7 plies read as ~2 at this scale). Without
 *  it the deck is an infinitely thin cutout that vanishes edge-on mid-flip. */
const DECK_THICKNESS = 1.8;
/** Ply/rail color: the raw maple edge, lighter than the printed underside. */
const DECK_PLY = '#cdaa74';
const DECK_TOP_LOCAL = buildDeckOutlineLocal(-DECK_THICKNESS / 2);
const DECK_BOTTOM_LOCAL = buildDeckOutlineLocal(DECK_THICKNESS / 2);
/** Outline samples per rail quad — 4 keeps the ply band under ~20 paths. */
const DECK_RAIL_STEP = 4;

const sub3 = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross3 = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const neg3 = (a: V3): V3 => ({ x: -a.x, y: -a.y, z: -a.z });

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
//
// Mild resting skate stance (3D only): feet already sit nose↔tail on the
// board, but the authored skeleton faces travel. A moderate yaw toward
// toeside turns the hips/shoulders to match that stance without going
// full sideways. The head yaws less so it still looks a bit down-street.

const BODY_PIVOT_Y = FOOT_Y - 2;
// Feet stand ON the deck (half width 8.5), so the straddle is subtle — a wide
// straddle plants the boots off the rails and the legs read as crossed.
const FOOT_Z = 2.6;
const KNEE_Z = 3.4;
const HIP_Z = 2.4;
// Compact skate-boot dimensions. Keep them short so both boots stay on the
// rails under the 3/4 camera instead of reading as long sausages hanging off.
const BOOT_HEEL_Z = 2.4;
const BOOT_TOE_Z = 3.8;
const BOOT_W = 5.2;
const ANKLE_LIFT = 2.2;
/** Mild torso yaw from travel toward toeside — enough to match the legs. */
const STANCE_BODY_YAW = 40;
/** Degrees the head stays toward travel relative to the torso yaw. */
const HEAD_LOOK_FORWARD = 16;

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
  showSpeedToggle = true,
  fallVariant,
  paused = false,
  knewIt,
  riderStance = 'regular',
  fixedTime,
}: Props) {
  const skyGradId = useId().replace(/:/g, '');
  const forcedFall = !landed && knewIt === false ? ('shank' as FallVariant) : undefined;
  const [randomizedFallVariant] = useState<FallVariant>(randomFallVariant);
  const [shankProgress] = useState(randomShankProgress);
  // Fakie changes travel and nollie changes the pop end. Switch changes only
  // anatomy below; it is not simulated as fakie + nollie.
  const [spec] = useState(() => specFor(trick));
  const resolvedFallVariant = forcedFall ?? fallVariant ?? randomizedFallVariant;
  const [frame, setFrame] = useState(() => computeFrame(0, spec, landed, resolvedFallVariant, shankProgress));
  const [isPlaying, setIsPlaying] = useState(true);
  const [replayNonce, setReplayNonce] = useState(0);
  const [selectedPlaybackRate, setSelectedPlaybackRate] = useState<0.5 | 1>(() => playbackRate === 0.5 ? 0.5 : 1);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const pausedRef = useRef(paused);
  const speedToggleVisible = showSpeedToggle && fixedTime == null;
  const effectivePlaybackRate = Math.max(0.05, speedToggleVisible ? selectedPlaybackRate : playbackRate);
  // Static mode: one frozen frame, computed in render so a changed fixedTime
  // (e.g. a scrubber) re-renders without touching the playback machinery.
  const staticTime = fixedTime == null
    ? null
    : Math.max(0, Math.min(fixedTime, ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T)));

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (staticTime != null) return;
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
      setFrame(computeFrame(Math.min(animationTime, end), spec, landed, resolvedFallVariant, shankProgress));
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
        setFrame(computeFrame(end, spec, landed, resolvedFallVariant, shankProgress));
        finish();
      }, durationMs + 500);
    };
    armFailSafe();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(failSafe);
    };
  }, [spec, landed, resolvedFallVariant, shankProgress, effectivePlaybackRate, replayNonce, staticTime]);

  const replay = () => {
    if (staticTime != null) return;
    setIsPlaying(true);
    setFrame(computeFrame(0, spec, landed, resolvedFallVariant, shankProgress));
    setReplayNonce((current) => current + 1);
  };

  const togglePlaybackRate = () => {
    if (!speedToggleVisible) return;
    doneRef.current = false;
    setIsPlaying(true);
    setFrame(computeFrame(0, spec, landed, resolvedFallVariant, shankProgress));
    setSelectedPlaybackRate((current) => current === 1 ? 0.5 : 1);
    setReplayNonce((current) => current + 1);
  };

  const colors = robot.avatar;
  const f = staticTime != null
    ? computeFrame(staticTime, spec, landed, resolvedFallVariant, shankProgress)
    : frame;
  const prims: Prim[] = [];
  const mechanics = resolveRiderMechanics(riderStance, spec.stance);

  // Natural stances keep both knees folding toward the nose and differ across
  // the rider's depth/toeside. Switch rides the opposite footedness with no
  // body turn: the same skeleton mirrored to the other toeside.
  const orientedRotation = orientTrickRotation(mechanics, f.spin3d);
  const baseBodySign: 1 | -1 = mechanics.bodyYawDegrees === 0 ? 1 : -1;
  // World toeside for board-space limb offsets. Resting yaw is applied below.
  const localToeDir: 1 | -1 = (mechanics.orientationSign * baseBodySign) as 1 | -1;
  // Negative yaw turns travel-facing (+x) toward +z (camera) for regular.
  const restingBodyYaw = -STANCE_BODY_YAW * mechanics.orientationSign;
  const restingHeadYaw = -(STANCE_BODY_YAW - HEAD_LOOK_FORWARD) * mechanics.orientationSign;
  const yawDeg3d = orientedRotation.yawDeg;
  const bodyYawDeg3d = orientedRotation.bodyYawDeg + restingBodyYaw;
  // Head looks a bit more down-street while upright. Once the body folds in a
  // fall, that yaw delta is applied after rotZ around the foot pivot and
  // swings the head off the neck — blend it out so head/torso stay attached.
  const uprightP = clamp01(1 - Math.abs(f.body.rot) / 55);
  const headYawDeg3d = orientedRotation.bodyYawDeg
    + restingHeadYaw * uprightP
    + restingBodyYaw * (1 - uprightP);
  const rawFlightP = (f.t - ROLL_IN) / FLIP_T;
  const catchP3d = clamp01(rawFlightP / 0.85);
  const spinP3d = rawFlightP < 0 ? 0 : rawFlightP >= 1 ? 1 : spec.late ? clamp01((rawFlightP - 0.38) / 0.30) : catchP3d;
  const isForwardFlip = spec.forwardFlip;
  const flipDeg3d = orientedRotation.flipDeg;
  // Dolphin keeps its original nose-dive pitch; varials leave forwardPitchDeg
  // at 0 and only get the mild board.rot pitch from computeFrame.
  const pitchDeg3d = f.board.rot + (isForwardFlip ? Math.sin(spinP3d * Math.PI) * 42 : 0);
  const yawDegBoard3d = yawDeg3d;

  // ----- Board -----
  const boardCenter: V3 = { x: f.board.x, y: f.board.y, z: 0 };
  const isImpossible = spec.roll !== 0;
  const popFoot = isImpossible ? (spec.nollie ? f.footR : f.footL) : null;
  const pivot: V3 = popFoot ? { x: f.body.x + popFoot.x, y: f.body.y + popFoot.y, z: 0 } : boardCenter;
  const B = (local: V3) => boardPoint(local, flipDeg3d, pitchDeg3d, yawDegBoard3d, boardCenter, pivot);

  // Deck as a SOLID: griptape top face, printed wood bottom face, and a ply
  // rail band joining them. The band is what makes a flip read — edge-on the
  // old zero-thickness polygon collapsed to a hairline and the board looked
  // like it blinked out mid-rotation. Everything is lit by the shared key
  // light, so the face you can see also tells you which way it is tipped.
  const deckNormal = rotY(rotZ(rotX({ x: 0, y: -1, z: 0 }, flipDeg3d), pitchDeg3d), yawDegBoard3d);
  const seeingTop = dirDepth(deckNormal) >= 0;
  const topWorld: V3[] = DECK_TOP_LOCAL.map(B);
  const bottomWorld: V3[] = DECK_BOTTOM_LOCAL.map(B);
  const topFill = shade(GRIP_TAPE, lambert(deckNormal), 1.35);
  const bottomFill = shade(DECK_WOOD, lambert(neg3(deckNormal)));

  // Rail quads, back-face culled and individually lit so the ply band curves
  // with the deck instead of reading as a flat outline.
  const railEls: ReactElement[] = [];
  const railCount = topWorld.length;
  for (let i = 0; i < railCount; i += DECK_RAIL_STEP) {
    const j = (i + DECK_RAIL_STEP) % railCount;
    const t0 = topWorld[i];
    const t1 = topWorld[j];
    const b1 = bottomWorld[j];
    const b0 = bottomWorld[i];
    let n = cross3(sub3(t1, t0), sub3(b0, t0));
    const m = Math.hypot(n.x, n.y, n.z);
    if (m < 1e-6) continue;
    n = { x: n.x / m, y: n.y / m, z: n.z / m };
    // Orient outward (away from the board's center) regardless of winding.
    if (dot3(n, sub3(t0, boardCenter)) < 0) n = neg3(n);
    if (dirDepth(n) < 0) continue; // facing away from the camera
    const railFill = shade(DECK_PLY, lambert(n), 1.2);
    railEls.push(
      // Stroked in its own fill so neighbouring quads don't leave hairline
      // seams where the projected edges disagree by a fraction of a pixel.
      <path key={`rail${i}`} d={projectedPolyPath([t0, t1, b1, b0])} fill={railFill} stroke={railFill} strokeWidth={0.6} />
    );
  }

  // Underside graphic (center stripe + badge), lifted just off the bottom
  // plane so it never z-fights the face it sits on.
  const graphicEls: ReactElement[] = [];
  if (!seeingTop) {
    const bottomY = (x: number) => deckKickY(x) + DECK_THICKNESS / 2 + 0.2;
    const graphicFill = shade(colors.accent, lambert(neg3(deckNormal)));
    const stripeHalfW = 2.4;
    const poly = (key: string, pts: V3[], fill: string) => {
      graphicEls.push(
        <path
          key={key}
          d={projectedPolyPath(pts)}
          fill={fill}
          stroke="currentColor"
          strokeWidth={1.2 * project(boardCenter).s}
          strokeLinejoin="round"
        />
      );
    };
    poly('deckGraphicStripe', [
      B({ x: -34, y: bottomY(-34), z: -stripeHalfW }),
      B({ x: 34, y: bottomY(34), z: -stripeHalfW }),
      B({ x: 34, y: bottomY(34), z: stripeHalfW }),
      B({ x: -34, y: bottomY(-34), z: stripeHalfW }),
    ], graphicFill);
    poly('deckGraphicBadge', [
      B({ x: -7, y: bottomY(0), z: 0 }),
      B({ x: 0, y: bottomY(0), z: -5 }),
      B({ x: 7, y: bottomY(0), z: 0 }),
      B({ x: 0, y: bottomY(0), z: 5 }),
    ], graphicFill);
  }

  const topPath = projectedPolyPath(topWorld);
  const bottomPath = projectedPolyPath(bottomWorld);
  const deckProj = project(boardCenter);
  const deckScale = deckProj.s;
  // The deck sorts by its projected center, which sits well in front of the
  // up-street leg (the board is long; depth varies ~13 units nose to tail).
  // Legs and boots clamp to this so they never vanish under the board.
  const deckDepth = deckProj.depth;

  // Trucks live in the same SVG group as the deck faces so facing (grip vs
  // wood) — not the global painter's list — decides whether they sit under or
  // over the deck. Within that group, though, parts still need camera-depth
  // order: a fixed local-z loop draws far wheels on top after a 180° shuvit
  // (local +z becomes world-far), which makes the landing silhouette look
  // mirrored vs takeoff. Sort far → near so before/after a board 180 match.
  //   grip facing camera → trucks FIRST (under the opaque faces)
  //   wood facing camera → trucks LAST  (on the underside, where they belong)
  const truckParts: { depth: number; el: ReactElement }[] = [];
  for (const side of [-1, 1] as const) {
    const tx = side * WHEEL_X;
    const hangerA = project(B({ x: tx, y: 1, z: 0 }));
    const hangerB = project(B({ x: tx, y: WHEEL_Y - 1, z: 0 }));
    const axleA = project(B({ x: tx, y: WHEEL_Y, z: -WHEEL_Z }));
    const axleB = project(B({ x: tx, y: WHEEL_Y, z: WHEEL_Z }));
    const hs = (hangerA.s + hangerB.s) / 2;
    const as = (axleA.s + axleB.s) / 2;
    truckParts.push(
      {
        depth: (hangerA.depth + hangerB.depth) / 2,
        el: (
          <line
            key={`hanger${side}`}
            x1={hangerA.x}
            y1={hangerA.y}
            x2={hangerB.x}
            y2={hangerB.y}
            stroke="currentColor"
            strokeWidth={4 * hs}
            strokeLinecap="round"
            opacity={0.45}
          />
        ),
      },
      {
        depth: (axleA.depth + axleB.depth) / 2,
        el: (
          <line
            key={`axle${side}`}
            x1={axleA.x}
            y1={axleA.y}
            x2={axleB.x}
            y2={axleB.y}
            stroke="currentColor"
            strokeWidth={2.5 * as}
            strokeLinecap="round"
            opacity={0.45}
          />
        ),
      },
    );
    for (const wz of [-1, 1] as const) {
      const c = project(B({ x: tx, y: WHEEL_Y, z: wz * WHEEL_Z }));
      // Spokes are phase-locked to the street-dash scroll: one revolution per
      // dash period, derived from the same quantity that moves the lane
      // markings. The roll reads as gripping the street, follows slow motion,
      // and reverses with fakie exactly like the dashes do. (True surface
      // speed at this wheel radius would be ~8.5 rev/s — pure strobe at 60fps.)
      const rollDeg = ((f.streetDist / STREET_DASH_SECONDS) * spec.dir * 360) % 360;
      const ra = rad(rollDeg);
      const spokeR = 5 * c.s * 0.92;
      const ca = Math.cos(ra) * spokeR;
      const sa = Math.sin(ra) * spokeR;
      // Wheel + hub share a depth and a fragment so the hub never peels off.
      truckParts.push({
        depth: c.depth,
        el: (
          <g key={`wheel${side}${wz}`}>
            <circle
              cx={c.x}
              cy={c.y}
              r={5 * c.s}
              fill="#fbfbf3"
              stroke="currentColor"
              strokeWidth={2 * c.s}
            />
            <line className="trick-anim-3d__wheel-spoke" x1={c.x - ca} y1={c.y - sa} x2={c.x + ca} y2={c.y + sa} strokeWidth={1.3 * c.s} />
            <line className="trick-anim-3d__wheel-spoke" x1={c.x + sa} y1={c.y - ca} x2={c.x - sa} y2={c.y + ca} strokeWidth={1.3 * c.s} />
            <circle cx={c.x} cy={c.y} r={1.8 * c.s} fill={colors.accent} />
          </g>
        ),
      });
    }
  }
  truckParts.sort((a, b) => a.depth - b.depth);
  const truckEls = truckParts.map((part) => part.el);

  prims.push({
    depth: deckDepth,
    el: (
      <g key="deck">
        {seeingTop ? truckEls : null}
        <path d={seeingTop ? bottomPath : topPath} fill={seeingTop ? bottomFill : topFill} stroke="currentColor" strokeWidth={2 * deckScale} strokeLinejoin="round" />
        {railEls}
        <path d={seeingTop ? topPath : bottomPath} fill={seeingTop ? topFill : bottomFill} stroke="currentColor" strokeWidth={2 * deckScale} strokeLinejoin="round" />
        {graphicEls}
        {seeingTop ? null : truckEls}
      </g>
    ),
  });

  // ----- Skater -----
  const hip: V3 = { x: f.body.x, y: f.body.y, z: 0 };
  const S = (local: V3) => skaterPoint(local, f.body.rot, bodyYawDeg3d, hip);
  // Head keeps a bit more travel-facing yaw than the torso.
  const Shead = (local: V3) => skaterPoint(local, f.body.rot, headYawDeg3d, hip);
  // Board-space feet/knees/boots: undo the resting body yaw so they stay planted.
  const fromBoard = (board: V3) => S(rotY(board, -restingBodyYaw));

  // Flick-foot lateral swing follows the resolved local heel/toe side. The
  // stance pose carries it into world space without ever relabeling a
  // kickflip as a heelflip.
  let flickZ = 0;
  if (spec.flipDir && rawFlightP >= 0 && rawFlightP < 1) {
    const flickAmount = 9;
    flickZ = -spec.flipDir * localToeDir * flickAmount * Math.sin(spinP3d * Math.PI);
  }

  // Frame channels are stable board roles: R is nose, L is tail. Keep those
  // in board space; fromBoard() carries them into the mildly yawed skeleton.
  // Clamp to leg length so fall poses can't stretch a shin off its knee.
  const noseChannel = clampFootReach(f.footR);
  const tailChannel = clampFootReach(f.footL);
  const leftFootChannel = mechanics.noseFoot === 'left' ? noseChannel : tailChannel;
  const rightFootChannel = mechanics.noseFoot === 'right' ? noseChannel : tailChannel;
  const leftFoot = leftFootChannel;
  const rightFoot = rightFootChannel;
  const leftFlickZ = mechanics.flickFoot === 'left' ? flickZ : 0;
  const rightFlickZ = mechanics.flickFoot === 'right' ? flickZ : 0;
  const kneeL = knee(leftFoot);
  const kneeR = knee(rightFoot);
  const hipL3 = S({ x: 0, y: 0, z: -HIP_Z });
  const hipR3 = S({ x: 0, y: 0, z: HIP_Z });
  // Shin ends at the ankle (slightly above the sole) so the boot cuff reads
  // as a shoe rather than a line stabbed through the middle of a sausage.
  const ankleL3 = fromBoard({ x: leftFoot.x, y: leftFoot.y - ANKLE_LIFT, z: -FOOT_Z + leftFlickZ });
  const ankleR3 = fromBoard({ x: rightFoot.x, y: rightFoot.y - ANKLE_LIFT, z: FOOT_Z + rightFlickZ });
  // Both knees protrude toward toeside (same z side), matching the 2D IK
  // which always bends both knees forward — splitting them to opposite z
  // sides makes the shins cross under the 3/4 camera.
  const kneeL3 = fromBoard({ x: kneeL.x, y: kneeL.y, z: localToeDir * KNEE_Z + leftFlickZ * 0.55 });
  const kneeR3 = fromBoard({ x: kneeR.x, y: kneeR.y, z: localToeDir * KNEE_Z + rightFlickZ * 0.55 });

  // Legs share the arm accent color and outline weight so the limbs read as
  // one material. Keep their primitive indexes separated by anatomy so the
  // natural stance can deliberately paint the tail/back leg above the
  // nose/front leg; that overlap is the readable depth cue for footedness.
  const legPrimStart = prims.length;
  const leftLegPrimIndexes: number[] = [];
  const rightLegPrimIndexes: number[] = [];
  const rememberNewPrims = (start: number, target: number[]) => {
    for (let i = start; i < prims.length; i += 1) target.push(i);
  };

  let sidePrimStart = prims.length;
  pushCapsule(prims, 'thighL', hipL3, kneeL3, 6.5, colors.accent, 1.2);
  pushCapsule(prims, 'shinL', kneeL3, ankleL3, 6.5, colors.accent, 1.2);
  pushDot(prims, 'kneeL', kneeL3, 3.6, colors.accent, 'currentColor', 1.2, 1, 0.4);
  rememberNewPrims(sidePrimStart, leftLegPrimIndexes);

  sidePrimStart = prims.length;
  pushCapsule(prims, 'thighR', hipR3, kneeR3, 6.5, colors.accent, 1.2);
  pushCapsule(prims, 'shinR', kneeR3, ankleR3, 6.5, colors.accent, 1.2);
  pushDot(prims, 'kneeR', kneeR3, 3.6, colors.accent, 'currentColor', 1.2, 1, 0.4);
  rememberNewPrims(sidePrimStart, rightLegPrimIndexes);

  // Boots: compact skate stance (across the deck, slight forward rake), with a
  // short cuff at the ankle so they match the 2D rounded-rect boots instead of
  // long white-tipped sausages hanging off the rails.
  const pushBoot = (key: string, foot: { x: number; y: number }, centerZ: number, ankle: V3) => {
    const soleY = foot.y + 0.6;
    const heel = fromBoard({ x: foot.x - 1.2, y: soleY, z: centerZ - localToeDir * BOOT_HEEL_Z });
    const mid = fromBoard({ x: foot.x + 1.2, y: soleY, z: centerZ + localToeDir * 0.6 });
    const toe = fromBoard({ x: foot.x + 3.6, y: soleY, z: centerZ + localToeDir * BOOT_TOE_Z });
    // Cuff: ankle → mid-boot so the shin meets a clean shoe top.
    pushCapsule(prims, `${key}Cuff`, ankle, mid, BOOT_W - 0.6, colors.body, 1.5, 1, 0.9);
    // Sole body: short heel→toe capsule, no white toe tip.
    pushCapsule(prims, key, heel, toe, BOOT_W, colors.body, 1.8, 1, 1.1);
    // Soft toe end-cap (same accent) so the tip reads rounded without a blob.
    pushDot(prims, `${key}Toe`, toe, BOOT_W * 0.38, colors.body, 'currentColor', 1.1, 1, 1.2);
    pushDot(prims, `${key}Heel`, heel, BOOT_W * 0.32, colors.body, 'currentColor', 1.0, 1, 1.0);
  };
  sidePrimStart = prims.length;
  pushBoot('bootL', leftFoot, -FOOT_Z + leftFlickZ, ankleL3);
  rememberNewPrims(sidePrimStart, leftLegPrimIndexes);
  sidePrimStart = prims.length;
  pushBoot('bootR', rightFoot, FOOT_Z + rightFlickZ, ankleR3);
  rememberNewPrims(sidePrimStart, rightLegPrimIndexes);
  // Clamp every leg/boot prim to sort at least just in front of the deck —
  // the deck sorts by its center, so the up-street leg otherwise loses by the
  // board's half-length in depth and vanishes underneath. The index epsilon
  // keeps push order (thigh → shin → knee → boot) among clamped prims.
  for (let i = legPrimStart; i < prims.length; i++) {
    prims[i].depth = Math.max(prims[i].depth, deckDepth + 0.5 + (i - legPrimStart) * 0.02);
  }
  // In this 3/4 camera the nose is also slightly camera-near, so raw projected
  // depth can incorrectly hide regular's right/tail leg. Only regular gets
  // this explicit foreground cue. Goofy keeps its original projected depth;
  // applying the same override there collapses both stances into one pose.
  const NATURAL_TAIL_LEG_DEPTH_BOOST = 12;
  const forceRegularTailLegNear = riderStance === 'regular' && spec.stance !== 'switch';
  if (forceRegularTailLegNear) {
    const tailLegPrimIndexes = mechanics.tailFoot === 'left'
      ? leftLegPrimIndexes
      : rightLegPrimIndexes;
    for (const index of tailLegPrimIndexes) {
      prims[index].depth += NATURAL_TAIL_LEG_DEPTH_BOOST;
    }
  }

  // Arms — upper/forearm segments on opposite sides of the torso.
  // Near/far is locked to toeside (stable across the crouch) so a shoulder
  // depth crossing can't flip the ±bias for one frame and make an arm pop
  // through the torso. Each arm is two capsules so a hand can stay visible
  // while its shoulder sits behind the body.
  // Shoulders sit out at the torso's own half-width. At the old ±6.5 the whole
  // arm lived inside the 22-wide torso capsule and simply never appeared —
  // under the 3/4 camera the arm swing runs mostly along x, which projects
  // short, so only lateral offset can get a limb clear of the body.
  const armGeometry = (angle: number, sideZ: number, bend: number) => {
    const shoulderLocal: V3 = { x: 4, y: -37, z: sideZ };
    const elbowLocal: V3 = {
      x: shoulderLocal.x + Math.sin(angle) * 15,
      y: shoulderLocal.y + Math.cos(angle) * 15,
      z: sideZ * 1.3,
    };
    const forearmAngle = angle + bend;
    const handLocal: V3 = {
      x: elbowLocal.x + Math.sin(forearmAngle) * 14,
      y: elbowLocal.y + Math.cos(forearmAngle) * 14,
      z: sideZ * 1.5,
    };
    return {
      shoulder: S(shoulderLocal),
      elbow: S(elbowLocal),
      hand: S(handLocal),
    };
  };
  // Natural regular gets a readable resting-arm cue before the pop: the
  // right/back arm trails toward the tail while the left/front arm reaches
  // forward enough to peek around the torso. Fade it through roll-in so the
  // authored trick wind-up takes over cleanly. Goofy and switch are untouched.
  const regularArmCue = riderStance === 'regular' && spec.stance !== 'switch'
    ? clamp01(1 - f.t / ROLL_IN)
    : 0;
  // Mid-flight balance carriage: arms spread and elbows fold as the rider
  // rises, then relax into the catch. Symmetric ± terms inside the mirrored
  // parens keep the goofy mirror exact.
  const flightArmLift = rawFlightP >= 0 && rawFlightP <= 1
    ? Math.sin(clamp01(rawFlightP) * Math.PI)
    : 0;
  const leftArmAngle = baseBodySign * (
    (mechanics.frontArm === 'left' ? f.armFront : f.armBack)
    + regularArmCue * 0.3
    + flightArmLift * 0.38
  );
  const rightArmAngle = baseBodySign * (
    (mechanics.frontArm === 'right' ? f.armFront : f.armBack)
    - regularArmCue * 0.5
    - flightArmLift * 0.38
  );
  // Wider than the trunk's half-width (see the torso capsule below) so the
  // arms hang clear of the silhouette instead of being swallowed by it.
  const SHOULDER_Z = 12;
  const armBend = 0.24 * (1 + 1.5 * flightArmLift);
  const armL = armGeometry(leftArmAngle, -SHOULDER_Z, -armBend);
  const armR = armGeometry(rightArmAngle, SHOULDER_Z, armBend);
  // Near/far from shoulder depth only — shoulders don't swing during the
  // crouch, so this stays stable (unlike averaging in the moving forearm,
  // which used to flicker). Do NOT key off toeside: goofy's toeside faces
  // *away* from the camera, so that pinned the wrong arm in front for
  // goofy fakie/nollie and made both limbs read as growing out of the chest.
  const rightArmIsNear = project(armR.shoulder).depth >= project(armL.shoulder).depth;

  // Torso depth anchor used to keep the far arm behind / near arm in front
  // even when a swinging forearm's average depth briefly crosses the body.
  const torsoTop = S({ x: 1, y: -39, z: 0 });
  const torsoBot = S({ x: 1, y: -11, z: 0 });
  const torsoDepth = (project(torsoTop).depth + project(torsoBot).depth) / 2;

  const drawArm = (
    key: string,
    arm: { shoulder: V3; elbow: V3; hand: V3 },
    isNear: boolean,
  ) => {
    const armFill = isNear ? colors.accent : darken(colors.accent, 0.16);
    const pin = isNear ? 6 : -6;
    const clampSeg = (a: V3, b: V3) => {
      const raw = (project(a).depth + project(b).depth) / 2 + pin;
      if (isNear) return Math.max(raw, torsoDepth + 1.5);
      // Far arm stays behind the torso unless it is clearly in front (a real
      // peek around the body). The dead zone around torsoDepth is what used
      // to flicker the left arm for a frame during the crouch wind-up.
      if (raw > torsoDepth + 4) return raw;
      return Math.min(raw, torsoDepth - 1.5);
    };
    const upperDepth = clampSeg(arm.shoulder, arm.elbow);
    const foreDepth = clampSeg(arm.elbow, arm.hand);
    // Draw as depth-sorted capsules (bias baked into depth via a dummy push
    // then overwrite) so shoulder and forearm can straddle the torso.
    const upperStart = prims.length;
    pushCapsule(prims, `${key}Upper`, arm.shoulder, arm.elbow, 6.25, armFill, 1.2);
    prims[upperStart].depth = upperDepth;
    const foreStart = prims.length;
    pushCapsule(prims, `${key}Fore`, arm.elbow, arm.hand, 6.25, armFill, 1.2);
    prims[foreStart].depth = foreDepth;
    // Hand cap shares the forearm's depth so it can't split off mid-swing.
    const handStart = prims.length;
    pushDot(prims, `${key}Hand`, arm.hand, 3, colors.accent, 'currentColor', 1.1);
    prims[handStart].depth = foreDepth;
  };
  drawArm('armL', armL, !rightArmIsNear);
  drawArm('armR', armR, rightArmIsNear);

  // Torso. The legs use small left/right hip anchors, with no mechanical hip
  // dot drawn over the silhouette.
  pushCapsule(prims, 'torso', torsoBot, torsoTop, 20, colors.body, 2.5);

  // Neck + head — slightly less toeside yaw than the torso so the face looks
  // a bit down the street.
  pushLine(prims, 'neck', Shead({ x: 7, y: -50, z: 0 }), Shead({ x: 7, y: -56, z: 0 }), colors.accent, { width: 3 });
  pushCapsule(prims, 'head', Shead({ x: 5, y: -65, z: 0 }), Shead({ x: 9, y: -65, z: 0 }), 22, colors.body, 2.5);
  // Put the visor and eye on the curved front surface of the head rather than
  // near its center. They now orbit visibly around the head during yaw. Fade
  // them as the face turns through the silhouette so their disappearance reads
  // as turning away instead of an abrupt depth-sort pop.
  // Aim the resting face a little toward travel (+x) from the camera so the
  // rider looks where they're going. Measured from the camera ray toward +x.
  const FACE_FORWARD_DEG = 28;
  const faceTheta = rad(FACE_FORWARD_DEG) - CAM_YAW;
  const FACE_COS = Math.cos(faceTheta);
  const FACE_SIN = Math.sin(faceTheta);
  const restingFaceNormal: V3 = { x: FACE_SIN, y: 0, z: FACE_COS * localToeDir };
  const restingFaceNormalLocal = rotY(restingFaceNormal, -restingHeadYaw);
  const faceNormal = rotY(rotZ(restingFaceNormalLocal, f.body.rot), headYawDeg3d);
  // Keep the fade confined to the narrow silhouette crossing. Most of the
  // turn is carried by the eye's actual 3D orbit; opacity only softens the
  // final handoff as the head begins to occlude the eyes.
  const faceRevealP = clamp01((dirDepth(faceNormal) + 0.06) / 0.18);
  const faceOpacity = faceRevealP * faceRevealP * (3 - 2 * faceRevealP);
  const headCenterX = 7;
  // A point on the camera-facing tangent plane. Offsets run horizontally in
  // screen space at rest, while radius moves the feature onto the head shell.
  const facePoint = (offset: number, radius: number) => {
    const worldFacingOffset = {
      x: FACE_SIN * radius + FACE_COS * (offset * localToeDir),
      y: 0,
      z: (FACE_COS * radius - FACE_SIN * (offset * localToeDir)) * localToeDir,
    };
    const localFacingOffset = rotY(worldFacingOffset, -restingHeadYaw);
    return Shead({
      x: headCenterX + localFacingOffset.x,
      y: -65.5,
      z: localFacingOffset.z,
    });
  };
  const visorStart = project(facePoint(-4.75, 9.8));
  const visorEnd = project(facePoint(4.75, 9.8));
  const eyeLeft = project(facePoint(-3.2, 9.2));
  const eyeRight = project(facePoint(3.2, 9.2));
  const visorScale = (visorStart.s + visorEnd.s) / 2;
  // Keep the visor and both eyes in one depth-sorted face primitive. Sorting
  // the eyes separately let the camera-near edge of the visor cover one eye
  // while the other stayed visible at three-quarter angles.
  prims.push({
    depth: (visorStart.depth + visorEnd.depth) / 2 + 0.45,
    el: (
      <g key="face" opacity={faceOpacity}>
        <line
          x1={visorStart.x}
          y1={visorStart.y}
          x2={visorEnd.x}
          y2={visorEnd.y}
          stroke="currentColor"
          strokeWidth={9.5 * visorScale}
          strokeLinecap="round"
          opacity={0.85}
        />
        <ellipse
          cx={eyeLeft.x}
          cy={eyeLeft.y}
          rx={1.65 * eyeLeft.s}
          ry={1.3 * eyeLeft.s}
          fill={colors.accent}
        />
        <ellipse
          cx={eyeRight.x}
          cy={eyeRight.y}
          rx={1.65 * eyeRight.s}
          ry={1.3 * eyeRight.s}
          fill={colors.accent}
        />
      </g>
    ),
  });

  // Antenna
  pushLine(prims, 'antenna', Shead({ x: 7, y: -76, z: 0 }), Shead({ x: 7, y: -84, z: 0 }), 'currentColor', { width: 2.5 });
  pushDot(prims, 'antennaBall', Shead({ x: 7, y: -85.5, z: 0 }), 3, colors.accent, 'currentColor', 1.5, 1, 0.2);

  prims.sort((a, b) => a.depth - b.depth);

  // ----- Ground: oversized projected floor so the 3/4 camera never leaves a
  // seam at the viewBox edges (the old tight spot made a diagonal wall cut
  // on wider layouts when the CSS sky showed through). -----
  const spotLeft = -900;
  const spotRight = W + 900;
  const spotBackZ = -160;
  const spotFrontZ = 560;
  // Travel lane is a darker asphalt strip; shoulders fade cooler toward the
  // sky so the plane still reads as a mini skate spot under open air.
  const laneHalf = 72;
  const curbInset = 6;
  const floorPath = projectedPolyPath([
    { x: spotLeft, y: GROUND, z: spotBackZ },
    { x: spotRight, y: GROUND, z: spotBackZ },
    { x: spotRight, y: GROUND, z: spotFrontZ },
    { x: spotLeft, y: GROUND, z: spotFrontZ },
  ]);
  const roadPath = projectedPolyPath([
    { x: spotLeft, y: GROUND, z: -laneHalf },
    { x: spotRight, y: GROUND, z: -laneHalf },
    { x: spotRight, y: GROUND, z: laneHalf },
    { x: spotLeft, y: GROUND, z: laneHalf },
  ]);
  // Soft horizon line only (no solid back wall — that panel's left edge was
  // the diagonal seam on wide screens).
  const backEdge = projectedPath([
    { x: spotLeft, y: GROUND, z: spotBackZ },
    { x: spotRight, y: GROUND, z: spotBackZ },
  ]);
  // Solid edge lines + curb lips so the lane has structure under perspective.
  const nearCurb = projectedPath([
    { x: spotLeft, y: GROUND, z: laneHalf },
    { x: spotRight, y: GROUND, z: laneHalf },
  ]);
  const farCurb = projectedPath([
    { x: spotLeft, y: GROUND, z: -laneHalf },
    { x: spotRight, y: GROUND, z: -laneHalf },
  ]);
  const nearCurbLip = projectedPath([
    { x: spotLeft, y: GROUND, z: laneHalf + curbInset },
    { x: spotRight, y: GROUND, z: laneHalf + curbInset },
  ]);
  const farCurbLip = projectedPath([
    { x: spotLeft, y: GROUND, z: -laneHalf - curbInset },
    { x: spotRight, y: GROUND, z: -laneHalf - curbInset },
  ]);

  // Scrolling street dashes on the floor. Same clock + dir as the 2D CSS
  // dashes: ground slides opposite travel, so fakie (dir=-1) reverses free.
  const dashPeriod = STREET_DASH_PERIOD;
  const dashLen = 52;
  const scroll =
    ((f.streetDist / STREET_DASH_SECONDS) * STREET_DASH_PERIOD * spec.dir) % dashPeriod;
  // Positive phase shifts dashes toward -x for dir=+1 (ground flows back).
  const phase = ((-scroll) % dashPeriod + dashPeriod) % dashPeriod;
  // Single center dashed lane under the travel path.
  const streetDashes: ReactElement[] = [];
  let dashIdx = 0;
  for (let x = spotLeft + phase; x < spotRight + dashPeriod; x += dashPeriod) {
    const a: V3 = { x, y: GROUND, z: 0 };
    const b: V3 = { x: x + dashLen, y: GROUND, z: 0 };
    const pa = project(a);
    const pb = project(b);
    const s = (pa.s + pb.s) / 2;
    streetDashes.push(
      <line
        key={`dash${dashIdx++}`}
        className="trick-anim-3d__street-dash trick-anim-3d__street-dash--center"
        x1={pa.x}
        y1={pa.y}
        x2={pb.x}
        y2={pb.y}
        strokeWidth={Math.max(1.1, 3.2 * s)}
        opacity={0.55}
      />
    );
  }

  // Sparse asphalt grain: short ticks that scroll with the street so the
  // road doesn't read as a flat vector fill.
  const gritPeriod = dashPeriod * 0.55;
  const gritPhase = ((-scroll * 0.85) % gritPeriod + gritPeriod) % gritPeriod;
  const gritMarks: ReactElement[] = [];
  let gritIdx = 0;
  const gritZs = [-48, -22, 14, 40, 58];
  for (const gz of gritZs) {
    for (let x = spotLeft + gritPhase + (gz * 3) % gritPeriod; x < spotRight + gritPeriod; x += gritPeriod) {
      const len = 7 + ((gritIdx * 17) % 11);
      const a: V3 = { x, y: GROUND, z: gz };
      const b: V3 = { x: x + len, y: GROUND, z: gz + (((gritIdx % 3) - 1) * 1.4) };
      const pa = project(a);
      const pb = project(b);
      const s = (pa.s + pb.s) / 2;
      gritMarks.push(
        <line
          key={`grit${gritIdx++}`}
          className="trick-anim-3d__road-grit"
          x1={pa.x}
          y1={pa.y}
          x2={pb.x}
          y2={pb.y}
          strokeWidth={Math.max(0.6, 1.1 * s)}
          opacity={0.08 + (gritIdx % 4) * 0.02}
        />
      );
    }
  }

  // Air streaks during flight: short horizontal whooshes trailing the board,
  // peaking mid-air. They sell travel speed through the pop, which the
  // scrolling ground alone can't do once the wheels leave the asphalt.
  const flightStreaks: ReactElement[] = [];
  if (rawFlightP >= 0 && rawFlightP <= 1) {
    const intensity = Math.sin(clamp01(rawFlightP) * Math.PI);
    const streakConfigs = [
      { dy: -30, dz: -26, len: 46, back: 78 },
      { dy: -12, dz: 16, len: 38, back: 100 },
      { dy: 4, dz: -8, len: 54, back: 68 },
      { dy: 20, dz: 32, len: 34, back: 92 },
    ];
    streakConfigs.forEach((cfg, i) => {
      const xTip = f.board.x - cfg.back;
      const a = project({ x: xTip, y: f.board.y + cfg.dy, z: cfg.dz });
      const b = project({ x: xTip + cfg.len, y: f.board.y + cfg.dy, z: cfg.dz });
      flightStreaks.push(
        <line
          key={`streak${i}`}
          className="trick-anim-3d__speed-streak"
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          strokeWidth={Math.max(1, 2.2 * a.s)}
          opacity={0.5 * intensity}
        />
      );
    });
  }

  // Shadows are cast, not pinned: a point at height h projects onto the ground
  // along the key light's ray, so the blob slides away from the rider as they
  // rise instead of staying nailed under them. It also softens and shrinks
  // with height, which is the cue that actually sells the pop.
  const SHADOW_SLIDE_X = -LIGHT_DIR.x / LIGHT_DIR.y; // y is down; LIGHT_DIR.y < 0
  const SHADOW_SLIDE_Z = -LIGHT_DIR.z / LIGHT_DIR.y;
  const shadowFor = (x: number, height: number, baseR: number, key: string) => {
    const h = Math.max(0, height);
    const p = project({ x: x + SHADOW_SLIDE_X * h, y: GROUND, z: SHADOW_SLIDE_Z * h });
    const hf = clamp01(h / JUMP);
    const rx = baseR * p.s * (1 - 0.3 * hf);
    return (
      <ellipse
        key={key}
        className="trick-anim-3d__deck-shadow"
        cx={p.x}
        cy={p.y}
        rx={rx}
        ry={Math.max(2, rx * 0.22)}
        opacity={0.9 * (1 - 0.62 * hf)}
        filter={`url(#${skyGradId}-soft)`}
      />
    );
  };
  const boardHeight = Math.max(0, GROUND - f.board.y);
  const boardShadow = shadowFor(f.board.x, boardHeight, 46, 'shadowBoard');
  const skaterShadow = shadowFor(f.body.x, Math.max(0, GROUND - f.body.y - (FOOT_Y - 2)), 30, 'shadowSkater');

  // Ground contact FX. The pop and the touch-down are the two frames where the
  // tail actually loads the asphalt; without a scuff there they read as the
  // board silently teleporting off and back onto the street.
  const contactEls: ReactElement[] = [];
  const pushScuff = (key: string, progress: number, atX: number, strength: number) => {
    const grow = easeOutCubic(progress);
    const fade = (1 - progress) * (1 - progress);
    const ring = project({ x: atX, y: GROUND, z: 0 });
    const r = (10 + 46 * grow) * ring.s * strength;
    contactEls.push(
      <ellipse
        key={`${key}Ring`}
        className="trick-anim-3d__contact-ring"
        cx={ring.x}
        cy={ring.y}
        rx={r}
        ry={r * 0.24}
        opacity={0.34 * fade}
      />
    );
    for (let i = 0; i < 5; i++) {
      const dir = i % 2 === 0 ? -1 : 1;
      const spread = (0.4 + (i % 3) * 0.35) * dir;
      const puffX = atX + spread * 44 * grow;
      const puffZ = ((i % 3) - 1) * 12 * grow;
      const lift = 16 * grow * (1 - grow * 0.4);
      const pp = project({ x: puffX, y: GROUND - lift, z: puffZ });
      contactEls.push(
        <circle
          key={`${key}Puff${i}`}
          className="trick-anim-3d__contact-puff"
          cx={pp.x}
          cy={pp.y}
          r={(2.6 + 5 * grow) * pp.s * strength}
          opacity={0.3 * fade}
        />
      );
    }
  };
  const SCUFF_T = 0.34;
  const popProgress = (f.t - ROLL_IN) / SCUFF_T;
  if (popProgress >= 0 && popProgress < 1) {
    // Scuff at the popping end of the deck, not at its center.
    pushScuff('pop', popProgress, X0 + (spec.nollie ? 30 : -30), 0.75);
  }
  const landProgress = (f.t - (ROLL_IN + FLIP_T)) / SCUFF_T;
  if (landed && landProgress >= 0 && landProgress < 1) {
    pushScuff('land', landProgress, f.board.x, 1);
  }
  const skyScenery = buildSkyScenery(spotBackZ);
  const asphaltGradId = `${skyGradId}-asphalt`;
  const shoulderGradId = `${skyGradId}-shoulder`;
  const roadSheenId = `${skyGradId}-sheen`;
  const hazeGradId = `${skyGradId}-haze`;
  const hazeClipId = `${skyGradId}-haze-clip`;

  // Projected anchors for gradient mapping (near vs far asphalt tone).
  const nearFloor = project({ x: X0, y: GROUND, z: spotFrontZ * 0.35 });
  const farFloor = project({ x: X0, y: GROUND, z: spotBackZ });
  // The spot's far edge is a diagonal under this camera, so the haze band has
  // to cover the whole span of that edge, not a single horizon y.
  const backLeft = project({ x: spotLeft, y: GROUND, z: spotBackZ });
  const backRight = project({ x: spotRight, y: GROUND, z: spotBackZ });
  const hazeTop = Math.min(backLeft.y, backRight.y);
  const hazeHeight = Math.abs(backLeft.y - backRight.y) + 52;

  return (
    <div
      className={`trick-anim trick-anim--3d ${isPlaying && staticTime == null ? 'trick-anim--moving' : ''}`}
      data-rider-stance={riderStance}
      data-nose-foot={mechanics.noseFoot}
      data-near-foot={forceRegularTailLegNear ? mechanics.tailFoot : undefined}
      data-body-yaw={mechanics.bodyYawDegrees}
      data-stance-body-yaw={restingBodyYaw}
      data-toe-side={mechanics.orientationSign}
      data-board-flip={flipDeg3d.toFixed(1)}
      data-board-yaw={yawDeg3d.toFixed(1)}
      data-current-body-yaw={bodyYawDeg3d.toFixed(1)}
      data-current-head-yaw={headYawDeg3d.toFixed(1)}
      data-playback-rate={effectivePlaybackRate}
    >
      <button
        type="button"
        className="trick-anim-3d__replay"
        aria-label={`Replay ${robot.name} attempting ${trick.name} in 3D`}
        aria-roledescription="trick animation"
        onClick={replay}
      >
        <svg viewBox={`0 ${-SKY_PAD} ${W} ${H + SKY_PAD}`} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={skyGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7ec8f0" />
            <stop offset="48%" stopColor="#a8daf5" />
            <stop offset="78%" stopColor="#d6eefb" />
            <stop offset="100%" stopColor="#dce7ed" />
          </linearGradient>
          {/* Depth-tinted asphalt: cooler/lighter toward the horizon. */}
          <linearGradient
            id={asphaltGradId}
            gradientUnits="userSpaceOnUse"
            x1={nearFloor.x}
            y1={nearFloor.y}
            x2={farFloor.x}
            y2={farFloor.y}
          >
            <stop offset="0%" stopColor="var(--spot-asphalt-deep, #6b7582)" />
            <stop offset="45%" stopColor="var(--spot-asphalt, #7d8794)" />
            <stop offset="100%" stopColor="#9aa6b2" />
          </linearGradient>
          <linearGradient
            id={shoulderGradId}
            gradientUnits="userSpaceOnUse"
            x1={nearFloor.x}
            y1={nearFloor.y}
            x2={farFloor.x}
            y2={farFloor.y}
          >
            <stop offset="0%" stopColor="#7fad6e" />
            <stop offset="55%" stopColor="var(--spot-floor, #95c07f)" />
            <stop offset="100%" stopColor="#b5d49a" />
          </linearGradient>
          <radialGradient
            id={roadSheenId}
            cx={X0}
            cy={GROUND - 8}
            r={220}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
            <stop offset="42%" stopColor="rgba(255,255,255,0.05)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          {/* Contact shadows are soft, not stamped. */}
          <filter id={`${skyGradId}-soft`} x="-40%" y="-160%" width="180%" height="420%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
          {/* Aerial perspective at the far edge of the spot: the ground fades
              into the sky instead of ending on a hard diagonal cut. Clipped to
              the floor so it tints only the ground — unclipped it washed out
              the sky and the sun along the whole band. */}
          <clipPath id={hazeClipId}>
            <path d={floorPath} />
          </clipPath>
          <linearGradient
            id={hazeGradId}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={hazeTop}
            x2={0}
            y2={hazeTop + hazeHeight}
          >
            <stop offset="0%" stopColor="var(--spot-sky-horizon, #d6eefb)" stopOpacity="0.8" />
            <stop offset="45%" stopColor="var(--spot-sky-horizon, #d6eefb)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--spot-sky-horizon, #d6eefb)" stopOpacity="0" />
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
        <path className="trick-anim-3d__floor-plane" d={floorPath} fill={`url(#${shoulderGradId})`} />
        <path className="trick-anim-3d__road-plane" d={roadPath} fill={`url(#${asphaltGradId})`} />
        <path className="trick-anim-3d__road-sheen" d={roadPath} fill={`url(#${roadSheenId})`} />
        <rect
          aria-hidden="true"
          x={0}
          y={hazeTop}
          width={W}
          height={hazeHeight}
          fill={`url(#${hazeGradId})`}
          clipPath={`url(#${hazeClipId})`}
        />
        <path className="trick-anim-3d__back-edge" d={backEdge} />
        <path className="trick-anim-3d__curb-line trick-anim-3d__curb-line--far" d={farCurb} />
        <path className="trick-anim-3d__curb-line trick-anim-3d__curb-line--near" d={nearCurb} />
        <path className="trick-anim-3d__curb-lip" d={farCurbLip} />
        <path className="trick-anim-3d__curb-lip" d={nearCurbLip} />
        {gritMarks}
        {streetDashes}
        {flightStreaks}
        {boardShadow}
        {skaterShadow}
        {contactEls}

        {/* Depth-sorted board + skater */}
        {prims.map((p) => p.el)}
        </svg>
      </button>
      {speedToggleVisible && (
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
