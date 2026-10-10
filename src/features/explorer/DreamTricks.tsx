'use client';

import { useEffect, useRef, useState } from 'react';
import { TbAlien, TbArrowLeft, TbCheck, TbDice5, TbRobot, TbShare, TbUser } from 'react-icons/tb';
import { useSoundEffects, type Skater } from '@skrobot/animations';
import { ROBOT_BY_ID, ROBOTS } from '@/features/robots';
import { trickMatchesSearch } from '@/features/tricks';
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
  grindMatchesSearch,
  sceneCamera,
  sceneTripod,
  searchFromState,
  shuffle,
  stageTrick,
  timelineFor,
  type ExplorerState,
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
import { SearchField } from './TrickBuilder';
import DreamStage from './DreamStage';
import ShotIcon from './ShotIcon';
import SpotArt from './SpotArt';
import VideoButton from './VideoButton';

/** Swivel supplies the shared skating style for both riders. */
const RIDER = ROBOT_BY_ID.get('shifty') ?? ROBOTS[0];

const SKATERS: ReadonlyArray<{ id: Skater; label: string; icon: typeof TbRobot }> = [
  { id: 'robot', label: 'Robot', icon: TbRobot },
  { id: 'realistic', label: 'Realistic', icon: TbUser },
  { id: 'alien', label: 'Alien', icon: TbAlien },
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
 * Dream Tricks: pick a famous spot, what to hit there, and a trick, and
 * watch it land on repeat, from where a filmer would stand. Everything an
 * animator would tune (scrubbing, zoom, the plaza and waterfront) stays in
 * the Trick Explorer; the link still describes exactly what's on stage.
 */
export default function DreamTricks({ initialSearch = '' }: { initialSearch?: string }) {
  const [state, setState] = useState<ExplorerState>(() => dreamStateFromSearch(initialSearch));
  const [rate, setRate] = useState(1);
  const [query, setQuery] = useState('');
  const [shared, setShared] = useState(false);
  const spotList = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    // A shared link can open a card beyond the mobile row's visible edge.
    // Move just that row so the chosen spot is visible without scrolling the page.
    const list = spotList.current;
    const selected = list?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!list || !selected || list.scrollWidth <= list.clientWidth) return;
    const row = list.getBoundingClientRect();
    const card = selected.getBoundingClientRect();
    if (card.left < row.left || card.right > row.right) {
      list.scrollBy({ left: card.left - row.left - (row.width - card.width) / 2, behavior: 'auto' });
    }
  }, [state.set]);

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

  const matches = (base: string) => trickMatchesSearch(flatgroundTrick(base, state.stance), query);
  const tiers = grinding
    ? GRIND_TIERS.map((tier) => ({ ...tier, bases: tier.bases.filter((grind) => grindMatchesSearch(grind, query)) }))
    : FLATGROUND_TIERS.map((tier) => ({ ...tier, bases: tier.bases.filter(matches) }));
  const shown = tiers.filter((tier) => tier.bases.length > 0);
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
            video={{ robot: RIDER, trick, riderStance: state.rider, camera, tripod, zoom: state.zoom, set: state.set, rail: state.rail, obstacle: state.obstacle, skater: state.skater, rate, sound }}
          />
          <button type="button" className="explorer-share" onClick={share}>
            {shared ? <TbCheck aria-hidden /> : <TbShare aria-hidden />}
            <span className="explorer-share-label">{shared ? 'Link copied' : 'Share'}</span>
          </button>
        </div>
      </header>

      <div className="dream-layout">
        <div className="dream-main">
          <section className="dream-spots" aria-labelledby="dream-spot-title">
            <h2 id="dream-spot-title" className="dream-heading">Pick a spot</h2>
            <div ref={spotList} className="dream-spot-list" role="radiogroup" aria-labelledby="dream-spot-title">
              {DREAM_SPOTS.map((option) => {
                const active = option.id === state.set;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`dream-spot dream-spot-${option.id} ${active ? 'active' : ''}`}
                    onClick={() => {
                      setQuery('');
                      setState(withDreamSpot(state, option.id));
                    }}
                  >
                    <SpotArt set={option.id} />
                    <span className="dream-spot-name">{option.name}</span>
                  </button>
                );
              })}
            </div>
            {spot.lines.length > 1 && (
              <div className="dream-lines" role="radiogroup" aria-label={`What to hit at ${spot.name}`}>
                {spot.lines.map((option) => {
                  const active = option.id === line.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`dream-line ${active ? 'active' : ''}`}
                      onClick={() => {
                        if (option.mode !== state.mode) setQuery('');
                        setState(withDreamLine(state, option));
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <DreamStage
            key={`${trick.id}:${state.rider}:${state.obstacle}`}
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
            duration={timelineFor(state, RIDER.skateStyle).duration}
            caption={`${line.label} · ${spot.name}`}
            rate={rate}
            moved={shot == null || state.zoom !== shotZoom}
            onCamera={(next) => set({ camera: next })}
            onZoom={(zoom) => set({ zoom })}
            onResetView={() => set({ camera: shot ?? DREAM_DEFAULT.camera, zoom: shot ? shotZoom : 1 })}
            onRate={setRate}
          />

          <section className="dream-shots" aria-labelledby="dream-shot-title">
            <div className="dream-heading-row">
              <h2 id="dream-shot-title" className="dream-heading">Camera</h2>
              <span className="dream-hint">or drag the video to look around</span>
            </div>
            <div className="dream-shot-list" role="radiogroup" aria-labelledby="dream-shot-title">
              {shots.map((option) => {
                const active = shot === option.id;
                const preset = cameraPreset(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`dream-shot ${active ? 'active' : ''}`}
                    onClick={() => set({ camera: option.id, zoom: preset.zoom ?? 1 })}
                    title={option.hint}
                  >
                    <ShotIcon camera={sceneCamera({ ...state, camera: option.id })} tripod={preset.tripod != null} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="dream-side">
          <section className="explorer-card dream-trick" aria-labelledby="dream-trick-title">
            <div className="dream-heading-row">
              <h2 id="dream-trick-title" className="dream-heading">{grinding ? 'Grind' : 'Trick'}</h2>
              <button type="button" className="explorer-shuffle" onClick={() => setState(shuffle(state))}>
                <TbDice5 aria-hidden />
                Surprise me
              </button>
            </div>

            <Choice label="Stance" options={STANCES} value={state.stance} onChange={(stance) => set({ stance })} />

            {grinding && (
              <Choice
                label="Grind side"
                options={GRIND_SIDES}
                value={state.side}
                onChange={(side) => set({ side })}
                name={(side) => side}
              />
            )}

            <SearchField
              value={query}
              onChange={setQuery}
              placeholder={grinding ? 'Search grinds, like “crooks”' : 'Search tricks, like “tre flip”'}
              label={grinding ? 'Search grinds' : 'Search tricks'}
            />
            {shown.length === 0 && <p className="explorer-empty">Nothing matches “{query}”.</p>}
            <div className="dream-trick-list">
              {shown.map((tier) => (
                <div key={tier.label} className="explorer-tier">
                  <h3>{tier.label}</h3>
                  <div className="explorer-chips">
                    {tier.bases.map((base) => (
                      <button
                        key={base}
                        type="button"
                        className={`explorer-chip ${picked === base ? 'active' : ''}`}
                        aria-pressed={picked === base}
                        onClick={() => pick(base)}
                      >
                        {grinding ? base : flatgroundTrick(base, state.stance).name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

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

          <section className="explorer-card dream-rider" aria-labelledby="dream-rider-title">
            <h2 id="dream-rider-title" className="dream-heading">Skater</h2>
            <div className="dream-skaters" role="radiogroup" aria-labelledby="dream-rider-title">
              {SKATERS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={state.skater === id}
                  className={`dream-skater ${state.skater === id ? 'active' : ''}`}
                  onClick={() => set({ skater: id })}
                >
                  <Icon aria-hidden />
                  {label}
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
        </div>
      </div>
    </div>
  );
}
