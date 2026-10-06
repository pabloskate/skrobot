import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { projectThree, stageView } from '../../camera/view';
import { FOOT } from '../elToro/stairs';
import { buildSunsetGeometry } from './sunset3d';
import {
  SUNSET_BANK_END, SUNSET_BANK_START, SUNSET_BANK_TOP, SUNSET_BANK_Z0,
  SUNSET_BANK_Z1, SUNSET_DROP, SUNSET_GRADE, SUNSET_LAND_X, SUNSET_LANE_Z, SUNSET_POP_X, SUNSET_POP_Z, SUNSET_ROOF_BACK, SUNSET_ROOF_Z0, SUNSET_ROOF_Z1,
  SUNSET_SCALE, SUNSET_SIDEWALK_END, SUNSET_TOE_START, sunsetGround, sunsetSlope, sunsetSurface,
} from './sunsetLayout';

describe('Sunset roof-to-bank geometry', () => {
  it('has a single pavement floor beneath each sidewalk, without asphalt competing for depth', () => {
    const geometry = buildSunsetGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      const mesh = new Mesh(geometry.ground, material);
      const samples = [
        [SUNSET_BANK_END + FOOT, SUNSET_LANE_Z + 7],
        [SUNSET_SIDEWALK_END - FOOT, SUNSET_LANE_Z - 13],
        [SUNSET_SIDEWALK_END + 42 * FOOT * SUNSET_SCALE, SUNSET_LANE_Z + 7],
      ];
      for (const [x, z] of samples) {
        const ray = new Raycaster(new Vector3(x, -SUNSET_DROP + FOOT, z), new Vector3(0, -1, 0), 0, FOOT * 2);
        // Ignore raised expansion joints. Distinct floor heights less than a
        // unit apart fight for the same pixels from a low, distant camera.
        const floors = ray.intersectObject(mesh).filter(hit => hit.point.y <= -SUNSET_DROP + 0.01)
          .map(hit => hit.point.y.toFixed(3));
        expect(floors).toEqual([(-SUNSET_DROP).toFixed(3)]);
      }
    } finally {
      material.dispose();
      geometry.ground.dispose();
      geometry.props.dispose();
    }
  });

  it('lands on the steep bank and joins the sidewalk with continuous height and tangent', () => {
    expect(FOOT).toBe(29);
    expect(SUNSET_SCALE).toBe(1.5);
    expect(SUNSET_DROP).toBe(18 * FOOT);
    expect(sunsetSurface(SUNSET_POP_X, SUNSET_POP_Z)).toBe(0);
    expect(SUNSET_LANE_Z).toBeLessThan(SUNSET_ROOF_Z0);
    expect(sunsetSurface(SUNSET_POP_X, SUNSET_LANE_Z)).toBeLessThan(0);
    expect(sunsetSurface(SUNSET_LAND_X, SUNSET_LANE_Z)).toBe(sunsetGround(SUNSET_LAND_X));
    expect(sunsetGround(SUNSET_BANK_START)).toBe(SUNSET_BANK_TOP);
    expect(SUNSET_LAND_X).toBeGreaterThan(SUNSET_BANK_START);
    expect(SUNSET_LAND_X).toBeLessThan(SUNSET_TOE_START);
    expect(sunsetSlope(SUNSET_LAND_X)).toBeCloseTo(-SUNSET_GRADE);
    expect(sunsetGround(SUNSET_LAND_X)).toBeLessThan(SUNSET_BANK_TOP);
    expect(sunsetGround(SUNSET_LAND_X)).toBeGreaterThan(-SUNSET_DROP);
    for (const x of [SUNSET_TOE_START, SUNSET_BANK_END]) {
      expect(sunsetGround(x - 1e-5)).toBeCloseTo(sunsetGround(x + 1e-5), 4);
      expect(sunsetSlope(x - 1e-5)).toBeCloseTo(sunsetSlope(x + 1e-5), 5);
    }
    expect(sunsetGround(SUNSET_BANK_END + 300)).toBe(-SUNSET_DROP);
    expect(sunsetSlope(SUNSET_BANK_END + 300)).toBe(0);
    for (let x = 1; x < SUNSET_BANK_END; x += 0.5) {
      const derivative = (sunsetGround(x + 1e-4) - sunsetGround(x - 1e-4)) / 2e-4;
      expect(sunsetSlope(x)).toBeCloseTo(derivative, 5);
    }
  });

  it('renders the same bank profile that the wheels ride, with real 3D detail inside a mobile budget', () => {
    const geometry = buildSunsetGeometry();
    try {
      let count = 0;
      for (const mesh of [geometry.ground, geometry.props]) {
        const positions = mesh.getAttribute('position');
        const normals = mesh.getAttribute('normal');
        expect(positions.count).toBeGreaterThan(0);
        expect(positions.count % 3).toBe(0);
        expect(normals.count).toBe(positions.count);
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
        expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);
        expect(Array.from(mesh.getAttribute('aCorner').array).every((v) => v === 0)).toBe(true);
        count += positions.count;
      }
      expect(count).toBeLessThan(140_000);
      const positions = geometry.ground.getAttribute('position');
      const info = geometry.ground.getAttribute('aInfo');
      const bankXs = new Set<number>();
      const crestEnds = new Set<number>();
      for (let i = 0; i < positions.count; i++) {
        // Unoutlined concrete with material class 10 belongs to the bank.
        if (info.getX(i) !== 0 || Math.abs(info.getW(i) * 255 - 40) > 0.01) continue;
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        expect(y).toBeCloseTo(sunsetGround(x), 4);
        expect(z).toBeGreaterThanOrEqual(SUNSET_BANK_Z0);
        expect(z).toBeLessThanOrEqual(SUNSET_BANK_Z1);
        // The frontage and exposed landing share one crest at x=0. No
        // extra uphill portion may rise toward the roof beside its end.
        expect(x).toBeGreaterThanOrEqual(0);
        if (x === 0) {
          expect(y).toBe(SUNSET_BANK_TOP);
          crestEnds.add(z);
        }
        bankXs.add(x);
      }
      expect(crestEnds.has(SUNSET_BANK_Z0)).toBe(true);
      expect(crestEnds.has(SUNSET_BANK_Z1)).toBe(true);
      expect(SUNSET_ROOF_Z0 - SUNSET_BANK_Z0).toBe(33 * FOOT);
      expect(SUNSET_BANK_Z1 - SUNSET_BANK_Z0).toBe(135 * FOOT);
      expect(bankXs.size).toBeGreaterThan(16);
      expect(SUNSET_BANK_START).toBe(0);
      expect(Math.min(...bankXs)).toBe(SUNSET_BANK_START);
      expect(Math.max(...bankXs)).toBe(SUNSET_BANK_END);
    } finally {
      geometry.ground.dispose();
      geometry.props.dispose();
    }
  });

  it('places the exposed landing to the right of the canopy from the street, with the same bank height', () => {
    const geometry = buildSunsetGeometry();
    try {
      const positions = geometry.ground.getAttribute('position');
      const normals = geometry.ground.getAttribute('normal');
      const roofZs: number[] = [];
      for (let i = 0; i < positions.count; i++) {
        if (positions.getY(i) !== 0 || normals.getY(i) !== 1) continue;
        if (positions.getX(i) < SUNSET_ROOF_BACK || positions.getX(i) > 0) continue;
        roofZs.push(positions.getZ(i));
      }
      expect(roofZs.length).toBeGreaterThanOrEqual(6);
      const roofMin = Math.min(...roofZs), roofMax = Math.max(...roofZs);
      expect(roofMin).toBe(-9 * FOOT);
      expect(roofMax).toBe(88.5 * FOOT);
      expect(roofMax - roofMin).toBe(97.5 * FOOT);
      expect(SUNSET_ROOF_BACK).toBe(-54 * FOOT);
      expect(SUNSET_LANE_Z).toBe(-18 * FOOT);
      expect(SUNSET_LANE_Z).toBeLessThan(roofMin);
      const roofMiddle = (roofMin + roofMax) / 2;
      const streetView = stageView(0, { yaw: -90, pitch: 8, lens: 1 });
      expect(projectThree(streetView, [0, SUNSET_BANK_TOP, SUNSET_LANE_Z]).x)
        .toBeGreaterThan(projectThree(streetView, [0, SUNSET_BANK_TOP, roofMiddle]).x);
      for (const z of [SUNSET_BANK_Z0, SUNSET_LANE_Z, SUNSET_ROOF_Z0, roofMiddle, SUNSET_ROOF_Z1, SUNSET_BANK_Z1]) {
        expect(sunsetSurface(0, z)).toBe(-6 * FOOT);
      }
      expect(SUNSET_DROP + SUNSET_BANK_TOP).toBe(12 * FOOT);
      expect(SUNSET_BANK_END - SUNSET_BANK_START).toBe(12 * FOOT);
    } finally {
      geometry.ground.dispose();
      geometry.props.dispose();
    }
  });
});
