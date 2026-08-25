import { describe, expect, it } from 'vitest';
import { ROBOTS, buildBag, isFlatgroundRobot, robotConsistency, robotDisplayRating, trickSetWeight } from './robots';
import { TRICKS, TRICK_BY_ID, trickDiscipline } from '@/features/tricks';
import { DEFENSE_CONSISTENCY, ROBOT_CONSISTENCY, ROBOT_DEFENSE_SET_WEIGHTS, ROBOT_SET_WEIGHTS } from './behavior';

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
    // Its explicit table contains only tricks that fit the intended bag.
    for (const id of keys) {
      const disc = trickDiscipline(TRICK_BY_ID.get(id)!);
      expect(['roll', 'shuvit', 'rotation', 'flip']).toContain(disc);
    }
    expect(bag.has('regular-pop-shuvit')).toBe(true);
    // Switch shuvits are explicitly part of this beginner's bag.
    expect(bag.has('switch-pop-shuvit')).toBe(true);
    // Regular is solid, fakie is shaky, and switch/nollie are absent.
    expect(bag.has('regular-kickflip')).toBe(true);
    expect(bag.has('fakie-kickflip')).toBe(true);
    expect(bag.has('switch-kickflip')).toBe(false);
    expect(bag.has('nollie-kickflip')).toBe(false);
    expect(bag.get('regular-kickflip')).toBe(0.7);
    expect(bag.get('fakie-kickflip')).toBe(0.38);
    expect(bag.has('boardslide')).toBe(false);
  });

  it.each(['sacker'])('%s has only a shaky regular/fakie kickflip', (id) => {
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
    expect(bag.get('switch-backside-180')).toBe(0);
    expect(bag.get('regular-ollie')).toBe(0.9);
    expect(bag.get('nollie-ollie')).toBe(0.4);
    expect(bag.get('switch-ollie')).toBe(0.6);
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
    // Its explicit flip bag stops at kickflips.
    expect(bag.has('regular-heelflip')).toBe(false);
    expect(bag.has('regular-360-flip')).toBe(false);
  });

  it('Flipper (heels over head) mirrors Kicker — heelflip + fundamentals, kickflip hand-tuned', () => {
    const bag = buildBag(flipper, TRICKS);
    expect(bag.has('regular-heelflip')).toBe(true);
    expect(bag.has('regular-pop-shuvit')).toBe(true);
    // Kickflip is hand-tuned into Flipper's bag at 40%.
    expect(bag.get('regular-kickflip')).toBe(0.4);
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
    // Fakie kickflip is hand-tuned into Cabby's bag at 50%.
    expect(bag.get('fakie-kickflip')).toBe(0.5);
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
    expect(bag.get('regular-360-flip')).toBe(0.4);
  });

  it("Achilles' heelflip is his literal weakness — kickflips fine, heels shaky", () => {
    const heelzy = byId('heelzy');
    const heel = robotConsistency(heelzy, TRICK_BY_ID.get('regular-heelflip')!);
    const kick = robotConsistency(heelzy, TRICK_BY_ID.get('regular-kickflip')!);
    expect(heel).not.toBeNull();
    expect(kick).not.toBeNull();
    expect(kick!).toBeGreaterThan(0.7);
    expect(heel!).toBeLessThanOrEqual(0.3);
    expect(heel!).toBeLessThan(kick!);
    // Every heel variant that stays in the bag stays shaky; kickflip stays.
    const bag = buildBag(heelzy, TRICKS);
    for (const [id, c] of bag) {
      if (/heelflip/.test(id)) expect(c!).toBeLessThanOrEqual(0.3);
    }
    expect(bag.has('regular-kickflip')).toBe(true);
    expect(bag.get('regular-360-flip')).toBe(0.42);
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

describe('robot catalog integrity', () => {
  it('keeps every favorite on a real base trick', () => {
    const bases = new Set(TRICKS.map((trick) => trick.base));
    for (const robot of ROBOTS) {
      for (const favorite of robot.favorites) {
        expect(bases.has(favorite), `${robot.id} favorite ${favorite}`).toBe(true);
      }
    }
  });

  it('keeps every behavior-table key on a real trick id', () => {
    for (const table of [ROBOT_CONSISTENCY, ROBOT_SET_WEIGHTS, DEFENSE_CONSISTENCY, ROBOT_DEFENSE_SET_WEIGHTS]) {
      for (const [robotId, behavior] of Object.entries(table)) {
        for (const trickId of Object.keys(behavior)) {
          expect(TRICK_BY_ID.has(trickId), `${robotId} behavior key ${trickId}`).toBe(true);
        }
      }
    }
  });
});

describe('Explicit robot personality examples', () => {
  it('Nolly the nollie specialist lands nollie flips better than regular ones', () => {
    const nolly = ROBOTS.find((r) => r.id === 'nolly')!;
    const nollieKickflip = robotConsistency(nolly, TRICK_BY_ID.get('nollie-kickflip')!);
    const regularKickflip = robotConsistency(nolly, TRICK_BY_ID.get('regular-kickflip')!);
    expect(nollieKickflip).not.toBeNull();
    expect(regularKickflip).not.toBeNull();
    expect(nollieKickflip!).toBeGreaterThan(regularKickflip!);
  });

  it('keeps 360 Flips out of every beginner bag', () => {
    const variants = ['regular', 'fakie', 'switch', 'nollie'].map(
      (stance) => TRICK_BY_ID.get(`${stance}-360-flip`)!,
    );
    for (const robot of ROBOTS.filter((candidate) => candidate.tier === 'beginner')) {
      for (const trick of variants) {
        expect(robotConsistency(robot, trick), `${robot.name} / ${trick.id}`).toBeNull();
      }
    }
  });

  it('gives intermediate flatground robots individual 360 Flip bags', () => {
    const expectedStances: Record<string, string[]> = {
      heelzy: ['regular', 'fakie'],
      varial: [],
      biggy: ['regular', 'fakie'],
      nolly: ['nollie'],
      fakie: ['fakie'],
    };

    for (const [robotId, expected] of Object.entries(expectedStances)) {
      const robot = ROBOTS.find((candidate) => candidate.id === robotId)!;
      const actual = ['regular', 'fakie', 'switch', 'nollie'].filter((stance) =>
        robotConsistency(robot, TRICK_BY_ID.get(`${stance}-360-flip`)!) !== null,
      );
      expect(actual, robot.name).toEqual(expected);
    }

    const cyclone = ROBOTS.find((robot) => robot.id === 'biggy')!;
    const regularTre = TRICK_BY_ID.get('regular-360-flip')!;
    expect(robotConsistency(cyclone, regularTre)).toBe(0.4);
    expect(trickSetWeight(regularTre, cyclone)).toBe(0.86);
  });
});

describe('Player-only tricks stay in the catalog but never enter a robot bag', () => {
  const fs360Kickflip = TRICK_BY_ID.get('regular-frontside-360-kickflip')!;

  it('Frontside 360 Kickflip exists for players/gallery', () => {
    expect(fs360Kickflip).toBeDefined();
    expect(fs360Kickflip.base).toBe('Frontside 360 Kickflip');
  });

  it('no robot can set or land a Frontside 360 Kickflip in any stance', () => {
    const variants = ['regular', 'fakie', 'switch', 'nollie'].map(
      (stance) => TRICK_BY_ID.get(`${stance}-frontside-360-kickflip`)!,
    );
    for (const robot of ROBOTS) {
      const bag = buildBag(robot, TRICKS);
      for (const trick of variants) {
        expect(robotConsistency(robot, trick), `${robot.name} / ${trick.id}`).toBeNull();
        expect(bag.has(trick.id), `${robot.name} bag has ${trick.id}`).toBe(false);
      }
    }
  });
});

describe('Roster metadata', () => {
  it('pro tier exists and has at least one robot', () => {
    expect(ROBOTS.filter((r) => r.tier === 'pro').length).toBeGreaterThan(0);
  });

  it('orders the routed flatground roster easiest to hardest by calibrated Elo', () => {
    const calibrated = ROBOTS.filter(isFlatgroundRobot);
    expect(calibrated.every((robot) => robot.elo !== undefined)).toBe(true);
    for (let i = 1; i < calibrated.length; i++) {
      expect(calibrated[i].elo!).toBeGreaterThanOrEqual(calibrated[i - 1].elo!);
    }
  });

  it('maps raw Elo onto stable, rounded product ratings', () => {
    expect(robotDisplayRating({ elo: -145 })).toBe(800);
    expect(robotDisplayRating({ elo: 3095 })).toBe(2400);
    expect(robotDisplayRating({ elo: 1949 })).toBe(1830);
    expect(robotDisplayRating({})).toBeNull();
  });
});

describe('trickSetWeight', () => {
  const byId = (id: string) => ROBOTS.find((r) => r.id === id)!;
  const kickflip = TRICK_BY_ID.get('regular-kickflip')!;
  const ollieNorth = TRICK_BY_ID.get('regular-ollie-north')!;
  const lateKickflip = TRICK_BY_ID.get('regular-late-kickflip')!;
  const sparky = byId('flipster');
  const snooze = byId('latezy');
  const swivel = byId('shifty');

  it('returns the exact configured robot/trick weight', () => {
    expect(trickSetWeight(kickflip, sparky)).toBe(1.7879999999999998);
    expect(trickSetWeight(lateKickflip, snooze)).toBe(1.24848);
    expect(trickSetWeight(ollieNorth, swivel)).toBe(0.30512300000000003);
  });

  it('returns 0 when a robot has no configured weight for a trick', () => {
    expect(trickSetWeight(TRICK_BY_ID.get('boardslide')!, sparky)).toBe(0);
  });

  it('lets generated robots copy one explicit roster behavior table', () => {
    expect(trickSetWeight(kickflip, { id: 'rival', behaviorId: sparky.id }))
      .toBe(trickSetWeight(kickflip, sparky));
  });
});
