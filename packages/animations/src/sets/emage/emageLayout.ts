import type { Handrail } from '../../motion/grind';
import type { DropTerrain } from '../elToro/stairs';
import { SET_FOOT } from '../setScale';
import type { SpotFilmers } from '../tripods';

/** Photo reconstruction of Emage's riverside twenty, not surveyed dimensions.
 * The twenty walking risers are sandstone half-steps inset into ten larger
 * seating terraces. +x is downhill, toward the South Platte; +z is the
 * rail/bank side. See docs/EMAGE_REFERENCE.md. */
export const EMAGE_FOOT = SET_FOOT;
const F = EMAGE_FOOT;
export const EMAGE_STEPS = 20;
export const EMAGE_DROP = 10 * F;
export const EMAGE_RUN = 22 * F;
export const EMAGE_RISER = EMAGE_DROP / EMAGE_STEPS;
export const EMAGE_TREAD = EMAGE_RUN / (EMAGE_STEPS - 1);
export const EMAGE_LANE_Z = 0;
/** The red sandstone half-steps: two blocks side by side, about six feet across. */
export const EMAGE_STAIR_Z0 = -3 * F;
export const EMAGE_STAIR_Z1 = 3 * F;
/** A foot of terrace concrete outside the stones; the planted bank starts past it. */
export const EMAGE_EDGE_Z = 4 * F;
/** Paved terrace treads inland of the stones, then the gravel seating beds. */
export const EMAGE_PAVED_Z0 = -7 * F;
export const EMAGE_TERRACE_Z0 = -45 * F;
export const EMAGE_RAIL_Z = 3.7 * F;
export const EMAGE_RAIL_RADIUS = (1 / 12) * F;
export const EMAGE_RAIL_HEIGHT = 3 * F;
export const EMAGE_RAIL_START = -0.65 * F;
export const EMAGE_RAIL_END = EMAGE_RUN - 0.35 * F;
export const EMAGE_GRADE = EMAGE_RISER / EMAGE_TREAD;
export const emageNosing = (u: number) => -u * EMAGE_GRADE;

/** The river trail across the foot of the stairs, its dirt shoulder, a
 * brushy shelf, then the bank down to the water: room to ride a landing a
 * moment, not to roll it out. */
export const EMAGE_PATH = 22 * F;
export const EMAGE_SHOULDER = 6 * F;
export const EMAGE_PATH_END = EMAGE_RUN + EMAGE_PATH;
export const EMAGE_BANK_TOP = EMAGE_PATH_END + EMAGE_SHOULDER;
export const EMAGE_SHELF = 11 * F;
const SHELF_DROP = 1.5 * F;
export const EMAGE_SHELF_END = EMAGE_BANK_TOP + EMAGE_SHELF;
const BANK_RUN = 14 * F;
/** The water below the trail, and the river's bed below the water. */
export const EMAGE_WATER_Y = -EMAGE_DROP - 7 * F;
const RIVER_BED = EMAGE_WATER_Y - 3 * F;
export const EMAGE_RIVER_WIDTH = 115 * F;
/** Where a landed rider has to be off the board: the trail's far edge. */
export const EMAGE_RUNOUT = EMAGE_PATH_END - 0.5 * F;

/** The shelf eases off the shoulder; the bank then falls into the river and on to its bed. */
function emageBelow(u: number): number {
  if (u <= EMAGE_BANK_TOP) return -EMAGE_DROP;
  if (u <= EMAGE_SHELF_END) return -EMAGE_DROP - SHELF_DROP * ((u - EMAGE_BANK_TOP) / EMAGE_SHELF) ** 2;
  const p = Math.min(1, (u - EMAGE_SHELF_END) / BANK_RUN);
  return -EMAGE_DROP - SHELF_DROP + (RIVER_BED + EMAGE_DROP + SHELF_DROP) * (1 - Math.cos(Math.PI * p)) / 2;
}

/** Where the bank meets the water. */
export const EMAGE_WATER_EDGE = (() => {
  let lo = EMAGE_SHELF_END, hi = EMAGE_SHELF_END + BANK_RUN;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (emageBelow(mid) > EMAGE_WATER_Y) lo = mid; else hi = mid;
  }
  return lo;
})();

/** The shelf's brush and the bank's grab a rider or a board going into them, and the river more (a share of the speed a second). */
const BRUSH = 3;
const WATER_DRAG = 12;
const BRUSH_EASE = 2 * F;
export function emageBrush(u: number, z: number): number {
  if (u > EMAGE_WATER_EDGE) return WATER_DRAG;
  const ahead = Math.min(1, Math.max(0, (u - EMAGE_BANK_TOP) / BRUSH_EASE));
  const aside = u > 0 && u < EMAGE_BANK_TOP ? Math.min(1, Math.max(0, (z - EMAGE_EDGE_Z - F) / BRUSH_EASE)) : 0;
  return BRUSH * Math.max(ahead, aside);
}

export function emageGround(u: number): number {
  if (u < 0) return 0;
  if (u >= EMAGE_RUN) return emageBelow(u);
  return -(Math.floor(u / EMAGE_TREAD) + 1) * EMAGE_RISER;
}

/** The broad gravel/seating tiers descend every other walking riser. */
export function emageTerrace(u: number): number {
  if (u < 0) return 0;
  if (u >= EMAGE_RUN) return emageBelow(u);
  return -(2 * Math.floor(u / (2 * EMAGE_TREAD)) + 2) * EMAGE_RISER;
}

/** A planted verge outside the rail, clear of the walking lane. */
export function emageBank(u: number): number {
  if (u < 0) return 0;
  if (u >= EMAGE_RUN) return emageBelow(u);
  return Math.max(-EMAGE_DROP, emageNosing(u) - 0.65 * F);
}

export function emageSurface(u: number, z: number): number {
  if (u < 0 || u >= EMAGE_RUN) return emageGround(u);
  if (z > EMAGE_EDGE_Z) return emageBank(u);
  if (z < EMAGE_STAIR_Z0 || z > EMAGE_STAIR_Z1) return emageTerrace(u);
  return emageGround(u);
}

/** How far out on the rail side the side tripod's filmer stands (emage3d.ts): the planting in front of them stays low. */
export const EMAGE_SIDE_TRIPOD_Z = 21 * F;

export const EMAGE_TERRAIN: DropTerrain = {
  drop: EMAGE_DROP, run: EMAGE_RUN, landPast: 4 * F, laneZ: EMAGE_LANE_Z,
  ground: emageGround, surface: emageSurface, runout: EMAGE_RUNOUT, brush: emageBrush,
};

/** One real pipe at the river-side edge. z supplied to ground/rest is
 * relative to this rail, so falls can meet the bank or the actual steps. */
export const EMAGE_RAIL: Handrail = {
  start: EMAGE_RAIL_START, end: EMAGE_RAIL_END,
  top: EMAGE_RAIL_HEIGHT + EMAGE_RAIL_RADIUS * Math.hypot(1, EMAGE_GRADE),
  slope: EMAGE_GRADE, radius: EMAGE_RAIL_RADIUS, speed: 14 * F,
  ground: (u, z = 0) => emageSurface(u, EMAGE_RAIL_Z + z),
  rest: (u, z = 0) => u >= EMAGE_RUN ? emageGround(u)
    : z + EMAGE_RAIL_Z > EMAGE_EDGE_Z ? emageBank(u) : Math.max(-EMAGE_DROP, Math.min(0, emageNosing(u))),
  edge: true, runout: EMAGE_RUNOUT, brush: (u, z = 0) => emageBrush(u, EMAGE_RAIL_Z + z),
};

/** Where the filmers stand (tripods.ts). The river is right past the trail: they stand on it, not out in front. */
export const EMAGE_FILMERS: SpotFilmers = {
  stairs: {
    line: EMAGE_LANE_Z,
    stands: {
      bottom: { u: EMAGE_PATH_END - 1.5 * F, z: -17 * F, height: -EMAGE_DROP + 4.5 * F, frame: 23 * F, place: 0.52 },
      side: { u: EMAGE_RUN + 6 * F, z: EMAGE_SIDE_TRIPOD_Z, height: -EMAGE_DROP + 6 * F, frame: 24 * F, place: 0.52 },
      top: { u: -14 * F, z: -6 * F, height: 6 * F, frame: 12 * F, place: 0.46 },
    },
  },
};
