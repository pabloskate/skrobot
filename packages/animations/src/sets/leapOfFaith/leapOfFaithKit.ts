import { LEAP_OF_FAITH_PAINT as PAINT } from './leapOfFaithPalette';
import type { Vec3 } from '../../camera/view';
import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import type { WireMesh } from '../wireMesh';
import { SURFACE, surfaceInk, wallQuad, type WallKind } from '../surfaces';
import {
  LEAP_OF_FAITH_ALCOVE_Z as WORLD_LEAP_OF_FAITH_ALCOVE_Z,
  LEAP_OF_FAITH_BALCONY_END_Z as WORLD_LEAP_OF_FAITH_BALCONY_END_Z,
  LEAP_OF_FAITH_DROP, LEAP_OF_FAITH_FOOT as F,
  leapOfFaithStairPoint,
  LEAP_OF_FAITH_MID_END_Z as WORLD_LEAP_OF_FAITH_MID_END_Z,
  LEAP_OF_FAITH_RAIL_HEIGHT, LEAP_OF_FAITH_RAIL_RADIUS,
  leapOfFaithStairHeading,
  LEAP_OF_FAITH_STAIR_END_Z as WORLD_LEAP_OF_FAITH_STAIR_END_Z,
  leapOfFaithRailBase as WORLD_leapOfFaithRailBase, leapOfFaithStairGround as WORLD_leapOfFaithStairGround,
} from './leapOfFaithLayout';
// The facade is authored in an architectural elevation's left-to-right z;
// reflect it once into the stage's camera convention, along with shadows.
export const LEAP_OF_FAITH_ALCOVE_Z = -WORLD_LEAP_OF_FAITH_ALCOVE_Z;
export const LEAP_OF_FAITH_BALCONY_END_Z = -WORLD_LEAP_OF_FAITH_BALCONY_END_Z;
export const LEAP_OF_FAITH_MID_END_Z = -WORLD_LEAP_OF_FAITH_MID_END_Z;
export const LEAP_OF_FAITH_STAIR_END_Z = -WORLD_LEAP_OF_FAITH_STAIR_END_Z;
export const leapOfFaithRailBase = (z: number) => WORLD_leapOfFaithRailBase(-z);
export const leapOfFaithStairGround = (z: number) => WORLD_leapOfFaithStairGround(-z);
export const UP: Vec3 = [0, 1, 0];
export const FRONT: Vec3 = [1, 0, 0];
export const FLOOR = -LEAP_OF_FAITH_DROP;
export const FAR = 300 * F;
/** Faces meant to read as flush stand this far apart. Exactly coplanar faces
 * z-fight (they flicker as the camera moves), at any depth precision. One unit
 * is a third of an inch: invisible, and many times what a depth buffer resolves. */
export const STAND_OFF = 1;
export const CONCRETE = PAINT.concrete;
export const WHITE = PAINT.white;
export const TREAD = PAINT.tread;
export const METAL = PAINT.metal;
/** The railing's diamond mesh: wire gap, wire radius and color. */
export const MESH: WireMesh = { spacing: 7.5, radius: 0.22, color: PAINT.mesh };
export const DETAIL: Ink = { id: 85, priority: 5, width: 0.16, kind: INK_PROP, solid: SURFACE.concrete };
export const RAIL: Ink = { id: 62, priority: 6, width: 0.1, kind: INK_PROP, solid: SURFACE.metal };
export type RailShadow = { a: Vec3; b: Vec3; radius: number };
export type BoxShadow = { min: Vec3; max: Vec3 };

export const CONCRETE_INK = surfaceInk('concrete');
export const METAL_INK = surfaceInk('metal');
export type Pipe = ReturnType<typeof makePipe>;
export type Structure = (min: Vec3, max: Vec3, side?: string, top?: string, shadow?: boolean, faces?: string) => void;
export function floor(b: Bake, x0: number, x1: number, z0: number, z1: number, y: number, color: string) {
  b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], UP, { color }, CONCRETE_INK);
}

/** Stair wing pieces are authored straight, across in x and down the stair
 * in −z, then carried through the real plan: out from the walkway at 90°,
 * round the landing, along the facade. The facade, walkway, roof and
 * undercroft never pass through this. */
export const stairVertex = ([x, y, z]: Vec3): Vec3 => {
  const point = leapOfFaithStairPoint(x, -z);
  return [point.x, y, -point.z];
};
export class StairBake extends Bake {
  constructor() { super(color => color); }
  override vertex(p: Vec3, n: Vec3, paint: Paint, ink: Ink, corner: Vec3 = [0, 0, 0], band?: [number, number]) {
    // Authored across (+x) points to world (sin h, −cos h), downhill (−z) to (cos h, sin h).
    const h = leapOfFaithStairHeading(-p[2]), c = Math.cos(h), sn = Math.sin(h);
    const normal: Vec3 = [n[0] * sn - n[2] * c, n[1], n[0] * c + n[2] * sn];
    super.vertex(stairVertex(p), normal, paint, ink, corner, band);
  }
}

/** One panel of the diamond mesh over a railing: a quad rising with the stair,
 * its corners' (along, up) distances in `aCorner` for the wires to be drawn
 * from per pixel (wireMesh.ts). Unlike tubes of wire, that never sparkles. */
export function meshPanel(b: Bake, x: number, z0: number, z1: number, y0: number, y1: number) {
  const width = z1 - z0;
  const height = LEAP_OF_FAITH_RAIL_HEIGHT - 12;
  const corners = ([[0, 0], [width, 0], [width, height], [0, height]] as const).map(([u, v]) => ({
    at: [x, y0 + (y1 - y0) * u / width + 7 + v, z0 + u] as Vec3,
    along: [u, v, 0] as Vec3,
  }));
  for (const k of [0, 1, 2, 0, 2, 3]) b.vertex(corners[k].at, FRONT, { color: MESH.color }, NO_INK, corners[k].along);
}

/**
 * A pipe drawer: galvanised tube along `points` (set units), each segment casting a rail shadow unless `cast` is
 * off. Stair pipes are authored in the stair's straight frame and carried through its plan for their shadows.
 */
export const makePipe = (b: Bake, stairs: boolean, railSegments: RailShadow[]) => (points: Vec3[], radius = LEAP_OF_FAITH_RAIL_RADIUS, cast = true, color: string = METAL) => {
  b.tube(points, points.map(() => radius), { color }, RAIL, 8);
  if (!cast) return;
  for (let i = 1; i < points.length; i++) {
    railSegments.push({ a: stairs ? stairVertex(points[i - 1]) : points[i - 1], b: stairs ? stairVertex(points[i]) : points[i], radius });
  }
};

/**
 * A flat wall face carrying the look's wall wear (SpotLook.walls): each corner says where it is on its wall,
 * along it, above its foot and below its top edge. A face square to x runs along z, one square to z along x.
 * Metadata follows the face as authored, never transformed as a position: the look reads wall distances. `use`
 * is how hard boards hit it, at the foot and at the top edge (the shader blends between them up the face).
 */
export function wall(
  b: Bake, pts: [Vec3, Vec3, Vec3, Vec3], n: Vec3, color: string, foot: number | [number, number], tops: [number, number],
  kind: WallKind = 'painted', use: [number, number] = [0, 0],
) {
  const axis = Math.abs(n[2]) > 0.5 ? 0 : 2;
  const first = (p: Vec3) => p[axis] === pts[0][axis];
  const at = (p: Vec3) => {
    const base = typeof foot === 'number' ? foot : foot[first(p) ? 0 : 1];
    const top = first(p) ? tops[0] : tops[1];
    const height = Math.max(top - base, 1e-6);
    return { along: p[axis], up: p[1] - base, down: top - p[1], use: use[0] + (use[1] - use[0]) * (p[1] - base) / height };
  };
  wallQuad(b, pts, n, { color }, DETAIL, [at(pts[0]), at(pts[1]), at(pts[2]), at(pts[3])], kind);
}
/** Reflection is applied exactly once to completed elevation meshes and analytic casters. */
export const mirror = ([x, y, z]: Vec3): Vec3 => [x, y, -z];

/** Concrete slab tops with painted-render sides; one flat sunlit paint per face. */
export function structureBox(b: Bake, min: Vec3, max: Vec3, side: string, top: string, faces = 'tbfkle') {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const list: Array<[string, Vec3, [Vec3, Vec3, Vec3, Vec3]]> = [
    ['t', [0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
    ['b', [0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
    ['f', [0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    ['k', [0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
    ['l', [-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
    ['e', [1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
  ];
  list.forEach(([key, n, pts], i) => {
    if (!faces.includes(key)) return;
    b.quad(...pts, n, { color: key === 't' ? top : side }, {
      ...DETAIL, id: DETAIL.id + i, priority: DETAIL.priority + i,
      solid: key === 't' ? SURFACE.concrete : SURFACE.stucco,
    });
  });
}

/* ----- World-axis pieces, in feet (the architecture round the gap) ----- */

/** How a box is finished, beyond its paint. */
export interface BoxFinish {
  /** Its top's paint (default its sides'), and the top's surface (default concrete, outlined). */
  top?: string;
  topInk?: Ink;
  /** Its underside's paint (default its sides'). */
  underside?: string;
  /** Its sides' wear (default painted): cast concrete only stains, painted walls also flake. */
  kind?: WallKind;
  /** Its sides drawn with this surface instead, and no wall wear (siding, block, glass). */
  sides?: Ink;
  /** Where its sides' feet are for the wear (feet; default its bottom): a wall that doesn't stand on the ground gets no splash-back. */
  foot?: number;
  /** How hard boards hit its sides, at the foot and at the top (0-1). */
  use?: [number, number];
  /** Which faces to draw, of 'tbfkle' (top, bottom, +z, −z, −x, +x). */
  faces?: string;
}

/**
 * A box from `lo` to `hi` (feet): its top concrete, its underside in `underside`, and its four sides through the
 * kit's wall helper, so they carry the look's wall wear (or the surface `sides`).
 */
export function worldBox(b: Bake, lo: Vec3, hi: Vec3, color: string, finish: BoxFinish = {}) {
  const { top = color, underside = color, kind = 'painted', faces = 'tbfkle', use = [0, 0] } = finish;
  const min = lo.map(v => v * F) as Vec3;
  const max = hi.map(v => v * F) as Vec3;
  if (faces.includes('t')) {
    if (finish.topInk) structureTop(b, min, max, top, finish.topInk);
    else structureBox(b, min, max, color, top, 't');
  }
  if (faces.includes('b')) structureBox(b, min, max, underside, top, 'b');
  const [x, y, z] = min;
  const [X, Y, Z] = max;
  const foot = finish.foot === undefined ? y : finish.foot * F;
  const sides: [string, [Vec3, Vec3, Vec3, Vec3], Vec3][] = [
    ['e', [[X, y, Z], [X, y, z], [X, Y, z], [X, Y, Z]], [1, 0, 0]],
    ['l', [[x, y, z], [x, y, Z], [x, Y, Z], [x, Y, z]], [-1, 0, 0]],
    ['f', [[x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z]], [0, 0, 1]],
    ['k', [[X, y, z], [x, y, z], [x, Y, z], [X, Y, z]], [0, 0, -1]],
  ];
  for (const [key, corners, normal] of sides) {
    if (!faces.includes(key)) continue;
    if (finish.sides) b.quad(...corners, normal, { color }, finish.sides);
    else wall(b, corners, normal, color, foot, [Y, Y], kind, use);
  }
}

function structureTop(b: Bake, [x0, , z0]: Vec3, [x1, y1, z1]: Vec3, color: string, ink: Ink) {
  b.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], { color }, ink);
}

/** A plain box in feet, every face one surface and no wall wear: hardware, frames, glass, planks. */
export function plainBox(b: Bake, lo: Vec3, hi: Vec3, color: string, ink: Ink, faces = 'tbfkle', top = color) {
  b.box(lo.map(v => v * F) as Vec3, hi.map(v => v * F) as Vec3, color, top, ink, faces);
}

/** A shadow box from `min` to `max`, given in feet. */
export function caster(boxes: BoxShadow[], min: Vec3, max: Vec3) {
  boxes.push({ min: min.map(v => v * F) as Vec3, max: max.map(v => v * F) as Vec3 });
}

/** Surfaces the architecture uses besides the walls' own. */
export const INK = {
  concrete: surfaceInk('concrete'),
  stucco: surfaceInk('stucco'),
  metal: surfaceInk('metal'),
  glass: surfaceInk('glass'),
  sash: surfaceInk('sash'),
  siding: surfaceInk('siding'),
  soil: surfaceInk('soil'),
  roofing: surfaceInk('roofing'),
  pavers: surfaceInk('pavers'),
  asphalt: surfaceInk('asphalt'),
  /** Painted concrete block in courses (the look's masonry). */
  block: { ...surfaceInk('concrete'), solid: 10 },
  /** Foliage masses, leaves patterned on them in three dimensions (the look's `foliage`). */
  leaves: { ...surfaceInk('concrete'), solid: 13 },
} as const;

/** A point given in feet, in set units. */
export const ft = ([x, y, z]: Vec3): Vec3 => [x * F, y * F, z * F];

/** A tube through points given in feet, `radius` in set units, one surface and no outline. */
export function tubeFt(b: Bake, points: Vec3[], radius: number, color: string, ink: Ink, sides = 8) {
  b.tube(points.map(ft), points.map(() => radius), { color }, ink, sides);
}

/** Blend two #rrggbb colours, `t` of the way from `a` to `b`. */
export function mixHex(a: string, b: string, t: number) {
  const ca = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * Math.min(1, Math.max(0, t))).toString(16).padStart(2, '0')).join('');
}

/** The normal of a triangle's plane, from its winding (counter-clockwise seen from outside). */
export function normalOf(a: Vec3, c: Vec3, d: Vec3): Vec3 {
  const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const m = Math.hypot(...n) || 1;
  return [n[0] / m, n[1] / m, n[2] / m];
}
