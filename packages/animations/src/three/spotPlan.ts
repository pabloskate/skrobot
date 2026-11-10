import type { Mesh } from 'three';
import { FOOT } from '../units';
import { SET_SCALE } from '../sets/setScale';
import { setInfo, type StageSet } from '../sets/sets';
import { setFilmers, type SpotTripods } from '../sets/tripods';
import { SET_PIECES } from './setPieces';

/**
 * A spot from straight above: how high its topmost surface stands over each
 * square of a grid, read off the very meshes the stage draws. A map of the
 * spot is shaded from it, and a tripod the viewer stands anywhere in the
 * spot is put on top of whatever is there — the landing, a bank, a wall, a
 * roof — so it never ends up under the ground or inside a building.
 *
 * Everything is in stage units: `u` along the drop from its lip, `z` across
 * the set, heights as the stage's y (0 at the run-up).
 */
export interface SpotPlan {
  set: StageSet;
  /** The corner of the first square, and the side of each. */
  u0: number;
  z0: number;
  cell: number;
  cols: number;
  rows: number;
  /** The topmost surface over each square, row by row across the set; NaN where there is nothing. */
  height: Float32Array;
}

/** How far a plan reaches before the lip, past the ride-away, and to each side of the line. */
const BEFORE = 60 * FOOT;
const PAST = 70 * FOOT;
const BESIDE = 55 * FOOT;
/** Room kept around the spot's own filmers, wherever they stand. */
const AROUND_FILMER = 14 * FOOT;
/** Squares are this size unless the spot is so long that finer ones would be wasted. */
const CELL = 0.5 * FOOT;
const MOST_COLS = 420;

const plans = new Map<StageSet, SpotPlan | null>();

function bounds(set: StageSet): { u0: number; u1: number; z0: number; z1: number } | null {
  const info = setInfo(set);
  const terrains = [info.terrain, ...(info.obstacles ?? []).map((o) => o.terrain)].filter((t) => t != null);
  if (terrains.length === 0) return null;
  let u0 = Infinity;
  let u1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  const take = (ua: number, ub: number, za: number, zb: number) => {
    u0 = Math.min(u0, ua); u1 = Math.max(u1, ub); z0 = Math.min(z0, za); z1 = Math.max(z1, zb);
  };
  for (const t of terrains) {
    const from = Math.min(0, t.entry?.x ?? 0, t.dropIn?.x ?? 0);
    take(from - BEFORE, t.run + t.landPast + PAST, Math.min(t.laneZ, t.entry?.z ?? t.laneZ) - BESIDE, Math.max(t.laneZ, t.entry?.z ?? t.laneZ) + BESIDE);
  }
  const filmers = setFilmers(set);
  const groups: SpotTripods[] = filmers ? [filmers.stairs, ...Object.values(filmers.obstacles ?? {}), ...Object.values(filmers.ledges ?? {})] : [];
  for (const group of groups) {
    for (const stand of [...Object.values(group.stands), ...Object.values(group.across ?? {})]) {
      const u = stand.u * SET_SCALE;
      const z = stand.z * SET_SCALE;
      take(u - AROUND_FILMER, u + AROUND_FILMER, z - AROUND_FILMER, z + AROUND_FILMER);
    }
  }
  return { u0, u1, z0, z1 };
}

/** The plan of a spot read off its meshes (drawn in set units, so SET_SCALE smaller than the stage). */
function rasterize(set: StageSet, meshes: readonly Mesh[]): SpotPlan | null {
  const box = bounds(set);
  if (!box) return null;
  const cell = Math.max(CELL, (box.u1 - box.u0) / MOST_COLS);
  const cols = Math.ceil((box.u1 - box.u0) / cell);
  const rows = Math.ceil((box.z1 - box.z0) / cell);
  const height = new Float32Array(cols * rows).fill(NaN);
  const k = SET_SCALE / cell;
  const ou = box.u0 / cell;
  const oz = box.z0 / cell;
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position');
    if (!position) continue;
    const p = position.array as ArrayLike<number>;
    const index = mesh.geometry.getIndex()?.array ?? null;
    const corners = index ? index.length : position.count;
    for (let i = 0; i + 2 < corners; i += 3) {
      const a = (index ? index[i] : i) * 3;
      const b = (index ? index[i + 1] : i + 1) * 3;
      const c = (index ? index[i + 2] : i + 2) * 3;
      // In squares: a square's center is at a whole number and a half.
      const ax = p[a] * k - ou, az = p[a + 2] * k - oz;
      const bx = p[b] * k - ou, bz = p[b + 2] * k - oz;
      const cx = p[c] * k - ou, cz = p[c + 2] * k - oz;
      const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 0.5) + 1);
      const i1 = Math.min(cols - 1, Math.floor(Math.max(ax, bx, cx) - 0.5));
      const j0 = Math.max(0, Math.floor(Math.min(az, bz, cz) - 0.5) + 1);
      const j1 = Math.min(rows - 1, Math.floor(Math.max(az, bz, cz) - 0.5));
      if (i0 > i1 || j0 > j1) continue;
      const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      // Seen edge on from above: a wall's face, which its top already covers.
      if (Math.abs(area) < 1e-6) continue;
      const ay = p[a + 1] * SET_SCALE, by = p[b + 1] * SET_SCALE, cy = p[c + 1] * SET_SCALE;
      for (let j = j0; j <= j1; j++) {
        const z = j + 0.5;
        for (let col = i0; col <= i1; col++) {
          const x = col + 0.5;
          const wa = ((bx - x) * (cz - z) - (cx - x) * (bz - z)) / area;
          const wb = ((cx - x) * (az - z) - (ax - x) * (cz - z)) / area;
          const wc = 1 - wa - wb;
          if (wa < 0 || wb < 0 || wc < 0) continue;
          const y = wa * ay + wb * by + wc * cy;
          const at = j * cols + col;
          if (!(height[at] >= y)) height[at] = y;
        }
      }
    }
  }
  return { set, u0: box.u0, z0: box.z0, cell, cols, rows, height };
}

/** The plan of the spot a renderer has already built, so it isn't built twice. */
export function spotPlanFrom(set: StageSet, terrain: (() => readonly Mesh[]) | undefined): SpotPlan | null {
  if (!plans.has(set)) plans.set(set, terrain ? rasterize(set, terrain()) : null);
  return plans.get(set) ?? null;
}

/** The plan of a spot; null where it has no drop to map (the plaza and waterfront). Built once per spot. */
export function spotPlan(set: StageSet): SpotPlan | null {
  if (plans.has(set)) return plans.get(set) ?? null;
  // Nothing is drawn with this copy of the spot: it is only read, then let go.
  const piece = SET_PIECES[set]();
  const plan = spotPlanFrom(set, piece.terrain?.bind(piece));
  piece.dispose();
  return plan;
}

/** The plan's reach along the drop and across the set. */
export const planBounds = (plan: SpotPlan) => ({ u0: plan.u0, u1: plan.u0 + plan.cols * plan.cell, z0: plan.z0, z1: plan.z0 + plan.rows * plan.cell });

/** A tripod's legs, and the filmer behind it, want this much clear ground round them. */
const FOOTING = 1.5 * FOOT;

/**
 * How high the ground stands under a tripod at (u, z): the highest thing
 * within its footing, so it clears a wall, a rail or a bush it stands beside
 * rather than filming from inside it. Off the plan, or where nothing is
 * built, the run-up's height.
 */
export function groundUnder(plan: SpotPlan, u: number, z: number): number {
  const col = Math.floor((u - plan.u0) / plan.cell);
  const row = Math.floor((z - plan.z0) / plan.cell);
  const reach = Math.max(1, Math.round(FOOTING / plan.cell));
  let top = -Infinity;
  for (let j = Math.max(0, row - reach); j <= Math.min(plan.rows - 1, row + reach); j++) {
    for (let i = Math.max(0, col - reach); i <= Math.min(plan.cols - 1, col + reach); i++) {
      const y = plan.height[j * plan.cols + i];
      if (y > top) top = y;
    }
  }
  return Number.isFinite(top) ? top : 0;
}
