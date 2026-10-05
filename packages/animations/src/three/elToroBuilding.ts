import { lambert } from '../scene/camera';
import { mixHex, type V3 } from '../scene/math';
import { hash2 } from '../scene/setKit';
import { FOOT } from '../scene/stairs';
import { Bake, NO_INK, type Ink, type Paint } from './bake';
import {
  BUILDING_DEPTH,
  BUILDING_END,
  BUILDING_FACE,
  BUILDING_H,
  BUILDING_LENGTH,
  EAVE,
  ROOF_RISE,
  hill,
} from './elToroLayout';
import { INK_PROP } from './materials';
import type { Vec3 } from './view';

// Fine architecture is shaded geometry; comic outlines alias on the tiny hardware.
const ink = (id: number, solid = 10): Ink => ({ id, priority: 9, width: 0, kind: INK_PROP, solid });

/** Neutral daylight keeps the ochre masonry and faded enamel distinct in the shaded arcade. */
const lit = (color: string, normal: Vec3): Paint => {
  const light = lambert({ x: normal[0], y: -normal[1], z: normal[2] } as V3);
  return { color: mixHex(color, light > 0.5 ? '#eee7d7' : '#343c3d', Math.abs(light - 0.5) * (light > 0.5 ? 0.3 : 0.85)) };
};

/**
 * The original school frontage visible in photographs of the twenty stair:
 * small stacked blue lockers, warm CMU, a shallow hipped metal roof, and
 * the fence and lantern beside the upper embankment. All detail is baked
 * into the spot's existing prop mesh, with no additional draws or assets.
 */
export function buildElToroBuilding(props: Bake, dir: 1 | -1): void {
  // Author the frontage at local z=0, with its interior at negative z.
  // The school stands beyond the far rail, facing back toward the stairs.
  const P = (u: number, h: number, z: number): Vec3 => [dir * u, h, BUILDING_FACE - z];
  const facade = 0;
  const u0 = BUILDING_END - BUILDING_LENGTH;
  const back = facade - BUILDING_DEPTH;
  const ridgeZ = facade - BUILDING_DEPTH / 2;
  const front: Vec3 = [0, 0, -1];
  const end: Vec3 = [dir, 0, 0];
  const wallInk = ink(70);
  const metalInk = ink(84, 12);
  const roofInk = ink(78, 11);

  const box = (a: Vec3, b: Vec3, color: string, record: Ink = metalInk) => {
    const lo: Vec3 = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
    const hi: Vec3 = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    const faces: Array<[Vec3, Vec3, Vec3, Vec3, Vec3]> = [
      [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
    ];
    for (const [a, b, c, d, n] of faces) props.quad(a, b, c, d, n, lit(color, n), record);
  };
  const pipe = (points: Vec3[], radius: number, color: string, sides = 8, record = metalInk) =>
    props.tube(points, points.map(() => radius), { color, lit: { color: mixHex(color, '#ecebe4', 0.24), from: 0.12, to: 2 } }, record, sides, true);

  // The mortar is a continuous backing. Individual shallow faces give each
  // 16 × 8 inch block its own color and leave real running-bond recesses.
  box(P(u0, 0, back), P(BUILDING_END, BUILDING_H, facade), '#988974', wallInk);
  type WallPoint = (along: number, height: number, depth: number) => Vec3;
  const masonry = (length: number, point: WallPoint, normal: Vec3, seed: number) => {
    const blockW = FOOT * 4 / 3;
    const blockH = FOOT * 2 / 3;
    for (let row = 0; row * blockH < BUILDING_H; row++) {
      const y0 = row * blockH + 0.5;
      const y1 = Math.min(BUILDING_H, (row + 1) * blockH - 0.5);
      for (let col = -1; col * blockW < length; col++) {
        const x0 = Math.max(0.4, (col + (row % 2) * 0.5) * blockW + 0.48);
        const x1 = Math.min(length - 0.4, (col + 1 + (row % 2) * 0.5) * blockW - 0.48);
        if (x1 <= x0) continue;
        const variation = hash2(col + 12, row, seed);
        const depth = 0.7 + variation * 0.35;
        let color = mixHex('#b9a078', '#d2b78b', variation * 0.42);
        // The broad eave makes a soft, deep band of shade above the lockers.
        color = mixHex(color, '#514d40', Math.max(0, (y0 - BUILDING_H * 0.65) / (BUILDING_H * 0.35)) * 0.31);
        props.quad(point(x0, y0, depth), point(x1, y0, depth), point(x1, y1, depth), point(x0, y1, depth), normal, lit(color, normal), wallInk);
      }
    }
  };
  masonry(BUILDING_LENGTH, (s, y, d) => P(u0 + s, y, facade + d), front, 321);
  masonry(BUILDING_DEPTH, (s, y, d) => P(BUILDING_END + d, y, back + s), end, 322);
  masonry(BUILDING_LENGTH, (s, y, d) => P(u0 + s, y, back - d), [0, 0, 1], 323);
  masonry(BUILDING_DEPTH, (s, y, d) => P(u0 - d, y, back + s), [-dir, 0, 0], 324);
  // A slightly darker splash course and concrete footing run below the banks.
  box(P(u0 - 1, 0, back - 1), P(BUILDING_END + 1, 7, facade + 1), '#a69375', wallInk);

  // Separate overlay layers for stable depth across the full run-up.
  const panel = (point: WallPoint, n: Vec3, a: number, b: number, low: number, high: number, depth: number, color: string, record = metalInk) =>
    props.quad(point(a, low, depth * 2), point(b, low, depth * 2), point(b, high, depth * 2), point(a, high, depth * 2), n, lit(color, n), record);

  // Four tiers of individual school lockers, each about 15 × 17 inches.
  // Recesses, seams, louvers and escutcheons remain geometry at close range.
  const lockerBank = (point: WallPoint, n: Vec3, width: number, columns: number, seed: number) => {
    const low = 10;
    const doorH = 40;
    const height = 4 * doorH;
    const columnW = width / columns;
    panel(point, n, -2, width + 2, low - 3, low + height + 3, 2.3, '#435957');
    panel(point, n, -1, width + 1, low + height + 1, low + height + 3, 5, '#87a5a1');
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < 4; row++) {
        const x = column * columnW;
        const y = low + row * doorH;
        const fade = hash2(column, row, seed);
        const color = mixHex('#567f85', '#8baeb0', fade * 0.68);
        panel(point, n, x + 0.85, x + columnW - 0.85, y + 0.85, y + doorH - 0.85, 3.8, color);
        // The folded door edge catches light while its bottom lip stays dark.
        panel(point, n, x + 1.15, x + columnW - 1.15, y + doorH - 1.65, y + doorH - 0.9, 4, '#a0b9b5');
        panel(point, n, x + columnW - 1.5, x + columnW - 0.9, y + 1, y + doorH - 1, 4, '#49666a');
        // Three punched ventilation slits, plus their lower steel edges.
        for (let vent = 0; vent < 3; vent++) {
          const h = y + doorH - 7 - vent * 2.2;
          panel(point, n, x + 6, x + columnW - 6, h, h + 0.7, 4.1, '#365458');
          panel(point, n, x + 6, x + columnW - 6, h - 0.45, h, 4.2, '#92abaa');
        }
        // Small tarnished label plate, inset latch pocket, and pull handle.
        const handleX = x + columnW * 0.72;
        panel(point, n, handleX - 3.1, handleX + 3.1, y + 16, y + 23, 4.2, '#869795');
        panel(point, n, handleX - 1.8, handleX + 1.8, y + 16.8, y + 21.5, 4.3, '#293d40');
        panel(point, n, handleX - 0.65, handleX + 0.65, y + 18, y + 21.8, 4.6, '#cad0c9');
        panel(point, n, x + 5, x + 12, y + 18, y + 21, 4.3, '#b2bbb0');
        panel(point, n, x + 6.5, x + 10.5, y + 19, y + 19.5, 4.4, '#52655f');
        // Short exposed hinge barrels on the opposite jamb.
        for (const h of [y + 7, y + doorH - 7]) {
          panel(point, n, x + 0.9, x + 2.1, h, h + 3.1, 4.4, '#758f8f');
        }
      }
    }
  };
  const doorway = u0 + 390;
  let bank = 0;
  for (let right = BUILDING_END - 56; right - 180 > u0 + 15; right -= 225) {
    const left = right - 180;
    if (doorway > left - 45 && doorway < right + 45) continue;
    lockerBank((s, y, d) => P(left + s, y, facade + d), front, 180, 5, 400 + bank++);
  }
  // The visible downhill wall carries its own bank with masonry at either end.
  lockerBank((s, y, d) => P(BUILDING_END + d, y, back + 42 + s), end, BUILDING_DEPTH - 96, 9, 412);

  // A quiet service door with steel jambs, frosted upper light and lever.
  const doorPoint: WallPoint = (s, y, d) => P(doorway + s, y, facade + d);
  panel(doorPoint, front, -41, 41, 7, 208, 2.2, '#666d64');
  panel(doorPoint, front, -37, 37, 8, 204, 3, '#536f73');
  panel(doorPoint, front, -27, 27, 106, 191, 3.5, '#34474a');
  panel(doorPoint, front, -24, 24, 109, 188, 3.6, '#8faaa7');
  panel(doorPoint, front, -33, 33, 15, 33, 3.8, '#778481');
  panel(doorPoint, front, 23, 29, 82, 96, 4, '#adb4aa');
  panel(doorPoint, front, 15, 28, 89, 91.5, 5, '#d0d0c3');
  box(P(doorway - 41, 0, facade + 1), P(doorway + 41, 7, facade + 12), '#b7afa0', wallInk);

  // Small high-level ventilation grilles punctuate the otherwise solid wall.
  const vent = (point: WallPoint, n: Vec3) => {
    panel(point, n, 0, 33, 240, 269, 1.4, '#7f7e6b');
    panel(point, n, 2, 31, 242, 267, 1.8, '#b5b2a0');
    for (let h = 245; h < 266; h += 3.7) {
      panel(point, n, 4, 29, h, h + 1.2, 2, '#5b625a');
      panel(point, n, 4, 29, h + 1.2, h + 2, 2.3, '#cccbba');
    }
  };
  for (const u of [u0 + 74, u0 + 720, BUILDING_END - 110]) vent((s, y, d) => P(u + s, y, facade + d), front);
  vent((s, y, d) => P(BUILDING_END + d, y, back + 76 + s), end);

  // Four roof planes meet a shortened ridge: this is a hip, with the broad
  // triangular downhill face and dark eaves seen from the lower landing.
  const pitch = ROOF_RISE / (BUILDING_DEPTH / 2);
  const eaveH = BUILDING_H - EAVE * pitch;
  const roofH = BUILDING_H + ROOF_RISE;
  const ru0 = u0 - EAVE;
  const ru1 = BUILDING_END + EAVE;
  const z0 = back - EAVE;
  const z1 = facade + EAVE;
  const half = (z1 - z0) / 2;
  const ridge0 = ru0 + half;
  const ridge1 = ru1 - half;
  const norm = Math.hypot(1, pitch);
  for (const [edge, sign] of [[z1, 1], [z0, -1]] as const) {
    const n: Vec3 = [0, 1 / norm, -sign * pitch / norm];
    props.quad(P(ru0, eaveH, edge), P(ru1, eaveH, edge), P(ridge1, roofH, ridgeZ), P(ridge0, roofH, ridgeZ), n, lit('#827e71', n), roofInk);
    // Raised seams follow the roof slope, stopping at each diagonal hip.
    for (let u = ru0 + 14; u < ru1 - 10; u += 23) {
      const run = Math.min(half, u - ru0, ru1 - u);
      const a = P(u, eaveH + 1.6, edge);
      const b = P(u, eaveH + run * pitch + 1.6, edge - sign * run);
      pipe([a, b], 0.72, '#4b504b', 4, ink(79, 11));
    }
  }
  for (const [u, ridge, sign] of [[ru0, ridge0, -1], [ru1, ridge1, 1]] as const) {
    const n: Vec3 = [dir * sign * pitch / norm, 1 / norm, 0];
    props.triangle(P(u, eaveH, z0), P(u, eaveH, z1), P(ridge, roofH, ridgeZ), n, lit('#827e71', n), roofInk);
    for (let z = z0 + 12; z < z1 - 10; z += 23) {
      const run = Math.min(z - z0, z1 - z);
      pipe([P(u, eaveH + 1.6, z), P(u - sign * run, eaveH + run * pitch + 1.6, z)], 0.72, '#4b504b', 4, ink(79, 11));
    }
    for (const edge of [z0, z1]) pipe([P(u, eaveH + 1.1, edge), P(ridge, roofH + 1.1, ridgeZ)], 1.8, '#66685e', 6, roofInk);
  }
  pipe([P(ridge0, roofH + 1.2, ridgeZ), P(ridge1, roofH + 1.2, ridgeZ)], 2.3, '#65675e', 8, roofInk);

  // A continuous recessed soffit, separate fascia and narrow rain gutter.
  box(P(ru0, eaveH - 7, z0), P(ru1, eaveH - 3.4, z1), '#a19881', ink(77, 11));
  for (const edge of [z0, z1]) {
    box(P(ru0, eaveH - 7.5, edge - 1.5), P(ru1, eaveH - 1.5, edge + 1.5), '#605f54', roofInk);
    box(P(ru0 - 1, eaveH - 1.6, edge - 2.8), P(ru1 + 1, eaveH + 1.5, edge + 2.8), '#5a5f58', roofInk);
  }
  for (const u of [ru0, ru1]) {
    box(P(u - 1.5, eaveH - 7.5, z0), P(u + 1.5, eaveH - 1.5, z1), '#605f54', roofInk);
    box(P(u - 2.8, eaveH - 1.6, z0), P(u + 2.8, eaveH + 1.5, z1), '#5a5f58', roofInk);
  }
  // Shallow expansion strips and unlit recessed downlights beneath the eave.
  for (let u = u0 + 40; u < BUILDING_END; u += 95) {
    box(P(u, eaveH - 7.7, facade + 1), P(u + 0.6, eaveH - 7.45, z1 - 3), '#756e5e', NO_INK);
  }
  for (let u = u0 + 145; u < BUILDING_END - 30; u += 265) {
    const z = facade + EAVE * 0.55;
    props.tube([P(u, eaveH - 8, z), P(u, eaveH - 6.9, z)], [4.6, 4.6], { color: '#66685e' }, metalInk, 12, true);
    props.tube([P(u, eaveH - 8.25, z), P(u, eaveH - 8.05, z)], [3.3, 3.3], { color: '#d6d5c4' }, NO_INK, 12, true);
  }
  // Galvanized downspouts tuck into the corner piers and turn out at grade.
  for (const u of [u0 + 11, BUILDING_END - 13]) {
    const z = facade + 5;
    pipe([P(u, eaveH, z1), P(u, eaveH - 13, z1), P(u, eaveH - 27, z), P(u, 12, z), P(u, 6, z + 7)], 2, '#8a8c7c', 8);
    for (const h of [50, 173, 270]) box(P(u - 3.3, h, z - 1.5), P(u + 3.3, h + 1.5, z + 2.4), '#707a70');
    box(P(u - 6, 0.4, z + 5), P(u + 6, 2.5, z + 26), '#b0aa97', wallInk);
  }

  // A short diamond-mesh fence beside the school ends on the planted side
  // of the upper rail, leaving the full run-up and all of the stair open.
  const fenceU = BUILDING_END + 12;
  const fenceBack = back + 24;
  const fenceFront = facade + 27;
  const fenceH = 5.6 * FOOT;
  const fenceInk = ink(88, 12);
  const fence = (a: Vec3, b: Vec3) => {
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dz);
    const point = (s: number, h: number): Vec3 => [a[0] + dx * s / length, h, a[2] + dz * s / length];
    pipe([point(0, fenceH), point(length, fenceH)], 1.6, '#969f95', 8, fenceInk);
    pipe([point(0, 7), point(length, 7)], 0.52, '#7d8982', 5, fenceInk);
    const bays = Math.ceil(length / 122);
    for (let i = 0; i <= bays; i++) {
      const s = i * length / bays;
      pipe([point(s, 0), point(s, fenceH + 4)], 2.1, '#8b968e', 8, fenceInk);
      props.tube([point(s, fenceH + 3), point(s, fenceH + 5)], [2.8, 1.7], { color: '#aab2a5' }, fenceInk, 8, true);
      for (const h of [20, 79, 138]) pipe([point(s - 2.6, h), point(s + 2.6, h)], 0.75, '#b4baac', 6, fenceInk);
    }
    // Real open geometry, with clipped diagonal wires rather than an opaque
    // texture. No mesh spans the approach path or the top step.
    const low = 8;
    const high = fenceH - 3;
    const rise = 1.6;
    for (const sign of [-1, 1]) {
      const first = sign > 0 ? low - length * rise : low;
      const last = sign > 0 ? high : length * rise + high;
      for (let offset = first; offset < last; offset += 17) {
        const s0 = Math.max(0, sign > 0 ? (low - offset) / rise : (offset - high) / rise);
        const s1 = Math.min(length, sign > 0 ? (high - offset) / rise : (offset - low) / rise);
        if (s1 <= s0) continue;
        pipe([point(s0, offset + sign * s0 * rise), point(s1, offset + sign * s1 * rise)], 0.23, '#8d9a91', 4, NO_INK);
      }
    }
  };
  fence(P(fenceU, 0, fenceBack), P(fenceU, 0, fenceFront));
  fence(P(fenceU, 0, fenceFront), P(fenceU - 155, 0, fenceFront));

  // Slender octagonal campus lantern beside the school-side upper landing.
  const lampU = 66;
  const lampZ = -51;
  const baseH = hill(lampU);
  const shaftTop = baseH + 14.5 * FOOT;
  const lampTop = shaftTop + 64;
  const lampInk = ink(92, 12);
  box(P(lampU - 8, baseH, lampZ - 8), P(lampU + 8, baseH + 6, lampZ + 8), '#a7a794', wallInk);
  pipe([P(lampU, baseH + 5, lampZ), P(lampU, shaftTop + 2, lampZ)], 2.6, '#717e79', 10, lampInk);
  props.tube([P(lampU, shaftTop - 8, lampZ), P(lampU, shaftTop, lampZ)], [4, 12], { color: '#5c6864' }, lampInk, 8, true);
  const ring = (angle: number, h: number, r = 12): Vec3 => P(lampU + Math.cos(angle) * r, h, lampZ + Math.sin(angle) * r);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const b = (i + 1) * Math.PI / 4;
    const n: Vec3 = [dir * Math.cos((a + b) / 2), 0, -Math.sin((a + b) / 2)];
    props.quad(ring(a, shaftTop), ring(b, shaftTop), ring(b, lampTop), ring(a, lampTop), n, lit('#e0e1d1', n), lampInk);
    pipe([ring(a, shaftTop), ring(a, lampTop)], 0.85, '#66736c', 5, lampInk);
  }
  for (const y of [shaftTop, lampTop]) props.tube([P(lampU, y - 1.5, lampZ), P(lampU, y + 1.5, lampZ)], [13.5, 13.5], { color: '#626d66' }, lampInk, 8, true);
  props.tube([P(lampU, lampTop + 1.5, lampZ), P(lampU, lampTop + 5.5, lampZ), P(lampU, lampTop + 7, lampZ)], [14, 9.5, 1.5], { color: '#727a6f' }, lampInk, 8, true);
}
