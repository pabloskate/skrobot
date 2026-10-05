import { lambert } from '../scene/camera';
import { mixHex } from '../scene/math';
import { hash2 } from '../scene/setKit';
import { STAIR_RUN } from '../scene/stairs';
import { Bake, NO_INK, type Ink } from './bake';
import {
  BED,
  BUILDING_BACK,
  BUILDING_END,
  BUILDING_LENGTH,
  DIRT_WIDTH,
  HILL_EDGE,
  WALL_THICK,
  WALL_Z,
  hill,
} from './elToroLayout';
import type { Vec3 } from './view';

/** A foliage volume for the ground's soft, camera-independent sun shadows. */
export interface ElToroCanopyShadow {
  center: Vec3;
  radius: number;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normal = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(...a) || 1));
const tau = 2 * Math.PI;
const leaves = ['#58624c', '#64705a', '#4b5949', '#727959', '#6a7664'];
const canopyLeaves = ['#586d43', '#667d50', '#4b633d', '#74885a', '#536b43'];
const dry = ['#8a7960', '#a29270', '#6f6453', '#b5a080', '#726c50'];
/** Surface class 13 adds the fine leaf dappling without outlining every leaflet. */
const LEAF_INK: Ink = { ...NO_INK, solid: 13 };

/** Sun is evaluated in world space once, so foliage does not relight as the camera orbits. */
function sunColor(color: string, n: Vec3): string {
  const light = lambert({ x: n[0], y: -n[1], z: n[2] });
  return light > 0.5
    ? mixHex(color, '#d3d0a9', (light - 0.5) * 0.36)
    : mixHex(color, '#29362e', (0.5 - light) * 0.75);
}

/**
 * Photograph-guided planting: sparse woody shrubs on the exposed bank, a
 * trimmed bed beyond the wall, and mature trees behind the school. Every
 * leaf, branch and scrap of mulch is real geometry, merged into the prop mesh.
 */
export function buildElToroLandscape(props: Bake, dir: 1 | -1): ElToroCanopyShadow[] {
  const P = (u: number, y: number, z: number): Vec3 => [dir * u, y, z];
  const shadows: ElToroCanopyShadow[] = [];
  const back = BUILDING_BACK;
  const buildingStart = BUILDING_END - BUILDING_LENGTH;

  const face = (a: Vec3, b: Vec3, c: Vec3, color: string, preferredNormal?: Vec3, ink: Ink = NO_INK) => {
    const n = preferredNormal ?? normal(scale(cross(sub(b, a), sub(c, a)), dir));
    props.triangle(a, b, c, n, { color: sunColor(color, n) }, ink);
  };

  /** A tapered, crooked branch, with sun-shaded bark rather than screen-space bands. */
  const branch = (points: Vec3[], radii: number[], color: string, seed: number, sides = 6) => {
    const rings = points.map((p, i) => {
      const axis = normal(sub(points[Math.min(points.length - 1, i + 1)], points[Math.max(0, i - 1)]));
      const across = normal(scale(cross(axis, Math.abs(axis[1]) > 0.85 ? [dir, 0, 0] : [0, 1, 0]), dir));
      const along = scale(cross(axis, across), dir);
      return Array.from({ length: sides }, (_, k) => {
        const angle = (k / sides) * tau;
        const n = add(scale(across, Math.cos(angle)), scale(along, Math.sin(angle)));
        const p1 = add(p, scale(n, radii[i] * (0.93 + 0.14 * hash2(seed, k, 709))));
        return { p: p1, n };
      });
    });
    for (let i = 0; i < points.length - 1; i++) {
      for (let k = 0; k < sides; k++) {
        const a = rings[i][k];
        const b = rings[i][(k + 1) % sides];
        const c = rings[i + 1][(k + 1) % sides];
        const d = rings[i + 1][k];
        const bark = mixHex(color, '#6d695a', 0.22 * hash2(seed, k, 710));
        for (const v of [a, c, b, a, d, c]) props.vertex(v.p, v.n, { color: sunColor(bark, v.n) }, NO_INK);
      }
    }
  };

  /** Small folded lanceolate leaves add broken silhouettes without alpha textures. */
  const leaf = (p: Vec3, length: number, width: number, angle: number, lift: number, color: string) => {
    const axis: Vec3 = [dir * Math.cos(angle), lift, Math.sin(angle)];
    const across: Vec3 = [-dir * Math.sin(angle), 0, Math.cos(angle)];
    const end = add(p, scale(axis, length));
    const mid = add(add(p, scale(axis, length * 0.46)), [0, width * 0.23, 0]);
    const left = add(mid, scale(across, width));
    const right = add(mid, scale(across, -width));
    for (const edge of [left, right]) {
      let n = normal(cross(sub(edge, p), sub(end, p)));
      if (n[1] < 0) n = scale(n, -1);
      face(p, edge, end, color, n, LEAF_INK);
    }
  };

  /** An asymmetric twig-sized spray, with a shaded interior and loose individual leaves. */
  const foliage = (center: Vec3, radius: Vec3, seed: number, color: string, small = false, palette = leaves) => {
    const sectors = small ? 8 : 6;
    const rings = [-0.64, -0.1, 0.56].map((v, j) =>
      Array.from({ length: sectors }, (_, k) => {
        const angle = tau * (k / sectors + j * 0.043);
        const r = (j === 1 ? 1 : 0.68) * (small ? 0.56 + 0.64 * hash2(seed + j, k, 711) : 0.7 + 0.38 * hash2(seed + j, k, 711));
        const offset: Vec3 = [
          dir * radius[0] * (Math.cos(angle) * r + 0.16 * v),
          radius[1] * (v + (small ? 0.52 : 0.28) * (hash2(seed + j, k, 712) - 0.5)),
          radius[2] * (Math.sin(angle) * r - 0.24 * v),
        ];
        return { p: add(center, offset), n: normal([offset[0] / radius[0], offset[1] / radius[1], offset[2] / radius[2]]) };
      }),
    );
    const peak = { p: add(center, [dir * radius[0] * 0.13, radius[1] * 0.83, -radius[2] * 0.17]), n: [0, 1, 0] as Vec3 };
    const foot = { p: add(center, [-dir * radius[0] * 0.12, -radius[1] * 0.9, radius[2] * 0.12]), n: [0, -1, 0] as Vec3 };
    for (let k = 0; k < sectors; k++) {
      const next = (k + 1) % sectors;
      const variation = mixHex(color, '#354535', 0.12 * hash2(seed, k, 713));
      const triangles = [
        [foot, rings[0][next], rings[0][k]],
        [rings[2][k], rings[2][next], peak],
      ];
      for (let j = 0; j < 2; j++) {
        triangles.push([rings[j][k], rings[j][next], rings[j + 1][next]], [rings[j][k], rings[j + 1][next], rings[j + 1][k]]);
      }
      for (const triangle of triangles) {
        for (const v of triangle) props.vertex(v.p, v.n, { color: sunColor(variation, v.n) }, LEAF_INK);
      }
    }
    const count = small ? 34 : 18;
    for (let k = 0; k < count; k++) {
      const angle = tau * hash2(seed, k, 714);
      const y = 1.6 * hash2(seed, k, 715) - 0.8;
      const r = Math.sqrt(1 - y * y);
      const p = add(center, [dir * Math.cos(angle) * radius[0] * r, y * radius[1], Math.sin(angle) * radius[2] * r]);
      const length = (small ? 9 : 11) * (0.7 + hash2(seed, k, 716));
      const leafletColor = small ? palette[(seed + k) % palette.length] : color;
      leaf(p, length, length * (small ? 0.22 : 0.15), angle + 0.4, -0.2 - 0.3 * hash2(seed, k, 717), leafletColor);
    }
  };

  const tree = (u: number, z: number, height: number, spread: number, seed: number) => {
    const ground = hill(u);
    const leanU = 28 * (hash2(seed, 0, 718) - 0.5);
    const leanZ = 35 * (hash2(seed, 0, 719) - 0.5);
    const trunk = [P(u, ground, z), P(u + leanU * 0.4, ground + height * 0.31, z + leanZ * 0.3), P(u + leanU, ground + height * 0.66, z + leanZ)];
    const girth = 8 + height * 0.007;
    branch(trunk, [girth, girth * 0.73, girth * 0.38], '#aba995', seed, 8);
    for (let k = 0; k < 3; k++) {
      const a = k * tau / 3 + hash2(seed, k, 720);
      const atU = u + Math.cos(a) * girth * 2.5;
      branch([P(atU, hill(atU) + 0.5, z + Math.sin(a) * girth * 2.5), P(u, ground + girth * 2.5, z)], [girth * 0.13, girth * 0.57], '#8e8c78', seed + k, 5);
    }
    for (let k = 0; k < 6; k++) {
      const a = k * tau / 6 + 0.65 * hash2(seed, k, 721);
      const reach = spread * (0.56 + 0.48 * hash2(seed, k, 722));
      const atU = u + leanU + Math.cos(a) * reach;
      const atZ = z + leanZ + Math.sin(a) * reach;
      const top = ground + height * (0.78 + 0.2 * hash2(seed, k, 723));
      const join = P(u + leanU * 0.7, ground + height * (0.42 + k * 0.035), z + leanZ * 0.7);
      const bend = P(u + leanU + Math.cos(a) * reach * 0.56, top - height * 0.15, z + leanZ + Math.sin(a) * reach * 0.6);
      const end = P(atU, top, atZ);
      branch([join, bend, end], [girth * 0.5, girth * 0.24, 1.2], '#aaa791', seed * 9 + k, 6);
      for (let j = 0; j < 2; j++) {
        const fan = a + (j - 0.5) * 1.1;
        const radius = spread * (0.29 + 0.08 * hash2(seed + k, j, 724));
        const crown = add(end, [dir * Math.cos(fan) * radius * 0.9, radius * (j === 1 ? 0.3 : -0.35), Math.sin(fan) * radius * 0.9]);
        branch([bend, crown], [1.7, 0.45], '#827f6b', seed + k * 3 + j, 4);
        foliage(crown, [radius * 0.95, radius * (0.8 + 0.3 * hash2(seed + j, k, 725)), radius * 0.8], seed * 40 + k * 3 + j, leaves[(seed + k + j) % leaves.length]);
      }
    }
    shadows.push({ center: P(u + leanU, ground + height * 0.85, z + leanZ), radius: spread * 1.05 });
  };

  // Irregular groves behind the roofline, with a few tall trees on the distant bank.
  // The u coordinates stop before the bottom landing; the skater's concrete lane stays clear.
  const trees: Array<[number, number, number, number]> = [
    [buildingStart + 220, back + 180, 665, 175],
    [buildingStart + 690, back + 255, 755, 215],
    [BUILDING_END - 250, back + 210, 630, 165],
    [BUILDING_END - 640, back + 780, 850, 245],
    [STAIR_RUN * 0.17, HILL_EDGE - 950, 680, 170],
    [STAIR_RUN * 0.72, HILL_EDGE - 1420, 760, 230],
    [STAIR_RUN * 0.42, HILL_EDGE - 2050, 870, 250],
    [STAIR_RUN * 0.8, WALL_Z + 970, 710, 200],
  ];
  trees.forEach(([u, z, height, spread], i) => tree(u, z, height, spread, i + 20));

  const shrub = (u: number, z: number, radius: number, seed: number, hedge: boolean, palette = leaves) => {
    const foot = hill(u);
    for (let k = 0; k < 4; k++) {
      const angle = k * tau / 4 + hash2(seed, k, 726) * 0.7;
      const reach = radius * (0.26 + hash2(seed, k, 727) * 0.43);
      const height = radius * (hedge ? 1.1 : 0.86) * (0.7 + hash2(seed, k, 728) * 0.4);
      const head = P(u + Math.cos(angle) * reach, foot + height, z + Math.sin(angle) * reach);
      branch([P(u, foot + 0.3, z), P(u + Math.cos(angle) * reach * 0.44, foot + height * 0.66, z + Math.sin(angle) * reach * 0.45), head], [1.5, 0.85, 0.25], '#777460', seed + k, 4);
      const r = radius * (hedge ? 0.62 : 0.5);
      foliage(head, [r, r * (hedge ? 0.84 : 0.69), r * 0.82], seed * 10 + k, palette[(seed + k) % palette.length], true, palette);
    }
    if (shadows.length < 24) shadows.push({ center: P(u, foot + radius * 0.55, z), radius: radius * 0.95 });
  };

  // Fuller planting below the canopy piers, as in the covered-walkway
  // reference. Roots remain on the bank, clear of the concrete upper apron;
  // low crowns soften the pier bases without filling the open roof bays.
  const canopyShrubs: Array<[number, number, number]> = [
    [10, -320, 62], [25, -540, 72], [60, -740, 68], [5, -980, 76],
  ];
  canopyShrubs.forEach(([u, z, radius], i) => shrub(u, z, radius, 95 + i, true, canopyLeaves));

  // Open spaces between the shrubs expose the dry mulch and woody stems in the references.
  const shrubs: Array<[number, number, number]> = [
    [0.1, 135, 33], [0.13, 330, 40], [0.24, 235, 31], [0.35, 95, 35],
    [0.45, 380, 43], [0.56, 205, 30], [0.69, 110, 40], [0.76, 320, 46],
    [0.9, 170, 35], [0.58, 465, 33],
  ];
  shrubs.forEach(([along, across, r], i) => shrub(STAIR_RUN * along, HILL_EDGE - across, r * 1.25, i + 43, false));
  const bedZ = WALL_Z + WALL_THICK + BED * 0.58;
  for (let k = 0; k < 10; k++) {
    const u = STAIR_RUN * (0.045 + k * 0.098);
    shrub(u, bedZ + (hash2(k, 0, 730) - 0.5) * 13, (26 + hash2(k, 1, 731) * 7) * 1.12, k + 71, true);
  }

  // Dry eucalyptus leaves, bark chips, small stones and sparse wiry grass on soil only.
  for (let k = 0; k < 410; k++) {
    const u = 5 + hash2(k, 0, 732) * (STAIR_RUN - 10);
    const z = HILL_EDGE - 7 - hash2(k, 1, 733) * (DIRT_WIDTH - 18);
    const y = hill(u) + 0.42;
    const angle = hash2(k, 2, 734) * tau;
    const length = 2.3 + 5.8 * hash2(k, 3, 735);
    const color = dry[k % dry.length];
    // Match the bank's slope independently at each point to avoid floating litter.
    const start = P(u, y, z);
    const endU = u + Math.cos(angle) * length;
    const end = P(endU, hill(endU) + 0.55, z + Math.sin(angle) * length);
    const mid = scale(add(start, end), 0.5);
    const width = length * (k % 5 === 0 ? 0.42 : 0.16);
    const offset: Vec3 = [-dir * Math.sin(angle) * width, 0.4, Math.cos(angle) * width];
    face(start, add(mid, offset), end, color, [0, 1, 0]);
    face(start, end, sub(mid, offset), color, [0, 1, 0]);
    if (k % 11 === 0) {
      const top = add(mid, [0, 1 + hash2(k, 4, 736) * 2, 0]);
      face(start, top, add(mid, offset), '#9a937d');
      face(end, sub(mid, offset), top, '#aaa18b');
    }
    if (k % 9 === 0) {
      for (let j = 0; j < 3; j++) {
        const a = angle + j * 1.2;
        const height = 5 + 8 * hash2(k, j, 737);
        const tip = add(start, [dir * Math.cos(a) * height * 0.55, height, Math.sin(a) * height * 0.55]);
        face(start, add(start, [dir * Math.sin(a) * 0.65, 0, Math.cos(a) * 0.65]), tip, '#7f805b', normal([dir * Math.cos(a), 0.4, Math.sin(a)]));
      }
    }
  }

  return shadows;
}
