import { describe, expect, it } from 'vitest';
import { ROBOTS, buildBag, robotConsistency } from './robots';
import { TRICKS, TRICK_BY_ID, trickDiscipline } from '@/features/tricks';

describe('Robots repertoire and consistency math', () => {
  const byId = (id: string) => ROBOTS.find((r) => r.id === id)!;
  const shifty = byId('shifty');
  const baily = byId('baily');
  const flipster = byId('flipster');
  const flipper = byId('flipper');
  const tictac = byId('tictac');
  const lanky = byId('lanky');
  const droopy = byId('droopy');
  const olly = byId('olly');

  it('Shifty (shuvit specialist) only rolls/shuvits/rotates — including switch shuvits', () => {
    const bag = buildBag(shifty, TRICKS);
    const keys = Array.from(bag.keys());

    expect(keys.length).toBeGreaterThan(0);
    // Discipline filter guarantees only roll/shuvit/rotation tricks make the bag.
    for (const id of keys) {
      const disc = trickDiscipline(TRICK_BY_ID.get(id)!);
      expect(['roll', 'shuvit', 'rotation']).toContain(disc);
    }
    expect(bag.has('regular-pop-shuvit')).toBe(true);
    // Stance load on a shuvit is tiny, so even a beginner keeps switch shuvits.
    expect(bag.has('switch-pop-shuvit')).toBe(true);
    // No flips, grinds, or slides.
    expect(bag.has('regular-kickflip')).toBe(false);
    expect(bag.has('boardslide')).toBe(false);
  });

  it('Baily (falls with style) only has very basic tricks', () => {
    const bag = buildBag(baily, TRICKS);

    expect(bag.has('regular-ollie')).toBe(true);
    expect(bag.has('hippie-jump')).toBe(true);
    expect(bag.has('caveman')).toBe(true);
    expect(bag.has('manual')).toBe(true);
    expect(bag.has('powerslide')).toBe(true);
    expect(bag.has('regular-pop-shuvit')).toBe(true);
    expect(bag.has('regular-frontside-180')).toBe(true);

    // No flips or rail tricks.
    expect(bag.has('regular-kickflip')).toBe(false);
    expect(bag.has('regular-heelflip')).toBe(false);
    expect(bag.has('boardslide')).toBe(false);
    expect(bag.has('50-50-grind')).toBe(false);
  });

  it('Flipster (kickflip kid) has the kickflip AND the fundamentals under it, but no heelflip', () => {
    const bag = buildBag(flipster, TRICKS);
    expect(bag.has('regular-kickflip')).toBe(true);
    // The fix: a robot that can kickflip necessarily shuvits and does 180s.
    expect(bag.has('regular-pop-shuvit')).toBe(true);
    expect(bag.has('regular-frontside-180')).toBe(true);
    expect(bag.has('regular-ollie')).toBe(true);
    // Stylistic refusal + skill gate keep its flip game to just the kickflip.
    expect(bag.has('regular-heelflip')).toBe(false);
    expect(bag.has('regular-360-flip')).toBe(false);
  });

  it('Flipper (heels over head) mirrors Flipster — heelflip + fundamentals, no kickflip', () => {
    const bag = buildBag(flipper, TRICKS);
    expect(bag.has('regular-heelflip')).toBe(true);
    expect(bag.has('regular-pop-shuvit')).toBe(true);
    expect(bag.has('regular-kickflip')).toBe(false);
  });

  it('Tictac (old school cruiser) cruises in regular/fakie only, no flips', () => {
    const bag = buildBag(tictac, TRICKS);

    expect(bag.has('manual')).toBe(true);
    expect(bag.has('powerslide')).toBe(true);
    expect(bag.has('boneless')).toBe(true);
    expect(bag.has('caveman')).toBe(true);
    expect(bag.has('hippie-jump')).toBe(true);
    expect(bag.has('no-comply-180')).toBe(true);

    expect(bag.has('regular-kickflip')).toBe(false);
    expect(bag.has('regular-heelflip')).toBe(false);

    // Only regular/fakie stances allowed.
    expect(bag.has('fakie-ollie')).toBe(true);
    expect(bag.has('switch-ollie')).toBe(false);
    expect(bag.has('nollie')).toBe(false); // Nollie Ollie
  });

  it('Lanky (slides everything) has slides but no grinds', () => {
    const bag = buildBag(lanky, TRICKS);
    expect(bag.has('boardslide')).toBe(true);
    expect(bag.has('noseslide')).toBe(true);
    expect(bag.has('tailslide')).toBe(true);
    expect(bag.has('lipslide')).toBe(true);

    expect(bag.has('50-50-grind')).toBe(false);
    expect(bag.has('5-0-grind')).toBe(false);
    expect(bag.has('smith-grind')).toBe(false);
  });

  it('Droopy (locked-in grinds) has grinds but no slides', () => {
    const bag = buildBag(droopy, TRICKS);
    expect(bag.has('50-50-grind')).toBe(true);
    expect(bag.has('5-0-grind')).toBe(true);
    expect(bag.has('smith-grind')).toBe(true);
    expect(bag.has('crooked-grind')).toBe(true);

    expect(bag.has('boardslide')).toBe(false);
    expect(bag.has('noseslide')).toBe(false);
    expect(bag.has('tailslide')).toBe(false);
  });

  it('Olly has massive pop/spins but no flip tricks', () => {
    const bag = buildBag(olly, TRICKS);
    expect(bag.has('regular-ollie')).toBe(true);
    expect(bag.has('regular-backside-180')).toBe(true);
    expect(bag.has('regular-backside-360')).toBe(true);

    expect(bag.has('regular-kickflip')).toBe(false);
    expect(bag.has('regular-heelflip')).toBe(false);
    expect(bag.has('regular-360-flip')).toBe(false);
    expect(bag.has('regular-laser-flip')).toBe(false);
  });
});

describe('Skateboarding-soundness invariants', () => {
  it('no robot can kickflip without also having shuvits (learning order is respected)', () => {
    for (const robot of ROBOTS) {
      const bag = buildBag(robot, TRICKS);
      if (bag.has('regular-kickflip')) {
        expect(bag.has('regular-pop-shuvit'), `${robot.name} has a kickflip but no shuvit`).toBe(true);
        expect(bag.has('regular-ollie'), `${robot.name} has a kickflip but no ollie`).toBe(true);
      }
    }
  });

  it('stance load is trick-dependent: a switch shuvit is easier than a switch kickflip', () => {
    const skater = ROBOTS.find((r) => r.id === 'skater')!;
    const switchShuvit = robotConsistency(skater, TRICK_BY_ID.get('switch-pop-shuvit')!);
    const switchKickflip = robotConsistency(skater, TRICK_BY_ID.get('switch-kickflip')!);
    expect(switchShuvit).not.toBeNull();
    expect(switchKickflip).not.toBeNull();
    expect(switchShuvit!).toBeGreaterThan(switchKickflip!);
  });

  it('Nolly the nollie specialist lands nollie flips better than regular ones', () => {
    const nolly = ROBOTS.find((r) => r.id === 'nolly')!;
    const nollieKickflip = robotConsistency(nolly, TRICK_BY_ID.get('nollie-kickflip')!);
    const regularKickflip = robotConsistency(nolly, TRICK_BY_ID.get('regular-kickflip')!);
    expect(nollieKickflip).not.toBeNull();
    expect(regularKickflip).not.toBeNull();
    // The decoupling the whole rearchitecture is about: stance ≠ trick skill.
    expect(nollieKickflip!).toBeGreaterThan(regularKickflip!);
  });
});

describe('Tier-locked tricks: late shuvits are intermediate-and-up only', () => {
  const lateFs = TRICK_BY_ID.get('regular-late-frontside-shuvit')!;
  const lateBs = TRICK_BY_ID.get('regular-late-backside-shuvit')!;

  it('are in the catalog as shuvit-discipline tricks with a skill floor above the beginner tier', () => {
    expect(lateFs).toBeDefined();
    expect(lateBs).toBeDefined();
    expect(trickDiscipline(lateFs)).toBe('shuvit');
    expect(trickDiscipline(lateBs)).toBe('shuvit');
    // Floor must sit above the strongest beginner (Flipster/Flipper at skill 3.2).
    expect(lateFs.minSkill).toBeGreaterThan(3.2);
  });

  it('no beginner can land them — not even Shifty, whose shuvit focus would otherwise sneak it in', () => {
    for (const robot of ROBOTS.filter((r) => r.tier === 'beginner')) {
      expect(robotConsistency(robot, lateFs), `${robot.name} should not have the late FS shuvit`).toBeNull();
      expect(robotConsistency(robot, lateBs), `${robot.name} should not have the late BS shuvit`).toBeNull();
    }
    // Concretely: the hard floor (not difficulty) is what keeps it out of Shifty's bag.
    expect(buildBag(ROBOTS.find((r) => r.id === 'shifty')!, TRICKS).has('regular-late-frontside-shuvit')).toBe(false);
  });

  it('every intermediate-and-up robot gets a chance at them', () => {
    for (const robot of ROBOTS.filter((r) => r.tier !== 'beginner')) {
      expect(robotConsistency(robot, lateFs), `${robot.name} should have a shot at the late FS shuvit`).not.toBeNull();
      expect(robotConsistency(robot, lateBs), `${robot.name} should have a shot at the late BS shuvit`).not.toBeNull();
    }
  });
});

describe('Tier skill bands do not overlap', () => {
  const maxSkill = (tier: string) =>
    Math.max(...ROBOTS.filter((r) => r.tier === tier).map((r) => r.skill));
  const minSkill = (tier: string) =>
    Math.min(...ROBOTS.filter((r) => r.tier === tier).map((r) => r.skill));

  it('beginner max is below intermediate min', () => {
    expect(maxSkill('beginner')).toBeLessThan(minSkill('intermediate'));
  });

  it('intermediate max is below advanced min', () => {
    expect(maxSkill('intermediate')).toBeLessThan(minSkill('advanced'));
  });

  it('advanced max is below pro min', () => {
    expect(maxSkill('advanced')).toBeLessThan(minSkill('pro'));
  });

  it('pro tier exists and has at least one robot', () => {
    expect(ROBOTS.filter((r) => r.tier === 'pro').length).toBeGreaterThan(0);
  });
});

describe('Advanced vs pro consistency gap on tre flip', () => {
  const treFlip = TRICK_BY_ID.get('regular-360-flip')!;

  it('advanced bots land tre flips as a coin flip at best (<= 0.8)', () => {
    for (const robot of ROBOTS.filter((r) => r.tier === 'advanced')) {
      const c = robotConsistency(robot, treFlip);
      if (c !== null) {
        expect(c, `${robot.name} (advanced) tre flip consistency too high`).toBeLessThanOrEqual(0.8);
      }
    }
  });

  it('the best pro tre-flip consistency exceeds the best advanced tre-flip consistency', () => {
    const proConsistencies = ROBOTS.filter((r) => r.tier === 'pro')
      .map((r) => robotConsistency(r, treFlip))
      .filter((c): c is number => c !== null);
    const advConsistencies = ROBOTS.filter((r) => r.tier === 'advanced')
      .map((r) => robotConsistency(r, treFlip))
      .filter((c): c is number => c !== null);
    expect(Math.max(...proConsistencies)).toBeGreaterThan(Math.max(...advConsistencies));
  });

  it('flip-focused pro bots (C360PO, Tre) land tre flips at >= 0.8', () => {
    for (const id of ['c360po', 'tre']) {
      const robot = ROBOTS.find((r) => r.id === id)!;
      const c = robotConsistency(robot, treFlip);
      expect(c, `${robot.name} should have the tre flip`).not.toBeNull();
      expect(c!, `${robot.name} tre flip consistency too low`).toBeGreaterThanOrEqual(0.8);
    }
  });
});
