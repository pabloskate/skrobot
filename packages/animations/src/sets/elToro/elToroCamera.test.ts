import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE_CAMERA } from '../../camera/camera';
import { STAIR_DROP, stairGround } from './stairs';
import { resolveSkateStyle } from '../../motion/style';
import type { RiderStance, Stance } from '../../types';
import { elToroView, EL_TORO_CAMERA_MIN_Z, EL_TORO_CAMERA_Z } from './elToroCamera';
import { HILL_EDGE, RIDER_LANE_Z, WALL_Z, hill } from './elToroLayout';
import { planStage, stageFrame } from '../../stage/stage';
import { projectThree, stageView, type StageView, type Vec3 } from '../../camera/view';

const target = (v: StageView): Vec3 => v.eye.map((value, i) => value - v.back[i] * v.distance) as Vec3;

describe('El Toro camera clearance', () => {
  it('keeps the full orbit between the school and canopy without changing lens during an attempt', () => {
    for (let yaw = -180; yaw <= 180; yaw += 15) {
      for (const pitch of [0, 5, 25, 45, 60]) {
        for (const lens of [0.65, 1, 1.25, 1.6]) {
          const camera = { yaw, pitch, lens };
          const setup = elToroView(0, camera, 1, 500 / 404);
          for (const lift of [0, 75, -STAIR_DROP]) {
            const view = elToroView(lift, camera, 1, 500 / 404);
            expect(view.eye[2]).toBeLessThanOrEqual(EL_TORO_CAMERA_Z + 1e-8);
            expect(view.eye[2]).toBeGreaterThanOrEqual(EL_TORO_CAMERA_MIN_Z - 1e-8);
            expect(view.distance).toBeCloseTo(setup.distance, 8);
            expect(view.focal).toBeCloseTo(setup.focal, 8);
            expect(view.back).toEqual(setup.back);
          }
        }
      }
    }
  });

  it('preserves the requested angle, target and scale at the rider when avoiding the wall', () => {
    const camera = { yaw: -16, pitch: 5, lens: 1.6 };
    const requested = stageView(0, camera, 0.7, 500 / 404);
    const safe = elToroView(0, camera, 0.7, 500 / 404);
    expect(safe.distance).toBeLessThan(requested.distance);
    expect(safe.back).toEqual(requested.back);
    expect(safe.anchor).toEqual(requested.anchor);
    target(safe).forEach((value, i) => expect(value).toBeCloseTo(target(requested)[i], 8));
    expect(safe.focal / safe.distance).toBeCloseTo(requested.focal / requested.distance, 8);
    for (const offset of [-40, 0, 40]) {
      const p = target(safe).map((value, i) => value + safe.right[i] * offset) as Vec3;
      const a = projectThree(requested, p), b = projectThree(safe, p);
      expect(b.x).toBeCloseTo(a.x, 8);
      expect(b.y).toBeCloseTo(a.y, 8);
    }
  });

  it('leaves the stock downhill angle intact and raises only views that need ground clearance', () => {
    const requested = stageView(0, DEFAULT_SCENE_CAMERA);
    const safe = elToroView(0, DEFAULT_SCENE_CAMERA, 1, 500 / 404);
    expect(safe.back).toEqual(requested.back);
    const uphillCamera = { yaw: 90, pitch: 0, lens: 1 };
    const uphill = elToroView(0, uphillCamera, 1, 500 / 404);
    const original = stageView(0, uphillCamera, 1, 500 / 404);
    expect(uphill.back[1]).toBeGreaterThan(original.back[1]);
    expect(uphill.right).toEqual(original.right);
    expect(uphill.anchor.x).toBeCloseTo(original.anchor.x, 8);
    expect(uphill.anchor.y).toBeCloseTo(original.anchor.y, 8);
    expect(uphill.focal / uphill.distance).toBeCloseTo(original.focal / original.distance, 8);
    target(uphill).forEach((value, i) => expect(value).toBeCloseTo(target(original)[i], 8));
  });

  it('centers the bottom shot on the rail and respects both buildings when orbiting that target', () => {
    const centerZ = -6 * 29;
    const view = elToroView(-STAIR_DROP, { yaw: -90, pitch: 6, lens: 1, targetZ: centerZ }, 0.63, 500 / 404);
    const center = projectThree(view, [0, target(view)[1], centerZ]);
    expect(center.x).toBeCloseTo(view.anchor.x, 8);
    expect(view.eye[2]).toBeCloseTo(centerZ, 8);
    for (const targetZ of [-174, 174]) {
      for (let yaw = -180; yaw < 180; yaw += 15) {
        const camera = { yaw, pitch: 6, lens: 1.6, targetZ };
        const framed = elToroView(0, camera, 1, 500 / 404);
        expect(target(framed)[2]).toBeCloseTo(targetZ, 8);
        expect(framed.eye[2]).toBeGreaterThanOrEqual(EL_TORO_CAMERA_MIN_Z - 1e-8);
        expect(framed.eye[2]).toBeLessThanOrEqual(EL_TORO_CAMERA_Z + 1e-8);
        const requested = stageView(0, camera, 1, 500 / 404);
        expect(framed.focal / framed.distance).toBeCloseTo(requested.focal / requested.distance, 8);
      }
    }
  });

  it('keeps the eye above the actual stairs and adjoining bank through landed and failed tricks', () => {
    let minimum = Infinity;
    for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as Stance[]) {
      for (const riderStance of ['regular', 'goofy'] as RiderStance[]) {
        for (const popHeight of [0.45, 1.15]) {
          for (const outcome of ['landed', 'slam', 'bail', 'shank'] as const) {
            const plan = planStage({ id: 'kickflip', name: 'Kickflip', base: 'Kickflip', stance }, {
              landed: outcome === 'landed', riderStance, style: { ...resolveSkateStyle(), popHeight },
              fall: outcome === 'landed' ? 'slam' : outcome, shankProgress: 0.65, set: 'el-toro',
            });
            for (let t = 0; t <= plan.end; t += 1 / 30) {
              const frame = stageFrame(plan, t, 1);
              for (let yaw = -180; yaw <= 180; yaw += 30) {
                for (const pitch of [0, 15, 60]) {
                  for (const lens of [0.65, 1.6]) {
                    for (const targetZ of [-174, 0, 174]) {
                      const view = elToroView(frame.lift, { yaw, pitch, lens, targetZ }, 1, 500 / 404);
                      const z = view.eye[2] + RIDER_LANE_Z;
                      const u = frame.scroll + view.eye[0];
                      const ground = z >= HILL_EDGE && z <= WALL_Z ? stairGround(u) : hill(u);
                      minimum = Math.min(minimum, view.eye[1] - ground);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(minimum).toBeGreaterThan(4);
  });
});
