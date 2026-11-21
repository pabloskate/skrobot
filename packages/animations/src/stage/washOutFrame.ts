import { ASPHALT } from '../camera/view';
import { fallSink } from '../camera/camera';
import { add3, sub3, scale3, cross3, rotX, rotY, smoothstep, type V3 } from '../math';
import { carriedFrame, carriedRig, mapUpper, shiftRig } from '../motion/dynamics';
import { moveFrame, SHOE_HALF_HEIGHT, SHOE_HALF_WIDTH, SHOE_HALF_LENGTH, type ArmRig, type LegRig } from '../motion/skeleton';
import { WHEEL_BOTTOM } from '../board/board';
import { qaxis, qrot } from '../motion/fall/rotation';
import { bodyDims, twoBone, LIMB_RADII } from '../motion/fall/body';
import { bodyClearance, trunkInGround } from '../motion/fall/rollOut';
import { X0 } from '../motion/trick';
import { terrainSurface } from '../sets/terrain';
import type { StairPlan } from './drop';
import { boardClearance, hipsOf, riderShadows, type StageFrame } from './frameParts';
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
  const skid = -Math.expm1(-3.7 * Math.max(0, elapsed));
  const tip = smoothstep((elapsed - 0.025) / 0.60);
  const settle = smoothstep((elapsed - 0.61) / 0.32);
  const roll = (v: V3) => rotX(v, side * (80 * tip - 5 * settle));
  // Reach toward the impact, then fold the arms as the shoulder takes the weight.
  const nearArm = caught.arms[0].shoulder.z * side < caught.arms[1].shoulder.z * side ? 0 : 1;
  const reachTime = smoothstep(elapsed / 0.23);
  const foldTime = smoothstep((elapsed - 0.23) / 0.29);
  const arms = caught.arms.map((arm, i) => {
    const brace = side * (i === nearArm ? -32 * reachTime + 55 * foldTime : 22 * reachTime);
    const reach = (p: V3) => add3(arm.shoulder, rotX(sub3(p, arm.shoulder), brace));
    return { ...arm, elbow: reach(arm.elbow), hand: reach(arm.hand) };
  }) as [ArmRig, ArmRig];
  // One shoe travels with the skidding deck longer. The unloaded leg folds at its knee.
  const looseLeg = caught.legs[0].shoe.origin.x < caught.legs[1].shoe.origin.x ? 0 : 1;
  const legs = caught.legs.map((leg, i) => {
    const bend = (i === looseLeg ? 35 : 12) * smoothstep((elapsed - (i === looseLeg ? 0 : 0.065)) / 0.27);
    const hinge = cross3(sub3(leg.ankle, leg.knee), sub3(leg.hip, leg.knee));
    const flex = qaxis(hinge, bend * Math.PI / 180);
    const rotate = (v: V3) => qrot(flex, v);
    const aboutKnee = (p: V3) => add3(leg.knee, rotate(sub3(p, leg.knee)));
    return { ...leg, ankle: aboutKnee(leg.ankle), shoe: carriedFrame(leg.shoe, aboutKnee, rotate) };
  }) as [LegRig, LegRig];
  const anklePivot = { ...pivot, z: pivot.z + side * (22 * skid - 24 * tip) };
  const tipped = carriedRig({ ...caught, arms, legs }, p => add3(anklePivot, roll(sub3(p, pivot))), roll);
  // Keep the chest and head off the landing as the outside hip takes the weight.
  const hip = hipsOf(tipped);
  const tuck = (v: V3) => rotX(v, -side * 20 * tip);
  const aboveHip = (p: V3) => add3(hip, tuck(sub3(p, hip)));
  const body = mapUpper(tipped, aboveHip, f => carriedFrame(f, aboveHip, tuck));
  const board = shiftRig(caught, { x: 42 * smoothstep((elapsed - 0.09) / 1.12), y: 0, z: side * 57 * skid });
  const dims = bodyDims(stage.skater);
  // The loaded shoe follows the grip until the lateral slide pulls the deck beyond its reach.
  const grip = 1 - smoothstep((elapsed - 0.035) / 0.09);
  if (elapsed > 0 && grip > 0) {
    const i = looseLeg === 0 ? 1 : 0;
    const leg = body.legs[i];
    const contact = add3(caught.legs[i].shoe.origin, sub3(board.board.center, pivot));
    const offset = scale3(sub3(contact, leg.shoe.origin), grip);
    leg.shoe = moveFrame(leg.shoe, offset);
    leg.ankle = add3(leg.ankle, offset);
    leg.knee = twoBone(leg.hip, leg.ankle, dims.thigh, dims.shin, sub3(leg.knee, leg.hip));
  }
  const ground = (x: number, z: number) => ASPHALT - terrainSurface(stairs.terrain, frame.scroll + x - X0, frame.stairs!.across + z);
  const wheelGap = boardClearance(board, p => ground(p.x, p.z));
  const deckDrop = elapsed >= 0 ? wheelGap : Math.min(0, wheelGap);
  const deck = shiftRig(board, { x: 0, y: deckDrop, z: 0 }).board;
  // Both soles ride the deck onto the landing plane, including on a bank.
  // After the slip the rider settles on whichever body part touches first.
  const hips = hipsOf(body);
  const hipAtImpact = ground(hips.x, hips.z) - (22 - 12 * settle) * dims.scale;
  const desiredDrop = Math.min(-trunkInGround(body, dims, ground),
    deckDrop * (1 - tip) + (hipAtImpact - hips.y) * tip);
  // As the weight comes over a planted hand, bend the elbow rather than lifting the hips.
  for (const arm of body.arms) {
    const maxY = ground(arm.hand.x, arm.hand.z) - desiredDrop - LIMB_RADII.hand * dims.scale;
    if (arm.hand.y <= maxY) continue;
    arm.hand = { ...arm.hand, y: maxY };
    const pole = sub3(arm.elbow, arm.shoulder);
    pole.y -= Math.max(0, arm.elbow.y - maxY);
    arm.elbow = twoBone(arm.shoulder, arm.hand, dims.upperArm, dims.forearm, pole);
  }
  // The grounded sole stops vertically while the pelvis continues down over it.
  for (const leg of body.legs) {
    let lift = 0;
    for (const toe of [-SHOE_HALF_LENGTH, SHOE_HALF_LENGTH]) {
      for (const edge of [-SHOE_HALF_WIDTH, SHOE_HALF_WIDTH]) {
        const sole = leg.shoe.at(toe, -SHOE_HALF_HEIGHT, edge);
        lift = Math.max(lift, sole.y + desiredDrop - ground(sole.x, sole.z));
      }
    }
    const pole = sub3(leg.knee, leg.hip);
    if (lift > 0) {
      const offset = { x: 0, y: -lift, z: 0 };
      leg.shoe = moveFrame(leg.shoe, offset);
      leg.ankle = add3(leg.ankle, offset);
      leg.knee = twoBone(leg.hip, leg.ankle, dims.thigh, dims.shin, pole);
    }
    // Turn a folded knee out around the hip-to-ankle line as it meets the landing.
    for (let i = 0; i < 8; i++) {
      const depth = leg.knee.y + desiredDrop + LIMB_RADII.knee * dims.scale - ground(leg.knee.x, leg.knee.z);
      if (depth <= 0.01) break;
      pole.y -= depth;
      pole.z += side * depth;
      leg.knee = twoBone(leg.hip, leg.ankle, dims.thigh, dims.shin, pole);
    }
  }
  const gap = bodyClearance(body, dims, ground);
  const bodyDrop = Math.min(gap, desiredDrop);
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
