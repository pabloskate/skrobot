import { Matrix4, type Bone, type BufferAttribute, type InterleavedBufferAttribute, type Skeleton } from 'three';
import { smoothstep } from '../../math';
import { softFloor } from '../../motion/skeleton';
import type { DeltaMush } from './deltaMush';

/**
 * The tee worn over the jeans, kept outside the legs.
 *
 * The tee hangs from the shoulders and is skinned to the trunk, so nothing in
 * its skinning knows where the legs are: a thigh raised in a crouch, a pop's
 * tuck, or a landing's absorb comes up through its front, and the denim shows
 * through the cotton on one frame and not the next. A real tee is lifted by
 * the thigh instead. Each frame, after the delta mush:
 *
 *  - each leg is read off the jeans as they're posed: how far the denim
 *    stands out from the bone, slice by slice along it and all the way round
 *    (the thigh from hip to knee, the shin from knee to ankle);
 *  - what of the tee hangs over a thigh raised across the body is lifted
 *    along the body's up onto the thigh's top and lies forward along it, the
 *    way a hem rides up a thigh rather than tearing round it; a line up that
 *    only grazes the thigh's side lifts the cloth only a little, so nothing
 *    jumps onto the thigh as it comes past;
 *  - anything still inside a leg is pushed out over it, easing in just
 *    before it touches so it bulges rather than creases;
 *  - how far the tee moved is spread through its neighbors, so it bulges
 *    round a leg instead of tenting, and anything the spreading left inside a
 *    leg is pushed out again;
 *  - the tee's folded-under inside (its hem turned up, and where the suit
 *    tucks it down into the jeans) isn't draped itself: it moves as the cloth
 *    over it does, so a hem lifted onto a thigh carries its inside with it
 *    rather than leaving it to come out through the front.
 *
 * It's all worked out from the pose alone, so a frozen frame, a scrub and
 * playback draw the same cloth.
 */

/** How far the tee stands off the denim (world units), and how softly it starts to give before it touches. */
const CLEAR = 0.6;
const SOFT = 1.5;
/** Passes of spreading a push through the tee's neighbors. */
const SPREAD = 4;
/** Of the height a thigh lifts the tee by, the share it then lies forward along the thigh: the fabric keeps its length. */
const DRAPE_SLIDE = 0.8;
/** The most a thigh lifts the tee by; past it the lift fades out over the last quarter, and a leg only pushes the cloth aside. */
const DRAPE_MAX = 24;
/**
 * A thigh starts to drape the tee as it swings across the body: from sin² of
 * its angle to the body's up of DRAPE_FROM (about 23°, a leg hanging), fully by
 * DRAPE_FROM + DRAPE_FADE (about 45°), so the shirt eases onto a rising thigh.
 */
const DRAPE_FROM = 0.15;
const DRAPE_FADE = 0.35;
/** How far out along a thigh, past the hip joint, the tee is fully resting on it; behind the joint it hangs free. */
const DRAPE_BEHIND = 10;
/** How much of a thigh a line up through the cloth must cross to lift it fully: less (grazing its side) lifts it less. */
const DRAPE_CHORD = 6;
/** Each leg's denim as a grid: slices along the bone, and angles round it. */
const SLICES = 10;
const ANGLES = 24;
/** How much of a denim triangle its bone must carry (the rest is the hips', or the next bone's) for it to be that leg's. */
const CARRIED = 0.75;
/** Over how far (world units) each end of a leg closes, the way a capsule's does, so cloth slipping past an end is eased out rather than thrown. */
const TAPER = 4;
/** Where in a denim triangle it's sampled (barycentric), so a coarse leg still fills every cell of its grid. */
const SAMPLES = [
  [1, 0, 0], [0, 1, 0], [0, 0, 1],
  [1 / 3, 1 / 3, 1 / 3], [2 / 3, 1 / 6, 1 / 6], [1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3],
] as const;
/** How much farther than at rest posed denim may stand out from its bone (a thigh's seat bulges as the hip folds), for the cheap tests. */
const BULGE = 1.5;
/**
 * The tee's folded-under inside lies at most FOLD (world units) under the
 * cloth over it, and rides the same bones: of their skin weights they share at
 * least SEWN. The trunk under a sleeve shares far less, so it isn't taken for a fold.
 */
const FOLD = 5;
const SEWN = 0.5;
/** Bins round the trunk, and up it (world units), the tee's triangles are sorted into to find what covers each node. */
const COVER_ANGLES = 96;
const COVER_HEIGHT = 2;
const TAU = Math.PI * 2;

/**
 * A leg bone's denim as posed: around the line from the bone's head to the
 * next joint, the farthest the denim stands out from it, in a grid of slices
 * along it and angles round it, measured from the bone's own side so the grid
 * turns with the leg. It runs only as far along the bone as the denim the
 * bone carries does at rest (a thigh's starts a hand's width below the hip
 * joint, where the jeans stop riding with the hips). The grid is only made
 * once cloth comes near the bone: a shin is mostly nowhere near the tee.
 */
class Leg {
  readonly length: number = 0;
  /** The farthest the denim could stand out anywhere along the bone, posed. */
  readonly reach: number;
  /** Where along the bone its denim starts and ends. */
  private readonly start: number;
  private readonly end: number;
  private readonly radius = new Float32Array(SLICES * ANGLES);
  private readonly filled = new Uint8Array(SLICES * ANGLES);
  private readonly origin = new Float64Array(3);
  private readonly axis = new Float64Array(3);
  private readonly side = new Float64Array(3);
  private readonly other = new Float64Array(3);
  /** The cloth's nodes this frame, and whether the grid has been made from them. */
  private nodes: Float32Array | null = null;
  private built = false;
  /** The last point placed by `at`: along the bone, out from it, and round it (radians). */
  s = 0;
  d = 0;
  angle = 0;

  constructor(
    /** Triangles (node triples) of the denim this bone carries. */
    private readonly faces: Uint32Array,
    private readonly skeleton: Skeleton,
    private readonly from: number,
    private readonly to: number,
    rest: Float32Array,
  ) {
    // The bone at rest, from its bind matrix, and how far along it its denim reaches.
    const bind = (i: number) => new Matrix4().copy(skeleton.boneInverses[i]).invert().elements;
    this.place(bind(from), bind(to));
    let start = Infinity, end = -Infinity, reach = 0;
    this.sample(rest, () => {
      start = Math.min(start, this.s);
      end = Math.max(end, this.s);
      reach = Math.max(reach, this.d);
    });
    this.start = Math.max(0, start);
    this.end = Math.min(this.length, end);
    this.reach = reach * BULGE;
  }

  /** The bone's line between two joints' world matrices, and its sides from the first's own x axis, square to it. */
  private place(m: ArrayLike<number>, n: ArrayLike<number>): void {
    const [o, u, e1, e2] = [this.origin, this.axis, this.side, this.other];
    o[0] = m[12]; o[1] = m[13]; o[2] = m[14];
    u[0] = n[12] - o[0]; u[1] = n[13] - o[1]; u[2] = n[14] - o[2];
    const length = Math.hypot(u[0], u[1], u[2]) || 1e-6;
    (this as { length: number }).length = length;
    u[0] /= length; u[1] /= length; u[2] /= length;
    // The bone's own x axis, square to the line, so the grid's angles stay on the same denim.
    const x = m[0] * u[0] + m[1] * u[1] + m[2] * u[2];
    e1[0] = m[0] - u[0] * x; e1[1] = m[1] - u[1] * x; e1[2] = m[2] - u[2] * x;
    const l = Math.hypot(e1[0], e1[1], e1[2]) || 1;
    e1[0] /= l; e1[1] /= l; e1[2] /= l;
    e2[0] = u[1] * e1[2] - u[2] * e1[1];
    e2[1] = u[2] * e1[0] - u[0] * e1[2];
    e2[2] = u[0] * e1[1] - u[1] * e1[0];
  }

  /** Every sample point of the denim's triangles in `p`, placed against the bone (`at`). */
  private sample(p: Float32Array, each: () => void): void {
    const f = this.faces;
    for (let t = 0; t < f.length; t += 3) {
      const i = f[t] * 3, j = f[t + 1] * 3, k = f[t + 2] * 3;
      for (const [a, b, c] of SAMPLES) {
        this.at(
          a * p[i] + b * p[j] + c * p[k],
          a * p[i + 1] + b * p[j + 1] + c * p[k + 1],
          a * p[i + 2] + b * p[j + 2] + c * p[k + 2],
        );
        each();
      }
    }
  }

  /** The bone's line as posed; the denim round it is read off the cloth's nodes `p` when first asked for. */
  pose(p: Float32Array): void {
    const bones = this.skeleton.bones;
    this.place(bones[this.from].matrixWorld.elements, bones[this.to].matrixWorld.elements);
    this.nodes = p;
    this.built = false;
  }

  /** The grid, from the denim as posed. */
  private build(): void {
    this.built = true;
    const p = this.nodes;
    if (!p) return;
    const r = this.radius;
    const filled = this.filled;
    r.fill(0);
    filled.fill(0);
    const span = this.end - this.start;
    this.sample(p, () => {
      const slice = Math.floor(((this.s - this.start) / span) * SLICES);
      if (slice < 0 || slice >= SLICES) return;
      const cell = slice * ANGLES + Math.floor((this.angle / TAU) * ANGLES) % ANGLES;
      if (this.d > r[cell]) r[cell] = this.d;
      filled[cell] = 1;
    });
    // A cell no denim fell in takes the nearest filled cells round its slice, and a
    // slice with none at all the nearest slice's: the grid is a closed surface.
    for (let s = 0; s < SLICES; s++) {
      const row = s * ANGLES;
      let any = -1;
      for (let a = 0; a < ANGLES; a++) if (filled[row + a]) any = a;
      if (any < 0) continue;
      for (let a = 0; a < ANGLES; a++) {
        if (filled[row + a]) continue;
        let back = 1, ahead = 1;
        while (!filled[row + ((a - back + ANGLES) % ANGLES)]) back++;
        while (!filled[row + ((a + ahead) % ANGLES)]) ahead++;
        const lo = r[row + ((a - back + ANGLES) % ANGLES)], hi = r[row + ((a + ahead) % ANGLES)];
        r[row + a] = lo + ((hi - lo) * back) / (back + ahead);
      }
    }
    for (let s = 0; s < SLICES; s++) {
      if (filled.subarray(s * ANGLES, (s + 1) * ANGLES).some(Boolean)) continue;
      for (let k = 1; k < SLICES; k++) {
        const near = [s - k, s + k].find((q) => q >= 0 && q < SLICES && filled.subarray(q * ANGLES, (q + 1) * ANGLES).some(Boolean));
        if (near === undefined) continue;
        r.copyWithin(s * ANGLES, near * ANGLES, (near + 1) * ANGLES);
        break;
      }
    }
  }

  /**
   * Whether the line from (x, y, z) along `dir`, as far as `range`, comes within
   * `margin` of the denim's farthest reach round the bone: the cheap test before
   * looking at the denim itself.
   */
  passes(x: number, y: number, z: number, dir: number[], range: number, margin: number): boolean {
    const o = this.origin, u = this.axis;
    const wx = x - o[0], wy = y - o[1], wz = z - o[2];
    const wu = wx * u[0] + wy * u[1] + wz * u[2];
    const du = dir[0] * u[0] + dir[1] * u[1] + dir[2] * u[2];
    // Both square to the bone: the point's offset, and the line's direction.
    const px = wx - u[0] * wu, py = wy - u[1] * wu, pz = wz - u[2] * wu;
    const ex = dir[0] - u[0] * du, ey = dir[1] - u[1] * du, ez = dir[2] - u[2] * du;
    const ee = ex * ex + ey * ey + ez * ez;
    const t = ee > 1e-9 ? Math.max(0, Math.min(range, -(px * ex + py * ey + pz * ez) / ee)) : 0;
    const r = this.reach + margin;
    return (px + ex * t) ** 2 + (py + ey * t) ** 2 + (pz + ez * t) ** 2 <= r * r;
  }

  /** Place a point against the bone: `s` along it, `d` out from it, `angle` round it. */
  at(x: number, y: number, z: number): void {
    const o = this.origin, u = this.axis, e1 = this.side, e2 = this.other;
    const px = x - o[0], py = y - o[1], pz = z - o[2];
    this.s = px * u[0] + py * u[1] + pz * u[2];
    const a = px * e1[0] + py * e1[1] + pz * e1[2];
    const b = px * e2[0] + py * e2[1] + pz * e2[2];
    this.d = Math.hypot(a, b);
    const angle = Math.atan2(b, a);
    this.angle = angle < 0 ? angle + TAU : angle;
  }

  /** How far the denim stands out at the last point placed, between the grid's cells, closing at its ends; -1 past them. */
  surface(): number {
    if (this.s <= this.start || this.s >= this.end) return -1;
    if (!this.built) {
      // Making the grid places every sample; put back the point being asked about.
      const { s, d, angle } = this;
      this.build();
      this.s = s;
      this.d = d;
      this.angle = angle;
    }
    const close = smoothstep((this.s - this.start) / TAPER) * smoothstep((this.end - this.s) / TAPER);
    const fs = Math.min(SLICES - 1, Math.max(0, ((this.s - this.start) / (this.end - this.start)) * SLICES - 0.5));
    const s0 = Math.floor(fs), s1 = Math.min(SLICES - 1, s0 + 1), ws = fs - s0;
    const fa = (this.angle / TAU) * ANGLES - 0.5;
    const a0 = (Math.floor(fa) + ANGLES) % ANGLES, a1 = (a0 + 1) % ANGLES, wa = fa - Math.floor(fa);
    const r = this.radius;
    const lo = r[s0 * ANGLES + a0] + (r[s0 * ANGLES + a1] - r[s0 * ANGLES + a0]) * wa;
    const hi = r[s1 * ANGLES + a0] + (r[s1 * ANGLES + a1] - r[s1 * ANGLES + a0]) * wa;
    return (lo + (hi - lo) * ws) * close;
  }

  /** Whether a point is inside the denim, with the tee's standoff. */
  inside(x: number, y: number, z: number): boolean {
    this.at(x, y, z);
    const r = this.surface();
    return r > 0 && this.d < r + CLEAR;
  }

  /** The bone's direction (unit). */
  get dir(): Float64Array {
    return this.axis;
  }

  /** Push the node at `k` out of the denim, easing in just before it touches. */
  pushOut(p: Float32Array, k: number): void {
    // Nowhere near: past an end, or farther out than the denim reaches anywhere.
    const o = this.origin, u = this.axis;
    const px = p[k] - o[0], py = p[k + 1] - o[1], pz = p[k + 2] - o[2];
    const along = px * u[0] + py * u[1] + pz * u[2];
    if (along <= this.start || along >= this.end) return;
    const out = this.reach + CLEAR + SOFT;
    if (px * px + py * py + pz * pz - along * along >= out * out) return;
    this.at(p[k], p[k + 1], p[k + 2]);
    const r = this.surface();
    if (r <= 0 || this.d >= r + CLEAR + SOFT || this.d < 1e-4) return;
    const to = softFloor(this.d, r + CLEAR, SOFT);
    if (to <= this.d) return;
    const cx = o[0] + u[0] * this.s, cy = o[1] + u[1] * this.s, cz = o[2] + u[2] * this.s;
    const scale = to / this.d;
    p[k] = cx + (p[k] - cx) * scale;
    p[k + 1] = cy + (p[k + 1] - cy) * scale;
    p[k + 2] = cz + (p[k + 2] - cz) * scale;
  }
}

/**
 * The tee's folded-under inside, from the rest pose: each node with more of the
 * tee over it, looking straight out from the trunk's axis, within FOLD and
 * skinned alike. For each, the triangle of the outside over it (its nodes) and
 * where in it the line out crosses (barycentric). Of what covers a node, only
 * triangles of the outside count, so every fold hangs off cloth that is draped.
 */
function foldedUnder(mush: DeltaMush, isTee: Uint8Array, axisX: number, axisZ: number) {
  const { rest: p, faces: f, joints, weights } = mush;
  const sewn = (a: number, b: number) => {
    let shared = 0;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) if (joints[a * 4 + i] === joints[b * 4 + j]) shared += Math.min(weights[a * 4 + i], weights[b * 4 + j]);
    }
    return shared;
  };
  const around = (k: number) => {
    const angle = Math.atan2(p[k * 3 + 2] - axisZ, p[k * 3] - axisX);
    return angle < 0 ? angle + TAU : angle;
  };
  // The tee's triangles, binned by the angles round the axis and the heights each spans.
  let low = Infinity;
  for (let k = 0; k < mush.nodes; k++) if (isTee[k]) low = Math.min(low, p[k * 3 + 1]);
  const bins = new Map<number, number[]>();
  const width = TAU / COVER_ANGLES;
  for (let t = 0; t < f.length; t += 3) {
    if (!isTee[f[t]] || !isTee[f[t + 1]] || !isTee[f[t + 2]]) continue;
    const a0 = around(f[t]);
    let lo = a0, hi = a0, bottom = Infinity, top = -Infinity;
    for (let v = 0; v < 3; v++) {
      let a = around(f[t + v]) - a0;
      if (a > Math.PI) a -= TAU;
      else if (a < -Math.PI) a += TAU;
      lo = Math.min(lo, a0 + a);
      hi = Math.max(hi, a0 + a);
      bottom = Math.min(bottom, p[f[t + v] * 3 + 1]);
      top = Math.max(top, p[f[t + v] * 3 + 1]);
    }
    for (let row = Math.floor((bottom - low) / COVER_HEIGHT); row <= Math.floor((top - low) / COVER_HEIGHT); row++) {
      for (let col = Math.floor(lo / width); col <= Math.floor(hi / width); col++) {
        const key = row * COVER_ANGLES + (((col % COVER_ANGLES) + COVER_ANGLES) % COVER_ANGLES);
        const bin = bins.get(key);
        if (bin) bin.push(t);
        else bins.set(key, [t]);
      }
    }
  }
  // The nearest triangle over node k (that `counts`) the line out from the axis crosses within FOLD, and where.
  const crossed = { t: -1, u: 0, v: 0 };
  const over = (k: number, counts: (t: number) => boolean) => {
    const ox = p[k * 3], oy = p[k * 3 + 1], oz = p[k * 3 + 2];
    const out = Math.hypot(ox - axisX, oz - axisZ) || 1;
    const dx = (ox - axisX) / out, dz = (oz - axisZ) / out;
    let best = FOLD;
    crossed.t = -1;
    const key = Math.floor((oy - low) / COVER_HEIGHT) * COVER_ANGLES + Math.min(COVER_ANGLES - 1, Math.floor(around(k) / width));
    for (const t of bins.get(key) ?? []) {
      const i = f[t] * 3, j = f[t + 1] * 3, l = f[t + 2] * 3;
      if (f[t] === k || f[t + 1] === k || f[t + 2] === k) continue;
      // Möller–Trumbore, for the level line (dx, 0, dz).
      const e1x = p[j] - p[i], e1y = p[j + 1] - p[i + 1], e1z = p[j + 2] - p[i + 2];
      const e2x = p[l] - p[i], e2y = p[l + 1] - p[i + 1], e2z = p[l + 2] - p[i + 2];
      const qx = -dz * e2y, qy = dz * e2x - dx * e2z, qz = dx * e2y;
      const det = e1x * qx + e1y * qy + e1z * qz;
      if (Math.abs(det) < 1e-9) continue;
      const sx = ox - p[i], sy = oy - p[i + 1], sz = oz - p[i + 2];
      const u = (sx * qx + sy * qy + sz * qz) / det;
      if (u < 0 || u > 1) continue;
      const rx = sy * e1z - sz * e1y, ry = sz * e1x - sx * e1z, rz = sx * e1y - sy * e1x;
      const v = (dx * rx + dz * rz) / det;
      if (v < 0 || u + v > 1) continue;
      const along = (e2x * rx + e2y * ry + e2z * rz) / det;
      if (along <= 1e-3 || along >= best || !counts(t)) continue;
      best = along;
      crossed.t = t;
      crossed.u = u;
      crossed.v = v;
    }
    return crossed.t >= 0;
  };
  const alike = (k: number) => (t: number) => sewn(k, f[t]) >= SEWN && sewn(k, f[t + 1]) >= SEWN && sewn(k, f[t + 2]) >= SEWN;
  const folded = new Uint8Array(mush.nodes);
  for (let k = 0; k < mush.nodes; k++) if (isTee[k] && over(k, alike(k))) folded[k] = 1;
  const under: number[] = [], cover: number[] = [], weight: number[] = [];
  for (let k = 0; k < mush.nodes; k++) {
    if (!folded[k]) continue;
    const same = alike(k);
    if (!over(k, (t) => !folded[f[t]] && !folded[f[t + 1]] && !folded[f[t + 2]] && same(t))) {
      // Only more folds over it, nothing of the outside within reach: it's draped as the outside is.
      folded[k] = 0;
      continue;
    }
    const t = crossed.t;
    under.push(k);
    cover.push(f[t], f[t + 1], f[t + 2]);
    weight.push(1 - crossed.u - crossed.v, crossed.u, crossed.v);
  }
  return { folded, under: Uint32Array.from(under), cover: Uint32Array.from(cover), weight: Float32Array.from(weight) };
}

/** The frame of the triangle of nodes a, b, c (offsets into `p`) into `f`: along its edge ab, across it, and the way it faces. */
function frameOf(p: Float32Array, a: number, b: number, c: number, f: Float64Array): void {
  const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
  const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const n = Math.hypot(nx, ny, nz) || 1;
  const u = Math.hypot(ux, uy, uz) || 1;
  nx /= n; ny /= n; nz /= n;
  f[0] = ux / u; f[1] = uy / u; f[2] = uz / u;
  f[3] = ny * f[2] - nz * f[1]; f[4] = nz * f[0] - nx * f[2]; f[5] = nx * f[1] - ny * f[0];
  f[6] = nx; f[7] = ny; f[8] = nz;
}

/** The legs and tee of one outfit (a DeltaMush over the skater's clothes). */
export class TeeDrape {
  private readonly mush: DeltaMush;
  /** The tee's outside, which is draped; the rest are denim, or the tee's folded-under inside. */
  private readonly outside: Uint32Array;
  private readonly isOutside: Uint8Array;
  /** The tee's folded-under inside, and for each, the outside's triangle over it and where under it (barycentric). */
  private readonly under: Uint32Array;
  private readonly cover: Uint32Array;
  private readonly coverWeight: Float32Array;
  private readonly thighs: Leg[];
  private readonly shins: Leg[];
  private readonly root: Bone;
  private readonly neck: Bone;
  private readonly skinned: Float32Array;
  private readonly shift: Float32Array;
  private readonly spread: Float32Array;
  /** A cover's frame (along an edge, across, and facing), skinned and draped. */
  private readonly before = new Float64Array(9);
  private readonly after = new Float64Array(9);

  /**
   * `uv` tells the tee (its UVs' top half) from the jeans; `bones` is the
   * skeleton the cloth is skinned to, by MakeHuman's bone names.
   */
  constructor(mush: DeltaMush, uv: BufferAttribute | InterleavedBufferAttribute, skeleton: Skeleton) {
    this.mush = mush;
    const nodes = mush.nodes;
    const isTee = new Uint8Array(nodes);
    for (let n = 0; n < nodes; n++) isTee[n] = uv.getY(mush.first[n]) < 0.5 ? 1 : 0;
    const bones = skeleton.bones;
    const index = new Map(bones.map((b, i) => [b.name.replace(/\./g, ''), i]));
    const bone = (name: string) => {
      const i = index.get(name);
      if (i === undefined) throw new Error(`skater skeleton has no bone ${name}`);
      return i;
    };
    // A denim triangle belongs to the bone pair that carries most of it.
    const faces = (names: string[]) => {
      const ids = new Set(names.map(bone));
      const share = (n: number) => {
        let w = 0;
        for (let k = 0; k < 4; k++) if (ids.has(mush.joints[n * 4 + k])) w += mush.weights[n * 4 + k];
        return w;
      };
      const out: number[] = [];
      const f = mush.faces;
      for (let t = 0; t < f.length; t += 3) {
        if (isTee[f[t]] || isTee[f[t + 1]] || isTee[f[t + 2]]) continue;
        if (share(f[t]) + share(f[t + 1]) + share(f[t + 2]) >= 3 * CARRIED) out.push(f[t], f[t + 1], f[t + 2]);
      }
      return Uint32Array.from(out);
    };
    const leg = (carriers: string[], from: string, to: string) => new Leg(faces(carriers), skeleton, bone(from), bone(to), mush.rest);
    this.thighs = ['L', 'R'].map((s) => leg([`upperleg01${s}`, `upperleg02${s}`], `upperleg01${s}`, `lowerleg01${s}`));
    this.shins = ['L', 'R'].map((s) => leg([`lowerleg01${s}`, `lowerleg02${s}`], `lowerleg01${s}`, `foot${s}`));
    this.root = bones[bone('root')];
    this.neck = bones[bone('neck01')];
    // The trunk's axis at rest: straight up through the hips.
    const hips = new Matrix4().copy(skeleton.boneInverses[bone('root')]).invert().elements;
    const { folded, under, cover, weight } = foldedUnder(mush, isTee, hips[12], hips[14]);
    this.isOutside = isTee.map((tee, n) => (tee && !folded[n] ? 1 : 0));
    this.outside = Uint32Array.from({ length: nodes }, (_, n) => n).filter((n) => this.isOutside[n]);
    this.under = under;
    this.cover = cover;
    this.coverWeight = weight;
    this.skinned = new Float32Array(nodes * 3);
    this.shift = new Float32Array(nodes * 3);
    this.spread = new Float32Array(nodes * 3);
  }

  /** Move the tee's nodes (world positions, as DeltaMush.update hands them) off the legs. */
  fit(p: Float32Array): void {
    const legs = [...this.thighs, ...this.shins];
    for (const leg of legs) leg.pose(p);
    const { outside, skinned, shift, spread, isOutside } = this;
    skinned.set(p);

    // The body's up, the way the tee hangs: from the hips to the base of the neck.
    const r = this.root.matrixWorld.elements, n = this.neck.matrixWorld.elements;
    const up = [n[12] - r[12], n[13] - r[13], n[14] - r[14]];
    const ul = Math.hypot(up[0], up[1], up[2]) || 1;
    up[0] /= ul; up[1] /= ul; up[2] /= ul;

    for (const thigh of this.thighs) {
      const u = thigh.dir;
      const across = 1 - (u[0] * up[0] + u[1] * up[1] + u[2] * up[2]) ** 2;
      const fade = smoothstep((across - DRAPE_FROM) / DRAPE_FADE);
      if (fade <= 0) continue;
      for (const node of outside) {
        const k = node * 3;
        const lift = this.liftOnto(thigh, p[k], p[k + 1], p[k + 2], up) * fade;
        if (lift <= 0) continue;
        let x = p[k] + up[0] * lift, y = p[k + 1] + up[1] * lift, z = p[k + 2] + up[2] * lift;
        // Lay it forward along the thigh by most of the height it came up, then back onto the top there.
        thigh.at(x, y, z);
        const slide = Math.max(0, Math.min(thigh.length - thigh.s, lift * DRAPE_SLIDE));
        x += u[0] * slide; y += u[1] * slide; z += u[2] * slide;
        const rise = this.liftOnto(thigh, x, y, z, up) * fade;
        p[k] = x + up[0] * rise;
        p[k + 1] = y + up[1] * rise;
        p[k + 2] = z + up[2] * rise;
      }
    }
    for (const node of outside) for (const leg of legs) leg.pushOut(p, node * 3);

    // Cloth spreads a push: smooth how far each node moved over its neighbors,
    // so the tee bulges round a leg rather than fraying into spikes where
    // neighbors were pushed different ways. Then make sure the smoothing left
    // nothing inside a leg.
    const { offsets, neighbors } = this.mush;
    shift.fill(0);
    for (const node of outside) {
      const k = node * 3;
      shift[k] = p[k] - skinned[k];
      shift[k + 1] = p[k + 1] - skinned[k + 1];
      shift[k + 2] = p[k + 2] - skinned[k + 2];
    }
    for (let pass = 0; pass < SPREAD; pass++) {
      for (const node of outside) {
        let sx = 0, sy = 0, sz = 0, count = 0;
        for (let e = offsets[node]; e < offsets[node + 1]; e++) {
          const j = neighbors[e];
          if (!isOutside[j]) continue;
          sx += shift[j * 3];
          sy += shift[j * 3 + 1];
          sz += shift[j * 3 + 2];
          count++;
        }
        const k = node * 3;
        const c = count || 1;
        spread[k] = 0.5 * shift[k] + (0.5 * sx) / c;
        spread[k + 1] = 0.5 * shift[k + 1] + (0.5 * sy) / c;
        spread[k + 2] = 0.5 * shift[k + 2] + (0.5 * sz) / c;
      }
      for (const node of outside) {
        const k = node * 3;
        shift[k] = spread[k];
        shift[k + 1] = spread[k + 1];
        shift[k + 2] = spread[k + 2];
      }
    }
    for (const node of outside) {
      const k = node * 3;
      p[k] = skinned[k] + shift[k];
      p[k + 1] = skinned[k + 1] + shift[k + 1];
      p[k + 2] = skinned[k + 2] + shift[k + 2];
      for (const leg of legs) leg.pushOut(p, k);
    }

    // The folded-under inside moves with the outside over it, turning as it turns
    // (a hem laid forward along a thigh), so it stays just as far under it.
    const { under, cover, coverWeight, before, after } = this;
    for (let i = 0; i < under.length; i++) {
      const k = under[i] * 3;
      const a = cover[i * 3] * 3, b = cover[i * 3 + 1] * 3, c = cover[i * 3 + 2] * 3;
      const wa = coverWeight[i * 3], wb = coverWeight[i * 3 + 1], wc = coverWeight[i * 3 + 2];
      frameOf(skinned, a, b, c, before);
      frameOf(p, a, b, c, after);
      // Where it lies from the point of the cover over it, in the cover's frame as skinned.
      const ox = skinned[k] - wa * skinned[a] - wb * skinned[b] - wc * skinned[c];
      const oy = skinned[k + 1] - wa * skinned[a + 1] - wb * skinned[b + 1] - wc * skinned[c + 1];
      const oz = skinned[k + 2] - wa * skinned[a + 2] - wb * skinned[b + 2] - wc * skinned[c + 2];
      const along = ox * before[0] + oy * before[1] + oz * before[2];
      const across = ox * before[3] + oy * before[4] + oz * before[5];
      const depth = ox * before[6] + oy * before[7] + oz * before[8];
      for (let e = 0; e < 3; e++) {
        p[k + e] = wa * p[a + e] + wb * p[b + e] + wc * p[c + e] + along * after[e] + across * after[3 + e] + depth * after[6 + e];
      }
    }
  }

  /**
   * How deep the tee's outside sits in a leg at its deepest (world units;
   * negative: clear of every leg), the legs read off `p`. Its folded-under
   * inside lies under the outside, so where the outside rests on a leg it's in it.
   */
  deepest(p: Float32Array): number {
    const legs = [...this.thighs, ...this.shins];
    for (const leg of legs) leg.pose(p);
    let most = -Infinity;
    for (const node of this.outside) {
      for (const leg of legs) {
        leg.at(p[node * 3], p[node * 3 + 1], p[node * 3 + 2]);
        const r = leg.surface();
        if (r > 0) most = Math.max(most, r - leg.d);
      }
    }
    return most;
  }

  /**
   * How far up (along `up`) cloth at (x, y, z) goes to rest on the thigh's top:
   * where a line up through it leaves the denim (with the tee's standoff), eased
   * in by how much of the thigh the line crosses (grazing its side lifts little),
   * how far past the hip joint it is (behind it the tee hangs free), and out as
   * the lift nears the most a thigh lifts cloth by. Zero for cloth already on top
   * or clear of it.
   */
  private liftOnto(thigh: Leg, x: number, y: number, z: number, up: number[]): number {
    if (!thigh.passes(x, y, z, up, DRAPE_MAX, CLEAR)) return 0;
    thigh.at(x, y, z);
    const front = smoothstep(thigh.s / DRAPE_BEHIND);
    if (front <= 0 || thigh.s > thigh.length + DRAPE_MAX) return 0;
    const inside = (t: number) => thigh.inside(x + up[0] * t, y + up[1] * t, z + up[2] * t);
    // The top: the highest point of the line that is in the denim, then narrowed down.
    const step = 1;
    let top = -1;
    for (let t = DRAPE_MAX; t >= 0; t -= step) {
      if (inside(t)) {
        top = t;
        break;
      }
    }
    if (top < 0) return 0;
    let lo = top, hi = Math.min(DRAPE_MAX, top + step);
    if (top + step <= DRAPE_MAX) {
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        if (inside(mid)) lo = mid;
        else hi = mid;
      }
    }
    const exit = (lo + hi) / 2;
    // Where the line comes into the denim, below: how much of the thigh it crosses.
    let entry = top;
    while (entry > top - DRAPE_CHORD && inside(entry - step)) entry -= step;
    if (entry > top - DRAPE_CHORD) {
      let a = entry - step, b = entry;
      for (let i = 0; i < 6; i++) {
        const mid = (a + b) / 2;
        if (inside(mid)) b = mid;
        else a = mid;
      }
      entry = (a + b) / 2;
    }
    const chord = smoothstep((exit - entry) / DRAPE_CHORD);
    const deep = 1 - smoothstep((exit - 0.75 * DRAPE_MAX) / (0.25 * DRAPE_MAX));
    return exit * chord * front * deep;
  }
}
