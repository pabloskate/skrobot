'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TbArrowLeft, TbCheck, TbDice5, TbMapPin, TbShare, TbSkateboard, TbUser, TbVideo } from 'react-icons/tb';
import { spotStands, useSoundEffects, type SceneCamera, type Skater, type TripodSpot } from '@skrobot/animations';
import { groundUnder, planBounds, riderPath, spotPlan } from '@skrobot/animations/three';
import { ROBOT_BY_ID, ROBOTS } from '@/features/robots';
import {
  FLATGROUND_TIERS,
  grindSidesFor,
  GRIND_TIERS,
  INTO_CHOICES,
  OUT_CHOICES,
  RIDERS,
  STANCES,
  filmedLine,
  flatgroundTrick,
  sceneCamera,
  sceneTripod,
  searchFromState,
  shuffle,
  stageTrick,
  restrictRailApproach,
  timelineFor,
  turnCamera,
  withCamera,
  withShot,
  type ExplorerState,
  outcomeOf,
  stageOutcome,
} from './explorer';
import {
  DREAM_SPOTS,
  actionPoint,
  cameraMode,
  dreamLine,
  dreamOutEnd,
  dreamShots,
  dreamSpot,
  dreamStateFromSearch,
  insideWindow,
  mapWindow,
  presetStand,
  swingStand,
  withDreamGrind,
  withDreamLine,
  withDreamSpot,
  type CameraMode,
} from './dream';
import { OutcomeField } from './TrickBuilder';
import DreamStage from './DreamStage';
import CameraPanel from './CameraPanel';
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
  { id: 'windup', label: 'Wind-Up' },
];

/** Wait for the camera to settle before writing it into the address bar. */
const URL_SYNC_MS = 250;

const capitalize = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

/** The four things there are to pick, each a tile under the picture that opens its choices. */
type Tab = 'trick' | 'spot' | 'skater' | 'camera';

/** What a camera was doing when the viewer left it for the other kind, to come back to. */
type CameraMemory = Pick<ExplorerState, 'set' | 'camera' | 'stand' | 'cameraSide' | 'pan' | 'zoom'>;

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
 * watch it land or kick out on repeat. The picture stays in view the whole
 * time; under it, four tiles say what's on stage (the trick, the spot, the
 * skater, the camera) and each opens its choices. The camera is one of two
 * things, a tripod stood anywhere on a map of the spot or one that follows
 * the skater. Everything an animator would tune (scrubbing, the plaza and
 * waterfront) stays in the Trick Explorer; the link still describes exactly
 * what's on stage.
 */
export default function DreamTricks({ initialSearch = '' }: { initialSearch?: string }) {
  const [state, setRawState] = useState<ExplorerState>(() => dreamStateFromSearch(initialSearch));
  const setState = (next: ExplorerState) => setRawState(restrictRailApproach(next));
  const [rate, setRate] = useState(1);
  const [shared, setShared] = useState(false);
  const [tab, setTab] = useState<Tab>('trick');
  const sound = useSoundEffects();
  const main = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLDivElement>(null);
  /** The playhead's moment, written by the stage and read by the camera map. */
  const clock = useRef(0);
  const remembered = useRef<Partial<Record<CameraMode, CameraMemory>>>({});
  /** The filmer's stand a drag across the picture set out from, once the drag has made it the viewer's own. */
  const dragFrom = useRef<TripodSpot | null>(null);

  const set = (patch: Partial<ExplorerState>) => setState({ ...state, ...patch });
  const trick = stageTrick(state);
  const camera = sceneCamera(state);
  const tripod = sceneTripod(state);
  const mode = cameraMode(state);
  const spot = dreamSpot(state.set);
  const line = dreamLine(state);
  const search = searchFromState(state);
  const grinding = state.mode === 'grinds';
  const fall = outcomeOf(state);
  const outcome = stageOutcome(fall);
  const timeline = timelineFor(state, RIDER.skateStyle);
  const skater = SKATERS.find((option) => option.id === state.skater) ?? SKATERS[0];
  const shot = !state.stand && typeof state.camera === 'string' ? dreamShots(state).find((option) => option.id === state.camera) : undefined;
  const cameraName = mode === 'tripod' ? `Tripod · ${shot?.label ?? 'your spot'}` : shot ? `Follow · ${shot.label.toLowerCase()}` : 'Follow';

  // The rider's line through the spot, for the map and for where a tripod aims its framing.
  const path = useMemo(
    () => riderPath(trick, {
      landed: outcome.landed,
      fall: outcome.fallVariant,
      railBail: outcome.railBail,
      riderStance: state.rider,
      style: RIDER.skateStyle,
      skater: state.skater,
      set: state.set,
      rail: state.rail,
      obstacle: state.obstacle,
    }),
    // The trick's id carries its base and stance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trick.id, outcome.landed, outcome.fallVariant, outcome.railBail, state.rider, state.skater, state.set, state.rail, state.obstacle],
  );
  const action = actionPoint(path, timeline.phases);
  const pop = timeline.phases.find((phase) => phase.label === 'Pop')?.time ?? 0;
  const flight = [pop, timeline.phases[timeline.phases.length - 1]?.time ?? timeline.duration] as const;
  // The spot from above is read off its meshes, so only once the camera is opened.
  const plan = useMemo(() => (tab === 'camera' ? spotPlan(state.set) : null), [tab, state.set]);
  const stand = state.stand ?? (plan ? presetStand(state, (u, z) => groundUnder(plan, u, z)) : null);
  // The map shows the rider's line and the spot's filmers, with room round them to stand a tripod.
  const around = (ground: NonNullable<typeof plan>) =>
    mapWindow(planBounds(ground), [...path, ...Object.values(spotStands(state.set, filmedLine(state), state.cameraSide) ?? {})]);

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

  const open = (next: Tab) => {
    setTab(next);
    // On a phone the picture is pinned over the choices: bring a new set of them up under it.
    requestAnimationFrame(() => {
      if (!main.current || !side.current || window.matchMedia('(min-width: 960px)').matches) return;
      const gap = side.current.getBoundingClientRect().top - main.current.getBoundingClientRect().bottom;
      if (gap < 0) window.scrollBy({ top: gap - 12 });
    });
  };

  /** The other kind of camera: back to how the viewer last had it at this spot, or its usual start. */
  const switchMode = (to: CameraMode) => {
    if (to === mode) return;
    remembered.current[mode] = { set: state.set, camera: state.camera, stand: state.stand, cameraSide: state.cameraSide, pan: state.pan, zoom: state.zoom };
    const back = remembered.current[to];
    if (back && (to === 'follow' || back.set === state.set)) {
      setState({ ...state, camera: back.camera, stand: back.stand, cameraSide: back.cameraSide, pan: back.pan, zoom: back.zoom });
      return;
    }
    const first = dreamShots(state, to)[0];
    if (first) setState(withShot(state, to === 'follow' ? 'follow' : first.id));
  };

  /**
   * A drag across the picture swings the camera round the skater, whichever
   * camera it is: the crane round the rider, or the tripod walked round
   * where the trick happens (and raised or lowered), on the ground there.
   */
  const turn = (from: SceneCamera, yaw: number, pitch: number): SceneCamera => {
    const ground = mode === 'tripod' ? spotPlan(state.set) : null;
    if (!ground) return turnCamera(from, yaw, pitch);
    if (!from.stand) dragFrom.current = presetStand(state, (u, z) => groundUnder(ground, u, z)) ?? dragFrom.current;
    const base = from.stand ?? dragFrom.current;
    if (!base) return turnCamera(from, yaw, pitch);
    const swung = swingStand(base, action, yaw, pitch);
    return { ...from, pan: undefined, stand: { ...swung, ...insideWindow(swung, around(ground)) } };
  };

  const tiers = grinding ? GRIND_TIERS : FLATGROUND_TIERS;
  const picked = grinding ? state.grind : state.trick;
  const pick = (base: string) => setState(grinding ? withDreamGrind(state, base) : { ...state, trick: base });

  const tiles: ReadonlyArray<{ id: Tab; label: string; value: string; icon: typeof TbVideo }> = [
    // A grind's full name (its side, a flip in and out) is on the panel; the tile has room for the grind.
    { id: 'trick', label: grinding ? 'Grind' : 'Trick', value: grinding ? state.grind : trick.name, icon: TbSkateboard },
    { id: 'spot', label: 'Spot', value: spot.name, icon: TbMapPin },
    { id: 'skater', label: 'Skater', value: skater.label, icon: TbUser },
    { id: 'camera', label: 'Camera', value: capitalize(mode), icon: TbVideo },
  ];

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
            video={{ robot: RIDER, trick, riderStance: state.rider, ...outcome, camera, tripod, zoom: state.zoom, set: state.set, rail: state.rail, obstacle: state.obstacle, skater: state.skater, rate, sound }}
          />
          <button type="button" className="explorer-share" onClick={share}>
            {shared ? <TbCheck aria-hidden /> : <TbShare aria-hidden />}
            <span className="explorer-share-label">{shared ? 'Link copied' : 'Share'}</span>
          </button>
        </div>
      </header>

      <div className="dream-layout">
        {/* The picture and what's on it, in view whatever is being picked. */}
        <div className="dream-main" ref={main}>
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
            duration={timeline.duration}
            rate={rate}
            cameraMode={mode}
            cameraName={cameraName}
            clockRef={clock}
            onCamera={(next) => setState(withCamera(state, next))}
            onZoom={(zoom) => set({ zoom })}
            turn={turn}
            onRate={setRate}
            onOpenCamera={() => open('camera')}
          />
          <div className="dream-tiles" role="tablist" aria-label="What's on stage">
            {tiles.map(({ id, label, value, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`dream-tab-${id}`}
                aria-selected={tab === id}
                aria-controls="dream-panel"
                className={`dream-tile ${tab === id ? 'active' : ''}`}
                onClick={() => open(id)}
              >
                <span className="dream-tile-label"><Icon aria-hidden />{label}</span>
                <span className="dream-tile-value">{value}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="dream-side" ref={side}>
          <section className="explorer-card dream-panel" id="dream-panel" role="tabpanel" aria-labelledby={`dream-tab-${tab}`}>
            {tab === 'trick' && (
              <div className="dream-trick">
                <div className="dream-heading-row">
                  <h2 className="dream-heading">{grinding ? 'Pick a grind' : 'Pick a trick'}</h2>
                  <button type="button" className="explorer-shuffle" onClick={() => setState(shuffle(state))}>
                    <TbDice5 aria-hidden />
                    Surprise me
                  </button>
                </div>

                {spot.lines.length > 1 && (
                  <div className="dream-field">
                    <span className="dream-field-label">What to hit at {spot.name}</span>
                    <div className="dream-chips" role="radiogroup" aria-label="What to hit">
                      {spot.lines.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          role="radio"
                          aria-checked={option.id === line.id}
                          className={`explorer-chip ${option.id === line.id ? 'active' : ''}`}
                          onClick={() => setState(withDreamLine(state, option))}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stance first: it renames the tricks listed below it. */}
                <div className="dream-field">
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

                {/* The ways to change the grind, after the grind itself. */}
                {grinding && (
                  <div className="dream-field">
                    <span className="dream-field-label">Which way on</span>
                    <Choice
                      label="Grind side"
                      options={grindSidesFor(state)}
                      value={state.side}
                      onChange={(grindSide) => set({ side: grindSide })}
                      name={(grindSide) => grindSide}
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

                <div className="dream-outcome">
                  <OutcomeField state={state} set={set} />
                </div>
              </div>
            )}

            {tab === 'spot' && (
              <div className="dream-spots">
                <h2 id="dream-spot-title" className="dream-heading">Pick a spot</h2>
                <p className="dream-spot-about">
                  <strong>{spot.name}</strong>
                  <span>{spot.where}</span>
                  <span>{spot.feature}</span>
                </p>
                <div className="dream-spot-list" role="radiogroup" aria-labelledby="dream-spot-title">
                  {DREAM_SPOTS.map((option) => {
                    const active = option.id === spot.id;
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
              </div>
            )}

            {tab === 'skater' && (
              <div className="dream-rider">
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
                <div className="dream-field dream-footing">
                  <span className="dream-field-label">
                    Footing <small>{state.rider === 'goofy' ? 'right foot forward' : 'left foot forward'}</small>
                  </span>
                  <Choice label="Footing" options={RIDERS} value={state.rider} onChange={(rider) => set({ rider })} />
                </div>
              </div>
            )}

            {tab === 'camera' && (
              <>
                <h2 className="dream-heading dream-camera-heading">Camera</h2>
                <CameraPanel
                  state={state}
                  mode={mode}
                  camera={camera}
                  stand={stand}
                  plan={plan}
                  window={plan && around(plan)}
                  path={path}
                  action={action}
                  flight={flight}
                  clock={clock}
                  onMode={switchMode}
                  onState={setState}
                />
              </>
            )}
          </section>
        </div>
      </div>
      <LocationNotice />
    </div>
  );
}
