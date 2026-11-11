import type { Vec3 } from '../../camera/view';
import {
  CARLSBAD_FOOT as F,
  carlsbadBankEnd,
  carlsbadCapBack,
  carlsbadLanding,
  carlsbadPaved,
  carlsbadToeTop,
  carlsbadUpperEdge,
} from './carlsbadLayout';

/**
 * Where the Carlsbad ground is worn, as paint for the look's surfaces (sets/surfaces.ts): turf browner
 * where people sit, climb and bail (the shader breaks the browner paint into straw and bare dirt), and
 * concrete darker where it is older or where dirt washes and gathers. Everything is a function of the
 * plan, in set units, so the bake samples it per vertex and decals blend into it at their edges.
 */

/** Watered turf, dry straw and trodden dirt (refs/163 and 04 for the turf; 03, 191 and 01 for the wear). */
export const TURF = { lush: '#587a34', straw: '#958a55', dirt: '#7e705a' } as const;
/** Pad, lower path, stair concrete, the toe wall's face and its worn cap (refs/163, 03, 191). */
export const PAVING = {
  pad: '#c3beaf',
  path: '#b2ad9e',
  stair: '#c8c3b4',
  cap: '#c6c1b2',
  face: '#9e9a8b',
  grime: '#76736a',
  dirt: '#a09885',
} as const;

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Vec3;
const toHex = (c: Vec3) =>
  '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((v, i) => v + (b[i] - v) * t) as Vec3;
/** Two hex colours mixed in display space. */
export const mixHex = (a: string, b: string, t: number) => toHex(mix(hex(a), hex(b), t));
const scale = (a: Vec3, k: number): Vec3 => a.map((v) => v * k) as Vec3;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Deterministic value noise in [0, 1) (feet in, so patterns stay put whatever the scale). */
function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function valueNoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, z: number) => valueNoise(x, z) * 0.6 + valueNoise(x * 2.3 + 5.2, z * 2.3 + 1.7) * 0.4;
/** Distance from a point to a segment, in the same units. */
const toSegment = (x: number, z: number, a: [number, number], b: [number, number]) => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = clamp01(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
};

/**
 * How worn the turf is at a plan point (set units): `dry` 0 watered to 1 straw, `bare` 0 to 1 trodden dirt.
 * On the bank it follows use: the crest by the lip where people stand and sit, the broad scar down the
 * landing line where bails slide, the foot along the wall cap where people step up, the climb beside the
 * stair cheek and the filmers' patch by the hallway. Greener low down and toward the lobe's far end;
 * the lawns are greener but uneven, scuffed along the paths' edges.
 */
export function turfWear(x: number, z: number): { dry: number; bare: number } {
  const X = x / F, Z = z / F;
  const edge = carlsbadUpperEdge(z) / F;
  const onBank = Z < 4.33 && X > edge && X < carlsbadCapBack(z) / F + 0.01;
  if (onBank) {
    const d0 = X - edge, dc = Math.max(0, carlsbadCapBack(z) / F - X);
    const t = d0 / Math.max(0.5, d0 + dc);
    let dry = 0.3 + 0.34 * (fbm(X * 0.11 + 3.1, Z * 0.11) - 0.5) - 0.32 * t;
    dry -= 0.3 * smooth(-28, -52, Z);
    // The crest, most worn by the lip and the stair head where people wait their turn.
    dry += 0.6 * Math.exp(-d0 / 1.8) * smooth(-34, -8, Z);
    // The landing-line scar: a broad band down the bank, a little uphill of the rider's line.
    const scar = Math.exp(-(((Z + 3.5) / 6.5) ** 2)) * smooth(0.6, 3, d0);
    dry += 0.5 * scar * (0.75 + 0.5 * valueNoise(X * 0.4, Z * 0.4));
    // The foot of the bank along the cap, where people step up off the path.
    dry += 0.45 * Math.exp(-dc / 0.9) * smooth(-30, -6, Z);
    // Trodden beside the stair cheek: the way up from the landing.
    dry += 0.5 * smooth(2.4, 4.1, Z);
    // The side filmers' patch on the bank beside the hallway and the line they walk to it.
    const r2 = (X - 16) ** 2 + (Z + 15.5) ** 2;
    dry += 0.6 * Math.exp(-r2 / 7);
    dry += 0.4 * Math.exp(-((toSegment(X, Z, [16, -15.5], [9.5, -8.5]) / 1.1) ** 2));
    dry = clamp01(dry);
    const bare = clamp01((dry - 0.74) * 2.6 + 0.5 * (valueNoise(X * 0.55 + 9, Z * 0.55) - 0.5));
    return { dry, bare };
  }
  let dry = 0.1 + 0.24 * (fbm(X * 0.07 + 11, Z * 0.07) - 0.5) + 0.3 * smooth(0.68, 0.86, valueNoise(X * 0.13 + 4, Z * 0.13 + 2));
  // Corners cut and edges scuffed where the lawn meets the paths.
  let near = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (carlsbadPaved(x + dx * 1.1 * F, z + dz * 1.1 * F)) near++;
  dry += 0.18 * Math.min(1, near);
  dry = clamp01(dry);
  return { dry, bare: clamp01((dry - 0.55) * 1.6) };
}

/** Turf paint for a plan point: worn browner where `turfWear` says, for the look's grass. */
export function turfColor(x: number, z: number): string {
  const { dry, bare } = turfWear(x, z);
  return toHex(mix(mix(hex(TURF.lush), hex(TURF.straw), dry), hex(TURF.dirt), bare));
}

export type PavingPart = 'paved' | 'cap' | 'cheek';

/**
 * Concrete paint for a ground vertex (set units) on a face with normal `n`: the pad paler and newer, the
 * lower path darker and older (refs/03, 155), dirt washed off the bank along the wall and curb foot and
 * tracked onto the pad at the crest, the toe wall's face grimier toward its cap, the cap worn pale.
 */
export function pavingColor(p: Vec3, n: Vec3, part: PavingPart): string {
  const [x, y, z] = p;
  const X = x / F, Y = y / F, Z = z / F;
  const tone = 1 + 0.07 * (fbm(X * 0.09 + 21, Z * 0.09) - 0.5) + 0.03 * (valueNoise(X * 0.5, Z * 0.5) - 0.5);
  const vertical = Math.abs(n[1]) < 0.5;
  if (part === 'cheek') return toHex(scale(hex(PAVING.stair), tone * 0.98));
  if (Z >= 5 && Z <= 16 && X > 0 && X < 11.05) return toHex(scale(hex(PAVING.stair), tone));
  if (part === 'cap') {
    if (!vertical) return toHex(scale(hex(PAVING.cap), tone));
    // The toe wall's face: grime under the cap, washing out toward the path.
    const floor = carlsbadLanding(x), top = Z >= -5 ? carlsbadToeTop(z) : y;
    const up = clamp01((y - floor) / Math.max(0.3 * F, top - floor));
    return toHex(scale(mix(hex(PAVING.face), hex(PAVING.grime), 0.75 * up ** 1.5), tone));
  }
  if (Y > -0.5 && X <= carlsbadUpperEdge(z) / F + 0.01) {
    // The pad: dirt tracked off the bank along the crest, scuffed where riders wait by the lip.
    const crest = Z < 4.4 ? Math.exp(-Math.max(0, carlsbadUpperEdge(z) / F - X) / 0.8) : 0;
    const wait = Math.exp(-(((X + 4) / 4) ** 2) - ((Z / 5) ** 2));
    return toHex(scale(mix(hex(PAVING.pad), hex(PAVING.dirt), 0.55 * crest), tone * (1 - 0.04 * wait)));
  }
  // The lower path: older; dirt gathers against the toe wall and curb and at its grass edge.
  const foot = Math.max(0, X - carlsbadBankEnd(z) / F);
  let c = mix(hex(PAVING.path), hex(PAVING.dirt), 0.5 * Math.exp(-foot / 1.3));
  // Polished and darkened where the boards land and roll away.
  c = scale(c, 1 - 0.05 * Math.exp(-(((X - 18) / 6) ** 2) - ((Z + 1) / 4.5) ** 2));
  return toHex(scale(c, tone));
}
