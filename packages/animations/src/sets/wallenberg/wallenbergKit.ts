import type { Vec3 } from '../../camera/view';
import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { SURFACE, type SurfaceName } from '../surfaces';
import { SET_FOOT } from './wallenbergLayout';

/**
 * Shared pieces for Wallenberg's bake under the realistic look (light: 'shader'): paint is the authored,
 * sunlit colour, laid flat, and the look lights and textures each face by its surface (sets/surfaces.ts).
 */

export const F = SET_FOOT;
export const INCH = SET_FOOT / 12;
export const UP: Vec3 = [0, 1, 0];

/** An uninked face of one surface. */
export const tag = (surface: SurfaceName | number, id = 0): Ink => ({
  id, priority: 0, width: 0, kind: 0, solid: typeof surface === 'number' ? surface : SURFACE[surface],
});
/** An outlined part of one surface: the four curbs, the gym, the stairs, so each reads as its own obstacle. */
export const part = (id: number, surface: SurfaceName | number, priority = 2, width = 0.14): Ink => ({
  id, priority, width, kind: INK_PROP, solid: typeof surface === 'number' ? surface : SURFACE[surface],
});
/** Painted block walls: the look's masonry courses (solid 10). */
export const BLOCK = 10;
/** Foliage masses, leaves patterned on them in three dimensions (solid 13, the look's `foliage`). */
export const LEAVES = 13;
/** Galvanised pipe, shaded by the look's metal surface. */
export const STEEL = tag('metal', 60);

export function normalOf(a: Vec3, c: Vec3, d: Vec3): Vec3 {
  const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const m = Math.hypot(...n) || 1;
  return [n[0] / m, n[1] / m, n[2] / m];
}

/** A flat face through four corners, its normal from their winding (counter-clockwise seen from outside). */
export function face(b: Bake, a: Vec3, c: Vec3, d: Vec3, e: Vec3, color: string, ink: Ink = NO_INK, n: Vec3 = normalOf(a, c, d)) {
  b.quad(a, c, d, e, n, { color }, ink);
}

/** A level floor over a rectangle. */
export function floor(b: Bake, x0: number, x1: number, z0: number, z1: number, y: number, color: string, ink: Ink) {
  b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], UP, { color }, ink);
}

/**
 * A box in flat paint (the look lights it) carrying its surface; inked, each face is its own part. (Bake.box
 * turns a null ink into NO_INK, which would drop the surface.)
 */
export function solidBox(b: Bake, min: Vec3, max: Vec3, side: string, top: string, ink: Ink, faces = 'tbfkle') {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const list: Array<[string, Vec3, Vec3[], string]> = [
    ['t', [0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], top],
    ['b', [0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], side],
    ['f', [0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], side],
    ['k', [0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], side],
    ['l', [-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], side],
    ['e', [1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], side],
  ];
  list.forEach(([key, n, [a, c, d, e], color], i) => {
    if (!faces.includes(key)) return;
    const faceInk = ink.width > 0 ? { ...ink, id: ink.id + i, priority: ink.priority + i } : ink;
    b.quad(a, c, d, e, n, { color }, faceInk);
  });
}

/** A round tube through points: pipe, post, downspout, conduit. */
export function tube(b: Bake, spine: Vec3[], radius: number, color: string, ink: Ink = STEEL, sides = 8) {
  b.tube(spine, spine.map(() => radius), { color } as Paint, ink, sides, true);
}

export type RailShadow = { a: Vec3; b: Vec3; radius: number };
export type ShadowBox = { min: Vec3; max: Vec3; yaw?: number };
export type Plan = [number, number];

/** Galvanised pipe through several points, its shadow cast per segment. */
export function pipe(b: Bake, points: Vec3[], shadows: RailShadow[] | null, radius = 1.6, color = '#a4a9a4') {
  tube(b, points, radius, color);
  if (shadows) for (let i = 0; i + 1 < points.length; i++) shadows.push({ a: points[i], b: points[i + 1], radius });
}

/** Chain-link spacing and wire, drawn per pixel (wireMesh.ts) so it never sparkles. */
export const CHAIN_LINK = { spacing: 2.2 * INCH, radius: 0.2, color: '#a9b1ac' };

/**
 * One panel of chain link between two posts at `a` and `b` (plan), its bottom at `y0` and `y1` above them and
 * `height` tall: the corners carry their distance along and up the panel for the mesh shader.
 */
export function meshPanel(mesh: Bake, a: Plan, b: Plan, y0: number, y1: number, height: number) {
  const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n: Vec3 = [-(b[1] - a[1]) / width, 0, (b[0] - a[0]) / width];
  const corners = ([[0, y0, 0], [width, y1, 0], [width, y1, height], [0, y0, height]] as const).map(([u, y, v]) => ({
    at: [a[0] + ((b[0] - a[0]) * u) / width, y + v, a[1] + ((b[1] - a[1]) * u) / width] as Vec3,
    along: [u, v, 0] as Vec3,
  }));
  for (const k of [0, 1, 2, 0, 2, 3]) mesh.vertex(corners[k].at, n, { color: CHAIN_LINK.color }, NO_INK, corners[k].along);
}

/**
 * A chain-link fence from `from` to `to` (plan) over the ground `base(x, z)`: posts every seven feet, a top
 * rail, and the mesh between them.
 */
export function chainLink(props: Bake, mesh: Bake, from: Plan, to: Plan, base: (x: number, z: number) => number, height: number, posts = true) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const bays = Math.max(1, Math.round(length / (7 * F)));
  const at = (k: number): Plan => [from[0] + ((to[0] - from[0]) * k) / bays, from[1] + ((to[1] - from[1]) * k) / bays];
  for (let k = 0; k <= bays; k++) {
    const p = at(k), y = base(p[0], p[1]);
    if (posts) tube(props, [[p[0], y, p[1]], [p[0], y + height + 2, p[1]]], 1.9, '#a2a8a3');
    if (k < bays) {
      const q = at(k + 1), yq = base(q[0], q[1]);
      tube(props, [[p[0], y + height, p[1]], [q[0], yq + height, q[1]]], 1.4, '#a2a8a3');
      meshPanel(mesh, p, q, y + 1.5, yq + 1.5, height - 1.5);
    }
  }
}

/** Two hex colours mixed in display space. */
export function mixHex(a: string, b: string, t: number) {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * Math.min(1, Math.max(0, t))).toString(16).padStart(2, '0')).join('');
}

/** Deterministic value noise in [0, 1), feet in. */
export function valueNoise(x: number, z: number) {
  const hash = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
