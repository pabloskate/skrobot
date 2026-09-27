import { describe, expect, it } from 'vitest';
import { ROBOTS, buildBag, isFlatgroundRobot, robotDisplayRating, trickSetWeight } from './index';
import { TRICKS } from '@/features/tricks';

const flatground = TRICKS.filter((trick) => trick.category === 'flatground');
const bagFor = (id: string) => buildBag(ROBOTS.find((robot) => robot.id === id)!, flatground);

describe('authored robot consistency balance', () => {
  it('keeps every classic land rate a finite probability', () => {
    for (const robot of ROBOTS) {
      for (const [id, rate] of buildBag(robot, TRICKS)) {
        expect(Number.isFinite(rate), `${robot.name}: ${id}`).toBe(true);
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reserves near-certain landings for a small core, even at Hard and Pro', () => {
    for (const robot of ROBOTS.filter((r) => r.tier === 'advanced' || r.tier === 'pro')) {
      const bag = buildBag(robot, flatground);
      const rates = [...bag.values()];
      // Editorial regression guard against the old 97%-across-the-bag plateau.
      // This does not clamp or calculate any gameplay rate.
      expect(rates.filter((p) => p >= 0.9).length / rates.length, robot.name).toBeLessThan(0.12);
      expect(new Set(rates).size, robot.name).toBeGreaterThan(25);
      expect(bag.get('switch-bigspin'), robot.name).toBeLessThan(0.7);
      expect(bag.get('regular-360-shuvit'), robot.name).toBeLessThan(0.8);
    }
  });

  it('makes strengths depend on the trick and stance, not just the tier', () => {
    const echo = bagFor('switchy');
    const palindrome = bagFor('freely');
    const scope = bagFor('laser');
    const maestro = bagFor('tre');
    const houdini = bagFor('impy');
    const encore = bagFor('double');
    expect(echo.get('switch-heelflip')!).toBeGreaterThan(echo.get('regular-heelflip')!);
    expect(echo.get('switch-fs-bigspin')! - echo.get('switch-bigspin')!).toBeGreaterThan(0.15);
    expect(palindrome.get('switch-fs-bigspin')!).toBeGreaterThan(palindrome.get('regular-fs-bigspin')!);
    expect(scope.get('regular-laser-flip')! - scope.get('regular-hardflip')!).toBeGreaterThan(0.25);
    expect(maestro.get('regular-360-flip')! - maestro.get('regular-varial-heelflip')!).toBeGreaterThan(0.25);
    expect(houdini.get('regular-impossible')! - maestro.get('regular-impossible')!).toBeGreaterThan(0.3);
    expect(encore.get('fakie-double-kickflip')! - scope.get('fakie-double-kickflip')!).toBeGreaterThan(0.3);
    expect(bagFor('caball').get('fakie-backside-360')!).toBeGreaterThan(palindrome.get('fakie-backside-360')!);
  });

  it.each([
    ['freely', 0.73, 0.77],
    ['impy', 0.78, 0.82],
    ['tre', 0.84, 0.89],
    ['double', 0.84, 0.88],
    ['c360po', 0.83, 0.87],
    ['laser', 0.83, 0.87],
  ] as const)('keeps %s reliably setting without near-certain outcomes', (id, min, max) => {
    const robot = ROBOTS.find((candidate) => candidate.id === id)!;
    const bag = buildBag(robot, flatground);
    let landedWeight = 0;
    let totalWeight = 0;
    for (const trick of flatground) {
      const rate = bag.get(trick.id);
      if (rate === undefined) continue;
      const weight = trickSetWeight(trick, robot);
      landedWeight += weight * rate;
      totalWeight += weight;
    }
    expect(landedWeight / totalWeight).toBeGreaterThanOrEqual(min);
    expect(landedWeight / totalWeight).toBeLessThanOrEqual(max);
  });

  it('calibrates Pro from the previous Palindrome level to roughly 2000 displayed', () => {
    const ratings = ROBOTS.filter((robot) => robot.tier === 'pro' && isFlatgroundRobot(robot))
      .map((robot) => robotDisplayRating(robot)!);
    expect(Math.min(...ratings)).toBeGreaterThanOrEqual(1850);
    expect(Math.min(...ratings)).toBeLessThanOrEqual(1900);
    expect(Math.max(...ratings)).toBeGreaterThanOrEqual(1980);
    expect(Math.max(...ratings)).toBeLessThanOrEqual(2040);
  });
});
