import type { Vec3 } from '../../camera/view';
import { NO_INK, type Bake, type Ink, type Paint } from '../../three/bake';
import { mixHex, normalOf, solidBox, tag, part, tube, valueNoise } from '../wallenberg/wallenbergKit';
import { wallQuad, type WallAt } from '../surfaces';
import { MIAMI_FOOT } from './miamiLayout';

/**
 * Shared pieces for Triangle Bank's bake under the realistic look (light: 'shader'): paint is the authored,
 * sunlit colour, laid flat, and the look lights and textures each face by its surface (sets/surfaces.ts). The
 * generic helpers are Wallenberg's kit; the rest place faces by plan corners, as the park is laid out.
 */

export { mixHex, normalOf, solidBox, tag, part, tube, valueNoise };

export const F = MIAMI_FOOT;
export const INCH = MIAMI_FOOT / 12;
export const UP: Vec3 = [0, 1, 0];
/** Foliage masses, leaves patterned on them in three dimensions (solid 13, the look's `foliage`). */
export const LEAVES: Ink = { ...NO_INK, solid: 13 };
/** Painted block and stuccoed walls far off read as the look's stucco. */
export const STUCCO = tag('stucco');
/** Cast and board-formed concrete, pavers and caps: aggregate, broom finish, stains. */
export const CONCRETE = tag('concrete');
/** Tower glazing, and the bay, reflecting the sky. */
export const GLASS = tag('glass');
/** Light poles, bench frames, bins, railings. */
export const METAL = tag('metal');
/** The boulevard, the drive and the car park. */
export const ASPHALT = tag('asphalt');
/** Lawns and the median: mown turf, browner where worn. */
export const GRASS = tag('grass');
/** Mulched beds and pot soil. */
export const SOIL = tag('soil');

export type Plan = [number, number];
export type RailShadow = { a: Vec3; b: Vec3; radius: number };
export type ShadowBox = { min: Vec3; max: Vec3; yaw?: number };

/** A flat convex polygon, fanned from its first corner and wound to face `n`, in one paint. */
export function poly(b: Bake, pts: Vec3[], n: Vec3, color: string, ink: Ink = CONCRETE) {
  const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
  const v = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
  const facing = (u[1] * v[2] - u[2] * v[1]) * n[0] + (u[2] * v[0] - u[0] * v[2]) * n[1] + (u[0] * v[1] - u[1] * v[0]) * n[2] >= 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    if (facing) b.triangle(pts[0], pts[i], pts[i + 1], n, { color }, ink);
    else b.triangle(pts[0], pts[i + 1], pts[i], n, { color }, ink);
  }
}

/** A level polygon at height `y`, from plan corners. */
export function level(b: Bake, plan: Plan[], y: number, color: string, ink: Ink = CONCRETE) {
  poly(b, plan.map(([x, z]) => [x, y, z] as Vec3), UP, color, ink);
}

/** A face turned up toward the sky whichever way its corners wind. */
export function upward(a: Vec3, c: Vec3, d: Vec3): Vec3 {
  const n = normalOf(a, c, d);
  return n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
}

/**
 * How a wall weathers under the look's wall wear (SpotLook.walls, drawn per pixel): whether it is painted (it
 * flakes back to bare concrete) or cast; `from`, where along the wear it starts (set units), so no two walls
 * weather alike; `ground(s)`, the height of the ground against it at `s`, if not its own foot (a lawn mounded
 * against a deck's face), or null where it stands clear of any; `use(s)`, how hard boards hit it there (0-1).
 */
export interface WallWear {
  painted?: boolean;
  from?: number;
  ground?: ((s: number) => number) | null;
  use?: (s: number) => number;
}

/**
 * A plumb wall from plan point `a` to `c`, `y0` up to `y1` (a height, or one per end), facing `out`, its paint
 * baked per vertex by `tone(s, t, y)`: `s` along it from `a` (set units), `t` up it (0 foot, 1 top), `y` its height. The wall is cut
 * into columns `step` wide and the rows `rows`, so its tone can drift across it. With `wear` its faces carry the
 * look's wall wear, which draws dirt, runs, flaked paint and form joints per pixel: tones baked into the
 * vertices smear into soft bands, and decals fight on an upright face at a distance.
 */
export function toneWall(
  b: Bake, a: Plan, c: Plan, y0: number | [number, number], y1: number | [number, number], out: Vec3,
  tone: (s: number, t: number, y: number) => string, ink: Ink = CONCRETE,
  { step = 2 * F, rows = [0, 1], wear = undefined as WallWear | undefined } = {},
) {
  const length = Math.hypot(c[0] - a[0], c[1] - a[1]);
  if (length <= 0) return;
  const [a0, c0] = typeof y0 === 'number' ? [y0, y0] : y0;
  const [a1, c1] = typeof y1 === 'number' ? [y1, y1] : y1;
  const ss = [0];
  for (let s = step; s < length - 1e-6; s += step) ss.push(s);
  ss.push(length);
  const foot = (s: number) => a0 + ((c0 - a0) * s) / length, top = (s: number) => a1 + ((c1 - a1) * s) / length;
  const at = (s: number, t: number): Vec3 => {
    const k = s / length;
    return [a[0] + (c[0] - a[0]) * k, foot(s) + (top(s) - foot(s)) * t, a[1] + (c[1] - a[1]) * k];
  };
  // Standing clear of the ground, a wall has no foot for dirt to gather at: the ground is far below it.
  const ground = wear?.ground === null ? () => -1e3 * F : wear?.ground ?? foot;
  const where = (s: number, y: number): WallAt => ({ along: (wear?.from ?? 0) + s, up: y - ground(s), down: top(s) - y, use: wear?.use?.(s) });
  // Wound so the face looks along `out`.
  const n0 = normalOf(at(0, 0), at(length, 0), at(length, 1));
  const flip = n0[0] * out[0] + n0[1] * out[1] + n0[2] * out[2] < 0;
  for (let i = 0; i + 1 < ss.length; i++) {
    const [s0, s1] = [ss[i], ss[i + 1]];
    for (let r = 0; r + 1 < rows.length; r++) {
      const [t0, t1] = [rows[r], rows[r + 1]];
      const corners = [[s0, t0], [s1, t0], [s1, t1], [s0, t1]] as const;
      const order = flip ? [0, 3, 2, 1] : [0, 1, 2, 3];
      const pts = order.map((k) => at(...corners[k])) as [Vec3, Vec3, Vec3, Vec3];
      const paints = order.map((k) => ({ color: tone(corners[k][0], corners[k][1], at(...corners[k])[1]) })) as [Paint, Paint, Paint, Paint];
      if (wear) wallQuad(b, pts, out, paints, ink, order.map((k) => where(corners[k][0], at(...corners[k])[1])) as [WallAt, WallAt, WallAt, WallAt], wear.painted === false ? 'cast' : 'painted');
      else b.quadCorners(...pts, out, paints, ink);
    }
  }
}

/** A flat-painted box on its faces' own surface (Wallenberg's solidBox), its foot at `y0`. */
export function block(b: Bake, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, side: string, top: string, ink: Ink = CONCRETE, faces = 'tbfkle') {
  solidBox(b, [Math.min(x0, x1), y0, Math.min(z0, z1)], [Math.max(x0, x1), y1, Math.max(z0, z1)], side, top, ink, faces);
}

/** Deterministic value noise in feet, for broad patches of tone. */
export const patchNoise = (x: number, z: number, scale: number, seed = 0) => valueNoise(x / (scale * F) + seed * 13.1, z / (scale * F) + seed * 7.7);
