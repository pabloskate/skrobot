import { describe, expect, it } from 'vitest';
import { FOOT, GRAVITY } from '../../units';
import { rad } from '../../math';
import { EL_TORO_TERRAIN, carveLean, planStairs, stairDistance, stairTrack, type DropTerrain } from './stairs';

/** A run-up that comes in 30 degrees off the line toward -z and carves onto it. */
const CARVE = { yaw: -30, over: 20 * FOOT, straight: 9 * FOOT };
const TERRAIN: DropTerrain = { ...EL_TORO_TERRAIN, runUp: 1.6, carveIn: CARVE };
const plan = planStairs({ popHeight: 1 }, true, TERRAIN);
const straight = planStairs({ popHeight: 1 }, true, { ...EL_TORO_TERRAIN, runUp: 1.6 });

describe('a run-up that carves in off the line', () => {
  it('leaves the pop, the flight and the landing as a straight run-up has them', () => {
    expect(plan.pop).toBe(straight.pop);
    expect(plan.speed).toBe(straight.speed);
    expect(plan.takeoff).toEqual(straight.takeoff);
    for (const t of [plan.pop, plan.pop + 0.2, plan.land, plan.land + 0.3]) {
      expect(stairTrack(plan, t, t)).toEqual(stairTrack(straight, t, t));
    }
  });

  it('is square to the lip on the line for its last stretch', () => {
    for (const s of [0, 3 * FOOT, 8.9 * FOOT]) {
      const t = plan.pop - s / plan.speed;
      const at = stairTrack(plan, t, 0);
      expect(at.yaw).toBeCloseTo(0, 9);
      expect(at.z).toBeCloseTo(TERRAIN.laneZ, 9);
      expect(at.x).toBeCloseTo(stairTrack(straight, t, 0).x, 9);
    }
  });

  it('comes in on its own heading, from the far side of the line', () => {
    const far = stairTrack(plan, plan.pop - (CARVE.straight + CARVE.over + 5 * FOOT) / plan.speed, 0);
    expect(far.yaw).toBeCloseTo(CARVE.yaw, 9);
    // Heading toward -z, it comes from +z of the line.
    expect(far.z).toBeGreaterThan(TERRAIN.laneZ + 3 * FOOT);
    const before = stairTrack(plan, plan.pop - (CARVE.straight + CARVE.over + 9 * FOOT) / plan.speed, 0);
    const along = Math.atan2(far.z - before.z, far.x - before.x);
    expect(along).toBeCloseTo(rad(CARVE.yaw), 6);
  });

  it('rolls at the route speed along the curve, heading where it travels', () => {
    const h = 1 / 240;
    for (let t = 0.05; t < plan.pop - h; t += 0.05) {
      const a = stairTrack(plan, t - h, 0), b = stairTrack(plan, t + h, 0), at = stairTrack(plan, t, 0);
      const vx = (b.x - a.x) / (2 * h), vz = (b.z - a.z) / (2 * h);
      expect(Math.hypot(vx, vz) / plan.speed).toBeCloseTo(1, 3);
      expect(Math.atan2(vz, vx)).toBeCloseTo(rad(at.yaw), 2);
      expect(at.x).toBe(stairDistance(plan, t, 0));
      // Wheel travel is the path's length, whatever its shape.
      expect((b.travel - a.travel) / (2 * h) / plan.speed).toBeCloseTo(1, 6);
    }
  });

  it('leans the rider into the turn as its speed and curve ask, and not off it', () => {
    const at = (s: number) => carveLean(plan, plan.pop - s / plan.speed);
    expect(at(CARVE.straight / 2)).toBe(0);
    expect(at(CARVE.straight + CARVE.over + FOOT)).toBe(0);
    expect(carveLean(plan, plan.pop + 0.1)).toBe(0);
    expect(carveLean(straight, plan.pop - 0.8)).toBe(0);
    // Turning from -30 degrees to 0 is a turn toward +z: the lean is positive, greatest mid-turn.
    const peak = at(CARVE.straight + CARVE.over / 2);
    const tightest = (1.5 * rad(-CARVE.yaw)) / CARVE.over;
    expect(peak).toBeCloseTo((Math.atan((plan.speed ** 2 * tightest) / GRAVITY) * 180) / Math.PI, 6);
    expect(peak).toBeGreaterThan(at(CARVE.straight + CARVE.over * 0.2));
    expect(at(CARVE.straight + CARVE.over * 0.2)).toBeGreaterThan(0);
    // It builds from nothing and lets go to nothing: no jerk at either end.
    expect(at(CARVE.straight + 0.01 * FOOT)).toBeLessThan(0.1);
    expect(at(CARVE.straight + CARVE.over - 0.01 * FOOT)).toBeLessThan(0.1);
  });
});
