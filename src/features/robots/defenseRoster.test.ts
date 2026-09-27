import { describe, expect, it } from 'vitest';
import { TRICKS, TRICK_BY_ID } from '@/features/tricks';
import { DEFENSE_CONSISTENCY, ROBOT_DEFENSE_SET_WEIGHTS } from './behavior';
import {
  DEFENSE_ROBOTS,
  hasDefenseSets,
  ROBOTS,
  robotConsistency,
  TIERS,
  trickDefenseSetWeight,
  trickSetWeight,
} from './robots';

const classicIds = new Set(ROBOTS.map((r) => r.id));
const defenseIds = new Set(DEFENSE_ROBOTS.map((r) => r.id));

describe('defense roster', () => {
  it('is disjoint from the classic roster and covers every tier', () => {
    for (const id of defenseIds) expect(classicIds.has(id)).toBe(false);
    for (const { tier } of TIERS) {
      expect(DEFENSE_ROBOTS.filter((r) => r.tier === tier).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('has a set table for every robot, big enough to never run dry', () => {
    for (const robot of DEFENSE_ROBOTS) {
      const consistency = DEFENSE_CONSISTENCY[robot.id];
      const weights = ROBOT_DEFENSE_SET_WEIGHTS[robot.id];
      expect(consistency, `${robot.name} consistency table`).toBeDefined();
      expect(weights, `${robot.name} defense set-weight table`).toBeDefined();
      // A defense game can run 9 rounds (first to 5 losses); the bot needs a
      // settable trick for every one of them — with room to spare so rematches
      // don't feel identical.
      expect(Object.keys(weights).length, robot.name).toBeGreaterThanOrEqual(15);
      for (const [trickId, weight] of Object.entries(weights)) {
        expect(consistency[trickId], `${robot.name} sets ${trickId}`).toBeDefined();
        expect(weight).toBeGreaterThan(0);
      }
    }
  });

  it('never sets ollies past the easy tier — an ollie set is a free letter', () => {
    for (const robot of DEFENSE_ROBOTS) {
      if (robot.tier === 'beginner') continue;
      for (const trickId of Object.keys(ROBOT_DEFENSE_SET_WEIGHTS[robot.id]!)) {
        const base = TRICK_BY_ID.get(trickId)!.base;
        expect(base, `${robot.name}: ${trickId}`).not.toBe('Ollie');
        expect(base, `${robot.name}: ${trickId}`).not.toBe('Ollie North');
      }
    }
  });

  it('never carries or sets late backside shuvits', () => {
    for (const robot of DEFENSE_ROBOTS) {
      expect(
        Object.keys(DEFENSE_CONSISTENCY[robot.id]!).some((trickId) =>
          trickId.endsWith('-late-backside-shuvit'),
        ),
        `${robot.name} consistency table`,
      ).toBe(false);
      expect(
        Object.keys(ROBOT_DEFENSE_SET_WEIGHTS[robot.id]!).some((trickId) =>
          trickId.endsWith('-late-backside-shuvit'),
        ),
        `${robot.name} set-weight table`,
      ).toBe(false);
    }
  });

  it('gives every hard robot some foundational flip and 180 sets', () => {
    for (const robot of DEFENSE_ROBOTS.filter((candidate) => candidate.tier === 'advanced')) {
      const settableBases = new Set(
        Object.keys(ROBOT_DEFENSE_SET_WEIGHTS[robot.id]!).map(
          (trickId) => TRICK_BY_ID.get(trickId)!.base,
        ),
      );
      expect(settableBases.has('Kickflip'), `${robot.name} kickflip`).toBe(true);
      expect(settableBases.has('Heelflip'), `${robot.name} heelflip`).toBe(true);
      expect(settableBases.has('Frontside 180'), `${robot.name} frontside 180`).toBe(true);
      expect(settableBases.has('Backside 180'), `${robot.name} backside 180`).toBe(true);
    }
  });

  it('keeps Deadbolt off-stance sets focused on 180s instead of kickflips or varials', () => {
    const deadboltSets = ROBOT_DEFENSE_SET_WEIGHTS.deadbolt!;
    for (const stance of ['nollie', 'switch'] as const) {
      expect(deadboltSets[`${stance}-frontside-180`]).toBeGreaterThan(0);
      expect(deadboltSets[`${stance}-backside-180`]).toBeGreaterThan(0);
      expect(deadboltSets[`${stance}-kickflip`]).toBeUndefined();
      expect(
        Object.keys(deadboltSets).some((trickId) =>
          trickId.startsWith(`${stance}-varial-`),
        ),
      ).toBe(false);
    }
  });

  it('keeps Rampart grounded with regular shuvits and 180s', () => {
    const rampartSets = ROBOT_DEFENSE_SET_WEIGHTS.rampart!;
    for (const trickId of [
      'regular-pop-shuvit',
      'regular-frontside-shuvit',
      'regular-frontside-180',
      'regular-backside-180',
    ]) {
      expect(rampartSets[trickId], trickId).toBeGreaterThan(0);
    }
    for (const trickId of [
      'switch-bigspin',
      'switch-360-shuvit',
      'nollie-360-shuvit',
      'regular-fs-bigspin',
    ]) {
      expect(rampartSets[trickId], trickId).toBeUndefined();
    }
  });

  it('gives Turnstile nollie and switch rotations without its regular FS bigspin', () => {
    const turnstileSets = ROBOT_DEFENSE_SET_WEIGHTS.turnstile!;
    for (const trickId of [
      'nollie-backside-360',
      'nollie-bigspin',
      'nollie-backside-180',
      'switch-backside-180',
      'switch-frontside-180',
    ]) {
      expect(turnstileSets[trickId], trickId).toBeGreaterThan(0);
    }
    expect(turnstileSets['switch-360-shuvit']).toBeUndefined();
    expect(turnstileSets['regular-fs-bigspin']).toBeUndefined();
  });

  it('every set-table trick exists in the catalog and the bag', () => {
    const catalog = new Set(TRICKS.map((t) => t.id));
    for (const robot of DEFENSE_ROBOTS) {
      for (const trickId of Object.keys(ROBOT_DEFENSE_SET_WEIGHTS[robot.id]!)) {
        expect(catalog.has(trickId), `${robot.name}: unknown trick ${trickId}`).toBe(true);
        expect(robotConsistency(robot, TRICK_BY_ID.get(trickId)!)).not.toBeNull();
      }
    }
  });

  it('looks up defense weights directly from the table', () => {
    const fortress = { id: 'fortress' };
    const someTrickId = Object.keys(ROBOT_DEFENSE_SET_WEIGHTS.fortress!)[0];
    const trick = TRICK_BY_ID.get(someTrickId)!;
    expect(trickDefenseSetWeight(trick, fortress)).toBe(ROBOT_DEFENSE_SET_WEIGHTS.fortress![someTrickId]);
    expect(trickDefenseSetWeight(trick, { id: 'nobody' })).toBe(0);

    // Classic robots keep their classic table untouched.
    const gutsy = { id: 'sacker' };
    const ollie = TRICK_BY_ID.get('regular-ollie')!;
    expect(trickDefenseSetWeight(ollie, gutsy)).toBe(0);
    expect(trickSetWeight(ollie, gutsy)).toBeGreaterThan(0);
  });

  it('flags exactly the robots that have a defense set table', () => {
    expect(hasDefenseSets({ id: 'aegis' })).toBe(true);
    expect(hasDefenseSets({ id: 'tre' })).toBe(false);
    expect(hasDefenseSets({ id: 'nobody' })).toBe(false);
  });

  it('gives every defense bot individual trick rates instead of a placeholder plateau', () => {
    for (const robot of DEFENSE_ROBOTS) {
      const rates = Object.values(DEFENSE_CONSISTENCY[robot.id]);
      expect(new Set(rates).size, robot.name).toBeGreaterThanOrEqual(8);
      for (const rate of rates) {
        expect(Number.isFinite(rate)).toBe(true);
        expect(rate).toBeGreaterThan(0);
        expect(rate).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps core flips in the Pro defense mix alongside specialist challenges', () => {
    const coreBases = new Set(['Kickflip', 'Heelflip', 'Backside Flip']);
    for (const robot of DEFENSE_ROBOTS.filter(r => r.tier === 'pro')) {
      let total = 0;
      let core = 0;
      for (const trick of TRICKS) {
        const weight = trickDefenseSetWeight(trick, robot);
        total += weight;
        if (coreBases.has(trick.base)) core += weight;
      }
      // Initial draw mass, not a promise that every random game has this mix.
      expect(core / total, robot.name).toBeGreaterThanOrEqual(0.3);
      expect(core / total, robot.name).toBeLessThan(0.7);
    }
  });
});
