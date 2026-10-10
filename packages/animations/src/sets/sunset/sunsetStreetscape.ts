import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { lambert, tone } from '../../camera/camera';
import type { Vec3 } from '../../camera/view';
import { FOOT as F } from '../elToro/stairs';
import { hash2 } from '../setKit';
import type { CarPlacement, StreetPropPlacements } from '../props/streetProps';
import { sunsetLettering, sunsetPalm } from './sunsetDetails';
import * as layout from './sunsetLayout';

/**
 * The life around the car wash: Sunset Boulevard's traffic, wear and far
 * side; cars in the bays and the side lot with its vacuums and booth; the
 * roof's equipment; and the alley's power lines. Authored, like the rest of
 * the set, at its normalized scale (sunset3d.ts bakes it to world size), and
 * kept off the rider's line: the roof approach, the landing and the rollout,
 * which reaches some twelve feet into the curb lane and no farther.
 */

const SCALE = layout.SUNSET_SCALE;
const lower = -layout.SUNSET_DROP / SCALE;
const BANK_END = layout.SUNSET_BANK_END / SCALE;
const SIDEWALK_END = layout.SUNSET_SIDEWALK_END / SCALE;
const ROOF_BACK = layout.SUNSET_ROOF_BACK / SCALE;
const ROOF_Z0 = layout.SUNSET_ROOF_Z0 / SCALE;
const ROOF_Z1 = layout.SUNSET_ROOF_Z1 / SCALE;
const TAPER_END = layout.SUNSET_BANK_Z0 / SCALE - 12 * F;
/** Sunset's lane lines, out from the near curb: a dashed white, the double yellow, a dashed white, the far curb. */
const LANES = { dash: SIDEWALK_END + 9 * F, middle: SIDEWALK_END + 19 * F, farDash: SIDEWALK_END + 30 * F, farCurb: SIDEWALK_END + 39 * F };
const FAR_FRONT = SIDEWALK_END + 46 * F;
/** The asphalt lies a fraction under the sidewalks; wear paints over it at its own heights. */
const ROAD = lower - 0.3;

const UP: Vec3 = [0, 1, 0];
const lit = (color: string, n: Vec3): Paint => ({ color: tone(color, lambert({ x: n[0], y: -n[1], z: n[2] })) });
const ink = (id: number, priority = 4): Ink => ({ id, priority, width: 0.16, kind: INK_PROP, solid: 10 });
const flat = (bake: Bake, x0: number, x1: number, z0: number, z1: number, y: number, color: string) =>
  bake.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], UP, lit(color, UP), NO_INK);

function blot(bake: Bake, x: number, z: number, y: number, r: number, color: string, seed: number, sides = 9) {
  const at = (i: number): Vec3 => {
    const k = r * (0.78 + 0.32 * hash2(seed, i % sides, 961));
    return [x + Math.cos(i * Math.PI * 2 / sides) * k, y, z + Math.sin(i * Math.PI * 2 / sides) * k * 0.85];
  };
  for (let i = 0; i < sides; i++) bake.triangle([x, y, z], at(i + 1), at(i), UP, lit(color, UP), NO_INK);
}

function seam(bake: Bake, points: Array<[number, number]>, y: number, width: number, color: string) {
  for (let i = 1; i < points.length; i++) {
    const [x0, z0] = points[i - 1], [x1, z1] = points[i];
    const length = Math.hypot(x1 - x0, z1 - z0) || 1;
    const nx = -(z1 - z0) / length * width / 2, nz = (x1 - x0) / length * width / 2;
    bake.quad([x0 + nx, y, z0 + nz], [x1 + nx, y, z1 + nz], [x1 - nx, y, z1 - nz], [x0 - nx, y, z0 - nz], UP, lit(color, UP), NO_INK);
  }
}

export function buildSunsetStreetscape(ground: Bake, props: Bake) {
  buildRoadWear(ground);
  buildSidewalk(ground, props);
  buildLot(ground, props);
  buildBays(props);
  buildRoof(ground, props);
  buildFarSide(ground, props);
  buildPowerLines(props);
}

/** Oil down each lane, a gutter pan, trench patches, tar-sealed cracks and manholes. */
function buildRoadWear(ground: Bake) {
  for (const x of [(SIDEWALK_END + LANES.dash) / 2, (LANES.dash + LANES.middle) / 2, (LANES.middle + LANES.farDash) / 2, (LANES.farDash + LANES.farCurb) / 2]) {
    flat(ground, x - 1.6 * F, x + 1.6 * F, -11000, 11000, ROAD + 0.04, '#6c6f67');
  }
  flat(ground, SIDEWALK_END, SIDEWALK_END + 1.5 * F, -11000, 11000, ROAD + 0.06, '#8a8c83');
  flat(ground, LANES.farCurb - 1.5 * F, LANES.farCurb, -11000, 11000, ROAD + 0.06, '#8a8c83');
  for (let k = 0; k < 8; k++) {
    let x = SIDEWALK_END + (2 + hash2(k, 0, 971) * 35) * F, z = -2600 + hash2(k, 1, 972) * 5200;
    const points: Array<[number, number]> = [[x, z]];
    for (let i = 0; i < 9; i++) {
      x = Math.max(SIDEWALK_END + 2 * F, Math.min(LANES.farCurb - 2 * F, x + (hash2(k, i, 973) - 0.5) * 4 * F));
      z += (hash2(k, i, 974) - 0.3) * 3 * F;
      points.push([x, z]);
    }
    seam(ground, points, ROAD + 0.1, 1.4, '#4f524c');
  }
  for (const [x, z] of [[(LANES.dash + LANES.middle) / 2, -900], [(LANES.middle + LANES.farDash) / 2, 650], [(LANES.farDash + LANES.farCurb) / 2, 2100], [(LANES.dash + LANES.middle) / 2, 1700]]) {
    blot(ground, x, z, ROAD + 0.14, 1.45 * F, '#7d8079', 0, 16);
    blot(ground, x, z, ROAD + 0.16, 1.25 * F, '#55584f', 0, 16);
  }
}

/** Gum and stains on the sidewalk, a hydrant, a bus bench and a city can, all clear of the landing. */
function buildSidewalk(ground: Bake, props: Bake) {
  const GUM = ['#8a8a80', '#7a7b72', '#96958a'];
  for (let k = 0; k < 70; k++) {
    const x = BANK_END + 4 + hash2(k, 0, 981) * (SIDEWALK_END - BANK_END - 8);
    const z = -2200 + hash2(k, 1, 982) * 4600;
    blot(ground, x, z, lower + 0.16, 1.1 + hash2(k, 2, 983) * 1.2, GUM[k % 3], k + 990, 5);
  }
  for (let k = 0; k < 9; k++) {
    const x = BANK_END + 20 + hash2(k, 0, 984) * (SIDEWALK_END - BANK_END - 40);
    blot(ground, x, -2000 + hash2(k, 1, 985) * 4200, lower + 0.15, (0.6 + hash2(k, 2, 986) * 0.9) * F, k % 2 ? '#b5b1a3' : '#b9b5a6', k + 1000, 12);
  }
  const kerb = SIDEWALK_END - 1.2 * F;
  // A faded yellow hydrant, its outlets toward the street.
  {
    const z = 640;
    const yellow: Paint = { color: '#b99a3e', lit: { color: '#d8bf63', from: 0, to: 2 } };
    props.tube([[kerb, lower, z], [kerb, lower + 2.5, z]], [7, 6.5], { color: '#868880' }, NO_INK, 10);
    props.tube([[kerb, lower + 2.5, z], [kerb, lower + 25, z]], [4.8, 4.6], yellow, ink(120, 6), 10);
    props.tube([[kerb, lower + 25, z], [kerb, lower + 28, z], [kerb, lower + 31.5, z]], [5.6, 4.6, 1.4], yellow, ink(121, 6), 10);
    props.tube([[kerb + 3, lower + 17, z], [kerb + 9.5, lower + 17, z]], [2.6, 2.6], yellow, NO_INK, 8);
    for (const side of [-1, 1]) props.tube([[kerb, lower + 19, z + 3 * side], [kerb, lower + 19, z + 8 * side]], [1.9, 1.9], yellow, NO_INK, 8);
    // Red curb either side of it.
    flat(ground, SIDEWALK_END - 0.5 * F, SIDEWALK_END, z - 15 * F, z + 15 * F, lower + 0.17, '#a3574b');
  }
  // A bus bench, its back toward the bank, and the stop's sign on the curb.
  {
    const x = kerb - 2.2 * F, z0 = 1080, z1 = z0 + 6 * F;
    for (const z of [z0 + 6, z1 - 6]) props.box([x - 9, lower, z - 2], [x + 9, lower + 17, z + 2], '#4b524d', '#5a615b', NO_INK);
    props.box([x - 9, lower + 17, z0], [x + 9, lower + 20, z1], '#566a5c', '#6c8273', ink(122, 5));
    props.box([x - 12, lower + 20, z0], [x - 9, lower + 50, z1], '#d8d2bf', '#d8d2bf', ink(123, 5));
    const n: Vec3 = [1, 0, 0];
    props.quad([x - 8.8, lower + 23, z0 + 6], [x - 8.8, lower + 23, z1 - 6], [x - 8.8, lower + 47, z1 - 6], [x - 8.8, lower + 47, z0 + 6], n, lit('#c86a45', n), NO_INK);
    props.quad([x - 8.7, lower + 30, z0 + 20], [x - 8.7, lower + 30, z0 + 70], [x - 8.7, lower + 40, z0 + 70], [x - 8.7, lower + 40, z0 + 20], n, lit('#f0e6cf', n), NO_INK);
    props.tube([[kerb, lower, z1 + F], [kerb, lower + 9 * F, z1 + F]], [1.2, 1.2], { color: '#8f938b' }, NO_INK, 4);
    props.box([kerb - 0.3, lower + 7.3 * F, z1 + F - 13], [kerb + 0.3, lower + 8.9 * F, z1 + F + 13], '#2f6a8c', '#2f6a8c', ink(124, 6));
  }
  // A city trash can between the planters.
  {
    const x = kerb - 0.4 * F, z = 860;
    props.tube([[x, lower, z], [x, lower + 84, z]], [25, 27], { color: '#3d5245', lit: { color: '#5e7564', from: 0, to: 2 } }, ink(125, 6), 12);
    props.tube([[x, lower + 84, z], [x, lower + 90, z]], [28.5, 26], { color: '#47594d' }, ink(126, 6), 12);
  }
}

/** The side lot: parking stalls, vacuum stations, the cashier's booth and a wet apron. */
function buildLot(ground: Bake, props: Bake) {
  for (let z = TAPER_END - 6 * F; z > -2500; z -= 10 * F) flat(ground, -620, -120, z - 1.2, z + 1.2, lower + 0.13, '#e1ddcd');
  flat(ground, -620, -580, -2500, TAPER_END - 6 * F, lower + 0.13, '#e1ddcd');
  // Water run off the drying cars pools on the apron and darkens the paving.
  for (let k = 0; k < 7; k++) blot(ground, -200 + hash2(k, 0, 991) * 360, TAPER_END - 100 - hash2(k, 1, 992) * 900, lower + 0.11, (1.5 + hash2(k, 2, 993) * 3) * F, k % 3 ? '#9b9b8e' : '#8d9696', k + 1100, 14);
  // Self-serve vacuums between the stalls: a post, its head and a curled hose.
  for (const z of [TAPER_END - 11 * F, TAPER_END - 21 * F, TAPER_END - 31 * F]) {
    const x = -90;
    props.box([x - 9, lower, z - 9], [x + 9, lower + 3, z + 9], '#a9a99c', '#b8b7aa', NO_INK);
    props.tube([[x, lower + 3, z], [x, lower + 58, z]], [5.5, 5], { color: '#d4a63a', lit: { color: '#ecc562', from: 0, to: 2 } }, ink(127, 6), 10);
    props.box([x - 10, lower + 58, z - 10], [x + 10, lower + 80, z + 10], '#2f6a8c', '#3a7aa0', ink(128, 6));
    props.tube([[x - 10, lower + 70, z], [x - 26, lower + 66, z + 6], [x - 30, lower + 40, z + 14], [x - 18, lower + 20, z + 10], [x - 8, lower + 34, z + 2]], [2.4, 2.4, 2.4, 2.4, 2.4], { color: '#2d302e' }, NO_INK, 6, false);
  }
  // The cashier's booth by the lot's entrance, with its OPEN sign.
  {
    const x0 = -470, x1 = -360, z0 = TAPER_END - 3 * F, z1 = z0 - 4 * F;
    props.box([x0, lower, z1], [x1, lower + 92, z0], '#d6d0bd', '#dfd9c7', ink(129, 5));
    props.box([x0 - 10, lower + 92, z1 - 10], [x1 + 10, lower + 100, z0 + 10], '#2f6a8c', '#3a7aa0', ink(130, 5));
    const n: Vec3 = [1, 0, 0];
    props.quad([x1 + 0.3, lower + 40, z1 + 12], [x1 + 0.3, lower + 40, z0 - 12], [x1 + 0.3, lower + 82, z0 - 12], [x1 + 0.3, lower + 82, z1 + 12], n, lit('#4f6767', n), NO_INK);
    props.box([x1, lower + 37, z1 + 8], [x1 + 8, lower + 40, z0 - 8], '#c9c4b1', '#d8d3c1', NO_INK);
    props.box([x1 + 0.4, lower + 70, z1 + 30], [x1 + 1, lower + 80, z1 + 70], '#2b2d2b', '#2b2d2b', NO_INK);
    sunsetLettering(props, 'OPEN', [x1 + 1.2, lower + 79, z1 + 66], [0, 0, -1], 1.25, '#e2523f');
  }
  // The neighbor past the lot: a two-story mini-mall, its shops facing Sunset.
  {
    const x0 = -1000, x1 = -140, z0 = -3000, z1 = -2560, h = 15 * F, n: Vec3 = [1, 0, 0], side: Vec3 = [0, 0, 1];
    props.box([x0, lower, z0], [x1, lower + h, z1], '#dccfb4', '#d2c8b2', ink(137, 4));
    props.box([x0 - 6, lower + h, z0 - 6], [x1 + 6, lower + h + 10, z1 + 6], '#b0573c', '#bd6a4e', NO_INK);
    const front = (a: number, b: number, c: number, d: number, color: string, lift: number) =>
      props.quad([x1 + lift, lower + c, a], [x1 + lift, lower + c, b], [x1 + lift, lower + d, b], [x1 + lift, lower + d, a], n, lit(color, n), NO_INK);
    front(z0 + 20, z1 - 20, 12, 112, '#4f6567', 0.2);
    for (let m = z0 + 20; m <= z1 - 20; m += (z1 - z0 - 40) / 4) front(m - 1.6, m + 1.6, 12, 112, '#5c605b', 0.35);
    front(z0 + 20, z1 - 20, 122, 150, '#2f3b45', 0.3);
    for (let k = 0; k < 7; k++) front(z0 + 120 + k * 26, z0 + 138 + k * 26, 130, 142, '#ece6d0', 0.5);
    for (let k = 0; k < 4; k++) front(z0 + 40 + k * 100, z0 + 110 + k * 100, 9 * F, 13 * F, '#566c6d', 0.2);
    for (let x = x0 + 60; x < x1 - 60; x += 130) {
      props.quad([x, lower + 12, z1 + 0.2], [x + 90, lower + 12, z1 + 0.2], [x + 90, lower + 110, z1 + 0.2], [x, lower + 110, z1 + 0.2], side, lit('#4f6567', side), NO_INK);
      props.quad([x, lower + 9 * F, z1 + 0.2], [x + 90, lower + 9 * F, z1 + 0.2], [x + 90, lower + 13 * F, z1 + 0.2], [x, lower + 13 * F, z1 + 0.2], side, lit('#566c6d', side), NO_INK);
    }
    props.box([x0, lower + 7.5 * F, z1], [x1, lower + 8 * F, z1 + 4 * F], '#c8bfa8', '#d6cfbb', ink(138, 4));
  }
  // A towel cart by the bays.
  props.box([-260, lower + 6, TAPER_END - 60], [-215, lower + 46, TAPER_END - 10], '#8d969a', '#9aa3a6', ink(131, 5));
  for (let k = 0; k < 4; k++) props.box([-257, lower + 46 + k * 4, TAPER_END - 57], [-218, lower + 50 + k * 4, TAPER_END - 13], ['#e7e3d6', '#d9e2e5', '#ece6d3', '#cfdade'][k], '#f0ece1', NO_INK);
}

/** Hoses coiled on the bay columns and the bays' wet floor. */
function buildBays(props: Bake) {
  for (let z = ROOF_Z0 + 80; z < ROOF_Z1; z += 500) {
    const x = -46;
    const coil: Vec3[] = [];
    for (let k = 0; k <= 18; k++) {
      const a = k / 18 * Math.PI * 4;
      coil.push([x + 2 + Math.sin(a) * 0.6, -140 + Math.sin(a) * 9 - k * 0.4, z + Math.cos(a) * 9]);
    }
    props.tube(coil, coil.map(() => 1.3), { color: '#2e6f5a' }, NO_INK, 5, false);
  }
  for (let k = 0; k < 6; k++) {
    const z = ROOF_Z0 + 60 + hash2(k, 0, 995) * (ROOF_Z1 - ROOF_Z0 - 120);
    blot(props, -300 - hash2(k, 1, 996) * 400, z, -189.8, (2 + hash2(k, 2, 997) * 2.5) * F, '#666e66', k + 1200, 12);
  }
}

/** Air conditioners, vents and a hatch at the back of the roof, well clear of the approach; ponding stains. */
function buildRoof(ground: Bake, props: Bake) {
  for (const [x0, x1, z0, z1, h] of [[-720, -560, 700, 830, 62], [-520, -420, 1180, 1270, 48], [-860, -760, 1350, 1470, 54]]) {
    props.box([x0 - 6, 0, z0 - 6], [x1 + 6, 8, z1 + 6], '#8c8f86', '#9b9e95', NO_INK);
    props.box([x0, 8, z0], [x1, 8 + h, z1], '#b6bab2', '#c6c9c0', ink(132, 5));
    for (let x = x0 + 8; x < x1 - 8; x += 10) props.box([x, 14, z1], [x + 4, 4 + h, z1 + 0.6], '#80857e', '#80857e', NO_INK);
    props.tube([[(x0 + x1) / 2, 8 + h, (z0 + z1) / 2], [(x0 + x1) / 2, 10 + h, (z0 + z1) / 2]], [(x1 - x0) * 0.3, (x1 - x0) * 0.3], { color: '#5e625d' }, NO_INK, 12);
  }
  for (const [x, z] of [[-300, 900], [-650, 1050], [-400, 1550], [-900, 600]]) {
    props.tube([[x, 0, z], [x, 34, z]], [3.5, 3.5], { color: '#8f948c' }, NO_INK, 8);
    props.tube([[x, 34, z], [x, 38, z]], [6, 5], { color: '#777c74' }, NO_INK, 8);
  }
  props.box([-950, 0, 1000], [-880, 14, 1070], '#9c9f96', '#aaada3', ink(133, 5));
  for (let k = 0; k < 10; k++) {
    blot(ground, ROOF_BACK + 80 + hash2(k, 0, 998) * (-ROOF_BACK - 300), ROOF_Z0 + 380 + hash2(k, 1, 999) * (ROOF_Z1 - ROOF_Z0 - 450), 0.22, (1.5 + hash2(k, 2, 1000) * 3) * F, k % 2 ? '#a19c90' : '#a7a295', k + 1300, 12);
  }
}

/** Across Sunset: a sidewalk's worth of shopfronts with glass, doors, awnings and sign bands. */
function buildFarSide(ground: Bake, props: Bake) {
  const FACADES = ['#d6cdb6', '#c4b6a0', '#d9d2c2', '#b9bcb0', '#cdb79d', '#e0d6c0', '#bfae98'];
  const AWNINGS = ['#7a3b35', '#2f6a5c', '#33475e', '#9b8a62', '#b0573c'];
  const SIGNS = ['#e9e1c9', '#2f3b45', '#8f2f2b', '#d7c48a', '#3f6150'];
  const n: Vec3 = [-1, 0, 0];
  const x = FAR_FRONT;
  flat(ground, LANES.farCurb, x, -11000, 11000, lower + 0.12, '#bdb8a9');
  for (let i = 0; i < 14; i++) {
    const z0 = -3400 + i * 26 * F, z1 = z0 + 24 * F;
    const h = (13 + hash2(i, 0, 1010) * 12) * F, depth = 40 * F;
    const pick = <T>(list: readonly T[], salt: number) => list[Math.floor(hash2(i, salt, 1011) * list.length)];
    const face = (a: number, b: number, c: number, d: number, color: string, lift: number) =>
      props.quad([x - lift, lower + c, a], [x - lift, lower + c, b], [x - lift, lower + d, b], [x - lift, lower + d, a], n, lit(color, n), NO_INK);
    props.box([x, lower, z0], [x + depth, lower + h, z1], pick(FACADES, 1), '#c9c6b6', ink(134, 4));
    props.box([x - 5, lower + h - 4, z0 - 5], [x + depth, lower + h + 7, z1 + 5], '#a4a493', '#bdbcac', NO_INK);
    face(z0 + 18, z1 - 18, 0, 15, '#6a6d67', 0.2);
    face(z0 + 18, z1 - 18, 15, 120, '#4f6567', 0.2);
    const door = z0 + 40 + hash2(i, 2, 1011) * (24 * F - 120);
    face(door, door + 38, 2, 94, '#2f3b3c', 0.4);
    for (let m = z0 + 18; m <= z1 - 18; m += (24 * F - 36) / 5) face(m - 1.6, m + 1.6, 15, 120, '#5c605b', 0.35);
    props.quad([x - 0.3, lower + 30, z0 + 70], [x - 0.3, lower + 30, z0 + 120], [x - 0.3, lower + 112, z0 + 160], [x - 0.3, lower + 112, z0 + 110], n, lit('#6f8789', n), NO_INK);
    const sign = pick(SIGNS, 3);
    props.box([x - 2, lower + 126, z0 + 12], [x, lower + 156, z1 - 12], sign, sign, NO_INK);
    const letters = 4 + Math.floor(hash2(i, 4, 1011) * 5);
    const letterColor = sign === '#e9e1c9' || sign === '#d7c48a' ? '#3b3f3c' : '#ece6d0';
    for (let k = 0; k < letters; k++) {
      const lz = (z0 + z1) / 2 + (k - letters / 2) * 22;
      face(lz + 3, lz + 18, 134, 148, letterColor, 2.3);
    }
    if (hash2(i, 5, 1011) < 0.6) {
      const awning = pick(AWNINGS, 6);
      const tilt: Vec3 = [-0.6, 0.8, 0];
      props.quad([x, lower + 123, z0 + 16], [x, lower + 123, z1 - 16], [x - 3.5 * F, lower + 105, z1 - 16], [x - 3.5 * F, lower + 105, z0 + 16], tilt, lit(awning, tilt), ink(135, 4));
      face(z0 + 16, z1 - 16, 95, 105, awning, 3.5 * F);
    }
    if (h > 19 * F) {
      for (let k = 0; k < 4; k++) {
        const wz = z0 + 40 + k * (24 * F - 80) / 4;
        face(wz, wz + 90, 13 * F, 17.5 * F, '#566c6d', 0.2);
        props.box([x - 4, lower + 13 * F - 4, wz - 4], [x, lower + 13 * F, wz + 94], '#d5d0bd', '#ded9c6', NO_INK);
      }
    }
  }
  // Tall palms down the far sidewalk.
  for (const [z, height, seed] of [[-1900, 1050, 11], [1450, 960, 12]]) sunsetPalm(props, LANES.farCurb + 4.5 * F, lower, z, height, seed);
}

/** Wooden utility poles down the alley behind the wash, three sagging lines between them. */
function buildPowerLines(props: Bake) {
  const x = -1200;
  const poles = [-3000, -2350, -1700, -1050, -400, 250, 900, 1550, 2200, 2850];
  const top = lower + 26 * F;
  for (const z of poles) {
    props.tube([[x, lower, z], [x, top + 12, z]], [7, 5], { color: '#6b5a48', lit: { color: '#8a765f', from: 0, to: 2 } }, ink(136, 4), 7);
    props.box([x - 4, top - 4, z - 70], [x + 4, top + 4, z + 70], '#6f5e4b', '#7d6b56', NO_INK);
    props.tube([[x + 6, top - 40, z], [x + 6, top - 4, z]], [9, 9], { color: '#7b7f78' }, NO_INK, 8);
  }
  for (let i = 1; i < poles.length; i++) {
    for (const dz of [-60, 0, 60]) {
      const a = poles[i - 1], b = poles[i];
      const wire: Vec3[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        wire.push([x, top + 5 - Math.sin(t * Math.PI) * 38, a + (b - a) * t + dz]);
      }
      props.tube(wire, wire.map(() => 0.7), { color: '#2b2c2a' }, NO_INK, 3, false);
    }
  }
}

// ----- Realistic street props, in the set's world coordinates -----

/** World units a second for a mile an hour. */
const MPH = (5280 * F) / 3600;
const ROAD_Y = ROAD * SCALE;
const LOT_Y = lower * SCALE;
/** Each driving car comes round again out of sight, down the boulevard. */
const LAP = 900 * F;
const laneCenter = (a: number, b: number) => ((a + b) / 2) * SCALE;

/**
 * Sunset's traffic keeps right: toward +z on the wash's side, back on the
 * far side. The curb lane stays empty, since the rider rolls out into it.
 */
const TRAFFIC: CarPlacement[] = ([
  [laneCenter(LANES.dash, LANES.middle), -900, 'sedan', '#9aa3a6', 29, -90],
  [laneCenter(LANES.dash, LANES.middle), 1600, 'suv', '#1f2428', 29, -90],
  [laneCenter(LANES.middle, LANES.farDash), 400, 'hatchback', '#c9c5bb', 33, 90],
  [laneCenter(LANES.middle, LANES.farDash), -2200, 'sedan', '#6b2a2c', 33, 90],
  [laneCenter(LANES.farDash, LANES.farCurb), 2400, 'suv', '#e2e0d8', 26, 90],
  [laneCenter(LANES.farDash, LANES.farCurb), -400, 'sedan', '#2e3f55', 26, 90],
] as const).map(([x, z, model, paint, mph, yaw]) => ({ at: [x, ROAD_Y, z * SCALE] as Vec3, yaw, model, paint, speed: mph * MPH, lap: LAP }));

/** Cars being hand-dried in the bays, their roofs showing over the bank, and others waiting in the lot. */
const PARKED: CarPlacement[] = ([
  [-480, -190, 290, 'sedan', '#1d1f22', 0], [-500, -190, 790, 'suv', '#b8bcbd', 0], [-470, -190, 1290, 'hatchback', '#8c1e22', 180],
  [-370, lower, TAPER_END - 16 * F, 'sedan', '#d8d5cc', 180], [-370, lower, TAPER_END - 36 * F, 'suv', '#43505a', 180],
] as const).map(([x, y, z, model, paint, yaw]) => ({ at: [x * SCALE, y === lower ? LOT_Y : y * SCALE, z * SCALE] as Vec3, yaw, model, paint }));

/** Street trees in wells on the far sidewalk. */
const TREES = [[-800, 26, 40], [500, 24, 160], [2700, 25, 280]].map(([z, height, yaw]) => ({
  at: [(LANES.farCurb + 4.5 * F) * SCALE, LOT_Y, z * SCALE] as Vec3, height: height * F, yaw,
}));

export const SUNSET_STREET_PROPS: StreetPropPlacements = { cars: [...TRAFFIC, ...PARKED], trees: TREES };
