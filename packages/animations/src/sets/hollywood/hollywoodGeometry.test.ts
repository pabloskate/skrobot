import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildHollywoodGeometry } from './hollywood3d';
import {
  HOLLYWOOD_BUILDING_FACE, HOLLYWOOD_CURB_Z, HOLLYWOOD_DROP, HOLLYWOOD_FAR_CURB_Z,
  HOLLYWOOD_FOOT, HOLLYWOOD_GRADE, HOLLYWOOD_LANE_Z, HOLLYWOOD_LEFT_Z,
  HOLLYWOOD_RAIL, HOLLYWOOD_RAIL_LINES, HOLLYWOOD_RIGHT_Z, HOLLYWOOD_RISER,
  HOLLYWOOD_ROAD_Y, HOLLYWOOD_RUN, HOLLYWOOD_STEPS, HOLLYWOOD_TREAD,
  hollywoodGround, hollywoodSurface,
} from './hollywoodLayout';

describe('Hollywood High 16 photograph-derived geometry', () => {
  it('partitions sidewalk, road, far side and landing into one floor per footprint', () => {
    const built = buildHollywoodGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      const mesh = new Mesh(built.ground, material);
      const F = HOLLYWOOD_FOOT, bottom = -HOLLYWOOD_DROP;
      const floorHeights = [bottom, HOLLYWOOD_ROAD_Y];
      const samples = [
        // The wide sidewalk past the fence, beside the stairs and the run-up.
        [-11.37 * F, HOLLYWOOD_LEFT_Z - 6.13 * F, bottom],
        [7.31 * F, HOLLYWOOD_CURB_Z + 0.61 * F, bottom],
        // The road, near lane and far, and the far side beyond it.
        [-11.37 * F, HOLLYWOOD_CURB_Z - 5.31 * F, HOLLYWOOD_ROAD_Y],
        [HOLLYWOOD_RUN + 7.31 * F, HOLLYWOOD_FAR_CURB_Z + 2.13 * F, HOLLYWOOD_ROAD_Y],
        [-11.37 * F, HOLLYWOOD_FAR_CURB_Z - 5.17 * F, bottom],
        // The bottom landing, and where it meets the sidewalk.
        [HOLLYWOOD_RUN + 7.31 * F, HOLLYWOOD_LEFT_Z - 3.91 * F, bottom],
        [HOLLYWOOD_RUN + 7.31 * F, HOLLYWOOD_LEFT_Z + 3.17 * F, bottom],
      ];
      for (const [x, z, y] of samples) {
        const ray = new Raycaster(new Vector3(x, bottom + F, z), new Vector3(0, -1, 0), 0, 2 * F);
        // Skip paint, but preserve individual hits so a coincident duplicate
        // fails just as a competing floor a fraction of a unit below does.
        const floors = ray.intersectObject(mesh).filter(hit => floorHeights.some(height => Math.abs(hit.point.y - height) < 0.005));
        expect(floors, `floor at (${x}, ${z})`).toHaveLength(1);
        expect(floors[0].point.y).toBeCloseTo(y, 4);
        expect(hollywoodSurface(x, z), `surface at (${x}, ${z})`).toBeCloseTo(y, 4);
      }
    } finally {
      material.dispose();
      built.ground.dispose();
      built.props.dispose();
    }
  });

  it('keeps sixteen distinct risers across the whole flight at the modeled drop and run', () => {
    const built = buildHollywoodGeometry();
    try {
      const p = built.ground.getAttribute('position');
      const n = built.ground.getAttribute('normal');
      const ink = built.ground.getAttribute('aInfo');
      const risers = new Map<number, Array<[number, number]>>();
      for (let i = 0; i < p.count; i++) {
        if (Math.round(ink.getX(i) * 255) !== 40 || n.getX(i) !== 1) continue;
        const face = risers.get(p.getX(i)) ?? [];
        face.push([p.getY(i), p.getZ(i)]);
        risers.set(p.getX(i), face);
      }
      expect(risers.size).toBe(16);
      const xs = [...risers.keys()].sort((a, b) => a - b);
      expect(xs[0]).toBe(0);
      expect(xs[xs.length - 1]).toBeCloseTo(HOLLYWOOD_RUN, 4);
      xs.forEach((x, index) => {
        const face = risers.get(x)!;
        expect(Math.max(...face.map(([y]) => y))).toBeCloseTo(-index * HOLLYWOOD_RISER, 4);
        expect(Math.min(...face.map(([y]) => y))).toBeCloseTo(-(index + 1) * HOLLYWOOD_RISER, 4);
        expect(Math.min(...face.map(([, z]) => z))).toBe(HOLLYWOOD_LEFT_Z);
        expect(Math.max(...face.map(([, z]) => z))).toBe(HOLLYWOOD_RIGHT_Z);
      });
      expect(Math.min(...risers.get(xs[xs.length - 1])!.map(([y]) => y))).toBe(-HOLLYWOOD_DROP);
    } finally {
      built.ground.dispose(); built.props.dispose();
    }
  });

  it('gives each real rail exactly one sloping top bar, with school-side wall brackets', () => {
    const built = buildHollywoodGeometry();
    try {
      const longitudinal = built.railSegments.filter(({ a, b }) => Math.abs(a[0] - b[0]) > HOLLYWOOD_FOOT);
      expect(longitudinal).toHaveLength(3);
      expect(longitudinal.map(({ a }) => a[2])).toEqual(HOLLYWOOD_RAIL_LINES.map(({ z }) => z));
      for (const { a, b, radius } of longitudinal) {
        expect(a[0]).toBe(HOLLYWOOD_RAIL.start);
        expect(b[0]).toBe(HOLLYWOOD_RAIL.end);
        expect(a[2]).toBe(b[2]);
        expect((a[1] - b[1]) / (b[0] - a[0])).toBeCloseTo(HOLLYWOOD_GRADE, 10);
        expect(a[1] + a[0] * HOLLYWOOD_GRADE + radius * Math.hypot(1, HOLLYWOOD_GRADE)).toBeCloseTo(HOLLYWOOD_RAIL.top, 8);
      }
      const schoolRail = HOLLYWOOD_RAIL_LINES.find(({ wallMounted }) => wallMounted)!;
      const schoolSegments = built.railSegments.filter(({ a, b }) => a[2] === schoolRail.z || b[2] === schoolRail.z);
      expect(schoolSegments.some(({ a, b }) => a[2] === HOLLYWOOD_BUILDING_FACE - 0.1 || b[2] === HOLLYWOOD_BUILDING_FACE - 0.1)).toBe(true);
      expect(HOLLYWOOD_LANE_Z).toBeLessThan(0);
      expect(HOLLYWOOD_LANE_Z).toBeGreaterThan(HOLLYWOOD_LEFT_Z);
    } finally {
      built.ground.dispose(); built.props.dispose();
    }
  });

  it('uses finite two-draw geometry and volumetric trees within the mobile budget', () => {
    const built = buildHollywoodGeometry();
    try {
      let count = 0;
      for (const geometry of [built.ground, built.props]) {
        const position = geometry.getAttribute('position');
        expect(position.count % 3).toBe(0);
        expect(position.count).toBeGreaterThan(0);
        for (const attr of ['position', 'normal', 'aColor', 'aCorner']) {
          expect(Array.from(geometry.getAttribute(attr).array).every(Number.isFinite)).toBe(true);
        }
        expect(Array.from(geometry.getAttribute('aCorner').array).every(value => value === 0)).toBe(true);
        count += position.count;
      }
      expect(count).toBeLessThan(140_000);
      expect(built.railSegments.length).toBeLessThanOrEqual(48);
      expect(built.shadowBoxes.length).toBeLessThanOrEqual(12);
      expect(built.shadowBoxes.every(({ min }) => min[2] >= HOLLYWOOD_BUILDING_FACE)).toBe(true);
    } finally {
      built.ground.dispose(); built.props.dispose();
    }
  });

  it('agrees with the collision profile at each actual landing and tread', () => {
    expect(hollywoodGround(-0.001)).toBe(0);
    for (let k = 0; k < HOLLYWOOD_STEPS - 1; k++) {
      expect(hollywoodGround(k * HOLLYWOOD_TREAD + HOLLYWOOD_TREAD / 2)).toBe(-(k + 1) * HOLLYWOOD_RISER);
    }
    expect(hollywoodGround(HOLLYWOOD_RUN)).toBe(-HOLLYWOOD_DROP);
    expect(hollywoodGround(HOLLYWOOD_RUN + 10000)).toBe(-HOLLYWOOD_DROP);
  });
});
