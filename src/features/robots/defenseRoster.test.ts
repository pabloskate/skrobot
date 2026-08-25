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
});
