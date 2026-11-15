import type { Vec3 } from '../../camera/view';
import { Bake, NO_INK, type Ink } from '../../three/bake';
import { SURFACE, type SurfaceName } from '../surfaces';
import { EMAGE_FOOT as F } from './emageLayout';
import { BRIDGE_PICKET } from './emagePalette';
import { hash2 } from '../setKit';

export { mixHex } from '../lookKit';

/**
 * Emage's bake helpers under the realistic look (light: 'shader'): paint is the authored, sunlit colour, laid
 * flat, and each face carries the surface (sets/surfaces.ts) the look textures and lights it as, per pixel.
 */

export const UP: Vec3 = [0, 1, 0];
export type Segment = { a: Vec3; b: Vec3; radius: number };
export type ShadowBox = { min: Vec3; max: Vec3 };

/** An uninked face of one look surface, or of a raw solid (13 is the look's patterned leaves). */
export const tag = (surface: SurfaceName | number): Ink => ({ id: 0, priority: 0, width: 0, kind: 0, solid: typeof surface === 'number' ? surface : SURFACE[surface] });

/** Foliage masses: leaves patterned in three dimensions by the look's `foliage`. */
export const LEAVES = 13;

/** A box in authored paint. Bake.box normally pre-lights its faces; shader-lit Emage must opt out. */
export function box(b: Bake, min: Vec3, max: Vec3, side: string, top: string, ink: Ink) {
  b.box(min, max, side, top, ink, 'tbfkle', false);
}

/** A flat quad in one paint, wound to face `normal` whichever way its corners run. */
export function face(b: Bake, a: Vec3, c: Vec3, d: Vec3, e: Vec3, color: string, normal: Vec3 = UP, ink = tag('concrete')) {
  const u = c.map((q, i) => q - a[i]), v = d.map((q, i) => q - a[i]);
  const winding: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const paint = { color };
  if (winding.reduce((sum, q, i) => sum + q * normal[i], 0) < 0) b.quad(a, e, d, c, normal, paint, ink);
  else b.quad(a, c, d, e, normal, paint, ink);
}

/** A level rectangle at height `y`. */
export function flat(b: Bake, x0: number, x1: number, z0: number, z1: number, y: number, color: string, ink: Ink = tag('concrete')) {
  face(b, [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], color, UP, ink);
}

/** A surface whose height changes only along x, sampled into strips. */
export function profile(b: Bake, x0: number, x1: number, z0: number, z1: number, height: (x: number) => number, color: (x: number) => string, strips: number, ink: Ink = tag('soil')) {
  for (let i = 0; i < strips; i++) {
    const a = x0 + (x1 - x0) * i / strips, c = x0 + (x1 - x0) * (i + 1) / strips;
    const ya = height(a), yc = height(c);
    const n: Vec3 = [(ya - yc) / (c - a), 1, 0];
    const length = Math.hypot(...n);
    face(b, [a, ya, z0], [a, ya, z1], [c, yc, z1], [c, yc, z0], color((a + c) / 2), n.map(v => v / length) as Vec3, ink);
  }
}

/** A round metal tube, its segments optionally casting the rail shadows. */
export function tube(b: Bake, spine: Vec3[], radius: number, color: string, shadows?: Segment[], sides = 8) {
  b.tube(spine, spine.map(() => radius), { color }, tag('metal'), sides, true);
  if (shadows) for (let i = 1; i < spine.length; i++) shadows.push({ a: spine[i - 1], b: spine[i], radius });
}

/** Small irregular volumes (shrubs, rocks), rather than camera-facing vegetation cards. */
export function foliage(b: Bake, x: number, y: number, z: number, rx: number, ry: number, rz: number, color: string, seed: number, ink: Ink = tag(LEAVES), rows = 3, columns = 6, dome = false) {
  // Eighteen broad faces keep the mass without spending forty quads per shrub; far ones take fewer. A dome's
  // rings crowd toward its top, so a shrub bedded in the ground shows a rounded crown, not a cone.
  const latitudes = dome && rows === 3 ? [0, 0.24, 0.5, 1] : null;
  const at = (row: number, column: number): Vec3 => {
    const latitude = Math.PI * (latitudes ? latitudes[row] : row / rows), around = Math.PI * 2 * column / columns;
    const jitter = 0.84 + hash2(row, column % columns, seed) * 0.3;
    return [x + rx * Math.sin(latitude) * Math.cos(around) * jitter, y + ry * Math.cos(latitude), z + rz * Math.sin(latitude) * Math.sin(around) * jitter];
  };
  // Normals smooth over the mass (an ellipsoid's, at each corner), so it shades as one rounded crown, not facets.
  const normal = (p: Vec3): Vec3 => {
    const n: Vec3 = [(p[0] - x) / (rx * rx), (p[1] - y) / (ry * ry), (p[2] - z) / (rz * rz)];
    const length = Math.hypot(...n) || 1;
    return [n[0] / length, n[1] / length, n[2] / length];
  };
  const paint = { color };
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = at(row, column), q = at(row + 1, column), d = at(row + 1, column + 1), e = at(row, column + 1);
    const out = [(a[0] + q[0] + d[0] + e[0]) / 4 - x, (a[1] + q[1] + d[1] + e[1]) / 4 - y, (a[2] + q[2] + d[2] + e[2]) / 4 - z];
    const u = [q[0] - a[0], q[1] - a[1], q[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const facing = (u[1] * v[2] - u[2] * v[1]) * out[0] + (u[2] * v[0] - u[0] * v[2]) * out[1] + (u[0] * v[1] - u[1] * v[0]) * out[2];
    const order = facing < 0 ? [a, e, d, a, d, q] : [a, q, d, a, d, e];
    for (const p of order) b.vertex(p, normal(p), paint, ink);
  }
}

/**
 * Plan coordinates in feet along a facade or deck: `u` along it from (x, z) toward (dx, dz), `v` square to it,
 * `y` up. Returns set units.
 */
export function frame(x: number, z: number, dx: number, dz: number) {
  const length = Math.hypot(dx, dz), cos = dx / length, sin = dz / length;
  return (u: number, y: number, v: number): Vec3 => [(x + cos * u - sin * v) * F, y * F, (z + sin * u + cos * v) * F];
}
export type Frame = ReturnType<typeof frame>;

/** A closed box in a frame's coordinates (feet), all six faces in one paint. */
export function prism(b: Bake, p: Frame, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color: string, surface: SurfaceName = 'stucco') {
  const foot = [p(u0, y0, v0), p(u1, y0, v0), p(u1, y0, v1), p(u0, y0, v1)];
  const top = [p(u0, y1, v0), p(u1, y1, v0), p(u1, y1, v1), p(u0, y1, v1)];
  face(b, top[0], top[1], top[2], top[3], color, [0, 1, 0], tag(surface));
  face(b, foot[0], foot[1], foot[2], foot[3], color, [0, -1, 0], tag(surface));
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, a = foot[i], d = foot[j];
    const n: Vec3 = [(d[2] - a[2]) / F, 0, (a[0] - d[0]) / F];
    const length = Math.hypot(...n);
    face(b, a, d, top[j], top[i], color, n.map(v => v / length) as Vec3, tag(surface));
  }
}

/**
 * Vertical pickets through the shared filtered wire shader. Both wire families see only distance along the
 * panel (v = 0), so they coincide as upright bars rather than diamonds, and subpixel bars settle to their
 * coverage instead of sparkling. Each panel maps its gaps onto the bridge's spacing.
 */
export function picketPanel(mesh: Bake, a: Vec3, b: Vec3, height: number, gaps: number) {
  const width = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const normal: Vec3 = [-(b[2] - a[2]) / width, 0, (b[0] - a[0]) / width];
  const corners: Vec3[] = [a, b, [b[0], b[1] + height, b[2]], [a[0], a[1] + height, a[2]]];
  for (const k of [0, 1, 2, 0, 2, 3]) mesh.vertex(corners[k], normal, { color: PICKETS.color }, NO_INK, [k === 1 || k === 2 ? gaps * PICKETS.spacing : 0, 0, 0]);
}

/** Coverage-filtered guards, authored in set units like the shared wireMesh shader. */
export const PICKETS = { spacing: 0.75 * F, radius: 0.022 * F, color: BRIDGE_PICKET };

/**
 * A clump of dry bunch grass rooted at (x, y, z): blades fanned from its root, leaning out and bending over,
 * `height` tall, in straw and tan with the odd green one. Blades are an inch or two wide at the root, as wide as
 * a clump's leaves read, and patterned as leaves by the look.
 */
export function bunch(b: Bake, x: number, y: number, z: number, height: number, colors: readonly string[], seed: number, blades = 12) {
  const ink = tag(LEAVES);
  for (let k = 0; k < blades; k++) {
    const around = k * 2.399 + seed * 0.37;
    const lean = 0.35 + 0.6 * hash2(seed, k, 931);
    const h = height * (0.45 + 0.55 * hash2(seed, k, 932));
    const wide = (0.03 + 0.03 * hash2(seed, k, 933)) * F;
    const cos = Math.cos(around), sin = Math.sin(around);
    const root: Vec3 = [x + cos * 0.08 * F, y, z + sin * 0.08 * F];
    const tip: Vec3 = [root[0] + cos * lean * h, y + h * (1 - 0.25 * lean), root[2] + sin * lean * h];
    const color = colors[(k + seed) % colors.length];
    b.triangle([root[0] - sin * wide, y, root[2] + cos * wide], [root[0] + sin * wide, y, root[2] - cos * wide], tip, [cos * 0.5, 0.8, sin * 0.5], { color }, ink);
  }
}

/**
 * An angular rock or boulder: a squat, uneven polyhedron, a ring of five faces round a broken top, `rx`, `ry`,
 * `rz` its half-sizes, turned and broken its own way by `seed`. Its foot is bedded in the bank or the water, so
 * it has no underside.
 */
export function rock(b: Bake, x: number, y: number, z: number, rx: number, ry: number, rz: number, color: string, seed: number, ink: Ink = tag('concrete')) {
  const sides = 5, turn = hash2(seed, 0, 941) * Math.PI * 2;
  const ring = (level: number, scale: number, lift: number): Vec3[] => Array.from({ length: sides }, (_, k) => {
    const a = turn + (k + 0.3 * hash2(seed, k, 942 + level)) * Math.PI * 2 / sides;
    const r = scale * (0.7 + 0.5 * hash2(seed, k, 945 + level));
    return [x + Math.cos(a) * rx * r, y + ry * (lift + 0.25 * (hash2(seed, k, 948 + level) - 0.5)), z + Math.sin(a) * rz * r];
  });
  const waist = ring(1, 1, -0.3), top = ring(2, 0.6, 0.75);
  const crown: Vec3 = [x + 0.1 * rx * (hash2(seed, 1, 951) - 0.5), y + ry * (0.95 + 0.15 * hash2(seed, 2, 951)), z + 0.1 * rz * (hash2(seed, 3, 951) - 0.5)];
  // Each face turned out from the rock's middle, and wound to it.
  const outward = (pts: Vec3[]): Vec3 => {
    const m = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
    const n: Vec3 = [m[0] - x, (m[1] - y) * 1.4, m[2] - z];
    const l = Math.hypot(...n) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  for (let k = 0; k < sides; k++) {
    const j = (k + 1) % sides;
    face(b, waist[k], waist[j], top[j], top[k], color, outward([waist[k], waist[j], top[j], top[k]]), ink);
    const n = outward([top[k], top[j], crown]);
    const u = [top[j][0] - top[k][0], top[j][1] - top[k][1], top[j][2] - top[k][2]], v = [crown[0] - top[k][0], crown[1] - top[k][1], crown[2] - top[k][2]];
    const facing = (u[1] * v[2] - u[2] * v[1]) * n[0] + (u[2] * v[0] - u[0] * v[2]) * n[1] + (u[0] * v[1] - u[1] * v[0]) * n[2];
    if (facing >= 0) b.triangle(top[k], top[j], crown, n, { color }, ink);
    else b.triangle(top[k], crown, top[j], n, { color }, ink);
  }
}
