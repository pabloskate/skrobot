'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { recordCompletedMatch } from '@/features/records';
import type { TrickAttempt } from '@/features/records';
import type { Robot } from '@/features/robots';
import { buildBag, hasDefenseSets, RobotAvatar, trickDefenseSetWeight, trickSetWeight } from '@/features/robots';
import type { Trick } from '@/features/tricks';
import { TrickPicker } from '@/features/tricks';
import {
  createInitialGameState,
  lettersForFormat,
  gameReducer,
  rollAttempt,
} from './engine';
import type { GameAction, GameFormat, GameState, GameVariant, Side } from './engine';
import { getTrickTracking, setTrickTracking, useTrickTracking } from './gamePreferences';
import type { GameSessionSnapshot } from './savedGame';
import { clearSavedGame } from './savedGame';
import { isTrackingGame, progressForLog, setAttemptNeedsTrick } from './trickTracking';
import RobotSetTurn from './RobotSetTurn';
import RpsPanel from './RpsPanel';
import TrackingStatusChip from './TrackingStatusChip';
import TrickAnimation from './TrickAnimation';
import TrickSaveToggle from './TrickSaveToggle';

interface Props {
  robot: Robot;
  pool: Trick[];
  gameFormat: GameFormat;
  gameVariant: GameVariant;
  /** Game state and player evidence carried over across saves or mode switches. */
  resume?: GameSessionSnapshot;
  onExit: () => void;
  /** Report when the current game state can be handed to voice mode. */
  onVoiceState?: (snapshot: GameSessionSnapshot | undefined) => void;
  /** Live game state for the shell's save-on-exit prompt. */
  onGameState?: (snapshot: GameSessionSnapshot) => void;
  onComplete?: (snapshot: GameSessionSnapshot) => void;
  onRestart?: () => void;
  /** Beta: show the want-to-learn star on defended tricks. */
  trickSaveEnabled?: boolean;
}

// ---------- Scoreboard ----------

/** Shared empty set for picker modes where every trick in the pool is pickable. */
const NO_USED = new Set<string>();

function LetterRow({ count, flash, format }: { count: number; flash: boolean; format: GameFormat }) {
  return (
    <div className="letters">
      {lettersForFormat(format).map((ch, i) => (
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

function Scoreboard({ state, robot, trackingEligible }: { state: GameState; robot: Robot; trackingEligible: boolean }) {
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
        <LetterRow count={state.letters.robot} flash={flash === 'robot'} format={state.gameFormat} />
      </div>
      <div className="score-row">
        <span className="score-name">You</span>
        <LetterRow count={state.letters.player} flash={flash === 'player'} format={state.gameFormat} />
      </div>
      <TrackingStatusChip trackingEligible={trackingEligible} />
    </div>
  );
}

// ---------- Main screen ----------

export default function GameScreen({
  robot,
  pool,
  gameFormat,
  gameVariant,
  resume,
  onExit,
  onVoiceState,
  onGameState,
  onComplete,
  onRestart,
  trickSaveEnabled,
}: Props) {
  const [state, dispatch] = useReducer(
    gameReducer,
    resume?.state ?? createInitialGameState(gameFormat, gameVariant),
  );
  // Which question the trick picker is asking: a landed set becomes the trick
  // to copy; a missed set only feeds stats (tracked games have no anonymous pass).
  const [pickerMode, setPickerMode] = useState<'landed' | 'missed' | null>(null);
  const tracking = useTrickTracking();
  const bag = useMemo(() => buildBag(robot, pool), [robot, pool]);
  // A resumed finished game was already recorded by the other mode.
  const recorded = useRef(resume?.state.phase === 'over');
  const trickIdsLanded = useRef<string[]>([...(resume?.progress.trickIdsLanded ?? [])]);
  const trickAttempts = useRef<TrickAttempt[]>([...(resume?.progress.trickAttempts ?? [])]);
  const trackingEligible = useRef(resume?.progress.trackingEligible ?? true);
  const [eligible, setEligible] = useState(resume?.progress.trackingEligible ?? true);
  const dispatchGame = useCallback((action: GameAction) => {
    if (action.type === 'REMATCH') {
      trackingEligible.current = true;
      setEligible(true);
    } else if (state.phase !== 'over' && !getTrickTracking()) {
      trackingEligible.current = false;
      setEligible(false);
    }
    dispatch(action);
  }, [state.phase]);
  // Tracking state captured as the game ends ("adjust state during render",
  // same pattern as Scoreboard): the over-screen receipt must describe the
  // game just played even if the player flips the chip on the over screen.
  const [trackedAtRecord, setTrackedAtRecord] = useState<boolean | null>(null);
  if (state.phase === 'over' && state.winner && trackedAtRecord === null) {
    setTrackedAtRecord(isTrackingGame(eligible));
  }
  if (state.phase === 'rps' && trackedAtRecord !== null) {
    setTrackedAtRecord(null);
  }

  const say = (template: string) => template.replaceAll('{R}', robot.name);

  // Defense mode uses the robot's dedicated defense set table when it has one
  // (the defense roster does); everything else sets from its classic table.
  const setWeightFn =
    state.gameVariant === 'defense' && hasDefenseSets(robot) ? trickDefenseSetWeight : trickSetWeight;

  // Persist W/L once per game; trick evidence only when tracking is on.
  useEffect(() => {
    if (state.phase === 'over' && state.winner && !recorded.current) {
      recorded.current = true;
      clearSavedGame();
      const won = state.winner === 'player';
      const evidence = progressForLog({
        trickIdsLanded: trickIdsLanded.current,
        trickAttempts: trickAttempts.current,
        trackingEligible: trackingEligible.current,
      });
      recordCompletedMatch({
        date: new Date().toISOString(),
        robotId: robot.id,
        mode: 'screen',
        won,
        playerLetters: state.letters.player,
        robotLetters: state.letters.robot,
        trickIdsLanded: evidence.trickIdsLanded,
        trickAttempts: evidence.trickAttempts,
      });
      onComplete?.({
        state,
        progress: {
          trickIdsLanded: [...trickIdsLanded.current],
          trickAttempts: [...trickAttempts.current],
          trackingEligible: trackingEligible.current,
        },
      });
    }
    if (state.phase === 'rps') {
      if (recorded.current) onRestart?.();
      recorded.current = false;
      trickIdsLanded.current = [];
      trickAttempts.current = [];
      trackingEligible.current = true;
    }
  }, [state, robot.id, onComplete, onRestart]);

  // Tell the shell when voice mode can take over (only on player turns).
  const canHandToVoice =
    state.gameVariant === 'classic' &&
    onVoiceState != null &&
    (state.phase === 'rps' || state.phase === 'playerSet' || state.phase === 'playerCopy');
  useEffect(() => {
    onVoiceState?.(
      canHandToVoice
        ? {
            state,
            progress: {
              trickIdsLanded: [...trickIdsLanded.current],
              trickAttempts: [...trickAttempts.current],
              trackingEligible: trackingEligible.current,
            },
          }
        : undefined,
    );
  }, [canHandToVoice, state, onVoiceState]);

  useEffect(() => {
    onGameState?.({
      state,
      progress: {
        trickIdsLanded: [...trickIdsLanded.current],
        trickAttempts: [...trickAttempts.current],
        trackingEligible: trackingEligible.current,
      },
    });
  }, [state, onGameState]);

  const usedIds = useMemo(() => new Set(state.used), [state.used]);

  const robotPose =
    state.stage === 'missed' || state.stage === 'cant' ? 'bailed' : state.stage === 'landed' ? 'stoked' : 'idle';
  const robotAnim = state.stage === 'attempting' || state.stage === 'retry' || state.stage === 'thinking' ? 'anim-wobble' : '';

  return (
    <div
      className={`container game ${state.gameVariant === 'defense' ? 'defense-game' : ''}${state.phase === 'rps' ? ' game-rps' : ''}`}
    >
      {state.gameVariant === 'defense' && (
        <div className="defense-mode-banner" role="status" aria-label="Defense only mode">
          <span className="defense-mode-mark" aria-hidden="true">
            D
          </span>
          <span className="defense-mode-copy">
            <strong>Defense only</strong>
            <small>{robot.name} sets every trick · You match</small>
          </span>
        </div>
      )}

      {state.phase !== 'rps' && <Scoreboard state={state} robot={robot} trackingEligible={eligible} />}

      {state.phase === 'rps' && (
        <RpsPanel robot={robot} gameFormat={state.gameFormat} onDone={(playerFirst) => dispatchGame({ type: 'START', playerFirst })} />
      )}

      {state.phase === 'playerSet' && (
        <div className="panel center">
          {state.note && <p className="note">{say(state.note)}</p>}
          <h2 className="panel-title">Your turn to set</h2>
          <p className="muted">Go skate! Then come back and tell me how it went.</p>
          <button className="btn-primary" onClick={() => setPickerMode('landed')}>
            I landed a trick
          </button>
          <button
            className="btn-ghost"
            onClick={() =>
              // Tracked games have no anonymous pass — the miss names its trick.
              setAttemptNeedsTrick(false, tracking) ? setPickerMode('missed') : dispatchGame({ type: 'PLAYER_SET_MISSED' })
            }
          >
            Couldn't land one — pass
          </button>
        </div>
      )}

      {(state.phase === 'robotCopy' || state.phase === 'robotSet') && (
        <div className="panel center attempt-panel">
          {state.phase === 'robotSet' && state.stage !== 'cant' ? (
            <RobotSetTurn
              robot={robot}
              bag={bag}
              used={state.used}
              resumed={state.stage === 'thinking' ? null : state.current}
              setWeight={setWeightFn}
              alwaysLand={state.gameVariant === 'defense'}
              onChoice={(trick) => dispatchGame({ type: 'ROBOT_SET_CHOICE', trick })}
              onResult={({ landed }) => dispatchGame({ type: 'ROBOT_SET_RESULT', landed })}
            />
          ) : state.phase === 'robotCopy' && state.current ? (
            <RobotAttempt
              // Remount per attempt: a retry decrements attemptsLeft, which
              // re-rolls and replays the animation.
              key={`${state.current.id}-${state.attemptsLeft}`}
              robot={robot}
              trick={state.current}
              bag={bag}
              onResult={({ landed, knewIt }) => dispatchGame({ type: 'ROBOT_COPY_RESULT', landed, knewIt })}
            />
          ) : (
            <div className={robotAnim}>
              <RobotAvatar robot={robot} size={140} pose={robotPose} />
            </div>
          )}
          <RobotStatus state={state} say={say} />
          {(state.stage === 'landed' || state.stage === 'missed' || state.stage === 'cant') && (
            <button className="btn-primary" onClick={() => dispatchGame({ type: 'CONTINUE' })}>
              {continueLabel(state)}
            </button>
          )}
        </div>
      )}

      {state.phase === 'playerCopy' && state.current && (
        <div className={`panel center ${state.gameVariant === 'defense' ? 'defense-copy-panel' : ''}`}>
          {state.note && <p className="note">{say(state.note)}</p>}
          <p className="muted">{robot.name} set:</p>
          <h2 className="trick-callout">{state.current.name}</h2>
          <p className="muted">
            {state.gameVariant === 'defense'
              ? `Land it and ${robot.name} gets a letter. Miss it and you do.`
              : 'Land it or take a letter.'}
          </p>
          <button
            className="btn-primary"
            onClick={() => {
              // A landed copy is a proven land in every mode (matches voice).
              trickIdsLanded.current.push(state.current!.id);
              trickAttempts.current.push({ trickId: state.current!.id, landed: true });
              dispatchGame({ type: 'PLAYER_COPY_LANDED' });
            }}
          >
            Landed it 🤘
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              trickAttempts.current.push({ trickId: state.current!.id, landed: false });
              dispatchGame({ type: 'PLAYER_COPY_MISSED' });
            }}
          >
            Missed it
          </button>
          {trickSaveEnabled && <TrickSaveToggle trick={state.current} />}
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
              ? `${robot.name} spelled ${lettersForFormat(state.gameFormat).join('.')} — rust in pieces.`
              : 'Run it back? Every robot has off days.'}
          </p>
          {trackedAtRecord !== null && (
            <p className={`game-receipt ${trackedAtRecord ? 'game-receipt-on' : ''}`}>
              {trackedAtRecord
                ? '✓ This game counted toward your trick stats.'
                : 'Trick tracking was off — only the result counted.'}
            </p>
          )}
          <button className="btn-primary" onClick={() => dispatchGame({ type: 'REMATCH' })}>
            Rematch
          </button>
          <button className="btn-ghost" onClick={onExit}>
            Back to robots
          </button>
        </div>
      )}

      {pickerMode && (
        <TrickPicker
          title={pickerMode === 'landed' ? 'What did you land?' : 'What were you trying?'}
          pool={pool}
          // A missed set never entered play, so already-set tricks stay pickable —
          // bailing on one is still a real attempt (matches voice-mode resolution).
          usedIds={pickerMode === 'landed' ? usedIds : NO_USED}
          onClose={() => setPickerMode(null)}
          onPick={(trick) => {
            setPickerMode(null);
            if (pickerMode === 'landed') {
              trickIdsLanded.current.push(trick.id);
              trickAttempts.current.push({ trickId: trick.id, landed: true });
              dispatchGame({ type: 'PLAYER_SET_LANDED', trick });
            } else {
              trickAttempts.current.push({ trickId: trick.id, landed: false });
              dispatchGame({ type: 'PLAYER_SET_MISSED' });
            }
          }}
          footer={
            pickerMode === 'missed' ? (
              <p className="picker-note">
                Trick tracking is on — this miss counts toward your consistency stats.
                <button
                  type="button"
                  className="picker-note-action"
                  onClick={() => {
                    setTrickTracking(false);
                    setPickerMode(null);
                    dispatchGame({ type: 'PLAYER_SET_MISSED' });
                  }}
                >
                  Turn off tracking and just pass
                </button>
              </p>
            ) : undefined
          }
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
    else if (state.stage === 'landed')
      text = state.gameVariant === 'defense' ? `{R} set the ${trick}` : `{R} set: ${trick}`;
    else if (state.stage === 'missed') text = `{R} didn't land it`;
    else if (state.stage === 'cant') text = `{R} is out of tricks to set!`;
  }
  const busy = state.stage === 'thinking' || state.stage === 'attempting' || state.stage === 'retry';
  // A set turn's note stays up through the attempt, so the text under the
  // stage only changes height at the result, where the button appears anyway.
  const noted = state.stage === 'thinking' || (state.phase === 'robotSet' && state.stage === 'attempting');
  return (
    <>
      {state.note && noted && <p className="note">{say(state.note)}</p>}
      <h2 className={`panel-title ${busy ? 'pulse' : ''}`}>{say(text)}</h2>
    </>
  );
}

function continueLabel(state: GameState): string {
  if (state.winner) return 'See result';
  if (state.phase === 'robotCopy') return state.stage === 'landed' ? 'Set another trick' : 'Your set continues';
  if (state.stage === 'landed') return 'Go try it';
  if (state.gameVariant === 'defense') return 'See result';
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
