import type { Vec3 } from '../../camera/view';
import type { Bake } from '../../three/bake';
import { hash2 } from '../setKit';
import { F, UP, mixHex, solidBox, tag, valueNoise, type Plan } from './wallenbergKit';
import {
  WALLENBERG_CORNER_R,
  WALLENBERG_DROP,
  WALLENBERG_END_Z,
  WALLENBERG_GATE_X,
  WALLENBERG_LEDGE_Z,
  WALLENBERG_RUN,
  WALLENBERG_SIDE_STAIRS_Z0,
  WALLENBERG_STEPS,
  WALLENBERG_TREAD,
  slopeMeets,
  wallenbergLevel,
  wallenbergSlope,
} from './wallenbergLayout';
import { WALLENBERG_PAINT as PAINT } from './wallenbergPalette';

/**
 * Wallenberg's wear, drawn on the decals (the ground's material, a hair proud of it): the curbs' caps worn
 * pale and waxed dark where the line crosses them (the faces' paint, buff and grime are in their own
 * colours: wallenbergGeometry.ts's faceTone, since layered decals on a wall fight at a distance), the treads polished along the line and patched with fresh sealer, tyre
 * tracks and oil up the court-side slope, cracks across the yard. Read from the 51-inch shot, the
 * FindSkateSpots photograph and the roll-in stills.
 */

const ASPHALT = tag('asphalt');
const CONCRETE = tag('concrete');
/** Layers of decal, so overlapping marks never fight. */
const LIFT = [0.3, 0.6, 0.9] as const;
/** The skated line crosses every curb about here, wider at the bottom where tricks land. */
const LINE_Z = 0;
const lineWidth = (i: number) => (5 + i * 1.2) * F;

/** Where the face of curb `i` runs straight, between its rounded end (or far away) and the side stairs. */
function faceSpan(i: number): [number, number] {
  const from = i < WALLENBERG_END_Z.length ? WALLENBERG_END_Z[i] + WALLENBERG_CORNER_R[i] : -60 * F;
  return [from, WALLENBERG_SIDE_STAIRS_Z0 - 0.4 * F];
}

/** A level quad over a rectangle, a colour at each corner. */
function patch(b: Bake, x0: number, x1: number, z0: number, z1: number, ground: (x: number) => number, colors: string | [string, string, string, string], ink = ASPHALT, lift: number = LIFT[0]) {
  const y = (x: number) => ground(x) + lift;
  const [c00, c10, c11, c01] = typeof colors === 'string' ? [colors, colors, colors, colors] : colors;
  const a: Vec3 = [x0, y(x0), z1], c: Vec3 = [x1, y(x1), z1], d: Vec3 = [x1, y(x1), z0], e: Vec3 = [x0, y(x0), z0];
  b.quadCorners(a, c, d, e, normalUp(a, c, d), [{ color: c01 }, { color: c11 }, { color: c10 }, { color: c00 }], ink);
}

/** A crooked crack: a dark thread wandering across level ground. */
function crack(b: Bake, x: number, z: number, y: (x: number) => number, seed: number, length: number, along: 'x' | 'z', lift: number = LIFT[1]) {
  let prev: Plan = [x, z];
  const parts = 8;
  for (let k = 1; k <= parts; k++) {
    const wander = 0.4 * F * (hash2(seed, k, 50) - 0.5) + 0.15 * F * Math.sin(k * 1.7 + seed);
    const next: Plan = along === 'x' ? [x + (length * k) / parts, z + wander] : [x + wander, z + (length * k) / parts];
    const w = 0.5 + 0.3 * hash2(seed, k, 49);
    const [dx, dz] = along === 'x' ? [0, w] : [w, 0];
    const p = (q: Plan, s: number): Vec3 => [q[0] + s * dx, y(q[0]) + lift, q[1] + s * dz];
    b.quad(p(prev, -1), p(prev, 1), p(next, 1), p(next, -1), UP, { color: PAINT.crack }, ASPHALT);
    prev = next;
  }
}

/** A blot: an irregular round stain, `r` across, darker in the middle. */
function blot(b: Bake, x: number, z: number, y: (x: number) => number, r: number, center: string, rim: string, seed: number, ink = ASPHALT, lift: number = LIFT[1]) {
  const around = 10;
  const mid: Vec3 = [x, y(x) + lift, z];
  for (let k = 0; k < around; k++) {
    const at = (j: number): Vec3 => {
      const a = (j / around) * Math.PI * 2, rr = r * (0.65 + 0.5 * hash2(seed, j % around, 60));
      const px = x + Math.cos(a) * rr;
      return [px, y(px) + lift, z + Math.sin(a) * rr];
    };
    const p = at(k), q = at(k + 1);
    b.vertex(mid, UP, { color: center }, ink);
    b.vertex(q, UP, { color: rim }, ink);
    b.vertex(p, UP, { color: rim }, ink);
  }
}

/* ----- The curbs ----- */

/**
 * Each curb's cap: the top half-foot of its tread worn pale along the lip, waxed dark and polished across the
 * line where every trick in the spot's history has scraped it.
 */
function caps(b: Bake) {
  for (let i = 0; i < WALLENBERG_STEPS; i++) {
    const x = i * WALLENBERG_TREAD, y = wallenbergLevel(i);
    const [from, to] = faceSpan(i);
    const width = 0.55 * F;
    const lift = () => y;
    const steps = Math.ceil((to - from) / (1.5 * F));
    for (let k = 0; k < steps; k++) {
      const z0 = from + ((to - from) * k) / steps, z1 = from + ((to - from) * (k + 1)) / steps;
      const tone = (z: number) => {
        const wax = Math.max(0, 1 - Math.abs(z - LINE_Z) / lineWidth(i));
        const n = valueNoise(z / (2.5 * F) + i * 7, i);
        return mixHex(mixHex(PAINT.cap, PAINT.faceGrime, 0.25 * n), PAINT.capWax, Math.min(0.9, wax * 1.25 + 0.15 * n * wax));
      };
      const inner = mixHex(tone(z0), PAINT.tread, 0.55), inner1 = mixHex(tone(z1), PAINT.tread, 0.55);
      patch(b, x - width, x - 0.05, z0, z1, lift, [inner, tone(z0), tone(z1), inner1], CONCRETE);
    }
  }
}

/**
 * The treads: polished paler along the line where wheels roll, a few rectangles of fresher, darker sealer,
 * and cracks wandering across them.
 */
function treads(b: Bake) {
  // The last curb lands on the yard, whose wear is the yard's.
  for (let i = 0; i + 1 < WALLENBERG_STEPS; i++) {
    const x0 = i * WALLENBERG_TREAD;
    const y = wallenbergLevel(i + 1);
    const level = () => y;
    // Only where the tread runs straight, between the upper curb's rounded end and the side stairs.
    const [near] = faceSpan(i);
    const end = (i + 1) * WALLENBERG_TREAD - 0.6 * F;
    // The polished line: paler toward its middle, fading to the tread at its edges.
    const w = lineWidth(i + 1);
    const segments = 6;
    for (let s = 0; s < segments; s++) {
      const z0 = LINE_Z - w + (2 * w * s) / segments, z1 = LINE_Z - w + (2 * w * (s + 1)) / segments;
      const t = (z: number) => Math.max(0, 1 - Math.abs(z - LINE_Z) / w) ** 1.5;
      const tone = (z: number) => mixHex(PAINT.tread, PAINT.treadWorn, t(z));
      patch(b, x0 + 0.05 * F, end, z0, z1, level, [tone(z0), tone(z0), tone(z1), tone(z1)], ASPHALT);
    }
    // Sealer patches.
    for (let k = 0; k < 2; k++) {
      const pw = (2.5 + 4 * hash2(i, k, 71)) * F, pd = (1.5 + 2.5 * hash2(i, k, 72)) * F;
      const z0 = near + (WALLENBERG_SIDE_STAIRS_Z0 - near - pw) * hash2(i, k, 73);
      const px0 = x0 + 0.6 * F + Math.max(0, end - x0 - 1.2 * F - pd) * hash2(i, k, 74);
      patch(b, px0, Math.min(end, px0 + pd), z0, z0 + pw, level, mixHex(PAINT.tread, PAINT.treadPatch, 0.5), ASPHALT, LIFT[1]);
    }
    // Cracks, along the tread and across it.
    for (let k = 0; k < 5; k++) {
      const along = hash2(i, k, 75) > 0.5;
      const length = (2 + 5 * hash2(i, k, 76)) * F;
      const z = near + 1 * F + (WALLENBERG_SIDE_STAIRS_Z0 - near - length - 2 * F) * hash2(i, k, 77);
      if (along) crack(b, x0 + (0.8 + 2 * hash2(i, k, 78)) * F, z, level, i * 31 + k, Math.min(length, end - x0 - 3 * F), 'x', LIFT[2]);
      else crack(b, x0 + (1 + Math.max(0, end - x0 - 2 * F) * hash2(i, k, 78)), z, level, i * 31 + k, length, 'z', LIFT[2]);
    }
    // Gum and wax drips near the line.
    for (let k = 0; k < 6; k++) {
      const gx = x0 + (0.5 + Math.max(0.5, (end - x0) / F - 1) * hash2(i, k, 79)) * F;
      const gz = LINE_Z + (hash2(i, k, 80) - 0.5) * 2 * w;
      blot(b, gx, gz, level, (0.08 + 0.1 * hash2(i, k, 81)) * F, '#3d3e3b', '#4c4d4a', i * 17 + k, ASPHALT, LIFT[2]);
    }
  }
}

/* ----- Round the blocks ----- */

/**
 * The court-side slope: tyre tracks curving up it toward the gate where the school's vans park, oil spots
 * where they stand, and cracks.
 */
function slope(b: Bake) {
  const y = (x: number) => wallenbergSlope(x);
  const top = WALLENBERG_GATE_X + 6 * F;
  const bottomX = slopeMeets(1) - 2 * F;
  // Two pairs of tracks, each a run of quads following the grade.
  for (const [z, seed] of [[-24 * F, 1], [-46 * F, 2]] as const) for (const side of [-1, 1]) {
    const zz = z + side * 2.7 * F;
    const n = 14;
    for (let k = 0; k < n; k++) {
      const xa = top + ((bottomX - top) * k) / n, xc = top + ((bottomX - top) * (k + 1)) / n;
      const bend = (x: number) => zz + Math.sin(((x - top) / (bottomX - top)) * Math.PI * 0.8 + seed) * 2.5 * F;
      const w = 0.42 * F;
      const tone = mixHex(PAINT.slope, PAINT.tyre, 0.2 + 0.2 * valueNoise(k * 0.7, seed * 3 + side));
      const pa = (s: number): Vec3 => [xa, y(xa) + LIFT[0], bend(xa) + s * w];
      const pc = (s: number): Vec3 => [xc, y(xc) + LIFT[0], bend(xc) + s * w];
      const up = normalUp(pa(-1), pc(-1), pc(1));
      b.quad(pa(-1), pa(1), pc(1), pc(-1), up, { color: tone }, ASPHALT);
    }
  }
  for (let k = 0; k < 6; k++) {
    const x = top + (bottomX - top) * hash2(k, 1, 82), z = (-14 - 40 * hash2(k, 2, 82)) * F;
    blot(b, x, z, y, (0.6 + 1.1 * hash2(k, 3, 82)) * F, PAINT.oil, mixHex(PAINT.oil, PAINT.slope, 0.6), k + 40, ASPHALT, LIFT[1]);
  }
  for (let k = 0; k < 7; k++) {
    const x = top + (bottomX - top) * hash2(k, 4, 83), z = (-12 - 55 * hash2(k, 5, 83)) * F;
    crack(b, x, z, y, k + 60, (6 + 10 * hash2(k, 6, 83)) * F, hash2(k, 7, 83) > 0.5 ? 'x' : 'z', LIFT[2]);
  }
  // The run-up along the alley: a paler polished lane and a crack or two.
  const alley = () => 0;
  const lane0 = WALLENBERG_LEDGE_Z + 1.5 * F, lane1 = 2.5 * F;
  for (let k = 0; k < 6; k++) {
    const xa = -55 * F + k * 8 * F, xc = xa + 8 * F;
    const mid = (lane0 + lane1) / 2;
    const tone = (z: number) => mixHex(PAINT.platform, PAINT.treadWorn, 0.55 * (1 - Math.abs(z - mid) / ((lane1 - lane0) / 2)));
    patch(b, xa, xc, lane0, mid, alley, [tone(lane0), tone(lane0), tone(mid), tone(mid)], ASPHALT);
    patch(b, xa, xc, mid, lane1, alley, [tone(mid), tone(mid), tone(lane1), tone(lane1)], ASPHALT);
  }
  for (let k = 0; k < 4; k++) crack(b, (-50 + 10 * k + 4 * hash2(k, 8, 84)) * F, (-3 + 5 * hash2(k, 9, 84)) * F, alley, k + 80, (3 + 3 * hash2(k, 10, 84)) * F, 'z', LIFT[1]);
}

function normalUp(a: Vec3, c: Vec3, d: Vec3): Vec3 {
  const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const m = Math.hypot(...n) || 1;
  const s = n[1] < 0 ? -1 / m : 1 / m;
  return [n[0] * s, n[1] * s, n[2] * s];
}

/**
 * The yard the blocks land on: black marks where boards land and slide out, patches, cracks, and the storm
 * drain in the gutter.
 */
function yardWear(b: Bake, props: Bake) {
  const bottom = -WALLENBERG_DROP;
  const level = () => bottom;
  const x0 = WALLENBERG_RUN + 1.5 * F;
  // Landing marks: short dark scuffs fanning out from where the line lands.
  for (let k = 0; k < 9; k++) {
    const x = x0 + (2 + 12 * hash2(k, 1, 85)) * F, z = LINE_Z + (hash2(k, 2, 85) - 0.5) * 10 * F;
    const length = (1.5 + 3 * hash2(k, 3, 85)) * F, w = 0.05 * F;
    const a = (hash2(k, 4, 85) - 0.5) * 0.6;
    const dx = Math.cos(a) * length, dz = Math.sin(a) * length;
    b.quad([x, bottom + LIFT[1], z - w], [x, bottom + LIFT[1], z + w], [x + dx, bottom + LIFT[1], z + dz + w], [x + dx, bottom + LIFT[1], z + dz - w], UP, { color: mixHex(PAINT.yard, PAINT.tyre, 0.35) }, ASPHALT);
  }
  for (let k = 0; k < 5; k++) {
    const px = x0 + (4 + 40 * hash2(k, 5, 86)) * F, pz = (-40 + 70 * hash2(k, 6, 86)) * F;
    const w = (4 + 8 * hash2(k, 7, 86)) * F, d = (3 + 6 * hash2(k, 8, 86)) * F;
    patch(b, px, px + d, pz, pz + w, level, PAINT.yardPatch, ASPHALT, LIFT[0]);
  }
  for (let k = 0; k < 16; k++) {
    const x = x0 + (1 + 60 * hash2(k, 9, 87)) * F, z = (-60 + 85 * hash2(k, 10, 87)) * F;
    crack(b, x, z, level, k + 100, (5 + 12 * hash2(k, 11, 87)) * F, hash2(k, 12, 87) > 0.5 ? 'x' : 'z', LIFT[2]);
  }
  for (let k = 0; k < 4; k++) {
    blot(b, x0 + (20 + 30 * hash2(k, 13, 88)) * F, (-30 + 40 * hash2(k, 14, 88)) * F, level, (0.8 + hash2(k, 15, 88)) * F, PAINT.oil, mixHex(PAINT.oil, PAINT.yard, 0.6), k + 120, ASPHALT, LIFT[1]);
  }
  // The storm drain in the gutter, off the line.
  const dz = -18 * F;
  solidBox(props, [WALLENBERG_RUN + 0.2 * F, bottom, dz - 1.2 * F], [WALLENBERG_RUN + 1.4 * F, bottom + 0.15, dz + 1.2 * F], '#3e3f3c', '#4a4b47', tag('metal'), 't');
  for (let k = 0; k < 7; k++) {
    const z = dz - 1 * F + (k * 2 * F) / 6;
    solidBox(props, [WALLENBERG_RUN + 0.25 * F, bottom + 0.15, z - 0.6], [WALLENBERG_RUN + 1.35 * F, bottom + 0.4, z + 0.6], '#5b5c58', '#5b5c58', tag('metal'), 't');
  }
}

/** The top platform and the alley: a few cracks and a worn lane toward the lip. */
function platform(b: Bake) {
  const level = () => 0;
  for (let k = 0; k < 5; k++) crack(b, (-30 + 26 * hash2(k, 1, 89)) * F, (-2 + 20 * hash2(k, 2, 89)) * F, level, k + 140, (3 + 5 * hash2(k, 3, 89)) * F, hash2(k, 4, 89) > 0.5 ? 'x' : 'z', LIFT[2]);
}

export function buildWallenbergWear(decals: Bake, props: Bake) {
  caps(decals);
    treads(decals);
  slope(decals);
  yardWear(decals, props);
  platform(decals);
}

/**
 * The paint on curb `i`'s face at `z` along it, `t` up it (0 its foot, 1 its top): off-white over generations
 * of paint, in broad patches of fresher and older buff (the 2020 photographs show the faces patchy), scraped
 * grey low down along the line where boards slap it, grime gathering toward the foot. Baked into the face's
 * own vertex colours.
 */
export function faceTone(i: number, z: number, t: number): string {
  const Z = z / F;
  // Buff: patches several feet long where the noise rises over a threshold, fresher or older by a second noise.
  const patchy = valueNoise(Z / 4.5 + i * 11.3, i * 5.7 + 0.5);
  const buff = Math.min(1, Math.max(0, (patchy - 0.5) / 0.06));
  const fresh = valueNoise(Z / 7 + i * 3.1 + 40, i * 2.3);
  let c = mixHex(PAINT.face, fresh > 0.5 ? PAINT.faceBuff : PAINT.faceBuffOld, buff * (t < 0.06 ? 0.4 : 1));
  // Scrapes along the line, low on the face.
  const near = Math.max(0, 1 - Math.abs(z - LINE_Z) / lineWidth(i));
  const scrape = near * Math.max(0, valueNoise(Z * 1.3 + i * 9, t * 3 + i) - 0.5) * 2 * (t > 0.1 && t < 0.7 ? 1 : 0);
  c = mixHex(c, PAINT.facePeeled, 0.55 * scrape);
  // Grime toward the foot, its reach wandering along the face.
  const reach = 0.25 + 0.25 * valueNoise(Z / 3 + i * 3.1, i * 7.9);
  const grime = Math.max(0, 1 - t / reach) ** 1.4;
  return mixHex(c, PAINT.faceGrime, 0.62 * grime);
}
