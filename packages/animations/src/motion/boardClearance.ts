import { HANGER_BOTTOM, WHEEL_HALF_W, WHEEL_INNER, WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../board/board';
import { THICKNESS, TIP_X, halfWidth, kickY } from '../board/deck';
import { add3, dot3, scale3, sub3, type V3 } from '../math';
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

/** Board-local surface samples (x nose, y down, z across), in small clusters:
 *  a few deck stations, a truck, a wheel's rim. */
const BOARD_PARTS: readonly (readonly V3[])[] = (() => {
  const parts: V3[][] = [];
  const stations = 40;
  let deck: V3[] = [];
  for (let i = 0; i <= stations; i++) {
    const x = -TIP_X + (2 * TIP_X * i) / stations;
    const half = halfWidth(x) * WIDEST_BOARD;
    for (const y of [kickY(x) - THICKNESS / 2, kickY(x) + THICKNESS / 2]) {
      for (let k = -4; k <= 4; k++) deck.push({ x, y, z: (half * k) / 4 });
    }
    if (i % 4 === 3 || i === stations) {
      parts.push(deck);
      deck = [];
    }
  }
  for (const x of [-WHEEL_X, WHEEL_X]) {
    // Baseplate and hanger.
    const truck: V3[] = [];
    for (const dx of [-2, 2]) {
      for (const y of [kickY(x) + THICKNESS / 2, HANGER_BOTTOM]) {
        for (const z of [-WHEEL_INNER, 0, WHEEL_INNER]) truck.push({ x: x + dx, y, z: z * WIDEST_BOARD });
      }
    }
    parts.push(truck);
    // Wheels: rims on both faces, every 30 degrees.
    for (const side of [-1, 1]) {
      for (const face of [-1, 1]) {
        const z = side * (WHEEL_Z + face * WHEEL_HALF_W) * WIDEST_BOARD;
        const rim: V3[] = [];
        for (let a = 0; a < 360; a += 30) {
          const r = (a * Math.PI) / 180;
          rim.push({ x: x + WHEEL_R * Math.cos(r), y: WHEEL_Y + WHEEL_R * Math.sin(r), z });
        }
        parts.push(rim);
      }
    }
  }
  return parts;
})();
/** The ball around each cluster, to pass over the clusters nowhere near a shoe. */
const PART_BALLS = BOARD_PARTS.map((points) => {
  const center = scale3(points.reduce((sum, p) => add3(sum, p), { x: 0, y: 0, z: 0 }), 1 / points.length);
  return { center, radius: Math.max(...points.map((p) => Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z))) };
});

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
  for (let g = 0; g < BOARD_PARTS.length; g++) {
    // A cluster wholly to one side of the shoe's path, or wholly behind where it starts, can't be in it.
    const { center, radius } = PART_BALLS[g];
    let away = false;
    for (let i = 0; i < 3 && !away; i++) {
      const [c, mx, my, mz] = map[i];
      const q = c + mx * center.x + my * center.y + mz * center.z;
      away = Math.abs(step[i]) < 1e-9
        ? Math.abs(q) - radius > reach[i] + 1e-6
        : Math.sign(step[i]) * q + radius + reach[i] < -1e-6;
    }
    if (away) continue;
    for (const p of BOARD_PARTS[g]) {
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
  const toWorld = (p: V3): V3 => ({
    x: origin.x + ax.x * p.x + ay.x * p.y + az.x * p.z,
    y: origin.y + ax.y * p.x + ay.y * p.y + az.y * p.z,
    z: origin.z + ax.z * p.x + ay.z * p.y + az.z * p.z,
  });
  // Only the clusters whose ball reaches the box round the leg.
  const r = LIMB_RADII.hip;
  const joints = [leg.hip, leg.knee, leg.ankle];
  const lo = { x: Math.min(...joints.map((j) => j.x)) - r, y: Math.min(...joints.map((j) => j.y)) - r, z: Math.min(...joints.map((j) => j.z)) - r };
  const hi = { x: Math.max(...joints.map((j) => j.x)) + r, y: Math.max(...joints.map((j) => j.y)) + r, z: Math.max(...joints.map((j) => j.z)) + r };
  const world: V3[] = [];
  BOARD_PARTS.forEach((points, g) => {
    const c = toWorld(PART_BALLS[g].center);
    const pad = PART_BALLS[g].radius + 1e-6;
    if (c.x < lo.x - pad || c.x > hi.x + pad || c.y < lo.y - pad || c.y > hi.y + pad || c.z < lo.z - pad || c.z > hi.z + pad) return;
    for (const p of points) world.push(toWorld(p));
  });
  return limbHits(world, leg.knee, leg.ankle, LIMB_RADII.knee, LIMB_RADII.ankle)
    || limbHits(world, leg.hip, leg.knee, LIMB_RADII.hip, LIMB_RADII.knee);
}
