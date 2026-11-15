import type { Vec3 } from '../camera/view';
import type { Bake, Ink } from '../three/bake';

/**
 * Pieces every spot drawn under the realistic look (sets/surfaces.ts) bakes with, in set units. Spot kits
 * (`<spot>Kit.ts`) re-export what they use beside their own units, inks and palettes, so a new spot imports
 * these rather than copying them.
 */

export { mixHex } from '../math';

const UP: Vec3 = [0, 1, 0];

/** The unit normal of the plane through three points, wound counter-clockwise seen from outside. */
export function normalOf(a: Vec3, c: Vec3, d: Vec3): Vec3 {
  const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const m = Math.hypot(...n) || 1;
  return [n[0] / m, n[1] / m, n[2] / m];
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

/** Deterministic value noise in [0, 1), feet in. */
export function valueNoise(x: number, z: number) {
  const hash = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
