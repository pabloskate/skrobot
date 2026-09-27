'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { readableAccent } from '@skrobot/animations';
import { RobotAvatar, type Robot } from '@/features/robots';
import type { Rps } from './rps';
import { RPS_CHOICES as RPS, RPS_RULE, robotThrow, rpsOutcome } from './rps';
import { rpsSound, rpsVibrate } from './rpsFeedback';
import GameStartAnimation from './GameStartAnimation';
import RpsHand from './RpsHand';
import { lettersForFormat, type GameFormat } from './engine';

interface Props {
  robot: Robot;
  gameFormat: GameFormat;
  onDone: (playerFirst: boolean) => void;
}

/**
 * "Throw Down": the toss for who sets first, staged as a face-off. The robot's
 * turf (concrete tinted with its body color) and yours (purple grip tape) meet
 * at a slanted coping. Both fists pump on each countdown beat and open on
 * "Shoot!". The winner's turf takes ground (the coping slides toward the
 * loser), the robot reacts with its stoked/bailed pose, and a tie deals the
 * throws straight back.
 */

type Phase = 'idle' | 'counting' | 'tie' | 'resolved' | 'starting';

const COUNTDOWN_WORDS = ['Rock', 'Paper', 'Scissors', 'Shoot!'];
const BEAT_MS = 450;
/** Matches the Start button's fill animation (1s delay + 3.2s fill). */
const AUTO_START_MS = 4200;

const KEY_TO_RPS: Record<string, Rps> = {
  r: 'rock',
  p: 'paper',
  s: 'scissors',
  '1': 'rock',
  '2': 'paper',
  '3': 'scissors',
};

const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

/** Blend two #rrggbb colors; `t` is the share of `a`. */
function mixHex(a: string, b: string, t: number): string {
  const rgb = (hex: string) => hex.replace('#', '').match(/[0-9a-f]{2}/gi)!.map((x) => parseInt(x, 16));
  const [ca, cb] = [rgb(a), rgb(b)];
  return `#${ca.map((v, i) => Math.round(v * t + cb[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function RpsPanel({ robot, gameFormat, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [beat, setBeat] = useState(0);
  const [mine, setMine] = useState<Rps | null>(null);
  const [theirs, setTheirs] = useState<Rps | null>(null);
  /** Increments on every throw; keys the reveal animations. */
  const [round, setRound] = useState(0);
  const [ties, setTies] = useState(0);
  const [taunt, setTaunt] = useState(() => pick(robot.rpsTaunts.countdown));
  const [firstPlayer, setFirstPlayer] = useState<boolean | null>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  const outcome = mine && theirs ? rpsOutcome(mine, theirs) : null;
  const decided = (phase === 'resolved' || phase === 'starting') && outcome !== null && outcome !== 'tie';
  const winner = decided ? (outcome === 'win' ? 'you' : 'bot') : null;
  const revealed = phase === 'tie' || decided;

  const throwHand = useCallback((choice: Rps) => {
    setMine(choice);
    setTheirs(robotThrow());
    setBeat(0);
    setRound((r) => r + 1);
    setPhase('counting');
    rpsVibrate(15);
    rpsSound('beat');
  }, []);

  const start = useCallback(() => {
    if (phase !== 'resolved' || !winner) return;
    setFirstPlayer(winner === 'you');
    setPhase('starting');
    rpsVibrate([20, 40, 60]);
  }, [phase, winner]);

  // Countdown: one beat per word, then the reveal.
  useEffect(() => {
    if (phase !== 'counting' || !mine || !theirs) return;
    const timers = [1, 2, 3].map((i) =>
      window.setTimeout(() => {
        setBeat(i);
        rpsVibrate(15);
        rpsSound(i === COUNTDOWN_WORDS.length - 1 ? 'reveal' : 'beat');
      }, i * BEAT_MS),
    );
    timers.push(
      window.setTimeout(() => {
        const result = rpsOutcome(mine, theirs);
        if (result === 'tie') {
          setTies((t) => t + 1);
          setTaunt(pick(robot.rpsTaunts.tie));
          setPhase('tie');
        } else {
          // The robot's taunts are written from its side: its "win" is your loss.
          setTaunt(pick(result === 'win' ? robot.rpsTaunts.lose : robot.rpsTaunts.win));
          setPhase('resolved');
        }
        rpsSound(result);
        rpsVibrate(result === 'tie' ? [20, 30, 20, 30, 20] : [30, 40, 30]);
      }, COUNTDOWN_WORDS.length * BEAT_MS),
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [phase, mine, theirs, robot]);

  // After the reveal: focus Start for keyboard users, and start on our own once
  // the button has filled (skipped with reduced motion, where it can't fill).
  useEffect(() => {
    if (phase !== 'resolved') return;
    startRef.current?.focus({ preventScroll: true });
    if (prefersReducedMotion()) return;
    const timer = window.setTimeout(start, AUTO_START_MS);
    return () => clearTimeout(timer);
  }, [phase, start]);

  // Keyboard: R/P/S or 1/2/3 to throw, Enter to start.
  useEffect(() => {
    if (phase !== 'idle' && phase !== 'tie' && phase !== 'resolved') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (phase === 'resolved') {
        const onControl = e.target instanceof Element && e.target.closest('button, a, input, textarea, select');
        if (e.key === 'Enter' && !onControl) {
          e.preventDefault();
          start();
        }
        return;
      }
      const choice = KEY_TO_RPS[e.key.toLowerCase()];
      if (choice) {
        e.preventDefault();
        throwHand(choice);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, throwHand, start]);

  const label = (id: Rps | null) => RPS.find((c) => c.id === id)?.label ?? '';
  const winningThrow = winner === 'you' ? mine : winner === 'bot' ? theirs : null;
  const tape =
    phase === 'tie' ? `Both threw ${label(mine).toLowerCase()}` : winningThrow ? RPS_RULE[winningThrow] : null;
  const setterLine = winner === 'you' ? 'You set first.' : `${robot.name} sets first.`;
  const announcement =
    phase === 'tie'
      ? `Tie. You both threw ${label(mine)}. Throw again.`
      : winningThrow
        ? `${RPS_RULE[winningThrow]}. ${setterLine}`
        : '';

  const accent = readableAccent(robot.avatar.accent);
  const arenaStyle = {
    '--rps-turf-top': mixHex(robot.avatar.body, '#fbfaff', 0.12),
    '--rps-turf-bottom': mixHex(robot.avatar.body, '#eceaf3', 0.32),
    '--rps-bot-name': mixHex(robot.avatar.body, '#23232e', 0.7),
  } as CSSProperties;
  const handState = (side: 'you' | 'bot') => (winner === side ? ' is-winner' : winner ? ' is-loser' : '');
  // Remount keys replay one-shot CSS animations: per beat while counting, once per reveal.
  const motionKey = phase === 'counting' ? `beat-${beat}` : 'rest';
  const glyphKey = revealed ? `reveal-${round}` : 'fist';

  return (
    <>
      <section
        className="rps-arena"
        data-phase={phase === 'starting' ? 'resolved' : phase}
        data-winner={winner ?? 'none'}
        style={arenaStyle}
        aria-label={`Rock, paper, scissors with ${robot.name}. Winner sets first.`}
      >
        <div className="rps-turf-bot">
          <div className="rps-bot-figure" aria-hidden="true">
            <div
              key={phase === 'counting' ? `beat-${beat}` : `${winner ?? 'none'}-${round}`}
              className={`rps-bot-bob${phase === 'counting' ? ' is-beat' : ''}`}
            >
              <RobotAvatar
                robot={robot}
                size={124}
                pose={winner === 'bot' ? 'stoked' : winner === 'you' ? 'bailed' : 'idle'}
              />
            </div>
          </div>
          <p key={taunt} className="rps-bubble">
            <span className="rps-bubble-name">{robot.name}</span>
            {taunt}
          </p>
        </div>
        <div className="rps-coping" aria-hidden="true" />

        <div className={`rps-hand rps-hand-bot${handState('bot')}`} aria-hidden="true">
          <div key={motionKey} className={`rps-hand-motion${phase === 'counting' ? ' is-beat' : ''}`}>
            <div key={glyphKey} className={`rps-hand-glyph${revealed ? ' is-reveal' : ''}`}>
              <RpsHand kind={revealed && theirs ? theirs : 'rock'} fill={robot.avatar.body} cuff={accent} robot />
            </div>
          </div>
        </div>
        <div className={`rps-hand rps-hand-you${handState('you')}`} aria-hidden="true">
          <div key={motionKey} className={`rps-hand-motion${phase === 'counting' ? ' is-beat' : ''}`}>
            <div key={glyphKey} className={`rps-hand-glyph${revealed ? ' is-reveal' : ''}`}>
              <RpsHand kind={revealed && mine ? mine : 'rock'} />
            </div>
          </div>
        </div>

        <div className="rps-center" aria-hidden="true">
          {phase === 'idle' && <span className="rps-vs">VS</span>}
          {phase === 'counting' && (
            <span key={beat} className={`rps-count-word${beat === COUNTDOWN_WORDS.length - 1 ? ' is-shoot' : ''}`}>
              {COUNTDOWN_WORDS[beat]}
            </span>
          )}
          {tape && (
            <span key={`tape-${round}`} className="rps-tape-wrap">
              <span className="rps-tape">{tape}</span>
            </span>
          )}
        </div>

        <div className="rps-tray">
          {(phase === 'idle' || phase === 'tie') && (
            <div key={`pick-${ties}`} className="rps-tray-pick">
              <p className="rps-tray-label">
                {phase === 'tie' ? `Tie${ties > 1 ? ` ×${ties}` : ''} · throw again` : 'Winner sets first'}
              </p>
              <div className="rps-stickers">
                {RPS.map((c) => (
                  <button key={c.id} type="button" className={`rps-sticker rps-throw-${c.id}`} onClick={() => throwHand(c.id)}>
                    <span className="rps-sticker-face">
                      <RpsHand kind={c.id} />
                    </span>
                    <span className="rps-sticker-name">{c.label}</span>
                    <kbd aria-hidden="true">{c.label[0]}</kbd>
                  </button>
                ))}
              </div>
              <p className="rps-tray-hint">Tap a throw</p>
            </div>
          )}

          {phase === 'counting' && mine && (
            <div className="rps-tray-count" aria-hidden="true">
              <span className="rps-locked">
                <span className={`rps-locked-face rps-throw-${mine}`}>
                  <RpsHand kind={mine} />
                </span>
                <span className="rps-locked-text">
                  <small>Locked in</small>
                  <b>{label(mine)}</b>
                </span>
              </span>
              <span className="rps-pips">
                {COUNTDOWN_WORDS.map((w, i) => (
                  <i key={w} className={i <= beat ? 'is-on' : undefined} />
                ))}
              </span>
            </div>
          )}

          {decided && (
            <div className="rps-tray-result">
              <p className="rps-result-eyebrow">
                {winner === 'you' ? 'You won the throw' : `${robot.name} won the throw`}
              </p>
              <h2 className="rps-result-head">{setterLine}</h2>
              <button ref={startRef} type="button" className="rps-start" onClick={start} disabled={phase === 'starting'}>
                <span className="rps-start-fill" aria-hidden="true" />
                <span className="rps-start-label">Start game</span>
              </button>
            </div>
          )}
        </div>

        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </section>

      {phase === 'starting' && firstPlayer !== null && (
        <GameStartAnimation robot={robot} playerFirst={firstPlayer} letters={lettersForFormat(gameFormat)} onComplete={() => onDone(firstPlayer)} />
      )}
    </>
  );
}
