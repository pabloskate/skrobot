import { HANGER_BOTTOM, WHEEL_HALF_W, WHEEL_INNER, WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../board/board';
import { THICKNESS, TIP_X, halfWidth, kickY } from '../board/deck';
import { dot3, sub3, type V3 } from '../math';
import { SHOE_HALF_HEIGHT, SHOE_HALF_LENGTH, SHOE_HALF_WIDTH, type BoardRig, type Frame3, type LegRig } from './skeleton';

/**
 * The board as the feet meet it: how far a shoe has to move to stand clear
 * of the deck, trucks, and wheels under it.
 *
 * The physics places the feet side-on, where a board is a line, so a deck
 * popped steep, rolling through a flip, or swinging round in a shuv passes
 * through feet that never moved for it. The rig measures that here and
 * tucks the feet out of the way (see rig.ts).
 */

/** The renderer draws the deck and axles this much wider than the physics'
 *  board (board/boardDimensions.ts); feet that clear it clear both. */
export const WIDEST_BOARD = 1.2;
/** How far outside a shoe's footprint the board still counts as under it:
 *  the board is sampled every couple of units, and soles are rounded. */
const FOOTPRINT_PAD = 0.6;

/** The legs' round thickness at the hip, knee, and ankle, as Robot3D draws
 *  them (board/boardCollision.ts LEG_RADII). */
export const LIMB_RADII = { hip: 6.5, knee: 5.2, ankle: 4.3 } as const;

/** Board-local surface samples (x nose, y down, z across). */
const BOARD_POINTS: readonly V3[] = (() => {
  const points: V3[] = [];
  const stations = 40;
  for (let i = 0; i <= stations; i++) {
    const x = -TIP_X + (2 * TIP_X * i) / stations;
    const half = halfWidth(x) * WIDEST_BOARD;
    for (const y of [kickY(x) - THICKNESS / 2, kickY(x) + THICKNESS / 2]) {
      for (let k = -4; k <= 4; k++) points.push({ x, y, z: (half * k) / 4 });
    }
  }
  for (const x of [-WHEEL_X, WHEEL_X]) {
    // Baseplate and hanger.
    for (const dx of [-2, 2]) {
      for (const y of [kickY(x) + THICKNESS / 2, HANGER_BOTTOM]) {
        for (const z of [-WHEEL_INNER, 0, WHEEL_INNER]) points.push({ x: x + dx, y, z: z * WIDEST_BOARD });
      }
    }
    // Wheels: rims on both faces, every 30 degrees.
    for (const side of [-1, 1]) {
      for (const face of [-1, 1]) {
        const z = side * (WHEEL_Z + face * WHEEL_HALF_W) * WIDEST_BOARD;
        for (let a = 0; a < 360; a += 30) {
          const r = (a * Math.PI) / 180;
          points.push({ x: x + WHEEL_R * Math.cos(r), y: WHEEL_Y + WHEEL_R * Math.sin(r), z });
        }
      }
    }
  }
  return points;
})();

/**
 * How far `shoe` must move along `dir` until no part of the board is inside
 * it: the end of the run of positions, starting where it is, that the board
 * fills. 0 when it's clear, and when the board is above the foot (a deck
 * rolling over a flicked foot is free to cover it; moving the foot up would
 * push it through).
 */
export function soleClearance(board: BoardRig, shoe: Frame3, dir: V3): number {
  const origin = board.point({ x: 0, y: 0, z: 0 });
  if (dot3(sub3(origin, shoe.origin), shoe.up) > 0) return 0;
  // Board-local → shoe-local is affine: precompute it once per call.
  const ax = board.dir({ x: 1, y: 0, z: 0 });
  const ay = board.dir({ x: 0, y: 1, z: 0 });
  const az = board.dir({ x: 0, y: 0, z: 1 });
  const o = sub3(origin, shoe.origin);
  const axes = [shoe.fwd, shoe.up, shoe.side];
  const reach = [SHOE_HALF_LENGTH + FOOTPRINT_PAD, SHOE_HALF_HEIGHT, SHOE_HALF_WIDTH + FOOTPRINT_PAD];
  const map = axes.map((a) => [dot3(o, a), dot3(ax, a), dot3(ay, a), dot3(az, a)]);
  const step = axes.map((a) => dot3(dir, a));
  // Each board point is inside the shoe moved d along dir for d in [lo, hi].
  const spans: Array<[number, number]> = [];
  for (const p of BOARD_POINTS) {
    let lo = -Infinity;
    let hi = Infinity;
    for (let i = 0; i < 3 && lo <= hi; i++) {
      const [c, mx, my, mz] = map[i];
      const q = c + mx * p.x + my * p.y + mz * p.z;
      if (Math.abs(step[i]) < 1e-9) {
        if (Math.abs(q) > reach[i]) lo = Infinity;
        continue;
      }
      const a = (q - reach[i]) / step[i];
      const b = (q + reach[i]) / step[i];
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
    }
    if (lo <= hi && hi > 0) spans.push([lo, hi]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let clear = 0;
  for (const [lo, hi] of spans) {
    if (lo > clear) break;
    clear = Math.max(clear, hi);
  }
  return clear;
}

/** Whether any part of the board is inside a tapered limb running from a
 *  ball of radius `ra` at `a` to one of radius `rb` at `b`. */
function limbHits(world: V3[], a: V3, b: V3, ra: number, rb: number): boolean {
  const ab = sub3(b, a);
  const len2 = dot3(ab, ab) || 1;
  const r = Math.max(ra, rb);
  const lo = { x: Math.min(a.x, b.x) - r, y: Math.min(a.y, b.y) - r, z: Math.min(a.z, b.z) - r };
  const hi = { x: Math.max(a.x, b.x) + r, y: Math.max(a.y, b.y) + r, z: Math.max(a.z, b.z) + r };
  for (const p of world) {
    if (p.x < lo.x || p.x > hi.x || p.y < lo.y || p.y > hi.y || p.z < lo.z || p.z > hi.z) continue;
    const ap = sub3(p, a);
    const t = Math.max(0, Math.min(1, dot3(ap, ab) / len2));
    const dx = ap.x - ab.x * t, dy = ap.y - ab.y * t, dz = ap.z - ab.z * t;
    const reach = ra + (rb - ra) * t;
    if (dx * dx + dy * dy + dz * dz < reach * reach) return true;
  }
  return false;
}

/** Whether the board is inside a leg's shin or thigh. */
export function legInBoard(board: BoardRig, leg: LegRig): boolean {
  const origin = board.point({ x: 0, y: 0, z: 0 });
  const ax = board.dir({ x: 1, y: 0, z: 0 });
  const ay = board.dir({ x: 0, y: 1, z: 0 });
  const az = board.dir({ x: 0, y: 0, z: 1 });
  const world = BOARD_POINTS.map((p) => ({
    x: origin.x + ax.x * p.x + ay.x * p.y + az.x * p.z,
    y: origin.y + ax.y * p.x + ay.y * p.y + az.y * p.z,
    z: origin.z + ax.z * p.x + ay.z * p.y + az.z * p.z,
  }));
  return limbHits(world, leg.knee, leg.ankle, LIMB_RADII.knee, LIMB_RADII.ankle)
    || limbHits(world, leg.hip, leg.knee, LIMB_RADII.hip, LIMB_RADII.knee);
}
