'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { TbMicrophone } from 'react-icons/tb';
import { recordResult } from '@/features/records';
import type { Robot } from '@/features/robots';
import { buildBag, RobotAvatar } from '@/features/robots';
import type { Trick } from '@/features/tricks';
import { TRICK_BY_ID, TrickPicker } from '@/features/tricks';
import {
  LETTERS,
  chooseRobotTrick,
  gameReducer,
  initialGameState,
  rollAttempt,
} from './engine';
import type { GameState, Side } from './engine';
import type { Rps } from './rps';
import { RPS_CHOICES as RPS, robotThrow, rpsOutcome } from './rps';
import TrickAnimation from './TrickAnimation';

interface Props {
  robot: Robot;
  pool: Trick[];
  /** Game state carried over when the player switches modes mid-game. */
  resume?: GameState;
  onExit: () => void;
  /** Hand the live game state over to voice mode. */
  onVoice?: (state: GameState) => void;
}

// ---------- Rock Paper Scissors ----------

function RpsPanel({ robot, onDone }: { robot: Robot; onDone: (playerFirst: boolean) => void }) {
  const [result, setResult] = useState<{ mine: Rps; theirs: Rps } | null>(null);

  const pick = (mine: Rps) => {
    setResult({ mine, theirs: robotThrow() });
  };

  const outcome = result ? rpsOutcome(result.mine, result.theirs) : null;

  return (
    <div className="panel center">
      <h2 className="panel-title">Rock, Paper, Scissors?</h2>
      <p className="muted">Winner sets first</p>
      {!result ? (
        <div className="rps-row">
          {RPS.map((c) => (
            <button key={c.id} className="rps-btn" onClick={() => pick(c.id)} aria-label={c.label}>
              {c.icon}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="rps-reveal">
            <div>
              <span className="rps-icon">{RPS.find((c) => c.id === result.mine)!.icon}</span>
              <span className="rps-who">You</span>
            </div>
            <span className="rps-vs">vs</span>
            <div>
              <span className="rps-icon">{RPS.find((c) => c.id === result.theirs)!.icon}</span>
              <span className="rps-who">{robot.name}</span>
            </div>
          </div>
          {outcome === 'tie' ? (
            <button className="btn-primary" onClick={() => setResult(null)}>
              Tie — throw again
            </button>
          ) : (
            <button className="btn-primary" onClick={() => onDone(outcome === 'win')}>
              {outcome === 'win' ? 'You set first — start!' : `${robot.name} sets first — start!`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Scoreboard ----------

function LetterRow({ count, flash }: { count: number; flash: boolean }) {
  return (
    <div className="letters">
      {LETTERS.map((ch, i) => (
        <span
          key={ch}
          className={`letter ${i < count ? 'letter-on' : ''} ${flash && i === count - 1 ? 'letter-pop' : ''}`}
        >
          {ch}
        </span>
      ))}
    </div>
  );
}

function Scoreboard({ state, robot }: { state: GameState; robot: Robot }) {
  // "Adjust state during render" pattern: remember the last letter counts so the
  // side that just took a letter gets the pop animation.
  const [prev, setPrev] = useState(state.letters);
  const [flash, setFlash] = useState<Side | null>(null);
  if (state.letters !== prev) {
    setPrev(state.letters);
    if (state.letters.player > prev.player) setFlash('player');
    else if (state.letters.robot > prev.robot) setFlash('robot');
  }

  return (
    <div className="scoreboard">
      <div className="score-row">
        <span className="score-name">{robot.name}</span>
        <LetterRow count={state.letters.robot} flash={flash === 'robot'} />
      </div>
      <div className="score-row">
        <span className="score-name">You</span>
        <LetterRow count={state.letters.player} flash={flash === 'player'} />
      </div>
    </div>
  );
}

// ---------- Main screen ----------

export default function GameScreen({ robot, pool, resume, onExit, onVoice }: Props) {
  const [state, dispatch] = useReducer(gameReducer, resume ?? initialGameState);
  const [pickerOpen, setPickerOpen] = useState(false);
  const bag = useMemo(() => buildBag(robot, pool), [robot, pool]);
  // A resumed finished game was already recorded by the other mode.
  const recorded = useRef(resume?.phase === 'over');

  const say = (template: string) => template.replaceAll('{R}', robot.name);

  // Robot picking a trick is still a simple timer; attempts are resolved by
  // the trick animation (the roll happens up front, the animation shows the
  // outcome, and its completion dispatches the result).
  useEffect(() => {
    if (state.phase !== 'robotSet' || state.stage !== 'thinking') return;
    const t = setTimeout(
      () => dispatch({ type: 'ROBOT_SET_CHOICE', trick: chooseRobotTrick(bag, state.used, TRICK_BY_ID) }),
      1400,
    );
    return () => clearTimeout(t);
  }, [state.phase, state.stage, state.used, bag]);

  // Persist W/L once per game.
  useEffect(() => {
    if (state.phase === 'over' && state.winner && !recorded.current) {
      recorded.current = true;
      recordResult(robot.id, state.winner === 'player');
    }
    if (state.phase === 'rps') recorded.current = false;
  }, [state.phase, state.winner, robot.id]);

  const usedIds = useMemo(() => new Set(state.used), [state.used]);

  const robotPose =
    state.stage === 'missed' || state.stage === 'cant' ? 'bailed' : state.stage === 'landed' ? 'stoked' : 'idle';
  const robotAnim = state.stage === 'attempting' || state.stage === 'retry' || state.stage === 'thinking' ? 'anim-wobble' : '';

  return (
    <div className="container game">
      {state.phase !== 'rps' && <Scoreboard state={state} robot={robot} />}

      {state.phase === 'rps' && (
        <RpsPanel robot={robot} onDone={(playerFirst) => dispatch({ type: 'START', playerFirst })} />
      )}

      {state.phase === 'playerSet' && (
        <div className="panel center">
          {state.note && <p className="note">{say(state.note)}</p>}
          <h2 className="panel-title">Your turn to set</h2>
          <p className="muted">Go skate! Then come back and tell me how it went.</p>
          <button className="btn-primary" onClick={() => setPickerOpen(true)}>
            I landed a trick
          </button>
          <button className="btn-ghost" onClick={() => dispatch({ type: 'PLAYER_SET_MISSED' })}>
            Couldn't land one — pass
          </button>
        </div>
      )}

      {(state.phase === 'robotCopy' || state.phase === 'robotSet') && (
        <div className="panel center">
          {state.current && state.stage !== 'thinking' ? (
            <RobotAttempt
              // Remount per attempt: a retry decrements attemptsLeft, which
              // re-rolls and replays the animation.
              key={`${state.phase}-${state.current.id}-${state.attemptsLeft}`}
              robot={robot}
              trick={state.current}
              bag={bag}
              onResult={({ landed, knewIt }) =>
                dispatch(
                  state.phase === 'robotCopy'
                    ? { type: 'ROBOT_COPY_RESULT', landed, knewIt }
                    : { type: 'ROBOT_SET_RESULT', landed },
                )
              }
            />
          ) : (
            <div className={robotAnim}>
              <RobotAvatar robot={robot} size={140} pose={robotPose} />
            </div>
          )}
          <RobotStatus state={state} say={say} />
          {(state.stage === 'landed' || state.stage === 'missed' || state.stage === 'cant') && (
            <button className="btn-primary" onClick={() => dispatch({ type: 'CONTINUE' })}>
              {continueLabel(state)}
            </button>
          )}
        </div>
      )}

      {state.phase === 'playerCopy' && state.current && (
        <div className="panel center">
          {state.note && <p className="note">{say(state.note)}</p>}
          <p className="muted">{robot.name} set:</p>
          <h2 className="trick-callout">{state.current.name}</h2>
          <p className="muted">Land it or take a letter.</p>
          <button className="btn-primary" onClick={() => dispatch({ type: 'PLAYER_COPY_LANDED' })}>
            Landed it 🤘
          </button>
          <button className="btn-danger" onClick={() => dispatch({ type: 'PLAYER_COPY_MISSED' })}>
            Missed it
          </button>
        </div>
      )}

      {state.phase === 'over' && (
        <div className="panel center">
          {state.winner === 'player' && <Confetti />}
          <RobotAvatar robot={robot} size={140} pose={state.winner === 'player' ? 'bailed' : 'stoked'} />
          <h2 className="panel-title">
            {state.winner === 'player' ? `You beat ${robot.name}! 🏆` : `${robot.name} wins this one`}
          </h2>
          <p className="muted">
            {state.winner === 'player'
              ? `${robot.name} spelled S.K.A.T.E. — rust in pieces.`
              : 'Run it back? Every robot has off days.'}
          </p>
          <button className="btn-primary" onClick={() => dispatch({ type: 'REMATCH' })}>
            Rematch
          </button>
          <button className="btn-ghost" onClick={onExit}>
            Back to robots
          </button>
        </div>
      )}

      {/* Mode switch is only offered while the game waits on the player —
          robot turns resolve through animations that can't be handed over mid-flight. */}
      {onVoice && (state.phase === 'rps' || state.phase === 'playerSet' || state.phase === 'playerCopy') && (
        <button className="voice-entry" onClick={() => onVoice(state)}>
          <span className="voice-entry-icon">
            <TbMicrophone aria-hidden />
          </span>
          <span className="voice-entry-text">
            <strong>{state.phase === 'rps' ? 'Play this game by voice' : 'Switch to voice'}</strong>
            <small>
              {state.phase === 'rps'
                ? 'Hands-free with earbuds — just talk while you skate'
                : 'Keep this game going hands-free with earbuds'}
            </small>
          </span>
        </button>
      )}

      {pickerOpen && (
        <TrickPicker
          title="What did you land?"
          pool={pool}
          usedIds={usedIds}
          onClose={() => setPickerOpen(false)}
          onPick={(trick) => {
            setPickerOpen(false);
            dispatch({ type: 'PLAYER_SET_LANDED', trick });
          }}
        />
      )}
    </div>
  );
}

/**
 * One robot attempt: rolls the dice once on mount so the animation can show
 * the real outcome, then reports it when the animation finishes. Stays
 * mounted (frozen on the final frame) through the landed/missed stage.
 */
function RobotAttempt({
  robot,
  trick,
  bag,
  onResult,
}: {
  robot: Robot;
  trick: Trick;
  bag: Map<string, number>;
  onResult: (r: { landed: boolean; knewIt: boolean }) => void;
}) {
  const [roll] = useState(() => rollAttempt(bag, trick.id));
  return <TrickAnimation robot={robot} trick={trick} landed={roll.landed} onDone={() => onResult(roll)} />;
}

function RobotStatus({ state, say }: { state: GameState; say: (s: string) => string }) {
  const trick = state.current?.name;
  let text = '';
  if (state.phase === 'robotCopy') {
    if (state.stage === 'attempting') text = `{R} is trying your ${trick}…`;
    else if (state.stage === 'retry') text = `{R} is on its last letter — one more try…`;
    else if (state.stage === 'landed') text = `{R} landed the ${trick}!`;
    else if (state.stage === 'missed')
      text = state.robotKnewIt ? `{R} couldn't match your ${trick}!` : `{R} has no idea how to ${trick}!`;
  } else {
    if (state.stage === 'thinking') text = `{R} is picking a trick…`;
    else if (state.stage === 'attempting') text = `{R} goes for a ${trick}…`;
    else if (state.stage === 'landed') text = `{R} set: ${trick}`;
    else if (state.stage === 'missed') text = `{R} didn't land it`;
    else if (state.stage === 'cant') text = `{R} is out of tricks to set!`;
  }
  const busy = state.stage === 'thinking' || state.stage === 'attempting' || state.stage === 'retry';
  return (
    <>
      {state.note && state.stage === 'thinking' && <p className="note">{say(state.note)}</p>}
      <h2 className={`panel-title ${busy ? 'pulse' : ''}`}>{say(text)}</h2>
    </>
  );
}

function continueLabel(state: GameState): string {
  if (state.winner) return 'See result';
  if (state.phase === 'robotCopy') return state.stage === 'landed' ? 'Set another trick' : 'Your set continues';
  if (state.stage === 'landed') return 'Go try it';
  return 'Your turn to set';
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        left: `${(i * 41) % 100}%`,
        delay: `${(i % 8) * 0.15}s`,
        hue: (i * 47) % 360,
      })),
    [],
  );
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <span key={i} style={{ left: p.left, animationDelay: p.delay, background: `hsl(${p.hue} 85% 60%)` }} />
      ))}
    </div>
  );
}
