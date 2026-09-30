import { GROUND, JUMP, X0 } from '../TrickAnimation';
import { clamp01, mixHex, norm3, rad, sub3, type P2, type V3 } from './math';

/**
 * Crane camera for TrickScene.
 *
 * World space is the physics stage: x = travel, y = DOWN, z = toward the
 * rider's regular toeside. The camera sits low and in front of the rider,
 * yawed so the rider rolls slightly toward the viewer — the same 3/4 angle the
 * New 3D poses were tuned against — but with a real pinhole projection, so
 * the ground meets the sky on a level horizon instead of tilting like a hill.
 *
 * `lift` raises the camera with the pop. Raising (not tilting) keeps the
 * horizon still while the ground drops away, which sells height without
 * shrinking the robot to fit the whole arc in frame.
 */

const YAW = rad(-26);
const PITCH = rad(9);
/** Camera distance from its target; closer = stronger perspective. */
const DISTANCE = 520;
/** Focal length in viewBox units. FOCAL / DISTANCE is the rider's scale. */
const FOCAL = 720;
/** Target height above the asphalt: roughly the resting hip. */
const TARGET_HEIGHT = 72;
/** Screen position the target projects to. */
const ANCHOR_X = X0;
const ANCHOR_Y = 203;
/** Clip anything closer than this to the camera plane. */
const NEAR = 60;

const COS_A = Math.cos(YAW);
const SIN_A = Math.sin(YAW);
const COS_B = Math.cos(PITCH);
const SIN_B = Math.sin(PITCH);

export interface Proj extends P2 {
  /** Perspective scale: viewBox units per world unit at this depth. */
  s: number;
  /** Camera-space depth; larger = closer to the viewer. */
  depth: number;
}

export interface Camera {
  project(p: V3): Proj;
  /** Camera-space depth only (cheaper than a projection). */
  depthOf(p: V3): number;
  /** World-space eye position, for facing tests. */
  eye: V3;
  /** Screen y of the horizon. Independent of lift. */
  horizonY: number;
  /** Clip a world segment against the near plane. */
  clip(a: V3, b: V3): [V3, V3] | null;
  /** Clip a world polygon against the near plane (Sutherland–Hodgman). */
  clipPolygon(pts: V3[]): V3[];
}

export function makeCamera(lift: number): Camera {
  const targetHeight = TARGET_HEIGHT + lift;
  const depthOf = (p: V3) => {
    const dx = p.x - X0;
    const wy = GROUND - p.y - targetHeight;
    const z1 = -dx * SIN_A + p.z * COS_A;
    return wy * SIN_B + z1 * COS_B;
  };
  const project = (p: V3): Proj => {
    const dx = p.x - X0;
    const wy = GROUND - p.y - targetHeight;
    const x1 = dx * COS_A + p.z * SIN_A;
    const z1 = -dx * SIN_A + p.z * COS_A;
    const y2 = wy * COS_B - z1 * SIN_B;
    const z2 = wy * SIN_B + z1 * COS_B;
    const s = FOCAL / Math.max(NEAR * 0.5, DISTANCE - z2);
    return { x: ANCHOR_X + x1 * s, y: ANCHOR_Y - y2 * s, s, depth: z2 };
  };
  const eye: V3 = {
    x: X0 - DISTANCE * COS_B * SIN_A,
    y: GROUND - (targetHeight + DISTANCE * SIN_B),
    z: DISTANCE * COS_B * COS_A,
  };
  const limit = DISTANCE - NEAR;
  const clip = (a: V3, b: V3): [V3, V3] | null => {
    const da = depthOf(a);
    const db = depthOf(b);
    if (da > limit && db > limit) return null;
    if (da <= limit && db <= limit) return [a, b];
    const t = (limit - da) / (db - da);
    const c = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    return da > limit ? [c, b] : [a, c];
  };
  const clipPolygon = (pts: V3[]): V3[] => {
    const out: V3[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const da = depthOf(a);
      const db = depthOf(b);
      if (da <= limit) out.push(a);
      if ((da <= limit) !== (db <= limit)) {
        const t = (limit - da) / (db - da);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    return out;
  };
  return { project, depthOf, eye, horizonY: ANCHOR_Y - FOCAL * Math.tan(PITCH), clip, clipPolygon };
}

/** Share of the pop the camera rises with. */
export const FOLLOW_POP = 0.58;
/** Share of a fall's head drop the camera sinks with. */
const FOLLOW_FALL = 0.6;
/** Head height above the asphalt while riding. */
const RIDING_HEAD_HEIGHT = 122;

/**
 * Crane height for a frame. Rises on an ease-in/ease-out bump through the
 * flight (zero slope at takeoff and touchdown, so the camera never jerks),
 * and sinks after a slam so a robot lying on the ground stays in frame.
 */
export function cameraLift(flight: number, popHeight: number, headHeight: number, falling: boolean): number {
  const inFlight = flight > 0 && flight < 1;
  const rise = inFlight ? FOLLOW_POP * JUMP * popHeight * Math.sin(Math.PI * flight) ** 2 : 0;
  return rise - (falling ? fallSink(headHeight) : 0);
}

/** How far the crane sinks to keep a fallen rider's head in frame. */
export function fallSink(headHeight: number): number {
  return FOLLOW_FALL * Math.max(0, RIDING_HEAD_HEIGHT - headHeight);
}

/** Does a surface with normal `n` at `p` face the camera? */
export function facesCamera(cam: Camera, p: V3, n: V3): boolean {
  const toEye = sub3(cam.eye, p);
  return toEye.x * n.x + toEye.y * n.y + toEye.z * n.z > 0;
}

// ---------- Light + palette ----------

/** Direction pointing AT the sun (world y is down, so up is negative y).
 *  Low and to the right, agreeing with the sun painted in the sky. */
export const LIGHT: V3 = norm3({ x: 0.5, y: -0.8, z: 0.36 });

/** Screen-space shading direction for the robot's two-tone crescents.
 *  Deliberately more diagonal than LIGHT's projection (which is nearly
 *  straight up from this low camera and would tuck every shadow under the
 *  part): upper-right, agreeing with ground shadows falling back-left. */
export const LIGHT_SCREEN: P2 = (() => {
  const x = 0.64;
  const y = -0.77;
  const m = Math.hypot(x, y);
  return { x: x / m, y: y / m };
})();

export const PALETTE = {
  /** Brand ink: every outline in the scene. */
  ink: '#221a4e',
  /** Warm key light and cool bounce: shading mixes toward these, never
   *  toward white/black, so lit and shadow sides stay in one color family. */
  warm: '#fff4e0',
  cool: '#4a3a8c',
  skyTop: '#c9b8ef',
  skyMid: '#f7c9b4',
  skyLow: '#ffe6c7',
  horizon: '#fff3de',
  sun: '#fff8ea',
  cityFar: '#eccad0',
  cityNear: '#dcb3c4',
  lawn: '#b9cf94',
  lawnFar: '#d9dcb0',
  tree: '#86b07c',
  trunk: '#8c6f78',
  concrete: '#efe3d3',
  concreteFar: '#f5ebdf',
  joint: '#cdbba7',
  ledge: '#e6d6c4',
  paint: '#6431d8',
  shadow: '#5b4a92',
  dust: '#fff6e8',
  limb: '#3a3456',
  grip: '#2c2742',
  ply: '#f0d4a4',
  metal: '#c8c6d8',
  wheel: '#fbf1df',
} as const;

/** Lambert term (0 = facing away, 1 = facing the sun) with a soft ambient floor. */
export function lambert(n: V3): number {
  const d = n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z;
  return clamp01(0.5 + 0.5 * d);
}

/** Cel tone for a base color under a Lambert term. */
export function tone(base: string, lam: number): string {
  return lam >= 0.5
    ? mixHex(base, PALETTE.warm, (lam - 0.5) * 2 * 0.32)
    : mixHex(base, PALETTE.cool, (0.5 - lam) * 2 * 0.42);
}
