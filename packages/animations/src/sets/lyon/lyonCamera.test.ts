import { describe, expect, it } from 'vitest';
import { resolveSkateStyle } from '../../motion/style';
import { planStage, stageFrame } from '../../stage/stage';
import { Lyon3D } from './lyon3d';
import {
  LYON_FOOT as F, LYON_LEFT_Z, LYON_RIGHT_Z, lyonGround,
} from './lyonLayout';

describe('Lyon enclosed-courtyard cameras', () => {
  it('keeps the moving crane inside both walls and above the steps throughout the attempt', () => {
    const set = new Lyon3D();
    try {
      for (const riderStance of ['regular', 'goofy'] as const) {
        const plan = planStage({ id: 'ollie', name: 'Ollie', base: 'Ollie', stance: 'regular' }, {
          landed: true, riderStance, style: resolveSkateStyle(),
          fall: 'slam', shankProgress: 0.65, set: 'lyon-25',
        });
        for (const aspect of [500 / 404, 390 / 640]) for (const camera of [
          { yaw: -26, pitch: 9, lens: 1 }, { yaw: 55, pitch: 12, lens: 1 },
          { yaw: -150, pitch: 7, lens: 1.25 }, { yaw: 145, pitch: 9, lens: 1 },
        ]) for (let t = 0; t <= plan.end; t += 1 / 15) {
          const frame = stageFrame(plan, t, 1);
          const view = set.view(frame, camera, 1, aspect, null)!;
          const x = view.eye[0] + frame.scroll;
          const z = view.eye[2] + frame.stairs!.across;
          expect(view.eye.every(Number.isFinite)).toBe(true);
          expect(z).toBeGreaterThanOrEqual(LYON_LEFT_Z + 1.9 * F);
          expect(z).toBeLessThanOrEqual(LYON_RIGHT_Z - 7.9 * F);
          expect(view.eye[1], `ground clearance at t=${t}, yaw=${camera.yaw}`).toBeGreaterThan(lyonGround(x));
        }
      }
    } finally { set.dispose(); }
  });
});
