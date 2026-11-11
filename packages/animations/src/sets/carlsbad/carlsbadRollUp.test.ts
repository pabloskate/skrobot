import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { rad } from '../../math';
import { planStairs, stairTrack } from '../elToro/stairs';
import { buildCarlsbadGeometry } from './carlsbadGeometry';
import {
  CARLSBAD_FOOT as F,
  CARLSBAD_FOOTPRINTS,
  CARLSBAD_TERRAIN,
  CARLSBAD_WING_YAW,
  carlsbadPaved,
  carlsbadPolygonDistance,
  carlsbadSurface,
} from './carlsbadLayout';

const plan = planStairs({ popHeight: 1 }, true, CARLSBAD_TERRAIN);
const carve = CARLSBAD_TERRAIN.carveIn!;
const wing = CARLSBAD_FOOTPRINTS.find((b) => b.name === 'wing')!;
/** The rider's place on the run-up with this much of the path still to roll before the pop. */
const before = (path: number) => stairTrack(plan, plan.pop - path / plan.speed, 0);
/** Run-up samples, a quarter of a foot apart, from the start of the clip to the pop. */
const line = Array.from({ length: Math.floor((plan.speed * plan.pop) / (0.25 * F)) + 1 }, (_, i) => before(i * 0.25 * F));

describe('the Carlsbad roll-up', () => {
  it('starts in the covered walk: beside the classroom wall, under its eave, rolling along it', () => {
    const start = line[line.length - 1];
    expect(start.yaw).toBeCloseTo(CARLSBAD_WING_YAW, 1);
    const out = carlsbadPolygonDistance(start.x, start.z, wing.footprint) / F;
    expect(out).toBeGreaterThan(6);
    expect(out).toBeLessThan(7);
    // Enough of the clip is spent under the eave to see where the speed came from.
    const covered = line.filter((at) => carlsbadPolygonDistance(at.x, at.z, wing.roof) === 0);
    expect(covered.length * 0.25).toBeGreaterThan(14);
    for (const at of covered) {
      expect(carlsbadPolygonDistance(at.x, at.z, wing.footprint) / F).toBeGreaterThan(5.5);
      // Still nearly along the wall there: the carve is only starting.
      expect(Math.abs(at.yaw - CARLSBAD_WING_YAW)).toBeLessThan(25);
    }
  });

  it('comes out from under the eave onto the pad and meets the lip square, in the open', () => {
    const lip = before(0);
    expect(lip.yaw).toBeCloseTo(0, 9);
    expect(lip.z).toBeCloseTo(CARLSBAD_TERRAIN.laneZ, 9);
    for (const path of [0, carve.straight]) {
      const at = before(path);
      expect(carlsbadPolygonDistance(at.x, at.z, wing.roof) / F).toBeGreaterThan(1.5);
    }
    // Once out from under the roof it stays out.
    const covered = line.map((at) => carlsbadPolygonDistance(at.x, at.z, wing.roof) === 0);
    expect(covered.lastIndexOf(false)).toBeLessThan(covered.indexOf(true));
  });

  it('rolls on level paving the whole way, with room either side of the board', () => {
    for (const at of line) {
      const across = [-Math.sin(rad(at.yaw)), Math.cos(rad(at.yaw))];
      for (const side of [-1.5, 0, 1.5]) {
        const x = at.x + across[0] * side * F, z = at.z + across[1] * side * F;
        expect(carlsbadPaved(x, z)).toBe(true);
        expect(Math.abs(carlsbadSurface(x, z)) / F).toBeLessThan(0.01);
      }
      // Never brushing a building.
      for (const built of CARLSBAD_FOOTPRINTS) {
        expect(carlsbadPolygonDistance(at.x, at.z, built.footprint) / F).toBeGreaterThan(5);
      }
    }
  });

  it('is baked as level as it is planned, with nothing standing in the way below head height', () => {
    const built = buildCarlsbadGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const ground = new Mesh(built.ground, material), props = new Mesh(built.props, material);
    try {
      for (const at of line.filter((_, i) => i % 2 === 0)) {
        const across = [-Math.sin(rad(at.yaw)), Math.cos(rad(at.yaw))];
        for (const side of [-1, 0, 1]) {
          const x = at.x + across[0] * side * F, z = at.z + across[1] * side * F;
          const down = new Raycaster(new Vector3(x, 7 * F, z), new Vector3(0, -1, 0));
          // The first thing under a seven-foot head is the paving itself.
          expect(Math.abs(down.intersectObject(ground)[0].point.y) / F).toBeLessThan(0.02);
          const hit = down.intersectObject(props)[0];
          if (hit) expect(hit.point.y / F).toBeLessThan(0.05);
        }
      }
    } finally {
      material.dispose();
      built.ground.dispose();
      built.props.dispose();
    }
  });
});
