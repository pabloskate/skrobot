'use client';

import { PushOffAnimation } from '@skrobot/animations';
import type { Robot } from '@/features/robots';

interface Props {
  robot: Robot;
  playerFirst: boolean;
  letters: readonly string[];
  onComplete: () => void;
}

export default function GameStartAnimation({ robot, playerFirst, letters, onComplete }: Props) {
  return (
    <PushOffAnimation
      robot={robot}
      playerFirst={playerFirst}
      letters={letters}
      who={playerFirst ? 'You' : robot.name}
      nextTurn={playerFirst
        ? `Land any trick. ${robot.name} has to match it.`
        : `Land ${robot.name}’s trick back or take a letter.`}
      onComplete={onComplete}
    />
  );
}
