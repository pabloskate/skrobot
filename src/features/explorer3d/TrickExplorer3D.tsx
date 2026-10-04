'use client';

import { useEffect, useState } from 'react';
import { TbArrowLeft } from 'react-icons/tb';
import { STAGE_SETS } from '@skrobot/animations';
import { ROBOT_BY_ID, ROBOTS } from '@/features/robots';
import {
  CAMERA_PRESETS,
  CameraDial,
  TrickBuilder,
  ZOOM_RANGE,
  cameraLabel,
  cameraPreset,
  sceneCamera,
  searchFromState,
  stageTrick,
  stateFromSearch,
  timelineFor,
  zoomAt,
  withSet,
  type ExplorerState,
} from '@/features/explorer';
import Stage3D, { type StageView } from './Stage3D';

/** The same rider as the Trick Explorer: Swivel, skating in its own style. */
const RIDER = ROBOT_BY_ID.get('shifty') ?? ROBOTS[0];
const URL_SYNC_MS = 250;

const VIEWS: ReadonlyArray<{ id: StageView; label: string }> = [
  { id: '3d', label: '3D' },
  { id: 'compare', label: 'Compare with SVG' },
];

const viewFromSearch = (search: string): StageView => (new URLSearchParams(search).get('view') === 'compare' ? 'compare' : '3d');

/**
 * Trick Explorer 3D: the Trick Explorer's tricks, grinds, and cameras on the
 * three.js renderer — the first step toward a playable 3D scene. It shares
 * the explorer's trick picker and link format (plus `view=compare` to show
 * the SVG scene beside it) but is its own comparison page.
 */
export default function TrickExplorer3D({ initialSearch = '' }: { initialSearch?: string }) {
  const [state, setState] = useState<ExplorerState>(() => stateFromSearch(initialSearch));
  const [view, setView] = useState<StageView>(() => viewFromSearch(initialSearch));
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(true);

  const trick = stageTrick(state);
  const camera = sceneCamera(state);
  const timeline = timelineFor(state, RIDER.skateStyle);
  const preset = typeof state.camera === 'string' ? cameraPreset(state.camera) : null;
  const search = `${searchFromState(state)}${view === 'compare' ? '&view=compare' : ''}`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.location.search !== search) window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`);
    }, URL_SYNC_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  return (
    <div className={`explorer explorer3d ${view === 'compare' ? 'explorer3d--compare' : ''}`}>
      <header className="explorer-header">
        <a className="explorer-back" href={`/explore${searchFromState(state)}`} aria-label="Back to the Trick Explorer">
          <TbArrowLeft aria-hidden />
        </a>
        <div className="explorer-brand">
          <span className="explorer-eyebrow">Skate Robot · Preview</span>
          <h1>Trick Explorer 3D</h1>
        </div>
      </header>

      <div className="explorer-layout">
        <div className="explorer-stage-col">
          <Stage3D
            key={`${trick.id}:${state.rider}`}
            robot={RIDER}
            trick={trick}
            rider={state.rider}
            timeline={timeline}
            camera={camera}
            zoom={state.zoom}
            set={state.set}
            skater={state.skater}
            view={view}
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
          <section className="explorer-card" aria-labelledby="explorer3d-view-title">
            <div className="explorer-card-head">
              <h2 id="explorer3d-view-title">Renderer</h2>
              <span className="explorer-card-hint">three.js, on the same motion</span>
            </div>
            <div className="explorer-segmented" role="radiogroup" aria-labelledby="explorer3d-view-title">
              {VIEWS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={view === option.id}
                  className={view === option.id ? 'active' : ''}
                  onClick={() => setView(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <TrickBuilder state={state} onChange={setState} />

          <section className="explorer-card" aria-labelledby="explorer3d-camera-title">
            <div className="explorer-card-head">
              <h2 id="explorer3d-camera-title">Camera</h2>
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
            <div className="explorer-field explorer-field-inline">
              <span className="explorer-field-label" id="explorer3d-set-label">Spot</span>
              <div className="explorer-segmented explorer-segmented-compact" role="radiogroup" aria-labelledby="explorer3d-set-label">
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
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
