import { GROUND, H, SKY_PAD, W, X0 } from '../TrickAnimation';
import { DEFAULT_SCENE_CAMERA, makeCamera, zoomedViewBox, type Camera, type SceneCamera, type ViewBox } from '../scene/camera';
import { WHEEL_BOTTOM } from '../scene/board';
import { rad, type V3 } from '../scene/math';

/**
 * The scene camera as a 3D camera. TrickScene projects with its own pinhole
 * (scene/camera.ts); this recovers that pinhole from the camera's public
 * surface — its eye, and where it projects the point it orbits — so the 3D
 * renderer frames every angle, lens, lift, and zoom exactly as the SVG does.
 *
 * Three's world is the physics stage with y flipped to point up, and the
 * rider's rolling spot (X0 on the asphalt) at the origin.
 */

export type Vec3 = [number, number, number];

/**
 * Where the asphalt is, in physics y. The shared physics rides the deck's
 * center at GROUND with the wheels hanging WHEEL_BOTTOM below it, and
 * TrickScene paints its ground at GROUND too — wheels sunk into it, which
 * only paint order hides. Here the ground is where the wheels roll, and the
 * rider, board, bar top, and camera keep the physics' heights, so the
 * picture frames exactly as TrickScene's does.
 */
export const ASPHALT = GROUND + WHEEL_BOTTOM;

/** Physics world (y down) → three world (y up, the rider's spot on the asphalt at the origin). */
export const toThree = (p: V3): Vec3 => [p.x - X0, ASPHALT - p.y, p.z];
/** A physics direction → three. */
export const dirToThree = (d: V3): Vec3 => [d.x, -d.y, d.z];

/** The stock picture TrickScene frames, in its viewBox units. */
export const STOCK_VIEW: Readonly<ViewBox> = Object.freeze({ x: 0, y: -SKY_PAD, width: W, height: H + SKY_PAD });

export interface StageView {
  /** The scene camera, for anything still worked out in screen space. */
  cam: Camera;
  /** Eye and orthonormal axes (three world): the camera looks down -back. */
  eye: Vec3;
  right: Vec3;
  up: Vec3;
  back: Vec3;
  /** The picture: the zoomed view widened to the canvas's shape, in viewBox units. */
  box: ViewBox;
  /** Frustum at a near distance of 1. */
  frustum: { left: number; right: number; top: number; bottom: number };
  /** Focal length and the screen point the orbit target lands on, in viewBox units. */
  focal: number;
  /** The crane's distance from the point it orbits. */
  distance: number;
  anchor: { x: number; y: number };
}

/**
 * The view box `view` grown about its center to an `aspect` (width / height)
 * canvas, the way an SVG's default "xMidYMid meet" shows more scene instead of
 * stretching it.
 */
export function fitViewBox(view: ViewBox, aspect: number): ViewBox {
  const own = view.width / view.height;
  if (aspect >= own) {
    const width = view.height * aspect;
    return { x: view.x - (width - view.width) / 2, y: view.y, width, height: view.height };
  }
  const height = view.width / aspect;
  return { x: view.x, y: view.y - (height - view.height) / 2, width: view.width, height };
}

export function stageView(lift: number, camera: Readonly<SceneCamera> = DEFAULT_SCENE_CAMERA, zoom = 1, aspect = STOCK_VIEW.width / STOCK_VIEW.height): StageView {
  const cam = makeCamera(lift, camera);
  const a = rad(camera.yaw);
  const b = rad(camera.pitch);
  const right: Vec3 = [Math.cos(a), 0, Math.sin(a)];
  const up: Vec3 = [Math.sin(a) * Math.sin(b), Math.cos(b), -Math.cos(a) * Math.sin(b)];
  const back: Vec3 = [-Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)];
  const eye = toThree(cam.eye);
  // The orbit target sits on the rider's spot (x = X0, z = 0), straight down the view axis from the eye.
  // Along whichever ground axis the view has some reach: square to the street
  // (|yaw| near 90, looking down it) the view axis has no z to measure by.
  const distance = Math.abs(back[2]) > 0.05 ? eye[2] / back[2] : eye[0] / back[0];
  const target: V3 = { x: X0, y: ASPHALT - (eye[1] - distance * back[1]), z: 0 };
  const anchor = cam.project(target);
  const focal = anchor.s * distance;
  const box = fitViewBox(zoomedViewBox(zoom, STOCK_VIEW), aspect);
  return {
    cam,
    eye,
    right,
    up,
    back,
    box,
    frustum: {
      left: (box.x - anchor.x) / focal,
      right: (box.x + box.width - anchor.x) / focal,
      top: (anchor.y - box.y) / focal,
      bottom: (anchor.y - box.y - box.height) / focal,
    },
    focal,
    distance,
    anchor: { x: anchor.x, y: anchor.y },
  };
}

/**
 * Where a three-world point lands in the picture, in viewBox units, through
 * a StageView: the same answer as the scene camera's project().
 */
export function projectThree(view: StageView, p: Vec3): { x: number; y: number } {
  const d: Vec3 = [p[0] - view.eye[0], p[1] - view.eye[1], p[2] - view.eye[2]];
  const dot = (v: Vec3) => d[0] * v[0] + d[1] * v[1] + d[2] * v[2];
  const depth = -dot(view.back);
  return { x: view.anchor.x + (dot(view.right) / depth) * view.focal, y: view.anchor.y - (dot(view.up) / depth) * view.focal };
}
