import type { Bake } from '../../three/bake';
import type { Vec3 } from '../../camera/view';
import { hash2 } from '../setKit';
import { INK, mixHex, normalOf, worldBox } from './leapOfFaithKit';
import { LEAP_OF_FAITH_FOOT as F } from './leapOfFaithLayout';
import { LEAP_OF_FAITH_PAINT as PAINT } from './leapOfFaithPalette';
import { LEAP_OF_FAITH_TREES } from './leapOfFaithTrees';

/**
 * The planting, world axes in feet: the planter on top of the tall wall with its row of clipped shrubs (refs 20,
 * 82, 91), the trees' square beds on the terrace, and the raised bed with bench seats in the court's far-left
 * corner (ref 03). Shrubs are modelled masses whose leaves the look patterns in three dimensions (`foliage`).
 */

/** The planter's soil, behind the tall wall and in front of the left block (y, feet). */
export const PLANTER_SOIL = 1.5;
/** The shrubs stand on the planter along this line (x) between these ends (z), none past `PLANTER_REACH`. */
const HEDGE_X = 6.6;
const HEDGE_Z: [number, number] = [11, 60];
export const PLANTER_REACH = 8.6;
/** The raised bed in the court's far-left corner, round both corner trees: x0, x1, z0, z1 and its wall's height. */
export const CORNER_BED = { x: [59, 83] as [number, number], z: [79, 107] as [number, number], top: 1.5 };

export function buildLeapOfFaithPlanting(b: Bake) {
  planter(b);
  hedge(b);
  treeBeds(b);
}

/** The planter's soil from the tall wall back to the left block, with a kerb where it meets the walkway's head. */
function planter(b: Bake) {
  const soil = { topInk: INK.soil };
  worldBox(b, [2, 0, 24], [8.5, PLANTER_SOIL, 110], PAINT.soil, { ...soil, faces: 'tf' });
  worldBox(b, [0.5, 0, 9.5], [8.5, PLANTER_SOIL, 24], PAINT.soil, { ...soil, faces: 't' });
  worldBox(b, [0, 0, 9.5], [0.5, 2, 24], PAINT.white, { top: PAINT.cap, faces: 'tle' });
}

/**
 * The shrubs along the planter, rising 4 to 5 ft over its soil and so 3 or 4 ft over the wall's top (refs 20, 82,
 * 91): rounded, loose and overlapping rather than a clipped box, dusty green with an olive one among them.
 */
function hedge(b: Bake) {
  const [z0, z1] = HEDGE_Z;
  const tones = [PAINT.hedge, PAINT.hedge, PAINT.shrubOlive, PAINT.hedge, PAINT.shrubOlive, PAINT.hedge, PAINT.hedgeDeep];
  let k = 0;
  for (let z = z0 + 1.5; z < z1; k++) {
    const r = 1.8 + 0.35 * hash2(k, 1, 701);
    const x = HEDGE_X - 0.7 + 0.5 * hash2(k, 2, 701);
    const tall = 1.1 + 0.25 * hash2(k, 3, 701);
    shrub(b, [x * F, PLANTER_SOIL * F, z * F], r * F, tall, k, tones[k % tones.length]);
    z += r * (1.15 + 0.3 * hash2(k, 4, 701));
  }
}

/**
 * A rounded shrub of three overlapping masses rooted at `at` (set units): the main one 0.8 `r` in radius, each
 * mass a ball partly sunk into the soil and `tall` times as high as it is wide; every skin wobbles so no two are
 * alike, darker toward the ground. Its reach from `at` is at most 1.1 r across, about 2.3 r tall up.
 */
export function shrub(b: Bake, at: Vec3, r: number, tall: number, seed: number, color: string) {
  const [x, y, z] = at;
  const rings = 5, around = 9, low = -0.45;
  for (let m = 0; m < 3; m++) {
    const a = m * 2.1 + seed, off = m === 0 ? 0 : r * 0.42;
    const rr = r * (m === 0 ? 0.8 : 0.6);
    const cx = x + Math.cos(a) * off, cz = z + Math.sin(a) * off, cy = y + rr * 0.75 * tall;
    const p = (i: number, j: number): Vec3 => {
      const lat = low + (Math.PI / 2 - low) * (i / rings), lon = (j / around) * Math.PI * 2 + m;
      const wob = 0.9 + 0.2 * hash2(seed * 7 + m, i * 10 + (j % around), 733);
      return [cx + Math.cos(lat) * Math.cos(lon) * rr * wob, cy + Math.sin(lat) * rr * tall * wob, cz + Math.cos(lat) * Math.sin(lon) * rr * wob];
    };
    for (let i = 0; i < rings; i++) for (let j = 0; j < around; j++) {
      const a0 = p(i, j), a1 = p(i, j + 1), b1 = p(i + 1, j + 1), b0 = p(i + 1, j);
      const n = normalOf(a0, a1, b1);
      const tone = mixHex(color, PAINT.hedgeDark, 0.3 * (1 - i / rings) + 0.1 * hash2(i, j, seed));
      b.quad(a0, b0, b1, a1, n[1] < -0.2 ? [-n[0], -n[1], -n[2]] : n, { color: tone }, INK.leaves);
    }
  }
}

/**
 * Square kerbed beds under the terrace trees, low enough that no soil floats and no trunk is buried; and in the
 * court's far-left corner one raised bed round both trees, its walls capped with plank seats (ref 03).
 */
function treeBeds(b: Bake) {
  for (const { at: [tx, ty, tz] } of LEAP_OF_FAITH_TREES) {
    const [x, y, z] = [tx / F, ty / F, tz / F];
    if (x > 85 || y < -1) continue;
    worldBox(b, [x - 3, y, z - 3], [x + 3, y + 0.35, z + 3], PAINT.soil, { topInk: INK.soil, faces: 't' });
    for (const dx of [-3.3, 3]) worldBox(b, [x + dx, y, z - 3.3], [x + dx + 0.3, y + 0.5, z + 3.3], PAINT.concrete, { kind: 'cast', faces: 'tfkle' });
    for (const dz of [-3.3, 3]) worldBox(b, [x - 3, y, z + dz], [x + 3, y + 0.5, z + dz + 0.3], PAINT.concrete, { kind: 'cast', faces: 'tfk' });
  }
  const { x: [x0, x1], z: [z0, z1], top } = CORNER_BED;
  const court = -14.3, wall = 0.6;
  worldBox(b, [x0 + wall, court, z0 + wall], [x1 - wall, court + top - 0.25, z1 - wall], PAINT.soil, { topInk: INK.soil, faces: 't' });
  const walls: [Vec3, Vec3][] = [
    [[x0, court, z0], [x1, court + top, z0 + wall]],
    [[x0, court, z1 - wall], [x1, court + top, z1]],
    [[x0, court, z0 + wall], [x0 + wall, court + top, z1 - wall]],
    [[x1 - wall, court, z0 + wall], [x1, court + top, z1 - wall]],
  ];
  walls.forEach(([lo, hi], i) => worldBox(b, lo, hi, PAINT.concrete, { kind: 'cast', use: [0.25, 0], faces: i < 2 ? 'tfkle' : 'tle' }));
  // Plank seats on the two walls facing into the court.
  worldBox(b, [x0 - 0.35, court + top, z0 - 0.35], [x1, court + top + 0.18, z0 + wall + 0.1], PAINT.tableTop, { sides: INK.stucco, topInk: INK.stucco });
  worldBox(b, [x0 - 0.35, court + top, z0 + wall + 0.1], [x0 + wall + 0.1, court + top + 0.18, z1], PAINT.tableTop, { sides: INK.stucco, topInk: INK.stucco, faces: 'tbfle' });
}
