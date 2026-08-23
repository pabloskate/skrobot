import { afterEach, describe, expect, it } from 'vitest';
import { TRICK_BY_ID } from '@/features/tricks';
import { ROBOTS, ROBOT_BY_ID, robotConsistency, trickSetWeight } from './robots';
import { TUNED_CONSISTENCY, TUNED_SET_WEIGHTS, exportTuningTs } from './tuning';

const achilles = ROBOT_BY_ID.get('heelzy')!;
const regularHeelflip = TRICK_BY_ID.get('regular-heelflip')!;

afterEach(() => {
  delete TUNED_CONSISTENCY.test;
  delete TUNED_SET_WEIGHTS.test;
});

describe('explicit robot behavior', () => {
  it('has valid land rates and set weights for every roster robot', () => {
    for (const robot of ROBOTS) {
      const consistencies = TUNED_CONSISTENCY[robot.id];
      const weights = TUNED_SET_WEIGHTS[robot.id];
      expect(consistencies, `${robot.name} consistency table`).toBeDefined();
      expect(weights, `${robot.name} set-weight table`).toBeDefined();
      expect(Object.keys(weights).sort()).toEqual(Object.keys(consistencies).sort());
      for (const rate of Object.values(consistencies)) {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(1);
      }
      for (const weight of Object.values(weights)) expect(weight).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses only the exact robot/trick consistency entry', () => {
    const testRobot = { ...achilles, id: 'test', skill: 100, favorites: [] };
    expect(robotConsistency(testRobot, regularHeelflip)).toBeNull();

    TUNED_CONSISTENCY.test = { 'regular-heelflip': 0.25 };
    expect(robotConsistency(testRobot, regularHeelflip)).toBe(0.25);

    // Former behavior fields do not change the configured number.
    expect(robotConsistency({ ...testRobot, skill: 0, favorites: ['Heelflip'] }, regularHeelflip))
      .toBe(0.25);
  });

  it('uses only the exact robot/trick set-weight entry', () => {
    const testRobot = { id: 'test' };
    expect(trickSetWeight(regularHeelflip, testRobot)).toBe(0);

    TUNED_SET_WEIGHTS.test = { 'regular-heelflip': 5 };
    expect(trickSetWeight(regularHeelflip, testRobot)).toBe(5);
  });

  it('exports one complete robot block', () => {
    TUNED_CONSISTENCY.test = { 'regular-heelflip': 0.25 };
    TUNED_SET_WEIGHTS.test = { 'regular-heelflip': 2 };

    const ts = exportTuningTs('test');
    expect(ts).toContain('ROBOT_CONSISTENCY');
    expect(ts).toContain("'regular-heelflip': 0.25");
    expect(ts).toContain('ROBOT_SET_WEIGHTS');
    expect(ts).toContain("'regular-heelflip': 2");
  });
});
