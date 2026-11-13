import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { projectThree, stageView } from '../../camera/view';
import { SET_FOOT } from '../elToro/stairs';
import { Bake } from '../../three/bake';
import { MAX_CANOPIES, MAX_CONTACTS } from '../surfaces';
import { BANK_INK, buildSunsetGeometry } from './sunset3d';
import { BUILDING_PLANS } from './sunsetBuildings';
import { SUNSET_LETTERING, sunsetLettering } from './sunsetDetails';
import { SCALE, sunsetFloor } from './sunsetKit';
import { SUNSET_CARS, SUNSET_TREES } from './sunsetTrees';
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
        [SUNSET_BANK_END + SET_FOOT, SUNSET_LANE_Z + 7],
        [SUNSET_SIDEWALK_END - SET_FOOT, SUNSET_LANE_Z - 13],
        [SUNSET_SIDEWALK_END + 42 * SET_FOOT * SUNSET_SCALE, SUNSET_LANE_Z + 7],
      ];
      for (const [x, z] of samples) {
        const ray = new Raycaster(new Vector3(x, -SUNSET_DROP + SET_FOOT, z), new Vector3(0, -1, 0), 0, SET_FOOT * 2);
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
    expect(SET_FOOT).toBe(29);
    expect(SUNSET_SCALE).toBe(1.5);
    expect(SUNSET_DROP).toBe(18 * SET_FOOT);
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
        // The bank's unoutlined painted render (BANK_INK: id 0, solid 17) is the riding profile.
        if (info.getX(i) !== BANK_INK.id || Math.abs(info.getW(i) * 255 - 4 * (BANK_INK.solid ?? 0)) > 0.01) continue;
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
      expect(SUNSET_ROOF_Z0 - SUNSET_BANK_Z0).toBe(33 * SET_FOOT);
      expect(SUNSET_BANK_Z1 - SUNSET_BANK_Z0).toBe(135 * SET_FOOT);
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
      expect(roofMin).toBe(-9 * SET_FOOT);
      expect(roofMax).toBe(88.5 * SET_FOOT);
      expect(roofMax - roofMin).toBe(97.5 * SET_FOOT);
      expect(SUNSET_ROOF_BACK).toBe(-54 * SET_FOOT);
      expect(SUNSET_LANE_Z).toBe(-18 * SET_FOOT);
      expect(SUNSET_LANE_Z).toBeLessThan(roofMin);
      const roofMiddle = (roofMin + roofMax) / 2;
      const streetView = stageView(0, { yaw: -90, pitch: 8, lens: 1 });
      expect(projectThree(streetView, [0, SUNSET_BANK_TOP, SUNSET_LANE_Z]).x)
        .toBeGreaterThan(projectThree(streetView, [0, SUNSET_BANK_TOP, roofMiddle]).x);
      for (const z of [SUNSET_BANK_Z0, SUNSET_LANE_Z, SUNSET_ROOF_Z0, roofMiddle, SUNSET_ROOF_Z1, SUNSET_BANK_Z1]) {
        expect(sunsetSurface(0, z)).toBe(-6 * SET_FOOT);
      }
      expect(SUNSET_DROP + SUNSET_BANK_TOP).toBe(12 * SET_FOOT);
      expect(SUNSET_BANK_END - SUNSET_BANK_START).toBe(12 * SET_FOOT);
    } finally {
      geometry.ground.dispose();
      geometry.props.dispose();
    }
  });
  it('stays inside the realistic look\'s shader budgets', () => {
    const { ground, props, decals, wireMesh, railSegments, shadowBoxes, contacts, canopies } = buildSunsetGeometry();
    try {
      expect(railSegments.length).toBeLessThanOrEqual(48);
      expect(shadowBoxes.length).toBeLessThanOrEqual(12);
      expect(contacts.length).toBeLessThanOrEqual(MAX_CONTACTS);
      expect(canopies.length).toBeLessThanOrEqual(MAX_CANOPIES);
      const count = [ground, props, decals, wireMesh.geometry].reduce((n, g) => n + g.getAttribute('position').count, 0);
      expect(count).toBeLessThan(140_000);
    } finally {
      for (const g of [ground, props, decals, wireMesh.geometry]) g.dispose();
    }
  });

  it('lays every level decal a hair over the drawn floor, never in it, and layers apart', () => {
    const { decals, ground, props, wireMesh } = buildSunsetGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      // The floor the decals measure from is the floor the ground mesh draws: roof, sidewalks, street, lot, apron.
      const mesh = new Mesh(ground, material);
      const F = SET_FOOT;
      for (const [x, z] of [[-20 * F, 0], [15 * F, SUNSET_LANE_Z], [30 * F, 0], [70 * F, 900], [-20 * F, -60 * F], [-20 * F, 100 * F]]) {
        const hit = new Raycaster(new Vector3(x, 10 * F, z), new Vector3(0, -1, 0)).intersectObject(mesh)[0];
        expect(hit.point.y, `floor at ${x / F}, ${z / F} ft`).toBeCloseTo(sunsetFloor(x, z), 3);
      }
      const position = decals.getAttribute('position'), normal = decals.getAttribute('normal');
      let level = 0;
      // Each triangle at its middle, so a mark along an edge is judged by the floor it lies on.
      for (let i = 0; i < position.count; i += 3) {
        if (normal.getY(i) < 0.98) continue;
        const [x, y, z] = [0, 1, 2].map((axis) => [0, 1, 2].reduce((sum, k) => sum + position.getComponent(i + k, axis), 0) / 3);
        const lift = y - sunsetFloor(x, z);
        const where = `decal at ${(x / F).toFixed(1)}, ${(z / F).toFixed(1)} ft`;
        expect(lift, where).toBeGreaterThan(0.2);
        expect(lift, where).toBeLessThan(1);
        level++;
      }
      expect(level).toBeGreaterThan(300);
    } finally {
      material.dispose();
      for (const g of [ground, props, decals, wireMesh.geometry]) g.dispose();
    }
  });

  it('grows nothing over the crest: no prop sinks into the upper bank', () => {
    // Planting spilling past the shoulders' beds hangs over the crest, and the bank cuts it off in jagged steps.
    const { ground, props, decals, wireMesh } = buildSunsetGeometry();
    try {
      const position = props.getAttribute('position');
      const sunk: string[] = [];
      for (let i = 0; i < position.count; i++) {
        const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
        if (x < SUNSET_BANK_START + 6 || x > SUNSET_BANK_START + 3.5 * SET_FOOT || z < SUNSET_BANK_Z0 || z > SUNSET_BANK_Z1) continue;
        if (y < sunsetGround(x) - 0.5) sunk.push(`${(x / SET_FOOT).toFixed(1)}, ${(y / SET_FOOT).toFixed(1)}, ${(z / SET_FOOT).toFixed(1)} ft`);
      }
      expect(sunk.slice(0, 5)).toEqual([]);
    } finally {
      for (const g of [ground, props, decals, wireMesh.geometry]) g.dispose();
    }
  });

  it('keeps the trees and cars off the roof, the bank, the landing, the rollout and the buildings', () => {
    const F = SET_FOOT;
    const inside = (x: number, z: number, [x0, x1, z0, z1]: readonly [number, number, number, number]) =>
      x > x0 * SCALE && x < x1 * SCALE && z > z0 * SCALE && z < z1 * SCALE;
    const taperEnd = SUNSET_BANK_Z0 - 12 * F * SCALE;
    const placed = [...SUNSET_TREES.map(({ at }) => ({ at, tree: true, speed: 0 })), ...SUNSET_CARS.map(({ at, speed }) => ({ at, tree: false, speed: speed ?? 0 }))];
    for (const { at, tree, speed } of placed) {
      const [x, y, z] = at;
      const label = `${tree ? 'tree' : 'car'} at ${(x / F).toFixed(0)}, ${(z / F).toFixed(0)} ft`;
      // Not on the bank or its tapered end, nor on the roof's deck.
      expect(x > SUNSET_BANK_START - 2 * F && x < SUNSET_BANK_END && z > taperEnd && z < SUNSET_BANK_Z1, label).toBe(false);
      expect(y > -F && x > SUNSET_ROOF_BACK && x < 0 && z > SUNSET_ROOF_Z0 && z < SUNSET_ROOF_Z1, label).toBe(false);
      // The rollout runs down the sidewalk and some twelve feet into the curb lane; a driving car stays past it
      // wherever it is along the street.
      const reach = SUNSET_SIDEWALK_END + 15 * F;
      if (speed) expect(x, label).toBeGreaterThan(reach);
      else expect(x > SUNSET_BANK_END && x < reach && Math.abs(z - SUNSET_LANE_Z) < 40 * F, label).toBe(false);
      // Not inside a building: trees nowhere, cars only drying in the bays under the canopy.
      for (const [name, plan] of Object.entries(BUILDING_PLANS)) {
        const bay = !tree && name === 'wash' && y < SUNSET_BANK_TOP && x > SUNSET_ROOF_BACK + 100 * SCALE && x < -60 * SCALE;
        if (!bay) expect(inside(x, z, plan), `${label} in the ${name}`).toBe(false);
      }
    }
  });

  it('carries no business name, slogan, address or logo lettering', () => {
    const brand = /sunset|car\s*wash|speed\s*wash|hand\s*wash|100\s*%|7955/i;
    // The only words the scene letters are generic ones.
    for (const word of SUNSET_LETTERING) {
      expect(word).toMatch(/^[A-Z]{1,6}$/);
      expect(word).not.toMatch(brand);
    }
    expect(() => sunsetLettering(new Bake(), 'SUNSET', [0, 0, 0], [1, 0, 0], 1, '#ffffff')).toThrow();
    // No string in the set's source spells the business's name, slogan or address (imports aside).
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const source = readFileSync(join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/from '[^']*'/g, '');
      for (const literal of source.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) ?? []) expect(literal, `${file}: ${literal}`).not.toMatch(brand);
    }
  });
});
