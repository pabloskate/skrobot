import { describe, expect, it } from 'vitest';
import { stageView, type StageView } from '../../camera/view';
import { planStage, stageFrame } from '../../stage/stage';
import { resolveSkateStyle } from '../../motion/style';
import { WALLENBERG_ANNEX_FRONT_X, WALLENBERG_ANNEX_HEIGHT, WALLENBERG_ANNEX_X, WALLENBERG_GYM_HEIGHT, WALLENBERG_GYM_X, WALLENBERG_GYM_Z, wallenbergSurface } from './wallenbergLayout';
import { wallenbergView } from './wallenbergCamera';

const target = (view: StageView) => view.eye.map((value, i) => value - view.back[i] * view.distance);
const DEG = 180 / Math.PI;

describe('Wallenberg crane', () => {
  it('films the roll-in from along the alley, never from inside the gym, the annex or the ground, keeping the framing', () => {
    for (const popHeight of [0.45, 1.15]) {
      const plan = planStage({ id: 'kickflip', name: 'Kickflip', base: 'Kickflip', stance: 'regular' }, {
        landed: true, riderStance: 'regular', style: { ...resolveSkateStyle(), popHeight },
        fall: 'slam', shankProgress: 0.65, set: 'wallenberg',
      });
      for (const camera of [
        { yaw: -26, pitch: 9, lens: 1 }, { yaw: 58, pitch: 14, lens: 0.85 }, { yaw: -70, pitch: 7, lens: 1 },
        { yaw: 0, pitch: 3, lens: 1.25 }, { yaw: -16, pitch: 5, lens: 2.2 }, { yaw: 25, pitch: 18, lens: 1.6 },
        { yaw: 120, pitch: 10, lens: 1 }, { yaw: -150, pitch: 10, lens: 1 },
      ]) {
        let previous: StageView | null = null;
        for (let t = 0; t <= plan.end; t += 1 / 60) {
          const frame = stageFrame(plan, t, 1);
          const view = wallenbergView(frame.lift, frame.scroll, camera, 1, 500 / 404);
          const [x, y, z] = [view.eye[0] + frame.scroll, view.eye[1], view.eye[2]];
          const at = `${JSON.stringify(camera)} at ${t.toFixed(2)}`;
          expect(view.eye.every(Number.isFinite), at).toBe(true);
          expect(x < WALLENBERG_GYM_X && z > WALLENBERG_GYM_Z && y < WALLENBERG_GYM_HEIGHT, `in the gym: ${at}`).toBe(false);
          expect(x < WALLENBERG_ANNEX_FRONT_X && x > WALLENBERG_ANNEX_X && y < WALLENBERG_ANNEX_HEIGHT && z < WALLENBERG_GYM_Z, `in the annex: ${at}`).toBe(false);
          expect(y, `under the ground: ${at}`).toBeGreaterThan(wallenbergSurface(x, z));
          // Same target and framing as asked for, wherever the crane had to go.
          const requested = stageView(frame.lift, camera, 1, 500 / 404);
          target(view).forEach((value, i) => expect(value).toBeCloseTo(target(requested)[i], 6));
          expect(view.focal / view.distance).toBeCloseTo(requested.focal / requested.distance, 6);
          // It swings, never snaps.
          if (previous) {
            const turn = Math.acos(Math.min(1, view.back.reduce((sum, v, i) => sum + v * previous!.back[i], 0))) * DEG * 60;
            expect(turn, `turning ${turn.toFixed(0)}°/s: ${at}`).toBeLessThan(90);
          }
          previous = view;
        }
      }
    }
  });

  it('is square to the line again by the pop for the stock view', () => {
    const plan = planStage({ id: 'kickflip', name: 'Kickflip', base: 'Kickflip', stance: 'regular' }, {
      landed: true, riderStance: 'regular', style: resolveSkateStyle(), fall: 'slam', shankProgress: 0.65, set: 'wallenberg',
    });
    const camera = { yaw: -26, pitch: 9, lens: 1 };
    const pop = stageFrame(plan, plan.stairs!.pop, 1);
    const view = wallenbergView(pop.lift, pop.scroll, camera, 1, 500 / 404);
    const requested = stageView(pop.lift, camera, 1, 500 / 404);
    view.back.forEach((value, i) => expect(value).toBeCloseTo(requested.back[i], 3));
  });
});
