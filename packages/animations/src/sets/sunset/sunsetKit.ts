import type { Vec3 } from '../../camera/view';
import { NO_INK, type Bake, type Ink, type Paint } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { SET_FOOT } from '../setScale';
import { SURFACE, type SurfaceName } from '../surfaces';
import * as layout from './sunsetLayout';

/**
 * Shared pieces for Roof to Bank's bake under the realistic look (light: 'shader'): paint is the authored,
 * sunlit colour, laid flat, and the look lights and textures each face by its surface (sets/surfaces.ts).
 * The set is authored at 1/SUNSET_SCALE and baked to world size (sunset3d.ts), so a real foot here is FT,
 * while the layout's own positions (lanes, planters, the roof) count in F.
 */

/** Authored coordinates times this are the world's. */
export const SCALE = layout.SUNSET_SCALE;
/** The authoring grid's foot (1.5 real feet): the layout's positions count in it. */
export const F = SET_FOOT;
/** A real foot in authored units, for things built to their own size: rails, curbs, poles, furniture. */
export const FT = SET_FOOT / SCALE;
/** A real inch in authored units. */
export const IN = FT / 12;
/** Straight up. */
export const UP: Vec3 = [0, 1, 0];
/** Decal layers, 0.3, 0.6 and 0.9 world units proud of the floor, so overlapping marks never fight. */
export const LIFT = [0.3 / SCALE, 0.6 / SCALE, 0.9 / SCALE] as const;

/* ----- The layout, in authored units ----- */

/** Sidewalk and street level, the bank's fall below the roof. */
export const LOWER = -layout.SUNSET_DROP / SCALE;
/** The bank's crest line (x), where it leaves the roof's front edge. */
export const BANK_START = layout.SUNSET_BANK_START / SCALE;
/** The bank's foot, where its toe meets the sidewalk. */
export const BANK_END = layout.SUNSET_BANK_END / SCALE;
/** The crest's height, six feet under the roof. */
export const BANK_TOP = layout.SUNSET_BANK_TOP / SCALE;
/** Where the bank's straight face rounds into its toe. */
export const TOE_START = layout.SUNSET_TOE_START / SCALE;
/** The bank's ends along the frontage: right (from the street) and left. */
export const BANK_Z0 = layout.SUNSET_BANK_Z0 / SCALE;
export const BANK_Z1 = layout.SUNSET_BANK_Z1 / SCALE;
/** The roof deck's back and its two ends. */
export const ROOF_BACK = layout.SUNSET_ROOF_BACK / SCALE;
export const ROOF_Z0 = layout.SUNSET_ROOF_Z0 / SCALE;
export const ROOF_Z1 = layout.SUNSET_ROOF_Z1 / SCALE;
/** The near curb: the sidewalk's street edge. */
export const SIDEWALK_END = layout.SUNSET_SIDEWALK_END / SCALE;
/** The line down the bank. */
export const LANE_Z = layout.SUNSET_LANE_Z / SCALE;
/** Where the bank's right-hand end has tapered down to the sidewalk beside the lot. */
export const TAPER_END = BANK_Z0 - 12 * F;
/** The asphalt lies a fraction under the sidewalks; its wear paints over it at its own heights. */
export const ROAD = LOWER - 0.3;
/** Sunset's lane lines, out from the near curb: a dashed white, the double yellow, a dashed white, the far curb. */
export const LANES = { dash: SIDEWALK_END + 9 * F, middle: SIDEWALK_END + 19 * F, farDash: SIDEWALK_END + 30 * F, farCurb: SIDEWALK_END + 39 * F };
/** The shopfronts' line across the boulevard, behind the far sidewalk. */
export const FAR_FRONT = SIDEWALK_END + 46 * F;
/** The bays' wet floor under the canopy. */
export const BAY_FLOOR = -190;

/** The bank's height at x (authored units). */
export const bankY = (x: number) => layout.sunsetGround(x * SCALE) / SCALE;
/** The bank's gradient dy/dx at x. */
export const bankSlope = (x: number) => layout.sunsetSlope(x * SCALE);
/** An authored point in the world. */
export const toWorld = (p: Vec3): Vec3 => [p[0] * SCALE, p[1] * SCALE, p[2] * SCALE];

/** What the ground mesh lays where, besides the default street asphalt. */
export type PavingKind = 'bank' | 'sidewalk' | 'farSidewalk' | 'apron' | 'lot';
/**
 * The level paving round the bank (authored units): the sidewalk and the far sidewalk run the whole street,
 * the concrete apron of the wash's driveway lies past its left end, the side lot past its right. Everything
 * else is street asphalt, a fraction lower (ROAD).
 */
export const PAVING: ReadonlyArray<{ x0: number; x1: number; z0: number; z1: number; kind: PavingKind }> = [
  { x0: BANK_START, x1: BANK_END, z0: TAPER_END, z1: BANK_Z1, kind: 'bank' },
  { x0: BANK_END, x1: SIDEWALK_END, z0: -10000, z1: 10000, kind: 'sidewalk' },
  { x0: SIDEWALK_END + 39 * F, x1: FAR_FRONT, z0: -10000, z1: 10000, kind: 'farSidewalk' },
  { x0: ROOF_BACK - 2000, x1: BANK_END, z0: BANK_Z1, z1: 3500, kind: 'apron' },
  { x0: ROOF_BACK - 2000, x1: BANK_END, z0: -4000, z1: TAPER_END, kind: 'lot' },
];

/**
 * The drawn floor's height at (x, z), authored units: the roof deck, the bank, the level paving, or the street
 * a fraction under it. Decals are laid on this; the shoulder beside the roof and the bank's tapered end aren't
 * covered (nothing is drawn on them).
 */
export function floorY(x: number, z: number): number {
  if (x >= ROOF_BACK && x < BANK_START && z >= ROOF_Z0 && z <= ROOF_Z1) return 0;
  if (x >= BANK_START && x <= BANK_END && z >= BANK_Z0 && z <= BANK_Z1) return bankY(x);
  const patch = PAVING.find((p) => p.kind !== 'bank' && x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1);
  return patch ? LOWER : ROAD;
}

/** The drawn floor's height in the world at a world (x, z): what the decal test measures lift from. */
export const sunsetFloor = (x: number, z: number) => floorY(x / SCALE, z / SCALE) * SCALE;

/* ----- Inks ----- */

/** An uninked face of one surface. */
export const tag = (surface: SurfaceName | number, id = 0): Ink => ({
  id, priority: 0, width: 0, kind: 0, solid: typeof surface === 'number' ? surface : SURFACE[surface],
});
/** An outlined part of one surface: the canopy, a planter, a building, so each reads as its own form. */
export const part = (id: number, surface: SurfaceName | number, priority = 2, width = 0.14): Ink => ({
  id, priority, width, kind: INK_PROP, solid: typeof surface === 'number' ? surface : SURFACE[surface],
});
/** Painted block walls: the look's masonry courses (solid 10). */
export const BLOCK = 10;
/** Foliage masses, leaves patterned on them in three dimensions (solid 13, the look's `foliage`). */
export const LEAVES = 13;
/** Steel hardware, shaded by the look's metal surface. */
export const STEEL = tag('metal');

/* ----- Shapes ----- */

/** The unit normal of the plane through three points, wound counter-clockwise seen from outside. */
export function normalOf(a: Vec3, c: Vec3, d: Vec3): Vec3 {
  const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const m = Math.hypot(...n) || 1;
  return [n[0] / m, n[1] / m, n[2] / m];
}

/** The same normal turned to face up, for marks on sloping ground whatever their winding. */
export function normalUp(a: Vec3, c: Vec3, d: Vec3): Vec3 {
  const n = normalOf(a, c, d);
  return n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
}

/** A flat face through four corners, its normal from their winding (counter-clockwise seen from outside). */
export function face(b: Bake, a: Vec3, c: Vec3, d: Vec3, e: Vec3, color: string, ink: Ink = NO_INK, n: Vec3 = normalOf(a, c, d)) {
  b.quad(a, c, d, e, n, { color }, ink);
}

/** A level floor over a rectangle. */
export function floor(b: Bake, x0: number, x1: number, z0: number, z1: number, y: number, color: string, ink: Ink) {
  b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], UP, { color }, ink);
}

/**
 * A box in flat paint (the look lights it) carrying its surface; inked, each face is its own part. (Bake.box
 * shades its faces and turns a null ink into NO_INK, which would drop the surface.)
 */
export function solidBox(b: Bake, min: Vec3, max: Vec3, side: string, top: string, ink: Ink, faces = 'tbfkle') {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const list: Array<[string, Vec3, Vec3[], string]> = [
    ['t', [0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], top],
    ['b', [0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], side],
    ['f', [0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], side],
    ['k', [0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], side],
    ['l', [-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], side],
    ['e', [1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], side],
  ];
  list.forEach(([key, n, [a, c, d, e], color], i) => {
    if (!faces.includes(key)) return;
    const faceInk = ink.width > 0 ? { ...ink, id: ink.id + i, priority: ink.priority + i } : ink;
    b.quad(a, c, d, e, n, { color }, faceInk);
  });
}

/**
 * An upright face from `a` to `c` (plan), `y0` to `y1`, facing `n`, cut into columns about `step` wide and the
 * given rows (0 its foot, 1 its top) so its wear can live in its vertex colours: `tone(s, t)` is the paint `s`
 * along it from `a` (plus `s0`) and `t` up it. Decals layered on a wall fight at a distance; this doesn't.
 */
export function toneWall(b: Bake, a: Plan, c: Plan, y0: number, y1: number, n: Vec3, step: number, rows: readonly number[], tone: (s: number, t: number) => string, ink: Ink, s0 = 0) {
  const length = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const columns = Math.max(1, Math.round(length / step));
  const at = (k: number, t: number): Vec3 => [a[0] + ((c[0] - a[0]) * k) / columns, y0 + (y1 - y0) * t, a[1] + ((c[1] - a[1]) * k) / columns];
  for (let k = 0; k < columns; k++) {
    const sa = s0 + (length * k) / columns, sc = s0 + (length * (k + 1)) / columns;
    for (let r = 0; r + 1 < rows.length; r++) {
      const [t0, t1] = [rows[r], rows[r + 1]];
      b.quadCorners(at(k, t0), at(k + 1, t0), at(k + 1, t1), at(k, t1), n,
        [{ color: tone(sa, t0) }, { color: tone(sc, t0) }, { color: tone(sc, t1) }, { color: tone(sa, t1) }], ink);
    }
  }
}

/** A round tube through points: pipe, post, pole, wire. */
export function tube(b: Bake, spine: Vec3[], radius: number | number[], color: string, ink: Ink = STEEL, sides = 8, caps = true) {
  b.tube(spine, typeof radius === 'number' ? spine.map(() => radius) : radius, { color } as Paint, ink, sides, caps);
}

/** A thin cylinder's sun shadow on the ground, authored units (sunset3d.ts takes it to the world). */
export type RailShadow = { a: Vec3; b: Vec3; radius: number };
/** A box that shades the ground and props, authored units. */
export type ShadowBox = { min: Vec3; max: Vec3; yaw?: number };
/** A point in plan: x, z. */
export type Plan = [number, number];

/** Steel pipe through several points, its shadow cast per segment. */
export function pipe(b: Bake, points: Vec3[], shadows: RailShadow[] | null, radius = 1.4 * IN, color = '#a7aba5') {
  tube(b, points, radius, color);
  if (shadows) for (let i = 0; i + 1 < points.length; i++) shadows.push({ a: points[i], b: points[i + 1], radius });
}

/** Chain-link spacing and wire in authored units, drawn per pixel (wireMesh.ts) so it never sparkles. */
export const CHAIN_LINK = { spacing: 2.2 * IN, radius: 0.12, color: '#a9afa9' };

/**
 * One panel of chain link between two posts at `a` and `b` (plan), its bottom at `y0` and `y1` above them and
 * `height` tall: the corners carry their distance along and up the panel for the mesh shader.
 */
export function meshPanel(mesh: Bake, a: Plan, b: Plan, y0: number, y1: number, height: number) {
  const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n: Vec3 = [-(b[1] - a[1]) / width, 0, (b[0] - a[0]) / width];
  const corners = ([[0, y0, 0], [width, y1, 0], [width, y1, height], [0, y0, height]] as const).map(([u, y, v]) => ({
    at: [a[0] + ((b[0] - a[0]) * u) / width, y + v, a[1] + ((b[1] - a[1]) * u) / width] as Vec3,
    along: [u, v, 0] as Vec3,
  }));
  for (const k of [0, 1, 2, 0, 2, 3]) mesh.vertex(corners[k].at, n, { color: CHAIN_LINK.color }, NO_INK, corners[k].along);
}

/** A chain-link fence from `from` to `to` (plan) on level ground at `y`: posts every ten feet, a top rail, the mesh between. */
export function chainLink(props: Bake, mesh: Bake, from: Plan, to: Plan, y: number, height: number) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const bays = Math.max(1, Math.round(length / (10 * FT)));
  const at = (k: number): Plan => [from[0] + ((to[0] - from[0]) * k) / bays, from[1] + ((to[1] - from[1]) * k) / bays];
  for (let k = 0; k <= bays; k++) {
    const p = at(k);
    tube(props, [[p[0], y, p[1]], [p[0], y + height + 2 * IN, p[1]]], 1.2 * IN, '#a0a6a1');
    if (k < bays) {
      const q = at(k + 1);
      tube(props, [[p[0], y + height, p[1]], [q[0], y + height, q[1]]], 0.8 * IN, '#a0a6a1', STEEL, 6);
      meshPanel(mesh, p, q, y + 2 * IN, y + 2 * IN, height - 2 * IN);
    }
  }
}

/* ----- Tone ----- */

/** Two hex colours mixed in display space. */
export function mixHex(a: string, b: string, t: number) {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * Math.min(1, Math.max(0, t))).toString(16).padStart(2, '0')).join('');
}

/** Deterministic value noise in [0, 1), smooth between integer lattice points. */
export function valueNoise(x: number, z: number) {
  const hash = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
