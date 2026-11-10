'use client';

import type { RefObject } from 'react';
import { TbRun, TbVideo } from 'react-icons/tb';
import { FOOT, SCENE_ORBIT_BOUNDS, spotStands, type SceneCamera, type TripodId, type TripodSpot } from '@skrobot/animations';
import type { PathPoint, SpotPlan } from '@skrobot/animations/three';
import { ZOOM_RANGE, cameraPreset, filmedLine, withCamera, withShot, zoomAt, type CameraPresetId, type ExplorerState } from './explorer';
import { STAND_HEIGHT, dreamShots, placeStand, type CameraMode, type MapPoint, type MapWindow } from './dream';
import CameraMap, { type MapMark } from './CameraMap';

const MODES: ReadonlyArray<{ id: CameraMode; label: string; blurb: string }> = [
  { id: 'tripod', label: 'Tripod', blurb: 'Stays where you stand it and turns to watch the skater go by. Drag it anywhere on the map.' },
  { id: 'follow', label: 'Follow', blurb: 'Travels with the skater. Drag it round them on the map, closer in or further out.' },
];

interface Props {
  state: ExplorerState;
  mode: CameraMode;
  /** The crane the stage is filming from (while following). */
  camera: SceneCamera;
  /** Where the tripod stands: the viewer's own stand, or the spot's filmer for the shot on stage. */
  stand: TripodSpot | null;
  /** The spot from above; null until it's read, or where there's no drop to map. */
  plan: SpotPlan | null;
  /** The part of it the map shows. */
  window: MapWindow | null;
  path: readonly PathPoint[];
  /** Where the trick itself happens, which a tripod frames. */
  action: MapPoint;
  flight: readonly [number, number];
  clock: RefObject<number>;
  onMode: (mode: CameraMode) => void;
  onState: (next: ExplorerState) => void;
}

/**
 * The camera, as the two things it can be: a tripod standing somewhere in
 * the spot, moved by dragging it across a map of the place, or a camera that
 * follows the skater, swung round them the same way. Height and zoom finish
 * either; the spot's own filmers' stands and the usual follow angles are a
 * tap away as starting points.
 */
export default function CameraPanel({ state, mode, camera, stand, plan, window, path, action, flight, clock, onMode, onState }: Props) {
  const follow = mode === 'follow';
  const shots = dreamShots(state, mode);
  const shot = !state.stand && typeof state.camera === 'string' ? state.camera : null;
  const own = follow ? null : spotStands(state.set, filmedLine(state), state.cameraSide);
  const marks: MapMark[] = own
    ? shots.flatMap((option) => {
      const tripod = cameraPreset(option.id).tripod as TripodId | undefined;
      return tripod ? [{ id: option.id, label: option.label, at: own[tripod], active: shot === option.id }] : [];
    })
    : [];

  const place = (to: MapPoint) => {
    if (stand) onState({ ...state, stand: placeStand(stand, to, action), pan: undefined });
  };
  const height = stand ? stand.height / FOOT : STAND_HEIGHT.eye / FOOT;

  return (
    <div className="dream-camera">
      <div className="dream-mode" role="radiogroup" aria-label="Camera">
        {MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={mode === option.id}
            className={mode === option.id ? 'active' : ''}
            onClick={() => onMode(option.id)}
          >
            {option.id === 'tripod' ? <TbVideo aria-hidden /> : <TbRun aria-hidden />}
            {option.label}
          </button>
        ))}
      </div>

      {plan && window && (
        <>
          <CameraMap
            plan={plan}
            window={window}
            path={path}
            clock={clock}
            flight={flight}
            mode={mode}
            stand={follow ? null : stand}
            camera={camera}
            marks={marks}
            onPlace={place}
            onOrbit={(yaw, lens) => onState(withCamera(state, { ...camera, yaw, lens }))}
            onMark={(id) => onState(withShot(state, id as CameraPresetId))}
          />
        </>
      )}

      <p className="dream-camera-blurb">{MODES.find((option) => option.id === mode)?.blurb}</p>

      <div className="dream-field">
        <span className="dream-field-label">{follow ? 'Angles' : 'Filmer spots'}</span>
        <div className="dream-chips" role="radiogroup" aria-label={follow ? 'Angles round the skater' : 'Where the spot’s filmers stand'}>
          {shots.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={shot === option.id}
              className={`explorer-chip ${shot === option.id ? 'active' : ''}`}
              title={option.hint}
              onClick={() => onState(withShot(state, option.id))}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dream-sliders">
        {follow ? (
          <label className="dream-slider">
            <span>Height <small>{camera.pitch < 8 ? 'low' : camera.pitch > 40 ? 'overhead' : 'above'}</small></span>
            <input
              type="range"
              min={SCENE_ORBIT_BOUNDS.pitch.min}
              max={SCENE_ORBIT_BOUNDS.pitch.max}
              step={1}
              value={camera.pitch}
              onChange={(event) => onState(withCamera(state, { ...camera, pitch: Number(event.target.value) }))}
            />
          </label>
        ) : (
          <label className="dream-slider">
            <span>Height <small>{Math.round(height * 10) / 10} ft up</small></span>
            <input
              type="range"
              min={STAND_HEIGHT.min / FOOT}
              max={STAND_HEIGHT.max / FOOT}
              step={0.5}
              value={height}
              disabled={!stand}
              onChange={(event) => stand && onState({ ...state, stand: { ...stand, height: Number(event.target.value) * FOOT }, pan: undefined })}
            />
          </label>
        )}
        <label className="dream-slider">
          <span>Zoom <small>{Math.round(state.zoom * 10) / 10}×</small></span>
          <input
            type="range"
            min={ZOOM_RANGE.min}
            max={ZOOM_RANGE.max}
            step={0.01}
            value={Math.log(state.zoom)}
            onChange={(event) => onState({ ...state, zoom: zoomAt(Number(event.target.value)) })}
          />
        </label>
      </div>
    </div>
  );
}
