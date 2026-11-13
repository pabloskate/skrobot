import type { Vec3 } from '../../camera/view';
import type { Bake, Ink } from '../../three/bake';
import { hash2 } from '../setKit';
import { CONCRETE, F, UP, mixHex, tag, valueNoise, type Plan } from './miamiKit';
import {
  MIAMI_GAP_LAND_X, MIAMI_PLAZA_HALF, MIAMI_PLAZA_Y, MIAMI_RIM_CURVE, MIAMI_RIM_HEIGHT, MIAMI_RIM_WIDTH,
  MIAMI_SLAB_APEX_X, MIAMI_SLAB_GRADE, MIAMI_SLAB_LIP_X, MIAMI_SLAB_SIDE, MIAMI_TERRACE_BACK, MIAMI_WALL_X,
  miamiSlabHalf, miamiSlabTop, miamiTerraceHalf, miamiTerraceInset,
} from './miamiLayout';
import { MIAMI_PAINT as PAINT } from './miamiPalette';

/**
 * Triangle Bank's weathering. Wear on level ground goes on the decals (the ground's material, a hair proud of
 * it): irrigation rust fanned out from the planters, water and oil stains, landing scuffs on the pavers, the deck's
 * saw-cut joints, worn lane and cracks, wax and peeled paint on the rim, wax down the bank's edges. Wear on the
 * upright faces (paint, peeling, mildew at the foot) is baked into their own vertex colours (wallTone, bankSideTone),
 * since decals layered on a wall fight at a distance. Read by eye from the clips in
 * docs/MIAMI_TRIANGLE_REFERENCE.md: peeling white paint on the box (Carpenter), grimy wall feet and stained clay
 * paving (Muska, Edge, Appleyard), the waxed concrete edges every grind leaves.
 */

const PLAZA = MIAMI_PLAZA_Y;
const H = MIAMI_PLAZA_HALF;
const PAVERS = tag('pavers');
/** Layers of decal, so overlapping marks never fight. */
export const LIFT = [0.3, 0.6, 0.9] as const;
/** The deck's flat field, and the rim's flat top, by how far in from the deck's edge a point is. */
const RIM_TOP = MIAMI_RIM_WIDTH - MIAMI_RIM_CURVE;

/** Half the plaza's width `x` down the line (it narrows to its far corner). */
export const plazaReach = (x: number) => H - (x - MIAMI_WALL_X);
/** Whether a plan point is on the plaza's paving, `margin` in from its edges. */
export const onPlaza = (x: number, z: number, margin = 0) => x >= MIAMI_WALL_X + margin && Math.abs(z) <= plazaReach(x) - margin;

/* ----- Tones baked into faces ----- */

/**
 * The paving's mean colour at a plan point, baked into the plaza's vertices: faded clay, paler where the sun has
 * bleached it for decades, darker and browner where the planters' irrigation keeps it damp along the wall and
 * the stepped sides, with drifts of tone a few yards across.
 */
export function paverTone(x: number, z: number): string {
  const X = x / F, Z = z / F;
  const drift = valueNoise(X / 14 + 3.1, Z / 14 + 1.7);
  const fine = valueNoise(X / 4.5 + 9.3, Z / 4.5 + 4.1);
  let c = mixHex(PAINT.paver, drift > 0.5 ? PAINT.paverPale : PAINT.paverWarm, Math.abs(drift - 0.5) * 1.2);
  c = mixHex(c, PAINT.paverDark, Math.max(0, fine - 0.6) * 0.9);
  // Damp along the planters: the wall at the plaza's back and the stepped sides.
  const fromWall = (x - MIAMI_WALL_X) / F, fromSide = (plazaReach(x) - Math.abs(z)) / F;
  const damp = Math.max(0, 1 - fromWall / 5) ** 1.5 * 0.55 + Math.max(0, 1 - fromSide / 6) ** 1.5 * 0.45;
  return mixHex(c, PAINT.waterStain, Math.min(0.6, damp));
}

/**
 * White paint on a board-formed concrete wall at `s` along it, `h` above its foot (the ground it stands in),
 * `height` its visible height: generations of paint, in broad patches of fresher white where it's been painted
 * over; peeled back to the grey concrete in flakes, more toward `peelAt` (0-1, how hard boards hit it there) and
 * toward its top edge; and the dark mildew band the sprinklers keep wet along its foot, its reach wandering.
 */
export function wallTone(seed: number, s: number, h: number, height: number, peelAt = 0.15): string {
  const S = s / F, t = Math.max(0, Math.min(1, h / Math.max(1, height)));
  const fresh = valueNoise(S / 6 + seed * 3.7, seed * 1.3);
  let c = mixHex(PAINT.wall, PAINT.wallFresh, Math.max(0, Math.min(1, (fresh - 0.55) / 0.08)) * 0.6);
  // Peeling where boards hit: near `peelAt`'s end and up toward the top edge, in flakes rather than patches.
  const flakes = valueNoise(S / 0.9 + seed * 5.1, (h / F) / 0.6 + seed);
  const peel = Math.max(0, Math.min(1, (flakes - (0.9 - 0.3 * peelAt * t)) / 0.06)) * Math.max(0.2, t);
  c = mixHex(c, PAINT.wallPeeled, 0.7 * peel);
  // Mildew and splash-back at the foot.
  const reach = (0.6 + 0.7 * valueNoise(S / 3 + seed * 2.3, seed * 4.1)) * F;
  const mildew = Math.max(0, 1 - h / reach) ** 1.6;
  c = mixHex(c, PAINT.wallGrime, 0.55 * mildew);
  // A faint rust tint where the irrigation reaches highest.
  return mixHex(c, PAINT.wallRust, 0.18 * mildew * valueNoise(S / 2 + 7, seed));
}

/**
 * The bank's plumb sides at `s` along an edge, `t` up the side (0 underside, 1 the top arris): cast concrete,
 * waxed dark along the arris where every grind has run, the arris chipped pale here and there, grime low down.
 */
export function bankSideTone(seed: number, s: number, t: number, waxed: boolean): string {
  const S = s / F;
  let c = mixHex(PAINT.bankSide, PAINT.bankUnder, Math.max(0, 0.45 - t) * 0.9);
  if (waxed) c = mixHex(c, PAINT.bankWax, Math.max(0, (t - 0.6) / 0.4) ** 1.5 * (0.55 + 0.35 * valueNoise(S * 1.5 + seed, 3)));
  const chip = valueNoise(S * 2.3 + seed * 7, 11) > 0.8 && t > 0.75 ? 0.6 : 0;
  return mixHex(c, PAINT.bankChip, chip);
}

/**
 * The bank's face at a plan point: cast concrete, polished paler down the middle where wheels roll, dirt washed
 * toward the low edge, waxed dark along the two upper edges.
 */
export function bankTone(x: number, z: number): string {
  const along = (x - MIAMI_SLAB_APEX_X) / (MIAMI_SLAB_LIP_X - MIAMI_SLAB_APEX_X);
  const edge = Math.max(0, miamiSlabHalf(x) - Math.abs(z)) * Math.cos(Math.PI / 6);
  let c = mixHex(PAINT.bank, PAINT.deckWorn, Math.max(0, 1 - Math.abs(z) / (1.6 * F)) * 0.35);
  c = mixHex(c, PAINT.deckStain, Math.max(0, along - 0.6) * 0.8);
  c = mixHex(c, PAINT.bankWax, Math.max(0, 1 - edge / (0.8 * F)) ** 1.4 * 0.35);
  return mixHex(c, PAINT.bankUnder, 0.12 * valueNoise(x / (3 * F) + 2, z / (3 * F)));
}

/* ----- Decals ----- */

/** A level quad over a rectangle, a colour at each corner, on the ground `y`. */
function patch(b: Bake, x0: number, x1: number, z0: number, z1: number, y: number, colors: string | [string, string, string, string], ink: Ink) {
  const [c00, c10, c11, c01] = typeof colors === 'string' ? [colors, colors, colors, colors] : colors;
  b.quadCorners([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], UP, [{ color: c01 }, { color: c11 }, { color: c10 }, { color: c00 }], ink);
}

/** A blot: an irregular round stain `r` across on level ground at `y`, `center` fading to `rim`. */
function blot(b: Bake, x: number, z: number, y: number, r: number, center: string, rim: string, seed: number, ink: Ink, squash = 1) {
  const around = 12;
  const at = (j: number): Vec3 => {
    const a = (j / around) * Math.PI * 2, rr = r * (0.65 + 0.5 * hash2(seed, j % around, 60));
    return [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr * squash];
  };
  for (let k = 0; k < around; k++) {
    b.vertex([x, y, z], UP, { color: center }, ink);
    b.vertex(at(k + 1), UP, { color: rim }, ink);
    b.vertex(at(k), UP, { color: rim }, ink);
  }
}

/**
 * A fan of irrigation rust spreading from `at` on a wall's foot into the paving, `out` the way it spreads: the
 * orange-brown stain sprinklers on iron-rich well water leave on every Miami walk, darkest at the wall.
 */
function rustFan(b: Bake, at: Plan, out: Plan, radius: number, seed: number, y: number) {
  const steps = 9, base = Math.atan2(out[1], out[0]);
  // Each point of its edge pulled in until it lies on the paving, so none runs under a wall.
  const rim = (k: number): Plan => {
    const a = base + ((k / steps) - 0.5) * Math.PI * 0.95;
    let r = radius * (0.55 + 0.6 * hash2(seed, k, 71));
    for (let i = 0; i < 12 && !onPlaza(at[0] + Math.cos(a) * r, at[1] + Math.sin(a) * r, 0.05 * F); i++) r *= 0.75;
    return [at[0] + Math.cos(a) * r, at[1] + Math.sin(a) * r];
  };
  const center = mixHex(paverTone(at[0], at[1]), PAINT.rust, 0.55 + 0.25 * hash2(seed, 0, 72));
  for (let k = 0; k < steps; k++) {
    const [p, q] = [rim(k), rim(k + 1)];
    b.vertex([at[0], y, at[1]], UP, { color: center }, PAVERS);
    b.vertex([q[0], y, q[1]], UP, { color: paverTone(q[0], q[1]) }, PAVERS);
    b.vertex([p[0], y, p[1]], UP, { color: paverTone(p[0], p[1]) }, PAVERS);
  }
}

/** A crooked crack or saw cut: a dark thread across level ground at `y`, from `a` to `c`. */
function crack(b: Bake, a: Plan, c: Plan, y: number, seed: number, color: string, width = 0.6, wander = 0.3 * F, ink: Ink = CONCRETE) {
  const parts = 8, length = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const across: Plan = [-(c[1] - a[1]) / length, (c[0] - a[0]) / length];
  const at = (k: number): Plan => {
    const w = k === 0 || k === parts ? 0 : wander * (hash2(seed, k, 50) - 0.5);
    return [a[0] + ((c[0] - a[0]) * k) / parts + across[0] * w, a[1] + ((c[1] - a[1]) * k) / parts + across[1] * w];
  };
  for (let k = 0; k < parts; k++) {
    const [p, q] = [at(k), at(k + 1)];
    const v = (r: Plan, s: number): Vec3 => [r[0] + across[0] * s * width, y, r[1] + across[1] * s * width];
    b.quad(v(p, -1), v(p, 1), v(q, 1), v(q, -1), UP, { color }, ink);
  }
}

/**
 * The plaza: rust fanned from the wall's foot and round the pots and stepped planters, water stains under the
 * palms, oil and grime, and grey scuffs where boards land and slide out down the line.
 */
function plaza(b: Bake, pots: Plan[]) {
  // Rust from the wall's sprinklers, off the line.
  for (let k = 0; k < 14; k++) {
    const z = (-54 + k * 8 + 4 * hash2(k, 1, 73)) * F;
    if (Math.abs(z) < 7 * F) continue;
    rustFan(b, [MIAMI_WALL_X + 0.1 * F, z], [1, 0], (1.6 + 2.2 * hash2(k, 2, 73)) * F, k, PLAZA + LIFT[0]);
  }
  // Round the pots, where they're watered.
  pots.forEach(([x, z], k) => blot(b, x + 0.4 * F, z, PLAZA + LIFT[0], 2.1 * F, mixHex(paverTone(x, z), PAINT.rust, 0.35), paverTone(x + 2 * F, z), k + 20, PAVERS));
  // From the stepped planters' inner corners, where their sprinklers overspray onto the plaza.
  for (const side of [-1, 1]) for (let k = 0; k < 5; k++) {
    const x = MIAMI_WALL_X + k * 10 * F + 0.15 * F;
    const z = side * (plazaReach(x) - 0.15 * F);
    rustFan(b, [x, z], [0.5, -side * 0.86], (1.5 + 1.5 * hash2(k, side, 74)) * F, 40 + k + (side > 0 ? 10 : 0), PLAZA + LIFT[0]);
  }
  // Water stains and grime blotches, scattered off the line.
  for (let k = 0; k < 18; k++) {
    const x = MIAMI_WALL_X + (4 + 50 * hash2(k, 1, 75)) * F, z = (hash2(k, 2, 75) - 0.5) * 2 * plazaReach(x) * 0.85;
    if (Math.abs(z) < 4 * F && x < MIAMI_GAP_LAND_X + 14 * F) continue;
    if (!onPlaza(x, z, 3 * F)) continue;
    const r = (1 + 2.5 * hash2(k, 3, 75)) * F;
    blot(b, x, z, PLAZA + LIFT[1], r, mixHex(paverTone(x, z), PAINT.waterStain, 0.5), paverTone(x + r, z), k + 60, PAVERS, 0.7 + 0.5 * hash2(k, 4, 75));
  }
  for (let k = 0; k < 7; k++) {
    const x = MIAMI_WALL_X + (8 + 40 * hash2(k, 5, 76)) * F, z = (hash2(k, 6, 76) - 0.5) * 2 * plazaReach(x) * 0.7;
    if (!onPlaza(x, z, 3 * F)) continue;
    blot(b, x, z, PLAZA + LIFT[2], (0.25 + 0.4 * hash2(k, 7, 76)) * F, PAINT.oil, mixHex(PAINT.oil, paverTone(x, z), 0.75), k + 90, PAVERS);
  }
  // Landing scuffs: short grey strokes fanning out where the bank line rolls off and the over line lands.
  for (let k = 0; k < 16; k++) {
    const x = MIAMI_SLAB_LIP_X + (1.5 + 18 * hash2(k, 1, 77)) * F, z = (hash2(k, 2, 77) - 0.5) * 6 * F;
    const length = (1.2 + 3 * hash2(k, 3, 77)) * F, a = (hash2(k, 4, 77) - 0.5) * 0.5, w = 0.06 * F;
    const dx = Math.cos(a) * length, dz = Math.sin(a) * length;
    const y = PLAZA + LIFT[1];
    b.quad([x, y, z - w], [x, y, z + w], [x + dx, y, z + dz + w], [x + dx, y, z + dz - w], UP, { color: mixHex(paverTone(x, z), PAINT.scuff, 0.55) }, PAVERS);
  }
}

/**
 * The deck: saw-cut control joints in bays, the lane worn pale toward the tip where everyone rolls in, cracks
 * and a few stains, wax and peeled paint on the rim near the tip.
 */
function deck(b: Bake) {
  const y = LIFT[0];
  const flat = (x: number, z: number, margin = 0.3 * F) => miamiTerraceInset(x, z) > MIAMI_RIM_WIDTH + margin;
  // Saw cuts every ten feet across, and down the middle, clipped to the deck's field.
  for (let x = -10 * F; x > MIAMI_TERRACE_BACK + 2 * F; x -= 10 * F) {
    const half = miamiTerraceHalf(x) - MIAMI_RIM_WIDTH - 0.4 * F;
    if (half > 1 * F) crack(b, [x, -half], [x, half], LIFT[1], Math.round(x), mixHex(PAINT.deck, '#6c6a63', 0.6), 0.5, 0.02 * F);
  }
  const back = MIAMI_TERRACE_BACK + MIAMI_RIM_WIDTH + 0.4 * F;
  crack(b, [-11 * F, 0], [back, 0], LIFT[1], 7, mixHex(PAINT.deck, '#6c6a63', 0.6), 0.5, 0.02 * F);
  // The lane worn pale where riders roll in to the tip.
  for (let k = 0; k < 7; k++) {
    const x0 = -(4 + k * 5) * F, x1 = x0 - 5 * F, w = 2.6 * F;
    const tone = (z: number) => mixHex(PAINT.deck, PAINT.deckWorn, Math.max(0, 1 - Math.abs(z) / w) * (1 - k / 8));
    for (const [za, zc] of [[-w, 0], [0, w]] as const) {
      if (!flat(x1, za) || !flat(x1, zc) || !flat(x0, za) || !flat(x0, zc)) continue;
      patch(b, x1, x0, za, zc, y, [tone(za), tone(za), tone(zc), tone(zc)], CONCRETE);
    }
  }
  // Cracks and stains, off the lane.
  for (let k = 0; k < 9; k++) {
    const x = -(14 + 55 * hash2(k, 1, 78)) * F, z = (hash2(k, 2, 78) - 0.5) * 2 * (miamiTerraceHalf(x) - 3 * F);
    const length = (2 + 4 * hash2(k, 3, 78)) * F, a = hash2(k, 4, 78) * Math.PI;
    const c: Plan = [x + Math.cos(a) * length, z + Math.sin(a) * length];
    if (!flat(x, z, 1 * F) || !flat(c[0], c[1], 1 * F)) continue;
    crack(b, [x, z], c, LIFT[2], k + 120, mixHex(PAINT.deck, '#5f5d57', 0.7), 0.45);
  }
  for (let k = 0; k < 8; k++) {
    const x = -(10 + 60 * hash2(k, 5, 79)) * F, z = (hash2(k, 6, 79) - 0.5) * 2 * (miamiTerraceHalf(x) - 4 * F);
    const r = (1.2 + 2 * hash2(k, 7, 79)) * F;
    if (!flat(x, z, r + 0.5 * F)) continue;
    blot(b, x, z, LIFT[1], r, mixHex(PAINT.deck, PAINT.deckStain, 0.8), PAINT.deck, k + 130, CONCRETE, 0.8);
  }
  // On the rim's flat top near the tip: wax where tricks have scraped it, grey where the paint has gone.
  for (const side of [-1, 1]) {
    // `s` back along the edge from the tip, `inset` in from it.
    const g = (s: number, inset: number): Vec3 => [-s * Math.cos(Math.PI / 6) - inset * 0.5, MIAMI_RIM_HEIGHT + LIFT[0], side * (s * 0.5 - inset * Math.cos(Math.PI / 6))];
    for (let k = 0; k < 12; k++) {
      const s = (0.4 + k * 1.3 + hash2(k, side, 411) * 0.6) * F;
      const len = (0.5 + hash2(k, side, 412) * 1.1) * F;
      const wax = k < 7;
      const color = wax ? mixHex(PAINT.rim, PAINT.wax, 0.35 + 0.3 * hash2(k, side, 414)) : PAINT.rimPeeled;
      const i0 = 0.05 * F, i1 = (0.12 + hash2(k, side, 413) * 0.2) * F;
      const pts = [g(s, i0), g(s + len, i0), g(s + len, Math.min(RIM_TOP - 0.03 * F, i1)), g(s, Math.min(RIM_TOP - 0.03 * F, i1 * 0.8))];
      b.quad(pts[0], pts[1], pts[2], pts[3], UP, { color }, CONCRETE);
    }
  }
}

/**
 * The bank's face (sloped, so its marks lie along its normal): wax down the two upper edges where grinds run.
 */
function bank(b: Bake) {
  const n: Vec3 = [MIAMI_SLAB_GRADE, 1, 0];
  const m = Math.hypot(...n);
  const N: Vec3 = [n[0] / m, n[1] / m, 0];
  const on = (x: number, z: number, lift: number): Vec3 => [x + N[0] * lift, miamiSlabTop(x) + N[1] * lift, z];
  for (const side of [-1, 1]) {
    // Down the edge, a ragged band 3 to 6 inches wide, inside the arris.
    const steps = 10;
    for (let k = 0; k < steps; k++) {
      const s0 = (k / steps) * MIAMI_SLAB_SIDE * 0.96 + 0.15 * F, s1 = ((k + 1) / steps) * MIAMI_SLAB_SIDE * 0.96 + 0.15 * F;
      const at = (s: number, inset: number): Vec3 => {
        const x = MIAMI_SLAB_APEX_X + s * Math.cos(Math.PI / 6) + inset * 0.5;
        const z = side * (s * Math.sin(Math.PI / 6) - inset * Math.cos(Math.PI / 6));
        return on(x, z, LIFT[0]);
      };
      const w0 = (0.28 + 0.1 * hash2(k, side, 81)) * F, w1 = (0.28 + 0.1 * hash2(k + 1, side, 81)) * F;
      const dark = mixHex(bankTone(at(s0, 0.1)[0], at(s0, 0.1)[2]), PAINT.bankWax, 0.3 + 0.12 * hash2(k, side, 83));
      const rim0 = bankTone(at(s0, w0)[0], at(s0, w0)[2]), rim1 = bankTone(at(s1, w1)[0], at(s1, w1)[2]);
      b.quadCorners(at(s0, 0.04 * F), at(s1, 0.04 * F), at(s1, w1), at(s0, w0), N, [{ color: dark }, { color: dark }, { color: rim1 }, { color: rim0 }], CONCRETE);
    }
  }
}

/** Every decal on the ground. `pots` are the plaza's pot centres, which their watering stains ring. */
export function buildMiamiWear(decals: Bake, pots: Plan[]) {
  plaza(decals, pots);
  deck(decals);
  bank(decals);
}
