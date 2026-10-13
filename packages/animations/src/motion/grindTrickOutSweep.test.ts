import { describe, it } from 'vitest';
import { SWEEP_TIMEOUT } from '../testing';
import { resolveSkateStyle } from './style';
import { solveGrindRig } from './grindRig';
import { everyExit, exitCombos, exitPlan, stepOf, sweepBar, sweepBounds } from './grindTesting';

/**
 * The heaviest sweep of a trick popped out of a grind
 * (grindTrickOut.test.ts), in a file of its own so it runs alongside the rest.
 */

describe('Trick out of grind', () => {
  it('never puts the board through the bar or its posts popping out', () => {
    const sweep = sweepBounds();
    const cases = [0.45, 1.15].flatMap((popHeight) => everyExit(['regular', 'fakie', 'switch']).map((combo) => ({ popHeight, ...combo })));
    for (const { popHeight, exit, end, base, side, rider, stance, label } of exitCombos(cases, (c) => c.popHeight)) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1 });
      const { plan, mechanics } = exitPlan(exit, end, base, side, stance, rider, null, style);
      for (let t = plan.off - 0.1; t <= plan.land; t += stepOf(1 / 60)) {
        const { rig, frame } = solveGrindRig(t, plan, mechanics, style);
        sweepBar(sweep, plan, rig, frame, () => `${label} pop ${popHeight} t=${t.toFixed(3)}`);
      }
    }
    sweep.verify();
  }, SWEEP_TIMEOUT);
});
