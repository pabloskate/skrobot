import { describe, expect, it } from 'vitest';
import { planStage, stageFrame, type StageFrame } from './stage';
import { DEFAULT_SKATE_STYLE } from '../motion/style';
import { STAGE_SETS, setInfo, type StageSet } from '../sets/sets';
import { terrainSurface } from '../sets/elToro/stairs';
import { ASPHALT } from '../camera/view';
import { WHEEL_BOTTOM, WHEEL_X, WHEEL_Z } from '../board/board';
import { X0 } from '../motion/trick';
import type { RiderStance } from '../types';

const RIDERS: RiderStance[] = ['regular', 'goofy'];
const GAPS = ['Ollie', 'Kickflip', '360 Flip', 'Backside 180'];
const GRINDS = ['Backside 50-50 Grind', 'Frontside Boardslide', '360 Flip into Backside 50-50 Grind', 'Backside 5-0 Grind Kickflip Out'];

const plan = (base: string, set: StageSet, riderStance: RiderStance) => planStage(
  { id: base, name: base, base, stance: 'regular' },
  { landed: true, riderStance, style: DEFAULT_SKATE_STYLE, fall: 'slam', shankProgress: 0.5, set },
);

/** How far the lowest wheel is over the ground under it: 0 rolling on it, positive floating. */
function wheelGap(frame: StageFrame, ground: (along: number, across: number) => number, dir: 1 | -1): number {
  let low = Infinity;
  for (const x of [-WHEEL_X, WHEEL_X]) for (const z of [-WHEEL_Z, WHEEL_Z]) {
    const p = frame.rig.board.point({ x, y: WHEEL_BOTTOM, z });
    const along = (p.x - X0) + frame.scroll * dir;
    low = Math.min(low, ASPHALT - ground(along, (frame.stairs?.across ?? 0) + p.z) - p.y);
  }
  return low;
}

describe('rolling away', () => {
  for (const { id: set } of STAGE_SETS) {
    const info = setInfo(set);
    if (info.terrain) {
      it(`${set}: a gap trick down the stairs rides away with its wheels on the landing`, () => {
        for (const base of GAPS) for (const rider of RIDERS) {
          const stage = plan(base, set, rider);
          const stairs = stage.stairs!;
          for (let t = stairs.land + 0.05; t <= stage.end; t += 0.1) {
            const gap = wheelGap(stageFrame(stage, t, 1), (u, z) => terrainSurface(info.terrain!, u, z), stairs.dir);
            expect(gap, `${base} ${rider} at ${t.toFixed(2)}`).toBeLessThan(0.5);
          }
        }
      });
    }
    const rail = info.rails?.handrail;
    if (rail && info.grinds) {
      it(`${set}: a grind down the handrail rides away with its wheels on the landing, past the rail's end`, () => {
        for (const base of GRINDS) for (const rider of RIDERS) {
          const stage = plan(base, set, rider);
          const grind = stage.grind!;
          for (let t = grind.land + 0.02; t <= stage.end; t += 0.1) {
            const gap = wheelGap(stageFrame(stage, t, 1), (u) => rail.ground(u), 1);
            expect(gap, `${base} ${rider} at ${t.toFixed(2)}`).toBeLessThan(0.5);
          }
        }
      });
    }
  }
});
