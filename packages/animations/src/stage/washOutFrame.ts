import { ASPHALT } from '../camera/view';
import { fallSink } from '../camera/camera';
import { add3, sub3, rotX, rotY, smoothstep, type V3 } from '../math';
import { carriedRig, shiftRig } from '../motion/dynamics';
import type { ArmRig } from '../motion/skeleton';
import { WHEEL_BOTTOM } from '../board/board';
import { bodyDims } from '../motion/fall/body';
import { bodyClearance } from '../motion/fall/rollOut';
import { X0 } from '../motion/trick';
import { terrainSurface } from '../sets/terrain';
import type { StairPlan } from './drop';
import { boardClearance, riderShadows, type StageFrame } from './frameParts';
import type { StagePlan } from './stage';

/** A caught deck touches down across its line. The wheels skid out from under the loaded feet. */
export function washOutFrame(stage: StagePlan, stairs: StairPlan, t: number, ridden: (at: number) => StageFrame): StageFrame {
  const elapsed = Math.min(t, stage.end) - stairs.land;
  // Retain the landing compression as the rider slides to a stop. This clock
  // also carries the original downhill speed continuously into the skid.
  const rideTime = elapsed <= 0 ? t : stairs.land - Math.expm1(-4 * elapsed) / 4;
  const frame = ridden(rideTime);
  const side = stage.mechanics.orientationSign;
  const yaw = side * 15 * smoothstep((elapsed + 0.16) / 0.16);
  if (!yaw) return frame;

  const pivot = frame.rig.board.center;
  const turn = (v: V3) => rotY(v, yaw);
  const caught = carriedRig(frame.rig, p => add3(pivot, turn(sub3(p, pivot))), turn);
  // The feet share the first part of the skid. As the deck escapes, their
  // momentum tips the rider about the outside edge onto a shoulder and hip.
  const skid = smoothstep((elapsed - 0.045) / 0.63);
  const tip = smoothstep((elapsed - 0.085) / 0.53);
  const settle = smoothstep((elapsed - 0.61) / 0.32);
  const roll = (v: V3) => rotX(v, side * (98 * tip - 7 * settle));
  // Reach toward the impact, then fold the arms as the shoulder takes the weight.
  const brace = side * (-28 * smoothstep((elapsed - 0.05) / 0.25) + 38 * smoothstep((elapsed - 0.32) / 0.28));
  const arms = caught.arms.map(arm => {
    const reach = (p: V3) => add3(arm.shoulder, rotX(sub3(p, arm.shoulder), brace));
    return { ...arm, elbow: reach(arm.elbow), hand: reach(arm.hand) };
  }) as [ArmRig, ArmRig];
  const anklePivot = { ...pivot, z: pivot.z + side * 11 * skid };
  const body = carriedRig({ ...caught, arms }, p => add3(anklePivot, roll(sub3(p, pivot))), roll);
  const board = shiftRig(caught, { x: 42 * smoothstep((elapsed - 0.09) / 1.12), y: 0, z: side * 57 * skid });
  const ground = (x: number, z: number) => ASPHALT - terrainSurface(stairs.terrain, frame.scroll + x - X0, frame.stairs!.across + z);
  const gap = bodyClearance(body, bodyDims(stage.skater), ground);
  const wheelGap = boardClearance(board, p => ground(p.x, p.z));
  const deckDrop = elapsed >= 0 ? wheelGap : Math.min(0, wheelGap);
  const deck = shiftRig(board, { x: 0, y: deckDrop, z: 0 }).board;
  // Both soles ride the deck onto the landing plane, including on a bank.
  // After the slip the rider settles on whichever body part touches first.
  const bodyDrop = Math.min(gap, deckDrop * (1 - tip) + 65 * tip);
  const dropped = shiftRig(body, { x: 0, y: bodyDrop, z: 0 });
  const rig = {
    ...dropped,
    board: { ...deck, yawDeg: deck.yawDeg + yaw },
    bodyYawDeg: dropped.bodyYawDeg + yaw,
    headYawDeg: dropped.headYawDeg + yaw,
    free: tip,
  };
  return {
    ...frame, t, rig,
    wheels: { angle: frame.wheels.angle, sweep: frame.wheels.sweep * Math.exp(-4 * Math.max(0, elapsed)) },
    lift: frame.lift - tip * fallSink(ground(rig.head.origin.x, rig.head.origin.z) - rig.head.origin.y),
    expression: elapsed > 0.08 ? 'wince' : frame.expression,
    dust: frame.dust.map(p => ({ ...p, opacity: p.opacity * (1 - skid) })),
    shadows: riderShadows(rig, { board: Math.max(0, ground(deck.center.x, deck.center.z) - deck.center.y - WHEEL_BOTTOM), body: Math.max(0, gap - bodyDrop) }, ASPHALT - frame.stairs!.shadowY),
  };
}
