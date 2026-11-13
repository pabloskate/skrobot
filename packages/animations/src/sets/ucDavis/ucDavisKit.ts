import type { Vec3 } from '../../camera/view';
import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { SURFACE, type SurfaceName } from '../surfaces';
import { UC_DAVIS_FOOT } from './ucDavisLayout';

/**
 * Shared pieces for the UC Davis bake under the realistic look (light: 'shader'): paint is the authored,
 * sunlit colour, laid flat, and the look lights and textures each face by its surface (sets/surfaces.ts).
 */

/** One foot in set units. */
export const F = UC_DAVIS_FOOT;
/** One inch in set units. */
export const INCH = UC_DAVIS_FOOT / 12;
/** Straight up. */
export const UP: Vec3 = [0, 1, 0];

/** An uninked face of one surface. */
export const tag = (surface: SurfaceName | number, id = 0): Ink => ({
  id, priority: 0, width: 0, kind: 0, solid: typeof surface === 'number' ? surface : SURFACE[surface],
});
/** An outlined part of one surface (the planter, the stairs, the building's wings), so each reads as its own piece. */
export const part = (id: number, surface: SurfaceName | number, priority = 2, width = 0.14): Ink => ({
  id, priority, width, kind: INK_PROP, solid: typeof surface === 'number' ? surface : SURFACE[surface],
});
/** Foliage masses, leaves patterned on them in three dimensions (solid 13, the look's `foliage`). */
export const LEAVES = 13;
/** Painted steel that isn't galvanised: handrails, lamp poles, bike racks. */
export const METAL = tag('metal');

/** The unit normal of the plane through three points, wound counter-clockwise seen from outside. */
export function normalOf(a: Vec3, c: Vec3, d: Vec3): Vec3 {
  const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const m = Math.hypot(...n) || 1;
  return [n[0] / m, n[1] / m, n[2] / m];
}

/**
 * A flat face through four corners in flat paint, a colour per corner if given. Wound to face `outward`, or,
 * without it, whichever way the corners' order says (the irregular bank pieces).
 */
export function face(b: Bake, a: Vec3, c: Vec3, d: Vec3, e: Vec3, color: string | [string, string, string, string], ink: Ink = NO_INK, outward?: Vec3) {
  const n = normalOf(a, c, d);
  const normal = outward ?? n;
  const [ca, cc, cd, ce] = typeof color === 'string' ? [color, color, color, color] : color;
  if (n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2] < 0) b.quadCorners(a, e, d, c, normal, [{ color: ca }, { color: ce }, { color: cd }, { color: cc }], ink);
  else b.quadCorners(a, c, d, e, normal, [{ color: ca }, { color: cc }, { color: cd }, { color: ce }], ink);
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

/** A round tube through points: pipe, post, pole, a bicycle's frame. */
export function tube(b: Bake, spine: Vec3[], radius: number, color: string, ink: Ink = METAL, sides = 8) {
  b.tube(spine, spine.map(() => radius), { color } as Paint, ink, sides, true);
}

/** A rail's sun shadow, one straight segment. */
export type RailShadow = { a: Vec3; b: Vec3; radius: number };
/** A box that shades the ground and props. */
export type ShadowBox = { min: Vec3; max: Vec3; yaw?: number };
/** A point in plan: x, z. */
export type Plan = [number, number];

/** Steel pipe through several points, its shadow cast per segment when `shadows` is given. */
export function pipe(b: Bake, points: Vec3[], shadows: RailShadow[] | null, radius: number, color: string) {
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

/** A chain-link fence from `from` to `to` (plan) on level ground at `y`: galvanised posts every ten feet, a top rail, the mesh. */
export function chainLink(props: Bake, mesh: Bake, from: Plan, to: Plan, y: number, height: number) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const bays = Math.max(1, Math.round(length / (10 * F)));
  const at = (k: number): Plan => [from[0] + ((to[0] - from[0]) * k) / bays, from[1] + ((to[1] - from[1]) * k) / bays];
  for (let k = 0; k <= bays; k++) {
    const p = at(k);
    tube(props, [[p[0], y, p[1]], [p[0], y + height + 2, p[1]]], 1.9, '#a2a8a3', tag('metal', 61));
    if (k < bays) {
      const q = at(k + 1);
      tube(props, [[p[0], y + height, p[1]], [q[0], y + height, q[1]]], 1.4, '#a2a8a3', tag('metal', 61));
      meshPanel(mesh, p, q, y + 1.5, y + 1.5, height - 1.5);
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
