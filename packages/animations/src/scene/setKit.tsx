import type { ReactElement } from 'react';
import { GROUND, W, X0 } from '../TrickAnimation';
import { LIGHT, facesCamera, lambert, tone, type Camera, type ViewBox } from './camera';
import { hull, type P2, type V3 } from './math';

/**
 * Building blocks shared by TrickScene's sets (the backdrops behind the
 * robot): world-space ground patches and prop boxes drawn through the scene
 * camera, shadows cast along the sun, repeating patterns that scroll with
 * the street, and seeded randomness so every set is the same every frame.
 */

/** Which set the scene is staged on: the stock plaza, or the bayside waterfront. */
export type SceneSet = 'plaza' | 'waterfront';

export const SCENE_SETS: ReadonlyArray<{ id: SceneSet; label: string }> = [
  { id: 'plaza', label: 'Plaza' },
  { id: 'waterfront', label: 'Waterfront' },
];

/**
 * A stretch of a set that never changes as the trick plays, only slides: the
 * sky, or a skyline at infinity drifting with the street. TrickScene draws
 * each one as its own SVG under the scene, so the browser paints it once and
 * then just moves it, instead of repainting it with the robot every frame.
 * Only the stage's own framing (camera and zoom) redraws one.
 */
export interface FarLayer {
  key: string;
  /** The part of the scene it covers, in viewBox units. */
  box: ViewBox;
  /** How far right of `box` (viewBox units) it has slid; absent for a layer that never slides. */
  shift?: number;
  /** Gradients its art paints with. */
  defs?: ReactElement;
  art: ReactElement;
}

/** `view` cut down to the rows from `top` to `bottom`; null when they're out of it. */
export function band(view: ViewBox, top: number, bottom: number): ViewBox | null {
  const y0 = Math.max(view.y, top);
  const y1 = Math.min(view.y + view.height, bottom);
  return y1 > y0 ? { x: view.x, y: y0, width: view.width, height: y1 - y0 } : null;
}

/** Screen-space layers run past the viewBox so a container wider or taller
 *  than the stage's aspect letterboxes into more scene, not a seam. */
export const BLEED_L = -W;
export const BLEED_R = 2 * W;
export const BLEED_Y = 320;

/** The street's laid-out span: props repeat across it as it scrolls. */
export const SPAN_LO = X0 - 2200;
export const SPAN_HI = X0 + 2400;

/** Positions of a repeating pattern element after scrolling, within [lo, hi). */
export function repeats(offset: number, period: number, scroll: number, lo = SPAN_LO, hi = SPAN_HI): number[] {
  return repeatsIndexed(offset, period, scroll, lo, hi).map((r) => r.x);
}

/**
 * Like `repeats`, with a stable index per copy: the same copy keeps its index
 * as it scrolls across the span, so per-copy variation (a taller palm, a
 * different bench) never jumps between frames.
 */
export function repeatsIndexed(offset: number, period: number, scroll: number, lo = SPAN_LO, hi = SPAN_HI): Array<{ x: number; i: number }> {
  const out: Array<{ x: number; i: number }> = [];
  const start = offset - scroll;
  let x = lo + ((((start - lo) % period) + period) % period);
  for (; x < hi; x += period) out.push({ x, i: Math.round((x - start) / period) });
  return out;
}

/**
 * A coordinate rounded to a tenth for path data. Sets draw thousands of
 * points a frame, and this is an order of magnitude faster than toFixed.
 */
export const num = (n: number) => Math.round(n * 10) / 10;

/** Path data through `points`, like math.ts's pathOf but built for volume. */
export function pathD(points: readonly P2[], close = true): string {
  if (!points.length) return '';
  let d = 'M' + num(points[0].x) + ' ' + num(points[0].y);
  for (let i = 1; i < points.length; i++) d += 'L' + num(points[i].x) + ' ' + num(points[i].y);
  return close ? d + 'Z' : d;
}

/** A world polygon clipped to the near plane and projected; '' when nothing is left. */
export function worldPath(cam: Camera, pts: V3[]): string {
  const clipped = cam.clipPolygon(pts);
  return clipped.length < 3 ? '' : pathD(clipped.map((p) => cam.project(p)));
}

export function groundQuad(cam: Camera, x0: number, x1: number, z0: number, z1: number, y = GROUND): string {
  return worldPath(cam, [
    { x: x0, y, z: z0 },
    { x: x1, y, z: z0 },
    { x: x1, y, z: z1 },
    { x: x0, y, z: z1 },
  ]);
}

/** Axis-aligned box: x/z extents and its top and bottom (world y is down, so top < bottom). */
export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
  bottom: number;
}

export const boxOnGround = (x0: number, x1: number, z0: number, z1: number, h: number, base = GROUND): Box =>
  ({ x0, x1, z0, z1, top: base - h, bottom: base });

/**
 * The faces of a box the camera can see, each lit by the sun and outlined.
 * Faces are clipped to the near plane: a camera swung toward the travel
 * looks down a row of props whose far end runs past it.
 */
export function boxFaces(
  cam: Camera,
  b: Box,
  color: string,
  { ink, inkWidth, top = color }: { ink: string; inkWidth: number; top?: string },
): ReactElement[] {
  const P = (x: number, y: number, z: number): V3 => ({ x, y, z });
  const faces: Array<{ n: V3; pts: V3[]; color: string }> = [
    { n: { x: 0, y: -1, z: 0 }, pts: [P(b.x0, b.top, b.z0), P(b.x1, b.top, b.z0), P(b.x1, b.top, b.z1), P(b.x0, b.top, b.z1)], color: top },
    { n: { x: 0, y: 0, z: 1 }, pts: [P(b.x0, b.bottom, b.z1), P(b.x1, b.bottom, b.z1), P(b.x1, b.top, b.z1), P(b.x0, b.top, b.z1)], color },
    { n: { x: 0, y: 0, z: -1 }, pts: [P(b.x0, b.bottom, b.z0), P(b.x1, b.bottom, b.z0), P(b.x1, b.top, b.z0), P(b.x0, b.top, b.z0)], color },
    { n: { x: -1, y: 0, z: 0 }, pts: [P(b.x0, b.bottom, b.z0), P(b.x0, b.bottom, b.z1), P(b.x0, b.top, b.z1), P(b.x0, b.top, b.z0)], color },
    { n: { x: 1, y: 0, z: 0 }, pts: [P(b.x1, b.bottom, b.z0), P(b.x1, b.bottom, b.z1), P(b.x1, b.top, b.z1), P(b.x1, b.top, b.z0)], color },
  ];
  const els: ReactElement[] = [];
  for (const [i, face] of faces.entries()) {
    const c = face.pts.reduce((m, p) => ({ x: m.x + p.x / 4, y: m.y + p.y / 4, z: m.z + p.z / 4 }), { x: 0, y: 0, z: 0 });
    if (!facesCamera(cam, c, face.n)) continue;
    const d = worldPath(cam, face.pts);
    if (!d) continue;
    els.push(<path key={i} d={d} fill={tone(face.color, lambert(face.n))} stroke={ink} strokeWidth={inkWidth} strokeLinejoin="round" />);
  }
  return els;
}

/** Where a point's shadow falls on the ground along the sun's rays. */
export function castToGround(p: V3): V3 {
  const t = Math.max(0, GROUND - p.y) / -LIGHT.y;
  return { x: p.x - LIGHT.x * t, y: GROUND, z: p.z - LIGHT.z * t };
}

/** Clip a ground polygon (x, z as a P2's x, y) to z >= minZ. */
function clipBehind(pts: P2[], minZ: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a.y >= minZ) out.push(a);
    if ((a.y >= minZ) !== (b.y >= minZ)) {
      const t = (minZ - a.y) / (b.y - a.y);
      out.push({ x: a.x + (b.x - a.x) * t, y: minZ });
    }
  }
  return out;
}

/**
 * Hull of cast points, each widened by `r` so thin parts still shade. The
 * hull is taken on the ground (x, z) and clipped to the near plane before
 * projecting, so a shadow running past the camera stays whole. `minZ` cuts
 * it off where the ground ends (a sea wall), so it never lands on water.
 */
export function shadowPath(cam: Camera, pts: V3[], r: number, minZ = -Infinity): string {
  const out: P2[] = [];
  for (const p of pts) {
    const c = castToGround(p);
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) {
      out.push({ x: c.x + dx, y: c.z + dz });
    }
  }
  let ground = hull(out);
  if (Number.isFinite(minZ)) ground = clipBehind(ground, minZ);
  if (ground.length < 3) return '';
  return worldPath(cam, ground.map((q) => ({ x: q.x, y: GROUND, z: q.y })));
}

/** Seeded generator (mulberry32): the same art every load, every frame. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 0–1 value for an integer cell. */
export function hash2(i: number, j: number, salt = 0): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
