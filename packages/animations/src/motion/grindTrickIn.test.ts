import { describe, expect, it } from 'vitest';
import { GROUND, type FallVariant } from './trick';
import { resolveSkateStyle } from './style';
import { isFiniteFrame, SWEEP_TIMEOUT } from '../testing';
import { stageFrame } from '../stage/stage';
import { WHEEL_BOTTOM, deckTopY } from '../board/board';
import { TIP_X, deckBottomY } from '../board/deck';
import { EL_TORO_RAIL } from '../sets/elToro/stairs';
import { grindTimelineFor } from './grind';
import { BAR_Z, grindSpecFor, joinGrindBase, splitGrindBase } from './grindDefinitions';
import { canEnterGrind } from './grindTricks';
import { solveGrindRig } from './grindRig';
import { dot3, rotX, rotY, sub3 } from '../math';
import { DECK_HALF_WIDTH, PERSON_SCALE, SHIN, SHOE_HALF_HEIGHT, THIGH } from './skeleton';
import {
  ENTRY_TRICKS,
  NEUTRAL,
  RIDERS,
  STANCES,
  boardSamples,
  covering,
  dist,
  entryCombos,
  entryPlan,
  everyEntry,
  expectOneRise,
  grindPlan,
  grownHipY,
  nameOf,
  planFor,
  stageOf,
  stepOf,
  sweepBar,
  sweepBounds,
  toBoard,
} from './grindTesting';

/**
 * A flatground trick popped into a grind ("Kickflip into Frontside
 * Lipslide"): the deck turns under the feet through the hop and settles by
 * the lock, and from the lock on it's the plain grind (grind.test.ts). The
 * continuity sweep is in grindTrickInSweep.test.ts, to run alongside.
 */

it.each(['360 Flip', 'Laser Flip'])('snaps %s close to the ground before the grind hop carries it away', (entry) => {
  const cases = [null, EL_TORO_RAIL].flatMap((rail) => RIDERS.flatMap((rider) => STANCES.flatMap((stance) =>
    [0.45, 1.15].flatMap((popHeight) => [0.8, 1.25].map((rotationSpeed) => ({ rail, rider, stance, popHeight, rotationSpeed }))))));
  for (const { rail, rider, stance, popHeight, rotationSpeed } of covering(cases, (c) => c.rail, (c) => c.rider, (c) => c.stance, (c) => c.popHeight, (c) => c.rotationSpeed)) {
    const style = resolveSkateStyle({ popHeight, rotationSpeed, flickStrength: 1 });
    const { spec, mechanics, plan } = grindPlan(`${entry} into Frontside 50-50 Grind`, stance, rider, null, style, rail);
    const tipX = spec.popNose ? TIP_X : -TIP_X;
    const label = `${rail ? 'handrail' : 'flat bar'} ${rider} ${stance} ${popHeight}/${rotationSpeed}`;
    let closest = Infinity;
    let lowest = -Infinity;
    for (let tau = 0; tau <= 0.1; tau += 0.002) {
      const { rig } = solveGrindRig(plan.pop + tau, plan, mechanics, style);
      closest = Math.min(closest, GROUND + WHEEL_BOTTOM - rig.board.point({ x: tipX, y: deckBottomY(tipX), z: 0 }).y);
      lowest = Math.max(lowest, ...boardSamples(rig).map((p) => p.y));
    }
    expect(closest, label).toBeLessThan(6);
    expect(closest, label).toBeGreaterThanOrEqual(-0.1);
    expect(lowest, label).toBeLessThanOrEqual(GROUND + WHEEL_BOTTOM + 0.1);
  }
});

describe('Trick into grind', () => {
  const ENTRIES = ENTRY_TRICKS;

  it('names the trick and the grind it goes into, and only accepts tricks that keep the board level', () => {
    expect(splitGrindBase('Kickflip into Frontside Lipslide')).toEqual({ entry: 'Kickflip', grind: 'Frontside Lipslide', exit: null });
    expect(splitGrindBase('Frontside Lipslide')).toEqual({ entry: null, grind: 'Frontside Lipslide', exit: null });
    expect(joinGrindBase('Kickflip', 'Frontside Lipslide')).toBe('Kickflip into Frontside Lipslide');

    const spec = grindSpecFor({ base: 'Kickflip into Backside Smith Grind', stance: 'regular' });
    expect(spec?.base).toBe('Smith Grind');
    expect(spec?.side).toBe('backside');
    expect(spec?.entry?.base).toBe('Kickflip');
    expect(grindSpecFor({ base: 'Backside Smith Grind', stance: 'regular' })?.entry).toBeNull();

    for (const entry of ENTRIES) expect(canEnterGrind(entry), entry).toBe(true);
    // Dolphin flips and impossibles pitch the board end over end.
    for (const entry of ['Ollie', 'Impossible', 'Dolphin Flip', 'Not A Trick']) {
      expect(canEnterGrind(entry), entry).toBe(false);
      expect(grindSpecFor({ base: joinGrindBase(entry, 'Frontside Lipslide'), stance: 'regular' }), entry).toBeNull();
    }
    expect(grindSpecFor({ base: 'Kickflip into Kickflip', stance: 'regular' })).toBeNull();
  });

  it('leaves the lock, the bar contact, and the pop off exactly as the plain grind has them', () => {
    for (const { entry, base, side, rider, stance, label } of entryCombos(everyEntry())) {
      const plain = planFor(base, side, stance, rider, null).plan;
      const { plan, spec, mechanics } = entryPlan(entry, base, side, stance, rider, null);
      expect(plan.lock, label).toEqual(plain.lock);
      expect(plan.lockCenter, label).toEqual(plain.lockCenter);
      // The line in is the trick's own: a spin in needs more room, so comes in at more of an angle.
      expect(plan.off - plan.lockAt, label).toBeCloseTo(plain.off - plain.lockAt, 9);
      for (let t = plan.lockAt; t < plan.off - 0.08; t += 0.1) {
        const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
        // A deck shuved half way round is the same deck: its bearing is the local point that lands where the plain grind's does.
        const bearing = rotX(rotY(spec.contact.at, -frame.spin.yaw), -frame.spin.flip);
        expect(rig.board.point(bearing).z, `${label} t=${t.toFixed(2)}`).toBeCloseTo(BAR_Z, 6);
      }
    }
  }, SWEEP_TIMEOUT);

  it('turns the deck under the feet through the hop and has it settled by the lock', () => {
    for (const { entry, base, side, rider, stance, label } of entryCombos(everyEntry())) {
      const { plan, mechanics } = entryPlan(entry, base, side, stance, rider, null);
      const flips = /flip|Double/i.test(entry);
      const shuvs = /Shuvit|Hardflip|360 Flip/.test(entry);
      let flipReach = 0;
      let yawReach = 0;
      for (let t = plan.pop; t <= plan.lockAt; t += 0.01) {
        const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
        flipReach = Math.max(flipReach, Math.abs(frame.spin.flip));
        yawReach = Math.max(yawReach, Math.abs(frame.spin.yaw));
        expect(rig.board.flipDeg, label).toBeCloseTo(frame.pose.roll + frame.spin.flip, 6);
      }
      if (flips) expect(flipReach, label).toBeGreaterThan(300);
      if (shuvs) expect(yawReach, label).toBeGreaterThan(170);
      for (const t of [plan.lockAt, plan.off, plan.land, plan.end]) {
        const { flip, yaw } = solveGrindRig(t, plan, mechanics, NEUTRAL).frame.spin;
        expect(flip, `${label} t=${t}`).toBeCloseTo(0, 6);
        expect(Math.abs(yaw) === 0 || Math.abs(yaw) === 180, `${label} t=${t} yaw=${yaw}`).toBe(true);
      }
    }
  }, SWEEP_TIMEOUT);

  it('takes the feet off the deck only while it turns, and keeps the soles on the grip otherwise', () => {
    for (const { entry, base, side, rider, stance, label } of entryCombos(everyEntry())) {
      const { plan, mechanics } = entryPlan(entry, base, side, stance, rider, null);
      let lifted = 0;
      for (let t = 0; t <= plan.end; t += 0.02) {
        const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
        lifted = Math.max(lifted, frame.offDeck);
        if (frame.offDeck > 0) expect(frame.phase, label).toBe('up');
        // The pop and the trick are the flatground rider's, whose feet leave
        // the deck as it snaps up, before it starts to turn.
        if (frame.offDeck > 0.001 || (t >= plan.pop && t < plan.lockAt)) continue;
        for (const leg of rig.legs) {
          const sole = toBoard(rig, leg.shoe.at(0, -SHOE_HALF_HEIGHT, 0));
          expect(Math.abs(sole.y - deckTopY(sole.x)), `${label} t=${t.toFixed(2)}`).toBeLessThan(0.5);
        }
      }
      expect(lifted, label).toBeGreaterThan(0.9);
    }
  }, SWEEP_TIMEOUT);

  it('never stretches a leg, and flicks the right foot out for a kickflip or a heelflip', () => {
    const sweep = sweepBounds();
    for (const { entry, base, side, rider, stance, label } of entryCombos(everyEntry())) {
      for (const fall of [null, 'slam'] as Array<FallVariant | null>) {
        const { plan, mechanics } = entryPlan(entry, base, side, stance, rider, fall);
        for (let t = 0; t <= plan.end; t += stepOf(0.03)) {
          if (plan.fail != null && t > plan.fail && t < plan.fail + plan.drop) continue;
          const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
          const where = () => `${label} t=${t.toFixed(2)}`;
          for (const leg of rig.legs) {
            sweep.below('thigh length error', Math.abs(dist(leg.hip, leg.knee) - THIGH), 0.5e-6, where);
            sweep.below('shin length error', Math.abs(dist(leg.knee, leg.ankle) - SHIN), 0.5e-6, where);
            if (frame.flickOut > 0.9 && leg.flicking && (entry === 'Kickflip' || entry === 'Heelflip')) {
              // Out past the rail: heelside for a kickflip, toeside for a heelflip.
              // (Measured across the rider's line, turning into the lock with the board, since the flipping deck's own sides swap.)
              const side = rotY({ x: 0, y: 0, z: 1 }, frame.pose.yaw);
              const across = dot3(sub3(leg.shoe.origin, rig.board.center), side);
              expect(Math.sign(across) * rig.toeDir, `${label} t=${t.toFixed(2)}`).toBe(entry === 'Heelflip' ? 1 : -1);
              expect(Math.abs(across), label).toBeGreaterThan(DECK_HALF_WIDTH - 3);
            }
          }
        }
      }
    }
    sweep.verify();
  }, SWEEP_TIMEOUT);

  it('never puts the board through the bar or its posts', () => {
    const sweep = sweepBounds();
    // The longest reach (a shuv sweeps the whole deck across), the most hang, and the flips.
    const swept = ['Kickflip', 'Frontside Shuvit', '360 Flip', 'Double Kickflip'];
    const cases = [0.45, 1.15].flatMap((popHeight) => [...everyEntry()].filter(({ entry }) => swept.includes(entry)).map((combo) => ({ popHeight, ...combo })));
    for (const { popHeight, entry, base, side, rider, stance, label } of entryCombos(cases, (c) => c.popHeight)) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1 });
      const { plan, mechanics } = entryPlan(entry, base, side, stance, rider, null, style);
      for (let t = plan.pop; t <= plan.lockAt + 0.02; t += stepOf(1 / 60)) {
        const { rig, frame } = solveGrindRig(t, plan, mechanics, style);
        sweepBar(sweep, plan, rig, frame, () => `${label} pop ${popHeight} t=${t.toFixed(3)}`);
      }
    }
    sweep.verify();
  }, SWEEP_TIMEOUT);

  it('pushes up into the pop once, however the trick sets up', () => {
    const combos = [...everyEntry()].filter(({ rider, stance }) => rider === 'regular' && stance !== 'fakie' && stance !== 'switch');
    for (const { entry, base, side, rider, stance, label } of entryCombos(combos)) {
      const { plan, mechanics } = entryPlan(entry, base, side, stance, rider, null);
      for (const grow of [1, PERSON_SCALE]) expectOneRise(grownHipY(plan, mechanics, grow), plan.pop, `${label} x${grow}`);
    }
  }, SWEEP_TIMEOUT);

  it('stages finite geometry and plans the entry trick', () => {
    for (const entry of ENTRIES) {
      const base = joinGrindBase(entry, 'Backside Lipslide');
      const { plan } = entryPlan(entry, 'Lipslide', 'backside', 'regular', 'goofy', null);
      const stage = stageOf(base, true, 'slam');
      expect(stage.grind?.entry?.trick.base).toBe(entry);
      for (const t of [0, plan.pop + 0.15, (plan.pop + plan.lockAt) / 2, plan.lockAt, plan.end]) {
        expect(isFiniteFrame(stageFrame(stage, t, 1)), `${base} t=${t}`).toBe(true);
      }
    }
  });

  it('gives the trick room in the hop and the timeline: more hang time than the plain grind, and a mid-trick moment before the lock', () => {
    for (const { entry, base, side, rider, stance, label } of entryCombos(everyEntry())) {
      const plain = planFor(base, side, stance, rider, null).plan;
      const { plan } = entryPlan(entry, base, side, stance, rider, null);
      expect(plan.upT, label).toBeGreaterThan(plain.upT);
      const mid = grindTimelineFor(
        { base: joinGrindBase(entry, nameOf(base, side)), stance }, rider, NEUTRAL, true, 'slam',
      )?.trickIn;
      expect(mid, label).toBeGreaterThan(plan.pop);
      expect(mid, label).toBeLessThan(plan.lockAt);
    }
  });
});
