'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { appendGameLog, recordResult } from '@/features/records';
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
import RpsPanel from './RpsPanel';
import TrickAnimation from './TrickAnimation';

interface Props {
  robot: Robot;
  pool: Trick[];
  /** Game state carried over when the player switches modes mid-game. */
  resume?: GameState;
  onExit: () => void;
  /** Report when the current game state can be handed to voice mode. */
  onVoiceState?: (state: GameState | undefined) => void;
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

export default function GameScreen({ robot, pool, resume, onExit, onVoiceState }: Props) {
  const [state, dispatch] = useReducer(gameReducer, resume ?? initialGameState);
  const [pickerOpen, setPickerOpen] = useState(false);
  const bag = useMemo(() => buildBag(robot, pool), [robot, pool]);
  // A resumed finished game was already recorded by the other mode.
  const recorded = useRef(resume?.phase === 'over');
  const tricksLanded = useRef<string[]>([]);

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
      const won = state.winner === 'player';
      recordResult(robot.id, won);
      appendGameLog({
        date: new Date().toISOString(),
        robotId: robot.id,
        mode: 'screen',
        won,
        playerLetters: state.letters.player,
        robotLetters: state.letters.robot,
        tricksLanded: tricksLanded.current,
      });
    }
    if (state.phase === 'rps') {
      recorded.current = false;
      tricksLanded.current = [];
    }
  }, [state.phase, state.winner, state.letters.player, state.letters.robot, robot.id]);

  // Tell the shell when voice mode can take over (only on player turns).
  const canHandToVoice =
    onVoiceState != null && (state.phase === 'rps' || state.phase === 'playerSet' || state.phase === 'playerCopy');
  useEffect(() => {
    onVoiceState?.(canHandToVoice ? state : undefined);
  }, [canHandToVoice, state, onVoiceState]);

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
        <div className="panel center attempt-panel">
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

      {pickerOpen && (
        <TrickPicker
          title="What did you land?"
          pool={pool}
          usedIds={usedIds}
          onClose={() => setPickerOpen(false)}
          onPick={(trick) => {
            setPickerOpen(false);
            tricksLanded.current.push(trick.name);
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
  return <TrickAnimation robot={robot} trick={trick} landed={roll.landed} knewIt={roll.knewIt} onDone={() => onResult(roll)} />;
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
