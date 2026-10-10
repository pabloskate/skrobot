'use client';

import { TbPlayerPauseFilled, TbPlayerPlayFilled, TbRefresh, TbVolume, TbVolumeOff } from 'react-icons/tb';
import { setSoundEffects, useSoundEffects, type SceneCamera } from '@skrobot/animations';
import { usePlayhead } from './usePlayhead';
import StageViewport, { type StageScene } from './StageViewport';

/** Real speed first: slow motion is a press away. */
const SPEEDS = [
  { rate: 1, label: '1×', name: 'Real speed' },
  { rate: 0.5, label: '½×', name: 'Slow motion' },
  { rate: 0.25, label: '¼×', name: 'Extra slow' },
] as const;

interface Props extends StageScene {
  /** How long the trick runs (seconds). */
  duration: number;
  /** Where it's being hit, under the trick's name. */
  caption: string;
  rate: number;
  /** The viewer has moved the camera or zoom off the chosen shot. */
  moved: boolean;
  onCamera: (camera: SceneCamera) => void;
  onZoom: (zoom: number) => void;
  onResetView: () => void;
  onRate: (rate: number) => void;
}

/**
 * The trick on repeat, with only what someone playing needs over it: its
 * name, play and pause, slow motion, sound, and a way back to the shot after
 * dragging the camera. Key it by trick so a new trick starts from the top.
 */
export default function DreamStage({ duration, caption, rate, moved, onCamera, onZoom, onResetView, onRate, ...scene }: Props) {
  const playhead = usePlayhead(duration, rate, true);
  const sound = useSoundEffects();
  const speedIndex = Math.max(0, SPEEDS.findIndex((s) => s.rate === rate));
  const speed = SPEEDS[speedIndex];
  const nextSpeed = SPEEDS[(speedIndex + 1) % SPEEDS.length];

  return (
    <section className="dream-stage-card" aria-label="Trick stage">
      <StageViewport scene={scene} playhead={playhead} rate={rate} onCamera={onCamera} onZoom={onZoom} hint="Drag to look around">
        <div className="dream-stage-title">
          <h2>{scene.trick.name}</h2>
          <span>{caption}</span>
        </div>
        {moved && (
          <button type="button" className="dream-stage-btn dream-reset" onClick={onResetView}>
            <TbRefresh aria-hidden />
            Reset view
          </button>
        )}
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
