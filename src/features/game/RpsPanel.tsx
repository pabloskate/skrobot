'use client';

import { useEffect, useRef, useState } from 'react';
import { getRpsTaunt, RobotAvatar, type Robot } from '@/features/robots';
import type { Rps, RpsOutcome } from './rps';
import { RPS_CHOICES as RPS, robotThrow, rpsOutcome } from './rps';
import { rpsSound, rpsVibrate } from './rpsFeedback';

interface Props {
  robot: Robot;
  onDone: (playerFirst: boolean) => void;
}

type Phase = 'idle' | 'counting' | 'resolved';

const COUNTDOWN_WORDS = ['Rock…', 'Paper…', 'Scissors…', 'Shoot!'];
const BEAT_MS = 450;

export default function RpsPanel({ robot, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [countIndex, setCountIndex] = useState(0);
  const [mine, setMine] = useState<Rps | null>(null);
  const [theirs, setTheirs] = useState<Rps | null>(null);
  const [outcome, setOutcome] = useState<RpsOutcome | null>(null);
  const [countdownTaunt, setCountdownTaunt] = useState('');
  const [resultTaunt, setResultTaunt] = useState('');
  const liveRef = useRef<HTMLDivElement>(null);

  const startCountdown = (choice: Rps) => {
    const robotChoice = robotThrow();
    const result = rpsOutcome(choice, robotChoice);

    setMine(choice);
    setTheirs(robotChoice);
    setOutcome(result);
    setCountIndex(0);
    setCountdownTaunt(getRpsTaunt(robot, 'countdown'));
    setPhase('counting');

    rpsVibrate(15);
    rpsSound('beat');
  };

  useEffect(() => {
    if (phase !== 'counting') return;

    const tick = () => {
      setCountIndex((prev) => {
        const next = prev + 1;
        if (next >= COUNTDOWN_WORDS.length) {
          // Final beat already handled by timer below
          return prev;
        }
        rpsVibrate(15);
        rpsSound('beat');
        return next;
      });
    };

    const timers: number[] = [];
    for (let i = 1; i < COUNTDOWN_WORDS.length; i++) {
      timers.push(window.setTimeout(tick, i * BEAT_MS));
    }

    const revealTimer = window.setTimeout(() => {
      setPhase('resolved');
      rpsSound(outcome === 'tie' ? 'tie' : outcome === 'win' ? 'win' : 'lose');
      rpsVibrate(outcome === 'tie' ? [20, 30, 20, 30, 20] : [30, 40, 30]);
      setResultTaunt(getRpsTaunt(robot, outcome === 'tie' ? 'tie' : outcome === 'win' ? 'lose' : 'win'));
      liveRef.current?.focus();
    }, COUNTDOWN_WORDS.length * BEAT_MS);

    return () => {
      timers.forEach((t) => clearTimeout(t));
      clearTimeout(revealTimer);
    };
  }, [phase, outcome, robot]);

  const reset = () => {
    setPhase('idle');
    setMine(null);
    setTheirs(null);
    setOutcome(null);
    setCountIndex(0);
    setResultTaunt('');
  };

  const mineIcon = mine ? RPS.find((c) => c.id === mine)!.icon : '✊';
  const theirsIcon = theirs ? RPS.find((c) => c.id === theirs)!.icon : '✊';
  const mineLabel = mine ? RPS.find((c) => c.id === mine)!.label : 'You';
  const theirsLabel = theirs ? RPS.find((c) => c.id === theirs)!.label : robot.name;

  return (
    <div className="panel center rps-panel">
      <h2 className="panel-title">Rock, Paper, Scissors?</h2>
      <p className="muted">Winner sets first</p>

      {phase === 'idle' && (
        <>
          {countdownTaunt && <div className="rps-taunt-bubble">{countdownTaunt}</div>}
          <div className="rps-row">
            {RPS.map((c) => (
              <button
                key={c.id}
                className="rps-btn"
                onClick={() => startCountdown(c.id)}
                aria-label={c.label}
              >
                {c.icon}
              </button>
            ))}
          </div>
        </>
      )}

      {phase === 'counting' && (
        <div className="rps-countdown" aria-live="off">
          <div className="rps-taunt-bubble">{countdownTaunt}</div>
          <div className="rps-countdown-word">{COUNTDOWN_WORDS[countIndex]}</div>
          <div className="rps-duel">
            <div className="rps-duel-side">
              <span className="rps-fist rps-bounce">✊</span>
              <span className="rps-who">You</span>
            </div>
            <span className="rps-vs">vs</span>
            <div className="rps-duel-side">
              <span className="rps-robot-fist rps-bounce">
                <RobotAvatar robot={robot} size={72} />
              </span>
              <span className="rps-who">{robot.name}</span>
            </div>
          </div>
        </div>
      )}

      {phase === 'resolved' && (
        <div
          className={`rps-result ${outcome === 'tie' ? 'rps-tie' : ''}`}
          ref={liveRef}
          tabIndex={-1}
          aria-live="polite"
        >
          <div className="rps-taunt-bubble">{resultTaunt}</div>
          <div className="rps-reveal">
            <div className={outcome === 'win' ? 'rps-winner' : ''}>
              <span className="rps-icon rps-reveal-pop">{mineIcon}</span>
              <span className="rps-who">You</span>
            </div>
            <span className="rps-vs">vs</span>
            <div className={outcome === 'lose' ? 'rps-winner' : ''}>
              <span className="rps-icon rps-reveal-pop">{theirsIcon}</span>
              <span className="rps-who">{robot.name}</span>
            </div>
          </div>
          <p className="rps-outcome-text">
            {outcome === 'win' && `Your ${mineLabel} beats ${robot.name}'s ${theirsLabel}.`}
            {outcome === 'lose' && `${robot.name}'s ${theirsLabel} beats your ${mineLabel}.`}
            {outcome === 'tie' && `You both threw ${mineLabel}.`}
          </p>
          {outcome === 'tie' ? (
            <button className="btn-primary" onClick={reset}>
              Tie — throw again
            </button>
          ) : (
            <button className="btn-primary" onClick={() => onDone(outcome === 'win')}>
              {outcome === 'win' ? 'You set first — start!' : `${robot.name} sets first — start!`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
