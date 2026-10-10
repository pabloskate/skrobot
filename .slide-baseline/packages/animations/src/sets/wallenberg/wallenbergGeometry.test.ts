import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { Bake } from '../../three/bake';
import { buildWallenbergBlocks, buildWallenbergGeometry } from './wallenbergGeometry';
import {
  FOOT, WALLENBERG_DROP, WALLENBERG_END_Z, WALLENBERG_CORNER_R, WALLENBERG_FLIGHTS, WALLENBERG_RISERS, WALLENBERG_RUN, WALLENBERG_SIDE_STAIRS_Z0,
  WALLENBERG_STEPS, WALLENBERG_TREAD, sideStairHeight, wallenbergGround, wallenbergLevel, wallenbergSurface,
} from './wallenbergLayout';

describe('Wallenberg landmark geometry', () => {
  it('reproduces the measured 51-inch drop and 198-inch run: three 15-inch blocks and the short street curb', () => {
    expect(WALLENBERG_DROP / FOOT * 12).toBe(51);
    expect(WALLENBERG_RUN / FOOT * 12).toBe(198);
    expect(WALLENBERG_RISERS.map((rise) => rise / FOOT * 12)).toEqual([15, 15, 15, 6]);
    expect(wallenbergLevel(WALLENBERG_STEPS)).toBe(-WALLENBERG_DROP);
    const ground = new Bake();
    buildWallenbergBlocks(ground, new Bake());
    const geometry = ground.geometry();
    try {
      const positions = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const faces = new Map<number, number[]>();
      for (let i = 0; i < positions.count; i++) {
        if (normal.getX(i) !== 1) continue;
        const x = positions.getX(i);
        faces.set(x, [...(faces.get(x) ?? []), i]);
      }
      expect([...faces.keys()]).toEqual([0, WALLENBERG_TREAD, 2 * WALLENBERG_TREAD, WALLENBERG_RUN]);
      [...faces.entries()].forEach(([x, indices], i) => {
        const ys = indices.map(k => positions.getY(k));
        const zs = indices.map(k => positions.getZ(k));
        expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(WALLENBERG_RISERS[i], 5);
        // Square to the line from the side stairs: the top two to where they round their ends, the lower two on out of sight.
        expect(Math.max(...zs)).toBeCloseTo(WALLENBERG_SIDE_STAIRS_Z0, 5);
        if (i < WALLENBERG_END_Z.length) expect(Math.min(...zs)).toBeCloseTo(WALLENBERG_END_Z[i] + WALLENBERG_CORNER_R[i], 5);
        else expect(Math.min(...zs)).toBeLessThan(-100 * FOOT);
        expect(wallenbergGround(x + 0.1)).toBeCloseTo(Math.min(...ys), 5);
        expect(wallenbergGround(x - 0.1)).toBeCloseTo(i === 0 ? 0 : Math.max(...ys), 5);
      });
      expect(wallenbergGround(WALLENBERG_RUN + 100)).toBe(-WALLENBERG_DROP);
    } finally {
      geometry.dispose();
    }
  });

  it('steps the side stairs in flights of three down each block, and one down the street curb', () => {
    expect(WALLENBERG_FLIGHTS).toEqual([3, 3, 3, 1]);
    for (let i = 0; i < WALLENBERG_STEPS; i++) {
      const x = i * WALLENBERG_TREAD;
      const heights = new Set<number>();
      for (let u = x - 0.5 * FOOT; u < x + 4 * FOOT; u += 0.25 * FOOT) heights.add(Math.round(sideStairHeight(u) * 1000));
      // The landing above, a height per step, and the landing below.
      expect(heights.size, `flight ${i}`).toBe(WALLENBERG_FLIGHTS[i] + 1);
      expect(sideStairHeight(x + 4 * FOOT)).toBeCloseTo(wallenbergLevel(i + 1), 6);
    }
  });

  it('draws what the rider, board and shadows come down on where the stage puts it, without coplanar floors', () => {
    const built = buildWallenbergGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      const mesh = new Mesh(built.ground, material);
      const samples: Array<[number, number, string]> = [
        [-4.2, 10.1, 'top platform before the gym'],
        [-12.3, -2.1, 'alley floor'],
        [-24.1, 1.1, 'roll-in transition'],
        [-31.6, -1.3, 'roll-in deck'],
        [2.7, 0.3, 'first tread'],
        [8.3, -7.9, 'second tread'],
        [13.7, 3.1, 'third tread'],
        [9.1, -48.3, 'second tread, far along'],
        [-2.1, -16.2, 'second block, beside the top platform'],
        [-8.1, -16.3, 'slope past the top block'],
        [3.1, -30.2, 'slope past the second block'],
        [-28.2, -7.1, 'slope behind the ledge'],
        [-25.3, -40.4, 'slope, far side'],
        [25.3, 0.4, 'street landing'],
        [WALLENBERG_RUN / FOOT + 0.7, 4.1, 'gutter'],
        [0.4, 25.2, 'top of the side stairs'],
        [6.1, 25.3, 'side stairs landing'],
        [8.2, 33.4, 'planted bank'],
      ];
      for (const [fx, fz, name] of samples) {
        const [x, z] = [fx * FOOT, fz * FOOT];
        const ray = new Raycaster(new Vector3(x, 40 * FOOT, z), new Vector3(0, -1, 0), 0, 80 * FOOT);
        const hits = ray.intersectObject(mesh).map(hit => hit.point.y);
        expect(hits.length, name).toBeGreaterThan(0);
        // The surface seen from above is the stage's (the roll-in's plywood over it by its thickness).
        expect(Math.abs(hits[0] - wallenbergSurface(x, z)), name).toBeLessThan(1);
        for (let k = 1; k < hits.length; k++) expect(hits[k - 1] - hits[k], `${name}: coplanar floors`).toBeGreaterThan(0.5);
      }
    } finally {
      material.dispose();
      built.ground.dispose();
      built.props.dispose();
    }
  });

  it('keeps the full schoolyard finite, three dimensional, and within the mobile mesh budget', () => {
    const { ground, props, railSegments, shadowBoxes } = buildWallenbergGeometry();
    try {
      const count = ground.getAttribute('position').count + props.getAttribute('position').count;
      expect(count).toBeGreaterThan(10_000);
      expect(count).toBeLessThan(120_000);
      expect(railSegments.length).toBeLessThanOrEqual(48);
      expect(shadowBoxes.length).toBeLessThanOrEqual(12);
      for (const geometry of [ground, props]) {
        const position = geometry.getAttribute('position');
        expect(position.count % 3).toBe(0);
        expect(geometry.getAttribute('normal').count).toBe(position.count);
        expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
        expect(Array.from(geometry.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
        expect(Array.from(geometry.getAttribute('aCorner').array).every(n => n === 0)).toBe(true);
      }
    } finally {
      ground.dispose();
      props.dispose();
    }
  });
});
