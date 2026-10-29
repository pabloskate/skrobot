import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from 'three';
import { buildHollywoodGeometry, hollywoodConfig, type HollywoodFlight } from './hollywood3d';
import {
  HOLLYWOOD_12_DROP, HOLLYWOOD_12_GRADE, HOLLYWOOD_12_LANE_Z, HOLLYWOOD_12_LIP,
  HOLLYWOOD_12_RAIL, HOLLYWOOD_12_RISER, HOLLYWOOD_12_RUN, HOLLYWOOD_12_STEPS, HOLLYWOOD_12_TREAD,
  HOLLYWOOD_BUILDING_FACE, HOLLYWOOD_CURB_Z, HOLLYWOOD_DROP, HOLLYWOOD_FAR_CURB_Z,
  HOLLYWOOD_FOOT, HOLLYWOOD_GRADE, HOLLYWOOD_LANE_Z, HOLLYWOOD_LEFT_Z,
  HOLLYWOOD_RAIL, HOLLYWOOD_RAIL_LINES, HOLLYWOOD_RIGHT_Z, HOLLYWOOD_RISER,
  HOLLYWOOD_ROAD_Y, HOLLYWOOD_RUN, HOLLYWOOD_STEPS, HOLLYWOOD_TREAD,
  hollywood12Ground, hollywood12Surface, hollywoodGround, hollywoodSurface,
} from './hollywoodLayout';

const FLIGHTS: HollywoodFlight[] = ['sixteen', 'twelve'];
const F = HOLLYWOOD_FOOT;

/** The same physical location, viewed going south or north down its active flight. */
const inFrame = (flight: HollywoodFlight, x: number, z: number): [number, number] =>
  flight === 'sixteen' ? [x, z] : [HOLLYWOOD_12_LIP - x, -z];

function risersOf(geometry: BufferGeometry, normalX: number) {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), ink = geometry.getAttribute('aInfo');
  const risers = new Map<number, Array<[number, number]>>();
  for (let i = 0; i < p.count; i++) {
    if (Math.round(ink.getX(i) * 255) !== 40 || n.getX(i) !== normalX) continue;
    const face = risers.get(p.getX(i)) ?? [];
    face.push([p.getY(i), p.getZ(i)]);
    risers.set(p.getX(i), face);
  }
  return risers;
}

describe('Hollywood High connected photograph-derived geometry', () => {
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

  it.each(FLIGHTS)('connects both real flights with a finite level walkway in the %s frame', (flight) => {
    const built = buildHollywoodGeometry(flight);
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      const mesh = new Mesh(built.ground, material);
      const surface = flight === 'sixteen' ? hollywoodSurface : hollywood12Surface;
      const samples: Array<[number, number, number]> = [];
      // Stay inside a poured slab rather than on the shared triangle edges
      // at the exact center of the gap lane.
      const laneZ = HOLLYWOOD_LANE_Z + 0.23 * F;
      // The walkway remains level all the way between the two lips, but
      // cannot continue invisibly across the twelve or its bottom landing.
      for (const share of [0.03, 0.31, 0.57, 0.97]) samples.push([HOLLYWOOD_12_LIP * share, laneZ, 0]);
      for (let step = 0; step < HOLLYWOOD_12_STEPS - 1; step++) {
        samples.push([HOLLYWOOD_12_LIP - (step + 0.37) * HOLLYWOOD_12_TREAD, laneZ, -(step + 1) * HOLLYWOOD_12_RISER]);
      }
      for (let step = 0; step < HOLLYWOOD_STEPS - 1; step++) {
        samples.push([(step + 0.37) * HOLLYWOOD_TREAD, laneZ, -(step + 1) * HOLLYWOOD_RISER]);
      }
      samples.push([HOLLYWOOD_12_LIP - HOLLYWOOD_12_RUN - 3.37 * F, laneZ, -HOLLYWOOD_12_DROP]);
      samples.push([HOLLYWOOD_RUN + 3.37 * F, laneZ, -HOLLYWOOD_DROP]);
      // School and street stay on opposite physical sides when the view turns.
      samples.push([HOLLYWOOD_12_LIP - 2.37 * F, HOLLYWOOD_CURB_Z - 4.17 * F, HOLLYWOOD_ROAD_Y]);
      for (const [worldX, worldZ, y] of samples) {
        const [x, z] = inFrame(flight, worldX, worldZ);
        const ray = new Raycaster(new Vector3(x, 4 * F, z), new Vector3(0, -1, 0), 0, 15 * F);
        // Paint may lie just above concrete. Every actual structural floor
        // must be at the terrain height, with no leftover run-up over it.
        const floors = ray.intersectObject(mesh).filter((hit) => Math.abs(hit.face!.normal.y) > 0.99 && Math.abs(hit.point.y - y) < 0.005);
        expect(floors, `${flight} floor (${x}, ${z})`).toHaveLength(1);
        expect(surface(x, z)).toBeCloseTo(y, 8);
        expect(ray.intersectObject(mesh).some((hit) => hit.point.y > y + 0.2), `${flight} no hidden upper floor (${x}, ${z})`).toBe(false);
      }
    } finally {
      material.dispose(); built.ground.dispose(); built.props.dispose();
    }
  });

  it.each(FLIGHTS)('keeps all twelve and sixteen risers visible in the %s frame', (flight) => {
    const built = buildHollywoodGeometry(flight);
    try {
      for (const [count, tread, riser, lip, heading] of [
        [HOLLYWOOD_STEPS, HOLLYWOOD_TREAD, HOLLYWOOD_RISER, 0, 1],
        [HOLLYWOOD_12_STEPS, HOLLYWOOD_12_TREAD, HOLLYWOOD_12_RISER, HOLLYWOOD_12_LIP, -1],
      ]) {
        const direction = flight === 'sixteen' ? heading : -heading;
        const faces = risersOf(built.ground, direction);
        expect(faces.size).toBe(count);
        for (let step = 0; step < count; step++) {
          const [x] = inFrame(flight, lip + heading * step * tread, 0);
          const key = [...faces.keys()].find((value) => Math.abs(value - x) < 0.0002);
          expect(key, `${flight} riser ${step + 1} of ${count}`).toBeDefined();
          const points = faces.get(key!)!;
          expect(Math.max(...points.map(([y]) => y))).toBeCloseTo(-step * riser, 3);
          expect(Math.min(...points.map(([y]) => y))).toBeCloseTo(-(step + 1) * riser, 3);
          expect(Math.min(...points.map(([, z]) => z))).toBe(HOLLYWOOD_LEFT_Z);
          expect(Math.max(...points.map(([, z]) => z))).toBe(HOLLYWOOD_RIGHT_Z);
        }
      }
    } finally { built.ground.dispose(); built.props.dispose(); }
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
      const allTops = built.railSegments.filter(({ a, b }) => Math.abs(a[0] - b[0]) > HOLLYWOOD_FOOT);
      expect(allTops).toHaveLength(5);
      const longitudinal = allTops.filter(({ a }) => a[0] > HOLLYWOOD_12_LIP / 2);
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

  it.each(FLIGHTS)('matches the twelve center and wall pipes to its steeper handrail in the %s frame', (flight) => {
    const built = buildHollywoodGeometry(flight);
    try {
      const northTops = built.railSegments.filter(({ a, b }) => {
        const [x] = inFrame(flight, a[0], a[2]);
        return x < HOLLYWOOD_12_LIP / 2 && Math.abs(a[0] - b[0]) > F;
      });
      expect(northTops).toHaveLength(2);
      for (const { a, b, radius } of northTops) {
        const [worldAX, worldAZ] = inFrame(flight, a[0], a[2]);
        const [worldBX, worldBZ] = inFrame(flight, b[0], b[2]);
        const ax = HOLLYWOOD_12_LIP - worldAX, bx = HOLLYWOOD_12_LIP - worldBX;
        expect(ax).toBe(HOLLYWOOD_12_RAIL.start);
        expect(bx).toBeCloseTo(HOLLYWOOD_12_RAIL.end, 10);
        expect(worldAZ).toBe(worldBZ);
        expect((a[1] - b[1]) / (bx - ax)).toBeCloseTo(HOLLYWOOD_12_GRADE, 10);
        expect(a[1] + ax * HOLLYWOOD_12_GRADE + radius * Math.hypot(1, HOLLYWOOD_12_GRADE)).toBeCloseTo(HOLLYWOOD_12_RAIL.top, 8);
      }
      expect(HOLLYWOOD_12_LANE_Z).toBeGreaterThan(0);
      expect(HOLLYWOOD_12_LANE_Z).toBeLessThan(HOLLYWOOD_RIGHT_Z);
      expect(built.shadowBoxes.every(({ min, max }) => flight === 'sixteen' ? min[2] >= HOLLYWOOD_BUILDING_FACE : max[2] <= -HOLLYWOOD_BUILDING_FACE)).toBe(true);
    } finally { built.ground.dispose(); built.props.dispose(); }
  });

  it('turns the same trees and moving traffic with the scene and places the twelve’s filmers on its street side', () => {
    const south = hollywoodConfig('sixteen'), north = hollywoodConfig('twelve');
    for (const kind of ['trees', 'cars'] as const) {
      const original = south.streetProps![kind]!, turned = north.streetProps![kind]!;
      expect(turned).toHaveLength(original.length);
      for (let i = 0; i < original.length; i++) {
        const [x, y, z] = original[i].at;
        expect(turned[i].at).toEqual([HOLLYWOOD_12_LIP - x, y, -z]);
        expect(turned[i].yaw).toBe(original[i].yaw! + 180);
      }
    }
    expect(north.streetProps!.cars!.every((car) => car.at[2] > 0)).toBe(true);
    for (const shot of Object.values(north.filmers!.stairs.stands)) expect(shot.z).toBeGreaterThan(0);
    expect(north.cameraZ![0]).toBeGreaterThan(-HOLLYWOOD_BUILDING_FACE);
    expect(north.filmers!.obstacles?.fence).toBeUndefined();
  });

  it.each(FLIGHTS)('uses finite two-draw geometry within the mobile budget in the %s frame', (flight) => {
    const built = buildHollywoodGeometry(flight);
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
    expect(hollywood12Ground(-0.001)).toBe(0);
    for (let step = 0; step < HOLLYWOOD_12_STEPS - 1; step++) {
      expect(hollywood12Ground((step + 0.5) * HOLLYWOOD_12_TREAD)).toBe(-(step + 1) * HOLLYWOOD_12_RISER);
    }
    expect(hollywood12Ground(HOLLYWOOD_12_RUN)).toBe(-HOLLYWOOD_12_DROP);
    expect(hollywood12Ground(HOLLYWOOD_12_RUN + 10000)).toBe(-HOLLYWOOD_12_DROP);
  });
});
