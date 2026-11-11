import type { Vec3 } from '../../camera/view';
import { mixHex } from '../../math';
import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { hash2 } from '../setKit';
import { hill } from './elToroLayout';
import { SET_FOOT as F } from './stairs';

/** Where a shrub stands on the ground, and how far its crown reaches: the ground darkens round its foot. */
export interface ElToroShrubFoot {
  at: Vec3;
  radius: number;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normal = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(...a) || 1));
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const tau = 2 * Math.PI;

/** The bank's shrubs: dusty olive to deep green (refs/41, 59). */
const OLIVE = ['#5f6a48', '#6c7650', '#56633f', '#77805a', '#4f5c3d'];
/** The clipped hedges on the canopy bank, a fuller green (refs/34, 46). */
const HEDGE = ['#5b763b', '#678243', '#526d37', '#748c4c', '#5f7a40'];
/** Oleander-like low bushes by the stair foot, with pink flowers (refs/07). */
const PINK_LEAF = ['#5d6d47', '#687653'];
const PINK = ['#dc9fb1', '#e8b9c6', '#c88197', '#efcdd5'];
const BARK = '#6e6552';
const DRY = ['#8a7960', '#a29270', '#6f6453', '#b5a080', '#726c50'];
/** The few big scraps left on the bank (twigs, bark strips, stones); the soil surface draws the fine litter. */
const LITTER = 36;
/** Surface class 13 adds the fine leaf dappling without outlining every leaflet. */
const LEAF_INK: Ink = { ...NO_INK, solid: 13 };

/** The side filmer's stand on the bank, and the corridor its lens looks down to the stairs: no tall shrub in it. */
const FILMER = { u: 12, z: 38 } as const;
const inFilmersView = (u: number, z: number, radius: number) =>
  (Math.abs(u - FILMER.u) < 4 + radius && z < FILMER.z + 5) || Math.hypot(u - FILMER.u, z - FILMER.z) < 6 + radius;

interface LumpOptions {
  sectors?: number;
  rings?: number;
  /** How far the broad bumps push the surface in and out (share of the radius). */
  bumps?: number;
  /** Clipped: the top sheared flat and the sides smoothed, as a trimmed hedge. */
  clipped?: boolean;
  /** Flowers dotted over its sunny side. */
  flowers?: number;
}

/**
 * Photograph-guided planting (refs/07, 34, 41, 59): irregular olive clumps on the locker-side dirt bank with
 * their woody stems showing underneath, low pink-flowering bushes near the stair foot, ground cover, and rows of
 * big clipped hedges on the canopy bank, each its own shape, touching its neighbours. Every mass is real
 * geometry in its authored sunlit colour, darkened underneath through its alpha (the look's occlusion); the look
 * lights it and dapples its leaves per pixel. The trees are street props (elToroTrees.ts). Returns where each
 * shrub stands, for the shade round its foot.
 */
export function buildElToroLandscape(props: Bake): ElToroShrubFoot[] {
  const feet: ElToroShrubFoot[] = [];
  /** A point on the bank, in feet across it and over the ground there. */
  const onBank = (u: number, h: number, z: number): Vec3 => [u * F, hill(u * F) + h * F, z * F];

  const face = (a: Vec3, b: Vec3, c: Vec3, color: string, n?: Vec3, ink: Ink = NO_INK) =>
    props.triangle(a, b, c, n ?? normal(cross(sub(b, a), sub(c, a))), { color }, ink);

  /** A tapered, crooked stem, with sun-shaded bark. */
  const branch = (points: Vec3[], radii: number[], color: string, seed: number, sides = 4) => {
    const rings = points.map((p, i) => {
      const axis = normal(sub(points[Math.min(points.length - 1, i + 1)], points[Math.max(0, i - 1)]));
      const across = normal(cross(axis, Math.abs(axis[1]) > 0.85 ? [1, 0, 0] : [0, 1, 0]));
      const along = cross(axis, across);
      return Array.from({ length: sides }, (_, k) => {
        const angle = (k / sides) * tau;
        const n = add(scale(across, Math.cos(angle)), scale(along, Math.sin(angle)));
        return { p: add(p, scale(n, radii[i] * (0.93 + 0.14 * hash2(seed, k, 709)))), n };
      });
    });
    for (let i = 0; i + 1 < points.length; i++) {
      for (let k = 0; k < sides; k++) {
        const [a, b] = [rings[i][k], rings[i][(k + 1) % sides]];
        const [c, d] = [rings[i + 1][(k + 1) % sides], rings[i + 1][k]];
        const bark = mixHex(color, '#4f4a3e', 0.3 * hash2(seed, k, 710));
        for (const v of [a, c, b, a, d, c]) props.vertex(v.p, v.n, { color: bark }, NO_INK);
      }
    }
  };

  /** A small folded lanceolate leaf standing out of a mass, to break its silhouette. */
  const leaf = (p: Vec3, length: number, width: number, angle: number, lift: number, color: string) => {
    const axis: Vec3 = [Math.cos(angle), lift, Math.sin(angle)];
    const across: Vec3 = [-Math.sin(angle), 0, Math.cos(angle)];
    const end = add(p, scale(axis, length));
    const mid = add(add(p, scale(axis, length * 0.46)), [0, width * 0.23, 0]);
    for (const edge of [add(mid, scale(across, width)), add(mid, scale(across, -width))]) {
      let n = normal(cross(sub(edge, p), sub(end, p)));
      if (n[1] < 0) n = scale(n, -1);
      face(p, edge, end, color, n, LEAF_INK);
    }
  };

  /**
   * A rounded mass of foliage: an ellipsoid pushed in and out by a few broad bumps, so no two read alike, its
   * tips paler where they catch the sun and its underside dark (alpha is the look's occlusion). Returns the
   * surface point in a direction, for the leaves and flowers set on it.
   */
  const lump = (center: Vec3, radius: Vec3, seed: number, color: string, options: LumpOptions = {}) => {
    const { sectors = 8, rings = 5, bumps = 0.32, clipped = false, flowers = 0 } = options;
    const knobs = Array.from({ length: 6 }, (_, i) => {
      const y = 2 * hash2(seed, i, 741) - 1, a = tau * hash2(seed, i, 742), r = Math.sqrt(1 - y * y);
      return { d: [Math.cos(a) * r, y, Math.sin(a) * r] as Vec3, amp: (hash2(seed, i, 743) - 0.4) * bumps };
    });
    const reach = (d: Vec3) => knobs.reduce((k, b) => k + b.amp * Math.exp(-(1 - dot(d, b.d)) * 3.5), 1);
    const surface = (d: Vec3, jitter = 1): Vec3 => {
      const k = reach(d) * jitter;
      // A clipped hedge's top is sheared nearly flat: the upper third squashed toward a plane.
      const y = clipped && d[1] > 0 ? d[1] * (1 - 0.35 * smooth(0.3, 1, d[1])) : d[1];
      return add(center, [d[0] * radius[0] * k, y * radius[1] * k, d[2] * radius[2] * k]);
    };
    const vertexAt = (j: number, i: number) => {
      const pole = j === 0 || j === rings;
      const theta = (Math.PI * j) / rings;
      const phi = tau * ((pole ? 0 : i) / sectors + (j % 2) * (0.5 / sectors));
      const d: Vec3 = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
      const jitter = clipped ? 1 : 0.94 + 0.12 * hash2(seed * 31 + j, pole ? 0 : i % sectors, 744);
      const n = normal([d[0] / radius[0], d[1] / radius[1], d[2] / radius[2]]);
      const sun = Math.max(0, d[1]);
      const paint: Paint = {
        color: mixHex(mixHex(color, '#9ea374', 0.2 * sun), '#2f3a29', 0.12 * hash2(seed, j * sectors + i, 745)),
        alpha: 0.5 + 0.5 * smooth(-0.75, 0.35, d[1]),
      };
      return { p: surface(d, jitter), n, paint };
    };
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < sectors; i++) {
        const [a, b] = [vertexAt(j, i), vertexAt(j, i + 1)];
        const [c, d] = [vertexAt(j + 1, i + 1), vertexAt(j + 1, i)];
        const triangles = j === 0 ? [[a, c, d]] : j === rings - 1 ? [[a, b, d]] : [[a, b, c], [a, c, d]];
        for (const triangle of triangles) for (const v of triangle) props.vertex(v.p, v.n, v.paint, LEAF_INK);
      }
    }
    // Flowers: small pale-pink stars sat just proud of the sunny side.
    for (let k = 0; k < flowers; k++) {
      const y = 0.95 * hash2(seed, k, 746) - 0.15, a = tau * hash2(seed, k, 747), r = Math.sqrt(1 - y * y);
      const d: Vec3 = [Math.cos(a) * r, y, Math.sin(a) * r];
      const at = surface(d, 1.03);
      const t1 = normal(cross(d, [0, 1, 0.3])), t2 = cross(d, t1);
      const size = (0.08 + 0.05 * hash2(seed, k, 748)) * F;
      const corner = (angle: number) => add(at, add(scale(t1, Math.cos(angle) * size), scale(t2, Math.sin(angle) * size)));
      const spin = tau * hash2(seed, k, 749);
      props.triangle(corner(spin), corner(spin + tau / 3), corner(spin + (2 * tau) / 3), d, { color: PINK[k % PINK.length] }, NO_INK);
    }
    return surface;
  };

  /**
   * A shrub on the locker bank (feet): two to four overlapping masses of differing size round a main one, lifted
   * a little off the dirt so the woody stems show underneath, a few leaves breaking the outline.
   */
  const clump = (u: number, z: number, size: number, seed: number, palette: readonly string[], squat = 0.86, flowers = 0) => {
    const masses = 2 + Math.floor(hash2(seed, 0, 751) * 3);
    const main = palette[seed % palette.length];
    const lift = 0.5 + 0.3 * hash2(seed, 1, 751);
    const crowns: Array<[Vec3, number]> = [];
    for (let m = 0; m < masses; m++) {
      const angle = tau * hash2(seed, m, 752);
      const off = m === 0 ? 0 : size * (0.45 + 0.3 * hash2(seed, m, 753));
      const r = size * (m === 0 ? 1 : 0.55 + 0.3 * hash2(seed, m, 754));
      const [mu, mz] = [u + Math.cos(angle) * off, z + Math.sin(angle) * off];
      const center = onBank(mu, lift + r * squat * 0.92, mz);
      const color = m === 0 ? main : mixHex(main, palette[(seed + m) % palette.length], 0.6);
      const surface = lump(center, [r * F, r * squat * F, r * 0.92 * F], seed * 7 + m, color, { sectors: 7, flowers: Math.round(flowers * r / size) });
      crowns.push([center, r]);
      // A few leaves standing out of the mass's sunny side.
      for (let k = 0; k < 3; k++) {
        const a = tau * hash2(seed * 7 + m, k, 755), y = 0.8 * hash2(seed * 7 + m, k, 756) - 0.2;
        const p = surface([Math.cos(a) * Math.sqrt(1 - y * y), y, Math.sin(a) * Math.sqrt(1 - y * y)], 0.98);
        const length = (0.35 + 0.2 * hash2(seed, k + m * 3, 757)) * F;
        leaf(p, length, length * 0.2, a + 0.3, -0.15 - 0.3 * hash2(seed, k, 758), mixHex(color, '#a1a476', 0.25));
      }
    }
    // The woody stems: out of the dirt at the clump's heart, up into the masses.
    for (const [k, [center, r]] of crowns.entries()) {
      const base = onBank(u + 0.15 * (hash2(seed, k, 759) - 0.5) * size, -0.1, z + 0.15 * (hash2(seed, k, 760) - 0.5) * size);
      const top = add(center, [0, -r * squat * 0.2 * F, 0]);
      const mid = add(scale(add(base, top), 0.5), [(hash2(seed, k, 761) - 0.5) * 0.4 * F, 0, (hash2(seed, k, 762) - 0.5) * 0.4 * F]);
      branch([base, mid, top], [0.09 * F, 0.06 * F, 0.03 * F], BARK, seed + k);
    }
    feet.push({ at: onBank(u, 0, z), radius: size * 1.15 * F });
  };

  // The locker bank (refs/41, 59): dense rounded olive clumps scattered unevenly with bare dirt between, smaller
  // scrub near the top, low pink-flowering bushes near the stair foot. Thrown at random and kept where they don't
  // crowd a neighbour, the side filmer's view or the far rail's riders.
  const placed: Array<[number, number, number]> = [];
  const fits = (u: number, z: number, size: number) =>
    z - size > 19.5 && !inFilmersView(u, z, size) && placed.every(([pu, pz, ps]) => Math.hypot(u - pu, z - pz) > 0.82 * (size + Math.abs(ps)));
  for (let k = 0; k < 300 && placed.length < 30; k++) {
    const u = 1.5 + 17 * hash2(k, 0, 771);
    const z = 20 + 102 * hash2(k, 1, 772);
    // Thicker in drifts along the bank, thinner in others: never an even spread.
    if (hash2(k, 2, 773) > 0.5 + 0.5 * smooth(0.25, 0.7, hash2(Math.floor(z / 18), 0, 774))) continue;
    const size = u < 5 ? 1.3 + 0.6 * hash2(k, 3, 775) : 1.9 + 1.4 * hash2(k, 3, 775);
    if (!fits(u, z, size)) continue;
    placed.push([u, z, size]);
    clump(u, z, size, 100 + k, OLIVE);
  }
  for (let k = 0; k < 40 && placed.filter((p) => p[2] < 0).length < 4; k++) {
    const u = 16.5 + 3 * hash2(k, 0, 781);
    const z = 21 + 16 * hash2(k, 1, 782);
    const size = 1.3 + 0.5 * hash2(k, 2, 783);
    if (!fits(u, z, size)) continue;
    placed.push([u, z, -size]);
    clump(u, z, size, 300 + k, PINK_LEAF, 0.62, 34);
  }
  // Ground cover: low dark mats creeping over the dirt between the shrubs.
  for (let k = 0, mats = 0; k < 80 && mats < 10; k++) {
    const u = 2 + 17 * hash2(k, 0, 791);
    const z = 21 + 98 * hash2(k, 1, 792);
    const size = 1.4 + 1.2 * hash2(k, 2, 793);
    if (placed.some(([pu, pz, ps]) => Math.hypot(u - pu, z - pz) < 0.7 * (size + Math.abs(ps))) || inFilmersView(u, z, size) || z - size < 19.5) continue;
    lump(onBank(u, 0.05, z), [size * F, 0.35 * F, size * 0.8 * F], 500 + k, mixHex('#4a5a3a', OLIVE[k % OLIVE.length], 0.4), { sectors: 7, rings: 3, bumps: 0.2 });
    mats++;
  }

  // The canopy bank (refs/34, 46): two rows of big clipped hedges, each its own size and shape, touching their
  // neighbours along the row and across it.
  for (const [row, u] of [2.8, 8.7].entries()) {
    for (let z = -12, k = 0; z >= -84; z -= 7, k++) {
      const seed = 600 + row * 40 + k;
      const size = 0.88 + 0.24 * hash2(seed, 0, 801);
      const [ru, rh, rz] = [3.1 * size, (2.2 + 0.5 * hash2(seed, 1, 801)) * size, (3.6 + 0.3 * hash2(seed, 2, 801)) * size];
      const dz = 0.6 * (hash2(seed, 3, 801) - 0.5);
      const color = HEDGE[(seed * 3) % HEDGE.length];
      lump(onBank(u, rh * 0.82, z + dz), [ru * F, rh * F, rz * F], seed, color, { sectors: 10, rings: 6, bumps: 0.12, clipped: true });
      feet.push({ at: onBank(u, 0, z + dz), radius: ru * F });
    }
  }

  // A few long gum leaves, bark strips, stones and wiry grass on the bank; the soil draws the fine litter.
  for (let k = 0; k < LITTER; k++) {
    const u = 5 + hash2(k, 0, 732) * (20 * F - 10);
    const z = 19 * F + hash2(k, 1, 733) * 100 * F;
    const y = hill(u) + 0.42;
    const angle = hash2(k, 2, 734) * tau;
    const length = 5 + 7 * hash2(k, 3, 735);
    const color = DRY[k % DRY.length];
    // Each end follows the bank's slope, so nothing floats.
    const start: Vec3 = [u, y, z];
    const endU = u + Math.cos(angle) * length;
    const end: Vec3 = [endU, hill(endU) + 0.55, z + Math.sin(angle) * length];
    const mid = scale(add(start, end), 0.5);
    const width = length * (k % 5 === 0 ? 0.42 : 0.16);
    const offset: Vec3 = [-Math.sin(angle) * width, 0.4, Math.cos(angle) * width];
    face(start, add(mid, offset), end, color, [0, 1, 0]);
    face(start, end, sub(mid, offset), color, [0, 1, 0]);
    if (k % 4 === 0) {
      const top = add(mid, [0, 1 + hash2(k, 4, 736) * 2, 0]);
      face(start, top, add(mid, offset), '#9a937d');
      face(end, sub(mid, offset), top, '#aaa18b');
    }
    if (k % 3 === 0) {
      for (let j = 0; j < 3; j++) {
        const a = angle + j * 1.2;
        const height = 5 + 8 * hash2(k, j, 737);
        const tip = add(start, [Math.cos(a) * height * 0.55, height, Math.sin(a) * height * 0.55]);
        face(start, add(start, [Math.sin(a) * 0.65, 0, Math.cos(a) * 0.65]), tip, '#7f805b', normal([Math.cos(a), 0.4, Math.sin(a)]));
      }
    }
  }

  return feet;
}
