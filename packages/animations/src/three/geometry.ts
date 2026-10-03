import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import type { BoxSpec } from '../scene/draw';
import { THICKNESS, TIP_X, kickY } from '../scene/deck';
import { DECK_HALF_WIDTH } from '../scene/skeleton';
import type { Vec3 } from './view';

/**
 * Geometry for TrickScene3D, built to the same dimensions the SVG renderer
 * draws: its rounded boxes are the hull of eight corner balls (draw.tsx
 * samples exactly that solid's outline), its limbs are the hull of two balls,
 * and the deck follows deck.tsx's popsicle profile. Every solid is built in
 * the local axes the rig gives its frame: x forward, y up, z to the side.
 */

/**
 * A rounded box: the box shrunk by its corner radius, swollen back out by a
 * ball. A taper narrows the forward and side extents toward the base, the way
 * draw.tsx tapers the corners it hulls.
 */
export function roundedBoxGeometry(spec: BoxSpec, segments = 5): BufferGeometry {
  const r = Math.min(spec.r, spec.f, spec.u, spec.s);
  const geometry = new RoundedBoxGeometry(2 * spec.f, 2 * spec.u, 2 * spec.s, segments, r);
  geometry.deleteAttribute('uv');
  const taper = spec.taper ?? 1;
  if (taper !== 1) {
    const pos = geometry.getAttribute('position') as BufferAttribute;
    const nor = geometry.getAttribute('normal') as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const nx = nor.getX(i);
      const ny = nor.getY(i);
      const nz = nor.getZ(i);
      // The corner ball this point sits on, then that corner tapered.
      const cx = pos.getX(i) - nx * r;
      const cy = pos.getY(i) - ny * r;
      const cz = pos.getZ(i) - nz * r;
      const k = taper + (1 - taper) * ((cy / spec.u + 1) / 2);
      pos.setXYZ(i, cx * k + nx * r, cy + ny * r, cz * k + nz * r);
    }
    pos.needsUpdate = true;
  }
  return geometry;
}

/** A convex solid: the hull of `corners`, each swollen into a ball of radius `r` (draw.tsx's solidHull). */
export function solidHullGeometry(corners: ReadonlyArray<readonly [number, number, number]>, r: number): BufferGeometry {
  const dirs: Vector3[] = [];
  const RINGS = 6;
  const SIDES = 12;
  dirs.push(new Vector3(0, 1, 0), new Vector3(0, -1, 0));
  for (let i = 1; i < RINGS; i++) {
    const polar = (Math.PI * i) / RINGS;
    for (let j = 0; j < SIDES; j++) {
      const az = (2 * Math.PI * j) / SIDES;
      dirs.push(new Vector3(Math.sin(polar) * Math.cos(az), Math.cos(polar), Math.sin(polar) * Math.sin(az)));
    }
  }
  const points: Vector3[] = [];
  const normalOf = new Map<Vector3, Vector3>();
  for (const [x, y, z] of corners) {
    for (const d of dirs) {
      const p = new Vector3(x + d.x * r, y + d.y * r, z + d.z * r);
      points.push(p);
      normalOf.set(p, d);
    }
  }
  const hull = new ConvexHull().setFromPoints(points);
  const position: number[] = [];
  const normal: number[] = [];
  for (const face of hull.faces) {
    let edge = face.edge;
    do {
      const p = edge.head().point;
      const n = normalOf.get(p) ?? face.normal;
      position.push(p.x, p.y, p.z);
      normal.push(n.x, n.y, n.z);
      edge = edge.next;
    } while (edge !== face.edge);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  return geometry;
}

const spow = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;

/**
 * A superellipsoid with half extents `half`, then reshaped point by point:
 * `squareness` is its exponent up the side (y) and around the plan (x, z) —
 * near 0 boxy, 1 an ellipsoid. `warp` moves each surface point (the shoe's
 * heel rises, its toe springs up); normals are recomputed after.
 */
export function blobGeometry(
  half: Vec3,
  squareness: { side: number; plan: number },
  warp: (x: number, y: number, z: number) => Vec3 = (x, y, z) => [x, y, z],
  rows = 28,
  cols = 56,
): BufferGeometry {
  const position: number[] = [];
  const at = (eta: number, omega: number) => {
    const ring = spow(Math.cos(eta), squareness.side);
    position.push(...warp(
      half[0] * ring * spow(Math.cos(omega), squareness.plan),
      half[1] * spow(Math.sin(eta), squareness.side),
      half[2] * ring * spow(Math.sin(omega), squareness.plan),
    ));
  };
  // One vertex per pole, so the normals there average every face around it.
  at(-Math.PI / 2, 0);
  for (let i = 1; i < rows; i++) {
    for (let j = 0; j < cols; j++) at(-Math.PI / 2 + (Math.PI * i) / rows, (2 * Math.PI * j) / cols);
  }
  at(Math.PI / 2, 0);
  const top = 1 + (rows - 1) * cols;
  const ringAt = (i: number, j: number) => 1 + (i - 1) * cols + (j % cols);
  const index: number[] = [];
  // Wound counter-clockwise seen from outside, so the outside is what's drawn.
  for (let j = 0; j < cols; j++) {
    index.push(0, ringAt(1, j), ringAt(1, j + 1));
    index.push(top, ringAt(rows - 1, j + 1), ringAt(rows - 1, j));
    for (let i = 1; i < rows - 1; i++) {
      const a = ringAt(i, j);
      const b = ringAt(i, j + 1);
      const c = ringAt(i + 1, j);
      const d = ringAt(i + 1, j + 1);
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// ---------- Limbs ----------

const RADIAL = 18;
const CAP_RINGS = 7;

/**
 * A limb: the hull of a ball of radius `ra` at one end and `rb` at the other
 * (a capsule tapering along its length). Its ends move every frame, so the
 * geometry is rewritten in place by `set` and drawn in world space.
 */
export class Capsule {
  readonly geometry = new BufferGeometry();
  private readonly pos: Float32Array;
  private readonly nor: Float32Array;
  private readonly rings = 2 * (CAP_RINGS + 1);

  constructor() {
    const count = this.rings * RADIAL;
    this.pos = new Float32Array(count * 3);
    this.nor = new Float32Array(count * 3);
    const index: number[] = [];
    for (let ring = 0; ring < this.rings - 1; ring++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = ring * RADIAL + j;
        const b = ring * RADIAL + ((j + 1) % RADIAL);
        const c = a + RADIAL;
        const d = b + RADIAL;
        index.push(a, b, c, b, d, c);
      }
    }
    this.geometry.setIndex(index);
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('normal', new BufferAttribute(this.nor, 3));
  }

  set(a: Vec3, b: Vec3, ra: number, rb: number): void {
    let ux = b[0] - a[0];
    let uy = b[1] - a[1];
    let uz = b[2] - a[2];
    const d = Math.hypot(ux, uy, uz);
    if (d < 1e-6) {
      ux = 0;
      uy = 1;
      uz = 0;
    } else {
      ux /= d;
      uy /= d;
      uz /= d;
    }
    // Two axes square to the limb.
    const ref = Math.abs(uy) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let e1x = uy * ref[2] - uz * ref[1];
    let e1y = uz * ref[0] - ux * ref[2];
    let e1z = ux * ref[1] - uy * ref[0];
    const m = Math.hypot(e1x, e1y, e1z);
    e1x /= m;
    e1y /= m;
    e1z /= m;
    const e2x = uy * e1z - uz * e1y;
    const e2y = uz * e1x - ux * e1z;
    const e2z = ux * e1y - uy * e1x;
    // Where the cone between the balls meets them: normals tip toward the
    // thinner end by the slope of the taper.
    const slope = Math.asin(Math.max(-0.99, Math.min(0.99, d > 1e-6 ? (ra - rb) / d : 0)));
    const seam = Math.PI / 2 + slope;
    let k = 0;
    for (let ring = 0; ring < this.rings; ring++) {
      const onA = ring <= CAP_RINGS;
      const psi = onA ? (seam * ring) / CAP_RINGS : seam + ((Math.PI - seam) * (ring - CAP_RINGS - 1)) / CAP_RINGS;
      const r = onA ? ra : rb;
      const c = onA ? a : b;
      const along = -Math.cos(psi);
      const out = Math.sin(psi);
      for (let j = 0; j < RADIAL; j++) {
        const az = (2 * Math.PI * j) / RADIAL;
        const ca = Math.cos(az) * out;
        const sa = Math.sin(az) * out;
        const nx = ux * along + e1x * ca + e2x * sa;
        const ny = uy * along + e1y * ca + e2y * sa;
        const nz = uz * along + e1z * ca + e2z * sa;
        this.nor[k] = nx;
        this.nor[k + 1] = ny;
        this.nor[k + 2] = nz;
        this.pos[k] = c[0] + nx * r;
        this.pos[k + 1] = c[1] + ny * r;
        this.pos[k + 2] = c[2] + nz * r;
        k += 3;
      }
    }
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('normal').needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
}

// ---------- Deck ----------

const CORNER_R = 9.5;
const DECK_STATIONS = 56;

function deckHalfWidth(x: number): number {
  const ax = Math.abs(x);
  const start = TIP_X - CORNER_R;
  if (ax <= start) return DECK_HALF_WIDTH;
  const u = (ax - start) / CORNER_R;
  return u >= 1 ? 0 : DECK_HALF_WIDTH * Math.sqrt(1 - u * u);
}

/** Deck surfaces, in the order the shader's `kind` attribute numbers them. */
export const DECK_GRIP = 0;
export const DECK_UNDERSIDE = 1;
export const DECK_PLY = 2;

/**
 * The deck in board-local axes (x toward the nose, y up off the grip, z
 * across): grip, underside, and the ply band around the edge, each tagged
 * with its `kind`. Same popsicle as deck.tsx, sampled finer.
 */
export function deckGeometry(): BufferGeometry {
  const h = THICKNESS / 2;
  const st = Array.from({ length: DECK_STATIONS + 1 }, (_, i) => {
    const x = -TIP_X * Math.cos((Math.PI * i) / DECK_STATIONS);
    // Board-local y runs down in the physics; three's runs up.
    return { x, y: -kickY(x), w: deckHalfWidth(x) };
  });
  const position: number[] = [];
  const normal: number[] = [];
  const kind: number[] = [];
  const quad = (pts: Vec3[], n: Vec3[], k: number) => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      position.push(...pts[i]);
      normal.push(...n[i]);
      kind.push(k);
    }
  };
  // Surface normal of the grip at a station: square to the kicked profile.
  const faceNormal = (i: number, up: 1 | -1): Vec3 => {
    const a = st[Math.max(0, i - 1)];
    const b = st[Math.min(DECK_STATIONS, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const m = Math.hypot(dx, dy) || 1;
    return [(-dy / m) * up, (dx / m) * up, 0];
  };
  for (let i = 0; i < DECK_STATIONS; i++) {
    const [a, b] = [st[i], st[i + 1]];
    const [na, nb] = [faceNormal(i, 1), faceNormal(i + 1, 1)];
    quad([[a.x, a.y + h, -a.w], [a.x, a.y + h, a.w], [b.x, b.y + h, b.w], [b.x, b.y + h, -b.w]], [na, na, nb, nb], DECK_GRIP);
    const [da, db] = [faceNormal(i, -1), faceNormal(i + 1, -1)];
    quad([[a.x, a.y - h, -a.w], [b.x, b.y - h, -b.w], [b.x, b.y - h, b.w], [a.x, a.y - h, a.w]], [da, db, db, da], DECK_UNDERSIDE);
  }
  // The ply band: outward along the planform, square to the deck's edge.
  const edgeNormal = (i: number, side: 1 | -1): Vec3 => {
    const a = st[Math.max(0, i - 1)];
    const b = st[Math.min(DECK_STATIONS, i + 1)];
    const dx = b.x - a.x;
    const dw = b.w - a.w;
    const m = Math.hypot(dx, dw) || 1;
    // The edge's tangent turned a quarter turn outward.
    return [-dw / m, 0, (side * dx) / m];
  };
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < DECK_STATIONS; i++) {
      const [a, b] = [st[i], st[i + 1]];
      const [na, nb] = [edgeNormal(i, side), edgeNormal(i + 1, side)];
      const pts: Vec3[] = [
        [a.x, a.y + h, side * a.w], [a.x, a.y - h, side * a.w], [b.x, b.y - h, side * b.w], [b.x, b.y + h, side * b.w],
      ];
      // Wind the quad to face outward on either side.
      if (side === 1) quad(pts, [na, na, nb, nb], DECK_PLY);
      else quad([pts[0], pts[3], pts[2], pts[1]], [na, nb, nb, na], DECK_PLY);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  geometry.setAttribute('kind', new Float32BufferAttribute(kind, 1));
  return geometry;
}

// ---------- Wheels, bars, boxes ----------

/** A wheel: a cylinder on its axle (local z), x and y spanning its face. */
export function wheelGeometry(radius: number, halfWidth: number): BufferGeometry {
  const geometry = new CylinderGeometry(radius, radius, 2 * halfWidth, 32, 1, false);
  geometry.rotateX(Math.PI / 2);
  geometry.deleteAttribute('uv');
  return geometry;
}

/**
 * A box from (x0, y0, z0) to (x1, y1, z1) with a `face` attribute numbering
 * its sides (+x, -x, +y, -y, +z, -z), so each side can be inked on its own.
 */
export function faceBoxGeometry(min: Vec3, max: Vec3): BufferGeometry {
  const geometry = new BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  geometry.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  geometry.deleteAttribute('uv');
  const count = geometry.getAttribute('position').count;
  const face = new Float32Array(count);
  for (const [i, group] of geometry.groups.entries()) {
    const index = geometry.getIndex()!;
    for (let k = group.start; k < group.start + group.count; k++) face[index.getX(k)] = i;
  }
  geometry.setAttribute('face', new BufferAttribute(face, 1));
  return geometry;
}

/**
 * A grid over the front face of a rounded box, lying on its surface (and
 * `lift` off it): what the face screen and eyes are painted on. Spans side
 * (z) `halfS` and up (y) from `u0` to `u1`.
 */
export function frontDecalGeometry(spec: BoxSpec, halfS: number, u0: number, u1: number, lift: number, cells = 28): BufferGeometry {
  const inner = { u: spec.u - spec.r, s: spec.s - spec.r, f: spec.f - spec.r };
  const position: number[] = [];
  const normal: number[] = [];
  const index: number[] = [];
  const cols = cells;
  const rows = Math.max(4, Math.round((cells * (u1 - u0)) / (2 * halfS)));
  for (let i = 0; i <= rows; i++) {
    const u = u0 + ((u1 - u0) * i) / rows;
    for (let j = 0; j <= cols; j++) {
      const s = -halfS + (2 * halfS * j) / cols;
      // The front surface: flat inside the inner box, rounding over its edges.
      const du = Math.max(0, Math.abs(u) - inner.u) * Math.sign(u);
      const ds = Math.max(0, Math.abs(s) - inner.s) * Math.sign(s);
      const df = Math.sqrt(Math.max(0, spec.r * spec.r - du * du - ds * ds));
      const n = [df / spec.r, du / spec.r, ds / spec.r];
      position.push(inner.f + df + n[0] * lift, u + n[1] * lift, s + n[2] * lift);
      normal.push(...n);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  return geometry;
}
