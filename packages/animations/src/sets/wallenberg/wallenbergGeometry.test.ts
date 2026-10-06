import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { Bake } from '../../three/bake';
import { buildWallenbergBlocks, buildWallenbergGeometry } from './wallenbergGeometry';
import { FOOT, WALLENBERG_DROP, WALLENBERG_HALF_WIDTH, WALLENBERG_RISER, WALLENBERG_RUN, WALLENBERG_STEPS, WALLENBERG_TREAD, wallenbergGround } from './wallenbergLayout';

describe('Wallenberg landmark geometry', () => {
  it('gives each campus, court and pedestrian paving region a single physical floor', () => {
    const built = buildWallenbergGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      const mesh = new Mesh(built.ground, material);
      const bottom = -WALLENBERG_DROP;
      // Interior points avoid triangle diagonals and intentional narrow paint.
      // Include both sides of the court and the last pedestrian stair footprint.
      const samples = [
        [-17.37 * FOOT, 2.41 * FOOT, 0],
        [-15.23 * FOOT, -23.11 * FOOT, 0],
        [-14.29 * FOOT, 33.73 * FOOT, 0],
        [-14.29 * FOOT, 49.11 * FOOT, 0],
        [-45.13 * FOOT, -15.11 * FOOT, -0.15],
        [-15.13 * FOOT, -30.11 * FOOT, -0.15],
        [WALLENBERG_RUN + 4.31 * FOOT, -23.11 * FOOT, bottom],
        [WALLENBERG_RUN + 0.31 * FOOT, -23.11 * FOOT, -3 * WALLENBERG_RISER],
        [3500 + 1.37 * FOOT, -23.11 * FOOT, bottom],
        [37.21 * FOOT, -41.27 * FOOT, bottom + 0.1],
        [21.27 * FOOT, -41.27 * FOOT, bottom],
        [97.31 * FOOT, -41.27 * FOOT, bottom],
        [37.21 * FOOT, -59.41 * FOOT, bottom],
        [37.21 * FOOT, -28.41 * FOOT, bottom],
        [WALLENBERG_RUN + 8.29 * FOOT, 4.11 * FOOT, bottom],
      ];
      for (const [x, z, y] of samples) {
        const ray = new Raycaster(new Vector3(x, y + FOOT, z), new Vector3(0, -1, 0), 0, 2 * FOOT);
        // Raised wear and paint are independent details. Count physical faces,
        // including duplicates at exactly the same height, rather than heights.
        const floors = ray.intersectObject(mesh).filter(hit => hit.point.y <= y + 0.001);
        expect(floors, `floor at (${x}, ${z})`).toHaveLength(1);
        expect(floors[0].point.y).toBeCloseTo(y, 4);
      }
    } finally {
      material.dispose();
      built.ground.dispose();
      built.props.dispose();
    }
  });

  it('reproduces the measured 51-inch drop and 198-inch run as four wide curbs', () => {
    expect(WALLENBERG_DROP / FOOT * 12).toBe(51);
    expect(WALLENBERG_RUN / FOOT * 12).toBe(198);
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
      expect(faces.size).toBe(WALLENBERG_STEPS);
      expect([...faces.keys()]).toEqual([0, WALLENBERG_TREAD, 2 * WALLENBERG_TREAD, WALLENBERG_RUN]);
      for (const [x, indices] of faces) {
        const ys = indices.map(i => positions.getY(i));
        const zs = indices.map(i => positions.getZ(i));
        expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(WALLENBERG_RISER, 5);
        expect(Math.max(...zs) - Math.min(...zs)).toBe(2 * WALLENBERG_HALF_WIDTH);
        expect(wallenbergGround(x + 0.1)).toBeCloseTo(Math.min(...ys), 5);
        expect(wallenbergGround(x - 0.1)).toBeCloseTo(Math.max(...ys), 5);
      }
      expect(wallenbergGround(-100)).toBe(0);
      expect(wallenbergGround(WALLENBERG_RUN + 100)).toBe(-WALLENBERG_DROP);
    } finally {
      geometry.dispose();
    }
  });

  it('keeps the full schoolyard finite, three dimensional, and within the mobile mesh budget', () => {
    const { ground, props } = buildWallenbergGeometry();
    try {
      const count = ground.getAttribute('position').count + props.getAttribute('position').count;
      expect(count).toBeGreaterThan(10_000);
      expect(count).toBeLessThan(120_000);
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
