import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import type { BufferGeometry } from 'three';
import { DEFAULT_SCENE_CAMERA, type SceneCamera, type TripodId } from '../../camera/camera';
import { resolveSkateStyle } from '../../motion/style';
import { planStage, stageFrame } from '../../stage/stage';
import { sceneNear } from '../../three/depth';
import { buildLeapOfFaithGeometry, LeapOfFaith3D } from './leapOfFaith3d';

type V = [number, number, number];
interface Tri {
  id: number; mesh: string; a: V; b: V; c: V; n: V; d: number;
  ink: number; prio: number; color: V; min: V; max: V;
}

function load(geometry: BufferGeometry, mesh: string, out: Tri[]) {
  const pos = geometry.getAttribute('position');
  const info = geometry.getAttribute('aInfo');
  const col = geometry.getAttribute('aColor');
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const p = [0, 1, 2].map(k => [pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)] as V);
    const u: V = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const v: V = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const c: V = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...c);
    if (len < 1e-9) continue;
    const n: V = [c[0] / len, c[1] / len, c[2] / len];
    out.push({
      id: out.length, mesh, a: p[0], b: p[1], c: p[2], n, d: n[0] * p[0][0] + n[1] * p[0][1] + n[2] * p[0][2],
      ink: Math.round(info.getX(i) * 255), prio: Math.round(info.getY(i) * 255),
      color: [col.getX(i), col.getY(i), col.getZ(i)],
      min: [Math.min(p[0][0], p[1][0], p[2][0]), Math.min(p[0][1], p[1][1], p[2][1]), Math.min(p[0][2], p[1][2], p[2][2])],
      max: [Math.max(p[0][0], p[1][0], p[2][0]), Math.max(p[0][1], p[1][1], p[2][1]), Math.max(p[0][2], p[1][2], p[2][2])],
    });
  }
}

// --- a small BVH over the triangles ---
class Bvh {
  bounds: Float32Array; left: Int32Array; right: Int32Array; first: Int32Array; count: Int32Array; order: number[]; n = 0;
  constructor(private readonly tris: Tri[]) {
    const cap = tris.length * 2 + 4;
    this.bounds = new Float32Array(cap * 6); this.left = new Int32Array(cap).fill(-1); this.right = new Int32Array(cap).fill(-1);
    this.first = new Int32Array(cap); this.count = new Int32Array(cap);
    this.order = tris.map((_, i) => i);
    this.build(0, tris.length);
  }
  private build(lo: number, hi: number): number {
    const node = this.n++;
    const b = [1e30, 1e30, 1e30, -1e30, -1e30, -1e30];
    for (let i = lo; i < hi; i++) {
      const t = this.tris[this.order[i]];
      for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], t.min[k]); b[k + 3] = Math.max(b[k + 3], t.max[k]); }
    }
    this.bounds.set(b, node * 6);
    if (hi - lo <= 4) { this.first[node] = lo; this.count[node] = hi - lo; return node; }
    const ext = [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
    const axis = ext[0] > ext[1] && ext[0] > ext[2] ? 0 : ext[1] > ext[2] ? 1 : 2;
    const slice = this.order.slice(lo, hi).sort((p, q) => (this.tris[p].min[axis] + this.tris[p].max[axis]) - (this.tris[q].min[axis] + this.tris[q].max[axis]));
    for (let i = 0; i < slice.length; i++) this.order[lo + i] = slice[i];
    const mid = (lo + hi) >> 1;
    this.left[node] = this.build(lo, mid);
    this.right[node] = this.build(mid, hi);
    return node;
  }
  private hitBox(node: number, o: V, inv: V, tmax: number) {
    const bb = this.bounds; const k = node * 6;
    let t0 = 0, t1 = tmax;
    for (let a = 0; a < 3; a++) {
      let n = (bb[k + a] - o[a]) * inv[a], f = (bb[k + 3 + a] - o[a]) * inv[a];
      if (n > f) { const s = n; n = f; f = s; }
      if (n > t0) t0 = n; if (f < t1) t1 = f;
      if (t0 > t1) return false;
    }
    return true;
  }
  /** Every hit with t < tmax, calling visit(tri, t). */
  cast(o: V, dir: V, tmax: number, visit: (tri: Tri, t: number) => void) {
    const inv: V = [1 / (dir[0] || 1e-12), 1 / (dir[1] || 1e-12), 1 / (dir[2] || 1e-12)];
    const stack = [0];
    while (stack.length) {
      const node = stack.pop()!;
      if (!this.hitBox(node, o, inv, tmax)) continue;
      if (this.left[node] < 0) {
        for (let i = this.first[node]; i < this.first[node] + this.count[node]; i++) {
          const tri = this.tris[this.order[i]];
          const t = intersect(tri, o, dir);
          if (t > 1e-4 && t < tmax) visit(tri, t);
        }
      } else { stack.push(this.left[node], this.right[node]); }
    }
  }
}
function intersect(t: Tri, o: V, d: V): number {
  const e1: V = [t.b[0] - t.a[0], t.b[1] - t.a[1], t.b[2] - t.a[2]];
  const e2: V = [t.c[0] - t.a[0], t.c[1] - t.a[1], t.c[2] - t.a[2]];
  const p: V = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det;
  const s: V = [o[0] - t.a[0], o[1] - t.a[1], o[2] - t.a[2]];
  const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv;
  if (u < -1e-7 || u > 1 + 1e-7) return -1;
  const q: V = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
  if (v < -1e-7 || u + v > 1 + 1e-7) return -1;
  return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
}

const same = (a: Tri, b: Tri) => a.ink === b.ink && a.prio === b.prio && Math.hypot(a.color[0] - b.color[0], a.color[1] - b.color[1], a.color[2] - b.color[2]) < 0.012;
const label = (t: Tri) => `${t.mesh}#${t.ink} n=(${t.n.map(v => v.toFixed(2)).join(',')}) d=${t.d.toFixed(1)} c=${t.color.map(v => v.toFixed(2)).join('/')} @x${Math.round((t.min[0] + t.max[0]) / 2 / 50) * 50},y${Math.round((t.min[1] + t.max[1]) / 2 / 50) * 50},z${Math.round((t.min[2] + t.max[2]) / 2 / 50) * 50}`;

it('find visible z-fighting from the real cameras', () => {
  const built = buildLeapOfFaithGeometry();
  const tris: Tri[] = [];
  load(built.ground, 'ground', tris);
  load(built.props, 'props', tris);
  const bvh = new Bvh(tris);
  const spot = new LeapOfFaith3D();

  const stage = planStage(
    { id: 'Kickflip', name: 'Kickflip', base: 'Kickflip', stance: 'regular' },
    { set: 'leap-of-faith', landed: true, riderStance: 'regular', style: resolveSkateStyle({ popHeight: 0.45, rotationSpeed: 1, flickStrength: 1 }), skater: 'realistic', fall: 'slam', shankProgress: 0.65 },
  );
  const aspect = 1.24;
  const W = 150, H = Math.round(W / aspect);
  const cameras: { name: string; camera: SceneCamera; zoom: number; tripod: TripodId | null }[] = [];
  cameras.push({ name: 'default', camera: DEFAULT_SCENE_CAMERA, zoom: 1, tripod: null });
  cameras.push({ name: 'user', camera: { yaw: -25.3, pitch: 1.4, lens: 1.4 }, zoom: 0.54, tripod: null });
  for (const yaw of [-70, -45, -26, 0, 30, 60, 100, 140, 180]) for (const pitch of [2, 12, 30]) cameras.push({ name: `y${yaw}p${pitch}`, camera: { yaw, pitch, lens: 1 }, zoom: 1, tripod: null });
  for (const tripod of ['bottom', 'side', 'top'] as TripodId[]) cameras.push({ name: tripod, camera: DEFAULT_SCENE_CAMERA, zoom: 1, tripod });

  type Agg = { a: Tri; b: Tri; hard: number; soft: number; where: string; sample: V };
  const agg = new Map<string, Agg>();
  let rays = 0, flaggedRays = 0, insideRoof = 0;
  const times = Array.from({ length: 5 }, (_, i) => (i / 4) * stage.end);
  for (const cam of cameras) {
    for (const t of times) {
      const frame = stageFrame(stage, t, 1);
      const view = spot.view(frame, cam.camera, cam.zoom, aspect, cam.tripod);
      if (!view) continue;
      const across = frame.stairs!.across;
      const o: V = [view.eye[0] + frame.scroll, view.eye[1], view.eye[2] + across];
      // A crane swung high can end up inside the roof; that is not a view worth judging.
      if (o[1] > 300 && o[1] < 380 && o[0] > -1260 && o[0] < 70 && o[2] > -1700 && o[2] < 450) { insideRoof++; continue; }
      const near = sceneNear(view.distance, false);
      const { left, right, top, bottom } = view.frustum;
      // Rays: a pixel grid, plus one aimed at every triangle's middle and corners (thin strips slip between grid rays).
      const aims: V[] = [];
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const x = left + (right - left) * (i + 0.5) / W, y = top + (bottom - top) * (j + 0.5) / H;
        aims.push([
          view.right[0] * x + view.up[0] * y - view.back[0],
          view.right[1] * x + view.up[1] * y - view.back[1],
          view.right[2] * x + view.up[2] * y - view.back[2],
        ]);
      }
      for (const tri of tris) {
        const mid: V = [(tri.a[0] + tri.b[0] + tri.c[0]) / 3, (tri.a[1] + tri.b[1] + tri.c[1]) / 3, (tri.a[2] + tri.b[2] + tri.c[2]) / 3];
        for (const q of [mid, [(tri.a[0] * 2 + mid[0]) / 3, (tri.a[1] * 2 + mid[1]) / 3, (tri.a[2] * 2 + mid[2]) / 3] as V]) aims.push([q[0] - o[0], q[1] - o[1], q[2] - o[2]]);
      }
      for (const d of aims) {
        const len = Math.hypot(...d); d[0] /= len; d[1] /= len; d[2] /= len;
        const facing0 = -(d[0] * view.back[0] + d[1] * view.back[1] + d[2] * view.back[2]);
        if (facing0 <= 0.05) continue;
        // Only what lands inside the picture.
        const sx = (d[0] * view.right[0] + d[1] * view.right[1] + d[2] * view.right[2]) / facing0;
        const sy = (d[0] * view.up[0] + d[1] * view.up[1] + d[2] * view.up[2]) / facing0;
        if (sx < left || sx > right || sy < bottom || sy > top) continue;
        const facing = -(d[0] * view.back[0] + d[1] * view.back[1] + d[2] * view.back[2]);
        rays++;
        let best = Infinity;
        const hits: { tri: Tri; t: number }[] = [];
        bvh.cast(o, d, 40000, (tri, tt) => { if (tt < best) best = tt; hits.push({ tri, t: tt }); });
        if (!isFinite(best)) continue;
        const z = best * facing;
        const epsFwd = 4 * z * z / (near * 16777216);
        const epsRev = 4 * z * 1.2e-7;
        const near_ = hits.filter(h => (h.t - best) * facing <= Math.max(epsFwd, 1e-3));
        if (near_.length < 2) continue;
        let flagged = false;
        for (let a = 0; a < near_.length && !flagged; a++) for (let b = a + 1; b < near_.length; b++) {
          const A = near_[a].tri, B = near_[b].tri;
          if (A.id === B.id || same(A, B)) continue;
          if (Math.abs(A.n[0] * B.n[0] + A.n[1] * B.n[1] + A.n[2] * B.n[2]) < 0.97) continue;
          const gap = Math.abs(near_[a].t - near_[b].t) * facing;
          const hard = gap <= Math.max(epsRev, 1e-3);
          const [p, q] = A.id < B.id ? [A, B] : [B, A];
          const key = `${label(p)}  <>  ${label(q)}`;
          const rec = agg.get(key) ?? { a: p, b: q, hard: 0, soft: 0, where: cam.name, sample: [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best] as V };
          if (hard) rec.hard++; else rec.soft++;
          agg.set(key, rec);
          flagged = true;
          break;
        }
        if (flagged) flaggedRays++;
      }
    }
  }
  const lines = [`rays=${rays} flagged=${flaggedRays} viewsInsideRoof=${insideRoof}`];
  const sorted = [...agg.entries()].sort((x, y) => (y[1].hard + y[1].soft) - (x[1].hard + x[1].soft));
  for (const [key, r] of sorted.slice(0, 120)) lines.push(`hard=${r.hard} soft=${r.soft} first@${r.where} at(${r.sample.map(v => v.toFixed(0)).join(',')})\n   ${key}`);
  writeFileSync('/tmp/leap_zfight2.txt', lines.join('\n'));
  spot.dispose();
}, 600_000);
