import { describe, expect, it } from 'vitest';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../../board/board';
import { ASPHALT } from '../../camera/view';
import { resolveSkateStyle } from '../../motion/style';
import { ROLL_IN, X0 } from '../../motion/trick';
import { planStage, stageFrame } from '../../stage/stage';
import type { RiderStance, Stance } from '../../types';
import { dropInEnd, terrainSurface } from '../elToro/stairs';
import { FOOT, WALLENBERG_DROP_IN, WALLENBERG_RAMP } from './wallenbergLayout';

const plan = (stance: Stance = 'regular', riderStance: RiderStance = 'regular', popHeight = 1) =>
  planStage({ id: 'Kickflip', name: 'Kickflip', base: 'Kickflip', stance }, {
    set: 'wallenberg', landed: true, riderStance, style: resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1 }), fall: 'slam', shankProgress: 0.65,
  });

describe('Wallenberg roll-in', () => {
  it('drops in from the deck and reaches the speed the gap takes by the foot of the ramp, gaining it all the way down', () => {
    for (const popHeight of [0.45, 1, 1.15]) {
      const stage = plan('regular', 'regular', popHeight);
      const stairs = stage.stairs!;
      const start = stageFrame(stage, 0, 1);
      expect(start.scroll).toBeCloseTo(WALLENBERG_DROP_IN.x);
      expect(start.lift).toBeCloseTo(WALLENBERG_RAMP.height, 0);
      const foot = dropInEnd(stairs);
      expect(foot).toBeGreaterThan(1);
      // The trick's crouch starts on the flat, after the ramp.
      expect(stairs.pop - ROLL_IN).toBeGreaterThan(foot);
      const dt = 1 / 60;
      let previous = 0;
      for (let t = dt; t < foot; t += dt) {
        const a = stageFrame(stage, t - dt, 1).scroll, b = stageFrame(stage, t, 1).scroll;
        // Speed along the ramp's surface.
        const speed = Math.hypot(b - a, stairs.terrain.ground(b) - stairs.terrain.ground(a)) / dt;
        expect(speed, `speed at ${t.toFixed(3)}`).toBeGreaterThanOrEqual(previous * 0.99);
        previous = speed;
      }
      const at = stageFrame(stage, foot, 1), before = stageFrame(stage, foot - dt, 1);
      expect((at.scroll - before.scroll) / dt / stairs.speed).toBeCloseTo(1, 1);
      expect(at.scroll).toBeCloseTo(WALLENBERG_RAMP.bottom, -1);
    }
  });

  it('keeps both trucks on the plywood all the way down, square to the ramp, for every stance and skater', () => {
    const failures: string[] = [];
    for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as Stance[]) for (const rider of ['regular', 'goofy'] as RiderStance[]) {
      const stage = plan(stance, rider);
      const stairs = stage.stairs!;
      for (let t = 0; t <= dropInEnd(stairs) + 0.1; t += 1 / 60) {
        const frame = stageFrame(stage, t, 1);
        for (const x of [-WHEEL_X, WHEEL_X]) for (const z of [-WHEEL_Z, WHEEL_Z]) {
          const axle = frame.rig.board.point({ x, y: WHEEL_Y, z });
          const u = frame.scroll + axle.x - X0;
          const ground = terrainSurface(stairs.terrain, u, frame.stairs!.across + axle.z);
          const grade = (terrainSurface(stairs.terrain, u + 1, 0) - terrainSurface(stairs.terrain, u - 1, 0)) / 2;
          // Gap from the wheel to the ramp, square to it.
          const gap = (ASPHALT - axle.y - ground) / Math.hypot(1, grade) - WHEEL_R;
          if (Math.abs(gap) > 1.5) failures.push(`${stance}/${rider} t=${t.toFixed(2)}: ${gap.toFixed(2)}`);
        }
      }
    }
    expect(failures.slice(0, 12)).toEqual([]);
    expect(WALLENBERG_RAMP.height).toBe(8 * FOOT);
  });
});
