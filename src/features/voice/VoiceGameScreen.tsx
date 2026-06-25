'use client';

import { useEffect, useRef, useState } from 'react';
import { SignInScreen } from '@/features/auth';
import { UpgradeScreen } from '@/features/billing';
import type { GameState } from '@/features/game';
import { LETTERS, TrickAnimation, initialGameState } from '@/features/game';
import type { Robot } from '@/features/robots';
import { RobotAvatar } from '@/features/robots';
import type { Trick } from '@/features/tricks';
import { VoiceStartError, type VoiceStartErrorCode } from './api';
import { VoiceGameController } from './controller';
import { VoiceSession } from './liveSession';

interface Props {
  robot: Robot;
  pool: Trick[];
  /** Game state carried over when the player switches modes mid-game. */
  resume?: GameState;
  onExit: () => void;
  /** Hand the live game state back to the on-screen mode. */
  onScreenMode?: (state: GameState) => void;
}

type Status = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'ended' | 'error';

interface Caption {
  who: 'you' | 'robot';
  text: string;
  final: boolean;
}

/** A robot attempt queued for animation (retries arrive as a second entry). */
interface AttemptAnim {
  id: number;
  trick: Trick;
  landed: boolean;
}

function Letters({ count }: { count: number }) {
  return (
    <div className="letters">
      {LETTERS.map((ch, i) => (
        <span key={ch} className={`letter ${i < count ? 'letter-on' : ''}`}>
          {ch}
        </span>
      ))}
    </div>
  );
}

export default function VoiceGameScreen({ robot, pool, resume, onExit, onScreenMode }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<VoiceStartErrorCode | null>(null);
  const [game, setGame] = useState<GameState>(resume ?? initialGameState);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [muted, setMuted] = useState(false);
  const [pocket, setPocket] = useState(false);
  const [attempts, setAttempts] = useState<AttemptAnim[]>([]);
  const sessionRef = useRef<VoiceSession | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const attemptId = useRef(0);
  const pocketRef = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = async () => {
    setError(null);
    setGate(null);
    // Seed from the current scoreboard state so a carried-over game (or a
    // stopped-and-restarted session) picks up where it left off.
    const controller = new VoiceGameController(robot, pool, game);
    controller.onChange = (s) => {
      setGame({ ...s });
      // A rematch resets to the toss — drop any leftover attempt animations.
      if (s.phase === 'rps') setAttempts([]);
    };
    controller.onRobotAttempt = (trick, landed) => {
      // No visuals while the phone is pocketed — don't let attempts pile up.
      if (pocketRef.current) return;
      attemptId.current += 1;
      setAttempts((prev) => [...prev, { id: attemptId.current, trick, landed }]);
    };
    const session = new VoiceSession(controller, {
      onStatus: setStatus,
      onCaption: (who, text, final) =>
        setCaptions((prev) => {
          // Update this speaker's open caption in place even when the other
          // speaker's partials have landed after it — turnComplete re-emits the
          // full text, and matching only the last entry would duplicate it.
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].who !== who) continue;
            if (prev[i].final) break;
            const next = [...prev];
            next[i] = { who, text, final };
            return next;
          }
          return [...prev.slice(-30), { who, text, final }];
        }),
      onError: setError,
    });
    sessionRef.current = session;
    try {
      await session.start();
    } catch (e) {
      // Failed before going live — back to the start panel with the error shown.
      setStatus('idle');
      if (e instanceof VoiceStartError) {
        setGate(e.code);
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : 'Could not start voice session');
      }
      sessionRef.current = null;
    }
  };

  const stop = async () => {
    await sessionRef.current?.stop();
    sessionRef.current = null;
  };

  useEffect(
    () => () => {
      void sessionRef.current?.stop();
      void wakeLockRef.current?.release();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    },
    [],
  );

  // Pocket mode: keep the screen awake (iOS Safari pauses the mic on lock).
  const togglePocket = async () => {
    if (!pocket) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch {
        /* wake lock unsupported — overlay still helps against pocket touches */
      }
      pocketRef.current = true;
      setAttempts([]);
      setPocket(true);
    } else {
      await wakeLockRef.current?.release();
      wakeLockRef.current = null;
      pocketRef.current = false;
      setPocket(false);
    }
  };

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [captions]);

  if (pocket) {
    return (
      <div className="pocket-overlay" onDoubleClick={togglePocket}>
        <div className="pocket-letters">
          <span>{robot.name}</span>
          <Letters count={game.letters.robot} />
          <span>You</span>
          <Letters count={game.letters.player} />
        </div>
        <p className="pocket-hint">Voice game live — double-tap to wake</p>
      </div>
    );
  }

  if (gate === 'auth_required') {
    return <SignInScreen onDone={() => setGate(null)} onCancel={() => setGate(null)} />;
  }

  if (gate === 'quota_exceeded') {
    return <UpgradeScreen onCancel={() => setGate(null)} />;
  }

  return (
    <div className="container game voice">
      {game.phase !== 'rps' && (
        <div className="scoreboard">
          <div className="score-row">
            <span className="score-name">{robot.name}</span>
            <Letters count={game.letters.robot} />
          </div>
          <div className="score-row">
            <span className="score-name">You</span>
            <Letters count={game.letters.player} />
          </div>
        </div>
      )}

      {status === 'idle' || status === 'ended' ? (
        <div className="panel center">
          <RobotAvatar robot={robot} size={120} pose="idle" />
          <h2 className="panel-title">Voice game vs {robot.name}</h2>
          <p className="muted">
            {game.phase !== 'rps'
              ? 'Pop in your earbuds — your game continues right where you left off.'
              : "Pop in your earbuds. You'll play the whole game by talking — the toss, your tricks, everything."}
          </p>
          {error && <p className="note">{error}</p>}
          <button className="btn-primary" onClick={start}>
            🎙 Start voice session
          </button>
          {onScreenMode && (
            <button className="btn-ghost" onClick={() => onScreenMode(game)}>
              📱 Play on screen instead
            </button>
          )}
          <button className="btn-ghost" onClick={onExit}>
            Back
          </button>
        </div>
      ) : (
        <div className="panel voice-panel">
          <div className="voice-status">
            <span className={`voice-dot voice-dot-${status}`} />
            <span className="muted">
              {status === 'connecting' && 'Connecting…'}
              {status === 'live' && (muted ? 'Mic muted' : 'Listening')}
              {status === 'reconnecting' && 'Reconnecting…'}
              {status === 'error' && (error ?? 'Error')}
            </span>
          </div>
          {attempts.length > 0 && (
            <div className="voice-trick">
              <TrickAnimation
                key={attempts[0].id}
                robot={robot}
                trick={attempts[0].trick}
                landed={attempts[0].landed}
                onDone={() => {
                  // Hold the final frame, then show the next queued attempt
                  // (a retry) or clear the stage.
                  if (dismissTimer.current) clearTimeout(dismissTimer.current);
                  dismissTimer.current = setTimeout(
                    () => setAttempts((prev) => prev.slice(1)),
                    attempts.length > 1 ? 400 : 2000,
                  );
                }}
              />
              <p className="muted voice-trick-label">
                {robot.name} · {attempts[0].trick.name}
              </p>
            </div>
          )}
          <div className="captions" ref={logRef}>
            {captions.map((c, i) => (
              <p key={i} className={`caption caption-${c.who}`}>
                <strong>{c.who === 'you' ? 'You' : robot.name}:</strong> {c.text}
              </p>
            ))}
            {captions.length === 0 && <p className="muted">{robot.name} is starting things off…</p>}
          </div>
          <div className="voice-controls">
            <button
              className="btn-ghost"
              onClick={() => {
                sessionRef.current?.setMuted(!muted);
                setMuted(!muted);
              }}
            >
              {muted ? '🔇 Unmute' : '🎙 Mute'}
            </button>
            <button className="btn-ghost" onClick={togglePocket}>
              🌙 Pocket mode
            </button>
            {onScreenMode && (
              <button
                className="btn-ghost"
                onClick={async () => {
                  await stop();
                  onScreenMode(game);
                }}
              >
                📱 Screen mode
              </button>
            )}
            <button
              className="btn-danger"
              onClick={async () => {
                await stop();
                onExit();
              }}
            >
              End session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
