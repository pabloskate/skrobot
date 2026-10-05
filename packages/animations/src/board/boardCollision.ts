import { HANGER_BOTTOM, WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from './board';
import { THICKNESS, TIP_X, kickY } from './deck';
import { add3, cross3, dot3, norm3, scale3, sub3, type V3 } from '../math';
import { SHOE_HALF_HEIGHT, SHOE_HALF_LENGTH, type BoardRig, type Frame3, type LegRig } from '../motion/skeleton';
import { BOARD_WIDTH_SCALE, boardHalfWidth } from './boardDimensions';

/** Match Robot3D's tapered limb capsules, including their round end caps. */
export const LEG_RADII = { hip: 6.5, knee: 5.2, ankle: 4.3 } as const;

interface Bounds { min: V3; max: V3 }
interface Convex { center: V3; support(direction: V3): V3 }
interface LocalConvex extends Convex { bounds: Bounds }

const ZERO: V3 = { x: 0, y: 0, z: 0 };
const AXES: V3[] = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }];
const EPSILON = 1e-5;

function bounded(shape: Convex): LocalConvex {
  const min = { ...ZERO };
  const max = { ...ZERO };
  for (const [i, key] of (['x', 'y', 'z'] as const).entries()) {
    min[key] = shape.support(scale3(AXES[i], -1))[key];
    max[key] = shape.support(AXES[i])[key];
  }
  return { ...shape, bounds: { min, max } };
}

function hull(points: V3[], radius = 0): LocalConvex {
  const center = scale3(points.reduce((sum, point) => add3(sum, point), ZERO), 1 / points.length);
  return bounded({
    center,
    support(direction) {
      let point = points[0];
      let best = dot3(point, direction);
      for (let i = 1; i < points.length; i++) {
        const next = dot3(points[i], direction);
        if (next > best) { best = next; point = points[i]; }
      }
      return radius ? add3(point, scale3(norm3(direction), radius)) : point;
    },
  });
}

function scaledWidth(shape: LocalConvex): LocalConvex {
  return bounded({
    center: { ...shape.center, z: shape.center.z * BOARD_WIDTH_SCALE },
    support(direction) {
      const point = shape.support({ ...direction, z: direction.z * BOARD_WIDTH_SCALE });
      return { ...point, z: point.z * BOARD_WIDTH_SCALE };
    },
  });
}

function roundedBox(center: V3, half: V3, radius: number): LocalConvex {
  return bounded({
    center,
    support(direction) {
      return add3(center, add3({
        x: Math.sign(direction.x) * (half.x - radius),
        y: Math.sign(direction.y) * (half.y - radius),
        z: Math.sign(direction.z) * (half.z - radius),
      }, scale3(norm3(direction), radius)));
    },
  });
}

/**
 * Each deck strip is a closed convex solid with the exact stations used by
 * deckGeometry, rather than a single box enclosing the nose/tail's empty air.
 * The remaining solids mirror Board3D's trucks and finite wheel cylinders.
 * Local y points down, as it does in BoardRig.
 */
const BOARD_SOLIDS: LocalConvex[] = (() => {
  const solids: LocalConvex[] = [];
  const stations = Array.from({ length: 57 }, (_, i) => {
    const x = -TIP_X * Math.cos(Math.PI * i / 56);
    return { x, y: kickY(x), width: boardHalfWidth(x) };
  });
  for (let i = 0; i < stations.length - 1; i++) {
    const points: V3[] = [];
    for (const station of [stations[i], stations[i + 1]]) {
      for (const down of [-1, 1]) for (const side of [-1, 1]) {
        points.push({ x: station.x, y: station.y + down * THICKNESS / 2, z: side * station.width });
      }
    }
    solids.push(hull(points));
  }
  for (const x of [-WHEEL_X, WHEEL_X]) {
    const underside = kickY(x) + THICKNESS / 2;
    solids.push(scaledWidth(roundedBox({ x, y: (underside + 1.2) / 2, z: 0 }, { x: 4.2, y: 0.55, z: 2.6 }, 0.5)));
    solids.push(scaledWidth(roundedBox({ x, y: (1.2 + 4.5) / 2, z: 0 }, { x: 1.5, y: 1.75, z: 1.45 }, 1.2)));
    const corners: V3[] = [];
    for (const forward of [-1, 1]) for (const side of [-1, 1]) {
      corners.push(
        { x: x + forward * 1.9, y: 4.5 + 0.8, z: side * 1.1 },
        { x: x + forward * 1.9, y: HANGER_BOTTOM - 0.8, z: side * 1.1 },
        { x: x + forward * 1.2, y: WHEEL_Y - 1.3 + 0.8, z: side * (5 - 0.8) },
        { x: x + forward * 1.2, y: HANGER_BOTTOM - 0.8, z: side * (5 - 0.8) },
      );
    }
    solids.push(scaledWidth(hull(corners, 0.8)));
    for (const side of [-1, 1]) {
      const center = { x, y: WHEEL_Y, z: side * WHEEL_Z * BOARD_WIDTH_SCALE };
      solids.push(bounded({
        center,
        support(direction) {
          const radial = Math.hypot(direction.x, direction.y);
          return add3(center, {
            x: radial ? WHEEL_R * direction.x / radial : 0,
            y: radial ? WHEEL_R * direction.y / radial : 0,
            z: Math.sign(direction.z) * WHEEL_R * 0.46 * BOARD_WIDTH_SCALE,
          });
        },
      }));
    }
  }
  return solids;
})();

/** Closest point in a simplex; enumerate its faces to handle degeneracy. */
function nearest(points: V3[]): { point: V3; simplex: V3[] } {
  let point = points[0];
  let simplex = [point];
  let distance = dot3(point, point);
  const consider = (subset: V3[], weights: number[]) => {
    if (weights.some((weight) => weight < -1e-10)) return;
    const candidate = subset.reduce((sum, p, i) => add3(sum, scale3(p, weights[i])), ZERO);
    const length = dot3(candidate, candidate);
    if (length < distance) {
      point = candidate;
      distance = length;
      simplex = subset.filter((_, i) => weights[i] > 1e-10);
    }
  };
  for (let i = 0; i < points.length; i++) {
    consider([points[i]], [1]);
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const ab = sub3(points[j], a);
      const den = dot3(ab, ab);
      if (den > 1e-16) {
        const u = -dot3(a, ab) / den;
        consider([a, points[j]], [1 - u, u]);
      }
      for (let k = j + 1; k < points.length; k++) {
        const ac = sub3(points[k], a);
        const xx = dot3(ab, ab);
        const xy = dot3(ab, ac);
        const yy = dot3(ac, ac);
        const det = xx * yy - xy * xy;
        if (det > 1e-16) {
          const bx = -dot3(a, ab);
          const by = -dot3(a, ac);
          const u = (bx * yy - by * xy) / det;
          const v = (by * xx - bx * xy) / det;
          consider([a, points[j], points[k]], [1 - u - v, u, v]);
        }
      }
    }
  }
  if (points.length === 4) {
    const a = points[0];
    const ab = sub3(points[1], a);
    const ac = sub3(points[2], a);
    const ad = sub3(points[3], a);
    const det = dot3(ab, cross3(ac, ad));
    if (Math.abs(det) > 1e-16) {
      const opposite = scale3(a, -1);
      const u = dot3(opposite, cross3(ac, ad)) / det;
      const v = dot3(ab, cross3(opposite, ad)) / det;
      const w = dot3(ab, cross3(ac, opposite)) / det;
      if ([u, v, w, 1 - u - v - w].every((weight) => weight >= -1e-10)) {
        return { point: ZERO, simplex: points };
      }
    }
  }
  return { point, simplex };
}

/** GJK on support mappings: no vertices need to be sampled on the robot. */
function intersects(a: Convex, b: Convex): boolean {
  const support = (direction: V3) => sub3(a.support(direction), b.support(scale3(direction, -1)));
  let direction = sub3(b.center, a.center);
  if (dot3(direction, direction) < EPSILON * EPSILON) direction = AXES[0];
  let state = nearest([support(direction)]);
  for (let i = 0; i < 40; i++) {
    const distance = dot3(state.point, state.point);
    if (distance <= EPSILON * EPSILON) return true;
    direction = scale3(state.point, -1);
    const next = support(direction);
    // This supporting plane separates the solids, including thin edges.
    if (dot3(next, direction) < -EPSILON * Math.sqrt(distance)) return false;
    if (distance - dot3(state.point, next) <= 1e-12 * Math.max(1, distance)) return false;
    state = nearest([...state.simplex, next]);
  }
  return dot3(state.point, state.point) <= EPSILON * EPSILON;
}

interface BoardModel { origin: V3; axes: V3[]; solids: LocalConvex[] }
const BOARD_MODELS = new WeakMap<BoardRig, Map<number, BoardModel>>();

function boardModel(board: BoardRig, downwardSweep: number): BoardModel {
  const sweep = Math.max(0, downwardSweep);
  let models = BOARD_MODELS.get(board);
  if (!models) { models = new Map(); BOARD_MODELS.set(board, models); }
  const existing = models.get(sweep);
  if (existing) return existing;
  // point(0) is the rendered origin; center can differ when a pop uses a foot pivot.
  const origin = board.point(ZERO);
  const axes = AXES.map((axis) => board.dir(axis));
  const toLocalDirection = (direction: V3): V3 => ({
    x: dot3(direction, axes[0]), y: dot3(direction, axes[1]), z: dot3(direction, axes[2]),
  });
  const toWorld = (point: V3): V3 => add3(origin,
    add3(add3(scale3(axes[0], point.x), scale3(axes[1], point.y)), scale3(axes[2], point.z)));
  const solids = BOARD_SOLIDS.map((solid): LocalConvex => {
    const min = { ...solid.bounds.min };
    const max = { ...solid.bounds.max };
    for (const [i, key] of (['x', 'y', 'z'] as const).entries()) {
      min[key] += Math.min(0, axes[i].y * sweep);
      max[key] += Math.max(0, axes[i].y * sweep);
    }
    return {
      center: add3(toWorld(solid.center), { x: 0, y: sweep / 2, z: 0 }),
      // Minkowski sum with a world-down segment; this does not overgrow x/z.
      support: (direction) => add3(toWorld(solid.support(toLocalDirection(direction))),
        { x: 0, y: direction.y > 0 ? sweep : 0, z: 0 }),
      bounds: { min, max },
    };
  });
  const model = { origin, axes, solids };
  models.set(sweep, model);
  return model;
}

function hitsBoard(board: BoardRig, robot: Convex, clearance: number, downwardSweep: number): boolean {
  const { origin, axes, solids } = boardModel(board, downwardSweep);
  const margin = Math.max(0, clearance);
  const padded: Convex = margin ? {
    center: robot.center,
    support: (direction) => add3(robot.support(direction), scale3(norm3(direction), margin)),
  } : robot;
  const bounds: Bounds = { min: { ...ZERO }, max: { ...ZERO } };
  for (const [i, key] of (['x', 'y', 'z'] as const).entries()) {
    bounds.min[key] = dot3(sub3(padded.support(scale3(axes[i], -1)), origin), axes[i]);
    bounds.max[key] = dot3(sub3(padded.support(axes[i]), origin), axes[i]);
  }
  for (const solid of solids) {
    if ((['x', 'y', 'z'] as const).some((key) => bounds.max[key] < solid.bounds.min[key] - EPSILON
      || bounds.min[key] > solid.bounds.max[key] + EPSILON)) continue;
    if (intersects(padded, solid)) return true;
  }
  return false;
}

/** Full rounded shoe, so upside-down/edge-on decks cannot enter its upper. */
export function shoeIntersectsBoard(board: BoardRig, shoe: Frame3, clearance = 0, downwardSweep = 0): boolean {
  const radius = 3.6;
  return hitsBoard(board, {
    center: shoe.origin,
    support(direction) {
      return add3(shoe.at(
        Math.sign(dot3(direction, shoe.fwd)) * (SHOE_HALF_LENGTH - radius),
        Math.sign(dot3(direction, shoe.up)) * (SHOE_HALF_HEIGHT - radius),
        Math.sign(dot3(direction, shoe.side)) * (6 - radius),
      ), scale3(norm3(direction), radius));
    },
  }, clearance, downwardSweep);
}

/** Convex hull of endpoint balls: the same tapered capsule as Robot3D. */
export function capsuleIntersectsBoard(board: BoardRig, a: V3, b: V3, radiusA: number, radiusB = radiusA, clearance = 0, downwardSweep = 0): boolean {
  return hitsBoard(board, {
    center: scale3(add3(a, b), 0.5),
    support(direction) {
      const length = Math.hypot(direction.x, direction.y, direction.z);
      const useA = dot3(a, direction) + radiusA * length >= dot3(b, direction) + radiusB * length;
      return add3(useA ? a : b, scale3(norm3(direction), useA ? radiusA : radiusB));
    },
  }, clearance, downwardSweep);
}

export interface LegBoardCollision { shoe: boolean; shin: boolean; thigh: boolean }

/** Safety margin inflates the rider, without changing the rendered board. */
export function legBoardCollision(board: BoardRig, leg: LegRig, clearance = 0, downwardSweep = 0): LegBoardCollision {
  return {
    shoe: shoeIntersectsBoard(board, leg.shoe, clearance, downwardSweep),
    shin: capsuleIntersectsBoard(board, leg.knee, leg.ankle, LEG_RADII.knee, LEG_RADII.ankle, clearance, downwardSweep),
    thigh: capsuleIntersectsBoard(board, leg.hip, leg.knee, LEG_RADII.hip, LEG_RADII.knee, clearance, downwardSweep),
  };
}
