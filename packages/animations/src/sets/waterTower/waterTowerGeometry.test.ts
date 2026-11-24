import { afterAll, describe, expect, it } from 'vitest';
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Triangle, Vector3 } from 'three';
import type { ClassicSpotConfig } from '../classicSpot3d';
import { MAX_CANOPIES, MAX_CONTACTS, SURFACE } from '../surfaces';
import { buildWaterTowerGeometry } from './waterTowerGeometry';
import {
  WATER_TOWER_FOOT as F, WATER_TOWER_FILMERS, WATER_TOWER_GAP, WATER_TOWER_HEIGHT, WATER_TOWER_LANDING_X,
  WATER_TOWER_ROOF_RADIUS, WATER_TOWER_TAKEOFF_X, waterTowerHill, waterTowerRoof,
} from './waterTowerLayout';
import { groundHeight, landHeight, roadBend } from './waterTowerSite';
import { WATER_TOWER_CARS, WATER_TOWER_TREES } from './waterTowerTrees';

describe('water tank scenery', () => {
  const scene = buildWaterTowerGeometry();
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const mesh = new Mesh(scene.ground, material);
  afterAll(() => {
    material.dispose();
    for (const g of [scene.props, scene.decals, scene.ground]) g.dispose();
  });
  /** The ground mesh's height under (x, z), set units. */
  function groundAt(x: number, z: number) {
    const ray = new Raycaster(new Vector3(x, 400 * F, z), new Vector3(0, -1, 0));
    return ray.intersectObject(mesh)[0]?.point.y;
  }

  it('fits the spot budgets', () => {
    const build: ReturnType<ClassicSpotConfig['build']> = scene;
    const geometries = [scene.ground, scene.props, scene.decals];
    if (build.wireMesh) geometries.push(build.wireMesh.geometry);
    expect(build.railSegments?.length ?? 0).toBeLessThanOrEqual(48);
    const count = geometries.reduce((n, g) => n + g.getAttribute('position').count, 0);
    expect(count).toBeLessThan(100_000);
    expect(scene.shadowBoxes.length).toBeLessThanOrEqual(12);
    expect(scene.contacts.length).toBeLessThanOrEqual(12);
    expect(scene.contacts.length).toBeLessThanOrEqual(MAX_CONTACTS);
    expect(scene.canopies.length).toBeLessThanOrEqual(16);
    expect(scene.canopies.length).toBeLessThanOrEqual(MAX_CANOPIES);
  });

  it('carries the shadow across both roofs and down on the slot pavement', () => {
    for (const centre of [WATER_TOWER_TAKEOFF_X, WATER_TOWER_LANDING_X]) {
      for (let i = 0; i < 16; i++)
        for (const fraction of [0.05, 0.55, 0.999]) {
          const a = (2 * Math.PI * i) / 16, r = WATER_TOWER_ROOF_RADIUS * fraction;
          expect(groundAt(centre + Math.cos(a) * r, Math.sin(a) * r)).toBeCloseTo(0);
        }
    }
    for (const z of [-50, -30, -5, 0, 15, 40, 50])
      for (let x = -13; x < WATER_TOWER_GAP / F + 13; x += 1.3) {
        if (!waterTowerRoof(x * F, z * F)) expect(groundAt(x * F, z * F)).toBeCloseTo(-WATER_TOWER_HEIGHT);
      }
  });

  it('supports the side filmer on the measured hillside', () => {
    for (const x of [-80, 7, 110])
      for (const z of [-97, -122, -134, -150])
        expect(Math.abs(groundAt(x * F, z * F) - waterTowerHill(z * F))).toBeLessThan(F);
  });

  it('knows the ground mesh\'s own height, so what lies on the slopes sits on what is drawn', () => {
    for (const [x, z] of [[7, -134], [-250, -150], [40, 300], [-120, 420], [300, 260], [-700, 30], [900, 190]]) {
      expect(Math.abs(groundAt(x * F, z * F) / F - groundHeight(x, z)), `${x}, ${z}`).toBeLessThan(0.01);
    }
  });

  it('closes both ends of the valley with long rolling ridges, not peaks, and no notch of bare horizon', () => {
    for (const x of [-480, -620, 560, 700]) {
      const heights = Array.from({ length: 23 }, (_, i) => landHeight(x, -96 + i * 10));
      // High enough to close the view from the roofs, and rolling: no ridge bends sharply over a ten-foot step.
      expect(Math.max(...heights), `x ${x}`).toBeGreaterThan(20);
      for (let i = 1; i + 1 < heights.length; i++) expect(Math.abs(heights[i + 1] - 2 * heights[i] + heights[i - 1]), `x ${x}`).toBeLessThan(4);
      // The hillside runs into them without a cliff at its foot.
      expect(Math.abs(landHeight(x, -96.01) - landHeight(x, -95.99)), `x ${x}`).toBeLessThan(0.1);
    }
    // Far down the valley the hills close over the road itself.
    for (const x of [-1300, 1300]) expect(landHeight(x, 190 + roadBend(x)), `x ${x}`).toBeGreaterThan(80);
  });

  it('lays every level decal a hair over the ground, never in it', () => {
    const position = scene.decals.getAttribute('position'), normal = scene.decals.getAttribute('normal');
    let level = 0;
    // Each triangle at its middle, so marks along an edge are judged by the ground they lie on.
    for (let i = 0; i < position.count; i += 3) {
      if (normal.getY(i) < 0.98) continue;
      const [x, y, z] = [0, 1, 2].map((axis) => [0, 1, 2].reduce((sum, k) => sum + position.getComponent(i + k, axis), 0) / 3);
      const lift = y - groundAt(x, z);
      const where = `decal at ${(x / F).toFixed(1)}, ${(z / F).toFixed(1)} ft`;
      expect(lift, where).toBeGreaterThan(0.2);
      expect(lift, where).toBeLessThan(1);
      level++;
    }
    expect(level).toBeGreaterThan(300);
  });

  it('darkens the pavement along the footings through the slot', () => {
    for (const { a, b } of scene.contacts) {
      for (const p of [a, b]) {
        expect(p[1]).toBeCloseTo(-WATER_TOWER_HEIGHT);
        // Just outside one footing or the other, and in sight of the slot.
        const r = Math.min(Math.hypot(p[0] - WATER_TOWER_TAKEOFF_X, p[2]), Math.hypot(p[0] - WATER_TOWER_LANDING_X, p[2])) / F;
        expect(r).toBeCloseTo(89.45, 1);
        expect(Math.abs(p[2] / F)).toBeLessThan(50);
      }
    }
  });

  it('cuts the east slope\'s drainage ditches as narrow concrete V\'s, about three feet across', () => {
    const position = scene.props.getAttribute('position'), info = scene.props.getAttribute('aInfo');
    const tri = new Triangle();
    let ditch = 0;
    for (let i = 0; i < position.count; i += 3) {
      tri.a.fromBufferAttribute(position, i);
      tri.b.fromBufferAttribute(position, i + 1);
      tri.c.fromBufferAttribute(position, i + 2);
      const [x, z] = [tri.a.x / F, tri.a.z / F];
      const across = z - roadBend(x);
      if (across < 236 || across > 420 || Math.floor((info.getW(i) * 255) / 4 + 0.01) !== SURFACE.concrete) continue;
      // A concrete face lying on the slope (not a house or a lamp): its narrower side no wider than a ditch's half.
      if (Math.abs(tri.a.y / F - groundHeight(x, z)) > 1) continue;
      // Its narrower side in plan (on the slope a lip stands higher than the invert across it).
      const plan = (p: Vector3, q: Vector3) => Math.hypot(p.x - q.x, p.z - q.z);
      const sides = [plan(tri.a, tri.b), plan(tri.b, tri.c), plan(tri.c, tri.a)].sort((p, q) => p - q);
      expect(sides[0] / F, `ditch at ${x.toFixed(0)}, ${z.toFixed(0)}`).toBeLessThan(1.6);
      ditch++;
    }
    expect(ditch).toBeGreaterThan(50);
  });

  it('keeps the riding corridors and filmer stands free of fixtures', () => {
    const volume = (x: number, y: number, z: number, w: number, h: number, d: number) =>
      new Box3(new Vector3(x * F, y * F, z * F), new Vector3((x + w) * F, (y + h) * F, (z + d) * F));
    const zones = [volume(-60, 0.02, -8, 60, 8, 16), volume(WATER_TOWER_GAP / F, 0.02, -10, 75 - WATER_TOWER_GAP / F, 8, 20)];
    const site = WATER_TOWER_FILMERS.stairs!;
    for (const s of [...Object.values(site.stands), ...Object.values(site.across ?? {}), { u: -4 * F, z: -9 * F, height: 5.6 * F }]) {
      if (!s) continue;
      // Check the occupied space above the support surface. The top filmer is four feet from the rim.
      zones.push(volume(s.u / F - 6, s.height / F - (s.height > 0 ? 3 : 4), s.z / F - 6, 12, 7, 12));
    }
    const tri = new Triangle(), position = scene.props.getAttribute('position');
    for (let i = 0; i < position.count; i += 3) {
      tri.a.fromBufferAttribute(position, i);
      tri.b.fromBufferAttribute(position, i + 1);
      tri.c.fromBufferAttribute(position, i + 2);
      for (const zone of zones)
        if (zone.intersectsTriangle(tri)) throw new Error('Obstruction at ' + tri.a.toArray().map((n) => n / F));
    }
  });

  it('plants off the roofs and slot pavement and puts the cars in road lanes', () => {
    for (const { at: [x, , z] } of [...WATER_TOWER_TREES, ...WATER_TOWER_CARS]) {
      expect(waterTowerRoof(x, z)).toBeNull();
      expect(Math.abs(x / F - 7) < 25 && z / F >= -134 && z / F <= -109).toBe(false);
      expect(z / F > -96 && z / F < 118 + roadBend(x / F) && Math.abs(x / F - 7) < 40).toBe(false);
      expect(Math.hypot(x - WATER_TOWER_GAP / 2, z)).toBeGreaterThan(30 * F);
      expect(Math.abs(z / F - roadBend(x / F) - 118)).toBeGreaterThan(4);
    }
    for (const { at: [x, , z] } of WATER_TOWER_CARS) {
      const lane = z / F - roadBend(x / F);
      expect((lane > 150 && lane < 188) || (lane > 192 && lane < 230)).toBe(true);
    }
  });
});
