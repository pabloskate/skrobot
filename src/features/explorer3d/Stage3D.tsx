'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { TbPlayerPauseFilled, TbPlayerPlayFilled, TbRefresh, TbRepeat, TbRepeatOff, TbZoomReset } from 'react-icons/tb';
import { TrickScene, sceneSetFor, type RiderStance, type Robot, type SceneCamera, type Skater, type StageSet, type Trick } from '@skrobot/animations';
import { TrickScene3D } from '@skrobot/animations/three';
import { CameraDial, ZOOM_STEP, phaseAt, turnCamera, usePlayhead, zoomBy, type Timeline } from '@/features/explorer';

const SPEEDS = [
  { rate: 1, label: '1×' },
  { rate: 0.5, label: '½×' },
  { rate: 0.25, label: '¼×' },
] as const;

/** Pointer travel (CSS px) before a press counts as a drag rather than a tap. */
const DRAG_SLOP = 5;
/** Degrees the camera swings per CSS px dragged: drag right and the scene turns right. */
const DRAG_YAW = 0.35;
const DRAG_PITCH = 0.25;
/** Zoom per pixel of ctrl-scroll (a trackpad pinch arrives as one), as an exponent. */
const WHEEL_ZOOM = 0.01;
const KEY_TURN: Record<string, [number, number]> = {
  ArrowLeft: [6, 0],
  ArrowRight: [-6, 0],
  ArrowUp: [0, 6],
  ArrowDown: [0, -6],
};

/** What the stage shows: the 3D renderer alone, or beside the SVG one at the same moment. */
export type StageView = '3d' | 'compare';

interface Props {
  robot: Robot;
  trick: Trick;
  rider: RiderStance;
  timeline: Timeline;
  camera: SceneCamera;
  zoom: number;
  set: StageSet;
  /** Who rides on the 3D stage; the SVG comparison only has the robot. */
  skater: Skater;
  view: StageView;
  cameraLabel: string;
  customCamera: boolean;
  rate: number;
  loop: boolean;
  onCamera: (camera: SceneCamera) => void;
  onResetCamera: () => void;
  onZoom: (zoom: number) => void;
  onRate: (rate: number) => void;
  onLoop: (loop: boolean) => void;
}

const ignoreDone = () => {};
const noSubscription = () => () => {};
/** WebGL and the scene's trig only exist in the browser. */
const useInBrowser = () => useSyncExternalStore(noSubscription, () => true, () => false);

/**
 * The 3D explorer's stage: the trick on the explorer's own clock, drawn by
 * TrickScene3D, with the same drag-to-orbit, pinch-to-zoom, keyboard, and
 * transport as the Trick Explorer's stage. In compare mode the SVG scene
 * plays beside it from the same camera at the same moment. Key it by trick
 * so a new trick starts from the top.
 */
export default function Stage3D({
  robot, trick, rider, timeline, camera, zoom, set, skater, view, cameraLabel, customCamera, rate, loop,
  onCamera, onResetCamera, onZoom, onRate, onLoop,
}: Props) {
  const { duration, phases } = timeline;
  const playhead = usePlayhead(duration, rate, loop);
  const phase = phaseAt(phases, playhead.time);
  const drag = useRef<{ id: number; x: number; y: number; from: SceneCamera; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const latest = useRef({ zoom, onZoom });
  const [orbited, setOrbited] = useState(false);
  const inBrowser = useInBrowser();

  useEffect(() => {
    latest.current = { zoom, onZoom };
  });

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      latest.current.onZoom(zoomBy(latest.current.zoom, Math.exp(-event.deltaY * WHEEL_ZOOM)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const pinchDistance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone; the drag still works while it's over the stage.
    }
    if (pointers.current.size === 2) {
      drag.current = null;
      pinch.current = { distance: pinchDistance() || 1, zoom };
      return;
    }
    if (pointers.current.size > 2 || drag.current) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, from: camera, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointers.current.get(event.pointerId);
    if (point) {
      point.x = event.clientX;
      point.y = event.clientY;
    }
    if (pinch.current && pointers.current.size >= 2) {
      onZoom(zoomBy(pinch.current.zoom, pinchDistance() / pinch.current.distance));
      return;
    }
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    d.moved = true;
    setOrbited(true);
    onCamera(turnCamera(d.from, dx * DRAG_YAW, dy * DRAG_PITCH));
  };
  const releasePointer = (id: number) => {
    pointers.current.delete(id);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    releasePointer(event.pointerId);
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (!d.moved) playhead.toggle();
  };
  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    releasePointer(event.pointerId);
    drag.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      playhead.toggle();
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      onZoom(zoomBy(zoom, ZOOM_STEP));
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      onZoom(zoomBy(zoom, 1 / ZOOM_STEP));
    } else if (event.key === '0') {
      event.preventDefault();
      onZoom(1);
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
  const sceneProps = {
    robot,
    trick,
    landed: true,
    knewIt: true,
    riderStance: rider,
    fixedTime: playhead.time,
    playbackRate: playhead.playing ? rate : 0.05,
    camera,
    zoom,
    onDone: ignoreDone,
  };

  return (
    <section className="explorer-stage-card" aria-label="Trick stage">
      <div className="explorer-stage-bar">
        <h2 className="explorer-stage-title">{trick.name}</h2>
        <div className="explorer-stage-camera">
          <span className="explorer-cam-badge">
            <CameraDial camera={camera} />
            {cameraLabel}
          </span>
          {zoom !== 1 && (
            <button type="button" className="explorer-zoom-badge" onClick={() => onZoom(1)} aria-label={`Zoom ${zoom.toFixed(1)}×; reset to 1×`}>
              <TbZoomReset aria-hidden />
              {zoom.toFixed(1)}×
            </button>
          )}
          {customCamera && (
            <button type="button" className="explorer-cam-reset" onClick={onResetCamera} aria-label="Reset camera angle">
              <TbRefresh aria-hidden />
            </button>
          )}
        </div>
      </div>
      <div
        className="explorer-stage"
        role="application"
        aria-roledescription="trick viewer"
        aria-label={`${trick.name}. Drag or use the arrow keys to move the camera; pinch, or press plus and minus, to zoom; tap or press space to ${playhead.playing ? 'pause' : 'play'}.`}
        ref={stage}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
      >
        <div className={`explorer-scene explorer3d-scenes ${view === 'compare' ? 'explorer3d-scenes--compare' : ''}`} inert>
          {inBrowser ? (
            <>
              {view === 'compare' && (
                <figure className="explorer3d-pane">
                  <TrickScene {...sceneProps} set={sceneSetFor(set)} showSpeedToggle={false} />
                  <figcaption>SVG</figcaption>
                </figure>
              )}
              <figure className="explorer3d-pane">
                <TrickScene3D {...sceneProps} set={set} skater={skater} />
                {view === 'compare' && <figcaption>3D</figcaption>}
              </figure>
            </>
          ) : (
            <div className="explorer-scene-placeholder" />
          )}
        </div>
        {!orbited && <span className="explorer-orbit-hint" aria-hidden>Drag to look around · pinch to zoom</span>}
      </div>

      <div className="explorer-transport">
        <button type="button" className="explorer-play" onClick={playhead.toggle} aria-label={playhead.playing ? 'Pause' : 'Play'}>
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
        <button type="button" className={`explorer-loop ${loop ? 'active' : ''}`} onClick={() => onLoop(!loop)} aria-pressed={loop} aria-label="Loop">
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
