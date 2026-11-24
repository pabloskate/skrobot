import type { Vec3 } from '../../camera/view';
import type { Bake, Paint } from '../../three/bake';
import { mixHex, tag } from '../lookKit';
import { WATER_TOWER_FOOT as F, WATER_TOWER_LANDING_X, WATER_TOWER_OVERHANG, WATER_TOWER_ROOF_RADIUS } from './waterTowerLayout';
import { WATER_TOWER_PAINT as PAINT } from './waterTowerPalette';

/**
 * The water tower gap's wear, drawn on the decals (the ground's material, a hair proud of it, so the rider's
 * shadow and the look's shade cross every mark): the roofs' faint pour joints, a few patched rectangles and the
 * stains water left round the fixtures (05, 07, 15, 16, 17, 18, 22, 70), and a chalk line on the slot's pavement
 * (66). Nobody skated here before that morning: no urethane anywhere. Feet in the spot's axes.
 */

const CONCRETE = tag('concrete');
const ASPHALT = tag('asphalt');
/** Layers of decal over the ground (set units), so overlapping marks never fight. */
const LIFT = { patch: 0.35, joint: 0.55, stain: 0.75 } as const;
const UP: Vec3 = [0, 1, 0];
const ROOF_R = WATER_TOWER_ROOF_RADIUS / F;
const CENTRES = [-ROOF_R, WATER_TOWER_LANDING_X / F];

/** A level point over the ground at height `y` (feet), lifted `lift` set units. */
const over = (x: number, y: number, z: number, lift: number): Vec3 => [x * F, y * F + lift, z * F];

/**
 * A soft line through level points (feet), `half` feet either side: the joint's colour down its middle, fading to
 * `edge` (the ground's own paint) at both sides, so a far line settles into a faint tone rather than a stair-step.
 */
function softLine(b: Bake, pts: Array<[number, number]>, half: number, y: number, core: string, edge: string, ink = CONCRETE, lift: number = LIFT.joint) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const l = Math.hypot(x1 - x0, z1 - z0), nx = (half * (z1 - z0)) / l, nz = (-half * (x1 - x0)) / l;
    const side = (s: number): [Vec3, Vec3] => [over(x0 + s * nx, y, z0 + s * nz, lift), over(x1 + s * nx, y, z1 + s * nz, lift)];
    const [a0, a1] = side(-1), [m0, m1] = side(0), [c0, c1] = side(1);
    const paint = (color: string): Paint => ({ color });
    b.quadCorners(a0, m0, m1, a1, UP, [paint(edge), paint(core), paint(core), paint(edge)], ink);
    b.quadCorners(m0, c0, c1, m1, UP, [paint(core), paint(edge), paint(edge), paint(core)], ink);
  }
}

/** A round soft stain at (x, z), `r` feet across its ragged rim: `center` in the middle fading to `rim`. */
function blot(b: Bake, x: number, z: number, y: number, r: number, center: string, rim: string, seed: number, ink = CONCRETE) {
  const around = 12;
  const at = (j: number): Vec3 => {
    const a = (j / around) * Math.PI * 2, rr = r * (0.7 + 0.45 * Math.abs(Math.sin(seed * 12.9898 + j * 78.233)));
    return over(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, LIFT.stain);
  };
  for (let k = 0; k < around; k++) {
    b.vertex(over(x, y, z, LIFT.stain), UP, { color: center }, ink);
    b.vertex(at(k + 1), UP, { color: rim }, ink);
    b.vertex(at(k), UP, { color: rim }, ink);
  }
}

/** A level rectangle turned `yaw` radians, `w` by `d` feet, in one flat paint (a patch of later concrete). */
function patch(b: Bake, x: number, z: number, w: number, d: number, yaw: number, color: string) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (u: number, v: number) => over(x + u * c - v * s, 0, z + u * s + v * c, LIFT.patch);
  b.quad(at(-w / 2, d / 2), at(w / 2, d / 2), at(w / 2, -d / 2), at(-w / 2, -d / 2), UP, { color }, CONCRETE);
}

/**
 * The roofs: each poured in rings round its middle and in bays, the cold joints between them now only faint
 * lines (the large arcs and straight lines of 15 and 16), a few patches, and a dried water mark or two.
 */
function roofs(b: Bake) {
  const faint = mixHex(PAINT.roof, PAINT.joint, 0.55);
  CENTRES.forEach((cx, t) => {
    // Pour rings, a little off the middle on the landing roof.
    for (const r of t === 0 ? [27, 58] : [31, 62]) {
      const n = Math.round(r * 2.2);
      softLine(b, Array.from({ length: n + 1 }, (_, i): [number, number] => [cx + r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)]), 0.32, 0, faint, PAINT.roof);
    }
    // Bay joints out from the inner ring to the edge, not quite evenly spaced.
    const first = t === 0 ? 0.35 : 1.1;
    for (let k = 0; k < 6; k++) {
      const a = first + k * ((2 * Math.PI) / 6) + 0.12 * Math.sin(k * 3.7 + t);
      const inner = t === 0 ? 27 : 31;
      softLine(b, [[cx + inner * Math.cos(a), inner * Math.sin(a)], [cx + (ROOF_R - 1.2) * Math.cos(a), (ROOF_R - 1.2) * Math.sin(a)]], 0.3, 0, faint, PAINT.roof);
    }
  });
  // Patched rectangles: later concrete, a touch fresher or duller than the deck round them.
  const patches: Array<[number, number, number, number, number, string]> = [
    [-118, 31, 11, 7, 0.4, PAINT.patchPale], [-95, -48, 7, 5, 1.2, PAINT.patchDark], [-140, -12, 9, 9, 0.1, PAINT.patchDark],
    [-33, 40, 6, 4, -0.3, PAINT.patchPale], [128, 38, 12, 6, 0.7, PAINT.patchDark], [96, -41, 8, 6, -0.5, PAINT.patchPale],
    [150, -14, 6, 5, 0.2, PAINT.patchPale], [70, 52, 5, 4, 1.0, PAINT.patchDark],
  ];
  for (const [x, z, w, d, yaw, color] of patches) patch(b, x, z, w, d, yaw, mixHex(PAINT.roof, color, 0.75));
  // Water stood and dried in broad, faint marks where the deck dips.
  for (const [x, z, r, seed] of [[-130, 22, 14, 1], [-60, 48, 10, 2], [118, -30, 16, 3], [140, 40, 11, 4]])
    blot(b, x, z, 0, r, mixHex(PAINT.roof, PAINT.stain, 0.45), PAINT.roof, seed);
}

/** Stains round the fixtures (07, 18, 22, 70): iron run off the vent's foot, grime round the hatch and every stub. */
function fixtureStains(b: Bake, vent: [number, number], hatch: [number, number], stubs: number[][]) {
  blot(b, vent[0], vent[1], 0, 4.6, PAINT.rust, PAINT.roof, 11);
  blot(b, vent[0] + 1.4, vent[1] - 2.2, 0, 2.6, mixHex(PAINT.rust, PAINT.stain, 0.3), PAINT.roof, 12);
  blot(b, hatch[0], hatch[1], 0, 6.2, mixHex(PAINT.stain, PAINT.roof, 0.2), PAINT.roof, 13);
  blot(b, hatch[0] - 10, hatch[1], 0, 4.2, mixHex(PAINT.stain, PAINT.roof, 0.4), PAINT.roof, 14);
  stubs.forEach(([x, z], i) => blot(b, x, z, 0, 0.9, mixHex(PAINT.rust, PAINT.stain, 0.5), PAINT.roof, 20 + i));
}

/** A chalk line along the landing tank's footing in the slot (66), laid out by the crew and half scuffed away. */
function chalk(b: Bake) {
  const r = (WATER_TOWER_ROOF_RADIUS - WATER_TOWER_OVERHANG) / F + 3.25 + 2.2, cx = WATER_TOWER_LANDING_X / F;
  const pts = Array.from({ length: 25 }, (_, i): [number, number] => {
    const a = Math.PI - 0.62 + (1.24 * i) / 24;
    return [cx + r * Math.cos(a), r * Math.sin(a)];
  });
  softLine(b, pts, 0.22, -21, mixHex(PAINT.asphalt, PAINT.chalk, 0.6), PAINT.asphalt, ASPHALT);
}

export function buildWaterTowerWear(decals: Bake, fixtures: { vent: [number, number]; hatch: [number, number]; stubs: number[][] }) {
  roofs(decals);
  fixtureStains(decals, fixtures.vent, fixtures.hatch, fixtures.stubs);
  chalk(decals);
}
