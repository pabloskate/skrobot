import { armRoom, armsLifted, liftOver, type ArmLift } from '../motion/armClearance';
import type { Rig } from '../motion/skeleton';
import type { StagePlan } from './stage';

/**
 * A stage's arms lifted up and out of the knees (motion/armClearance.ts),
 * planned once over its whole attempt.
 *
 * Every frame builder hands its rider to `stageArms` just before posing it,
 * as the rig solvers and the ground pass leave it, so the lift is measured
 * on the same legs it clears. The first time a stage asks, its attempt is
 * ridden through once (`rideAttempt`, set by planStage) with the arms left
 * where they are, measuring the room each needs; from then on each frame
 * looks its lift up. A kick-out's and a rail bail's own motion carries on
 * from the attempt's arms, as lifted.
 */

/** Seconds between the moments an attempt's room is measured at. */
const STEP = 1 / 60;

const attempts = new WeakMap<StagePlan, (t: number) => void>();
const lifts = new WeakMap<StagePlan, ArmLift>();
/** While an attempt is ridden through to measure it: the most room each arm needed at each step. */
let measuring: Array<[number, number]> | null = null;

/** Sets how to ride `stage`'s attempt at time t, for its arms to be measured: once, as it's planned. */
export function rideAttempt(stage: StagePlan, ride: (t: number) => void) {
  attempts.set(stage, ride);
}

/** Each arm's lift (deg) at `t` on `stage`. */
export function stageArmLift(stage: StagePlan, t: number): [number, number] {
  return liftOf(stage)?.(t) ?? [0, 0];
}

/** `rig`, `stage`'s rider at `t` about to be posed, with its arms lifted out of its knees. */
export function stageArms(stage: StagePlan, t: number, rig: Rig): Rig {
  if (measuring) {
    const i = Math.round(t / STEP);
    const room = armRoom(rig);
    const was = measuring[i] ?? [0, 0];
    measuring[i] = [Math.max(was[0], room[0]), Math.max(was[1], room[1])];
    return rig;
  }
  const lift = liftOf(stage);
  return lift ? armsLifted(rig, lift(t)) : rig;
}

function liftOf(stage: StagePlan): ArmLift | null {
  const known = lifts.get(stage);
  if (known) return known;
  const ride = attempts.get(stage);
  if (!ride || measuring) return null;
  const rooms: Array<[number, number]> = [];
  measuring = rooms;
  try {
    for (let i = 0; i * STEP <= stage.end; i++) ride(i * STEP);
  } finally {
    measuring = null;
  }
  const lift = liftOver(Array.from(rooms, (room) => room ?? [0, 0]), STEP);
  lifts.set(stage, lift);
  return lift;
}
