'use client';

import { useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { TbPlayerPauseFilled, TbPlayerPlayFilled, TbRefresh, TbRepeat, TbRepeatOff } from 'react-icons/tb';
import { TrickScene, type RiderStance, type Robot, type SceneCamera, type Trick } from '@skrobot/animations';
import { phaseAt, turnCamera, type Timeline } from './explorer';
import { usePlayhead } from './usePlayhead';
import CameraDial from './CameraDial';

const SPEEDS = [
  { rate: 1, label: '1×' },
  { rate: 0.5, label: '½×' },
  { rate: 0.25, label: '¼×' },
] as const;

/** Pointer travel (CSS px) before a press counts as a drag rather than a tap. */
const DRAG_SLOP = 5;
/**
 * Degrees the camera swings per CSS px dragged. Dragging grabs the scene:
 * drag right and it turns right, drag down and it tips its top toward you.
 */
const DRAG_YAW = 0.35;
const DRAG_PITCH = 0.25;
/** Arrow keys move the camera itself, this many degrees a press. */
const KEY_TURN: Record<string, [number, number]> = {
  ArrowLeft: [6, 0],
  ArrowRight: [-6, 0],
  ArrowUp: [0, 6],
  ArrowDown: [0, -6],
};

interface Props {
  robot: Robot;
  trick: Pick<Trick, 'id' | 'name' | 'base' | 'stance'>;
  rider: RiderStance;
  timeline: Timeline;
  camera: SceneCamera;
  cameraLabel: string;
  customCamera: boolean;
  rate: number;
  loop: boolean;
  onCamera: (camera: SceneCamera) => void;
  onResetCamera: () => void;
  onRate: (rate: number) => void;
  onLoop: (loop: boolean) => void;
}

const ignoreDone = () => {};
const noSubscription = () => () => {};

/**
 * The scene only renders in the browser: its geometry is floating-point
 * trig, which Node and the browser can round differently in the last digit,
 * and a hydration mismatch there isn't patched up.
 */
const useInBrowser = () => useSyncExternalStore(noSubscription, () => true, () => false);

/**
 * The stage: the trick playing on the explorer's own clock, a camera the
 * viewer can drag around the rider, and the transport underneath. Key it by
 * trick so a new trick starts from the top.
 */
export default function ExplorerStage({
  robot, trick, rider, timeline, camera, cameraLabel, customCamera, rate, loop,
  onCamera, onResetCamera, onRate, onLoop,
}: Props) {
  const { duration, phases } = timeline;
  const playhead = usePlayhead(duration, rate, loop);
  const phase = phaseAt(phases, playhead.time);
  const drag = useRef<{ id: number; x: number; y: number; from: SceneCamera; moved: boolean } | null>(null);
  const [orbited, setOrbited] = useState(false);
  const inBrowser = useInBrowser();

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || drag.current) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, from: camera, moved: false };
    try {
      // Keep the drag when the pointer leaves the stage.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone; the drag still works while it's over the stage.
    }
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    d.moved = true;
    setOrbited(true);
    onCamera(turnCamera(d.from, dx * DRAG_YAW, dy * DRAG_PITCH));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (!d.moved) playhead.toggle();
  };
  const onPointerCancel = () => {
    drag.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Child controls keep their own keyboard activation and focus behavior.
    if (event.target !== event.currentTarget) return;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      playhead.toggle();
    } else if (KEY_TURN[event.key]) {
      event.preventDefault();
      const [yaw, pitch] = KEY_TURN[event.key];
      setOrbited(true);
      onCamera(turnCamera(camera, yaw, pitch));
    }
  };

  const speedIndex = SPEEDS.findIndex((s) => s.rate === rate);
  const nextSpeed = SPEEDS[(speedIndex + 1) % SPEEDS.length];
  const progress = duration > 0 ? playhead.time / duration : 0;

  return (
    <section className="explorer-stage-card" aria-label="Trick stage">
      <div
        className="explorer-stage"
        role="application"
        aria-roledescription="trick viewer"
        aria-label={`${trick.name}. Drag or use the arrow keys to move the camera; tap or press space to ${playhead.playing ? 'pause' : 'play'}.`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
      >
        <div className="explorer-scene" inert>
          {inBrowser ? (
            <TrickScene
              robot={robot}
              trick={trick}
              landed
              knewIt
              riderStance={rider}
              fixedTime={playhead.time}
              playbackRate={playhead.playing ? rate : 0.05}
              showSpeedToggle={false}
              camera={camera}
              onDone={ignoreDone}
            />
          ) : (
            <div className="explorer-scene-placeholder" />
          )}
        </div>
        <div className="explorer-hud">
          <h2 className="explorer-hud-title">{trick.name}</h2>
          <div className="explorer-hud-camera">
            <span className="explorer-cam-badge">
              <CameraDial camera={camera} />
              {cameraLabel}
            </span>
            {customCamera && (
              <button
                type="button"
                className="explorer-cam-reset"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onClick={onResetCamera}
                aria-label="Reset camera angle"
              >
                <TbRefresh aria-hidden />
              </button>
            )}
          </div>
        </div>
        {!orbited && <span className="explorer-orbit-hint" aria-hidden>Drag to look around</span>}
      </div>

      <div className="explorer-transport">
        <button
          type="button"
          className="explorer-play"
          onClick={playhead.toggle}
          aria-label={playhead.playing ? 'Pause' : 'Play'}
        >
          {playhead.playing ? <TbPlayerPauseFilled aria-hidden /> : <TbPlayerPlayFilled aria-hidden />}
        </button>
        <div className="explorer-scrub">
          <div className="explorer-scrub-label">
            <strong>{phase.label}</strong>
            <span>{playhead.time.toFixed(2)}s</span>
          </div>
          <div className="explorer-scrub-track" style={{ '--progress': progress } as CSSProperties}>
            {phases.slice(1).map((p) => (
              <span key={p.label} className="explorer-scrub-tick" style={{ left: `${(p.time / duration) * 100}%` }} aria-hidden />
            ))}
            <input
              type="range"
              min={0}
              max={duration}
              step={0.005}
              value={playhead.time}
              onChange={(event) => playhead.seek(Number(event.target.value))}
              aria-label="Scrub through the trick"
              aria-valuetext={`${phase.label}, ${playhead.time.toFixed(2)} seconds`}
            />
          </div>
        </div>
        <button
          type="button"
          className="explorer-speed"
          onClick={() => onRate(nextSpeed.rate)}
          aria-label={`Speed ${SPEEDS[Math.max(0, speedIndex)].label}; switch to ${nextSpeed.label}`}
        >
          {SPEEDS[Math.max(0, speedIndex)].label}
        </button>
        <button
          type="button"
          className={`explorer-loop ${loop ? 'active' : ''}`}
          onClick={() => onLoop(!loop)}
          aria-pressed={loop}
          aria-label="Loop"
        >
          {loop ? <TbRepeat aria-hidden /> : <TbRepeatOff aria-hidden />}
        </button>
      </div>

      <div className="explorer-phases" role="group" aria-label="Jump to a moment">
        {phases.map((p) => (
          <button
            key={p.label}
            type="button"
            className={`explorer-phase ${p === phase ? 'current' : ''}`}
            aria-current={p === phase ? 'step' : undefined}
            onClick={() => playhead.seek(p.time)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}
