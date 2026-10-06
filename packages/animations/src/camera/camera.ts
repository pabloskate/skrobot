import { GROUND, JUMP, X0 } from '../motion/trick';
import { clamp01, mixHex, norm3, rad, smoothstep, type P2, type V3 } from '../math';
import { FOOT } from '../sets/elToro/stairs';

/**
 * The crane camera that films the stage, and the scene's sun and palette.
 *
 * World space is the physics stage: x = travel, y = DOWN, z = toward the
 * rider's regular toeside. The stock camera sits low and in front of the
 * rider, yawed so the rider rolls slightly toward the viewer — the 3/4
 * angle the trick poses are tuned against — with a real pinhole
 * projection, so the ground meets the sky on a level horizon instead of
 * tilting like a hill.
 *
 * `lift` raises the camera with the pop. Raising (not tilting) keeps the
 * horizon still while the ground drops away, which sells height without
 * shrinking the robot to fit the whole arc in frame.
 *
 * A SceneCamera swings the crane to another angle around the same target.
 * SCENE_CAMERA_BOUNDS are the angles every trick is checked to stay in frame
 * from (camera.test.ts), with the eye on the viewer's side of the bar (world
 * z > BAR_Z); SCENE_ORBIT_BOUNDS are the wider ones the explorer can drag to.
 */

/** Camera distance from its target at lens 1; closer = stronger perspective. */
const DISTANCE = 520;
/** Focal length in viewBox units at lens 1. FOCAL / DISTANCE is the rider's scale. */
const FOCAL = 720;
/** Target height above the asphalt: roughly the resting hip. */
const TARGET_HEIGHT = 72;
/** Screen position the target projects to. */
const ANCHOR_X = X0;
const ANCHOR_Y = 203;
/** Clip anything closer than this to the camera plane. */
const NEAR = 60;

/** Where the crane sits around the rider, and the lens on it. */
export interface SceneCamera {
  /**
   * Degrees around the rider, seen from above. 0 is square to their side;
   * negative swings ahead of a rider rolling forward, positive behind them.
   */
  yaw: number;
  /** Degrees looking down at the rider's hips. */
  pitch: number;
  /**
   * Lens length, 1 for stock. Shorter moves in close on a wider lens (same
   * rider size, stronger perspective); longer backs off on a telephoto.
   */
  lens: number;
  /** Optional lateral framing in world units; 0 keeps the orbit on the rider. */
  targetZ?: number;
}

/**
 * Tripods stand still in the spot and pan to keep the rider in shot, rather
 * than flying alongside them as the crane does: from the bottom of the set,
 * off its side, and from the top. Where a spot has them (the landmarks),
 * TrickScene3D films from them; anywhere else it keeps to the crane.
 */
export type TripodId = 'bottom' | 'side' | 'top';

/**
 * The crane angle and lens that put its eye exactly at `eye` with the
 * target raised by `lift`: a tripod at `eye` pointed at the rider. The lens
 * is just the eye's distance; a tripod sets its own magnification.
 */
export function craneThrough(eye: V3, lift: number): SceneCamera {
  const dx = eye.x - X0;
  const up = GROUND - (TARGET_HEIGHT + lift) - eye.y;
  const distance = Math.max(1e-6, Math.hypot(dx, up, eye.z));
  return {
    yaw: (Math.atan2(-dx, eye.z) * 180) / Math.PI,
    pitch: (Math.asin(up / distance) * 180) / Math.PI,
    lens: distance / DISTANCE,
  };
}

/** The stock 3/4 view every stage uses unless told otherwise. */
export const DEFAULT_SCENE_CAMERA: Readonly<SceneCamera> = Object.freeze({ yaw: -26, pitch: 9, lens: 1 });

/**
 * The range every landed trick is tested to stay in frame and draw correctly
 * over (falls are framed for the stock view only). Yaw stops short of looking
 * along the bar and pitch short of straight down, keeping the eye on the
 * viewer's side of the bar. There's no zoom: the stock framing already spends
 * the stage's height on the pop, so the lens only trades perspective.
 */
export const SCENE_CAMERA_BOUNDS = Object.freeze({
  yaw: Object.freeze({ min: -75, max: 75 }),
  pitch: Object.freeze({ min: 0, max: 60 }),
  lens: Object.freeze({ min: 0.65, max: 1.6 }),
});

/** Full-circle controls for the depth-tested 3D renderer. Yaw wraps at +180°. */
export const SCENE_ORBIT_BOUNDS = Object.freeze({
  yaw: Object.freeze({ min: -180, max: 180 }),
  pitch: SCENE_CAMERA_BOUNDS.pitch,
  lens: SCENE_CAMERA_BOUNDS.lens,
  targetZ: Object.freeze({ min: -6 * FOOT, max: 6 * FOOT }),
});

/**
 * Zoom is a magnification of the finished picture, not a second lens: the
 * perspective stays whatever the lens made it, and everything (sky, ground,
 * rider, ink) scales together. 1 is the stock framing.
 */
export const SCENE_ZOOM = Object.freeze({ min: 0.5, max: 2.5 });

/** A zoom inside SCENE_ZOOM; a missing or invalid one is the stock framing. */
export function clampZoom(zoom: number | undefined): number {
  return zoom === undefined || !Number.isFinite(zoom) ? 1 : Math.max(SCENE_ZOOM.min, Math.min(SCENE_ZOOM.max, zoom));
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a zoomed-in view settles: a little below the hips, so the legs and the board (what a close look is for) stay in the shot. */
const ZOOM_FOCUS_Y = 250;
/** The zoom by which the view has settled on the rider. */
const ZOOM_SETTLED = 2;

/**
 * The part of the stock picture a zoom shows. Zooming out grows the box about
 * the stock framing; zooming in shrinks it and slides it toward the rider as
 * it goes, so the rider stays centered instead of drifting off the bottom of
 * the stage the way a zoom about a fixed point would.
 */
export function zoomedViewBox(zoom: number, stock: ViewBox): ViewBox {
  const z = clampZoom(zoom);
  const width = stock.width / z;
  const height = stock.height / z;
  const settle = smoothstep((z - 1) / (ZOOM_SETTLED - 1));
  const cx = stock.x + stock.width / 2 + (ANCHOR_X - (stock.x + stock.width / 2)) * settle;
  const cy = stock.y + stock.height / 2 + (ZOOM_FOCUS_Y - (stock.y + stock.height / 2)) * settle;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

const within = (value: number | undefined, fallback: number, bounds: { min: number; max: number }) =>
  value === undefined || !Number.isFinite(value) ? fallback : Math.max(bounds.min, Math.min(bounds.max, value));

/** A camera inside SCENE_CAMERA_BOUNDS; missing or invalid fields keep the stock view's. */
export function clampSceneCamera(camera: Partial<SceneCamera>): SceneCamera {
  return {
    yaw: within(camera.yaw, DEFAULT_SCENE_CAMERA.yaw, SCENE_CAMERA_BOUNDS.yaw),
    pitch: within(camera.pitch, DEFAULT_SCENE_CAMERA.pitch, SCENE_CAMERA_BOUNDS.pitch),
    lens: within(camera.lens, DEFAULT_SCENE_CAMERA.lens, SCENE_CAMERA_BOUNDS.lens),
  };
}

/** The same orbit angle in [-180, 180), so repeated turns have stable URLs. */
export function wrapOrbitYaw(yaw: number | undefined): number {
  if (yaw === undefined || !Number.isFinite(yaw)) return DEFAULT_SCENE_CAMERA.yaw;
  const wrapped = yaw % 360;
  const result = wrapped >= 180 ? wrapped - 360 : wrapped < -180 ? wrapped + 360 : wrapped;
  return result === 0 ? 0 : result;
}

/** A camera anywhere in the full-circle orbit the explorer can drag to. */
export function clampOrbitCamera(camera: Partial<SceneCamera>): SceneCamera {
  const targetZ = within(camera.targetZ, 0, SCENE_ORBIT_BOUNDS.targetZ);
  return {
    yaw: wrapOrbitYaw(camera.yaw),
    pitch: within(camera.pitch, DEFAULT_SCENE_CAMERA.pitch, SCENE_ORBIT_BOUNDS.pitch),
    lens: within(camera.lens, DEFAULT_SCENE_CAMERA.lens, SCENE_ORBIT_BOUNDS.lens),
    ...(targetZ === 0 ? {} : { targetZ }),
  };
}

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
  /**
   * How fast the far backdrop slides across the screen as the street rolls,
   * relative to the stock view: less as the camera swings to face the travel.
   */
  drift: number;
  /**
   * How far (viewBox units at lens 1) the crane's swing has slid things at
   * infinity, such as a far skyline, from where the stock view shows them.
   */
  pan: number;
  /** Magnification of things at infinity: 1 at the stock lens, more on a long lens. */
  farScale: number;
  /** Whether a point is in front of the near plane. */
  sees(p: V3): boolean;
  /** Clip a world segment against the near plane. */
  clip(a: V3, b: V3): [V3, V3] | null;
  /** Clip a world polygon against the near plane (Sutherland–Hodgman). */
  clipPolygon(pts: V3[]): V3[];
}

const STOCK_COS_YAW = Math.cos(rad(DEFAULT_SCENE_CAMERA.yaw));
const STOCK_YAW = rad(DEFAULT_SCENE_CAMERA.yaw);

export function makeCamera(lift: number, view: Readonly<SceneCamera> = DEFAULT_SCENE_CAMERA): Camera {
  const yaw = rad(view.yaw);
  const pitch = rad(view.pitch);
  const cosA = Math.cos(yaw);
  const sinA = Math.sin(yaw);
  const cosB = Math.cos(pitch);
  const sinB = Math.sin(pitch);
  const distance = DISTANCE * view.lens;
  const focal = FOCAL * view.lens;
  const targetHeight = TARGET_HEIGHT + lift;
  const targetZ = view.targetZ ?? 0;
  const depthOf = (p: V3) => {
    const dx = p.x - X0;
    const wy = GROUND - p.y - targetHeight;
    const z1 = -dx * sinA + (p.z - targetZ) * cosA;
    return wy * sinB + z1 * cosB;
  };
  const project = (p: V3): Proj => {
    const dx = p.x - X0;
    const wy = GROUND - p.y - targetHeight;
    const x1 = dx * cosA + (p.z - targetZ) * sinA;
    const z1 = -dx * sinA + (p.z - targetZ) * cosA;
    const y2 = wy * cosB - z1 * sinB;
    const z2 = wy * sinB + z1 * cosB;
    const s = focal / Math.max(NEAR * 0.5, distance - z2);
    return { x: ANCHOR_X + x1 * s, y: ANCHOR_Y - y2 * s, s, depth: z2 };
  };
  const eye: V3 = {
    x: X0 - distance * cosB * sinA,
    y: GROUND - (targetHeight + distance * sinB),
    z: targetZ + distance * cosB * cosA,
  };
  const limit = distance - NEAR;
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
  return {
    project,
    depthOf,
    eye,
    horizonY: ANCHOR_Y - focal * Math.tan(pitch),
    drift: cosA / STOCK_COS_YAW,
    pan: FOCAL * (yaw - STOCK_YAW),
    farScale: view.lens,
    sees: (p) => depthOf(p) <= limit,
    clip,
    clipPolygon,
  };
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
