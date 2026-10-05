import { BufferAttribute, DynamicDrawUsage, Float32BufferAttribute } from 'three';
import { add3, cross3, dot3, norm3, scale3, smoothstep, sub3, type V3 } from '../scene/math';
import type { Frame3 } from '../scene/skeleton';
import { loftGeometry } from './geometry';
import { HUMANOID_SURFACE } from './humanoidMaterials';
import { toThree } from './view';

const ROWS = 16;
const SIDES = 32;

/** A soft joint cover whose ends follow the shoulders and skull independently. */
export class FlexibleNeck3D {
  readonly geometry = loftGeometry({
    length: 1, radius: () => [6.4, 7.8], open: [true, true],
    stations: ROWS, radial: SIDES,
    warp: (along, depth, side) => [depth, along, side],
  });

  constructor() {
    const count = this.geometry.getAttribute('position').count;
    this.geometry.setAttribute('aSurface', new Float32BufferAttribute(
      new Float32Array(count).fill(HUMANOID_SURFACE.soft), 1,
    ));
    (this.geometry.getAttribute('position') as BufferAttribute).setUsage(DynamicDrawUsage);
    (this.geometry.getAttribute('normal') as BufferAttribute).setUsage(DynamicDrawUsage);
  }

  update(torso: Frame3, head: Frame3): void {
    // Bury each open end inside its adjoining shell: no visible hem or cuff.
    const start = torso.at(-0.8, 23, 0);
    const end = head.at(-1.8, -16.5, 0);
    const delta = sub3(end, start);
    const distance = Math.max(0.001, Math.hypot(delta.x, delta.y, delta.z));
    const m0 = scale3(torso.up, distance * 0.7);
    const m1 = scale3(head.up, distance * 0.7);
    const positions = this.geometry.getAttribute('position');
    const combine = (a: number, b: number, c: number, d: number): V3 =>
      add3(add3(scale3(start, a), scale3(m0, b)), add3(scale3(end, c), scale3(m1, d)));

    for (let row = 0; row <= ROWS; row++) {
      const t = row / ROWS;
      const t2 = t * t, t3 = t2 * t;
      const center = combine(2 * t3 - 3 * t2 + 1, t3 - 2 * t2 + t, -2 * t3 + 3 * t2, t3 - t2);
      const axis = norm3(combine(6 * t2 - 6 * t, 3 * t2 - 4 * t + 1, -6 * t2 + 6 * t, 3 * t2 - 2 * t));
      const blend = smoothstep(t);
      const forward = add3(scale3(torso.fwd, 1 - blend), scale3(head.fwd, blend));
      let depth = sub3(forward, scale3(axis, dot3(forward, axis)));
      if (Math.hypot(depth.x, depth.y, depth.z) < 1e-5) depth = cross3(torso.side, axis);
      depth = norm3(depth);
      const side = norm3(cross3(axis, depth));
      const ra = 6.4 - 0.9 * blend;
      const rb = 7.8 - 1.3 * blend;
      for (let col = 0; col < SIDES; col++) {
        const angle = col / SIDES * Math.PI * 2;
        const at = add3(center, add3(scale3(depth, ra * Math.cos(angle)), scale3(side, rb * Math.sin(angle))));
        positions.setXYZ(row * SIDES + col, ...toThree(at));
      }
    }
    positions.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}
