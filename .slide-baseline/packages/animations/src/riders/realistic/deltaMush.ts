import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Matrix4, type SkinnedMesh } from 'three';

/**
 * Delta Mush (Mancewicz et al., 2014) for the skater's clothes.
 *
 * Linear blend skinning pinches cloth wherever a joint bends a long way from
 * the rest pose: the back of a bent knee caves in, a thigh bulges, an armpit
 * folds into the chest. Delta Mush removes those artifacts while keeping
 * the garment's own detail:
 *
 *  - at rest, the mesh is relaxed (each point drawn toward its neighbors'
 *    average a few times) and every point's offset from its relaxed self is
 *    stored in a frame on the relaxed surface (its "delta");
 *  - each frame, the skinned mesh is relaxed the same way — which irons out
 *    the skinning's pinches along with the detail — and each point's delta
 *    is added back in the relaxed surface's new frame, restoring folds,
 *    seams and pockets on a smooth deformation.
 *
 * Points sharing a position (UV seams) are welded into one node, so the
 * relaxing can't tear the mesh open along a seam. The result is a plain
 * world-space geometry, updated on the CPU each frame; `rest` carries each
 * point's rest position for the materials.
 */
export class DeltaMush {
  readonly geometry = new BufferGeometry();
  private readonly source: SkinnedMesh;
  private readonly iterations: number;
  /** Per vertex: its node; per node: one vertex. */
  private readonly nodeOf: Uint32Array;
  readonly first: Uint32Array;
  readonly nodes: number;
  /** Node neighbors, CSR. */
  readonly offsets: Uint32Array;
  readonly neighbors: Uint32Array;
  /** Triangles over nodes. */
  readonly faces: Uint32Array;
  /** Per node: rest position (bind space), skin, and delta in its relaxed frame. */
  readonly rest: Float32Array;
  readonly joints: Uint16Array;
  readonly weights: Float32Array;
  private readonly delta: Float32Array;
  private readonly a: Float32Array;
  private readonly b: Float32Array;
  private readonly normals: Float32Array;
  private readonly positions: BufferAttribute;
  private readonly normal: BufferAttribute;
  private readonly bone = new Matrix4();
  private readonly skinning: Float32Array;
  /** One node's frame: tangent, bitangent, normal. */
  private readonly f = new Float64Array(9);

  constructor(source: SkinnedMesh, iterations = 4) {
    this.source = source;
    this.iterations = iterations;
    const g = source.geometry;
    const position = g.getAttribute('position');
    const count = position.count;
    const bind = source.bindMatrix.elements;

    // Weld: one node per distinct rest position.
    this.nodeOf = new Uint32Array(count);
    const firsts: number[] = [];
    const seen = new Map<string, number>();
    const restAll = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      // Rest positions in the skeleton's (world) space.
      restAll[i * 3] = bind[0] * x + bind[4] * y + bind[8] * z + bind[12];
      restAll[i * 3 + 1] = bind[1] * x + bind[5] * y + bind[9] * z + bind[13];
      restAll[i * 3 + 2] = bind[2] * x + bind[6] * y + bind[10] * z + bind[14];
      const key = `${Math.round(restAll[i * 3] * 1000)},${Math.round(restAll[i * 3 + 1] * 1000)},${Math.round(restAll[i * 3 + 2] * 1000)}`;
      let node = seen.get(key);
      if (node === undefined) {
        node = firsts.length;
        seen.set(key, node);
        firsts.push(i);
      }
      this.nodeOf[i] = node;
    }
    const m = (this.nodes = firsts.length);
    this.first = Uint32Array.from(firsts);

    // Triangles and neighbors over nodes.
    const index = g.getIndex();
    const tris = index ? index.count / 3 : count / 3;
    this.faces = new Uint32Array(tris * 3);
    const links: Set<number>[] = Array.from({ length: m }, () => new Set<number>());
    for (let t = 0; t < tris; t++) {
      const v = [0, 1, 2].map((k) => this.nodeOf[index ? index.getX(t * 3 + k) : t * 3 + k]);
      for (let k = 0; k < 3; k++) {
        this.faces[t * 3 + k] = v[k];
        links[v[k]].add(v[(k + 1) % 3]);
        links[v[k]].add(v[(k + 2) % 3]);
      }
    }
    this.offsets = new Uint32Array(m + 1);
    for (let i = 0; i < m; i++) this.offsets[i + 1] = this.offsets[i] + links[i].size;
    this.neighbors = new Uint32Array(this.offsets[m]);
    links.forEach((set, i) => {
      let k = this.offsets[i];
      for (const n of set) this.neighbors[k++] = n;
    });

    // Per node: rest position and skin.
    this.rest = new Float32Array(m * 3);
    this.joints = new Uint16Array(m * 4);
    this.weights = new Float32Array(m * 4);
    const skinIndex = g.getAttribute('skinIndex');
    const skinWeight = g.getAttribute('skinWeight');
    for (let n = 0; n < m; n++) {
      const i = this.first[n];
      this.rest.set(restAll.subarray(i * 3, i * 3 + 3), n * 3);
      for (let k = 0; k < 4; k++) {
        this.joints[n * 4 + k] = skinIndex.getComponent(i, k);
        this.weights[n * 4 + k] = skinWeight.getComponent(i, k);
      }
    }

    this.a = new Float32Array(m * 3);
    this.b = new Float32Array(m * 3);
    this.normals = new Float32Array(m * 3);
    this.delta = new Float32Array(m * 3);
    this.skinning = new Float32Array(source.skeleton.bones.length * 16);

    // Deltas: each point off its relaxed self, in the relaxed surface's frame.
    this.a.set(this.rest);
    const relaxed = this.relax();
    this.frameNormals(relaxed);
    const f = this.f;
    for (let n = 0; n < m; n++) {
      this.frame(relaxed, n);
      const [tx, ty, tz, bx, by, bz, nx, ny, nz] = f;
      const dx = this.rest[n * 3] - relaxed[n * 3], dy = this.rest[n * 3 + 1] - relaxed[n * 3 + 1], dz = this.rest[n * 3 + 2] - relaxed[n * 3 + 2];
      this.delta[n * 3] = dx * tx + dy * ty + dz * tz;
      this.delta[n * 3 + 1] = dx * bx + dy * by + dz * bz;
      this.delta[n * 3 + 2] = dx * nx + dy * ny + dz * nz;
    }

    // The output: world-space positions and normals each frame, the rest kept for shading.
    this.positions = new BufferAttribute(new Float32Array(count * 3), 3);
    this.normal = new BufferAttribute(new Float32Array(count * 3), 3);
    this.positions.setUsage(DynamicDrawUsage);
    this.normal.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positions);
    this.geometry.setAttribute('normal', this.normal);
    this.geometry.setAttribute('rest', new BufferAttribute(restAll, 3));
    for (const name of ['uv', 'color']) {
      const attribute = g.getAttribute(name);
      if (attribute) this.geometry.setAttribute(name, attribute);
    }
    if (index) this.geometry.setIndex(index);
    this.positions.array.set(restAll);
    this.geometry.computeBoundingSphere();
  }

  /**
   * Skin, relax, and restore the detail, from the skeleton's current bone
   * matrices (world). `fit` then moves the restored nodes (world positions,
   * three per node) for anything the cloth has to stay clear of, before the
   * normals are made from them.
   */
  update(fit?: (nodes: Float32Array) => void): void {
    const skeleton = this.source.skeleton;
    const bones = skeleton.bones;
    for (let i = 0; i < bones.length; i++) {
      this.bone.multiplyMatrices(bones[i].matrixWorld, skeleton.boneInverses[i]);
      this.skinning.set(this.bone.elements, i * 16);
    }
    const m = this.nodes;
    const s = this.skinning;
    for (let n = 0; n < m; n++) {
      const x = this.rest[n * 3], y = this.rest[n * 3 + 1], z = this.rest[n * 3 + 2];
      let px = 0, py = 0, pz = 0;
      for (let k = 0; k < 4; k++) {
        const w = this.weights[n * 4 + k];
        if (w === 0) continue;
        const o = this.joints[n * 4 + k] * 16;
        px += w * (s[o] * x + s[o + 4] * y + s[o + 8] * z + s[o + 12]);
        py += w * (s[o + 1] * x + s[o + 5] * y + s[o + 9] * z + s[o + 13]);
        pz += w * (s[o + 2] * x + s[o + 6] * y + s[o + 10] * z + s[o + 14]);
      }
      this.a[n * 3] = px;
      this.a[n * 3 + 1] = py;
      this.a[n * 3 + 2] = pz;
    }
    const relaxed = this.relax();
    this.frameNormals(relaxed);
    // Restored positions go back into `a` (the relaxed copy is the other buffer).
    const out = relaxed === this.a ? this.b : this.a;
    const f = this.f;
    for (let n = 0; n < m; n++) {
      this.frame(relaxed, n);
      const u = this.delta[n * 3], v = this.delta[n * 3 + 1], w = this.delta[n * 3 + 2];
      out[n * 3] = relaxed[n * 3] + f[0] * u + f[3] * v + f[6] * w;
      out[n * 3 + 1] = relaxed[n * 3 + 1] + f[1] * u + f[4] * v + f[7] * w;
      out[n * 3 + 2] = relaxed[n * 3 + 2] + f[2] * u + f[5] * v + f[8] * w;
    }
    fit?.(out);
    // Shading normals of the result, shared across welded points.
    this.frameNormals(out);
    const position = this.positions.array as Float32Array;
    const normal = this.normal.array as Float32Array;
    for (let i = 0; i < this.nodeOf.length; i++) {
      const n = this.nodeOf[i];
      position[i * 3] = out[n * 3];
      position[i * 3 + 1] = out[n * 3 + 1];
      position[i * 3 + 2] = out[n * 3 + 2];
      normal[i * 3] = this.normals[n * 3];
      normal[i * 3 + 1] = this.normals[n * 3 + 1];
      normal[i * 3 + 2] = this.normals[n * 3 + 2];
    }
    this.positions.needsUpdate = true;
    this.normal.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  /** Relax the node positions in `a`, ping-ponging with `b`; returns the buffer holding the result. */
  private relax(): Float32Array {
    let from = this.a, to = this.b;
    const half = 0.5;
    for (let it = 0; it < this.iterations; it++) {
      for (let n = 0; n < this.nodes; n++) {
        const start = this.offsets[n], end = this.offsets[n + 1];
        let x = 0, y = 0, z = 0;
        for (let k = start; k < end; k++) {
          const o = this.neighbors[k] * 3;
          x += from[o];
          y += from[o + 1];
          z += from[o + 2];
        }
        const c = end - start || 1;
        to[n * 3] = from[n * 3] * (1 - half) + (x / c) * half;
        to[n * 3 + 1] = from[n * 3 + 1] * (1 - half) + (y / c) * half;
        to[n * 3 + 2] = from[n * 3 + 2] * (1 - half) + (z / c) * half;
      }
      [from, to] = [to, from];
    }
    if (from !== this.a) {
      // Keep the relaxed result in `b` and the scratch in `a`, whichever way the passes fell.
      this.b.set(from);
      return this.b;
    }
    this.b.set(this.a);
    return this.b;
  }

  /** Area-weighted vertex normals of the node positions `p`, into `normals`. */
  private frameNormals(p: Float32Array) {
    const nrm = this.normals;
    nrm.fill(0);
    const f = this.faces;
    for (let t = 0; t < f.length; t += 3) {
      const i = f[t] * 3, j = f[t + 1] * 3, k = f[t + 2] * 3;
      const ux = p[j] - p[i], uy = p[j + 1] - p[i + 1], uz = p[j + 2] - p[i + 2];
      const vx = p[k] - p[i], vy = p[k + 1] - p[i + 1], vz = p[k + 2] - p[i + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      nrm[i] += cx; nrm[i + 1] += cy; nrm[i + 2] += cz;
      nrm[j] += cx; nrm[j + 1] += cy; nrm[j + 2] += cz;
      nrm[k] += cx; nrm[k + 1] += cy; nrm[k + 2] += cz;
    }
    for (let n = 0; n < this.nodes; n++) {
      const l = Math.hypot(nrm[n * 3], nrm[n * 3 + 1], nrm[n * 3 + 2]) || 1;
      nrm[n * 3] /= l;
      nrm[n * 3 + 1] /= l;
      nrm[n * 3 + 2] /= l;
    }
  }

  /** Node n's frame on the surface `p` (normals already in `normals`), into `f`: tangent toward its first neighbor, bitangent, normal. */
  private frame(p: Float32Array, n: number): void {
    const nx = this.normals[n * 3], ny = this.normals[n * 3 + 1], nz = this.normals[n * 3 + 2];
    const o = this.neighbors[this.offsets[n]] * 3;
    let tx = p[o] - p[n * 3], ty = p[o + 1] - p[n * 3 + 1], tz = p[o + 2] - p[n * 3 + 2];
    const d = tx * nx + ty * ny + tz * nz;
    tx -= d * nx;
    ty -= d * ny;
    tz -= d * nz;
    const l = Math.hypot(tx, ty, tz) || 1;
    tx /= l;
    ty /= l;
    tz /= l;
    const f = this.f;
    f[0] = tx; f[1] = ty; f[2] = tz;
    f[3] = ny * tz - nz * ty; f[4] = nz * tx - nx * tz; f[5] = nx * ty - ny * tx;
    f[6] = nx; f[7] = ny; f[8] = nz;
  }
}
