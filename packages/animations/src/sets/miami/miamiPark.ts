import type { Vec3 } from '../../camera/view';
import type { Bake } from '../../three/bake';
import { hash2 } from '../setKit';
import { CONCRETE, F, METAL, SOIL, UP, block, mixHex, poly, tag, tube, type Plan, type RailShadow, type ShadowBox } from './miamiKit';
import { MIAMI_PLAZA_Y, MIAMI_TERRACE_BACK, MIAMI_WALL_X } from './miamiLayout';
import { MIAMI_PAINT as PAINT } from './miamiPalette';
import { shrubMound } from './miamiTrees';
import { plazaReach } from './miamiWear';

/**
 * Triangle Bank's park furniture: tall aluminium park lights, slatted benches on cast feet, litter bins, round
 * concrete pots, and the low seat walls on the deck. Generic municipal pieces, placed off the line, the landings
 * and the filmers' views (miami.test.ts raycasts every tripod's view through them).
 */

const PLAZA = MIAMI_PLAZA_Y;
const WOOD = tag('siding');

/**
 * A park light: a footing, a tapered round pole and a slim head on a short arm, `yaw` the way the arm reaches.
 * Its pole casts a shadow (`shadows`).
 */
export function parkLight(b: Bake, x: number, z: number, y: number, yaw: number, shadows: RailShadow[] | null, height = 15 * F) {
  const dx = Math.cos(yaw), dz = Math.sin(yaw);
  block(b, x - 0.6 * F, x + 0.6 * F, y, y + 0.5 * F, z - 0.6 * F, z + 0.6 * F, PAINT.coping, PAINT.coping, CONCRETE, 'tfkle');
  const foot: Vec3 = [x, y + 0.5 * F, z], top: Vec3 = [x, y + height, z];
  b.tube([foot, top], [0.22 * F, 0.13 * F], { color: PAINT.pole }, METAL, 10, true);
  const reach = 2.2 * F;
  const end: Vec3 = [x + dx * reach, y + height - 0.2 * F, z + dz * reach];
  b.tube([[x, y + height - 0.4 * F, z], end], [0.07 * F, 0.07 * F], { color: PAINT.pole }, METAL, 6, false);
  // The head: a flat box with its lens underneath.
  const hx = end[0], hz = end[2], hy = end[1];
  const half = 0.55 * F, w = 0.32 * F;
  const corner = (s: number, t: number, h: number): Vec3 => [hx + dx * s - dz * t, h, hz + dz * s + dx * t];
  const top0 = hy + 0.25 * F, bot = hy - 0.05 * F;
  poly(b, [corner(-half, -w, top0), corner(half, -w, top0), corner(half, w, top0), corner(-half, w, top0)], UP, PAINT.lampHead, METAL);
  poly(b, [corner(-half, -w, bot), corner(half, -w, bot), corner(half, w, bot), corner(-half, w, bot)], [0, -1, 0], PAINT.lampLens, METAL);
  for (const [s0, t0, s1, t1] of [[-half, -w, half, -w], [half, -w, half, w], [half, w, -half, w], [-half, w, -half, -w]] as const) {
    const n: Vec3 = [dx * (s0 + s1) / 2 - dz * (t0 + t1) / 2, 0, dz * (s0 + s1) / 2 + dx * (t0 + t1) / 2];
    poly(b, [corner(s0, t0, bot), corner(s1, t1, bot), corner(s1, t1, top0), corner(s0, t0, top0)], n, PAINT.lampHead, METAL);
  }
  if (shadows) shadows.push({ a: foot, b: top, radius: 0.18 * F });
}

/**
 * A park bench `length` long, centred at `at` and facing `facing` (radians in plan): three timber seat slats and
 * two back slats on a pair of cast concrete feet.
 */
export function bench(b: Bake, at: Vec3, facing: number, length = 6 * F) {
  const fx = Math.cos(facing), fz = Math.sin(facing);
  // `s` along the bench, `d` toward the way it faces.
  const p = (s: number, d: number, y: number): Vec3 => [at[0] - fz * s + fx * d, at[1] + y, at[2] + fx * s + fz * d];
  const slab = (s0: number, s1: number, d0: number, d1: number, y0: number, y1: number, side: string, top: string, ink = WOOD) => {
    const c = [p(s0, d0, 0), p(s1, d0, 0), p(s1, d1, 0), p(s0, d1, 0)];
    const lo = (k: number): Vec3 => [c[k][0], at[1] + y0, c[k][2]], hi = (k: number): Vec3 => [c[k][0], at[1] + y1, c[k][2]];
    poly(b, [hi(0), hi(1), hi(2), hi(3)], UP, top, ink);
    for (let k = 0; k < 4; k++) {
      const j = (k + 1) % 4;
      const mid: Vec3 = [(c[k][0] + c[j][0]) / 2 - at[0], 0, (c[k][2] + c[j][2]) / 2 - at[2]];
      const centre: Vec3 = [p((s0 + s1) / 2, (d0 + d1) / 2, 0)[0] - at[0], 0, p((s0 + s1) / 2, (d0 + d1) / 2, 0)[2] - at[2]];
      const n: Vec3 = [mid[0] - centre[0], 0, mid[2] - centre[2]];
      poly(b, [lo(k), lo(j), hi(j), hi(k)], n, side, ink);
    }
  };
  for (const s of [-length / 2 + 0.6 * F, length / 2 - 0.6 * F]) {
    slab(s - 0.25 * F, s + 0.25 * F, -0.9 * F, 0.8 * F, 0, 1.45 * F, mixHex(PAINT.coping, PAINT.wallGrime, 0.15), PAINT.coping, CONCRETE);
    slab(s - 0.2 * F, s + 0.2 * F, -1.05 * F, -0.7 * F, 1.45 * F, 2.9 * F, mixHex(PAINT.coping, PAINT.wallGrime, 0.15), PAINT.coping, CONCRETE);
  }
  for (let k = 0; k < 3; k++) {
    const d0 = (-0.75 + k * 0.52) * F;
    const tone = mixHex(PAINT.benchSlat, '#9d9184', 0.25 + 0.2 * hash2(Math.round(at[0]), k, 901));
    slab(-length / 2, length / 2, d0, d0 + 0.44 * F, 1.45 * F, 1.6 * F, mixHex(tone, '#3f3326', 0.25), tone);
  }
  for (let k = 0; k < 2; k++) {
    const y0 = (1.95 + k * 0.45) * F;
    const tone = mixHex(PAINT.benchSlat, '#9d9184', 0.3 + 0.2 * hash2(Math.round(at[2]), k, 902));
    slab(-length / 2, length / 2, -1.1 * F, -0.98 * F, y0, y0 + 0.35 * F, tone, tone);
  }
}

/** A litter bin: a dark slatted drum with a domed lid. */
export function bin(b: Bake, x: number, z: number, y: number) {
  b.tube([[x, y, z], [x, y + 2.9 * F, z]], [0.95 * F, 1 * F], { color: PAINT.bin }, METAL, 12, false);
  b.tube([[x, y + 2.9 * F, z], [x, y + 3.15 * F, z], [x, y + 3.35 * F, z]], [1.06 * F, 0.95 * F, 0.3 * F], { color: mixHex(PAINT.bin, '#6c746f', 0.3) }, METAL, 12, true);
}

/** A round planter pot, about 2½ ft across, with a clipped shrub (or flowers) in it: grimy at its foot, its lip worn pale. */
export function pot(b: Bake, x: number, z: number, flowers: string | null, seed: number) {
  const r = 1.25 * F, h = 2 * F, around = 16;
  const ring = (radius: number, y: number) => Array.from({ length: around }, (_, k) => {
    const a = (k / around) * Math.PI * 2;
    return [x + Math.cos(a) * radius, y, z + Math.sin(a) * radius] as Vec3;
  });
  const rows = [0, 0.25, 1];
  const rings = rows.map((t) => ring(r * (0.86 + 0.14 * t), PLAZA + h * t));
  const tone = (t: number) => mixHex(PAINT.potConcrete, PAINT.wallGrime, Math.max(0, 0.3 - t) * 2);
  for (let i = 0; i + 1 < rows.length; i++) for (let k = 0; k < around; k++) {
    const a = ((k + 0.5) / around) * Math.PI * 2;
    const n: Vec3 = [Math.cos(a), 0.12, Math.sin(a)];
    const [lo, hi] = [rings[i], rings[i + 1]];
    b.quadCorners(lo[k], lo[(k + 1) % around], hi[(k + 1) % around], hi[k], n,
      [{ color: tone(rows[i]) }, { color: tone(rows[i]) }, { color: tone(rows[i + 1]) }, { color: tone(rows[i + 1]) }], CONCRETE);
  }
  poly(b, rings[2], UP, PAINT.potSoil, SOIL);
  shrubMound(b, [x, PLAZA + h - 2, z], 1.6 * F, seed + 70, flowers);
}

/** Where the plaza's pots stand: along the wall, clear of the line. */
export const MIAMI_POTS: Plan[] = [-46, -32, -18, 18, 32, 46].map((z) => [MIAMI_WALL_X + 2.2 * F, z * F]);

/**
 * The park's furniture round the plaza and the deck: pots along the wall, lights at the plaza's corners and along
 * the walks behind the lawns, benches and bins in front of the stepped planters, and the seat walls on the deck.
 */
export function buildPark(props: Bake, rails: RailShadow[], boxes: ShadowBox[]) {
  MIAMI_POTS.forEach(([x, z], k) => pot(props, x, z, k % 3 === 1 ? PAINT.bloomRed : k % 3 === 2 ? PAINT.bloomPink : null, Math.round(z)));
  // Lights on the plaza, by the wall's ends and out at its stepped sides.
  for (const side of [-1, 1]) {
    parkLight(props, MIAMI_WALL_X + 4 * F, side * 52 * F, PLAZA, side > 0 ? -Math.PI / 2 : Math.PI / 2, rails);
    const x = MIAMI_WALL_X + 31 * F;
    parkLight(props, x, side * (plazaReach(x) - 2.5 * F), PLAZA, side > 0 ? -Math.PI / 2 : Math.PI / 2, rails);
  }
  // Along the walks behind the lawns and down their sides.
  for (const z of [-34, 34]) parkLight(props, MIAMI_TERRACE_BACK - 8 * F, z * F, PLAZA, 0, null);
  for (const side of [-1, 1]) for (const x of [-18, -52]) parkLight(props, x * F, side * 72 * F, PLAZA, -side * Math.PI / 2, null);
  // Benches facing in from the stepped planters, a bin beside each pair.
  for (const side of [-1, 1]) {
    for (const k of [1, 2, 3]) {
      const x0 = MIAMI_WALL_X + k * 10 * F;
      const z = side * (plazaReach(x0) - 2 * F);
      const at: Vec3 = [x0 + 5 * F, PLAZA, z];
      bench(props, at, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      if (k === 2) boxes.push({ min: [at[0] - 3 * F, PLAZA, Math.min(z, z - side * 1.2 * F)], max: [at[0] + 3 * F, PLAZA + 1.6 * F, Math.max(z, z - side * 1.2 * F)] });
    }
    bin(props, MIAMI_WALL_X + 21.5 * F, side * (plazaReach(MIAMI_WALL_X + 20 * F) - 1.6 * F), PLAZA);
  }
  // On the deck, two low seat walls with planting, well back from the takeoff and the bank.
  for (const side of [-1, 1]) {
    const z = side * 14 * F;
    block(props, -64 * F, -50 * F, 0.3, 1.8 * F, z - 2 * F, z + 2 * F, PAINT.wall, PAINT.coping, CONCRETE);
    block(props, -63.6 * F, -50.4 * F, 1.8 * F - 1, 1.8 * F + 0.6, z - 1.6 * F, z + 1.6 * F, PAINT.potSoil, PAINT.mulch, SOIL, 't');
    for (const x of [-61 * F, -57 * F, -53 * F]) shrubMound(props, [x, 1.8 * F, z], 1.5 * F, side + x, null, 0.65);
  }
  // Bollard lights along the lawns' front walk ends, low and quiet.
  for (const side of [-1, 1]) for (const x of [-8, -28]) {
    const z = side * 61 * F, y = PLAZA;
    tube(props, [[x * F, y, z], [x * F, y + 2.8 * F, z]], 0.3 * F, PAINT.lampHead, METAL, 10);
  }
}
