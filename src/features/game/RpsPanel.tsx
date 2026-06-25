'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RobotAvatar, type Robot } from '@/features/robots';
import type { Rps, RpsOutcome } from './rps';
import { RPS_CHOICES as RPS, robotThrow, rpsOutcome } from './rps';
import { rpsSound, rpsVibrate } from './rpsFeedback';
import GameStartAnimation from './GameStartAnimation';

interface Props {
  robot: Robot;
  onDone: (playerFirst: boolean) => void;
}

type Phase = 'idle' | 'counting' | 'resolved' | 'starting';

const COUNTDOWN_WORDS = ['Rock…', 'Paper…', 'Scissors…', 'Shoot!'];
const BEAT_MS = 450;

const KEY_TO_RPS: Record<string, Rps> = {
  r: 'rock',
  p: 'paper',
  s: 'scissors',
  '1': 'rock',
  '2': 'paper',
  '3': 'scissors',
};

export default function RpsPanel({ robot, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [countIndex, setCountIndex] = useState(0);
  const [mine, setMine] = useState<Rps | null>(null);
  const [theirs, setTheirs] = useState<Rps | null>(null);
  const [outcome, setOutcome] = useState<RpsOutcome | null>(null);
  const [firstPlayer, setFirstPlayer] = useState<boolean | null>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  const startCountdown = useCallback(
    (choice: Rps) => {
      const robotChoice = robotThrow();
      const result = rpsOutcome(choice, robotChoice);

      setMine(choice);
      setTheirs(robotChoice);
      setOutcome(result);
      setCountIndex(0);
      setPhase('counting');

      rpsVibrate(15);
      rpsSound('beat');
    },
    [],
  );

  // Keyboard throws during idle: R/P/S or 1/2/3.
  useEffect(() => {
    if (phase !== 'idle') return;
    const onKey = (e: KeyboardEvent) => {
      const choice = KEY_TO_RPS[e.key.toLowerCase()];
      if (choice) {
        e.preventDefault();
        startCountdown(choice);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, startCountdown]);

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
      liveRef.current?.focus();
    }, COUNTDOWN_WORDS.length * BEAT_MS);

    return () => {
      timers.forEach((t) => clearTimeout(t));
      clearTimeout(revealTimer);
    };
  }, [phase, outcome]);

  const reset = () => {
    setPhase('idle');
    setMine(null);
    setTheirs(null);
    setOutcome(null);
    setFirstPlayer(null);
    setCountIndex(0);
  };

  const mineChoice = mine ? RPS.find((c) => c.id === mine)! : null;
  const theirsChoice = theirs ? RPS.find((c) => c.id === theirs)! : null;
  const mineIcon = mineChoice?.icon ?? '✊';
  const theirsIcon = theirsChoice?.icon ?? '✊';

  const headline =
    outcome === 'win' ? 'You win!' : outcome === 'lose' ? `${robot.name} wins` : 'Tie!';

  return (
    <div className="panel center rps-panel">
      <h2 className="panel-title">Rock, Paper, Scissors</h2>

      {phase === 'idle' && (
        <>
          <div className="rps-row">
            {RPS.map((c) => (
              <button
                key={c.id}
                className="rps-btn"
                onClick={() => startCountdown(c.id)}
                aria-label={c.label}
              >
                <span className="rps-btn-icon">{c.icon}</span>
                <span className="rps-btn-label">{c.label}</span>
              </button>
            ))}
          </div>
          <p className="muted small">Tap a throw</p>
        </>
      )}

      {phase === 'counting' && (
        <div className="rps-countdown" aria-live="off">
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
          {mineChoice && (
            <div className="rps-locked" aria-hidden="true">
              <span className="rps-locked-label">You locked in</span>
              <span className="rps-locked-icon">{mineChoice.icon}</span>
              <span className="rps-locked-name">{mineChoice.label}</span>
            </div>
          )}
        </div>
      )}

      {phase === 'resolved' && outcome && (
        <div
          className={`rps-result rps-result-${outcome}`}
          ref={liveRef}
          tabIndex={-1}
          aria-live="polite"
        >
          <div className={`rps-headline rps-headline-${outcome}`}>{headline}</div>
          <div className="rps-reveal">
            <div className={outcome === 'win' ? 'rps-winner' : outcome === 'lose' ? 'rps-loser' : ''}>
              {outcome === 'win' && <span className="rps-badge">WINS</span>}
              <span className="rps-icon rps-reveal-pop">{mineIcon}</span>
              <span className="rps-who">You</span>
            </div>
            <span className="rps-vs">vs</span>
            <div className={outcome === 'lose' ? 'rps-winner' : outcome === 'win' ? 'rps-loser' : ''}>
              {outcome === 'lose' && <span className="rps-badge">WINS</span>}
              <span className="rps-icon rps-reveal-pop">{theirsIcon}</span>
              <span className="rps-who">{robot.name}</span>
            </div>
          </div>
          <p className="rps-outcome-text">
            {outcome === 'win' &&
              `Your ${mineChoice?.label} beats ${robot.name}'s ${theirsChoice?.label}.`}
            {outcome === 'lose' &&
              `${robot.name}'s ${theirsChoice?.label} beats your ${mineChoice?.label}.`}
            {outcome === 'tie' && `You both threw ${mineChoice?.label}.`}
          </p>
          {outcome === 'tie' ? (
            <button className="btn-primary" onClick={reset}>
              Tie — throw again
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={() => {
                setFirstPlayer(outcome === 'win');
                setPhase('starting');
                rpsVibrate([20, 40, 60]);
              }}
            >
              {outcome === 'win' ? 'You set first — start!' : `${robot.name} sets first — start!`}
            </button>
          )}
        </div>
      )}

      {phase === 'starting' && firstPlayer !== null && (
        <GameStartAnimation
          robot={robot}
          playerFirst={firstPlayer}
          onComplete={() => onDone(firstPlayer)}
        />
      )}
    </div>
  );
}
