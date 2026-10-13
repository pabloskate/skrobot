import { add3, dot3, norm3, scale3, sub3, type V3 } from '../../math';
import { SHOE_HALF_LENGTH } from '../skeleton';
import { ANKLE_HEIGHT, ANKLE_IN_SHOE, SOLE, SOLE_HALF_WIDTH, type BodyDims } from './body';

/**
 * Feet on the ground, as running it out (runOut.ts), stepping out of a roll
 * (stepOut.ts) and the roll itself (rollOut.ts) put them down; and the level
 * ways they point. Coordinates are the physics' (y down), on the street.
 */

export const UP: V3 = { x: 0, y: -1, z: 0 };
/** `v`'s way along the ground. */
export const level = (v: V3): V3 => norm3({ x: v.x, y: 0, z: v.z });
/** The level way right of facing `fwd` (physics frames: side = up × fwd). */
export const rightOf = (fwd: V3): V3 => norm3({ x: -fwd.z, y: 0, z: fwd.x });

/** A level direction turned `deg` about up (toward its right for positive). */
export function turnLevel(dir: V3, deg: number): V3 {
  const r = rightOf(dir);
  const a = (deg * Math.PI) / 180;
  return norm3(add3(scale3(level(dir), Math.cos(a)), scale3(r, Math.sin(a))));
}

/** Furthest the legs reach to a planted foot: the knee never locks. */
export const REACH = 0.965;
/** Feet land this far either side of the hips' line (in hip widths), toes turned out from the way the hips face (degrees). */
export const STEP_WIDTH = 1.25;
export const TOE_OUT = 8;
/**
 * How far (world units, a robot's) the ground under a shoe may bend off one even slope, heel to toe or side to side, before
 * it's an edge (a ledge's, a stair's nose, a curb's) the foot comes down clear of.
 */
const EDGE_BEND = 2;

export interface Footfall {
  foot: 0 | 1;
  on: number;
  /** When it lifts again (Infinity: it stays). */
  off: number;
  /** The shoe's middle, flat on the ground, and the way its toe points (level). */
  at: V3;
  heading: V3;
  /** The last braking step, and the one that comes alongside it. */
  kind: 'step' | 'capture' | 'close';
}

/** A foot down at `on` with its ankle over `ankle` (its height is the ground's), toe pointing `heading`. */
export function footfallAt(ground: (x: number, z: number) => number, foot: 0 | 1, ankle: V3, heading: V3, on: number, kind: Footfall['kind']): Footfall {
  const flat = { x: ankle.x, y: ground(ankle.x, ankle.z) - ANKLE_HEIGHT, z: ankle.z };
  const at = add3(add3(flat, scale3(heading, -ANKLE_IN_SHOE.f)), scale3(UP, -ANKLE_IN_SHOE.u));
  return { foot, on, off: Infinity, at, heading, kind };
}

/** Whether a shoe with its ankle over `ankle`, toe pointing `heading`, would come down across an edge. */
function astride(ground: (x: number, z: number) => number, scale: number, ankle: V3, heading: V3): boolean {
  const mid = add3(ankle, scale3(heading, -ANKLE_IN_SHOE.f));
  const at = (way: V3, d: number) => ground(mid.x + way.x * d, mid.z + way.z * d);
  const bend = (way: V3, d: number) => Math.abs(at(way, d) + at(way, -d) - 2 * at(way, 0));
  return Math.max(bend(heading, SHOE_HALF_LENGTH * scale), bend(rightOf(heading), SOLE_HALF_WIDTH * scale)) > EDGE_BEND * scale;
}

/**
 * A foot doesn't come down across an edge: where the ground under its shoe bends off one even slope, it goes on past the
 * edge along `way` (or back short of it, where that's nearer).
 */
export function clearOfEdges(ground: (x: number, z: number) => number, scale: number, ankle: V3, heading: V3, way: V3): V3 {
  if (!astride(ground, scale, ankle, heading)) return ankle;
  const shoeHalf = SHOE_HALF_LENGTH * scale;
  for (let d = 2 * scale; d <= 2 * shoeHalf; d += 2 * scale) {
    for (const sign of [1, -1]) {
      const moved = add3(ankle, scale3(way, sign * d));
      if (!astride(ground, scale, moved, heading)) return moved;
    }
  }
  return ankle;
}

/**
 * Stopping over one foot (at `by`), the other comes down beside it: out to its own side, a stance's width off, and a little
 * along `way` toward where the body's balance will be (`balance`, its capture point then). Where it lands, and its toe.
 */
export function besideStop(by: V3, balance: V3, foot: 0 | 1, facing: V3, way: V3, body: BodyDims): { at: V3; heading: V3 } {
  const leg = body.thigh + body.shin;
  const shift = Math.max(-0.3 * leg, Math.min(0.3 * leg, dot3(sub3(balance, by), way)));
  const side = foot === 0 ? -1 : 1;
  return {
    at: add3(add3(by, scale3(rightOf(facing), side * 2 * STEP_WIDTH * body.hipHalf)), scale3(way, shift)),
    heading: turnLevel(facing, side * TOE_OUT),
  };
}

/** Where the weight is on a stepping sole with the hips at `p`: on the heel while the foot's ahead, rolling to the ball as they come over it. */
export function heelToToe(f: Footfall, p: V3): V3 {
  const over = dot3(sub3(p, f.at), f.heading);
  return add3(f.at, scale3(f.heading, Math.max(SOLE.heel * 0.9, Math.min(SOLE.toe * 0.6, over))));
}

/** A planted shoe's sole, as its four corners on the ground (x, z): heel to toe, and its width. */
export function soleCorners(f: Footfall): V3[] {
  const r = rightOf(f.heading);
  const out: V3[] = [];
  for (const along of [SOLE.heel, SOLE.toe]) for (const side of [-SOLE.half, SOLE.half]) out.push(add3(add3(f.at, scale3(f.heading, along)), scale3(r, side)));
  return out;
}

/** The point nearest `p` (level) inside the convex hull of `pts`. */
export function within(p: V3, pts: V3[]): V3 {
  // Gift-wrap the hull in (x, z), then clamp to it.
  const hull: V3[] = [];
  let start = pts.reduce((a, b) => (b.x < a.x || (b.x === a.x && b.z < a.z) ? b : a));
  let at = start;
  for (let guard = 0; guard < pts.length + 1; guard++) {
    hull.push(at);
    let next = pts[0] === at ? pts[1] : pts[0];
    for (const q of pts) {
      const cross = (next.x - at.x) * (q.z - at.z) - (next.z - at.z) * (q.x - at.x);
      if (q !== at && cross < 0) next = q;
    }
    at = next;
    if (at === start) break;
  }
  start = hull[0];
  // Inside if on the same side of every edge.
  const n = hull.length;
  let inside = true;
  for (let i = 0; i < n; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % n];
    if ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x) < 0) inside = false;
  }
  if (inside) return p;
  let best = start;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % n];
    const ab = { x: b.x - a.x, z: b.z - a.z };
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.z - a.z) * ab.z) / Math.max(1e-9, ab.x * ab.x + ab.z * ab.z)));
    const q = { x: a.x + ab.x * k, y: p.y, z: a.z + ab.z * k };
    const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}
