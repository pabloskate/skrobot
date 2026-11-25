import { WHEEL_BOTTOM } from '../board/board';
import { fallSink } from '../camera/camera';
import { ASPHALT } from '../camera/view';
import { lerp3, smoothstep } from '../math';
import { shiftRig } from '../motion/dynamics';
import { boardAt, boardRigOf } from '../motion/fall/boardBody';
import { bodyDims } from '../motion/fall/body';
import { bodyClearance } from '../motion/fall/rollOut';
import { washOutBody } from '../motion/fall/washOutPose';
import { recoverWashOut, WASH_OUT_PLANT } from '../motion/fall/washOutRecovery';
import { WASH_OUT_ROLL_START, WASH_OUT_STAND_T, X0 } from '../motion/trick';
import type { StairPlan } from './drop';
import { stairShadowLevel } from './downhill';
import { boardClearance, kickedUp, riderShadows, type StageFrame } from './frameParts';
import type { StagePlan } from './stage';
import { approachWheelRate, washOutClock, washOutPosition, spotGround, turnCatch, washOutMotion } from './washOutMotion';

/** Seconds before the rider has stopped that they start to stand: the squat they come up into doesn't hold still. */
const STAND_LEAD = 0.16;

/** A caught deck lands across the line. Wheel grip redirects it while the rider carries on. */
export function washOutFrame(stage: StagePlan, stairs: StairPlan, t: number, rate: number, ridden: (at: number) => StageFrame): StageFrame {
  const clock = Math.min(t, stage.end);
  const elapsed = clock - stairs.land;
  if (elapsed <= -0.16) return ridden(t);
  const motion = washOutMotion(stage, stairs, ridden);
  // The catch finishes off line; both feet keep their contacts through the turn.
  if (elapsed <= 0) {
    const frame = ridden(clock);
    const caught = turnCatch(frame.rig, motion.yaw * smoothstep((elapsed + 0.16) / 0.16), motion.axis);
    const ground = (x: number, z: number) => spotGround(stairs, x + frame.scroll, z + frame.stairs!.across);
    const gap = boardClearance(caught, p => ground(p.x, p.z));
    const rig = shiftRig(caught, { x: 0, y: elapsed === 0 ? gap : Math.min(gap, 0), z: 0 });
    return {
      ...frame, rig,
      shadows: riderShadows(rig, {
        board: Math.max(0, gap),
        body: Math.max(0, bodyClearance(rig, bodyDims(stage.skater), ground)),
      }, ASPHALT - frame.stairs!.shadowY),
    };
  }

  // Sample just the landing compression. The rider's position and the board's
  // free roll have separate clocks and are measured in the spot's coordinates.
  const frame = ridden(stairs.land - 0.13 * Math.expm1(-elapsed / 0.13));
  const rider = washOutPosition(motion.path, elapsed);
  const landX = stairs.terrain.run + stairs.terrain.landPast;
  const landZ = stairs.terrain.laneZ;
  const scroll = rider.x;
  const across = rider.z;
  const ground = (x: number, z: number) => spotGround(stairs, scroll + x, across + z);
  const groundShift = rider.y - spotGround(stairs, frame.scroll + X0, frame.stairs!.across);
  const caught = shiftRig(turnCatch(frame.rig, motion.yaw, motion.axis), { x: 0, y: groundShift, z: 0 });
  const shutter = Math.min(t - rate / 60, stage.end);
  // Advance only through the next display frame so the loose deck can be
  // interpolated at the shutter. Replay and scrubbing reuse those samples.
  const track = motion.boardUntil(Math.max(clock, shutter) + 1 / 60);
  const at = boardAt(track, clock);
  const board = boardRigOf(at, { x: -scroll, y: 0, z: -across });
  const dims = bodyDims(stage.skater);
  // While the rider drops off a raised edge, their unsupported limbs travel
  // down with them until the actual pavement meets them.
  const airborne = Math.max(0, ground(X0, 0) - rider.y);
  // The support under any one limb rises above the local floor by at most
  // the rider's actual separation. Curvature between path samples on a
  // steep bank can otherwise turn a fraction of a unit into a flat ledge.
  const support = (x: number, z: number) => {
    const floor = ground(x, z);
    return floor - Math.min(airborne, Math.max(0, floor - rider.y));
  };
  const down = washOutBody(caught, board, elapsed, motion.side, motion.travel, dims, support);
  // The feet come down once the rider is nearly stopped; they stand as the ground stops them.
  const plantAt = Math.max(WASH_OUT_ROLL_START + 0.3, washOutClock(motion.path, WASH_OUT_PLANT * (dims.thigh + dims.shin)));
  const stopAt = Math.max(plantAt + 0.2, washOutClock(motion.path, 0.5));
  const standing = smoothstep((elapsed - stopAt + STAND_LEAD) / WASH_OUT_STAND_T);
  const stopped = motion.path[motion.path.length - 1];
  const rig = elapsed <= WASH_OUT_ROLL_START ? down : recoverWashOut(down, dims, motion.travel, motion.side, support, {
    since: elapsed - WASH_OUT_ROLL_START,
    turned: (elapsed - WASH_OUT_ROLL_START) / (plantAt - WASH_OUT_ROLL_START),
    up: (elapsed - plantAt) / (stopAt - plantAt),
    rest: { x: X0 + stopped.x - rider.x, y: 0, z: stopped.z - rider.z },
    stand: standing,
  });

  const wheelBefore = shutter >= stairs.land ? boardAt(track, shutter).wheel
    : track.poses[0].wheel + (shutter - stairs.land) * approachWheelRate(stage, stairs);
  const sink = smoothstep(elapsed / 0.4) * fallSink((rider.y - rig.head.origin.y) / dims.scale);
  const shadowY = stairShadowLevel(rig, stairs, scroll, across);
  // Watch the landing during the roll. Once upright, look after the loose board.
  const head = rig.head.origin;
  const x = head.x + motion.travel.x * dims.forearm;
  const z = head.z + motion.travel.z * dims.forearm;
  const brace = { x, y: ground(x, z), z };
  const lookDown = smoothstep(elapsed / 0.24) * (1 - smoothstep((standing - 0.3) / 0.5));
  return {
    ...frame, t, rig, scroll,
    gaze: lerp3(board.center, brace, lookDown),
    stairs: { ...frame.stairs!, across, shadowY },
    wheels: { angle: at.wheel, sweep: at.wheel - wheelBefore },
    lift: frame.lift - groundShift - sink,
    expression: elapsed < 0.08 ? frame.expression : elapsed < plantAt ? 'wince' : standing < 1 ? 'focus' : 'open',
    dust: kickedUp(clock, stairs.land, landX + X0 - scroll, 1, landZ - across, spotGround(stairs, landX + X0, landZ)),
    shadows: riderShadows(rig, {
      board: Math.max(0, ground(board.center.x, board.center.z) - board.center.y - WHEEL_BOTTOM),
      body: Math.max(0, bodyClearance(rig, dims, ground)),
    }, ASPHALT - shadowY),
  };
}
