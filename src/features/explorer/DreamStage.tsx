'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { TbArrowsMaximize, TbArrowsMinimize, TbPlayerPauseFilled, TbPlayerPlayFilled, TbRun, TbVideo, TbVolume, TbVolumeOff } from 'react-icons/tb';
import { setSoundEffects, useSoundEffects, type SceneCamera } from '@skrobot/animations';
import { usePlayhead } from './usePlayhead';
import StageViewport, { type StageScene } from './StageViewport';
import type { CameraMode } from './dream';

/** Real speed first: slow motion is a press away. */
const SPEEDS = [
  { rate: 1, label: '1×', name: 'Real speed' },
  { rate: 0.5, label: '½×', name: 'Slow motion' },
  { rate: 0.25, label: '¼×', name: 'Extra slow' },
] as const;

interface Props extends StageScene {
  /** How long the trick runs (seconds). */
  duration: number;
  rate: number;
  /** Which camera is filming, and what it's called, for the chip on the picture. */
  cameraMode: CameraMode;
  cameraName: string;
  /** Kept at the playhead's moment, for whatever else follows the trick (the camera map). */
  clockRef: RefObject<number>;
  onCamera: (camera: SceneCamera) => void;
  onZoom: (zoom: number) => void;
  /** What a drag across the picture does to the camera. */
  turn: (from: SceneCamera, yaw: number, pitch: number) => SceneCamera;
  onRate: (rate: number) => void;
  onOpenCamera: () => void;
}

/**
 * Full screen for the picture. Where the browser can put an element full
 * screen it does (hiding its own bars); the stage also fills the window by
 * itself, which is all an iPhone allows. Escape leaves either.
 */
function useFullScreen(target: RefObject<HTMLElement | null>) {
  const [full, setFull] = useState(false);

  const exit = useCallback(() => {
    setFull(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);
  const enter = useCallback(() => {
    setFull(true);
    try {
      void target.current?.requestFullscreen?.().catch(() => {});
    } catch {
      // No element full screen here; the stage fills the window instead.
    }
  }, [target]);

  useEffect(() => {
    if (!full) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') exit();
    };
    // Leaving native full screen with the browser's own gesture ends ours too.
    const onChange = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.documentElement.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, [full, exit]);

  return { full, toggle: full ? exit : enter, exit };
}

/**
 * The trick on repeat, with only what someone playing needs on the picture:
 * which camera is filming (a tap opens it), play and pause, slow motion and
 * sound. Key it by trick so a new trick starts from the top.
 */
export default function DreamStage({ duration, rate, cameraMode, cameraName, clockRef, onCamera, onZoom, turn, onRate, onOpenCamera, ...scene }: Props) {
  const playhead = usePlayhead(duration, rate, true);
  const sound = useSoundEffects();
  const speedIndex = Math.max(0, SPEEDS.findIndex((s) => s.rate === rate));
  const speed = SPEEDS[speedIndex];
  const nextSpeed = SPEEDS[(speedIndex + 1) % SPEEDS.length];
  const card = useRef<HTMLElement>(null);
  const screen = useFullScreen(card);

  useEffect(() => {
    clockRef.current = playhead.time;
  });

  return (
    <section className={`dream-stage-card ${screen.full ? 'is-full' : ''}`} aria-label="Trick stage" ref={card}>
      <StageViewport scene={scene} playhead={playhead} rate={rate} onCamera={onCamera} onZoom={onZoom} turn={turn}>
        <button type="button" className="dream-stage-btn dream-camera-chip" onClick={() => { screen.exit(); onOpenCamera(); }} aria-label={`Camera: ${cameraName}. Open the camera.`}>
          {cameraMode === 'tripod' ? <TbVideo aria-hidden /> : <TbRun aria-hidden />}
          {cameraName}
        </button>
        <div className="dream-stage-controls">
          <button
            type="button"
            className="dream-stage-btn dream-play"
            onClick={playhead.toggle}
            aria-label={playhead.playing ? 'Pause' : 'Play'}
          >
            {playhead.playing ? <TbPlayerPauseFilled aria-hidden /> : <TbPlayerPlayFilled aria-hidden />}
          </button>
          <span className="dream-stage-spacer" />
          <button
            type="button"
            className={`dream-stage-btn dream-speed ${rate < 1 ? 'active' : ''}`}
            onClick={() => onRate(nextSpeed.rate)}
            aria-label={`${speed.name}; switch to ${nextSpeed.name.toLowerCase()}`}
          >
            {rate < 1 ? speed.label : 'Slow-mo'}
          </button>
          <button
            type="button"
            className="dream-stage-btn"
            onClick={screen.toggle}
            aria-pressed={screen.full}
            aria-label={screen.full ? 'Leave full screen' : 'Full screen'}
          >
            {screen.full ? <TbArrowsMinimize aria-hidden /> : <TbArrowsMaximize aria-hidden />}
          </button>
          <button
            type="button"
            className={`dream-stage-btn ${sound ? 'active' : ''}`}
            onClick={() => setSoundEffects(!sound)}
            aria-pressed={sound}
            aria-label="Sound effects"
          >
            {sound ? <TbVolume aria-hidden /> : <TbVolumeOff aria-hidden />}
          </button>
        </div>
      </StageViewport>
    </section>
  );
}
