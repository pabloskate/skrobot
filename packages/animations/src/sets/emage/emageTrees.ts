import type { Vec3 } from '../../camera/view';
import { Bake, NO_INK, type Ink } from '../../three/bake';
import type { TreeSpecies } from '../props/trees';
import { hash2 } from '../setKit';
import {
  EMAGE_BANK_TOP, EMAGE_DROP, EMAGE_EDGE_Z, EMAGE_FOOT as F, EMAGE_RUN, EMAGE_SHELF_END,
  EMAGE_SIDE_TRIPOD_Z, EMAGE_RIVER_WIDTH, EMAGE_WATER_EDGE, emageBank, emageGround,
} from './emageLayout';
import { box, foliage, tube, tag } from './emageKit';
import * as PAINT from './emagePalette';
import { canopiesFromTrees } from '../surfaces';

/**
 * Emage's planting, in leaf (about 2021-22): the willow thicket on the bank beside the rail, kept low where the
 * side filmer looks across it; head-high willow brush along the river, knee-high scrub where a landed rider runs
 * into it; tall shrubs on the bank by the south building; brush along the far bank. Cottonwoods along the river
 * and broadleaf trees round the plaza are realistic street props (props/trees.ts). Also the trail's furniture.
 */

const LOWER = -EMAGE_DROP;
const FAR_BANK = EMAGE_WATER_EDGE + EMAGE_RIVER_WIDTH;
/** Planting in front of the side filmer stays under this (the real thicket there is head-high). */
export const FILMER_PLANTING_HEIGHT = 2.4 * F;
/** Where that low planting is kept: x 0 to 30 ft, z up to here. */
export const FILMER_LOW_Z = EMAGE_SIDE_TRIPOD_Z + 1.5 * F;

/** A planted mass's bounds, for the tests that keep tall planting out of the rider's and filmers' way. */
export type PlantMass = { x: number; y: number; z: number; rx: number; ry: number; rz: number; color: string };

/** The bridge deck's centre line over the bank (emageBuildings.ts), and how far from it a point is, square to it. */
const deckOffset = (x: number, z: number) => (z / F - (29 + 0.404 * (x / F + 10))) * Math.cos(22 * Math.PI / 180) * F;

/**
 * The shrubs and brush, the trail's lamps, bin and map board. Returns every leafy mass it planted (not the
 * furniture), so tests can check what stands where.
 */
export function buildPlanting(props: Bake) {
  const masses: PlantMass[] = [];
  const plant = (x: number, y: number, z: number, rx: number, ry: number, rz: number, color: string, seed: number, detail = 1) => {
    masses.push({ x, y, z, rx, ry, rz, color });
    foliage(props, x, y, z, rx, ry, rz, color, seed, tag(13), 3, detail > 1 ? 4 : 5, true);
  };
  buildThicket(plant);
  buildLowUnderstorey(plant);
  buildGuardShrubs(plant);
  buildRiverBrush(plant);
  // Tall shrubs on the planted bank between the bridge and the south building.
  for (let i = 0; i < 10; i++) {
    const x = (-56 + i * 5.2 + 2 * hash2(i, 0, 98)) * F, z = (41 + hash2(i, 0, 99) * 22) * F;
    const size = (2.2 + 1.4 * hash2(i, 0, 97)) * F;
    plant(x, 0.15 * F + size * 0.55, z, size * 1.2, size * 0.8, size, i % 3 ? PAINT.SHRUB : PAINT.SHRUB_PALE, 1400 + i);
  }
  // Willow brush along the far bank's water, in clumps of its own sizes.
  for (let i = 0; i < 26; i++) {
    const z = (-230 + i * 15 + 9 * hash2(i, 0, 1201)) * F;
    const size = (2.6 + 2.4 * hash2(i, 0, 1202)) * F;
    plant(FAR_BANK + (3 + 5 * hash2(i, 0, 1203)) * F, LOWER - 1 * F + size * 0.3, z, size * 1.3, size * 0.75, size * 1.6, PAINT.WILLOW[i % 5], 1200 + i, 2);
  }
  buildFurniture(props);
  return masses;
}

type Plant = (x: number, y: number, z: number, rx: number, ry: number, rz: number, color: string, seed: number, detail?: number) => void;

/**
 * The thicket on the bank beside the rail: dense, irregular willow masses growing out of dry grass, olive and
 * grey-green with straw, one shrub yellowing. Low where the side filmer films the rail across it (a deliberate
 * departure: the real thicket there is head-high), rising toward the bridge's abutment and at the top by the
 * guard; nothing over the rail's roll-in, the lane or under the deck.
 */
function buildThicket(plant: Plant) {
  for (let column = 0; column < 11; column++) for (let row = 0; row < 14; row++) {
    const seed = column * 14 + row;
    if (hash2(seed, 0, 701) < 0.12) continue;
    const x = (-3 + column * 2.3 + 1.5 * (hash2(seed, 0, 702) - 0.5)) * F;
    const z = (5.6 + row * 2.3 + 1.6 * (hash2(seed, 0, 703) - 0.5)) * F;
    if (x > EMAGE_RUN - 1.2 * F) continue;
    const ground = emageBank(x), under = Math.abs(deckOffset(x, z));
    const color = seed === YELLOW_SHRUB ? PAINT.BRUSH_YELLOW : hash2(seed, 0, 704) < 0.06 ? PAINT.THICKET_STRAW : PAINT.THICKET[seed % 5];
    const spread = 1.3 + 0.9 * hash2(seed, 0, 705);
    let height: number;
    if (x >= -0.4 * F && z < FILMER_LOW_Z + spread * F) {
      // In front of the side filmer: cropped low, a little higher away from the lane.
      height = (1.1 + 1.2 * hash2(seed, 0, 706) * Math.min(1, z / (14 * F))) * F;
      height = Math.min(height, FILMER_PLANTING_HEIGHT * 0.98);
    } else if (x < -0.4 * F) {
      // On the strip at the top by the guard: shoulder-high, clear of the roll-in and of the bank's low part.
      height = (3.4 + 1.4 * hash2(seed, 0, 707)) * F;
      if (z - Math.max((1.1 + 0.8 * hash2(seed, 0, 709)) * F, 0.375 * height) < 8.3 * F) continue;
    } else {
      // Rising toward the abutment.
      height = (3.5 + 4.5 * hash2(seed, 0, 708) * Math.min(1, (z - FILMER_LOW_Z) / (8 * F))) * F;
    }
    // Under the deck there is only so much room, and none where the abutment stands.
    if (under < 8 * F) {
      const room = -1.8 * F - ground;
      if (room < 1.2 * F) continue;
      height = Math.min(height, room);
    }
    // Willows grow about as wide as they are tall: a mass is never narrower than three-quarters of its height.
    const ry = height / 2;
    // Nothing hangs over the trail or, at the top, past the bank's edge toward the roll-in.
    // It grows right up to the stair's outer wall, not over it toward the rail.
    const rz = Math.min(Math.max((1.1 + 0.8 * hash2(seed, 0, 709)) * F, 0.75 * ry), z - EMAGE_EDGE_Z - 0.2 * F);
    let rx = Math.min(Math.max(spread * F, 0.75 * ry), x < -0.4 * F ? -x - 0.05 * F : Infinity, EMAGE_RUN - x);
    // Beside the rail's roll-in, nothing reaches back onto the plaza.
    if (z - rz < 8.3 * F && x >= -0.4 * F) rx = Math.min(rx, x + 0.25 * F);
    if (rx < 0.6 * F || rz < 0.6 * F) continue;
    plant(x, ground + ry * 0.8, z, rx, ry, rz, color, 3000 + seed);
  }
}
/**
 * A second, offset layer of low masses in front of the side filmer, filling the gaps between the first so the
 * cropped thicket reads as one growth rather than shrubs dotted on grass.
 */
function buildLowUnderstorey(plant: Plant) {
  for (let column = 0; column < 9; column++) for (let row = 0; row < 7; row++) {
    const seed = 500 + column * 7 + row;
    const x = (-0.2 + 1.15 + column * 2.3 + 1.2 * (hash2(seed, 0, 711) - 0.5)) * F;
    const z = (5.6 + 1.15 + row * 2.3 + 1.2 * (hash2(seed, 0, 712) - 0.5)) * F;
    if (x > EMAGE_RUN - 1.2 * F || z > FILMER_LOW_Z) continue;
    const height = (0.8 + 0.9 * hash2(seed, 0, 713) * Math.min(1, z / (12 * F))) * F;
    const ry = height / 2, spread = (1.1 + 0.6 * hash2(seed, 0, 714)) * F;
    const rx = Math.min(spread, EMAGE_RUN - x, z - spread * 0.9 < 8.3 * F ? x + 0.25 * F : Infinity);
    plant(x, emageBank(x) + ry * 0.7, z, rx, ry, spread * 0.9, PAINT.THICKET[(seed + 2) % 5], 3600 + seed);
  }
}

/**
 * Shoulder-high willow on the strip at the top of the bank, grown right up behind the guard's posts (refs 02, 06),
 * clear of the rail's roll-in and short of the bank's edge, where the filmer's low planting begins.
 */
function buildGuardShrubs(plant: Plant) {
  for (let i = 0; i < 9; i++) {
    const seed = 800 + i;
    const z = (10.4 + i * 1.5 + 0.5 * hash2(seed, 0, 721)) * F;
    const x = (-2.2 + 0.5 * (hash2(seed, 0, 722) - 0.5)) * F;
    const height = (3.6 + 1.6 * hash2(seed, 0, 723)) * F, ry = height / 2;
    const rz = Math.min(0.75 * ry, z - 8.3 * F);
    plant(x, ry * 0.85, z, Math.min(-x - 0.05 * F, 0.75 * ry), ry, rz, PAINT.THICKET[(seed + 1) % 5], 3800 + seed);
  }
}

/** The one shrub on the bank yellowing (refs 02, 06), low in front of the side filmer. */
export const YELLOW_SHRUB = 5 * 14 + 4;

/**
 * The river bank's brush, beginning past the dirt shoulder. Straight ahead of the stairs it is knee-high scrub
 * the rider runs into, and low on to the weir, so the white water shows over it from the top of the stairs; either side,
 * head-high willows in clumps, greyer and denser, down the bank to the water.
 */
function buildRiverBrush(plant: Plant) {
  for (let i = 0; i < 50; i++) {
    const z = (-130 + i * 4.6 + 3 * hash2(i, 0, 81)) * F;
    // Low ahead of the stairs and up to the weir's white water, which the top of the stairs looks out over.
    const ahead = z > -25 * F && z < 36 * F;
    const far = Math.abs(z) > 70 * F;
    for (let k = 0; k < (ahead ? 2 : 1 + (hash2(i, 0, 80) > 0.5 ? 1 : 0)); k++) {
      const size = (ahead ? 0.65 + hash2(i, k, 83) * 0.35 : 2.2 + hash2(i, k, 83) * 1.8) * F;
      // Rooted past the dirt shoulder: none reaches back over it toward the trail.
      const x = Math.max(EMAGE_BANK_TOP + size * 1.3, EMAGE_BANK_TOP + (0.8 + hash2(i, k, 82) * (ahead ? 10 : 12.5)) * F);
      const tall = ahead ? 0.55 : 0.75 + 0.25 * hash2(i, k, 84);
      plant(x, emageGround(x) + size * tall * 0.6, z + k * 1.7 * F, size * 1.3, size * tall, size * 1.25, PAINT.WILLOW[(i + k) % 5], 900 + i * 3 + k, far ? 2 : 1);
    }
  }
  // Down the bank to the water either side, low willow at the water's edge; straight ahead, where the rider
  // runs into it, it stays knee-high.
  for (let i = 0; i < 22; i++) {
    const z = (-60 + i * 6 + 3 * hash2(i, 0, 86)) * F;
    const x = EMAGE_SHELF_END + (0.5 + 2 * hash2(i, 0, 87)) * F;
    const ahead = Math.abs(z) < 16 * F;
    const size = (ahead ? 0.7 + 0.3 * hash2(i, 0, 88) : 1.4 + 1.2 * hash2(i, 0, 88)) * F;
    plant(x, emageGround(x) + size * 0.4, z, size * 1.4, size * (ahead ? 0.55 : 0.7), size * 1.5, PAINT.WILLOW[i % 5], 960 + i);
  }
}

/** Dish-topped lamps on the shoulder and round the plaza, the shoulder's bin and the blank map board; all outside the run-out. */
function buildFurniture(props: Bake) {
  const metal: Ink = tag('metal');
  for (const [x, z, y] of [[46, -14, LOWER / F], [-3, -38, 0], [-50, 28, 0], [-95, -48, 0], [-180, -75, 0]]) {
    const at = (h: number): Vec3 => [x * F, (y + h) * F, z * F];
    tube(props, [at(0), at(13.6)], 0.14 * F, PAINT.LAMP);
    // A shallow dish, wide and thin, on a short neck.
    props.tube([at(13.45), at(13.75), at(13.95), at(14.05)], [0.16 * F, 1.0 * F, 1.3 * F, 1.25 * F], { color: PAINT.LAMP_DISH }, metal, 12, true);
  }
  // A dark round bin, and the blank map board on its two legs.
  props.tube([[46 * F, LOWER, -16 * F], [46 * F, LOWER + 3 * F, -16 * F]], [0.95 * F, 1.0 * F], { color: PAINT.LAMP }, metal, 10, true);
  for (const z of [13, 17]) box(props, [46 * F, LOWER, z * F], [46.2 * F, LOWER + 6 * F, (z + 0.2) * F], PAINT.MAP_POST, PAINT.MAP_POST, NO_INK);
  box(props, [46 * F, LOWER + 2.5 * F, 13 * F], [46.25 * F, LOWER + 6 * F, 17.2 * F], PAINT.MAP_BOARD, PAINT.MAP_BOARD, NO_INK);
  box(props, [45.9 * F, LOWER + 6 * F, 12.8 * F], [46.35 * F, LOWER + 6.25 * F, 17.4 * F], PAINT.MAP_POST, PAINT.MAP_POST, NO_INK);
}

type Tree = { at: Vec3; height: number; yaw: number; species: TreeSpecies };

/**
 * The trees, as realistic props (props/streetProps.ts). Plains cottonwoods along the river and in the park:
 * tall, open, irregular crowns, which the eucalyptus (pale trunk, high loose crown) reads as far better than a
 * clipped fig; younger broadleaf trees round the plaza and up the corridor, which the ornamental reads as. Every
 * trunk stands clear of the rider's line and the filmers, and none in front of the stairs, so the white water
 * stays in view from the top.
 */
export function emageTrees(): Tree[] {
  const trees: Tree[] = [];
  const at = (x: number, z: number): Vec3 => [x * F, x * F >= EMAGE_RUN ? emageGround(x * F) : 0, z * F];
  // Near bank: cottonwoods downriver of the stairs, and upriver past the bridge (none hiding its masts from the trail).
  for (const [x, z, height] of [[56, -42, 44], [60, -66, 36], [57, -98, 48], [61, -134, 40], [54, 100, 30]] as const) {
    trees.push({ at: at(x, z), height: height * F, yaw: x * 37 + z, species: 'eucalyptus' });
  }
  // Commons Park across the river: scattered cottonwoods and younger trees, in groups, none in rows.
  for (const [dx, z, height, young] of FAR_PARK) {
    trees.push({ at: [FAR_BANK + dx * F, LOWER - 1 * F, z * F], height: height * F, yaw: dx * 13 + z, species: young ? 'ornamental' : 'eucalyptus' });
  }
  // On the bank in front of the south building: two big broadleaf trees and a smaller one.
  for (const [x, z, height, young] of [[-40, 53, 38, false], [-16, 61, 42, false], [-58, 46, 26, true]] as const) {
    trees.push({ at: at(x, z), height: height * F, yaw: x + z, species: young ? 'ornamental' : 'eucalyptus' });
  }
  // Street trees in grates up the corridor.
  for (const [x, z, height] of [[-100, -48, 21], [-170, -80, 23], [-125, 20, 19], [-205, -40, 22]] as const) {
    trees.push({ at: at(x, z), height: height * F, yaw: x + z, species: 'ornamental' });
  }
  return trees;
}

/** The park's trees across the river: [feet past the far bank, z, height, young]. */
const FAR_PARK: readonly (readonly [number, number, number, boolean])[] = [
  [24, -205, 50, false], [41, -186, 38, true], [18, -128, 46, false], [66, -110, 30, true], [30, -52, 52, false],
  [52, -30, 42, false], [22, 24, 36, true], [78, 40, 48, false], [35, 96, 54, false], [58, 118, 32, true],
  [26, 168, 44, false], [92, 182, 40, false], [120, -60, 46, false], [140, 70, 50, false],
];

/** Near-bank and plaza crowns shade visible ground; distant park trees need no shader slots. */
export function emageCanopies() {
  return canopiesFromTrees(emageTrees().filter(({ at }) => at[0] < FAR_BANK));
}
