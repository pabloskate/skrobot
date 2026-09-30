'use client';

import { useEffect, useRef, useState } from 'react';
import { RobotAvatar, type Robot, type SetWeightRobot } from '@/features/robots';
import { TRICK_BY_ID, type Trick } from '@/features/tricks';
import { chooseRobotTrick, robotSetOptions, rollAttempt } from './engine';
import { PICK_GO, PICK_LOCK, pickHead, planPickReel } from './pickTimeline';
import PickReel from './PickReel';
import TrickAnimation from './TrickAnimation';

/**
 * The robot's set turn, from thinking through the result, on one stage. The
 * trick is chosen as the turn starts rather than when thinking ends, so the
 * pick reel can land on it; the reel plays as the attempt's lead-in and
 * ROBOT_SET_CHOICE still fires when thinking ends, at PICK_GO. With nothing
 * left to set, the robot keeps the plain thinking card until it gives up.
 * Mount once per set and keep it mounted through thinking/attempt/result:
 * the initial choice and roll belong to that turn, even as its props update.
 */
export default function RobotSetTurn({
  robot,
  bag,
  used,
  resumed,
  setWeight,
  alwaysLand,
  onChoice,
  onResult,
}: {
  robot: Robot;
  bag: Map<string, number>;
  used: string[];
  /** A turn resumed past thinking: just the attempt, no reel. */
  resumed: Trick | null;
  setWeight: (trick: Trick, robot: SetWeightRobot) => number;
  alwaysLand: boolean;
  onChoice: (trick: Trick | null) => void;
  onResult: (r: { landed: boolean; knewIt: boolean }) => void;
}) {
  const [turn] = useState(() => {
    const trick = resumed ?? chooseRobotTrick(bag, used, TRICK_BY_ID, robot, Math.random, setWeight);
    if (!trick) return null;
    return {
      trick,
      roll: alwaysLand ? { landed: true, knewIt: true } : rollAttempt(bag, trick.id),
      reel: resumed ? null : planPickReel(robotSetOptions(bag, used, TRICK_BY_ID, robot, setWeight), trick),
    };
  });
  const onChoiceRef = useRef(onChoice);
  useEffect(() => {
    onChoiceRef.current = onChoice;
  }, [onChoice]);

  useEffect(() => {
    if (turn) return;
    const t = setTimeout(() => onChoiceRef.current(null), 1400);
    return () => clearTimeout(t);
  }, [turn]);

  if (!turn) {
    return (
      <div className="anim-wobble">
        <RobotAvatar robot={robot} size={140} pose="idle" />
      </div>
    );
  }
  const { trick, roll, reel } = turn;
  return (
    <TrickAnimation
      robot={robot}
      trick={trick}
      landed={roll.landed}
      knewIt={roll.knewIt}
      leadIn={
        reel
          ? {
              seconds: PICK_GO,
              label: `Skip to ${robot.name}'s pick`,
              // The reel runs on turn time; the scene's clock is 0 at the trick.
              skipTo: PICK_LOCK - PICK_GO,
              head: (t) => pickHead(t + PICK_GO, reel),
              overlay: (t) => <PickReel plan={reel} robot={robot} t={t + PICK_GO} />,
              onEnd: () => onChoiceRef.current(trick),
            }
          : undefined
      }
      onDone={() => onResult(roll)}
    />
  );
}
