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

  it('Shifty (shuvit specialist) only rolls/shuvits/rotates — including switch shuvits', () => {
    const bag = buildBag(shifty, TRICKS);
    const keys = Array.from(bag.keys());

    expect(keys.length).toBeGreaterThan(0);
    // Discipline filter guarantees only Shifty's chosen families make the bag.
    for (const id of keys) {
      const disc = trickDiscipline(TRICK_BY_ID.get(id)!);
      expect(['roll', 'shuvit', 'rotation', 'flip']).toContain(disc);
    }
    expect(bag.has('regular-pop-shuvit')).toBe(true);
    // Stance load on a shuvit is tiny, so even a beginner keeps switch shuvits.
    expect(bag.has('switch-pop-shuvit')).toBe(true);
    // Kickflips are the one shaky exception: regular/fakie only, capped at 50%.
    expect(bag.has('regular-kickflip')).toBe(true);
    expect(bag.has('fakie-kickflip')).toBe(true);
    expect(bag.has('switch-kickflip')).toBe(false);
    expect(bag.has('nollie-kickflip')).toBe(false);
    expect(bag.get('regular-kickflip')).toBeLessThanOrEqual(0.5);
    expect(bag.get('fakie-kickflip')).toBeLessThanOrEqual(0.5);
    expect(bag.has('boardslide')).toBe(false);
  });

  it.each(['shifty', 'sacker'])('%s has only a shaky regular/fakie kickflip', (id) => {
    const robot = byId(id);
    const bag = buildBag(robot, TRICKS);
    expect(bag.get('regular-kickflip')).toBeDefined();
    expect(bag.get('fakie-kickflip')).toBeDefined();
    expect(bag.get('regular-kickflip')).toBeLessThanOrEqual(0.5);
    expect(bag.get('fakie-kickflip')).toBeLessThanOrEqual(0.5);
    expect(bag.has('switch-kickflip')).toBe(false);
    expect(bag.has('nollie-kickflip')).toBe(false);
  });

  it('Sacker has the requested trick-specific land rates', () => {
    const sacker = byId('sacker');
    const bag = buildBag(sacker, TRICKS);

    expect(bag.get('regular-heelflip')).toBe(0.35);
    expect(bag.get('regular-pop-shuvit')).toBe(0.68);
    expect(bag.get('fakie-pop-shuvit')).toBe(0.68);
    expect(bag.get('switch-backside-180')).toBe(0.1);
    expect(bag.get('regular-ollie')).toBe(0.9);
    expect(bag.get('nollie-ollie')).toBe(0.75);
    expect(bag.get('switch-ollie')).toBe(0.75);
  });

  it('Boomerang lands switch pop shuvits at exactly 50%', () => {
    const boomerang = byId('cabby');
    const bag = buildBag(boomerang, TRICKS);

    expect(bag.get('switch-pop-shuvit')).toBe(0.5);
  });

  it('caps switch pop shuvits at 50% for every beginner that has one', () => {
    const switchPopShuvit = TRICK_BY_ID.get('switch-pop-shuvit')!;

    for (const robot of ROBOTS.filter((candidate) => candidate.tier === 'beginner')) {
      const consistency = robotConsistency(robot, switchPopShuvit);
      if (consistency !== null) {
        expect(consistency, `${robot.name} should not exceed the beginner cap`).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('makes switch and nollie Ollie Norths a meaningful reach', () => {
    const regular = TRICK_BY_ID.get('regular-ollie-north')!;
    const switchNorth = TRICK_BY_ID.get('switch-ollie-north')!;
    const nollieNorth = TRICK_BY_ID.get('nollie-ollie-north')!;

    for (const robot of [byId('flipster'), byId('spine')]) {
      const regularRate = robotConsistency(robot, regular);
      const switchRate = robotConsistency(robot, switchNorth);
      const nollieRate = robotConsistency(robot, nollieNorth);

      expect(regularRate).not.toBeNull();
      expect(switchRate).not.toBeNull();
      expect(nollieRate).not.toBeNull();
      expect(switchRate!).toBeLessThan(regularRate!);
      expect(nollieRate!).toBeLessThan(regularRate!);
    }
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

  it('Kicker (kickflip kid) has the kickflip AND the fundamentals under it, but no heelflip', () => {
    const bag = buildBag(flipster, TRICKS);
    expect(bag.has('regular-kickflip')).toBe(true);
    expect(bag.get('regular-kickflip')).toBe(0.75);
    expect(bag.get('switch-kickflip')).toBe(0.15);
    expect(bag.get('nollie-kickflip')).toBe(0.15);
    // The fix: a robot that can kickflip necessarily shuvits and does 180s.
    expect(bag.has('regular-pop-shuvit')).toBe(true);
    expect(bag.has('regular-frontside-180')).toBe(true);
    expect(bag.has('regular-ollie')).toBe(true);
    // Stylistic refusal + skill gate keep its flip game to just the kickflip.
    expect(bag.has('regular-heelflip')).toBe(false);
    expect(bag.has('regular-360-flip')).toBe(false);
  });

  it('Flipper (heels over head) mirrors Kicker — heelflip + fundamentals, no kickflip', () => {
    const bag = buildBag(flipper, TRICKS);
    expect(bag.has('regular-heelflip')).toBe(true);
    expect(bag.has('regular-pop-shuvit')).toBe(true);
    expect(bag.has('regular-kickflip')).toBe(false);
    expect(bag.get('regular-varial-kickflip')).toBe(0.4);
    expect(bag.has('fakie-varial-kickflip')).toBe(false);
    expect(bag.has('switch-varial-kickflip')).toBe(false);
    expect(bag.has('nollie-varial-kickflip')).toBe(false);
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

  it('Cabby is fakie-first: half cabs and fakie shuvs over switch', () => {
    const cabby = byId('cabby');
    const bag = buildBag(cabby, TRICKS);
    const halfCab = robotConsistency(cabby, TRICK_BY_ID.get('fakie-backside-180')!);
    const regularBs180 = robotConsistency(cabby, TRICK_BY_ID.get('regular-backside-180')!);
    expect(halfCab).not.toBeNull();
    expect(regularBs180).not.toBeNull();
    expect(halfCab!).toBeGreaterThan(regularBs180!);
    expect(bag.has('regular-kickflip')).toBe(true);
    expect(bag.has('switch-kickflip')).toBe(false);
    expect(bag.has('fakie-kickflip')).toBe(false);
    expect(bag.has('regular-frontside-360')).toBe(false);
    expect(bag.has('regular-dolphin-flip')).toBe(false);
    expect(bag.has('fakie-dolphin-flip')).toBe(false);
    expect(bag.has('regular-frontside-heelflip')).toBe(false);
    expect(bag.has('fakie-frontside-heelflip')).toBe(false);
  });

  it('Fronty prefers frontside lines and still keeps pop shuvits under kickflips', () => {
    const bag = buildBag(byId('fronty'), TRICKS);
    expect(bag.has('regular-frontside-shuvit')).toBe(true);
    expect(bag.has('regular-frontside-180')).toBe(true);
    expect(bag.has('regular-pop-shuvit')).toBe(true);
    expect(bag.has('regular-kickflip')).toBe(true);
    expect(bag.has('regular-backside-180')).toBe(false);
    expect(bag.has('regular-backside-flip')).toBe(false);
  });

  it('Varial is mid-bag diagonal flips, not tres/hardflips', () => {
    const bag = buildBag(byId('varial'), TRICKS);
    expect(bag.has('regular-varial-kickflip')).toBe(true);
    expect(bag.has('regular-varial-heelflip')).toBe(true);
    expect(bag.has('fakie-varial-kickflip')).toBe(true);
    expect(bag.has('switch-varial-kickflip')).toBe(false);
    expect(bag.has('regular-360-flip')).toBe(false);
    expect(bag.has('regular-hardflip')).toBe(false);
  });

  it('Biggy is bigspin-first with limited flip depth', () => {
    const bag = buildBag(byId('biggy'), TRICKS);
    expect(bag.has('regular-bigspin')).toBe(true);
    expect(bag.has('regular-fs-bigspin')).toBe(true);
    expect(bag.has('regular-360-shuvit')).toBe(true);
    expect(bag.has('regular-hardflip')).toBe(false);
    expect(bag.has('regular-laser-flip')).toBe(false);
    expect(bag.has('switch-bigspin')).toBe(false);
  });

  it('Heelzy walks the heelflip path harder than the kickflip path', () => {
    const heelzy = byId('heelzy');
    const heel = robotConsistency(heelzy, TRICK_BY_ID.get('regular-heelflip')!);
    const kick = robotConsistency(heelzy, TRICK_BY_ID.get('regular-kickflip')!);
    expect(heel).not.toBeNull();
    expect(kick).not.toBeNull();
    expect(heel!).toBeGreaterThan(kick!);
    expect(buildBag(heelzy, TRICKS).has('regular-varial-heelflip')).toBe(true);
    expect(buildBag(heelzy, TRICKS).has('regular-360-flip')).toBe(false);
  });

  it('Fakie lands fakie 360s better than regular ones (signature stance shows on harder tricks)', () => {
    const fakie = byId('fakie');
    // Kickflips both cap out; full cabs are hard enough for the stance boost to matter.
    const fullCab = robotConsistency(fakie, TRICK_BY_ID.get('fakie-backside-360')!);
    const regularBs360 = robotConsistency(fakie, TRICK_BY_ID.get('regular-backside-360')!);
    expect(fullCab).not.toBeNull();
    expect(regularBs360).not.toBeNull();
    expect(fullCab!).toBeGreaterThan(regularBs360!);
  });

  it('Hardy has hardflips/inwards in regular+fakie, no lasers', () => {
    const bag = buildBag(byId('hardy'), TRICKS);
    expect(bag.has('regular-hardflip')).toBe(true);
    expect(bag.has('regular-inward-heelflip')).toBe(true);
    expect(bag.has('fakie-hardflip')).toBe(true);
    expect(bag.has('switch-hardflip')).toBe(false);
    expect(bag.has('regular-laser-flip')).toBe(false);
  });

  it('Switchy is stronger in switch than a typical advanced bot without switch comfort', () => {
    const switchy = byId('switchy');
    const hesh = byId('hesh');
    // Easy flips cap for both; switch hardflips are where comfort separates them.
    const switchHard = robotConsistency(switchy, TRICK_BY_ID.get('switch-hardflip')!);
    const heshSwitchHard = robotConsistency(hesh, TRICK_BY_ID.get('switch-hardflip')!);
    expect(switchHard).not.toBeNull();
    expect(heshSwitchHard).not.toBeNull();
    expect(switchHard!).toBeGreaterThan(heshSwitchHard!);
  });

  it('Latezy specializes in late shuvits/flips without elite lasers', () => {
    const bag = buildBag(byId('latezy'), TRICKS);
    expect(bag.has('regular-late-backside-shuvit')).toBe(true);
    expect(bag.has('regular-late-frontside-shuvit')).toBe(true);
    expect(bag.has('regular-late-kickflip')).toBe(true);
    expect(bag.has('switch-late-backside-shuvit')).toBe(false);
    expect(bag.has('regular-laser-flip')).toBe(false);
  });

  it('keeps Late Backside Shuvit to its explicit specialty robot', () => {
    const lateBackside = TRICK_BY_ID.get('regular-late-backside-shuvit')!;
    const specialist = byId('latezy');

    expect(robotConsistency(specialist, lateBackside)).not.toBeNull();
    for (const robot of ROBOTS.filter((candidate) => candidate.id !== specialist.id)) {
      expect(robotConsistency(robot, lateBackside), `${robot.name} should not carry the specialty trick`).toBeNull();
    }
  });

  it('Laser snipes laser flips; Impy wraps impossibles; Double deals doubles', () => {
    const laser = buildBag(byId('laser'), TRICKS);
    const impy = buildBag(byId('impy'), TRICKS);
    const dbl = buildBag(byId('double'), TRICKS);

    expect(laser.has('regular-laser-flip')).toBe(true);
    expect(laser.has('switch-laser-flip')).toBe(false);

    expect(impy.has('regular-impossible')).toBe(true);
    expect(impy.has('regular-pressure-flip')).toBe(true);
    expect(impy.has('switch-impossible')).toBe(false);

    expect(dbl.has('regular-double-kickflip')).toBe(true);
    expect(dbl.has('regular-360-double-kickflip')).toBe(true);
    expect(dbl.has('switch-double-kickflip')).toBe(false);
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

describe('Tier-locked tricks: late frontside shuvits are intermediate-and-up only', () => {
  const lateFs = TRICK_BY_ID.get('regular-late-frontside-shuvit')!;
  const lateBs = TRICK_BY_ID.get('regular-late-backside-shuvit')!;

  it('are in the catalog as shuvit-discipline tricks with a skill floor above the beginner tier', () => {
    expect(lateFs).toBeDefined();
    expect(lateBs).toBeDefined();
    expect(trickDiscipline(lateFs)).toBe('shuvit');
    expect(trickDiscipline(lateBs)).toBe('shuvit');
    // Floor must sit above the strongest beginner (Kicker/Flipper at skill 3.2).
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

  it('every intermediate-and-up robot gets a chance at the late frontside shuvit', () => {
    for (const robot of ROBOTS.filter(
      (r) => r.tier !== 'beginner' && !r.excludes?.includes('Late Backside Shuvit'),
    )) {
      expect(robotConsistency(robot, lateFs), `${robot.name} should have a shot at the late FS shuvit`).not.toBeNull();
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

  it('ROBOTS is sorted easiest to hardest by skill', () => {
    for (let i = 1; i < ROBOTS.length; i++) {
      expect(ROBOTS[i].skill).toBeGreaterThanOrEqual(ROBOTS[i - 1].skill);
    }
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

describe('FS bigspin flip rarity', () => {
  const fsBigspinFlip = TRICK_BY_ID.get('regular-fs-bigspin-flip')!;

  it('is elite-only and stays low probability even for pros', () => {
    expect(fsBigspinFlip.baseDifficulty).toBe(11.5);

    for (const robot of ROBOTS.filter((r) => r.tier !== 'pro')) {
      expect(
        robotConsistency(robot, fsBigspinFlip),
        `${robot.name} should not have FS bigspin flips`,
      ).toBeNull();
    }

    const proConsistencies = ROBOTS.filter((r) => r.tier === 'pro')
      .map((robot) => robotConsistency(robot, fsBigspinFlip))
      .filter((consistency): consistency is number => consistency !== null);

    expect(proConsistencies.length).toBeGreaterThan(0);
    expect(Math.max(...proConsistencies)).toBeLessThanOrEqual(0.45);
  });
});
