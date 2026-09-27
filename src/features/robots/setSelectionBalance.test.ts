import { describe, expect, it } from 'vitest';
import { TRICKS, TRICK_BY_ID } from '@/features/tricks';
import { ROBOTS, DEFENSE_ROBOTS, buildBag, trickSetWeight, trickDefenseSetWeight } from './index';

const regularBasics = ['regular-ollie', 'regular-pop-shuvit', 'regular-frontside-shuvit', 'regular-frontside-180', 'regular-backside-180'];
const hardOrPro = (tier: string) => tier === 'advanced' || tier === 'pro';

describe('authored set selection', () => {
  // Editorial guards on committed data, never runtime multipliers or caps.
  for (const [variant, robots, weightFor] of [
    ['classic', ROBOTS, trickSetWeight],
    ['defense', DEFENSE_ROBOTS, trickDefenseSetWeight],
  ] as const) {
    it(`${variant} bots rarely volunteer tricks below 30% consistency`, () => {
      for (const robot of robots) {
        const bag = buildBag(robot, TRICKS);
        let total = 0;
        let weak = 0;
        let settable = 0;
        for (const [id, rate] of bag) {
          const weight = weightFor(TRICK_BY_ID.get(id)!, robot);
          expect(Number.isFinite(weight), `${robot.name}: ${id}`).toBe(true);
          if (weight <= 0) continue;
          expect(rate, `${robot.name} cannot land ${id}`).toBeGreaterThan(0);
          total += weight;
          weak += rate < 0.3 ? weight : 0;
          settable++;
        }
        expect(settable, robot.name).toBeGreaterThanOrEqual(15);
        expect(weak / total, robot.name).toBeLessThan(0.01);
      }
    });

    it(`${variant} Hard/Pro sets avoid basic regular tricks`, () => {
      for (const robot of robots.filter(r => hardOrPro(r.tier))) {
        const bag = buildBag(robot, TRICKS);
        const total = [...bag.keys()].reduce((sum, id) => sum + weightFor(TRICK_BY_ID.get(id)!, robot), 0);
        const basics = regularBasics.reduce((sum, id) => sum + weightFor(TRICK_BY_ID.get(id)!, robot), 0);
        expect(basics / total, robot.name).toBeLessThan(0.005);
        for (const stance of ['regular', 'fakie', 'switch', 'nollie']) {
          expect(weightFor(TRICK_BY_ID.get(`${stance}-ollie`)!, robot), robot.name).toBe(0);
        }
      }
    });
  }

  it('keeps high-tier fundamentals available to copy even when never set', () => {
    for (const robot of ROBOTS.filter(r => hardOrPro(r.tier))) {
      const bag = buildBag(robot, TRICKS);
      for (const id of regularBasics) {
        expect(bag.get(id), `${robot.name}: ${id}`).toBeGreaterThan(0.7);
        expect(trickSetWeight(TRICK_BY_ID.get(id)!, robot)).toBe(0);
      }
    }
  });

  it('favors dependable specialties much more than a linear land-rate ratio', () => {
    const weight = (robotId: string, trickId: string) =>
      trickSetWeight(TRICK_BY_ID.get(trickId)!, { id: robotId });
    // Maestro's 95% tre vs 39% dolphin; Bouncer's 85% kickflip vs 37% hardflip.
    expect(weight('tre', 'regular-360-flip') / weight('tre', 'regular-dolphin-flip')).toBeGreaterThan(20);
    expect(weight('hesh', 'regular-kickflip') / weight('hesh', 'regular-hardflip')).toBeGreaterThan(10);
    // A family name is not a blanket favorite boost across every stance.
    expect(weight('c360po', 'regular-360-shuvit') / weight('c360po', 'switch-360-shuvit')).toBeGreaterThan(20);
    expect(weight('double', 'fakie-double-kickflip')).toBeGreaterThan(weight('double', 'regular-double-kickflip'));
    expect(weight('freely', 'switch-heelflip')).toBeGreaterThan(weight('freely', 'regular-heelflip'));
    expect(weight('laser', 'regular-varial-heelflip')).toBeGreaterThan(weight('laser', 'regular-360-flip'));
  });
});
