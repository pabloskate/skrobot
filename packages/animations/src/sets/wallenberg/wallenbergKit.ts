import type { Vec3 } from '../../camera/view';
import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { SURFACE, type SurfaceName } from '../surfaces';
import { SET_FOOT } from './wallenbergLayout';
import { normalOf } from '../lookKit';

export { floor, mixHex, normalOf, solidBox, valueNoise } from '../lookKit';

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

/** A flat face through four corners, its normal from their winding (counter-clockwise seen from outside). */
export function face(b: Bake, a: Vec3, c: Vec3, d: Vec3, e: Vec3, color: string, ink: Ink = NO_INK, n: Vec3 = normalOf(a, c, d)) {
  b.quad(a, c, d, e, n, { color }, ink);
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
