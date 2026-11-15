import type { Vec3 } from '../../camera/view';
import type { Bake, Ink } from '../../three/bake';
import { hash2 } from '../setKit';
import { wallQuad, type WallAt, type WallKind } from '../surfaces';
import { EMAGE_FOOT as F } from './emageLayout';
import { UP, tag } from './emageKit';

/**
 * Emage's wear. Upright concrete and stone (risers, curbs, the tiers' ends, the stair's outer wall, the stones'
 * faces, the bridge's piers) carry the look's wall wear (SpotLook.walls), drawn per pixel from where each
 * corner says it is on its wall: splash-back at the foot, a few runs from the top edge, the arris chipped pale.
 * Tones baked into a wall's vertices smear into soft bands, and decals on an upright face fight at a distance,
 * so neither is used there. What lies on the ground is drawn on the decals (the ground's material, a hair
 * proud of it, so shade crosses it): tooled joints, score lines, cracks, tree grates, the grass ragged over
 * the trail's edges. Every fine line is a soft strip, dark in its middle and the paving's own paint at its
 * edges, so far off it settles into a faint tone instead of flickering.
 */

/**
 * An upright face carrying the look's wall wear: corners at its foot (`foot0`, `foot1`) and its top (`top1`,
 * `top0`), `from` where along the wear it starts (set units) so no two walls weather alike. Wound to face `n`.
 */
export function wearFace(b: Bake, foot0: Vec3, foot1: Vec3, top1: Vec3, top0: Vec3, n: Vec3, color: string, ink: Ink, from: number, kind: WallKind = 'cast', use = 0) {
  const run = Math.hypot(foot1[0] - foot0[0], foot1[2] - foot0[2]);
  const h0 = top0[1] - foot0[1], h1 = top1[1] - foot1[1];
  const pts: [Vec3, Vec3, Vec3, Vec3] = [foot0, foot1, top1, top0];
  const at: [WallAt, WallAt, WallAt, WallAt] = [
    { along: from, up: 0, down: h0, use }, { along: from + run, up: 0, down: h1, use },
    { along: from + run, up: h1, down: 0, use }, { along: from, up: h0, down: 0, use },
  ];
  const u = [foot1[0] - foot0[0], foot1[1] - foot0[1], foot1[2] - foot0[2]];
  const v = [top1[0] - foot0[0], top1[1] - foot0[1], top1[2] - foot0[2]];
  const facing = (u[1] * v[2] - u[2] * v[1]) * n[0] + (u[2] * v[0] - u[0] * v[2]) * n[1] + (u[0] * v[1] - u[1] * v[0]) * n[2];
  const order = facing < 0 ? [0, 3, 2, 1] : [0, 1, 2, 3];
  wallQuad(b, order.map(k => pts[k]) as [Vec3, Vec3, Vec3, Vec3], n, { color }, ink, order.map(k => at[k]) as [WallAt, WallAt, WallAt, WallAt], kind);
}

/** A level point on the plan, [x, z]. */
export type Plan = [number, number];

/**
 * A soft line lying on level ground from `a` to `b`, `width` across: `core` paint down its middle, `edge` (the
 * ground's own paint) at its sides, so it fades into the ground and, far off, into a faint tone.
 */
export function softLine(b: Bake, a: Plan, c: Plan, y: number, width: number, edge: string, core: string, ink: Ink = tag('concrete')) {
  const dx = c[0] - a[0], dz = c[1] - a[1], length = Math.hypot(dx, dz);
  if (length <= 0) return;
  const ox = -dz / length * width / 2, oz = dx / length * width / 2;
  const at = (p: Plan, s: number): Vec3 => [p[0] + ox * s, y, p[1] + oz * s];
  for (const [s0, s1] of [[-1, 0], [0, 1]]) {
    const paint = (s: number) => ({ color: s === 0 ? core : edge });
    // Wound to face up whichever way the line runs.
    const pts = [at(a, s0), at(a, s1), at(c, s1), at(c, s0)];
    const paints = [paint(s0), paint(s1), paint(s1), paint(s0)];
    const up = (pts[1][0] - pts[0][0]) * (pts[2][2] - pts[0][2]) - (pts[1][2] - pts[0][2]) * (pts[2][0] - pts[0][0]) < 0;
    const order = up ? [0, 1, 2, 3] : [0, 3, 2, 1];
    b.quadCorners(pts[order[0]], pts[order[1]], pts[order[2]], pts[order[3]], UP, order.map(k => paints[k]) as [{ color: string }, { color: string }, { color: string }, { color: string }], ink);
  }
}

/** A crooked crack wandering across level ground from `a` for `length` along `angle` (radians from +x), as a soft line. */
export function crack(b: Bake, a: Plan, angle: number, length: number, y: number, edge: string, core: string, seed: number, ink: Ink = tag('concrete')) {
  const parts = 7;
  let prev: Plan = a;
  for (let k = 1; k <= parts; k++) {
    const turn = angle + 0.5 * (hash2(seed, k, 801) - 0.5);
    const step = length / parts;
    const next: Plan = [prev[0] + Math.cos(turn) * step, prev[1] + Math.sin(turn) * step];
    softLine(b, prev, next, y, (0.07 + 0.05 * hash2(seed, k, 802)) * F, edge, core, ink);
    prev = next;
  }
}

/**
 * A round flat disc on level ground (a tree grate, a stain, a patch of foam), `r` across (`stretch` times that
 * along z), `rim` at its edge and `center` in its middle, its outline `ragged` (0-1).
 */
export function disc(b: Bake, x: number, z: number, y: number, r: number, center: string, rim: string, ink: Ink, seed = 0, ragged = 0, stretch = 1, around = 12) {
  const mid: Vec3 = [x, y, z];
  const at = (j: number): Vec3 => {
    const a = (j / around) * Math.PI * 2, rr = r * (1 - ragged + ragged * 1.6 * hash2(seed, j % around, 811));
    return [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr * stretch];
  };
  for (let k = 0; k < around; k++) {
    b.vertex(mid, UP, { color: center }, ink);
    b.vertex(at(k + 1), UP, { color: rim }, ink);
    b.vertex(at(k), UP, { color: rim }, ink);
  }
}

/**
 * Grass grown ragged over a straight edge of paving or dirt: from `a` to `b` along the edge, teeth of `color`
 * reaching up to `reach` over it on the side `toward` (+1 left of a→b, -1 right), each its own length.
 */
export function raggedEdge(b: Bake, a: Plan, c: Plan, y: number, reach: number, toward: number, color: string, ink: Ink, seed: number, behind = 0.4 * F) {
  const dx = c[0] - a[0], dz = c[1] - a[1], length = Math.hypot(dx, dz);
  const ux = dx / length, uz = dz / length, ox = -uz * toward, oz = ux * toward;
  const teeth = Math.max(2, Math.round(length / (1.8 * F)));
  const point = (s: number, out: number): Vec3 => [a[0] + ux * s + ox * out, y, a[1] + uz * s + oz * out];
  for (let k = 0; k < teeth; k++) {
    const s0 = length * k / teeth, s1 = length * (k + 1) / teeth;
    const tip = reach * (0.15 + 0.85 * hash2(seed, k, 821) ** 1.5);
    const mid = s0 + (s1 - s0) * (0.25 + 0.5 * hash2(seed, k, 822));
    const pts = [point(s0, -behind), point(s1, -behind), point(mid, tip)];
    // A fan from the first corner, each triangle wound to face up.
    for (let i = 1; i + 1 < pts.length; i++) {
      const p = pts[0], q = pts[i], r = pts[i + 1];
      const up = (q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0]) < 0;
      if (up) b.triangle(p, q, r, UP, { color }, ink);
      else b.triangle(p, r, q, UP, { color }, ink);
    }
  }
}
