import type { ReactElement } from 'react';
import { LIGHT_SCREEN, PALETTE, tone, type Camera } from './camera';
import { add3, clipConvex, hull, norm3, pathOf, scale3, sub3, type P2, type V3 } from './math';
import type { Frame3 } from './skeleton';

/**
 * Drawing primitives for TrickScene.
 *
 * A Group is one body part as the eye reads it (an arm, a leg + shoe, the
 * head). Every primitive in a group paints its ink outline into `outline`
 * and its color into `fill`; the group then draws all outlines before all
 * fills. Overlaps inside a part therefore merge into one clean silhouette —
 * no ink seams at the knee or where the shin enters the shoe — while
 * separate parts (an arm crossing the chest) still get a line between them.
 */

export interface Group {
  key: string;
  outline: ReactElement[];
  fill: ReactElement[];
}

export const newGroup = (key: string): Group => ({ key, outline: [], fill: [] });

export const renderGroup = (g: Group): ReactElement => (
  <g key={g.key}>
    {g.outline}
    {g.fill}
  </g>
);

/** Outline half-thickness in world units (scaled by perspective). */
export const OUTLINE = 1.15;

let uid = 0;
const nextKey = (prefix: string) => `${prefix}${uid++}`;
export const resetKeys = () => {
  uid = 0;
};

/** Screen-space capsule between two circles of different radii. */
function capsulePts(ax: number, ay: number, ar: number, bx: number, by: number, br: number): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    pts.push({ x: ax + c * ar, y: ay + sn * ar }, { x: bx + c * br, y: by + sn * br });
  }
  return hull(pts);
}

/** A limb: a capsule tapering from width `wa` at `a` to `wb` at `b`, with a
 *  shadow crescent on the side away from the sun. The lit core's offset
 *  scales with how squarely the limb faces the light, so the crescent never
 *  flips sides abruptly. */
export function tube(g: Group, cam: Camera, a: V3, b: V3, wa: number, color: string, wb = wa) {
  const pa = cam.project(a);
  const pb = cam.project(b);
  const ra = (wa / 2) * pa.s;
  const rb = (wb / 2) * pb.s;
  let px = -(pb.y - pa.y);
  let py = pb.x - pa.x;
  const m = Math.hypot(px, py) || 1;
  px /= m;
  py /= m;
  const facing = px * LIGHT_SCREEN.x + py * LIGHT_SCREEN.y;
  const ox = px * facing * 0.34;
  const oy = py * facing * 0.34;
  const o = OUTLINE * (pa.s + pb.s) / 2;
  const k = nextKey('t');
  g.outline.push(<path key={k} d={pathOf(capsulePts(pa.x, pa.y, ra + o, pb.x, pb.y, rb + o))} fill={PALETTE.ink} />);
  g.fill.push(
    <g key={k}>
      <path d={pathOf(capsulePts(pa.x, pa.y, ra, pb.x, pb.y, rb))} fill={tone(color, 0.18)} />
      <path d={pathOf(capsulePts(pa.x + ox * ra, pa.y + oy * ra, ra * 0.64, pb.x + ox * rb, pb.y + oy * rb, rb * 0.64))} fill={tone(color, 0.6)} />
    </g>,
  );
}

/** A sphere (hands, antenna tips, tree canopies). */
export function ball(g: Group, cam: Camera, c: V3, r: number, color: string, outline = OUTLINE) {
  const p = cam.project(c);
  const rr = r * p.s;
  const k = nextKey('b');
  if (outline > 0) {
    g.outline.push(<circle key={k} cx={p.x} cy={p.y} r={rr + outline * p.s} fill={PALETTE.ink} />);
  }
  g.fill.push(
    <g key={k}>
      <circle cx={p.x} cy={p.y} r={rr} fill={tone(color, 0.2)} />
      <circle cx={p.x + LIGHT_SCREEN.x * rr * 0.22} cy={p.y + LIGHT_SCREEN.y * rr * 0.22} r={rr * 0.74} fill={tone(color, 0.62)} />
    </g>,
  );
}

// ---------- Rounded boxes ----------

/** 26 unit directions (faces, edges, corners of a cube) for sphere sampling. */
const SPHERE_DIRS: V3[] = (() => {
  const dirs: V3[] = [];
  for (const x of [-1, 0, 1]) {
    for (const y of [-1, 0, 1]) {
      for (const z of [-1, 0, 1]) {
        if (x || y || z) dirs.push(norm3({ x, y, z }));
      }
    }
  }
  return dirs;
})();

export interface BoxSpec {
  /** Half extents along the frame's fwd / up / side axes. */
  f: number;
  u: number;
  s: number;
  /** Corner radius. */
  r: number;
  /** Scale of the bottom (−up) cross-section; < 1 tapers toward the base. */
  taper?: number;
}

/** Local (fwd, up, side) offset → world, honoring the taper. */
function boxPoint(frame: Frame3, spec: BoxSpec, f: number, u: number, s: number): V3 {
  const t = spec.taper ?? 1;
  const k = t + (1 - t) * ((u / spec.u + 1) / 2);
  return frame.at(f * k, u, s * k);
}

/** Share of a part's extent toward the sun that its shadow crescent covers. */
const CRESCENT = 0.3;

/**
 * Rounded box, shaded like the limbs: the silhouette in the shadow tone and
 * the same silhouette nudged toward the sun (clipped back inside it) in the
 * lit tone. The crescent left on the far side is what reads as volume.
 *
 * Deliberately no per-face panels: a panel has to switch on when its face
 * turns toward the camera, and that switch pops every time a part rotates.
 * The hull and the crescent both change continuously with the pose.
 */
/** Projected silhouette of a rounded box. */
export function boxHull(cam: Camera, frame: Frame3, spec: BoxSpec): P2[] {
  const { r } = spec;
  const inner = { f: spec.f - r, u: spec.u - r, s: spec.s - r };
  const pts: P2[] = [];
  const unitF = norm3(frame.fwd);
  const unitU = norm3(frame.up);
  const unitS = norm3(frame.side);
  for (const sf of [-1, 1]) {
    for (const su of [-1, 1]) {
      for (const ss of [-1, 1]) {
        const c = boxPoint(frame, spec, sf * inner.f, su * inner.u, ss * inner.s);
        for (const d of SPHERE_DIRS) {
          const q = add3(c, add3(scale3(unitF, d.x * r), add3(scale3(unitU, d.y * r), scale3(unitS, d.z * r))));
          pts.push(cam.project(q));
        }
      }
    }
  }
  return hull(pts);
}

export function roundedBox(
  g: Group,
  cam: Camera,
  frame: Frame3,
  spec: BoxSpec,
  color: string,
  { outline = OUTLINE, clip }: { outline?: number; clip?: P2[] } = {},
): P2[] {
  const raw = boxHull(cam, frame, spec);
  const shape = clip ? clipConvex(raw, clip) : raw;
  shadeShape(g, shape, cam.project(frame.origin).s, color, outline);
  return shape;
}

/**
 * Projected silhouette of a convex solid with rounded edges: the hull of
 * `corners` (frame-local fwd / up / side), each swollen into a ball of
 * radius `r`. Corners are the rounding's centers, so the solid reaches `r`
 * past them.
 */
export function solidHull(cam: Camera, frame: Frame3, corners: ReadonlyArray<readonly [number, number, number]>, r: number): P2[] {
  const unitF = norm3(frame.fwd);
  const unitU = norm3(frame.up);
  const unitS = norm3(frame.side);
  const pts: P2[] = [];
  for (const [f, u, s] of corners) {
    const c = frame.at(f, u, s);
    for (const d of SPHERE_DIRS) {
      pts.push(cam.project(add3(c, add3(scale3(unitF, d.x * r), add3(scale3(unitU, d.y * r), scale3(unitS, d.z * r))))));
    }
  }
  return hull(pts);
}

/**
 * Paint a convex silhouette the way every rounded part is: ink outline,
 * the shadow tone, and the lit tone nudged toward the sun. `s` is the
 * perspective scale at the part, for the ink's width.
 */
export function shadeShape(g: Group, shape: P2[], s: number, color: string, outline = OUTLINE): void {
  const silhouette = pathOf(shape);
  const k = nextKey('x');
  if (outline > 0) {
    g.outline.push(
      <path key={k} d={silhouette} fill={PALETTE.ink} stroke={PALETTE.ink} strokeWidth={2 * outline * s} strokeLinejoin="round" />,
    );
  }
  let cx = 0;
  let cy = 0;
  for (const p of shape) {
    cx += p.x;
    cy += p.y;
  }
  cx /= shape.length;
  cy /= shape.length;
  let reach = 0;
  for (const p of shape) reach = Math.max(reach, (p.x - cx) * LIGHT_SCREEN.x + (p.y - cy) * LIGHT_SCREEN.y);
  const shift = CRESCENT * reach;
  const lit = clipConvex(
    shape.map((p) => ({ x: p.x + LIGHT_SCREEN.x * shift, y: p.y + LIGHT_SCREEN.y * shift })),
    shape,
  );
  g.fill.push(
    <g key={k}>
      <path d={silhouette} fill={tone(color, 0.18)} />
      <path d={pathOf(lit)} fill={tone(color, 0.6)} />
    </g>,
  );
}

/** How squarely a surface faces the camera: 1 head-on, 0 edge-on, < 0 away. */
export function facing(cam: Camera, p: V3, n: V3): number {
  const toEye = norm3(sub3(cam.eye, p));
  const nn = norm3(n);
  return toEye.x * nn.x + toEye.y * nn.y + toEye.z * nn.z;
}

/** Project points given in a box face's plane (local fwd/up/side). */
export function facePath(cam: Camera, frame: Frame3, pts: Array<[number, number, number]>, close = true): string {
  return pathOf(pts.map(([f, u, s]) => cam.project(frame.at(f, u, s))), close);
}

/** Rounded-rectangle outline in a frame's up/side plane at depth `f`. */
export function roundedRectPts(
  f: number,
  cu: number,
  cs: number,
  halfU: number,
  halfS: number,
  r: number,
  steps = 4,
): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  const corners: Array<[number, number, number]> = [
    [cu + halfU - r, cs + halfS - r, 0],
    [cu - halfU + r, cs + halfS - r, 90],
    [cu - halfU + r, cs - halfS + r, 180],
    [cu + halfU - r, cs - halfS + r, 270],
  ];
  for (const [u0, s0, start] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = ((start + (90 * i) / steps) * Math.PI) / 180;
      pts.push([f, u0 + Math.cos(a) * r, s0 + Math.sin(a) * r]);
    }
  }
  return pts;
}
