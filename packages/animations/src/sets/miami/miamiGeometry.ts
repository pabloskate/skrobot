import { lambert, tone } from '../../camera/camera';
import type { Vec3 } from '../../camera/view';
import { mixHex } from '../../math';
import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { hash2 } from '../setKit';
import {
  MIAMI_FOOT as F, MIAMI_PEDESTAL_HALF, MIAMI_PEDESTAL_X0, MIAMI_PEDESTAL_X1,
  MIAMI_PLAZA_HALF, MIAMI_PLAZA_Y, MIAMI_RIM_CURVE, MIAMI_RIM_HEIGHT, MIAMI_RIM_WIDTH, MIAMI_SLAB_APEX_X, MIAMI_SLAB_APEX_Y, MIAMI_SLAB_GRADE,
  MIAMI_SLAB_LIP_X, MIAMI_SLAB_LIP_Y, MIAMI_SLAB_SIDE, MIAMI_SLAB_THICK, MIAMI_TERRACE_BACK,
  MIAMI_TERRACE_HALF, MIAMI_TERRACE_SHOULDER, MIAMI_WALL_THICK, MIAMI_WALL_TOP, MIAMI_WALL_X,
  miamiLawn, miamiRim, miamiSlabHalf, miamiSlabTop, miamiTerraceHalf,
} from './miamiLayout';

/**
 * Triangle Bank's redesigned park: a pointed deck with a rectangular rear,
 * plain sloping bank, garden seating and the downtown skyline beyond. No memorial art,
 * inscriptions or tower. Riding surfaces stay in `ground`, matched to
 * miamiSurface; decorative detail is baked separately into `props`.
 */

const PLAZA = MIAMI_PLAZA_Y;
const H = MIAMI_PLAZA_HALF;
const TERRACE_HALF = MIAMI_TERRACE_HALF;
const BACK = MIAMI_TERRACE_BACK;
const FAR = 2400 * F;
/** Faces meant to read as flush stand this far apart, so they never z-fight (see leapOfFaith3d.ts). */
const STAND_OFF = 1;

/**
 * Biscayne Boulevard runs north–south, parallel to the plaza's right-hand
 * stepped side (the line bears 225°, south-west, so `along` it is south
 * and `across` it west, away from the park).
 */
const BLVD_ALONG: [number, number] = [Math.SQRT1_2, -Math.SQRT1_2];
const BLVD_ACROSS: [number, number] = [Math.SQRT1_2, Math.SQRT1_2];
/** The boulevard's cross-section, west of the terrace tip (aerial): its broad east promenade, kerb, median, far kerb and sidewalk. */
const BLVD = { sidewalk: 66 * F, kerb: 100 * F, median: 150 * F, medianEnd: 164 * F, farKerb: 212 * F, farEdge: 228 * F };
const blvd = (along: number, across: number, y: number): Vec3 =>
  [BLVD_ALONG[0] * along + BLVD_ACROSS[0] * across, y, BLVD_ALONG[1] * along + BLVD_ACROSS[1] * across];

const PALE = '#b3bcae';
const PALE_TOP = '#d2d0be';
const BANK = '#929f9c';
const PAVER = '#aea999';
const GRASS = '#6f8f47';
const WALK = '#c9c4b5';

const UP: Vec3 = [0, 1, 0];
const lit = (color: string, n: Vec3): Paint => ({ color: tone(color, lambert({ x: n[0], y: -n[1], z: n[2] })) });
const ink = (id: number, priority = 5, width = 0.15): Ink => ({ id, priority, width, kind: INK_PROP, solid: 6 });
const TERRACE_INK = ink(30);
const RIM_INK = ink(36);
const WALL_INK = ink(40);
const SLAB_INK = ink(50, 6);
const STRUCTURE_INK = ink(70, 4);
const LEAVES: Ink = { ...NO_INK, solid: 13 };

type Segment = { a: Vec3; b: Vec3; radius: number };
type ShadowBox = { min: Vec3; max: Vec3 };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** A flat convex polygon, fanned from its first corner and wound to face `n`. */
function poly(b: Bake, pts: Vec3[], n: Vec3, paint: Paint, detail: Ink = NO_INK) {
  const facing = dot(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])), n) >= 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    if (facing) b.triangle(pts[0], pts[i], pts[i + 1], n, paint, detail);
    else b.triangle(pts[0], pts[i + 1], pts[i], n, paint, detail);
  }
}

/** A level polygon at height `y`, from plan corners. */
function level(b: Bake, plan: Array<[number, number]>, y: number, color: string, detail: Ink = NO_INK) {
  poly(b, plan.map(([x, z]) => [x, y, z] as Vec3), UP, lit(color, UP), detail);
}

/** A plumb wall face between two plan points, from `y0` up to `y1` (each a height or one per end). */
function face(b: Bake, a: [number, number], c: [number, number], y0: number | [number, number], y1: number | [number, number], color: string, detail: Ink = NO_INK, out?: Vec3) {
  const [a0, c0] = typeof y0 === 'number' ? [y0, y0] : y0;
  const [a1, c1] = typeof y1 === 'number' ? [y1, y1] : y1;
  const n = out ?? unit([c[1] - a[1], 0, a[0] - c[0]]);
  poly(b, [[a[0], a0, a[1]], [c[0], c0, c[1]], [c[0], c1, c[1]], [a[0], a1, a[1]]], n, lit(color, n), detail);
}

export function buildMiamiGeometry() {
  const ground = new Bake();
  const props = new Bake();
  const railSegments: Segment[] = [];
  const shadowBoxes: ShadowBox[] = [];
  buildPark(ground, props);
  buildPlaza(ground, props);
  buildLawns(ground, props);
  buildTerrace(ground, props, shadowBoxes);
  buildSlab(ground, props, shadowBoxes);
  buildBoulevard(props);
  buildParking(props);
  buildSkyline(props);
  return { ground: ground.geometry(), props: props.geometry(), railSegments, shadowBoxes };
}

/**
 * The park at the plaza's level, everywhere but the plaza itself and the
 * raised lawns: walks, grass, and the boulevard's near side. One floor:
 * the pieces tile the plane round the plaza and the lawns' rectangle.
 */
function buildPark(ground: Bake, props: Bake) {
  const pieces: Array<Array<[number, number]>> = [
    [[-FAR, -FAR], [MIAMI_WALL_X, -FAR], [MIAMI_WALL_X, -H], [-FAR, -H]],
    [[-FAR, H], [MIAMI_WALL_X, H], [MIAMI_WALL_X, FAR], [-FAR, FAR]],
    [[-FAR, -H], [BACK, -H], [BACK, H], [-FAR, H]],
    [[MIAMI_WALL_X, -FAR], [FAR, -FAR], [FAR, 0], [MIAMI_WALL_X + H, 0], [MIAMI_WALL_X, -H]],
    [[MIAMI_WALL_X, H], [MIAMI_WALL_X + H, 0], [FAR, 0], [FAR, FAR], [MIAMI_WALL_X, FAR]],
  ];
  for (const piece of pieces) level(ground, piece, PLAZA, GRASS);
  // Pale walks round the lawns' rectangle and behind the terrace.
  const walk = (plan: Array<[number, number]>) => level(props, plan, PLAZA + STAND_OFF, WALK);
  walk([[BACK - 16 * F, -H - 14 * F], [MIAMI_WALL_X, -H - 14 * F], [MIAMI_WALL_X, -H], [BACK - 16 * F, -H]]);
  walk([[BACK - 16 * F, H], [MIAMI_WALL_X, H], [MIAMI_WALL_X, H + 14 * F], [BACK - 16 * F, H + 14 * F]]);
  walk([[BACK - 16 * F, -H], [BACK, -H], [BACK, H], [BACK - 16 * F, H]]);
  // Shade trees and date palms in the park beyond.
  for (let k = 0; k < 5; k++) {
    const x = BACK - (30 + hash2(k, 1, 301) * 60) * F, z = (-100 + k * 48 + hash2(k, 2, 302) * 14) * F;
    palm(props, [x, PLAZA, z], (24 + hash2(k, 3, 303) * 10) * F, k % 3 === 0 ? 'coconut' : 'date', k + 40);
  }
}

/**
 * The uniform stone plaza: the right isosceles triangle in front of the wall,
 * its short sides stepped (a sawtooth of raised planters), square pavers
 * with grout lines, and round concrete pots.
 */
function buildPlaza(ground: Bake, props: Bake) {
  level(ground, [[MIAMI_WALL_X, -H], [MIAMI_WALL_X + H, 0], [MIAMI_WALL_X, H]], PLAZA, PAVER);
  const y = PLAZA + 0.3;
  const reach = (x: number) => H - (x - MIAMI_WALL_X);
  // Eight-inch pavers, square to the wall: grout lines either way across the triangle.
  const P = (8 / 12) * F;
  const grout = '#979487';
  for (let x = MIAMI_WALL_X + P; x < MIAMI_WALL_X + H; x += P) {
    const r = reach(x);
    level(props, [[x - 0.5, -r], [x + 0.5, -r], [x + 0.5, r], [x - 0.5, r]], y, grout);
  }
  for (let z = -H + P; z < H; z += P) {
    const end = MIAMI_WALL_X + H - Math.abs(z);
    if (end - MIAMI_WALL_X < 0.5 * F) continue;
    level(props, [[MIAMI_WALL_X, z - 0.5], [end, z - 0.5], [end, z + 0.5], [MIAMI_WALL_X, z + 0.5]], y, grout);
  }
  // The stepped short sides: raised pale planters, one per step, with the
  // paving filling each step out to it.
  const STEP = 10 * F;
  for (const side of [-1, 1]) {
    for (let k = 0; k * STEP < H; k++) {
      const x0 = MIAMI_WALL_X + k * STEP, x1 = Math.min(MIAMI_WALL_X + H, x0 + STEP);
      const edge = reach(x0);
      // The tooth of paving between the diagonal and the step.
      level(props, [[x0, side * edge], [x1, side * edge], [x1, side * reach(x1)]], PLAZA + STAND_OFF, PAVER);
      const z0 = side * edge, z1 = side * (edge + 7 * F);
      const zs: [number, number] = [Math.min(z0, z1), Math.max(z0, z1)];
      const top = PLAZA + 1.5 * F;
      props.box([x0, PLAZA, zs[0]], [x1, top, zs[1]], PALE, PALE_TOP, WALL_INK, 'fkle');
      level(props, [[x0 + 0.5 * F, zs[0] + 0.5 * F], [x1 - 0.5 * F, zs[0] + 0.5 * F], [x1 - 0.5 * F, zs[1] - 0.5 * F], [x0 + 0.5 * F, zs[1] - 0.5 * F]], top - 1.5, '#4f5f3a');
      for (const [x, w] of [[x0 + 0.5 * F, 0.5 * F], [x1 - 0.5 * F, -0.5 * F]] as const) {
        level(props, [[x, zs[0]], [x + w, zs[0]], [x + w, zs[1]], [x, zs[1]]], top, PALE_TOP);
      }
      for (const z of [zs[0], zs[1] - 0.5 * F]) level(props, [[x0 + 0.5 * F, z], [x1 - 0.5 * F, z], [x1 - 0.5 * F, z + 0.5 * F], [x0 + 0.5 * F, z + 0.5 * F]], top, PALE_TOP);
      shrubMound(props, [(x0 + x1) / 2, top - 1.5, side * (edge + 3.5 * F)], 3.2 * F, k * 2 + (side > 0 ? 1 : 0), k % 3 === 1 ? '#b8323a' : null);
    }
  }
  // Round concrete pots along the wall, clear of the line.
  for (const z of [-46, -32, -18, 18, 32, 46]) pot(props, MIAMI_WALL_X + 2.2 * F, z * F, Math.abs(z) % 4 === 2 ? '#c4384a' : null, z);
}

/** A round planter pot, about 2½ ft across, with a clipped shrub (or flowers) in it. */
function pot(b: Bake, x: number, z: number, flowers: string | null, seed: number) {
  const r = 1.25 * F, h = 2 * F;
  const ring = (radius: number, y: number) => Array.from({ length: 14 }, (_, k) => {
    const a = (k / 14) * Math.PI * 2;
    return [x + Math.cos(a) * radius, y, z + Math.sin(a) * radius] as Vec3;
  });
  const lo = ring(r * 0.86, PLAZA), hi = ring(r, PLAZA + h);
  for (let k = 0; k < 14; k++) {
    const a = ((k + 0.5) / 14) * Math.PI * 2;
    const n = unit([Math.cos(a), 0.12, Math.sin(a)]);
    poly(b, [lo[k], lo[(k + 1) % 14], hi[(k + 1) % 14], hi[k]], n, lit('#d2cdbd', n), STRUCTURE_INK);
  }
  poly(b, hi, UP, lit('#5a4b3a', UP));
  shrubMound(b, [x, PLAZA + h - 2, z], 1.6 * F, seed + 70, flowers);
}

/**
 * A clipped shrub: a few faceted lobes of leaves, and flowers dotted over
 * the top when `flowers` is a color (the red and blue beds in the clips).
 */
function shrubMound(b: Bake, at: Vec3, radius: number, seed: number, flowers: string | null, height = 0.8) {
  const greens = ['#4b6b3b', '#58793f', '#3f5f37', '#62824a'];
  for (let lobe = 0; lobe < 4; lobe++) {
    const a = lobe * 2.4 + seed;
    const cx = at[0] + Math.cos(a) * radius * 0.35, cz = at[2] + Math.sin(a) * radius * 0.35;
    const r = radius * (0.55 + 0.2 * hash2(seed, lobe, 341));
    const cy = at[1] + r * height * 0.55;
    for (let ring = 0; ring < 3; ring++) {
      const l0 = -0.2 + ring * 0.6, l1 = l0 + 0.6;
      const point = (lat: number, lon: number): Vec3 => [cx + Math.cos(lat) * Math.cos(lon) * r, cy + Math.sin(lat) * r * height, cz + Math.cos(lat) * Math.sin(lon) * r];
      for (let k = 0; k < 7; k++) {
        const o0 = (k / 7) * Math.PI * 2, o1 = ((k + 1) / 7) * Math.PI * 2;
        const n = unit([Math.cos((l0 + l1) / 2) * Math.cos((o0 + o1) / 2), Math.sin((l0 + l1) / 2), Math.cos((l0 + l1) / 2) * Math.sin((o0 + o1) / 2)]);
        const pts = ring === 2 ? [point(l0, o0), point(l0, o1), point(Math.PI / 2, 0)] : [point(l0, o0), point(l0, o1), point(l1, o1), point(l1, o0)];
        poly(b, pts, n, lit(greens[(k + ring + lobe) % greens.length], n), LEAVES);
      }
      if (flowers) {
        for (let k = 0; k < 5; k++) {
          const lat = 0.5 + hash2(seed, lobe * 9 + k, 342) * 0.9, lon = hash2(seed, lobe * 9 + k, 343) * Math.PI * 2;
          const p = point(lat, lon), s = 2.2;
          b.triangle([p[0] - s, p[1] + 0.6, p[2]], [p[0] + s, p[1] + 0.6, p[2] - s * 0.6], [p[0], p[1] + 0.6, p[2] + s], UP, { color: flowers }, NO_INK);
        }
      }
    }
  }
}

/**
 * The lawns either side of the terrace, mounding up from the planter walls
 * that ring them, with hedges along the terrace, flowering shrubs, a curved
 * bed on each side, and date palms. The mesh follows the terrace's faces
 * exactly, so the lawn meets each one along a clean edge.
 */
function buildLawns(ground: Bake, props: Bake) {
  // Rows break at the tip: behind it the lawn's inner edge is the terrace's
  // face; in front of it, the middle of the strip up to the wall.
  const x0 = BACK + MIAMI_WALL_THICK, x1 = MIAMI_WALL_X - MIAMI_WALL_THICK;
  const zEnd = H - MIAMI_WALL_THICK;
  const cols = 18;
  const xs = [...Array.from({ length: 30 }, (_, i) => x0 * (1 - i / 29)), MIAMI_TERRACE_SHOULDER, x1].sort((a, b) => a - b);
  const rows = xs.length - 1;
  const rowX = (a: number) => xs[a];
  for (const side of [-1, 1]) {
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const corner = (a: number, c: number): Vec3 => {
        const x = rowX(a);
        const from = Math.max(0, miamiTerraceHalf(Math.min(0, x)));
        const z = side * (from + ((zEnd - from) * c) / cols);
        return [x, miamiLawn(x, z), z];
      };
      const p = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
      const n = unit(cross(sub(p[2], p[0]), sub(p[3], p[1])));
      const up: Vec3 = n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
      const shade = hash2(i, j + side * 40, 351) < 0.5 ? GRASS : '#77964c';
      poly(ground, p, up, lit(shade, up));
    }
  }
  // The planter walls round the lawns: the plaza's, the two ends and the back.
  const wallTop = (plan: Array<[number, number]>) => level(ground, plan, MIAMI_WALL_TOP, PALE_TOP, WALL_INK);
  wallTop([[MIAMI_WALL_X - MIAMI_WALL_THICK, -H], [MIAMI_WALL_X, -H], [MIAMI_WALL_X, H], [MIAMI_WALL_X - MIAMI_WALL_THICK, H]]);
  face(ground, [MIAMI_WALL_X, -H], [MIAMI_WALL_X, H], PLAZA, MIAMI_WALL_TOP, PALE, WALL_INK, [1, 0, 0]);
  for (const side of [-1, 1]) {
    const zo = side * H, zi = side * (H - MIAMI_WALL_THICK);
    wallTop([[BACK, zi], [MIAMI_WALL_X - MIAMI_WALL_THICK, zi], [MIAMI_WALL_X - MIAMI_WALL_THICK, zo], [BACK, zo]]);
    face(ground, [BACK, zo], [MIAMI_WALL_X, zo], PLAZA, MIAMI_WALL_TOP, PALE, WALL_INK, [0, 0, side]);
    face(ground, [MIAMI_WALL_X, zo], [MIAMI_WALL_X, zo - side * 0.01], PLAZA, MIAMI_WALL_TOP, PALE, WALL_INK, [1, 0, 0]);
    const zt = side * TERRACE_HALF;
    wallTop([[BACK, zt], [BACK + MIAMI_WALL_THICK, zt], [BACK + MIAMI_WALL_THICK, zi], [BACK, zi]]);
    face(ground, [BACK, zt], [BACK, zo], PLAZA, MIAMI_WALL_TOP, PALE, WALL_INK, [-1, 0, 0]);
  }
  // Panel joints down the plaza's wall, and a grubby strip along its foot.
  for (let z = -H + 5 * F; z < H; z += 5 * F) {
    face(props, [MIAMI_WALL_X + STAND_OFF, z], [MIAMI_WALL_X + STAND_OFF, z + 0.6], PLAZA, MIAMI_WALL_TOP - 0.5, '#b4b2a6', NO_INK, [1, 0, 0]);
  }
  face(props, [MIAMI_WALL_X + STAND_OFF, -H], [MIAMI_WALL_X + STAND_OFF, H], PLAZA, PLAZA + 0.22 * F, '#c2bdac', NO_INK, [1, 0, 0]);

  // Hedges along the terrace's faces, kept back from the tip, and red and
  // blue flowering shrubs along the inside of the plaza's wall.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const x = -(12 + k * 4.2) * F;
      const z = side * (miamiTerraceHalf(x) + 2.6 * F);
      const y = miamiLawn(x, z);
      hedge(props, [x, y, z], side, 4.3 * F, 1.7 * F + hash2(k, side, 361) * 0.4 * F, k * 2 + (side > 0 ? 1 : 0));
    }
    for (let k = 0; k < 9; k++) {
      const z = side * (11 + k * 5) * F, x = MIAMI_WALL_X - MIAMI_WALL_THICK - 2.4 * F;
      shrubMound(props, [x, miamiLawn(x, z) - 3, z], 2.6 * F, k + (side > 0 ? 20 : 0), k % 2 === 0 ? '#c33440' : '#5d55b4');
    }
    // The curved bed: a crescent of flowers with a mound of shrubs inside.
    const cx = -34 * F, cz = side * 34 * F, r = 13 * F;
    for (let k = 0; k < 22; k++) {
      const a0 = Math.PI * (0.25 + (k / 22) * 1.2), a1 = Math.PI * (0.25 + ((k + 1) / 22) * 1.2);
      const point = (a: number, rr: number): Vec3 => {
        const x = cx + Math.cos(a) * rr, z = cz + side * Math.sin(a) * rr;
        return [x, miamiLawn(x, z) + 0.6, z];
      };
      poly(props, [point(a0, r), point(a1, r), point(a1, r - 2.2 * F), point(a0, r - 2.2 * F)], UP, lit(k % 4 < 2 ? '#7b4fa1' : '#d0b23c', UP));
      poly(props, [point(a0, r - 2.2 * F), point(a1, r - 2.2 * F), point(a1, r - 4 * F), point(a0, r - 4 * F)], UP, lit('#5b4a39', UP));
    }
    for (let k = 0; k < 4; k++) {
      const x = cx + (k - 1.5) * 2.4 * F, z = cz - side * 4 * F + side * hash2(k, side, 371) * 3 * F;
      shrubMound(props, [x, miamiLawn(x, z) - 3, z], 3.3 * F, k + 50 + side, k === 2 ? '#c33440' : null, 1);
    }
    // Canary Island date palms on the mounds, each in a ring of mulch.
    for (const [x, z, h] of [[-22, 44, 22], [-48, 50, 27], [-62, 42, 24]] as const) {
      const px = x * F, pz = side * z * F, py = miamiLawn(px, pz);
      for (let k = 0; k < 12; k++) {
        const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2;
        const rim = (a: number): Vec3 => [px + Math.cos(a) * 4 * F, miamiLawn(px + Math.cos(a) * 4 * F, pz + Math.sin(a) * 4 * F) + 0.5, pz + Math.sin(a) * 4 * F];
        poly(props, [[px, py + 0.5, pz], rim(a0), rim(a1)], UP, lit('#6a5240', UP));
      }
      palm(props, [px, py, pz], h * F, 'date', x * 3 + side);
    }
  }
}

/** A clipped hedge along the terrace: a lumpy block of leaves, `length` long. */
function hedge(b: Bake, at: Vec3, side: number, length: number, height: number, seed: number) {
  // Along the terrace's face, which runs back from the tip at 30° off the line.
  const along: [number, number] = [-Math.cos(Math.PI / 6), side * Math.sin(Math.PI / 6)];
  const out: [number, number] = [-along[1], along[0]];
  const depth = 3 * F;
  const greens = ['#46663a', '#52733f', '#3d5d35'];
  const p = (s: number, d: number, y: number): Vec3 => [at[0] + along[0] * s + out[0] * d, at[1] + y, at[2] + along[1] * s + out[1] * d];
  const segs = 4;
  for (let k = 0; k < segs; k++) {
    const s0 = (k / segs - 0.5) * length, s1 = ((k + 1) / segs - 0.5) * length;
    const h = height * (0.92 + 0.12 * hash2(seed, k, 381));
    const d0 = -depth / 2, d1 = depth / 2;
    const color = greens[(seed + k) % greens.length];
    poly(b, [p(s0, d0, h), p(s1, d0, h), p(s1, d1, h * 0.96), p(s0, d1, h * 0.96)], UP, lit(color, UP), LEAVES);
    for (const [d, sign] of [[d0, -1], [d1, 1]] as const) {
      const n: Vec3 = [out[0] * sign, 0.25, out[1] * sign];
      poly(b, [p(s0, d * 1.1, -4), p(s1, d * 1.1, -4), p(s1, d, h * 0.97), p(s0, d, h * 0.97)], n, lit(color, n), LEAVES);
    }
    for (const s of [s0, s1]) {
      const n: Vec3 = [along[0] * Math.sign(s), 0.25, along[1] * Math.sign(s)];
      poly(b, [p(s, d0 * 1.1, -4), p(s, d1 * 1.1, -4), p(s, d1, h * 0.96), p(s, d0, h)], n, lit(color, n), LEAVES);
    }
  }
}

/** The original five-sided deck, its rideable rim, and low garden seating. */
function buildTerrace(ground: Bake, props: Bake, shadows: ShadowBox[]) {
  // Inset the five edges analytically, matching miamiTerraceInset.
  const ring = (d: number): Vec3[] => {
    const half = TERRACE_HALF - d;
    const shoulder = -2 * (d + half * Math.cos(Math.PI / 6));
    const y = miamiRim(d);
    return [[-2 * d, y, 0], [shoulder, y, -half], [BACK + d, y, -half], [BACK + d, y, half], [shoulder, y, half]];
  };
  // The riding surface is worn grey; the rim stays bright white.
  level(ground, ring(MIAMI_RIM_WIDTH).map(([x, , z]) => [x, z] as [number, number]), 0, '#c8c6bb', TERRACE_INK);
  const curve = MIAMI_RIM_WIDTH - MIAMI_RIM_CURVE;
  const insets = [0, curve, ...Array.from({ length: 6 }, (_, k) => curve + (MIAMI_RIM_CURVE * (k + 1)) / 6)];
  for (let k = 1; k < insets.length; k++) {
    const outer = ring(insets[k - 1]), inner = ring(insets[k]);
    for (let e = 0; e < 5; e++) {
      const quad = [outer[e], outer[(e + 1) % 5], inner[(e + 1) % 5], inner[e]];
      const n = unit(cross(sub(quad[2], quad[0]), sub(quad[3], quad[1])));
      const up: Vec3 = n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
      poly(ground, quad, up, lit(k === 1 ? '#ebeae2' : '#e3e2d9', up), RIM_INK);
    }
  }
  const foot = MIAMI_WALL_TOP - 2;
  for (const side of [-1, 1]) {
    const out: Vec3 = [0.5, 0, side * Math.sqrt(3) / 2];
    face(ground, [0, 0], [MIAMI_TERRACE_SHOULDER, side * TERRACE_HALF], foot, MIAMI_RIM_HEIGHT, PALE, TERRACE_INK, out);
    face(ground, [MIAMI_TERRACE_SHOULDER, side * TERRACE_HALF], [BACK, side * TERRACE_HALF], foot, MIAMI_RIM_HEIGHT, PALE, TERRACE_INK, [0, 0, side]);
    // Detail on the faces, out from the tip as far as the cameras see it.
    const at = (s: number, y: number, off = STAND_OFF): Vec3 => [-s * Math.cos(Math.PI / 6) + out[0] * off, y, side * s * Math.sin(Math.PI / 6) + out[2] * off];
    for (let s = 6 * F; s < 39 * F; s += 6 * F) {
      poly(props, [at(s, foot), at(s + 0.6, foot), at(s + 0.6, MIAMI_RIM_HEIGHT - 1), at(s, MIAMI_RIM_HEIGHT - 1)], out, lit('#c3c1b5', out));
    }
    for (let s = 1.5 * F; s < 39 * F; s += 2 * F) {
      for (const y of [-1.1 * F, -2.4 * F]) {
        const h = 0.7;
        poly(props, [at(s - 1.2, y - h), at(s + 1.2, y - h), at(s + 1.2, y + h), at(s - 1.2, y + h)], out, lit('#8d8c84', out));
      }
    }
    for (let k = 0; k < 7; k++) {
      const s = (2 + hash2(k, side, 401) * 26) * F, y = -(0.6 + hash2(k, side, 402) * 2.4) * F;
      const w = (0.6 + hash2(k, side, 403) * 1.8) * F, h = (0.3 + hash2(k, side, 404) * 0.8) * F;
      poly(props, [at(s, y), at(s + w, y + h * 0.2), at(s + w * 0.85, y + h), at(s + w * 0.1, y + h * 0.8)], out, lit('#cfcab9', out));
    }
    // Wax and scuffs on the rim's top near the tip, where the box gets its ledge tricks.
    // `s` back along the edge from the tip, `inset` in from it, square to it.
    const g = (s: number, inset: number): Vec3 => [-s * Math.cos(Math.PI / 6) - inset * 0.5, MIAMI_RIM_HEIGHT + 0.3, side * (s * 0.5 - inset * Math.cos(Math.PI / 6))];
    for (let k = 0; k < 9; k++) {
      const s = (0.3 + k * 1.1 + hash2(k, side, 411) * 0.6) * F;
      const len = (0.6 + hash2(k, side, 412)) * F;
      poly(props, [g(s, 0.5), g(s + len, 0.5), g(s + len, 3 + hash2(k, side, 413) * 5), g(s, 2)], UP, lit('#c2c0b3', UP));
    }
  }
  face(ground, [BACK, TERRACE_HALF], [BACK, -TERRACE_HALF], PLAZA, MIAMI_RIM_HEIGHT, PALE, TERRACE_INK, [-1, 0, 0]);
  // The terrace casts its shadow onto the lawn in steps, from boxes inside it.
  for (const [a, b] of [[-5 * F, -1.5 * F], [-12 * F, -5 * F], [-24 * F, -12 * F]]) {
    const half = miamiTerraceHalf(b);
    shadows.push({ min: [a, MIAMI_WALL_TOP, -half], max: [b, -0.5, half] });
  }
  // Two low rectangular garden seats, away from the takeoff and bank.
  for (const side of [-1, 1]) {
    const z = side * 14 * F;
    props.box([-64 * F, 0.3, z - 2 * F], [-50 * F, 1.8 * F, z + 2 * F], '#7e9180', '#c4c2ac', STRUCTURE_INK);
    for (const x of [-61 * F, -53 * F]) shrubMound(props, [x, 1.8 * F, z], 1.5 * F, side + x, null, 0.65);
  }
}

/** A plain concrete triangular bank; its existing riding face and edges are preserved. */
function buildSlab(ground: Bake, props: Bake, shadows: ShadowBox[]) {
  const half = MIAMI_SLAB_SIDE / 2;
  const apex: Vec3 = [MIAMI_SLAB_APEX_X, MIAMI_SLAB_APEX_Y, 0];
  const left: Vec3 = [MIAMI_SLAB_LIP_X, MIAMI_SLAB_LIP_Y, -half];
  const right: Vec3 = [MIAMI_SLAB_LIP_X, MIAMI_SLAB_LIP_Y, half];
  const n = unit([MIAMI_SLAB_GRADE, 1, 0]);
  poly(ground, [apex, left, right], n, lit(BANK, n), SLAB_INK);
  const down = (p: Vec3): Vec3 => [p[0], p[1] - MIAMI_SLAB_THICK, p[2]];
  const sideColor = '#959a97';
  for (const [a, c] of [[apex, right], [right, left], [left, apex]] as const) {
    const out = unit([a[2] - c[2], 0, c[0] - a[0]]);
    poly(ground, [a, c, down(c), down(a)], out, lit(sideColor, out), SLAB_INK);
  }
  const under: Vec3 = [-n[0], -n[1], 0];
  poly(ground, [down(apex), down(right), down(left)], under, lit('#7d817e', under), SLAB_INK);
  // The pedestal, its top following the plate's underside.
  const u = (x: number) => miamiSlabTop(x) - MIAMI_SLAB_THICK;
  const p0 = MIAMI_PEDESTAL_X0, p1 = MIAMI_PEDESTAL_X1, ph = MIAMI_PEDESTAL_HALF;
  // In the slab's shade all day, so it's baked dark rather than shadowed.
  const pedestal = '#7a7e7b';
  face(props, [p0, -ph], [p1, -ph], PLAZA, [u(p0), u(p1)], pedestal, SLAB_INK, [0, 0, -1]);
  face(props, [p1, ph], [p0, ph], PLAZA, [u(p1), u(p0)], pedestal, SLAB_INK, [0, 0, 1]);
  face(props, [p1, -ph], [p1, ph], PLAZA, u(p1), pedestal, SLAB_INK, [1, 0, 0]);
  face(props, [p0, ph], [p0, -ph], PLAZA, u(p0), pedestal, SLAB_INK, [-1, 0, 0]);
  // Its shadow, cast by boxes stacked under the plate (never around its face).
  const steps = 4;
  for (let k = 0; k < steps; k++) {
    const a = MIAMI_SLAB_APEX_X + (k * (MIAMI_SLAB_LIP_X - MIAMI_SLAB_APEX_X)) / steps;
    const b = MIAMI_SLAB_APEX_X + ((k + 1) * (MIAMI_SLAB_LIP_X - MIAMI_SLAB_APEX_X)) / steps;
    const w = miamiSlabHalf((a + b) / 2);
    shadows.push({ min: [a, PLAZA, -w], max: [b, u(b) - 0.5, w] });
  }

  // Subtle aggregate in the plain concrete bank.
  const lift = (p: Vec3, d: number): Vec3 => [p[0] + n[0] * d, p[1] + n[1] * d, p[2]];
  for (let k = 0; k < 260; k++) {
    const x = MIAMI_SLAB_APEX_X + Math.sqrt(hash2(k, 1, 421)) * (MIAMI_SLAB_LIP_X - MIAMI_SLAB_APEX_X - 2);
    const z = (hash2(k, 2, 422) * 2 - 1) * (miamiSlabHalf(x) - 2);
    const p = lift([x, miamiSlabTop(x), z], 0.25), s = 0.7 + hash2(k, 3, 423) * 0.9;
    const color = hash2(k, 4, 424) < 0.6 ? '#7d817f' : '#c4c8c4';
    poly(props, [p, [p[0] + s, p[1] - s * MIAMI_SLAB_GRADE, p[2] + s * 0.4], [p[0] + s * 0.2, p[1] - s * 0.2 * MIAMI_SLAB_GRADE, p[2] - s]], n, { color });
  }
}

/** A palm: a Canary Island date palm (thick, dense crown), a royal palm (smooth grey column, green crownshaft) or a coconut (lean, curving). */
type PalmKind = 'date' | 'royal' | 'coconut';
function palm(b: Bake, at: Vec3, height: number, kind: PalmKind, seed: number) {
  const lean = kind === 'coconut' ? (0.08 + 0.1 * hash2(seed, 1, 501)) * height : 0.02 * height * hash2(seed, 1, 501);
  const dir = hash2(seed, 2, 502) * Math.PI * 2;
  const trunkAt = (t: number): Vec3 => [at[0] + Math.cos(dir) * lean * t * t, at[1] + height * t, at[2] + Math.sin(dir) * lean * t * t];
  const width = kind === 'date' ? 1.5 * F : kind === 'royal' ? 0.85 * F : 0.55 * F;
  const spine = [0, 0.35, 0.7, 1].map(trunkAt);
  const radii = kind === 'royal' ? [width * 0.75, width * 0.95, width * 0.7, width * 0.62] : kind === 'date' ? [width * 1.05, width, width * 0.95, width * 1.05] : [width * 1.1, width * 0.95, width * 0.85, width * 0.8];
  const bark = kind === 'royal' ? '#b9b8ae' : kind === 'date' ? '#7a6a52' : '#9a8d74';
  b.tube(spine, radii, { color: bark, lit: { color: mixHex(bark, '#ffffff', 0.25), from: 0.1, to: 1.6 } }, NO_INK, 8, false);
  if (kind === 'date') {
    // The diamond of old leaf bases up the trunk.
    for (let k = 1; k < 6; k++) {
      const p = trunkAt(k / 6.3);
      b.tube([[p[0], p[1] - 4, p[2]], [p[0], p[1] + 4, p[2]]], [width * 1.06, width * 1.06], { color: '#6c5d47' }, NO_INK, 8, false);
    }
  }
  const crown = trunkAt(1);
  if (kind === 'royal') b.tube([crown, [crown[0], crown[1] + 5 * F, crown[2]]], [width * 0.66, width * 0.55], { color: '#6f8a4a' }, NO_INK, 8, true);
  const head: Vec3 = kind === 'royal' ? [crown[0], crown[1] + 5 * F, crown[2]] : crown;
  // A date palm's crown is a dense ball of long stiff fronds, the lowest
  // hanging; royals and coconuts carry fewer, arching, drooping at the tips.
  const fronds = kind === 'date' ? 30 : 13;
  const reach = (kind === 'date' ? 13 : kind === 'royal' ? 11 : 10) * F;
  const leaflets = kind === 'date' ? 9 : 10;
  const greens = kind === 'date' ? ['#55703f', '#4a6538', '#5e7a45'] : ['#5f7d43', '#6d8a4b', '#58763f'];
  for (let f = 0; f < fronds; f++) {
    const a = f * 2.399 + seed;
    const tier = f % 3;
    const rise = kind === 'date' ? 1.15 - tier * 0.7 : 0.8 - tier * 0.45;
    const len = reach * (0.82 + 0.3 * hash2(seed, f, 503));
    const dx = Math.cos(a), dz = Math.sin(a);
    const droop = kind === 'date' ? 0.55 : 0.8;
    const at2 = (t: number): Vec3 => [head[0] + dx * len * t, head[1] + len * (rise * t - droop * t * t), head[2] + dz * len * t];
    b.tube([at2(0), at2(0.5), at2(1)], [2.6, 1.6, 0.3], { color: '#6b7a46' }, NO_INK, 3, false);
    for (let k = 1; k <= leaflets; k++) {
      const t = k / (leaflets + 1);
      const p = at2(t);
      const leaf = (kind === 'date' ? 3 : 3.2) * F * Math.sin(Math.PI * (0.12 + t * 0.88)) + 8;
      for (const side of [-1, 1]) {
        const s = a + side * (kind === 'date' ? 0.95 : 1.3);
        const tip: Vec3 = [p[0] + Math.cos(s) * leaf, p[1] - leaf * (kind === 'date' ? 0.2 : 0.5), p[2] + Math.sin(s) * leaf];
        const base: Vec3 = [p[0] - dx * leaf * 0.3, p[1] + 2, p[2] - dz * leaf * 0.3];
        b.triangle(p, base, tip, UP, { color: greens[(k + f + tier) % greens.length] }, LEAVES);
      }
    }
  }
}

/**
 * Biscayne Boulevard, west of the plaza: the east sidewalk with royal
 * palms, six lanes either side of a planted median, the far sidewalk, and
 * the Metromover's guideway along it on its columns.
 */
function buildBoulevard(props: Bake) {
  const y = PLAZA + STAND_OFF;
  const strip = (a: number, c: number, from: number, to: number, height: number, color: string) => {
    const pts = [blvd(a, from, height), blvd(c, from, height), blvd(c, to, height), blvd(a, to, height)];
    poly(props, pts, UP, lit(color, UP));
  };
  const L0 = -900 * F, L1 = 900 * F;
  const kerbY = PLAZA + 0.35 * F, medianY = PLAZA + 0.5 * F;
  const west: Vec3 = [BLVD_ACROSS[0], 0, BLVD_ACROSS[1]], east: Vec3 = [-west[0], 0, -west[2]];
  const step = (across: number, low: number, high: number, out: Vec3) =>
    poly(props, [blvd(L0, across, low), blvd(L1, across, low), blvd(L1, across, high), blvd(L0, across, high)], out, lit('#d4d0c3', out));
  strip(L0, L1, BLVD.sidewalk, BLVD.kerb, kerbY, '#cdc8ba');
  step(BLVD.sidewalk, PLAZA, kerbY, east);
  step(BLVD.kerb, y, kerbY, west);
  strip(L0, L1, BLVD.kerb, BLVD.farKerb, y, '#5d605c');
  strip(L0, L1, BLVD.median, BLVD.medianEnd, medianY, '#738f4a');
  step(BLVD.median, y, medianY, east);
  step(BLVD.medianEnd, y, medianY, west);
  strip(L0, L1, BLVD.farKerb, BLVD.farEdge + 400 * F, kerbY, '#cdc8ba');
  step(BLVD.farKerb, y, kerbY, east);
  // Pavers in the promenade, and its tree wells.
  for (let a = L0; a < L1; a += 12 * F) strip(a, a + 0.3 * F, BLVD.sidewalk, BLVD.kerb, kerbY + 0.4, '#b9b4a6');
  // Lane lines: dashed whites between the lanes, solid at the median.
  for (const lane of [BLVD.kerb + 12.5 * F, BLVD.kerb + 25 * F, BLVD.kerb + 37.5 * F, BLVD.medianEnd + 12 * F, BLVD.medianEnd + 24 * F, BLVD.medianEnd + 36 * F]) {
    for (let a = L0; a < L1; a += 40 * F) strip(a, a + 10 * F, lane - 0.25 * F, lane + 0.25 * F, y + 0.4, '#e9e6dc');
  }
  // A crosswalk south of the park, at the car park's entrance.
  for (let across = BLVD.kerb + 1.5 * F; across < BLVD.farKerb - 2 * F; across += 6.4 * F) {
    if (across > BLVD.median - 3 * F && across < BLVD.medianEnd) continue;
    strip(150 * F, 162 * F, across, across + 3.2 * F, y + 0.5, '#ecebe3');
  }
  // Royal palms down the east sidewalk and the median.
  for (let k = 0; k < 9; k++) {
    const a = (-150 + k * 42) * F;
    const near = blvd(a, BLVD.kerb - 6 * F, PLAZA + 0.35 * F);
    palm(props, near, (52 + hash2(k, 1, 601) * 14) * F, 'royal', k + 100);
    if (k % 2 === 0) palm(props, blvd(a + 21 * F, (BLVD.median + BLVD.medianEnd) / 2, PLAZA + 0.5 * F), (48 + hash2(k, 2, 602) * 12) * F, 'royal', k + 120);
  }
  // Coconut palms on the park's corner by the boulevard.
  for (let k = 0; k < 3; k++) palm(props, [(36 + k * 13) * F, PLAZA, (46 - k * 2 + hash2(k, 1, 611) * 4) * F], (30 + k * 4) * F, 'coconut', k + 140);
  // The Metromover: a white box-girder guideway on hammerhead columns.
  const g = BLVD.farEdge - 7 * F;
  const deck0 = PLAZA + 22 * F, deck1 = PLAZA + 27 * F;
  const beam = (a: number, c: number) => {
    const sides: Array<[number, number, Vec3]> = [[g - 4 * F, g - 4 * F, [-BLVD_ACROSS[0], 0, -BLVD_ACROSS[1]]], [g + 4 * F, g + 4 * F, [BLVD_ACROSS[0], 0, BLVD_ACROSS[1]]]];
    for (const [w] of sides) {
      const out = sides.find(s => s[0] === w)![2];
      poly(props, [blvd(a, w, deck0), blvd(c, w, deck0), blvd(c, w, deck1), blvd(a, w, deck1)], out, lit('#e1e0d8', out), STRUCTURE_INK);
    }
    poly(props, [blvd(a, g - 4 * F, deck0), blvd(c, g - 4 * F, deck0), blvd(c, g + 4 * F, deck0), blvd(a, g + 4 * F, deck0)], [0, -1, 0], lit('#b9b8b0', [0, -1, 0]));
    poly(props, [blvd(a, g - 4 * F, deck1), blvd(c, g - 4 * F, deck1), blvd(c, g + 4 * F, deck1), blvd(a, g + 4 * F, deck1)], UP, lit('#cfcec6', UP));
  };
  beam(L0, L1);
  for (let a = -600 * F; a <= 600 * F; a += 95 * F) {
    const c = blvd(a, g, PLAZA);
    props.frustum(c[0], c[2], PLAZA, deck0 - 3 * F, 2.2 * F, 1.8 * F, { color: '#d8d7cf' }, STRUCTURE_INK);
    props.frustum(c[0], c[2], deck0 - 3 * F, deck0, 2.6 * F, 4.4 * F, { color: '#d8d7cf' }, STRUCTURE_INK);
  }
  // Street lights down the east sidewalk.
  for (let k = 0; k < 8; k++) {
    const base = blvd((-130 + k * 42 + 21) * F, BLVD.kerb - 2 * F, PLAZA + 0.35 * F);
    const head = blvd((-130 + k * 42 + 21) * F, BLVD.kerb + 4 * F, PLAZA + 28 * F);
    const top: Vec3 = [base[0], PLAZA + 29 * F, base[2]];
    props.tube([base, top, head], [0.35 * F, 0.25 * F, 0.2 * F], { color: '#55605e' }, NO_INK, 6, false);
    props.box([head[0] - 0.9 * F, head[1] - 0.6 * F, head[2] - 0.6 * F], [head[0] + 0.9 * F, head[1], head[2] + 0.6 * F], '#4d5755', '#6b7472', NO_INK);
  }
}

/** The park's south drive and its car park, beyond the plaza's stepped planters on the left. */
function buildParking(props: Bake) {
  // In the frame of the plaza's left side: along it, and out from it.
  const along: [number, number] = [Math.SQRT1_2, Math.SQRT1_2];
  const out: [number, number] = [Math.SQRT1_2, -Math.SQRT1_2];
  const p = (s: number, o: number, y: number): Vec3 => [MIAMI_WALL_X + along[0] * s + out[0] * o, y, -H + along[1] * s + out[1] * o];
  const y = PLAZA + STAND_OFF;
  const quad = (s0: number, s1: number, o0: number, o1: number, height: number, color: string) => poly(props, [p(s0, o0, height), p(s1, o0, height), p(s1, o1, height), p(s0, o1, height)], UP, lit(color, UP));
  quad(-40 * F, 105 * F, 22 * F, 62 * F, y, '#62655f');
  quad(-40 * F, 105 * F, 16 * F, 22 * F, y + 0.35 * F, '#cdc8ba');
  // Stall lines, square to the drive.
  for (let s = -36 * F; s < 100 * F; s += 9 * F) quad(s, s + 0.35 * F, 22 * F, 40 * F, y + 0.4, '#e3e0d5');
  quad(-40 * F, 105 * F, 39.8 * F, 40.2 * F, y + 0.4, '#e3e0d5');
  // Lamp posts on the kerb.
  for (let s = -30 * F; s < 100 * F; s += 40 * F) {
    const base = p(s, 20 * F, PLAZA + 0.35 * F);
    props.tube([base, [base[0], PLAZA + 18 * F, base[2]]], [0.3 * F, 0.22 * F], { color: '#55605e' }, NO_INK, 6, false);
    props.box([base[0] - 0.8 * F, PLAZA + 18 * F, base[2] - 0.8 * F], [base[0] + 0.8 * F, PLAZA + 18.8 * F, base[2] + 0.8 * F], '#4d5755', '#6b7472', NO_INK);
  }
}

/** Where the car park's stalls are, for the parked cars (miami3d.ts): along the plaza's left side, nose in. */
export function miamiParkingStall(k: number): Vec3 {
  const s = (-31.5 + k * 9) * F, o = 31 * F;
  return [MIAMI_WALL_X + Math.SQRT1_2 * (s + o), PLAZA, -H + Math.SQRT1_2 * (s - o)];
}
/** A point on Biscayne Boulevard: `along` it (south is +), `across` west from the terrace's tip. */
export const miamiBoulevard = (along: number, across: number): Vec3 => blvd(along, across, PLAZA);
export const MIAMI_BOULEVARD = BLVD;
/** The boulevard's heading in a car's yaw (degrees about up, 0 = +x): southbound. */
export const MIAMI_SOUTHBOUND = 45;

/**
 * Downtown across the boulevard: a wall of towers, white, cream and blue
 * glass, one with red balcony panels; and the InterContinental's curved
 * tower off to the south-east, behind the left of the terrace.
 */
function buildSkyline(props: Bake) {
  const towers: Array<[number, number, number, number, string, string | null]> = [
    [-420, 70, 380, 'e3ddcb', null], [-310, 80, 300, 'e7e6df', 'b5473c'], [-200, 75, 460, '9fb2b8', null],
    [-90, 60, 260, 'd9d2bf', null], [10, 85, 520, 'e9e7e0', null], [130, 70, 330, 'b8c4c4', null],
    [240, 90, 400, 'e5dfcf', 'b14a3e'], [360, 70, 290, 'd5d9d6', null], [470, 80, 450, 'a8b9bf', null],
    [590, 75, 340, 'e8e5db', null],
  ].map(([a, w, h, c, r]) => [a as number, w as number, h as number, 0, `#${c}`, r ? `#${r}` : null]);
  for (const [a, w, h, , color, red] of towers) {
    const back = BLVD.farEdge + 30 * F + hash2(a, 1, 701) * 40 * F;
    tower(props, blvd(a * F, back, PLAZA), w * F, (w * 0.8 + hash2(a, 2, 702) * 30) * F, h * F, color, red);
  }
  // The InterContinental: an elongated rounded tower, south-east of the park.
  const cx = -184 * F, cz = -443 * F, rx = 70 * F, rz = 44 * F, height = 400 * F;
  const sides = 20;
  for (let k = 0; k < sides; k++) {
    const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
    const p = (a: number, y: number): Vec3 => [cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz];
    const n = unit([Math.cos((a0 + a1) / 2) / rx, 0, Math.sin((a0 + a1) / 2) / rz]);
    poly(props, [p(a0, PLAZA), p(a1, PLAZA), p(a1, PLAZA + height), p(a0, PLAZA + height)], n, lit('#e6e4dc', n), STRUCTURE_INK);
    for (let y = PLAZA + 20 * F; y < PLAZA + height - 10 * F; y += 11 * F) {
      const q = (a: number, yy: number): Vec3 => [cx + Math.cos(a) * (rx + 0.5), yy, cz + Math.sin(a) * (rz + 0.5)];
      poly(props, [q(a0, y), q(a1, y), q(a1, y + 5 * F), q(a0, y + 5 * F)], n, lit('#8c9ea4', n));
    }
  }
  poly(props, Array.from({ length: sides }, (_, k) => {
    const a = (k / sides) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, PLAZA + height, cz + Math.sin(a) * rz] as Vec3;
  }), UP, lit('#c9c8c0', UP));
}

/** A high-rise: a box with window bands on its faces, and red balcony panels where it has them. */
function tower(b: Bake, foot: Vec3, width: number, depth: number, height: number, color: string, red: string | null) {
  const along: Vec3 = [BLVD_ALONG[0], 0, BLVD_ALONG[1]], across: Vec3 = [BLVD_ACROSS[0], 0, BLVD_ACROSS[1]];
  const p = (s: number, d: number, y: number): Vec3 => [foot[0] + along[0] * s + across[0] * d, y, foot[2] + along[2] * s + across[2] * d];
  const w = width / 2, y0 = foot[1], y1 = foot[1] + height;
  const faces: Array<[Vec3, Vec3, Vec3]> = [
    [p(-w, 0, y0), p(w, 0, y0), [-across[0], 0, -across[2]]],
    [p(w, 0, y0), p(w, depth, y0), along],
    [p(-w, depth, y0), p(-w, 0, y0), [-along[0], 0, -along[2]]],
  ];
  const floor = 11 * F;
  for (const [a, c, n] of faces) {
    poly(b, [a, c, [c[0], y1, c[2]], [a[0], y1, a[2]]], n, lit(color, n), STRUCTURE_INK);
    const o: Vec3 = [n[0] * 1.5, 0, n[2] * 1.5];
    for (let y = y0 + 1.5 * floor; y < y1 - floor; y += floor) {
      const band = red && Math.floor((y - y0) / floor) % 2 === 0 ? red : mixHex(color, '#56656c', 0.55);
      poly(b, [[a[0] + o[0], y, a[2] + o[2]], [c[0] + o[0], y, c[2] + o[2]], [c[0] + o[0], y + floor * 0.42, c[2] + o[2]], [a[0] + o[0], y + floor * 0.42, a[2] + o[2]]], n, lit(band, n));
    }
  }
  poly(b, [p(-w, 0, y1), p(w, 0, y1), p(w, depth, y1), p(-w, depth, y1)], UP, lit(mixHex(color, '#7d8582', 0.3), UP));
}
