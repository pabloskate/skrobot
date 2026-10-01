import { lazy, Suspense, useMemo, useState } from 'react';
import {
  BACKGROUND_SCENE_OPTIONS,
  DEFAULT_SKATE_STYLE,
  FALL_VARIANT_OPTIONS,
  ROLL_IN,
  FLIP_T,
  LAND_T,
  FALL_T,
  RobotAvatar,
  SKATE_STYLE_BOUNDS,
  SLOW_MOTION_PLAYBACK_RATE,
  TrickAnimation,
  TrickAnimation3D,
  TrickAnimation3DLegacy,
  TrickScene,
  grindSpecFor,
  grindTimelineFor,
  type BackgroundSceneId,
  type FallVariant,
  type RiderStance,
  type SkateStyle,
  type Stance,
} from '@skrobot/animations';
import {
  GRIND_BASES,
  GRIND_ENTRY_BASES,
  GRIND_EXIT_BASES,
  GRIND_SIDES,
  ROBOTS,
  exitEndsFor,
  grindTrick,
  robotById,
  tricksForStance,
  type GrindExit,
  type GrindSideName,
  type PopEnd,
} from './data';
import ContactSheet from './ContactSheet';
import styles from './Playground.module.css';

const BlenderPrototype = lazy(() => import('./blender-prototype/BlenderPrototype'));

const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const RIDER_STANCES: RiderStance[] = ['regular', 'goofy'];
const PLAYBACK_OPTIONS = [
  { id: 'normal', label: 'Normal', rate: 1 },
  { id: 'slow', label: 'Slow motion', rate: SLOW_MOTION_PLAYBACK_RATE },
] as const;

type PlaybackMode = (typeof PLAYBACK_OPTIONS)[number]['id'];

const VIEW_OPTIONS = [
  { id: 'scene', label: 'Scene (new)' },
  { id: 'side', label: 'Side (2D)' },
  { id: '3d', label: 'New 3D' },
  { id: '3d-legacy', label: '3D legacy' },
] as const;

type ViewMode = (typeof VIEW_OPTIONS)[number]['id'];

const DISCIPLINES = [
  { id: 'flatground', label: 'Flatground' },
  { id: 'grinds', label: 'Grinds' },
] as const;

type Discipline = (typeof DISCIPLINES)[number]['id'];

const APP_MODES = [
  { id: 'playground', label: 'Playground' },
  { id: 'sheet', label: 'Contact sheet' },
  { id: 'blender', label: 'Blender prototype' },
] as const;

type AppMode = (typeof APP_MODES)[number]['id'];

const POP_ENDS: PopEnd[] = ['tail', 'nose'];
const POP_END_LABELS: Record<PopEnd, string> = { tail: 'Off the tail', nose: 'Off the nose (nollie)' };

/** "nose:Kickflip" ↔ { base: 'Kickflip', end: 'nose' }; '' is a plain pop off. */
const exitValue = (exit: GrindExit) => `${exit.end}:${exit.base}`;
function parseExit(value: string): GrindExit | null {
  const at = value.indexOf(':');
  return at < 0 ? null : { end: value.slice(0, at) as PopEnd, base: value.slice(at + 1) };
}

/** Why a grind allows the trick-out ends it does. */
function exitRule(ends: readonly PopEnd[]): string {
  if (ends.length > 1) return 'Centered on the bar (both trucks or the middle): pop out off either end';
  return ends[0] === 'nose'
    ? 'Only the nose end is on the bar: tricks out pop off the nose (nollie), not the tail'
    : 'Only the tail end is on the bar: tricks out pop off the tail, no nollie tricks';
}

const STYLE_CONTROLS = [
  {
    key: 'popHeight',
    label: 'Pop height',
    hint: 'Lower / floatier',
  },
  {
    key: 'rotationSpeed',
    label: 'Rotation speed',
    hint: 'Later / earlier catch',
  },
  {
    key: 'flickStrength',
    label: 'Flick strength',
    hint: 'Softer / harder foot flick',
  },
] as const satisfies ReadonlyArray<{
  key: keyof SkateStyle;
  label: string;
  hint: string;
}>;

async function writeClipboardText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back for local previews where clipboard permissions are blocked.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '0';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('playground');
  const [selectedRobotId, setSelectedRobotId] = useState(ROBOTS[0].id);
  const [discipline, setDiscipline] = useState<Discipline>('flatground');
  const [selectedBase, setSelectedBase] = useState('Kickflip');
  const [selectedGrind, setSelectedGrind] = useState(GRIND_BASES[0]);
  const [grindSide, setGrindSide] = useState<GrindSideName>('Frontside');
  /** Flatground trick popped into the grind; '' is a plain ollie on. */
  const [entryTrick, setEntryTrick] = useState('');
  /** Flatground trick popped out of it, as `${end}:${base}` (see parseExit); '' is a plain pop off. */
  const [exitTrick, setExitTrick] = useState('');
  const [selectedStance, setSelectedStance] = useState<Stance>('regular');
  const [selectedRiderStance, setSelectedRiderStance] = useState<RiderStance>('regular');
  const [landed, setLanded] = useState<boolean | null>(null);
  const [playKey, setPlayKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inspectionTime, setInspectionTime] = useState<number | null>(0);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('normal');
  const [viewMode, setViewMode] = useState<ViewMode>('scene');
  const [backgroundSceneId, setBackgroundSceneId] = useState<BackgroundSceneId>(BACKGROUND_SCENE_OPTIONS[0].id);
  const [fallVariant, setFallVariant] = useState<FallVariant>(FALL_VARIANT_OPTIONS[0].id);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [skateStyle, setSkateStyle] = useState<SkateStyle>(
    ROBOTS[0].skateStyle ?? DEFAULT_SKATE_STYLE,
  );

  const robot = useMemo(() => robotById(selectedRobotId) ?? ROBOTS[0], [selectedRobotId]);
  const previewRobot = useMemo(
    () => ({ ...robot, skateStyle }),
    [robot, skateStyle],
  );
  const playbackRate = PLAYBACK_OPTIONS.find((option) => option.id === playbackMode)?.rate ?? 1;

  const availableTricks = useMemo(() => tricksForStance(selectedStance), [selectedStance]);

  const exitEnds = exitEndsFor(selectedGrind);
  const exit = parseExit(exitTrick);

  const currentTrick = useMemo(() => {
    if (discipline === 'grinds') {
      return grindTrick(selectedGrind, grindSide, selectedStance, entryTrick || undefined, parseExit(exitTrick) ?? undefined);
    }
    return availableTricks.find((t) => t.base === selectedBase) ?? availableTricks[0];
  }, [availableTricks, discipline, entryTrick, exitTrick, grindSide, selectedBase, selectedGrind, selectedStance]);
  const grindSpec = discipline === 'grinds' ? grindSpecFor(currentTrick) : null;
  // Grinds need the bar, and only the Scene renderer has one.
  const activeView: ViewMode = discipline === 'grinds' ? 'scene' : viewMode;

  const animationKey = [
    playKey,
    selectedRobotId,
    currentTrick?.id ?? selectedBase,
    selectedRiderStance,
    landed === null ? 'idle' : landed ? 'landed' : 'bailed',
    playbackMode,
    activeView,
    backgroundSceneId,
    fallVariant,
    skateStyle.popHeight,
    skateStyle.rotationSpeed,
    skateStyle.flickStrength,
  ].join(':');

  const animationParams = useMemo(
    () => ({
      robotId: robot.id,
      robotName: robot.name,
      skateStyle,
      trickId: currentTrick?.id ?? null,
      trickBase: currentTrick?.base ?? selectedBase,
      stance: currentTrick?.stance ?? selectedStance,
      riderStance: selectedRiderStance,
      landed,
      outcome: landed === null ? 'not-started' : landed ? 'landed' : 'bailed',
      playbackMode,
      playbackRate,
      fixedTime: inspectionTime,
      discipline,
      entryTrick: discipline === 'grinds' && entryTrick ? entryTrick : null,
      exitTrick: discipline === 'grinds' && exit ? `${exit.end === 'nose' ? 'Nollie ' : ''}${exit.base}` : null,
      view: activeView,
      backgroundSceneId,
      fallVariant,
    }),
    [
      activeView,
      backgroundSceneId,
      currentTrick,
      discipline,
      entryTrick,
      exit,
      fallVariant,
      landed,
      playbackMode,
      playbackRate,
      inspectionTime,
      robot.id,
      robot.name,
      skateStyle,
      selectedBase,
      selectedRiderStance,
      selectedStance,
    ]
  );
  const paramsText = useMemo(() => JSON.stringify(animationParams, null, 2), [animationParams]);

  const handleStanceChange = (stance: Stance) => {
    setSelectedStance(stance);
    // Try to keep the same base if it exists in the new stance.
    const matching = tricksForStance(stance).find((t) => t.base === selectedBase);
    if (!matching) {
      // Fall back to the first available trick in the new stance.
      const fallback = tricksForStance(stance)[0];
      if (fallback) setSelectedBase(fallback.base);
    }
  };

  const play = (outcome: boolean) => {
    setInspectionTime(null);
    setLanded(outcome);
    setPaused(false);
    setPlayKey((k) => k + 1);
  };

  const replay = () => {
    setLanded(landed ?? true);
    setInspectionTime(null);
    setPaused(false);
    setPlayKey((k) => k + 1);
  };

  const copyParams = async () => {
    const copied = await writeClipboardText(paramsText);
    setCopyStatus(copied ? 'copied' : 'failed');
    window.setTimeout(() => setCopyStatus('idle'), 1400);
  };

  const copyLabel =
    copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy parameters';

  const selectRobot = (robotId: string) => {
    const selectedRobot = robotById(robotId);
    setSelectedRobotId(robotId);
    setSkateStyle(selectedRobot?.skateStyle ?? DEFAULT_SKATE_STYLE);
  };

  const updateSkateStyle = (key: keyof SkateStyle, value: number) => {
    setSkateStyle((current) => ({ ...current, [key]: value }));
  };

  const resetSkateStyle = () => {
    setSkateStyle(robot.skateStyle ?? DEFAULT_SKATE_STYLE);
  };

  const grind = useMemo(
    () => discipline === 'grinds'
      ? grindTimelineFor(currentTrick, selectedRiderStance, skateStyle, landed !== false, fallVariant)
      : null,
    [currentTrick, discipline, fallVariant, landed, selectedRiderStance, skateStyle],
  );
  const duration = grind?.end ?? ROLL_IN + FLIP_T + (landed === false ? FALL_T : LAND_T);
  const phases = grind
    ? [
      { label: 'Setup', time: 0 },
      { label: 'Pop', time: grind.pop },
      ...(grind.trickIn === null ? [] : [{ label: 'Trick in', time: grind.trickIn }]),
      { label: 'Lock', time: grind.lock },
      ...(grind.fail === null
        ? [
          { label: 'Hold', time: (grind.lock + grind.off) / 2 },
          { label: 'Pop off', time: grind.off },
          ...(grind.trickOut === null ? [] : [{ label: 'Trick out', time: grind.trickOut }]),
          { label: 'Roll away', time: duration },
        ]
        : [
          { label: 'Slip', time: grind.fail },
          { label: 'Bail', time: duration },
        ]),
    ]
    : [
      { label: 'Setup', time: 0 },
      { label: 'Pop', time: ROLL_IN + FLIP_T * 0.1 },
      { label: 'Peak', time: ROLL_IN + FLIP_T * 0.5 },
      { label: 'Catch', time: ROLL_IN + FLIP_T * 0.88 },
      { label: landed === false ? 'Bail' : 'Roll away', time: duration },
    ];

  const selectGrind = (next: string) => {
    setSelectedGrind(next);
    // A trick out off an end the new grind doesn't ride isn't one it can do.
    if (exit && !exitEndsFor(next).includes(exit.end)) setExitTrick('');
  };

  const changeDiscipline = (next: Discipline) => {
    setDiscipline(next);
    // Phase times differ between flatground and grinds; start the new one from its setup.
    setInspectionTime(0);
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">S/R</span>
          <div><h1>Animation studio</h1>
          <p>Skate Robot / Motion playground</p></div>
        </div>
        <div className={styles.stanceRow}>
          {APP_MODES.map((mode) => (
            <button
              key={mode.id}
              className={`${styles.stanceBtn} ${appMode === mode.id ? styles.stanceBtnActive : ''}`}
              onClick={() => setAppMode(mode.id)}
              aria-pressed={appMode === mode.id}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </header>

      {appMode === 'blender' ? (
        <Suspense fallback={<p className={styles.placeholder}>Loading Blender prototype…</p>}>
          <BlenderPrototype />
        </Suspense>
      ) : appMode === 'sheet' ? (
        <ContactSheet />
      ) : (
        <main className={styles.workbench}>
      <section className={styles.card}>
        <div>
          <h2 className={styles.sectionTitle}>Robot</h2>
          <div className={styles.robotRow}>
            {ROBOTS.map((r) => (
              <button
                key={r.id}
                className={`${styles.robotOption} ${selectedRobotId === r.id ? styles.robotOptionActive : ''}`}
                onClick={() => selectRobot(r.id)}
                aria-pressed={selectedRobotId === r.id}
              >
                <RobotAvatar robot={r} size={56} />
                <span className={styles.robotName}>{r.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className={styles.styleHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Skate style</h2>
              <p className={styles.styleNote}>Scene + New 3D · values are multipliers</p>
            </div>
            <button className={styles.resetStyleBtn} onClick={resetSkateStyle} type="button">
              Reset preset
            </button>
          </div>
          <div className={styles.styleControls}>
            {STYLE_CONTROLS.map((control) => {
              const bounds = SKATE_STYLE_BOUNDS[control.key];
              const value = skateStyle[control.key];
              return (
                <label className={styles.styleControl} key={control.key}>
                  <span className={styles.styleLabelRow}>
                    <span>
                      <strong>{control.label}</strong>
                      <small>{control.hint}</small>
                    </span>
                    <output htmlFor={`style-${control.key}`}>{value.toFixed(2)}×</output>
                  </span>
                  <input
                    id={`style-${control.key}`}
                    aria-label={control.label}
                    type="range"
                    min={bounds.min}
                    max={bounds.max}
                    step={0.01}
                    value={value}
                    onChange={(event) => updateSkateStyle(control.key, Number(event.target.value))}
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className={styles.sectionTitle}>Discipline</h2>
          <div className={styles.stanceRow}>
            {DISCIPLINES.map((option) => (
              <button
                key={option.id}
                className={`${styles.stanceBtn} ${discipline === option.id ? styles.stanceBtnActive : ''}`}
                onClick={() => changeDiscipline(option.id)}
                aria-pressed={discipline === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className={styles.sectionTitle}>Rider stance</h2>
          <div className={styles.stanceRow}>
            {RIDER_STANCES.map((stance) => (
              <button
                key={stance}
                className={`${styles.stanceBtn} ${selectedRiderStance === stance ? styles.stanceBtnActive : ''}`}
                onClick={() => setSelectedRiderStance(stance)}
                aria-pressed={selectedRiderStance === stance}
              >
                {stance}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className={styles.sectionTitle}>Trick stance</h2>
          <div className={styles.stanceRow}>
            {STANCES.map((stance) => (
              <button
                key={stance}
                className={`${styles.stanceBtn} ${selectedStance === stance ? styles.stanceBtnActive : ''}`}
                onClick={() => handleStanceChange(stance)}
                aria-pressed={selectedStance === stance}
              >
                {stance}
              </button>
            ))}
          </div>
        </div>

        {discipline === 'grinds' && <div>
          <h2 className={styles.sectionTitle}>Grind side</h2>
          <div className={styles.stanceRow}>
            {GRIND_SIDES.map((side) => (
              <button
                key={side}
                className={`${styles.stanceBtn} ${grindSide === side ? styles.stanceBtnActive : ''}`}
                onClick={() => setGrindSide(side)}
                aria-pressed={grindSide === side}
              >
                {side}
              </button>
            ))}
          </div>
        </div>}

        {discipline === 'grinds' && <div>
          <h2 className={styles.sectionTitle}>Trick into grind</h2>
          <p className={styles.styleNote}>Flips, shuvs, and spins, in the trick stance above</p>
          <select
            aria-label="Trick into grind"
            className={styles.trickSelect}
            value={entryTrick}
            onChange={(e) => setEntryTrick(e.target.value)}
          >
            <option value="">None (ollie on)</option>
            {GRIND_ENTRY_BASES.map((base) => (
              <option key={base} value={base}>
                {base}
              </option>
            ))}
          </select>
          {grindSpec?.reversed && <p className={styles.styleNote}>
            Spins them round: they roll in with the bar on the {grindSpec.toesideApproach ? 'toeside' : 'heelside'} and
            ride the {grindSide.toLowerCase()} {selectedGrind.toLowerCase()} fakie
          </p>}
        </div>}

        <div>
          <h2 className={styles.sectionTitle}>{discipline === 'grinds' ? 'Grind' : 'Trick'}</h2>
          {discipline === 'grinds' ? (
            <select
              aria-label="Grind"
              className={styles.trickSelect}
              value={selectedGrind}
              onChange={(e) => selectGrind(e.target.value)}
            >
              {GRIND_BASES.map((base) => (
                <option key={base} value={base}>
                  {base}
                </option>
              ))}
            </select>
          ) : (
            <select
              aria-label="Trick"
              className={styles.trickSelect}
              value={currentTrick?.base ?? ''}
              onChange={(e) => setSelectedBase(e.target.value)}
            >
              {availableTricks.map((t) => (
                <option key={t.id} value={t.base}>
                  {t.base}
                </option>
              ))}
            </select>
          )}
        </div>

        {discipline === 'grinds' && <div>
          <h2 className={styles.sectionTitle}>Trick out of grind</h2>
          <p className={styles.styleNote}>{exitRule(exitEnds)}</p>
          <select
            aria-label="Trick out of grind"
            className={styles.trickSelect}
            value={exitTrick}
            onChange={(e) => setExitTrick(e.target.value)}
          >
            <option value="">None (pop off)</option>
            {POP_ENDS.map((end) => {
              const allowed = exitEnds.includes(end);
              return (
                <optgroup
                  key={end}
                  label={allowed ? POP_END_LABELS[end] : `${POP_END_LABELS[end]}: ${end} isn't on the bar`}
                  disabled={!allowed}
                >
                  {GRIND_EXIT_BASES.map((base) => (
                    <option key={base} value={exitValue({ base, end })}>
                      {end === 'nose' ? `Nollie ${base}` : base} out
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>}

        <div>
          <h2 className={styles.sectionTitle}>View</h2>
          {discipline === 'grinds' && <p className={styles.styleNote}>Grinds render in the Scene view only</p>}
          <div className={styles.speedRow}>
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`${styles.speedBtn} ${activeView === option.id ? styles.speedBtnActive : ''}`}
                onClick={() => setViewMode(option.id)}
                aria-pressed={activeView === option.id}
                disabled={discipline === 'grinds' && option.id !== 'scene'}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className={styles.sectionTitle}>Playback</h2>
          <div className={styles.speedRow}>
            {PLAYBACK_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`${styles.speedBtn} ${playbackMode === option.id ? styles.speedBtnActive : ''}`}
                onClick={() => setPlaybackMode(option.id)}
                aria-pressed={playbackMode === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {activeView !== '3d' && activeView !== 'scene' && <div>
          <h2 className={styles.sectionTitle}>Background</h2>
          <div className={styles.optionGrid}>
            {BACKGROUND_SCENE_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`${styles.optionBtn} ${backgroundSceneId === option.id ? styles.optionBtnActive : ''}`}
                onClick={() => setBackgroundSceneId(option.id)}
                aria-pressed={backgroundSceneId === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>}

        <div>
          <h2 className={styles.sectionTitle}>Fall</h2>
          <div className={styles.optionGrid}>
            {FALL_VARIANT_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`${styles.optionBtn} ${fallVariant === option.id ? styles.optionBtnActive : ''}`}
                onClick={() => setFallVariant(option.id)}
                aria-pressed={fallVariant === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.stage}>
        <div className={styles.stageHeading}>
          <div><span className={styles.eyebrow}>{robot.name} / {selectedRiderStance} rider</span>
          <h2>{currentTrick?.name ?? selectedBase}</h2></div>
          <span className={styles.stageBadge}>{activeView === 'scene' ? 'New scene' : activeView === '3d' ? '3D preview' : activeView === 'side' ? 'Side view' : 'Legacy 3D'}</span>
        </div>
        <div className={styles.viewport}>
        {
          <>
            {activeView === 'scene' ? (
              <TrickScene
                key={animationKey}
                robot={previewRobot}
                trick={currentTrick ?? { id: 'kickflip-regular', name: 'Kickflip', base: 'Kickflip', stance: 'regular' }}
                landed={landed ?? true}
                fixedTime={inspectionTime ?? undefined}
                playbackRate={playbackRate}
                showSpeedToggle={false}
                fallVariant={fallVariant}
                riderStance={selectedRiderStance}
                paused={paused}
                onDone={() => {}}
              />
            ) : activeView === '3d' || activeView === '3d-legacy' ? (
              activeView === '3d' ? (
              <TrickAnimation3D
                key={animationKey}
                robot={previewRobot}
                trick={currentTrick ?? { id: 'kickflip-regular', name: 'Kickflip', base: 'Kickflip', stance: 'regular' }}
                landed={landed ?? true}
                fixedTime={inspectionTime ?? undefined}
                playbackRate={playbackRate}
                showSpeedToggle={false}
                backgroundSceneId={backgroundSceneId}
                fallVariant={fallVariant}
                riderStance={selectedRiderStance}
                paused={paused}
                onDone={() => {}}
              />
              ) : (
              <TrickAnimation3DLegacy
                key={animationKey}
                robot={previewRobot}
                trick={currentTrick ?? { id: 'kickflip-regular', name: 'Kickflip', base: 'Kickflip', stance: 'regular' }}
                landed={landed ?? true}
                fixedTime={inspectionTime ?? undefined}
                playbackRate={playbackRate}
                showSpeedToggle={false}
                backgroundSceneId={backgroundSceneId}
                fallVariant={fallVariant}
                riderStance={selectedRiderStance}
                paused={paused}
                onDone={() => {}}
              />
              )
            ) : (
              <TrickAnimation
                key={animationKey}
                robot={previewRobot}
                trick={currentTrick ?? { id: 'kickflip-regular', name: 'Kickflip', base: 'Kickflip', stance: 'regular' }}
                landed={landed ?? true}
                fixedTime={inspectionTime ?? undefined}
                playbackRate={playbackRate}
                backgroundSceneId={backgroundSceneId}
                fallVariant={fallVariant}
                riderStance={selectedRiderStance}
                paused={paused}
                onDone={() => {}}
              />
            )}
          </>
        }
        </div>

        <div className={styles.transport}>
          <div className={styles.timelineHeader}>
            <span>{inspectionTime !== null ? 'Frame inspection' : paused ? 'Paused' : 'Playback'} · {landed === false ? 'Fall' : 'Land'}</span>
            <button className={styles.resetStyleBtn} onClick={() => setInspectionTime(0)}>Inspect frames</button>
          </div>
          <input className={styles.timeline} aria-label="Animation frame" type="range" min={0} max={duration} step={0.01}
            value={inspectionTime ?? 0} onChange={(event) => setInspectionTime(Number(event.target.value))} />
          <div className={styles.phaseRow}>
            {phases.map((phase) => <button key={phase.label} aria-pressed={inspectionTime !== null && Math.abs(inspectionTime - phase.time) < 0.02}
              onClick={() => setInspectionTime(phase.time)}>{phase.label}</button>)}
          </div>

        <div className={styles.actionRow}>
          <button className={`${styles.actionBtn} ${styles.land}`} onClick={() => play(true)}>
            Land
          </button>
          <button className={`${styles.actionBtn} ${styles.fall}`} onClick={() => play(false)}>
            Fall
          </button>
          <button
            className={`${styles.actionBtn} ${styles.replay}`}
            onClick={replay}
          >
            Replay
          </button>
          <button
            className={`${styles.actionBtn} ${styles.pause}`}
            onClick={() => setPaused((p) => !p)}
            disabled={landed === null || inspectionTime !== null}
            aria-pressed={paused}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
        </div>
      </section>

      <section className={styles.paramsPanel}>
        <div className={styles.paramsHeader}>
          <h2 className={styles.paramsTitle}>Animation parameters</h2>
          <button className={styles.copyBtn} onClick={copyParams}>
            {copyLabel}
          </button>
        </div>
        <details><summary>View parameter JSON</summary><pre className={styles.paramsCode}>{paramsText}</pre></details>
      </section>
        </main>
      )}
    </div>
  );
}
