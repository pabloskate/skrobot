import { describe, expect, it } from 'vitest';
import { THIGH, SHIN } from '../motion/skeleton';
import { TRICK_BASES } from '../motion/trick';
import type { StageSet } from '../sets/sets';
import { resolveSkateStyle } from '../motion/style';
import { HUMAN_THIGH, HUMAN_SHIN } from '../riders/human/humanGeometry';
import type { Skater } from '../riders/skaters';
import type { RiderStance, Stance } from '../types';
import { sub3, type V3 } from '../math';
import { solePenetration } from '../board/footContact';
import { planStage, stageFrame } from './stage';

const distance = (a: V3, b: V3) => { const d = sub3(a, b); return Math.hypot(d.x, d.y, d.z); };

describe('bank landing anatomy', () => {
  it('preserves each rider’s thigh and shin through the bank landing and rollout', () => {
    const failures: string[] = [];
    for (const skater of ['robot', 'human', 'humanoid'] as Skater[]) {
      const thigh = skater === 'robot' ? THIGH : HUMAN_THIGH;
      const shin = skater === 'robot' ? SHIN : HUMAN_SHIN;
      for (const riderStance of ['regular', 'goofy'] as RiderStance[]) {
        for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as Stance[]) {
          for (const base of TRICK_BASES) {
            const plan = planStage({ id: base, name: base, base, stance }, {
              skater, riderStance, set: 'sunset-car-wash', landed: true,
              style: resolveSkateStyle(), fall: 'slam', shankProgress: 0.65,
            });
            for (let t = plan.stairs!.land - 0.15; t <= plan.end; t += 1 / 30) {
              const { legs } = stageFrame(plan, t, 1).rig;
              for (const leg of legs) {
                const error = Math.max(Math.abs(distance(leg.hip, leg.knee) - thigh), Math.abs(distance(leg.knee, leg.ankle) - shin));
                if (error > 1e-5) failures.push(`${skater}/${riderStance}/${stance}/${base} at ${t.toFixed(3)} ${leg.side}: ${error.toFixed(3)}`);
              }
            }
          }
        }
      }
    }
    expect(failures.slice(0, 12)).toEqual([]);
  }, 60_000);

  it('keeps landing knees continuous as ground contact turns on and preserves sole clearance', () => {
    const failures: string[] = [];
    for (const skater of ['robot', 'human'] as Skater[]) for (const riderStance of ['regular', 'goofy'] as RiderStance[]) {
      for (const base of TRICK_BASES) {
        const plan = planStage({ id: base, name: base, base, stance: 'regular' }, {
          skater, riderStance, set: 'sunset-car-wash', landed: true,
          style: resolveSkateStyle(), fall: 'slam', shankProgress: 0.65,
        });
        for (let t = plan.stairs!.land; t <= plan.end; t += 1 / 60) {
          const before = stageFrame(plan, t - 1e-5, 1).rig;
          const after = stageFrame(plan, t + 1e-5, 1).rig;
          for (let i = 0; i < 2; i++) {
            const movement = distance(before.legs[i].knee, after.legs[i].knee);
            if (movement > 0.05) failures.push(`${skater}/${riderStance}/${base} knee jump at ${t.toFixed(3)}: ${movement.toFixed(3)}`);
            expect(solePenetration(after, after.legs[i])).toBeLessThan(1e-5);
          }
        }
      }
    }
    expect(failures.slice(0, 12)).toEqual([]);
  });


  it('keeps each skater’s anatomy and the same board/ankles in every stage pipeline', () => {
    const failures: string[] = [];
    const scenarios: Array<[StageSet, string[]]> = [
      ['plaza', ['Bigspin Flip', 'Frontside 50-50 Grind', 'Kickflip into Backside Boardslide']],
      ['el-toro', ['Frontside Heelflip', 'Frontside 50-50 Grind', 'Kickflip into Backside Boardslide']],
      ['hollywood-high', ['Frontside Heelflip', 'Frontside 50-50 Grind']],
      ['wallenberg', ['Bigspin Flip']],
      ['sunset-car-wash', ['Bigspin Flip', 'Frontside Heelflip', 'Impossible']],
    ];
    for (const [set, bases] of scenarios) for (const base of bases) {
      for (const riderStance of ['regular', 'goofy'] as RiderStance[]) for (const stance of ['regular', 'fakie'] as Stance[]) {
        const options = { set, riderStance, landed: true, style: resolveSkateStyle(), fall: 'slam' as const, shankProgress: 0.65 };
        const trick = { id: base, name: base, base, stance };
        const robot = planStage(trick, options);
        const human = planStage(trick, { ...options, skater: 'human' });
        for (let sample = 0; sample <= 30; sample++) {
          const t = robot.end * sample / 30;
          const a = stageFrame(robot, t, 1).rig;
          const b = stageFrame(human, t, 1).rig;
          const context = `${set}/${base}/${riderStance}/${stance} at ${t.toFixed(3)}`;
          if (distance(a.board.center, b.board.center) > 1e-6) failures.push(`${context}: board differs`);
          for (let i = 0; i < 2; i++) {
            const r = a.legs[i], h = b.legs[i];
            if (distance(r.ankle, h.ankle) > 1e-6) failures.push(`${context}: ankle differs`);
            const error = Math.max(Math.abs(distance(h.hip, h.knee) - HUMAN_THIGH), Math.abs(distance(h.knee, h.ankle) - HUMAN_SHIN));
            if (error > 1e-5) failures.push(`${context}: bone length changed`);
          }
        }
      }
    }
    expect(failures.slice(0, 12)).toEqual([]);
  });

});
