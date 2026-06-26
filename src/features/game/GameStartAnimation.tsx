'use client';

import { useEffect, useMemo } from 'react';
import { RobotAvatar, type Robot } from '@/features/robots';
interface Props {
  robot: Robot;
  playerFirst: boolean;
  onComplete: () => void;
}

/**
 * "DROP IN" game-start cinematic: the robot skates across with speed lines,
 * "LET'S SKATE!" pops in, and the player who won RPS gets called out. After a
 * short hold the overlay is unmounted and the game begins.
 */
const ROBOT_IN_MS = 1200;
const TITLE_MS = 500;
const HOLD_MS = 700;

export default function GameStartAnimation({ robot, playerFirst, onComplete }: Props) {
  const setter = playerFirst ? 'You' : robot.name;

  useEffect(() => {
    const doneTimer = setTimeout(() => {
      onComplete();
    }, ROBOT_IN_MS + TITLE_MS + HOLD_MS);

    return () => clearTimeout(doneTimer);
  }, [onComplete]);

  const speedLines = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        top: `${20 + i * 12}%`,
        delay: `${i * 0.08}s`,
        width: `${60 + (i % 3) * 40}px`,
      })),
    [],
  );

  return (
    <div className="game-start-overlay" aria-hidden>
      <div className="game-start-content">
        {/* Speed lines behind the robot */}
        <div className="game-start-speedlines">
          {speedLines.map((s, i) => (
            <span key={i} style={{ top: s.top, animationDelay: s.delay, width: s.width }} />
          ))}
        </div>

        {/* Robot skates in from the left */}
        <div className="game-start-robot">
          <RobotAvatar robot={robot} size={120} pose="stoked" />
        </div>

        {/* Title pops in after the robot rolls in */}
        <div className="game-start-title" style={{ animationDelay: `${ROBOT_IN_MS}ms` }}>
          <span className="game-start-title-main">LET&apos;S SKATE!</span>
          <span className="game-start-title-sub">
            {playerFirst ? 'You set first' : `${setter} sets first`}
          </span>
        </div>
      </div>
    </div>
  );
}
