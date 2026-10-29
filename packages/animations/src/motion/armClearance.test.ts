import { describe, it } from 'vitest';
import { TRICK_BASES, type FallVariant } from './trick';
import { SWEEP_TIMEOUT, sweep } from '../testing';
import { planStage, stageFrame, type StagePlan } from '../stage/stage';
import { stageArmLift } from '../stage/armLift';
import { armInLegs } from './armClearance';
import { resolveSkateStyle } from './style';
import type { RiderStance, Stance } from '../types';
import { COMBO_DIMS, OUTCOMES, covering, everyGrind, nameOf, stepOf, sweepBounds, type Sweep } from './grindTesting';

/**
 * No arm goes through a leg (armClearance.ts, stage/armLift.ts). The arms are
 * posed off the chest and the legs off the board, so a knee folded up toward
 * its shoulder (a frontside noseblunt's back knee, the crouch before popping
 * off a noseslide, a pop's tuck) used to come up straight through the hand.
 * Checked as Robot3D draws them: every flatground trick, and every grind and
 * slide, landed or not.
 *
 * And the arm gets out of the way the way a rider's does, not knocked about
 * by the knee: lifted once and held up while the knee's there, never dropped
 * and thrown back up in between.
 */

/** How far (world units) an arm may still touch into a leg: the lift is eased, and the robot's limbs are inked. */
const TOUCH = 1.5;
/** Seconds an arm, once lifted, is held up through a dip in the room it needs; and the most it may sag (deg) in one. */
const HOLD = 0.7;
const SAG = 2;

const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const RIDERS: RiderStance[] = ['regular', 'goofy'];
const FLAT_OUTCOMES: Array<{ landed: boolean; fall: FallVariant }> = [
  { landed: true, fall: 'slam' },
  { landed: false, fall: 'slam' },
  { landed: false, fall: 'bail' },
  { landed: false, fall: 'shank' },
];

function sweepStage(bounds: Sweep, stage: StagePlan, label: string) {
  const step = stepOf(1 / 60);
  const lifts: Array<[number, number]> = [];
  for (let t = 0; t <= stage.end; t += step) {
    const { rig } = stageFrame(stage, t, 1);
    for (const arm of rig.arms) bounds.below('arm into a leg', armInLegs(arm, rig.legs), TOUCH, () => `${label} t=${t.toFixed(3)} ${arm.side} arm`);
    lifts.push(stageArmLift(stage, t));
  }
  // A sag: how far the lift drops below both the highest it's been in the
  // HOLD before and the highest it'll be in the HOLD after.
  const span = Math.round(HOLD / 2 / step);
  for (let i = 0; i < lifts.length; i++) {
    for (const side of [0, 1] as const) {
      let before = 0;
      let after = 0;
      for (let j = Math.max(0, i - span); j < i; j++) before = Math.max(before, lifts[j][side]);
      for (let j = i + 1; j <= Math.min(lifts.length - 1, i + span); j++) after = Math.max(after, lifts[j][side]);
      bounds.below('arm dropped and lifted again', Math.min(before, after) - lifts[i][side], SAG, () => `${label} t=${(i * step).toFixed(3)} arm ${side}`);
    }
  }
}

describe('arms and legs', () => {
  it('keeps every arm out of the legs on flat ground, from the roll-in to riding away or the fall', () => {
    const bounds = sweepBounds();
    const style = resolveSkateStyle();
    for (const base of sweep(TRICK_BASES)) {
      for (const stance of STANCES) {
        for (const rider of RIDERS) {
          for (const { landed, fall } of FLAT_OUTCOMES) {
            const stage = planStage({ id: base, name: base, base, stance }, { landed, riderStance: rider, style, fall, shankProgress: 0.5 });
            sweepStage(bounds, stage, `${base} ${stance} ${rider} ${landed ? 'landed' : fall}`);
          }
        }
      }
    }
    bounds.verify();
  }, SWEEP_TIMEOUT);

  it('keeps every arm out of the legs on a grind or slide: popped on, locked, popped off, or slipped off', () => {
    const bounds = sweepBounds();
    const style = resolveSkateStyle();
    for (const { base, side, rider, stance, label } of covering(everyGrind(), ...COMBO_DIMS)) {
      for (const fall of OUTCOMES) {
        const name = nameOf(base, side);
        const stage = planStage({ id: name, name, base: name, stance }, { landed: fall == null, riderStance: rider, style, fall: fall ?? 'slam', shankProgress: 0.65 });
        sweepStage(bounds, stage, `${label} ${fall ?? 'landed'}`);
      }
    }
    bounds.verify();
  }, SWEEP_TIMEOUT);
});
