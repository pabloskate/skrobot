import type { Bake } from '../../three/bake';
import type { Vec3 } from '../../camera/view';
import { hash2 } from '../setKit';
import { INK, floor, ft, normalOf, plainBox, tubeFt, worldBox } from './leapOfFaithKit';
import { LEAP_OF_FAITH_FOOT as F } from './leapOfFaithLayout';
import { LEAP_OF_FAITH_PAINT as PAINT } from './leapOfFaithPalette';
import { buildLeapOfFaithFurniture } from './leapOfFaithFurniture';
import { LEAP_OF_FAITH_TREES } from './leapOfFaithTrees';

export { LEAP_OF_FAITH_TABLES, LEAP_OF_FAITH_BENCHES } from './leapOfFaithFurniture';

/**
 * The places round the court, in world axes and feet (SITE_PLAN.md blocks 5 and 6): the upper terrace and the
 * far block closing it, the perimeter wall with its two barred gates, the street with its kerbs and sidewalks,
 * the low houses beyond, and the furniture. Nothing here carries a name.
 */

const COURT = -14.3;
/** The perimeter wall's line (x, feet), its thickness and its top. */
const PERIMETER_X = 85;
const PERIMETER_TOP = -7.3;
/** The two barred gates' near ends along the perimeter wall (z, feet), each 10 ft wide. */
const GATE_Z = [0, 60];
const GATE_WIDTH = 10;
/** The street's asphalt (x, feet) between its kerbs, and the sidewalks' top (6 in kerbs). */
const STREET: [number, number] = [97, 135];
const SIDEWALK_TOP = COURT + 0.5;
/** The street's run along z, past both ends of the court. */
const STREET_Z: [number, number] = [-116, 140];

export function buildLeapOfFaithCourt(b: Bake, ground: Bake) {
  terrace(b, ground);
  perimeter(b);
  street(b, ground);
  houses(b);
  buildLeapOfFaithFurniture(b);
}

/**
 * The upper terrace (the big central court), abutting the original walkway without overlapping its top; the
 * planted slope rising beside the left block; and the far two-storey block closing it, with two window bands.
 */
function terrace(b: Bake, ground: Bake) {
  floor(ground, -150 * F, -42 * F, -56 * F, 24 * F, 0, PAINT.walkway);
  floor(ground, -42 * F, 0, 20 * F, 24 * F, 0, PAINT.walkway);
  floor(ground, -150 * F, -68 * F, 24 * F, 110 * F, 0, PAINT.walkway);
  const slope: Vec3 = [-0.2425, 0.9701, 0];
  ground.quad(ft([-68, 0, 110]), ft([-60, 2, 110]), ft([-60, 2, 24]), ft([-68, 0, 24]), slope, { color: PAINT.soil }, INK.soil);
  worldBox(b, [-165, 0, -116], [-150, 24, 110], PAINT.cream, { kind: 'cast', faces: 'tefk' });
  for (let z = -110; z < 105; z += 18) {
    for (const y of [4, 16]) {
      b.box(ft([-150, y, z]), [-150 * F + 1, (y + 5) * F, Math.min(z + 14, 109) * F], PAINT.glass, PAINT.glass, INK.glass, 'e');
    }
  }
}

/**
 * The perimeter wall along x = 85: pale painted concrete block in courses, 7 ft high, with a cast cap; two steel
 * gates in it, a heavy frame and a bar every 10 in, stout enough to stay solid at the court's distances.
 */
function perimeter(b: Bake) {
  const [g0, g1] = GATE_Z;
  const panels: [number, number][] = [[-56, g0], [g0 + GATE_WIDTH, g1], [g1 + GATE_WIDTH, 110]];
  for (const [a, c] of panels) {
    worldBox(b, [PERIMETER_X, COURT, a], [PERIMETER_X + 1, PERIMETER_TOP - 0.3, c], PAINT.block, { sides: INK.block, faces: 'fkle' });
    worldBox(b, [PERIMETER_X - 0.12, PERIMETER_TOP - 0.3, a], [PERIMETER_X + 1.12, PERIMETER_TOP, c], PAINT.blockCap, { kind: 'cast', foot: COURT });
  }
  const x = PERIMETER_X + 0.5;
  for (const z of GATE_Z) {
    const z1 = z + GATE_WIDTH;
    // Square posts each side, then the frame and the bars.
    plainBox(b, [x - 0.25, COURT, z], [x + 0.25, PERIMETER_TOP + 0.4, z + 0.45], PAINT.gate, INK.metal, 'tfkle');
    plainBox(b, [x - 0.25, COURT, z1 - 0.45], [x + 0.25, PERIMETER_TOP + 0.4, z1], PAINT.gate, INK.metal, 'tfkle');
    for (const y of [COURT + 0.35, -10.6, PERIMETER_TOP - 0.15]) tubeFt(b, [[x, y, z + 0.45], [x, y, z1 - 0.45]], 2.6, PAINT.gate, INK.metal, 6);
    for (let k = 1; k * 0.83 < GATE_WIDTH - 0.9; k++) {
      tubeFt(b, [[x, COURT + 0.35, z + 0.45 + k * 0.83], [x, PERIMETER_TOP - 0.15, z + 0.45 + k * 0.83]], 1.9, PAINT.gate, INK.metal, 5);
    }
  }
}

/**
 * Beyond the wall: the near sidewalk, a 6 in kerb, the street's asphalt (the look's), the far kerb and sidewalk;
 * a soil well round each street tree's foot.
 */
function street(b: Bake, ground: Bake) {
  const [s0, s1] = STREET_Z;
  const kerb = { kind: 'cast' as const, top: PAINT.kerb };
  worldBox(b, [PERIMETER_X + 1, COURT, s0], [STREET[0], SIDEWALK_TOP, s1], PAINT.kerb, { ...kerb, top: PAINT.sidewalk, faces: 'te' });
  worldBox(b, [STREET[1], COURT, s0], [150, SIDEWALK_TOP, s1], PAINT.kerb, { ...kerb, top: PAINT.sidewalk, faces: 'tl' });
  ground.quad(
    ft([STREET[0], -14.28, s1]), ft([STREET[1], -14.28, s1]), ft([STREET[1], -14.28, s0]), ft([STREET[0], -14.28, s0]),
    [0, 1, 0], { color: PAINT.asphalt }, INK.asphalt,
  );
  for (const { at: [tx, , tz] } of LEAP_OF_FAITH_TREES) {
    const [x, z] = [tx / F, tz / F];
    if (x < STREET[0] - 11 || x > STREET[1] + 15 || (x > STREET[0] && x < STREET[1])) continue;
    worldBox(b, [x - 2, SIDEWALK_TOP, z - 2], [x + 2, SIDEWALK_TOP + 1 / F, z + 2], PAINT.soil, { topInk: INK.soil, faces: 't' });
  }
}

/**
 * A row of low stucco houses across the street, a little more than boxes: a gable roof, a band of windows and a
 * door on the street face; and the low church-like ridge, an anonymous silhouette only (refs 03, 77).
 */
function houses(b: Bake) {
  let k = 0;
  for (let z = -95; z < 125; z += 38, k++) {
    const [x0, x1, z1] = [155, 186, z + 27];
    const wallTop = -3;
    worldBox(b, [x0, COURT, z], [x1, wallTop, z1], k % 2 ? PAINT.houseAlt : PAINT.house, { kind: 'cast', faces: 'fkle' });
    const roof = hash2(k, 1, 811) > 0.4 ? PAINT.roofTile : PAINT.roofGrey;
    gable(b, x0 - 1.2, x1 + 1.2, z - 1, z1 + 1, wallTop, wallTop + 5.5, roof);
    b.quad(ft([x0 - 1 / F, -10, z1 - 3]), ft([x0 - 1 / F, -10, z + 3]), ft([x0 - 1 / F, -6.5, z + 3]), ft([x0 - 1 / F, -6.5, z1 - 3]), [-1, 0, 0], { color: PAINT.glass }, INK.glass);
    plainBox(b, [x0 - 0.1, COURT, z + 12], [x0, -7.3, z + 15], PAINT.door, INK.metal, 'l');
  }
  b.quad(ft([155, -3, 57]), ft([188, -3, 57]), ft([188, 4, 70.5]), ft([155, 4, 70.5]), [0, 0.89, -0.46], { color: PAINT.churchRoof }, INK.roofing);
  b.quad(ft([155, 4, 70.5]), ft([188, 4, 70.5]), ft([188, -3, 84]), ft([155, -3, 84]), [0, 0.89, 0.46], { color: PAINT.churchRoof }, INK.roofing);
}

/** A gable roof over x0-x1 (its ridge along z), eaves at `eave`, ridge at `ridge`, gable ends closed in the walls' paint. */
function gable(b: Bake, x0: number, x1: number, z0: number, z1: number, eave: number, ridge: number, color: string) {
  const mid = (x0 + x1) / 2;
  const front: Vec3[] = [ft([x0, eave, z1]), ft([x0, eave, z0]), ft([mid, ridge, z0]), ft([mid, ridge, z1])];
  const back: Vec3[] = [ft([x1, eave, z0]), ft([x1, eave, z1]), ft([mid, ridge, z1]), ft([mid, ridge, z0])];
  for (const [a, c, d, e] of [front, back]) b.quad(a, c, d, e, normalOf(a, c, d), { color }, INK.roofing);
  for (const z of [z0 + 1, z1 - 1]) {
    const tri: Vec3[] = [ft([x0 + 1.2, eave, z]), ft([x1 - 1.2, eave, z]), ft([mid, ridge - 0.6, z])];
    b.triangle(tri[0], tri[1], tri[2], [0, 0, z < (z0 + z1) / 2 ? -1 : 1], { color: PAINT.house }, INK.stucco);
  }
}
