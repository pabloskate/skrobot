import { describe, it } from 'vitest';
import { SWEEP_TIMEOUT } from '../testing';
import type { FallVariant } from './trick';
import { resolveSkateStyle } from './style';
import { solveGrindRig } from './grindRig';
import { entryCombos, entryPlan, everyEntry, jointJolts, joints, sweepBounds, sweepStage } from './grindTesting';

/**
 * The heaviest sweep of a trick popped into a grind (grindTrickIn.test.ts),
 * in a file of its own so it runs alongside the rest.
 */

describe('Trick into grind', () => {
  it('moves every joint continuously, and keeps the robot inside the stage', () => {
    const sweep = sweepBounds();
    const dt = 1 / 120;
    const cases = [0.45, 1.15].flatMap((popHeight) => [...everyEntry()]
      .filter(({ stance }) => stance !== 'fakie' && stance !== 'switch').map((combo) => ({ popHeight, ...combo })));
    for (const { popHeight, entry, base, side, rider, stance, label } of entryCombos(cases, (c) => c.popHeight)) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1.25 });
      for (const fall of [null, 'slam'] as Array<FallVariant | null>) {
        const { plan, mechanics } = entryPlan(entry, base, side, stance, rider, fall, style);
        const snaps = [plan.pop, plan.off];
        const jolt = jointJolts(sweep);
        for (let t = 0; t <= plan.end; t += dt) {
          const solved = solveGrindRig(t, plan, mechanics, style);
          const nearSnap = snaps.some((s) => t > s - 0.09 && t < s + 2 * dt);
          jolt(joints(solved.rig), nearSnap, (i) => `${label} ${fall ?? 'landed'} pop ${popHeight} joint ${i} t=${t.toFixed(3)}`);
          if (Math.round(t / dt) % 6 !== 0) continue;
          sweepStage(sweep, plan, t, solved, () => `${label} ${fall ?? 'landed'} pop ${popHeight} t=${t.toFixed(2)}`);
        }
      }
    }
    sweep.verify();
  }, SWEEP_TIMEOUT);
});
