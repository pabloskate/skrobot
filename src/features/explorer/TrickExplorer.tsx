'use client';

import { useEffect, useState } from 'react';
import { TbArrowLeft, TbCheck, TbShare } from 'react-icons/tb';
import { SCENE_CAMERA_BOUNDS } from '@skrobot/animations';
import { ROBOT_BY_ID, ROBOTS } from '@/features/robots';
import {
  CAMERA_PRESETS,
  cameraLabel,
  cameraPreset,
  sceneCamera,
  searchFromState,
  stageTrick,
  stateFromSearch,
  timelineFor,
  trickSteps,
  type ExplorerState,
} from './explorer';
import CameraDial from './CameraDial';
import ExplorerStage from './ExplorerStage';
import TrickBuilder from './TrickBuilder';

/** The explorer's one rider: Swivel, skating in its own style. */
const RIDER = ROBOT_BY_ID.get('shifty') ?? ROBOTS[0];
/** Wait for the camera to settle before writing it into the address bar. */
const URL_SYNC_MS = 250;

/**
 * Trick Explorer: a place to watch any flatground trick or grind combo the
 * robot can skate, slowed down, scrubbed, and filmed from any angle. The
 * URL always describes what's on the stage, so a combo can be shared.
 */
export default function TrickExplorer({ initialSearch = '' }: { initialSearch?: string }) {
  const [state, setState] = useState<ExplorerState>(() => stateFromSearch(initialSearch));
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(true);
  const [shared, setShared] = useState(false);

  const trick = stageTrick(state);
  const camera = sceneCamera(state);
  const timeline = timelineFor(state, RIDER.skateStyle);
  const steps = trickSteps(state);
  const preset = typeof state.camera === 'string' ? cameraPreset(state.camera) : null;
  const search = searchFromState(state);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.location.search !== search) window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`);
    }, URL_SYNC_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!shared) return;
    const timer = window.setTimeout(() => setShared(false), 1800);
    return () => window.clearTimeout(timer);
  }, [shared]);

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}${search}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${trick.name} · Trick Explorer`, url });
      } catch {
        // Dismissing the share sheet is not an error worth surfacing.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  return (
    <div className="explorer">
      <header className="explorer-header">
        <a className="explorer-back" href="/" aria-label="Back to Skate Robot">
          <TbArrowLeft aria-hidden />
        </a>
        <div className="explorer-brand">
          <span className="explorer-eyebrow">Skate Robot</span>
          <h1>Trick Explorer</h1>
        </div>
        <button type="button" className="explorer-share" onClick={share}>
          {shared ? <TbCheck aria-hidden /> : <TbShare aria-hidden />}
          <span>{shared ? 'Link copied' : 'Share'}</span>
        </button>
      </header>

      <div className="explorer-layout">
        <div className="explorer-stage-col">
          <ExplorerStage
            key={`${trick.id}:${state.rider}`}
            robot={RIDER}
            trick={trick}
            rider={state.rider}
            timeline={timeline}
            camera={camera}
            cameraLabel={cameraLabel(state)}
            customCamera={preset == null}
            rate={rate}
            loop={loop}
            onCamera={(next) => setState({ ...state, camera: next })}
            onResetCamera={() => setState({ ...state, camera: 'classic' })}
            onRate={setRate}
            onLoop={setLoop}
          />
        </div>

        <div className="explorer-panel-col">
          <section className="explorer-card" aria-labelledby="explorer-camera-title">
            <div className="explorer-card-head">
              <h2 id="explorer-camera-title">Camera</h2>
              <span className="explorer-card-hint">{preset ? preset.hint : 'Drag the stage to fine-tune'}</span>
            </div>
            <div className="explorer-cams" role="radiogroup" aria-label="Camera angle">
              {CAMERA_PRESETS.map((option) => {
                const active = preset?.id === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`explorer-cam ${active ? 'active' : ''}`}
                    onClick={() => setState({ ...state, camera: option.id })}
                  >
                    <CameraDial camera={sceneCamera({ ...state, camera: option.id })} size={30} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
            <label className="explorer-lens">
              <span className="explorer-field-label">Lens</span>
              <span className="explorer-lens-end">Fisheye</span>
              <input
                type="range"
                min={SCENE_CAMERA_BOUNDS.lens.min}
                max={SCENE_CAMERA_BOUNDS.lens.max}
                step={0.01}
                value={camera.lens}
                onChange={(event) => setState({ ...state, camera: { ...camera, lens: Number(event.target.value) } })}
                aria-label="Lens, from fisheye to long lens"
              />
              <span className="explorer-lens-end">Long</span>
            </label>
          </section>

          <TrickBuilder state={state} onChange={setState} />

          {steps.length > 0 && (
            <section className="explorer-card explorer-steps" aria-labelledby="explorer-steps-title">
              <div className="explorer-card-head">
                <h2 id="explorer-steps-title">How it goes</h2>
              </div>
              {state.mode === 'flatground' ? (
                <p className="explorer-step-text">{steps[0].detail}</p>
              ) : (
                <ol className="explorer-step-list">
                  {steps.map((step) => (
                    <li key={step.label}>
                      <strong>{step.label}</strong>
                      <span>{step.detail}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
