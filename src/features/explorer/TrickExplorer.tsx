'use client';

import { useEffect, useState } from 'react';
import { TbArrowLeft, TbCheck, TbShare } from 'react-icons/tb';
import { STAGE_SETS, setInfo, useSoundEffects, type RailChoice } from '@skrobot/animations';
import { ROBOT_BY_ID, ROBOTS } from '@/features/robots';
import {
  cameraLabel,
  cameraPreset,
  cameraPresetsFor,
  railLine,
  sceneCamera,
  sceneTripod,
  searchFromState,
  stageTrick,
  stateFromSearch,
  timelineFor,
  trickSteps,
  withSet,
  zoomAt,
  ZOOM_RANGE,
  type ExplorerState,
} from './explorer';
import CameraDial from './CameraDial';
import ExplorerStage from './ExplorerStage';
import TrickBuilder from './TrickBuilder';
import VideoButton from './VideoButton';

/** Swivel supplies the shared skating style for all three explorer riders. */
const RIDER = ROBOT_BY_ID.get('shifty') ?? ROBOTS[0];
const RAILS: ReadonlyArray<{ id: RailChoice; label: string }> = [
  { id: 'center', label: 'Center' },
  { id: 'side', label: 'Side' },
];

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
  const [loop, setLoop] = useState(false);
  const [shared, setShared] = useState(false);
  const sound = useSoundEffects();

  const trick = stageTrick(state);
  const camera = sceneCamera(state);
  const tripod = sceneTripod(state);
  const timeline = timelineFor(state, RIDER.skateStyle);
  const steps = trickSteps(state);
  const preset = typeof state.camera === 'string' ? cameraPreset(state.camera) : null;
  const search = searchFromState(state);
  // A grind at a spot with handrails picks one; a side rail's side comes from the trick.
  const pickRail = state.mode === 'grinds' && setInfo(state.set).rails != null && setInfo(state.set).rails?.sideGrinds !== false;
  const line = railLine(state);

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
        <div className="explorer-actions">
          <VideoButton
            video={{ robot: RIDER, trick, riderStance: state.rider, camera, tripod, zoom: state.zoom, set: state.set, rail: state.rail, skater: state.skater, rate, sound }}
          />
          <button type="button" className="explorer-share" onClick={share}>
            {shared ? <TbCheck aria-hidden /> : <TbShare aria-hidden />}
            <span className="explorer-share-label">{shared ? 'Link copied' : 'Share'}</span>
          </button>
        </div>
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
            tripod={tripod}
            zoom={state.zoom}
            set={state.set}
            rail={state.rail}
            skater={state.skater}
            cameraLabel={cameraLabel(state)}
            customCamera={preset == null}
            rate={rate}
            loop={loop}
            onCamera={(next) => setState({ ...state, camera: next })}
            onResetCamera={() => setState({ ...state, camera: 'classic' })}
            onZoom={(zoom) => setState({ ...state, zoom })}
            onRate={setRate}
            onLoop={setLoop}
          />
        </div>

        <div className="explorer-panel-col">
          <TrickBuilder state={state} onChange={setState} />

          <section className="explorer-card" aria-labelledby="explorer-camera-title">
            <div className="explorer-card-head">
              <h2 id="explorer-camera-title">Camera</h2>
              <span className="explorer-card-hint">{preset ? preset.hint : 'Drag the stage to fine-tune'}</span>
            </div>
            <div className="explorer-cams" role="radiogroup" aria-label="Camera angle">
              {cameraPresetsFor(state).map((option) => {
                const active = preset?.id === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`explorer-cam ${active ? 'active' : ''}`}
                    onClick={() => setState({ ...state, camera: option.id, zoom: option.zoom ?? state.zoom })}
                  >
                    <CameraDial camera={sceneCamera({ ...state, camera: option.id })} size={30} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
            <label className="explorer-zoom">
              <span className="explorer-field-label">Zoom</span>
              <span className="explorer-zoom-end">Out</span>
              <input
                type="range"
                min={ZOOM_RANGE.min}
                max={ZOOM_RANGE.max}
                step={0.01}
                value={Math.log(state.zoom)}
                onChange={(event) => setState({ ...state, zoom: zoomAt(Number(event.target.value)) })}
                aria-label="Zoom, from out to in"
                aria-valuetext={`${state.zoom.toFixed(1)}×`}
              />
              <span className="explorer-zoom-end">In</span>
            </label>
            <div className="explorer-field explorer-spots">
              <span className="explorer-field-label" id="explorer-set-label">Spot</span>
              <div className="explorer-segmented explorer-spot-options" role="radiogroup" aria-labelledby="explorer-set-label">
                {STAGE_SETS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={state.set === option.id}
                    className={state.set === option.id ? 'active' : ''}
                    onClick={() => setState(withSet(state, option.id))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {setInfo(state.set).description && <p className="explorer-spot-description">{setInfo(state.set).description}</p>}
            </div>
            {pickRail && (
              <div className="explorer-field explorer-field-inline">
                <span className="explorer-field-label" id="explorer-rail-label">
                  Rail <small>{state.rail === 'side' && line ? `the ${line} one, for this trick` : 'or the side the trick comes in toward'}</small>
                </span>
                <div className="explorer-segmented explorer-segmented-compact" role="radiogroup" aria-labelledby="explorer-rail-label">
                  {RAILS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={state.rail === option.id}
                      className={state.rail === option.id ? 'active' : ''}
                      onClick={() => setState({ ...state, rail: option.id })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

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
