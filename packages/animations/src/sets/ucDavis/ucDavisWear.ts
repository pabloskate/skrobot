import type { Vec3 } from '../../camera/view';
import type { Bake } from '../../three/bake';
import { hash2 } from '../setKit';
import { F, UP, mixHex, tag, valueNoise } from './ucDavisKit';
import {
  UC_DAVIS_BANK_Z1, UC_DAVIS_BUILDING_BACK_X, UC_DAVIS_BUILDING_FRONT_X, UC_DAVIS_BUILDING_Z0, UC_DAVIS_DROP,
  UC_DAVIS_HALL_HALF_WIDTH, UC_DAVIS_RUN, UC_DAVIS_WRAP_Z, ucDavisBankEnd, ucDavisSurface,
} from './ucDavisLayout';
import { UC_DAVIS_PAINT as PAINT } from './ucDavisPalette';

/**
 * The UC Davis gap's wear. Level marks go on the decals (the ground's material, a hair proud of it): the
 * terrace's slab joints and the pale polished lane across it to the lip, tail scuffs on the coping, the
 * sidewalk's joints below, landing scuffs and dry leaves drifted against the curb, patches, cracks and oil on
 * the service drive. Upright faces carry theirs in their own vertex colours (the panels' fresh paint over old
 * tags, grime at the feet of the walls, the planter's formwork boards and algae), since decals layered on a wall
 * fight at a distance. Read from the Camarillo photograph, Luc's two photographs and the Dern Brothers' episode.
 */

const CONCRETE = tag('concrete');
const ASPHALT = tag('asphalt');
/** Layers of decal, so overlapping marks never fight. */
const LIFT = [0.3, 0.6, 0.9] as const;
/** The lower ground: the sidewalk, plaza and drive the gap lands on. */
const LOWER = -UC_DAVIS_DROP;
/** The service drive crossing below the landing, asphalt between the sidewalk and the plaza (x, feet). */
export const UC_DAVIS_DRIVE: [number, number] = [UC_DAVIS_RUN + 20 * F, UC_DAVIS_RUN + 36 * F];
/**
 * The quad's lawns on the lower level, rectangles x0, x1, z0, z1 (set units): beyond the stairs, behind the
 * building's side path, and either side of the bike plaza across the drive (Luc's photographs, the 2023 frames).
 */
export const UC_DAVIS_LAWNS: ReadonlyArray<readonly [number, number, number, number]> = [
  [6 * F, 38 * F, -120 * F, -46 * F],
  [-56 * F, 22 * F, 41 * F, 130 * F],
  [64 * F, 94 * F, -76 * F, -20 * F],
  [64 * F, 94 * F, 48 * F, 86 * F],
];
/** On one of the lawns. */
export const ucDavisLawn = (x: number, z: number) => UC_DAVIS_LAWNS.some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
/** The jump line, and how wide the worn lane along it runs. */
const LANE = 2.6 * F;

/* ----- Upright faces, in their own vertex colours ----- */

/**
 * A rectangle of fresher or older paint on one of the red panels: `z0`…`z1` along the facade, `y0`…`y1` up it.
 * Buff is paint rolled over a tag a touch brighter than the panel around it; ghost is an old tag showing back
 * through, darker.
 */
export interface PanelPatch { z0: number; z1: number; y0: number; y1: number; color: string }

/**
 * The patches on the panel from `z0` to `z1`: a few broad rolled squares within reach of the walk, and smaller
 * ghosts of tags among them (the Camarillo photograph's left panel, the 2023 frames' hallway wall).
 */
export function panelPatches(bay: number, z0: number, z1: number): PanelPatch[] {
  const patches: PanelPatch[] = [];
  const width = z1 - z0;
  const count = 1 + Math.floor(hash2(bay, 1, 601) * 3);
  for (let k = 0; k < count; k++) {
    const w = (1.6 + 3 * hash2(bay, k, 602)) * F, h = (1.4 + 2.6 * hash2(bay, k, 603)) * F;
    const s = z0 + 0.2 * F + Math.max(0, width - w - 0.4 * F) * hash2(bay, k, 604);
    const y = (0.9 + 4.2 * hash2(bay, k, 605)) * F;
    const buff = hash2(bay, k, 606) > 0.3;
    patches.push({ z0: s, z1: Math.min(z1 - 0.1 * F, s + w), y0: y, y1: y + h, color: buff ? PAINT.panelBuff : PAINT.panelGhost });
  }
  return patches;
}

/**
 * The red paint at `z` along the facade and `y` up it, outside any patch: each bay a little its own tone, the
 * paint chalkier high up where the sun reaches past the roof, grime and splash low along the plinth.
 */
export function panelTone(bay: number, z: number, y: number): string {
  const Z = z / F, Y = y / F;
  const base = [PAINT.panel, PAINT.panelWarm, PAINT.panelCool][bay % 3];
  let c = mixHex(base, PAINT.panelBuff, 0.35 * (valueNoise(Z / 2.5 + bay * 4.1, Y / 3) - 0.5) + 0.12 * Math.max(0, (Y - 6) / 6));
  c = mixHex(c, PAINT.panelGhost, 0.25 * Math.max(0, valueNoise(Z / 1.2 + 9, Y / 0.9 + bay) - 0.62) * 2.6);
  const grime = Math.max(0, 1 - Y / (1.1 + 0.8 * valueNoise(Z / 2 + bay, 3.3))) ** 1.5;
  return mixHex(c, PAINT.panelGrime, 0.6 * grime);
}

/** The pale fin wall and the hallway's render at `s` along it and `y` up: water streaks from the top, grime at the foot. */
export function finTone(s: number, y: number, base: string = PAINT.fin): string {
  const S = s / F, Y = y / F;
  const streak = Math.max(0, valueNoise(S * 1.6, 0.4) - 0.55) * 2.2 * Math.max(0, (Y - 4) / 8);
  const grime = Math.max(0, 1 - Y / (1 + 0.9 * valueNoise(S / 2.3, 7.1))) ** 1.4;
  const c = mixHex(base, PAINT.finGrime, 0.35 * streak + 0.08 * (valueNoise(S / 3, Y / 3) - 0.5));
  return mixHex(c, PAINT.plinthGrime, 0.55 * grime);
}

/**
 * The planter's board-formed wall: board `k` around it (each a few inches wide, its own tone off the forms),
 * `t` up it (0 foot, 1 top), green-grey algae and grime where the bank's soil and water sit against it.
 */
export function planterTone(k: number, t: number): string {
  let c = mixHex(PAINT.planter, k % 2 ? PAINT.planterTop : PAINT.planterGrime, 0.12 + 0.12 * hash2(k, 1, 611));
  // Water run down from the cap, a streak here and there.
  if (hash2(k, 2, 612) > 0.72) c = mixHex(c, PAINT.planterGrime, 0.3 * t);
  const reach = 0.25 + 0.2 * valueNoise(k / 5, 2.2);
  const foot = Math.max(0, 1 - t / reach) ** 1.3;
  c = mixHex(c, PAINT.planterAlgae, 0.5 * foot * valueNoise(k / 3.5, 8.1));
  return mixHex(c, PAINT.planterGrime, 0.45 * foot);
}

/** The low curb's face at `s` along it, `t` up it: splashed and grimy from the gutter, scuffed where boards roll off. */
export function curbTone(s: number, t: number): string {
  const S = s / F;
  const scuff = Math.max(0, valueNoise(S * 0.7, 3.1) - 0.6) * 2.5;
  return mixHex(mixHex(PAINT.curbFace, PAINT.curbGrime, 0.55 * (1 - t) ** 1.5), '#6e6c66', 0.3 * scuff * (1 - t));
}

/* ----- Level marks, on the decals ----- */

/** A level quad over a rectangle at `y`, a colour per corner if given. */
function patch(b: Bake, x0: number, x1: number, z0: number, z1: number, y: number, colors: string | [string, string, string, string], ink = CONCRETE) {
  const [c00, c10, c11, c01] = typeof colors === 'string' ? [colors, colors, colors, colors] : colors;
  b.quadCorners([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], UP, [{ color: c01 }, { color: c11 }, { color: c10 }, { color: c00 }], ink);
}

/** A crooked crack: a dark thread wandering across level ground at `y`. */
function crack(b: Bake, x: number, z: number, y: number, seed: number, length: number, along: 'x' | 'z', ink = CONCRETE, keep: (x: number, z: number) => boolean = () => true) {
  let prev: [number, number] = [x, z];
  const parts = 8;
  for (let k = 1; k <= parts; k++) {
    const wander = 0.4 * F * (hash2(seed, k, 650) - 0.5) + 0.15 * F * Math.sin(k * 1.7 + seed);
    const next: [number, number] = along === 'x' ? [x + (length * k) / parts, z + wander] : [x + wander, z + (length * k) / parts];
    const w = 0.45 + 0.3 * hash2(seed, k, 651);
    const [dx, dz] = along === 'x' ? [0, w] : [w, 0];
    const p = (q: [number, number], s: number): Vec3 => [q[0] + s * dx, y, q[1] + s * dz];
    if (keep(prev[0], prev[1]) && keep(next[0], next[1])) b.quad(p(prev, -1), p(prev, 1), p(next, 1), p(next, -1), UP, { color: PAINT.crack }, ink);
    prev = next;
  }
}

/** A blot: an irregular round stain `r` across at `y`, darker in the middle. */
function blot(b: Bake, x: number, z: number, y: number, r: number, center: string, rim: string, seed: number, ink = CONCRETE) {
  const around = 10;
  for (let k = 0; k < around; k++) {
    const at = (j: number): Vec3 => {
      const a = (j / around) * Math.PI * 2, rr = r * (0.65 + 0.5 * hash2(seed, j % around, 660));
      return [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr];
    };
    b.vertex([x, y, z], UP, { color: center }, ink);
    b.vertex(at(k + 1), UP, { color: rim }, ink);
    b.vertex(at(k), UP, { color: rim }, ink);
  }
}

/** A straight tooled joint from (x0, z0) to (x1, z1) at `y`, drawn in short pieces kept where `keep` allows. */
function joint(b: Bake, x0: number, z0: number, x1: number, z1: number, y: number, keep: (x: number, z: number) => boolean, width = 0.045 * F, color: string = PAINT.joint) {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const pieces = Math.max(1, Math.ceil(length / (2 * F)));
  const nx = (-(z1 - z0) / length) * width / 2, nz = ((x1 - x0) / length) * width / 2;
  for (let k = 0; k < pieces; k++) {
    const a = k / pieces, c = (k + 1) / pieces;
    const pa: [number, number] = [x0 + (x1 - x0) * a, z0 + (z1 - z0) * a], pc: [number, number] = [x0 + (x1 - x0) * c, z0 + (z1 - z0) * c];
    if (!keep(...pa) || !keep(...pc) || !keep((pa[0] + pc[0]) / 2, (pa[1] + pc[1]) / 2)) continue;
    b.quad([pa[0] - nx, y, pa[1] - nz], [pc[0] - nx, y, pc[1] - nz], [pc[0] + nx, y, pc[1] + nz], [pa[0] + nx, y, pa[1] + nz], UP, { color }, CONCRETE);
  }
}

/** Open lower paving, half a foot clear of the curb, the stairs and anything raised. */
function onLower(x: number, z: number) {
  const m = 0.5 * F;
  return [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].every(([dx, dz]) => ucDavisSurface(x + dx, z + dz) === LOWER && !ucDavisLawn(x + dx, z + dz));
}

/** On the terrace or in the hallway, clear of their edges. */
function onTerrace(x: number, z: number) {
  const m = 0.15 * F;
  return [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].every(([dx, dz]) => ucDavisSurface(x + dx, z + dz) === 0);
}

/**
 * The terrace and the hallway: slab joints, a paler lane polished along the line to the lip, the coping's pale
 * band and the tail scuffs where boards pop off it, a few cracks.
 */
function terrace(b: Bake) {
  const x0 = UC_DAVIS_BUILDING_FRONT_X, y = LIFT[0];
  // The lane, paler toward its middle, from the hallway's far end to the coping.
  const segments = 4;
  for (let s = 0; s < segments; s++) {
    const za = -LANE + (2 * LANE * s) / segments, zc = -LANE + (2 * LANE * (s + 1)) / segments;
    const tone = (z: number) => mixHex(PAINT.terrace, PAINT.terraceWorn, Math.max(0, 1 - Math.abs(z) / LANE) ** 1.3);
    patch(b, UC_DAVIS_BUILDING_BACK_X + 0.3 * F, -1.05 * F, Math.max(za, -UC_DAVIS_HALL_HALF_WIDTH + 0.2 * F), Math.min(zc, UC_DAVIS_HALL_HALF_WIDTH - 0.2 * F), y,
      [tone(za), tone(za), tone(zc), tone(zc)]);
  }
  // The coping along the lip: a band of paler, harder concrete a foot wide.
  for (let z = UC_DAVIS_BUILDING_Z0 + 0.2 * F; z < UC_DAVIS_BANK_Z1 - 0.2 * F; z += 6 * F) {
    const z1 = Math.min(z + 6 * F, UC_DAVIS_BANK_Z1 - 0.2 * F);
    const tone = (zz: number) => mixHex(PAINT.coping, PAINT.terraceWorn, valueNoise(zz / (3 * F), 1.7));
    patch(b, -0.95 * F, -0.08 * F, z, z1, LIFT[0], [tone(z), tone(z), tone(z1), tone(z1)]);
  }
  // Slab joints across the terrace every seven feet, the coping's joint along it, and across the hallway.
  for (let z = UC_DAVIS_BUILDING_Z0 + 7 * F; z < UC_DAVIS_BANK_Z1; z += 7 * F) joint(b, x0 + 0.2 * F, z, -0.15 * F, z, LIFT[1], onTerrace);
  joint(b, -1 * F, UC_DAVIS_BUILDING_Z0 + 0.2 * F, -1 * F, UC_DAVIS_BANK_Z1 - 0.2 * F, LIFT[1], onTerrace);
  for (let x = x0 - 6 * F; x > UC_DAVIS_BUILDING_BACK_X + F; x -= 6 * F) joint(b, x, -UC_DAVIS_HALL_HALF_WIDTH + 0.2 * F, x, UC_DAVIS_HALL_HALF_WIDTH - 0.2 * F, LIFT[1], onTerrace);
  // Tail scuffs on the coping where boards pop: short grey-black strokes along the line.
  for (let k = 0; k < 14; k++) {
    const x = -(0.12 + 0.75 * hash2(k, 1, 670)) * F, z = (hash2(k, 2, 670) - 0.5) * 2.4 * F;
    const length = (0.25 + 0.5 * hash2(k, 3, 670)) * F, w = 0.6 + 0.6 * hash2(k, 4, 670);
    const a = (hash2(k, 5, 670) - 0.5) * 0.5;
    const dx = Math.cos(a) * length, dz = Math.sin(a) * length;
    const xa = Math.max(x - dx / 2, -0.9 * F), xc = Math.min(x + dx / 2, -0.1 * F);
    b.quad([xa, LIFT[2], z - w], [xa, LIFT[2], z + w], [xc, LIFT[2], z + dz + w], [xc, LIFT[2], z + dz - w], UP, { color: mixHex(PAINT.coping, '#3b3a36', 0.45 + 0.3 * hash2(k, 6, 670)) }, CONCRETE);
  }
  for (let k = 0; k < 6; k++) {
    const z = UC_DAVIS_BUILDING_Z0 + (8 + 95 * hash2(k, 1, 671)) * F;
    crack(b, x0 + (0.5 + 4 * hash2(k, 2, 671)) * F, z, LIFT[2], k + 700, (1.5 + 3 * hash2(k, 3, 671)) * F, hash2(k, 4, 671) > 0.5 ? 'x' : 'z', CONCRETE, onTerrace);
  }
  // Water stains where the roof's drip line falls, just in front of the facade.
  for (let k = 0; k < 9; k++) {
    const z = UC_DAVIS_BUILDING_Z0 + (4 + 100 * hash2(k, 7, 672)) * F;
    if (Math.abs(z) < UC_DAVIS_HALL_HALF_WIDTH + F) continue;
    blot(b, x0 + (0.9 + 0.6 * hash2(k, 8, 672)) * F, z, LIFT[1], (0.6 + 0.9 * hash2(k, 9, 672)) * F, mixHex(PAINT.terrace, '#8f8b7f', 0.5), mixHex(PAINT.terrace, '#8f8b7f', 0.15), k + 720);
  }
}

/**
 * The sidewalk below: tooled joints in a grid out to the drive, black landing scuffs fanning out from where the
 * gap lands, a slab or two patched, cracks, and dry leaves drifted against the curb off the line.
 */
function sidewalk(b: Bake) {
  const [drive0] = UC_DAVIS_DRIVE;
  const y = LOWER + LIFT[1];
  const keep = (x: number, z: number) => onLower(x, z) && x < drive0 - 0.3 * F;
  for (let x = UC_DAVIS_RUN + 1.5 * F; x < drive0; x += 6 * F) joint(b, x, -90 * F, x, 60 * F, y, keep);
  for (let z = -84 * F; z < 60 * F; z += 6 * F) joint(b, -60 * F, z, drive0, z, y, keep);
  // Landing scuffs: short dark strokes along the roll-away.
  for (let k = 0; k < 7; k++) {
    const x = UC_DAVIS_RUN + (2.5 + 11 * hash2(k, 1, 680)) * F, z = (hash2(k, 2, 680) - 0.5) * 6 * F;
    const length = (0.8 + 2 * hash2(k, 3, 680)) * F, w = 0.6 + 0.6 * hash2(k, 4, 680);
    const a = (hash2(k, 5, 680) - 0.5) * 0.35;
    const dx = Math.cos(a) * length, dz = Math.sin(a) * length;
    if (!onLower(x, z) || !onLower(x + dx, z + dz)) continue;
    b.quad([x, LOWER + LIFT[2], z - w], [x, LOWER + LIFT[2], z + w], [x + dx, LOWER + LIFT[2], z + dz + w], [x + dx, LOWER + LIFT[2], z + dz - w], UP,
      { color: mixHex(PAINT.sidewalk, PAINT.tyre, 0.18 + 0.15 * hash2(k, 6, 680)) }, CONCRETE);
  }
  // A patched slab, darker and smoother, and a pale fresh one, both off the line.
  for (const [x, z, w, d, c] of [[UC_DAVIS_RUN + 7.5 * F, -18 * F, 6 * F, 6 * F, mixHex(PAINT.sidewalk, '#a9a69a', 0.6)], [UC_DAVIS_RUN + 13.5 * F, 12 * F, 6 * F, 6 * F, PAINT.sidewalkWorn]] as const) {
    patch(b, x + 0.06 * F, x + d - 0.06 * F, z + 0.06 * F, z + w - 0.06 * F, LOWER + LIFT[0], c);
  }
  for (let k = 0; k < 10; k++) {
    const x = UC_DAVIS_RUN + (1 + 18 * hash2(k, 1, 681)) * F, z = (-70 + 120 * hash2(k, 2, 681)) * F;
    crack(b, x, z, LOWER + LIFT[2], k + 740, (2 + 4 * hash2(k, 3, 681)) * F, hash2(k, 4, 681) > 0.5 ? 'x' : 'z', CONCRETE, keep);
  }
  // Leaves drifted against the curb round the bank's toe and along the side path, none on the line.
  for (let k = 0; k < 220; k++) {
    let x: number, z: number;
    if (k < 150) {
      z = (-24 + 39 * hash2(k, 1, 682)) * F;
      x = ucDavisBankEnd(z) + (0.55 + 2.2 * hash2(k, 2, 682) ** 2) * F;
    } else {
      x = (-45 + 45 * hash2(k, 1, 682)) * F;
      z = UC_DAVIS_WRAP_Z + (0.55 + 2 * hash2(k, 2, 682) ** 2) * F;
    }
    if (Math.abs(z) < 3.5 * F || !onLower(x, z)) continue;
    const r = (0.07 + 0.08 * hash2(k, 3, 682)) * F, a = hash2(k, 4, 682) * Math.PI;
    const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    const yy = LOWER + LIFT[2];
    b.quad([x - ca, yy, z - sa], [x - sa * 0.45, yy, z + ca * 0.45], [x + ca, yy, z + sa], [x + sa * 0.45, yy, z - ca * 0.45], UP, { color: PAINT.leaf[k % PAINT.leaf.length] }, CONCRETE);
  }
}

/**
 * The service drive across the foot of the landing: patches of newer asphalt, cracks along and across it, oil
 * where the campus trucks stand, tyre-polished lanes.
 */
function drive(b: Bake) {
  const [x0, x1] = UC_DAVIS_DRIVE;
  const y = LOWER + LIFT[0];
  for (const [lane, w] of [[x0 + 4.5 * F, 1.6 * F], [x1 - 4.5 * F, 1.6 * F]] as const) {
    for (let z = -150 * F; z < 150 * F; z += 15 * F) {
      const tone = (x: number) => mixHex(PAINT.asphalt, PAINT.asphaltWorn, 0.45 * Math.max(0, 1 - Math.abs(x - lane) / w));
      patch(b, lane - w, lane, z, z + 15 * F, y, [tone(lane - w), tone(lane), tone(lane), tone(lane - w)], ASPHALT);
      patch(b, lane, lane + w, z, z + 15 * F, y, [tone(lane), tone(lane + w), tone(lane + w), tone(lane)], ASPHALT);
    }
  }
  for (let k = 0; k < 6; k++) {
    const z = (-110 + 200 * hash2(k, 1, 690)) * F, w = (5 + 9 * hash2(k, 2, 690)) * F;
    const d = (4 + 6 * hash2(k, 3, 690)) * F, x = x0 + 0.5 * F + (x1 - x0 - d - F) * hash2(k, 4, 690);
    patch(b, x, x + d, z, z + w, LOWER + LIFT[1], hash2(k, 5, 690) > 0.4 ? PAINT.asphaltPatch : mixHex(PAINT.asphalt, PAINT.asphaltPatch, 0.4), ASPHALT);
  }
  for (let k = 0; k < 18; k++) {
    const along = hash2(k, 1, 691) > 0.4;
    const x = x0 + (1 + (x1 - x0 - 2 * F) / F * hash2(k, 2, 691)) * F, z = (-130 + 250 * hash2(k, 3, 691)) * F;
    const length = along ? (8 + 14 * hash2(k, 4, 691)) * F : Math.min((5 + 8 * hash2(k, 4, 691)) * F, x1 - x - 0.6 * F);
    crack(b, x, z, LOWER + LIFT[2], k + 760, length, along ? 'z' : 'x', ASPHALT, (cx) => cx > x0 + 0.3 * F && cx < x1 - 0.3 * F);
  }
  // Oil where the trucks park along the drive's far side, and a few drips down its middle.
  for (let k = 0; k < 9; k++) {
    const z = k < 5 ? (-74 + 30 * hash2(k, 1, 692)) * F : (-120 + 220 * hash2(k, 1, 692)) * F;
    const x = k < 5 ? x1 - (3 + 3 * hash2(k, 2, 692)) * F : x0 + (5 + 6 * hash2(k, 2, 692)) * F;
    blot(b, x, z, LOWER + LIFT[2], (0.5 + 1.2 * hash2(k, 3, 692)) * F, PAINT.oil, mixHex(PAINT.oil, PAINT.asphalt, 0.6), k + 780, ASPHALT);
  }
}

/** The plaza beyond the drive and the path round the building's side: joints and the odd crack. */
function plaza(b: Bake) {
  const [, x1] = UC_DAVIS_DRIVE;
  const y = LOWER + LIFT[1];
  const keep = (x: number, z: number) => onLower(x, z) && x > x1 + 0.3 * F && x < 96 * F;
  for (let x = x1 + 8 * F; x < 96 * F; x += 8 * F) joint(b, x, -80 * F, x, 90 * F, y, keep);
  for (let z = -80 * F; z < 90 * F; z += 8 * F) joint(b, x1, z, 96 * F, z, y, keep);
  // The path along the building's side, joints across it.
  const side = (x: number, z: number) => onLower(x, z) && z > UC_DAVIS_WRAP_Z && z < UC_DAVIS_WRAP_Z + 9 * F;
  for (let x = -60 * F; x < 0; x += 5 * F) joint(b, x, UC_DAVIS_WRAP_Z + 0.3 * F, x, UC_DAVIS_WRAP_Z + 9 * F, y, side);
  for (let k = 0; k < 8; k++) {
    const x = x1 + (2 + 30 * hash2(k, 1, 695)) * F, z = (-60 + 140 * hash2(k, 2, 695)) * F;
    crack(b, x, z, LOWER + LIFT[2], k + 800, (2 + 4 * hash2(k, 3, 695)) * F, hash2(k, 4, 695) > 0.5 ? 'x' : 'z', CONCRETE, keep);
  }
}

/** Every level mark, on the decals. */
export function buildUcDavisWear(decals: Bake) {
  terrace(decals);
  sidewalk(decals);
  drive(decals);
  plaza(decals);
}
