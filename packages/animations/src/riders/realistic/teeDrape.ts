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
 *    leg is pushed out again.
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

/** The legs and tee of one outfit (a DeltaMush over the skater's clothes). */
export class TeeDrape {
  private readonly mush: DeltaMush;
  /** The tee's nodes; the rest are denim. */
  private readonly tee: Uint32Array;
  private readonly isTee: Uint8Array;
  private readonly thighs: Leg[];
  private readonly shins: Leg[];
  private readonly root: Bone;
  private readonly neck: Bone;
  private readonly skinned: Float32Array;
  private readonly shift: Float32Array;
  private readonly spread: Float32Array;

  /**
   * `uv` tells the tee (its UVs' top half) from the jeans; `bones` is the
   * skeleton the cloth is skinned to, by MakeHuman's bone names.
   */
  constructor(mush: DeltaMush, uv: BufferAttribute | InterleavedBufferAttribute, skeleton: Skeleton) {
    this.mush = mush;
    const nodes = mush.nodes;
    this.isTee = new Uint8Array(nodes);
    for (let n = 0; n < nodes; n++) this.isTee[n] = uv.getY(mush.first[n]) < 0.5 ? 1 : 0;
    this.tee = Uint32Array.from({ length: nodes }, (_, n) => n).filter((n) => this.isTee[n]);
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
        if (this.isTee[f[t]] || this.isTee[f[t + 1]] || this.isTee[f[t + 2]]) continue;
        if (share(f[t]) + share(f[t + 1]) + share(f[t + 2]) >= 3 * CARRIED) out.push(f[t], f[t + 1], f[t + 2]);
      }
      return Uint32Array.from(out);
    };
    const leg = (carriers: string[], from: string, to: string) => new Leg(faces(carriers), skeleton, bone(from), bone(to), mush.rest);
    this.thighs = ['L', 'R'].map((s) => leg([`upperleg01${s}`, `upperleg02${s}`], `upperleg01${s}`, `lowerleg01${s}`));
    this.shins = ['L', 'R'].map((s) => leg([`lowerleg01${s}`, `lowerleg02${s}`], `lowerleg01${s}`, `foot${s}`));
    this.root = bones[bone('root')];
    this.neck = bones[bone('neck01')];
    this.skinned = new Float32Array(nodes * 3);
    this.shift = new Float32Array(nodes * 3);
    this.spread = new Float32Array(nodes * 3);
  }

  /** Move the tee's nodes (world positions, as DeltaMush.update hands them) off the legs. */
  fit(p: Float32Array): void {
    const legs = [...this.thighs, ...this.shins];
    for (const leg of legs) leg.pose(p);
    const { tee, skinned, shift, spread, isTee } = this;
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
      for (const node of tee) {
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
    for (const node of tee) for (const leg of legs) leg.pushOut(p, node * 3);

    // Cloth spreads a push: smooth how far each node moved over its neighbors,
    // so the tee bulges round a leg rather than fraying into spikes where
    // neighbors were pushed different ways. Then make sure the smoothing left
    // nothing inside a leg.
    const { offsets, neighbors } = this.mush;
    shift.fill(0);
    for (const node of tee) {
      const k = node * 3;
      shift[k] = p[k] - skinned[k];
      shift[k + 1] = p[k + 1] - skinned[k + 1];
      shift[k + 2] = p[k + 2] - skinned[k + 2];
    }
    for (let pass = 0; pass < SPREAD; pass++) {
      for (const node of tee) {
        let sx = 0, sy = 0, sz = 0, count = 0;
        for (let e = offsets[node]; e < offsets[node + 1]; e++) {
          const j = neighbors[e];
          if (!isTee[j]) continue;
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
      for (const node of tee) {
        const k = node * 3;
        shift[k] = spread[k];
        shift[k + 1] = spread[k + 1];
        shift[k + 2] = spread[k + 2];
      }
    }
    for (const node of tee) {
      const k = node * 3;
      p[k] = skinned[k] + shift[k];
      p[k + 1] = skinned[k + 1] + shift[k + 1];
      p[k + 2] = skinned[k + 2] + shift[k + 2];
      for (const leg of legs) leg.pushOut(p, k);
    }
  }

  /** How deep the tee's deepest node sits in a leg (world units; negative: clear of every leg), the legs read off `p`. */
  deepest(p: Float32Array): number {
    const legs = [...this.thighs, ...this.shins];
    for (const leg of legs) leg.pose(p);
    let most = -Infinity;
    for (const node of this.tee) {
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
