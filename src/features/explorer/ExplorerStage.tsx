'use client';

import type { CSSProperties } from 'react';
import { TbPlayerPauseFilled, TbPlayerPlayFilled, TbRefresh, TbRepeat, TbRepeatOff, TbVolume, TbVolumeOff, TbZoomReset } from 'react-icons/tb';
import { setSoundEffects, useSoundEffects, type SceneCamera } from '@skrobot/animations';
import { phaseAt, type Timeline } from './explorer';
import { usePlayhead } from './usePlayhead';
import CameraDial from './CameraDial';
import StageViewport, { type StageScene } from './StageViewport';

const SPEEDS = [
  { rate: 1, label: '1×' },
  { rate: 0.5, label: '½×' },
  { rate: 0.25, label: '¼×' },
] as const;

interface Props extends StageScene {
  timeline: Timeline;
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

/**
 * The stage: the trick playing on the explorer's own clock, a camera the
 * viewer can drag around the rider, and the transport underneath. Key it by
 * trick so a new trick starts from the top.
 */
export default function ExplorerStage({
  timeline, cameraLabel, customCamera, rate, loop, onCamera, onResetCamera, onZoom, onRate, onLoop, ...scene
}: Props) {
  const { duration, phases } = timeline;
  const { trick, camera, zoom } = scene;
  const playhead = usePlayhead(duration, rate, loop);
  const sound = useSoundEffects();
  const phase = phaseAt(phases, playhead.time);

  const speedIndex = SPEEDS.findIndex((s) => s.rate === rate);
  const nextSpeed = SPEEDS[(speedIndex + 1) % SPEEDS.length];
  const progress = duration > 0 ? playhead.time / duration : 0;

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
            <button
              type="button"
              className="explorer-zoom-badge"
              onClick={() => onZoom(1)}
              aria-label={`Zoom ${zoom.toFixed(1)}×; reset to 1×`}
            >
              <TbZoomReset aria-hidden />
              {zoom.toFixed(1)}×
            </button>
          )}
          {customCamera && (
            <button
              type="button"
              className="explorer-cam-reset"
              onClick={onResetCamera}
              aria-label="Reset camera angle"
            >
              <TbRefresh aria-hidden />
            </button>
          )}
        </div>
      </div>
      <StageViewport
        scene={scene}
        playhead={playhead}
        rate={rate}
        onCamera={onCamera}
        onZoom={onZoom}
        hint="Drag to look around 360° · pinch to zoom"
      />

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
          className={`explorer-loop ${sound ? 'active' : ''}`}
          onClick={() => setSoundEffects(!sound)}
          aria-pressed={sound}
          aria-label="Sound effects"
          title={sound ? 'Turn sound effects off' : 'Turn sound effects on'}
        >
          {sound ? <TbVolume aria-hidden /> : <TbVolumeOff aria-hidden />}
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
