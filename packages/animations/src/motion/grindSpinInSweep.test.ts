import { describe, it } from 'vitest';
import { SWEEP_TIMEOUT } from '../testing';
import type { FallVariant } from './trick';
import { deckTopY } from '../board/board';
import { solveGrindRig } from './grindRig';
import { SHIN, SHOE_HALF_HEIGHT, THIGH } from './skeleton';
import { NEUTRAL, dist, everySpin, jointJolts, joints, spinPlan, sweepBounds, sweepStage, toBoard } from './grindTesting';

/**
 * The body's sweep through a spin popped into a grind (grindSpinIn.test.ts),
 * in a file of its own so it runs alongside the rest.
 */

describe('Spin into grind', () => {
  it('never stretches a leg, keeps the soles on the grip off the hop, moves continuously, and stays in the stage', () => {
    const sweep = sweepBounds();
    const dt = 1 / 120;
    for (const { entry, base, side, rider, stance, label } of everySpin(['regular', 'fakie', 'nollie'])) {
      for (const fall of [null, 'slam', 'bail'] as Array<FallVariant | null>) {
        const { plan, mechanics } = spinPlan(entry, base, side, stance, rider, fall);
        const snaps = [plan.pop, plan.off];
        const jolt = jointJolts(sweep);
        for (let t = 0; t <= plan.end; t += dt) {
          const solved = solveGrindRig(t, plan, mechanics, NEUTRAL);
          const { rig, falling } = solved;
          const where = () => `${label} ${fall ?? 'landed'} t=${t.toFixed(3)}`;
          const nearSnap = snaps.some((s) => t > s - 0.09 && t < s + 2 * dt);
          jolt(joints(rig), nearSnap, (i) => `${where()} joint ${i}`);
          if (Math.round(t / dt) % 6 !== 0) continue;
          const dropping = plan.fail != null && t > plan.fail && t < plan.fail + plan.drop;
          for (const leg of rig.legs) {
            if (!dropping) {
              sweep.below('thigh length error', Math.abs(dist(leg.hip, leg.knee) - THIGH), 0.5e-6, where);
              sweep.below('shin length error', Math.abs(dist(leg.knee, leg.ankle) - SHIN), 0.5e-6, where);
            }
            if (falling || (t >= plan.pop && t < plan.lockAt)) continue;
            const sole = toBoard(rig, leg.shoe.at(0, -SHOE_HALF_HEIGHT, 0));
            sweep.below('sole height', Math.abs(sole.y - deckTopY(sole.x)), 0.5, () => `${where()} sole`);
          }
          sweepStage(sweep, plan, t, solved, where);
        }
      }
    }
    sweep.verify();
  }, SWEEP_TIMEOUT);
});
