'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useSoundEffects } from '@skrobot/animations';
import type { Obstacle, RailChoice, RiderStance, Robot, SceneCamera, Skater, StageSet, Trick, TripodId } from '@skrobot/animations';
import { TrickScene3D } from '@skrobot/animations/three';
import { ZOOM_STEP, turnCamera, zoomBy } from './explorer';
import type { Playhead } from './usePlayhead';

/** Pointer travel (CSS px) before a press counts as a drag rather than a tap. */
const DRAG_SLOP = 5;
/**
 * Degrees the camera swings per CSS px dragged. Dragging grabs the scene:
 * drag right and it turns right, drag down and it tips its top toward you.
 */
const DRAG_YAW = 0.35;
const DRAG_PITCH = 0.25;
/** Zoom per pixel of ctrl-scroll (a trackpad pinch arrives as one), as an exponent. */
const WHEEL_ZOOM = 0.01;
/** Arrow keys move the camera itself, this many degrees a press. */
const KEY_TURN: Record<string, [number, number]> = {
  ArrowLeft: [6, 0],
  ArrowRight: [-6, 0],
  ArrowUp: [0, 6],
  ArrowDown: [0, -6],
};

export interface StageScene {
  robot: Robot;
  trick: Pick<Trick, 'id' | 'name' | 'base' | 'stance'>;
  rider: RiderStance;
  camera: SceneCamera;
  /** Film from this tripod instead of the crane (a landmark's). */
  tripod: TripodId | null;
  /** Magnification of the picture, 1 stock. */
  zoom: number;
  set: StageSet;
  /** At a spot with several handrails, which one a grind rides. */
  rail: RailChoice;
  /** At a spot with several ways down, what a flatground trick goes over. */
  obstacle: Obstacle;
  /** Who skates: the robot, the realistic human, or the alien. */
  skater: Skater;
}

interface Props {
  scene: StageScene;
  playhead: Playhead;
  rate: number;
  onCamera: (camera: SceneCamera) => void;
  onZoom: (zoom: number) => void;
  /** Shown over the picture until the viewer first moves the camera. */
  hint: string;
  /** Controls laid over the picture. */
  children?: ReactNode;
}

const ignoreDone = () => {};
const noSubscription = () => () => {};

/** WebGL and the scene's geometry render only in the browser. */
const useInBrowser = () => useSyncExternalStore(noSubscription, () => true, () => false);

/**
 * The picture: the trick at the playhead's moment, a camera the viewer can
 * drag around the rider or pinch to zoom, and a tap to play or pause.
 */
export default function StageViewport({ scene, playhead, rate, onCamera, onZoom, hint, children }: Props) {
  const { camera, zoom } = scene;
  const sound = useSoundEffects();
  const drag = useRef<{ id: number; x: number; y: number; from: SceneCamera; moved: boolean } | null>(null);
  // Every finger or pointer on the stage; two of them are a pinch, not a drag.
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
      // A trackpad pinch arrives as ctrl + wheel. Plain scrolling is left to the page.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      latest.current.onZoom(zoomBy(latest.current.zoom, Math.exp(-event.deltaY * WHEEL_ZOOM)));
    };
    // Not passive: stopping the browser zooming the whole page needs preventDefault.
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
      // Keep the drag when the pointer leaves the stage.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone; the drag still works while it's over the stage.
    }
    if (pointers.current.size === 2) {
      // A second finger turns the drag into a pinch.
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
    // Child controls keep their own keyboard activation and focus behavior.
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

  return (
    <div
      className="explorer-stage"
      role="application"
      aria-roledescription="trick viewer"
      aria-label={`${scene.trick.name}. Drag or use the arrow keys to move the camera; pinch, or press plus and minus, to zoom; tap or press space to ${playhead.playing ? 'pause' : 'play'}.`}
      ref={stage}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      <div className="explorer-scene" inert>
        {inBrowser ? (
          <TrickScene3D
            robot={scene.robot}
            trick={scene.trick}
            landed
            knewIt
            riderStance={scene.rider}
            fixedTime={playhead.time}
            playbackRate={playhead.playing ? rate : 0.05}
            camera={camera}
            tripod={scene.tripod}
            zoom={zoom}
            set={scene.set}
            rail={scene.rail}
            obstacle={scene.obstacle}
            skater={scene.skater}
            sound={sound && playhead.playing}
            onDone={ignoreDone}
          />
        ) : (
          <div className="explorer-scene-placeholder" />
        )}
      </div>
      {!orbited && <span className="explorer-orbit-hint" aria-hidden>{hint}</span>}
      {children && (
        // Controls on the picture are pressed, not dragged or tapped through to the stage.
        <div className="explorer-stage-overlay" onPointerDown={(event) => event.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}
