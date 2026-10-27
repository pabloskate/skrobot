'use client';

import { useEffect, useState } from 'react';
import { TbArrowLeft, TbCheck, TbDice5, TbShare } from 'react-icons/tb';
import { useSoundEffects, type Skater } from '@skrobot/animations';
import { ROBOT_BY_ID, ROBOTS } from '@/features/robots';
import {
  FLATGROUND_TIERS,
  GRIND_SIDES,
  GRIND_TIERS,
  INTO_CHOICES,
  OUT_CHOICES,
  RIDERS,
  STANCES,
  cameraPreset,
  flatgroundTrick,
  sceneCamera,
  sceneTripod,
  searchFromState,
  shuffle,
  stageTrick,
  timelineFor,
  withCamera,
  withCameraSide,
  withShot,
  type CameraPresetId,
  type ExplorerState,
  outcomeOf,
  stageOutcome,
} from './explorer';
import {
  DREAM_DEFAULT,
  DREAM_SPOTS,
  dreamLine,
  dreamOutEnd,
  dreamShots,
  dreamSpot,
  dreamStateFromSearch,
  withDreamGrind,
  withDreamLine,
  withDreamSpot,
} from './dream';
import { OutcomeField } from './TrickBuilder';
import DreamStage from './DreamStage';
import CameraAngleDialog from './CameraAngleDialog';
import SpotArt from './SpotArt';
import VideoButton from './VideoButton';
import LocationNotice from './LocationNotice';

/** Swivel supplies the shared skating style for every skater. */
const RIDER = ROBOT_BY_ID.get('shifty') ?? ROBOTS[0];

/** Static portraits exported from the stage's actual rider meshes. */
const SKATERS: ReadonlyArray<{ id: Skater; label: string }> = [
  { id: 'robot', label: 'Robot' },
  { id: 'realistic', label: 'Realistic' },
  { id: 'alien', label: 'Alien' },
];

/** Wait for the camera to settle before writing it into the address bar. */
const URL_SYNC_MS = 250;

const capitalize = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

interface ChoiceProps<T extends string> {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  name?: (option: T) => string;
}

/** A row of mutually exclusive choices. */
function Choice<T extends string>({ label, options, value, onChange, name = capitalize }: ChoiceProps<T>) {
  return (
    <div className="explorer-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          className={value === option ? 'active' : ''}
          onClick={() => onChange(option)}
        >
          {name(option)}
        </button>
      ))}
    </div>
  );
}

/**
 * Dream Tricks: pick a famous spot, a skater, what to hit there and a trick, and
 * watch it land or kick out on repeat, from where a filmer would stand.
 * Everything an animator would tune (scrubbing, zoom, the plaza and
 * waterfront) stays in the Trick Explorer; the link still describes
 * exactly what's on stage.
 */
export default function DreamTricks({ initialSearch = '' }: { initialSearch?: string }) {
  const [state, setState] = useState<ExplorerState>(() => dreamStateFromSearch(initialSearch));
  const [rate, setRate] = useState(1);
  const [shared, setShared] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const sound = useSoundEffects();

  const set = (patch: Partial<ExplorerState>) => setState({ ...state, ...patch });
  const trick = stageTrick(state);
  const camera = sceneCamera(state);
  const tripod = sceneTripod(state);
  const spot = dreamSpot(state.set);
  const line = dreamLine(state);
  const shots = dreamShots(state);
  const shot = typeof state.camera === 'string' ? state.camera : null;
  const shotZoom = shot ? cameraPreset(shot).zoom ?? 1 : 1;
  const search = searchFromState(state);
  const grinding = state.mode === 'grinds';
  const fall = outcomeOf(state);

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
        await navigator.share({ title: `${trick.name} at ${spot.name} · Dream Tricks`, url });
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

  const tiers = grinding ? GRIND_TIERS : FLATGROUND_TIERS;
  const picked = grinding ? state.grind : state.trick;
  const pick = (base: string) => setState(grinding ? withDreamGrind(state, base) : { ...state, trick: base });

  return (
    <div className="explorer dream">
      <header className="explorer-header">
        <a className="explorer-back" href="/" aria-label="Back to Skate Robot">
          <TbArrowLeft aria-hidden />
        </a>
        <div className="explorer-brand">
          <span className="explorer-eyebrow">Skate Robot</span>
          <h1>Dream Tricks</h1>
        </div>
        <div className="explorer-actions">
          <VideoButton
            video={{ robot: RIDER, trick, riderStance: state.rider, ...stageOutcome(fall), camera, tripod, zoom: state.zoom, set: state.set, rail: state.rail, obstacle: state.obstacle, skater: state.skater, rate, sound }}
          />
          <button type="button" className="explorer-share" onClick={share}>
            {shared ? <TbCheck aria-hidden /> : <TbShare aria-hidden />}
            <span className="explorer-share-label">{shared ? 'Link copied' : 'Share'}</span>
          </button>
        </div>
      </header>

      <div className="dream-layout">
        <div className="dream-main">
          <DreamStage
            key={`${trick.id}:${state.rider}:${state.obstacle}:${fall ?? 'landed'}`}
            robot={RIDER}
            trick={trick}
            rider={state.rider}
            camera={camera}
            tripod={tripod}
            zoom={state.zoom}
            set={state.set}
            rail={state.rail}
            obstacle={state.obstacle}
            skater={state.skater}
            fall={fall}
            duration={timelineFor(state, RIDER.skateStyle).duration}
            caption={`${line.label} · ${spot.name}`}
            rate={rate}
            moved={shot == null || state.zoom !== shotZoom || state.pan != null}
            onCamera={(next) => setState(withCamera(state, next))}
            onZoom={(zoom) => set({ zoom })}
            onResetView={() => setState(withShot(state, shot ?? (DREAM_DEFAULT.camera as CameraPresetId)))}
            onRate={setRate}
            onOpenCamera={() => setCameraOpen(true)}
          />
          <section className="explorer-card dream-outcome" aria-label="Animation outcome">
            <OutcomeField state={state} set={set} />
          </section>
        </div>

        {/* Every setting on one side, in the order you'd pick them. */}
        <div className="dream-side">
          <section className="explorer-card dream-spots" aria-labelledby="dream-spot-title">
            <h2 id="dream-spot-title" className="dream-heading">Pick a spot</h2>
            <div className="dream-spot-list" role="radiogroup" aria-labelledby="dream-spot-title">
              {DREAM_SPOTS.map((option) => {
                const active = option.id === state.set;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`dream-spot dream-spot-${option.id} ${active ? 'active' : ''}`}
                    onClick={() => setState(withDreamSpot(state, option.id))}
                  >
                    <SpotArt set={option.id} />
                    <span className="dream-spot-name">{option.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="explorer-card dream-rider" aria-labelledby="dream-rider-title">
            <h2 id="dream-rider-title" className="dream-heading">Pick a skater</h2>
            <div className="dream-skater-list" role="radiogroup" aria-labelledby="dream-rider-title">
              {SKATERS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={state.skater === id}
                  className={`dream-skater dream-skater-${id} ${state.skater === id ? 'active' : ''}`}
                  onClick={() => set({ skater: id })}
                >
                  <span className="dream-skater-portrait" aria-hidden="true">
                    <img src={`/skaters/${id}.webp`} alt="" width={320} height={384} />
                  </span>
                  <span className="dream-skater-name">{label}</span>
                  {state.skater === id && <TbCheck className="dream-skater-check" aria-hidden />}
                </button>
              ))}
            </div>
            <div className="dream-footing">
              <span className="explorer-field-label">
                Footing <small>{state.rider === 'goofy' ? 'right foot forward' : 'left foot forward'}</small>
              </span>
              <Choice label="Footing" options={RIDERS} value={state.rider} onChange={(rider) => set({ rider })} />
            </div>
          </section>

          <section className="explorer-card dream-trick" aria-labelledby="dream-trick-title">
            <div className="dream-heading-row">
              <h2 id="dream-trick-title" className="dream-heading">{grinding ? 'Grind' : 'Trick'}</h2>
              <button type="button" className="explorer-shuffle" onClick={() => setState(shuffle(state))}>
                <TbDice5 aria-hidden />
                Surprise me
              </button>
            </div>

            {spot.lines.length > 1 && (
              <label className="dream-lines">
                <span id="dream-line-title" className="dream-lines-label">What to hit</span>
                <select
                  className="dream-trick-select"
                  aria-labelledby="dream-line-title"
                  value={line.id}
                  onChange={(event) => {
                    const next = spot.lines.find((option) => option.id === event.target.value);
                    if (next) setState(withDreamLine(state, next));
                  }}
                >
                  {spot.lines.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}

            {/* Stance first: it renames the tricks in the list below it. */}
            <div className="dream-labeled-field">
              <span className="dream-field-label">Stance</span>
              <Choice label="Stance" options={STANCES} value={state.stance} onChange={(stance) => set({ stance })} />
            </div>

            {/* One list, grouped like the explorer's tiers, so it reads as a single pick. */}
            <label className="dream-labeled-field">
              <span id="dream-trick-select-label" className="dream-field-label">{grinding ? 'Grind' : 'Trick'}</span>
              <select
                className="dream-trick-select"
                aria-labelledby="dream-trick-select-label"
                value={picked}
                onChange={(event) => pick(event.target.value)}
              >
                {tiers.map((tier) => (
                  <optgroup key={tier.label} label={tier.label}>
                    {tier.bases.map((base) => (
                      <option key={base} value={base}>
                        {grinding ? base : flatgroundTrick(base, state.stance).name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            {/* The ways to change the trick, after the trick itself. */}
            {grinding && (
              <div className="dream-tweaks">
                <Choice
                  label="Grind side"
                  options={GRIND_SIDES}
                  value={state.side}
                  onChange={(side) => set({ side })}
                  name={(side) => side}
                />
              </div>
            )}

            {grinding && (
              <div className="dream-combo">
                <label className="dream-select">
                  <span>Flip in</span>
                  <select value={state.into ?? ''} onChange={(event) => set({ into: event.target.value || null })}>
                    <option value="">{state.stance === 'nollie' ? 'Nollie on' : 'Ollie on'}</option>
                    {INTO_CHOICES.map((base) => <option key={base} value={base}>{base}</option>)}
                  </select>
                </label>
                <label className="dream-select">
                  <span>Flip out</span>
                  <select
                    value={state.out?.base ?? ''}
                    onChange={(event) => set({ out: event.target.value ? { base: event.target.value, end: dreamOutEnd(state.grind) } : null })}
                  >
                    <option value="">Pop off</option>
                    {OUT_CHOICES.map((base) => <option key={base} value={base}>{base}</option>)}
                  </select>
                </label>
              </div>
            )}
          </section>
        </div>
      </div>
      <LocationNotice />
      {cameraOpen && (
        <CameraAngleDialog
          shots={shots}
          selected={shot}
          side={state.cameraSide}
          onClose={() => setCameraOpen(false)}
          onChoose={(next) => {
            setState(withShot(state, next));
            // A side-on shot opens up the side choice in place; other shots are done.
            if (!cameraPreset(next).sides) setCameraOpen(false);
          }}
          onSideChange={(cameraSide) => setState(withCameraSide(state, cameraSide))}
        />
      )}
    </div>
  );
}
