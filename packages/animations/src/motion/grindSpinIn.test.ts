import { describe, expect, it } from 'vitest';
import { SWEEP_TIMEOUT } from '../testing';
import type { Stance } from '../types';
import { EL_TORO_RAIL } from '../sets/elToro/stairs';
import { grindFrame } from './grind';
import { BAR_Z, grindSpecFor, joinGrindBase } from './grindDefinitions';
import { canEnterGrind } from './grindTricks';
import { solveGrindRig } from './grindRig';
import { rotX, rotY } from '../math';
import {
  HALF_SPINS,
  NEUTRAL,
  SPIN_TRICKS,
  everySpin,
  grindPlan,
  nameOf,
  planFor,
  spinPlan,
  stepOf,
} from './grindTesting';

/**
 * A body spin popped into a grind (180s, 360s, bigspins): the rider spins at
 * one speed down onto the bar, the bar finishes the turn, and from the lock
 * on it's the plain grind as the rider rides it after the spin. The body's
 * sweep is in grindSpinInSweep.test.ts, to run alongside.
 */

describe('Spin into grind', () => {
  const SPINS = SPIN_TRICKS;
  const HALF = HALF_SPINS;
  const AFTER_HALF: Record<Stance, Stance> = { regular: 'fakie', nollie: 'fakie', fakie: 'regular', switch: 'switch' };

  it('accepts 180s, 360s, and bigspins, and names the grind as the rider rides it after the spin', () => {
    for (const entry of SPINS) expect(canEnterGrind(entry), entry).toBe(true);
    const spec = grindSpecFor({ base: 'Backside 180 into Frontside Nosegrind', stance: 'regular' });
    expect(spec?.entry?.base).toBe('Backside 180');
    expect(spec?.base).toBe('Nosegrind');
    expect(spec?.side).toBe('frontside');
    // Spun round, the rider rides it frontside, so they rolled in with the bar on the heelside.
    expect(spec?.reversed).toBe(true);
    expect(spec?.toesideApproach).toBe(false);
    expect(grindSpecFor({ base: 'Backside 360 into Frontside Nosegrind', stance: 'regular' })?.toesideApproach).toBe(true);
  });

  it('rolls in with the bar on the other side of the rider after a half turn, and the named side after a full one', () => {
    for (const { entry, base, side, rider, stance, label } of everySpin()) {
      const { plan } = spinPlan(entry, base, side, stance, rider, null);
      const barToward = Math.sign(BAR_Z - plan.laneZ);
      const onToeside = (side === 'frontside') !== HALF.has(entry);
      expect(barToward, label).toBe(onToeside ? plan.toeDir : -plan.toeDir);
    }
  });

  it('locks in exactly as the grind the spin leaves them riding: fakie after a 180 or a bigspin, turned to face the way they travel', () => {
    for (const { entry, base, side, rider, stance, label } of everySpin()) {
      const { plan } = spinPlan(entry, base, side, stance, rider, null);
      const half = HALF.has(entry);
      expect(Math.abs(plan.heading), label).toBe(half ? 180 : 360);
      // The plain grind from the stance they land in. Fakie only reverses travel,
      // so its toeside matches; switch stays switch and just rides backwards.
      const after = half ? AFTER_HALF[stance] : stance;
      const plain = planFor(base, side, after, rider, null).plan;
      expect(plan.lock.yaw - plan.heading, label).toBeCloseTo(plain.lock.yaw, 9);
      expect(plan.lock.pitch, label).toBe(plain.lock.pitch);
      expect(plan.lock.roll, label).toBeCloseTo(plain.lock.roll, 9);
      // Turned half way round about the bar, the board sits across it the other way.
      expect(plan.lockCenter.y, label).toBeCloseTo(plain.lockCenter.y, 9);
      expect(plan.lockCenter.z - BAR_Z, label).toBeCloseTo((half ? -1 : 1) * (plain.lockCenter.z - BAR_Z), 9);
    }
  });

  it('keeps the riding part on the bar, and rides away the other way round', () => {
    for (const { entry, base, side, rider, stance, label } of everySpin(['regular', 'fakie'])) {
      const { spec, plan, mechanics } = spinPlan(entry, base, side, stance, rider, null);
      for (let t = plan.lockAt; t < plan.off - 0.08; t += 0.1) {
        const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
        const bearing = rotX(rotY(spec.contact.at, -frame.spin.yaw), -frame.spin.flip);
        expect(rig.board.point(bearing).z, `${label} t=${t.toFixed(2)}`).toBeCloseTo(BAR_Z, 6);
      }
      // Turned from the line along the bar, before the carve in angles the rider.
      const start = solveGrindRig(0, plan, mechanics, NEUTRAL);
      const end = solveGrindRig(plan.end, plan, mechanics, NEUTRAL);
      expect(end.rig.bodyYawDeg - (start.rig.bodyYawDeg - start.frame.approach), label).toBeCloseTo(plan.heading, 6);
      // A half turn swaps which end leads: the nose trails riding away from a regular roll-in, and leads out of a fakie one.
      const leads = (yaw: number) => rotY({ x: 1, y: 0, z: 0 }, yaw).x * spec.dir;
      expect(leads(end.frame.pose.yaw), label).toBeCloseTo((HALF.has(entry) ? -1 : 1) * leads(0), 6);
    }
  });

  it('carries the board round under planted feet for a 180 or a 360, and shuvs it out from under them for a bigspin', () => {
    for (const { entry, base, side, rider, stance, label } of everySpin(['regular'])) {
      const { plan, mechanics } = spinPlan(entry, base, side, stance, rider, null);
      let yawReach = 0;
      let lifted = 0;
      for (let t = plan.pop; t <= plan.lockAt; t += 0.01) {
        const { frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
        yawReach = Math.max(yawReach, Math.abs(frame.spin.yaw));
        lifted = Math.max(lifted, frame.offDeck);
      }
      const bigspin = /Bigspin/.test(entry);
      const flip = /Flip/.test(entry);
      expect(yawReach, label).toBeCloseTo(bigspin ? 180 : 0, 0);
      expect(lifted > 0.9, label).toBe(bigspin || flip);
    }
  });

  it('spins at one speed all the way down onto the bar, and the bar finishes the turn: nothing stops it in the air', () => {
    const FRAME = 1 / 120;
    for (const rail of [null, EL_TORO_RAIL]) {
      for (const { entry, base, side, rider, stance, label: name } of everySpin(['regular', 'fakie'])) {
        const { spec, plan } = grindPlan(joinGrindBase(entry, nameOf(base, side)), stance, rider, null, NEUTRAL, rail);
        const label = `${name} ${rail ? 'rail' : 'bar'}`;
        const rate = (t: number) => (grindFrame(t + FRAME, plan).heading - grindFrame(t, plan).heading) / FRAME;
        // Steady from once it's up to speed off the pop to the instant it touches down.
        const steady = rate(plan.pop + 0.1);
        expect(Math.abs(steady), label).toBeGreaterThan(100);
        for (let t = plan.pop + 0.1; t < plan.lockAt - FRAME; t += stepOf(0.02)) expect(rate(t), `${label} t=${t.toFixed(3)}`).toBeCloseTo(steady, 3);
        // It comes down still turning, short of the lock by no more than what rides the bar can pivot
        // (that share of the turn, the angle it came in at unwinding with it), and the bar slows it to
        // a stop from that speed.
        const short = Math.abs(grindFrame(plan.lockAt, plan).pose.yaw - plan.lock.yaw);
        const unwinding = Math.abs(plan.lock.yaw - plan.approachYaw) / Math.abs(plan.lock.yaw);
        expect(short, label).toBeGreaterThan(0.5 * Math.min(spec.railFinish, 0.3 * Math.abs(plan.lock.yaw)));
        expect(short, label).toBeLessThan(1.01 * spec.railFinish * unwinding);
        expect(rate(plan.lockAt) / steady, label).toBeGreaterThan(0.85);
        const settled = plan.lockAt + plan.spinIn!.finishT;
        expect(grindFrame(settled, plan).heading, label).toBeCloseTo(plan.heading, 6);
        // Only the balance wobble left (WOBBLE_SLIDE at most).
        expect(Math.abs(grindFrame(settled, plan).pose.yaw - plan.lock.yaw), label).toBeLessThan(3);
      }
    }
  }, SWEEP_TIMEOUT);
});
