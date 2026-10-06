import { describe, expect, it } from 'vitest';
import { stageView, type StageView } from '../../camera/view';
import { planStage, stageFrame } from '../../stage/stage';
import { resolveSkateStyle } from '../../motion/style';
import { WALLENBERG_SCHOOL_X } from './wallenbergLayout';
import { wallenbergView } from './wallenbergCamera';

const target = (view: StageView) => view.eye.map((value, i) => value - view.back[i] * view.distance);

describe('Wallenberg camera clearance', () => {
  it('keeps uphill orbits in front of the school from approach through ride-away', () => {
    for (const popHeight of [0.45, 1.15]) {
      const plan = planStage({ id: 'kickflip', name: 'Kickflip', base: 'Kickflip', stance: 'regular' }, {
        landed: true, riderStance: 'regular', style: { ...resolveSkateStyle(), popHeight },
        fall: 'slam', shankProgress: 0.65, set: 'wallenberg',
      });
      for (let t = 0; t <= plan.end; t += 0.05) {
        const frame = stageFrame(plan, t, 1);
        for (const yaw of [25, 55, 90, 120, 150]) {
          const camera = { yaw, pitch: 18, lens: 1.6 };
          const view = wallenbergView(frame.lift, frame.scroll, camera, 1, 500 / 404);
          expect(frame.scroll + view.eye[0]).toBeGreaterThanOrEqual(WALLENBERG_SCHOOL_X + 12 - 1e-6);
          expect(view.eye.every(Number.isFinite)).toBe(true);
          const requested = stageView(frame.lift, camera, 1, 500 / 404);
          target(view).forEach((value, i) => expect(value).toBeCloseTo(target(requested)[i], 6));
          expect(view.focal / view.distance).toBeCloseTo(requested.focal / requested.distance, 6);
        }
      }
    }
  });
});
