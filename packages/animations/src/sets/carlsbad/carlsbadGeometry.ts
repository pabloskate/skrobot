import { lambert, tone } from '../../camera/camera';
import type { Vec3 } from '../../camera/view';
import { Bake, NO_INK, type Ink } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { hash2 } from '../setKit';
import {
  CARLSBAD_BANK_Z0, CARLSBAD_BUILDING_X0, CARLSBAD_BUILDING_X1,
  CARLSBAD_DROP, CARLSBAD_FACADE_Z, CARLSBAD_FOOT as F, CARLSBAD_RISER,
  CARLSBAD_ROOF_Y, CARLSBAD_STAIR_RUN, CARLSBAD_STAIR_Z0,
  CARLSBAD_STAIR_Z1, CARLSBAD_STEPS, CARLSBAD_TREAD,
  CARLSBAD_UPHILL_END, CARLSBAD_UPHILL_EASE,
  carlsbadBank, carlsbadBankEnd, carlsbadLanding, carlsbadPathOuter, carlsbadToeTop,
} from './carlsbadLayout';

const UP: Vec3 = [0, 1, 0];
const FAR = 800 * F;
const CONCRETE = '#b7b5a6';
const ink = (id: number): Ink => ({ id, priority: 4, width: 0.12, kind: INK_PROP, solid: 6 });
const STEP = ink(40), WALL = ink(70);
type Segment = { a: Vec3; b: Vec3; radius: number };
type ShadowBox = { min: Vec3; max: Vec3 };

/** A face's winding follows its actual normal, including the sloped runout. */
function face(b: Bake, a: Vec3, c: Vec3, d: Vec3, e: Vec3, color: string, detail = NO_INK, outward?: Vec3) {
  const u = c.map((v, i) => v - a[i]), v = d.map((q, i) => q - a[i]);
  const cross: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...cross) || 1;
  const n: Vec3 = outward ?? cross.map(q => q / length) as Vec3;
  const paint = { color: tone(color, lambert({ x: n[0], y: -n[1], z: n[2] })) };
  if (cross.reduce((sum, q, i) => sum + q * n[i], 0) < 0) b.quad(a, e, d, c, n, paint, detail);
  else b.quad(a, c, d, e, n, paint, detail);
}

function flat(b: Bake, x0: number, x1: number, z0: number, z1: number, y: number, color: string, detail = NO_INK) {
  face(b, [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], color, detail, UP);
}

function tube(b: Bake, spine: Vec3[], radius: number, color: string, shadow?: Segment[]) {
  b.tube(spine, spine.map(() => radius), { color, lit: { color: tone(color, 1.15), from: 0.1, to: 2 } }, NO_INK, 7, true);
  if (shadow) for (let i = 1; i < spine.length; i++) shadow.push({ a: spine[i - 1], b: spine[i], radius });
}

/** Low-frequency wear with slight grain, so individual mesh cells disappear. */
function grassColor(row: number, col: number): string {
  const field = Math.sin(row * 0.19 + col * 0.27) + Math.cos(row * 0.12 - col * 0.34);
  const dry = Math.max(0, Math.min(1, (field + 0.3) / 2.3));
  const grain = (hash2(row, col, 829) - 0.5) * 6;
  const green = [105, 124, 69], brown = [148, 136, 94];
  return '#' + green.map((v, i) => Math.round(v + (brown[i] - v) * dry + grain).toString(16).padStart(2, '0')).join('');
}

/** Archival Carlsbad: a school courtyard, yellow eleven stair, two side
 * pipes, worn grass and its low curved wall. Two merged mobile-safe meshes. */
export function buildCarlsbadGeometry() {
  const ground = new Bake(), props = new Bake();
  const railSegments: Segment[] = [], shadowBoxes: ShadowBox[] = [];
  flat(ground, -FAR, 0, -FAR, FAR, 0, '#bdb9aa');
  buildBank(ground, props);
  buildStairs(ground, props, railSegments);
  buildRunout(ground, props);
  buildClassrooms(props, shadowBoxes);
  buildCampus(props);
  return { ground: ground.geometry(), props: props.geometry(), railSegments, shadowBoxes };
}

function buildBank(ground: Bake, props: Bake) {
  const rows = 66, columns = 20;
  for (let row = 0; row < rows; row++) {
    const z0 = CARLSBAD_BANK_Z0 + (CARLSBAD_STAIR_Z0 - CARLSBAD_BANK_Z0) * row / rows;
    const z1 = CARLSBAD_BANK_Z0 + (CARLSBAD_STAIR_Z0 - CARLSBAD_BANK_Z0) * (row + 1) / rows;
    const toe0 = carlsbadBankEnd(z0), toe1 = carlsbadBankEnd(z1);
    const at = (z: number, toe: number, t: number): Vec3 => {
      const x = (toe - 0.3 * F) * t;
      return [x, carlsbadBank(x, z), z];
    };
    for (let col = 0; col < columns; col++) {
      const a = col / columns, b = (col + 1) / columns;
      const color = grassColor(row, col);
      face(ground, at(z0, toe0, a), at(z1, toe1, a), at(z1, toe1, b), at(z0, toe0, b), color);
    }
    // A low retaining wall holds the bank, with a continuous concrete cap.
    face(ground, [toe0, carlsbadLanding(toe0), z0], [toe1, carlsbadLanding(toe1), z1], [toe1, carlsbadToeTop(z1), z1], [toe0, carlsbadToeTop(z0), z0], '#a6aaa0', WALL, [1, 0, 0]);
    face(ground, [toe0 - 0.3 * F, carlsbadToeTop(z0), z0], [toe1 - 0.3 * F, carlsbadToeTop(z1), z1], [toe1, carlsbadToeTop(z1), z1], [toe0, carlsbadToeTop(z0), z0], '#c2c1af', NO_INK, UP);
    // Little exposed dirt below the cap, and the uneven old white paint.
    face(ground, at(z0, toe0, 1), at(z1, toe1, 1), [toe1 - 0.3 * F, carlsbadToeTop(z1), z1], [toe0 - 0.3 * F, carlsbadToeTop(z0), z0], '#8b896b', NO_INK, [1, 0, 0]);
    if (row % 4 === 0) {
      const y0 = carlsbadLanding(toe0), y1 = carlsbadLanding(toe1);
      face(props, [toe0 + 0.07, y0 + 0.2 * F, z0], [toe1 + 0.07, y1 + 0.13 * F, z1], [toe1 + 0.07, y1 + 0.75 * F, z1], [toe0 + 0.07, y0 + 0.84 * F, z0], '#c4c4b5', NO_INK, [1, 0, 0]);
    }
  }
  // Short concrete lip at the upper edge of the bank.
  face(ground, [0, -0.12 * F, CARLSBAD_BANK_Z0], [0, -0.12 * F, CARLSBAD_STAIR_Z0], [0, 0, CARLSBAD_STAIR_Z0], [0, 0, CARLSBAD_BANK_Z0], '#b6b5a5', WALL, [1, 0, 0]);
  for (const [z0, z1] of [[-FAR, CARLSBAD_BANK_Z0], [CARLSBAD_STAIR_Z1, FAR]]) {
    face(ground, [0, 0, z0], [0, 0, z1], [CARLSBAD_STAIR_RUN, -CARLSBAD_DROP, z1], [CARLSBAD_STAIR_RUN, -CARLSBAD_DROP, z0], '#7c8654');
  }
}

function buildStairs(ground: Bake, props: Bake, shadows: Segment[]) {
  const left = CARLSBAD_STAIR_Z0, right = CARLSBAD_STAIR_Z1;
  for (let i = 0; i < CARLSBAD_STEPS; i++) {
    const x = i * CARLSBAD_TREAD, y0 = -i * CARLSBAD_RISER, y1 = y0 - CARLSBAD_RISER;
    face(ground, [x, y1, left], [x, y1, right], [x, y0, right], [x, y0, left], '#a7aa9c', STEP, [1, 0, 0]);
    // The yellow safety strip wraps the nose, not the whole concrete riser.
    face(props, [x + 0.08, y0 - 0.075 * F, left], [x + 0.08, y0 - 0.075 * F, right], [x + 0.08, y0, right], [x + 0.08, y0, left], '#c9ac2d', NO_INK, [1, 0, 0]);
    if (i < CARLSBAD_STEPS - 1) {
      flat(ground, x, x + CARLSBAD_TREAD, left, right, y1, '#bdbbaa', STEP);
      flat(props, x + CARLSBAD_TREAD - 0.25 * F, x + CARLSBAD_TREAD, left, right, y1 + 0.08, '#d9bd34');
    }
  }
  flat(props, -0.26 * F, 0, left, right, 0.08, '#d9bd34');
  for (const [edge, sign] of [[left, -1], [right, 1]]) {
    const outer = edge + sign * 0.55 * F;
    face(ground, [0, 0.25 * F, edge], [CARLSBAD_STAIR_RUN, -CARLSBAD_DROP + 0.25 * F, edge], [CARLSBAD_STAIR_RUN, -CARLSBAD_DROP + 0.25 * F, outer], [0, 0.25 * F, outer], '#bcbcac', WALL, UP);
    face(ground, [0, 0, edge], [CARLSBAD_STAIR_RUN, -CARLSBAD_DROP, edge], [CARLSBAD_STAIR_RUN, -CARLSBAD_DROP + 0.25 * F, edge], [0, 0.25 * F, edge], '#a2a89b', WALL, [0, 0, -sign]);
    const z = (edge + outer) / 2, run = CARLSBAD_STAIR_RUN, low = -CARLSBAD_DROP;
    const spine: Vec3[] = [
      [-1.2 * F, 2.25 * F, z], [-1.2 * F, 2.8 * F, z], [-0.95 * F, 3.05 * F, z], [0, 3.05 * F, z],
      [run + 0.25 * F, low + 3.05 * F, z], [run + 0.58 * F, low + 2.92 * F, z],
      [run + 0.7 * F, low + 2.65 * F, z], [run + 0.55 * F, low + 2.4 * F, z],
      [run + 0.2 * F, low + 2.35 * F, z], [run + 0.04 * F, low + 2.13 * F, z], [run + 0.04 * F, low + 0.25 * F, z],
    ];
    tube(props, spine, 0.065 * F, '#798982', shadows);
    for (const t of [0, 0.52]) {
      const x = t * run, y = -t * CARLSBAD_DROP;
      tube(props, [[x, y + 0.25 * F, z], [x, y + 3.05 * F, z]], 0.07 * F, '#75847d', shadows);
      props.box([x - 0.16 * F, y + 0.26 * F, z - 0.16 * F], [x + 0.16 * F, y + 0.31 * F, z + 0.16 * F], '#7c8278', '#8c9587', NO_INK);
    }
  }
}

/** Strip meshing keeps the rounded grade transition identical to physics. */
function buildRunout(ground: Bake, props: Bake) {
  const ends = [CARLSBAD_STAIR_RUN, CARLSBAD_STAIR_RUN + 2 * F];
  for (let x = CARLSBAD_STAIR_RUN + 3 * F; x < CARLSBAD_UPHILL_END + CARLSBAD_UPHILL_EASE; x += F) ends.push(x);
  ends.push(CARLSBAD_UPHILL_END + CARLSBAD_UPHILL_EASE, FAR);
  const zones = [[-FAR, CARLSBAD_BANK_Z0], [CARLSBAD_BANK_Z0, CARLSBAD_STAIR_Z0], [CARLSBAD_STAIR_Z0, FAR]];
  for (const [z0, z1] of zones) {
    const rows = z0 === CARLSBAD_BANK_Z0 ? 66 : 1;
    for (let row = 0; row < rows; row++) {
      const a = z0 + (z1 - z0) * row / rows, b = z0 + (z1 - z0) * (row + 1) / rows;
      const start0 = rows > 1 ? carlsbadBankEnd(a) : CARLSBAD_STAIR_RUN;
      const start1 = rows > 1 ? carlsbadBankEnd(b) : CARLSBAD_STAIR_RUN;
      const path0 = carlsbadPathOuter(a), path1 = carlsbadPathOuter(b);
      for (const region of [0, 1]) {
        let x0 = region ? path0 : start0, x1 = region ? path1 : start1;
        const limit0 = region ? FAR : path0, limit1 = region ? FAR : path1;
        for (const end of ends) {
          const end0 = Math.min(limit0, Math.max(x0, end)), end1 = Math.min(limit1, Math.max(x1, end));
          if (end0 === x0 && end1 === x1) continue;
          face(ground, [x0, carlsbadLanding(x0), a], [x1, carlsbadLanding(x1), b], [end1, carlsbadLanding(end1), b], [end0, carlsbadLanding(end0), a], region ? '#7b8857' : CONCRETE);
          x0 = end0; x1 = end1;
        }
      }
    }
  }
  // Old poured concrete with sparse joints and a few jagged repaired cracks.
  for (let x = -60 * F; x < 0; x += 10 * F) flat(props, x, x + 0.025 * F, -25 * F, 48 * F, 0.08, '#969e92');
  for (let z = -20 * F; z < 45 * F; z += 10 * F) {
    flat(props, -70 * F, -0.05 * F, z, z + 0.025 * F, 0.09, '#9a9f93');
    const spine: Vec3[] = [];
    for (let x = 15 * F; x <= carlsbadPathOuter(z) - 0.1 * F; x += F) spine.push([x, carlsbadLanding(x) + 0.1, z]);
    tube(props, spine, 0.011 * F, '#919b90');
  }
  for (const start of [19, 36, 58]) {
    const spine: Vec3[] = [];
    for (let i = 0; i < 18; i++) {
      const x = (start + Math.sin(i * 1.9) * 0.14 + i * 0.04) * F, z = (-22 + i * 3) * F;
      if (x > carlsbadPathOuter(z)) continue;
      spine.push([x, carlsbadLanding(x) + 0.12, z]);
    }
    if (spine.length > 1) tube(props, spine, 0.018 * F, '#808e83');
  }
}

function buildClassrooms(props: Bake, shadows: ShadowBox[]) {
  const x0 = CARLSBAD_BUILDING_X0, x1 = CARLSBAD_BUILDING_X1, z = CARLSBAD_FACADE_Z;
  const min: Vec3 = [x0, 0, z - 25 * F], max: Vec3 = [x1, CARLSBAD_ROOF_Y, z];
  props.box(min, max, '#c6bea5', '#b2b09e', WALL);
  shadows.push({ min, max });
  // Long cream fascia, shallow roof, deep shaded eaves and slim steel posts.
  props.box([x0 - F, CARLSBAD_ROOF_Y - 0.4 * F, z - 26 * F], [x1 + F, CARLSBAD_ROOF_Y, z + 3 * F], '#c7bf9f', '#ded2b1', NO_INK);
  face(props, [x0 - F, CARLSBAD_ROOF_Y, z + 3 * F], [x1 + F, CARLSBAD_ROOF_Y, z + 3 * F], [x1 + F, CARLSBAD_ROOF_Y + 1.7 * F, z - 11.5 * F], [x0 - F, CARLSBAD_ROOF_Y + 1.7 * F, z - 11.5 * F], '#a09e8e', NO_INK, UP);
  face(props, [x0 - F, CARLSBAD_ROOF_Y + 1.7 * F, z - 11.5 * F], [x1 + F, CARLSBAD_ROOF_Y + 1.7 * F, z - 11.5 * F], [x1 + F, CARLSBAD_ROOF_Y, z - 26 * F], [x0 - F, CARLSBAD_ROOF_Y, z - 26 * F], '#939989', NO_INK, UP);
  for (let x = x0 + 2 * F, bay = 0; x < x1 - 3 * F; x += 7.5 * F, bay++) {
    const end = Math.min(x + 7.1 * F, x1 - 0.6 * F), front = z + 0.12;
    if (bay % 4 === 2) {
      face(props, [x + F, 0, front], [end - 2.8 * F, 0, front], [end - 2.8 * F, 7 * F, front], [x + F, 7 * F, front], '#716b55', NO_INK, [0, 0, 1]);
      props.box([x + 0.85 * F, 0, front], [x + F, 7.15 * F, front + 0.08 * F], '#e0d4b4', '#e0d4b4', NO_INK);
      props.box([end - 2.8 * F, 0, front], [end - 2.65 * F, 7.15 * F, front + 0.08 * F], '#e0d4b4', '#e0d4b4', NO_INK);
      props.box([x + F, 7 * F, front], [end - 2.8 * F, 7.15 * F, front + 0.08 * F], '#e0d4b4', '#e0d4b4', NO_INK);
      face(props, [x + 1.3 * F, 5.4 * F, front + 0.14], [x + 2.1 * F, 5.4 * F, front + 0.14], [x + 2.1 * F, 5.85 * F, front + 0.14], [x + 1.3 * F, 5.85 * F, front + 0.14], '#c8c3a7', NO_INK, [0, 0, 1]);
      tube(props, [[end - 3.1 * F, 3 * F, front + 0.2 * F], [end - 3.1 * F, 3.5 * F, front + 0.2 * F]], 0.025 * F, '#a6ada0');
    } else {
      face(props, [x, 3.5 * F, front], [end, 3.5 * F, front], [end, 8.3 * F, front], [x, 8.3 * F, front], '#67746a', NO_INK, [0, 0, 1]);
      for (const y of [3.5, 5.3, 7.1, 8.3]) props.box([x, y * F, front], [end, (y + 0.11) * F, front + 0.06 * F], '#d9d0ae', '#dbd5b9', NO_INK);
      for (const px of [x, (x + end) / 2, end]) props.box([px, 3.5 * F, front], [px + 0.1 * F, 8.35 * F, front + 0.06 * F], '#d9d0ae', '#dbd5b9', NO_INK);
    }
    if (bay % 2 === 0) tube(props, [[x, 0, z + 2.4 * F], [x, CARLSBAD_ROOF_Y - 0.4 * F, z + 2.4 * F]], 0.065 * F, '#737b66');
  }
  // Opposite low campus wing and open court, as seen in the wide contest view.
  const backMin: Vec3 = [-112 * F, 0, 49 * F], backMax: Vec3 = [-12 * F, 10 * F, 73 * F];
  props.box(backMin, backMax, '#c6c0af', '#b2b09e', WALL);
  props.box([-113 * F, 9.6 * F, 46 * F], [-11 * F, 10 * F, 74 * F], '#c4bea8', '#d5cbb0', NO_INK);
  shadows.push({ min: backMin, max: backMax });
}

function buildCampus(props: Bake) {
  // Cream perimeter wall and its coping behind the lower lawn, seen in
  // the reverse angles. Keep the skating path open in front of it.
  const wallX = 58 * F, floor = carlsbadLanding(wallX);
  props.box([wallX, floor, -90 * F], [wallX + 0.55 * F, floor + 6.5 * F, 85 * F], '#c6c5b7', '#d9d6c3', WALL);
  props.box([wallX - 0.12 * F, floor + 6.5 * F, -90 * F], [wallX + 0.68 * F, floor + 6.7 * F, 85 * F], '#b4b8a6', '#d8d7c1', NO_INK);
  for (let z = -85 * F; z < 85 * F; z += 12 * F) props.box([wallX - 0.12 * F, floor, z], [wallX, floor + 6.5 * F, z + 0.35 * F], '#b8beac', '#c9ceba', NO_INK);
  // Sparse campus planting stays behind the approach and beside the runout.
  for (let i = 0; i < 7; i++) {
    const x = (-14 - i * 15) * F, z = (34 + (i % 2) * 5) * F;
    const h = (17 + hash2(i, 8) * 6) * F;
    tube(props, [[x, 0, z], [x + 0.4 * F, h * 0.7, z]], 0.23 * F, '#7f7860');
    for (let j = 0; j < 5; j++) {
      const angle = j * 2.399, radius = (3.5 + hash2(i, j) * 2) * F;
      const px = x + Math.cos(angle) * 3 * F, pz = z + Math.sin(angle) * 3 * F, y = h * (0.65 + hash2(i, j, 7) * 0.2);
      props.tube([[px, y - radius * 0.6, pz], [px, y, pz], [px, y + radius * 0.6, pz]], [0.2 * radius, radius, 0.08 * radius], { color: ['#596c47', '#64774b', '#75804f'][j % 3] }, NO_INK, 7, true);
    }
  }
  // The green slim utility/light pole beside the head of the stair.
  tube(props, [[-2 * F, 0, CARLSBAD_STAIR_Z0 + 0.8 * F], [-2 * F, 18 * F, CARLSBAD_STAIR_Z0 + 0.8 * F]], 0.1 * F, '#637e70');
  props.box([-2.5 * F, 17.8 * F, CARLSBAD_STAIR_Z0 + 0.35 * F], [-1.5 * F, 18.15 * F, CARLSBAD_STAIR_Z0 + 1.25 * F], '#788277', '#a5aa94', NO_INK);
  // Small round drain visible in the concrete retaining wall.
  const z = CARLSBAD_BANK_Z0 + 5 * F, x = carlsbadBankEnd(z) + 0.14;
  tube(props, [[x, carlsbadLanding(x) + 0.5 * F, z], [x + 0.1, carlsbadLanding(x) + 0.5 * F, z]], 0.16 * F, '#818773');
}
