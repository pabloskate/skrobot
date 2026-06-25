'use client';

import { useEffect, useMemo, useState } from 'react';
import { RobotAvatar, type Robot } from '@/features/robots';
import { LETTERS } from './engine';

interface Props {
  robot: Robot;
  playerFirst: boolean;
  onComplete: () => void;
}

/**
 * "DROP IN" game-start cinematic: the S.K.A.T.E. letters slam down one by one,
 * the robot skates across with speed lines, "LET'S SKATE!" pops in, then a
 * wipe sweeps the overlay away and hands control to the game. The player who
 * won RPS gets called out before the title.
 */
const LETTER_DROP_STAGGER = 140;
const ROBOT_IN_MS = 1400;
const TITLE_MS = 500;
const HOLD_MS = 700;
const WIPE_MS = 600;
export const GAME_START_TOTAL_MS = ROBOT_IN_MS + TITLE_MS + HOLD_MS + WIPE_MS;

export default function GameStartAnimation({ robot, playerFirst, onComplete }: Props) {
  const [phase, setPhase] = useState<'letters' | 'wiping' | 'done'>('letters');
  const [wipeStyle, setWipeStyle] = useState<'in' | 'out'>('in');

  const setter = playerFirst ? 'You' : robot.name;

  useEffect(() => {
    const wipeTimer = setTimeout(() => {
      setPhase('wiping');
      setWipeStyle('out');
    }, ROBOT_IN_MS + TITLE_MS + HOLD_MS);

    const doneTimer = setTimeout(() => {
      setPhase('done');
      onComplete();
    }, GAME_START_TOTAL_MS);

    return () => {
      clearTimeout(wipeTimer);
      clearTimeout(doneTimer);
    };
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

  if (phase === 'done') return null;

  return (
    <div className="game-start-overlay" aria-hidden>
      {/* Wipe panel that sweeps across to reveal, then sweeps out */}
      <div className={`game-start-wipe game-start-wipe-${wipeStyle}`} />

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

        {/* S.K.A.T.E. letters slam down */}
        <div className="game-start-letters">
          {LETTERS.map((ch, i) => (
            <span
              key={ch}
              className="game-start-letter"
              style={{ animationDelay: `${i * LETTER_DROP_STAGGER}ms` }}
            >
              {ch}
            </span>
          ))}
        </div>

        {/* Title pops in after letters */}
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
