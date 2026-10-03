import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  FALL_T,
  FALL_VARIANT_OPTIONS,
  FLIP_T,
  LAND_T,
  ROLL_IN,
  TrickAnimation,
  TrickAnimation3D,
  TrickScene,
  grindTimelineFor,
  type FallVariant,
  type GrindTimeline,
  type RiderStance,
  type Robot,
  type Stance,
  type Trick,
} from '@skrobot/animations';
import { TrickScene3D } from '@skrobot/animations/three';
import {
  GRIND_BASES,
  GRIND_ENTRY_BASES,
  GRIND_EXIT_BASES,
  GRIND_SIDES,
  ROBOTS,
  exitEndsFor,
  grindTrick,
  tricksForStance,
} from './data';
import playgroundStyles from './Playground.module.css';
import styles from './ContactSheet.module.css';

/**
 * Contact sheet: every trick rendered as a row of frozen key frames, so one
 * page shows the whole catalog at the moments where bugs live (wind-up, pop,
 * peak, catch, touch down, ride away / fall). Made for eyeballing regressions
 * after animation changes — and for agents to screenshot and diff.
 */

const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];

type Discipline = 'flatground' | 'grinds';
type RiderMode = RiderStance | 'both';
type View = 'scene' | 'webgl' | '3d' | 'side';
type ViewMode = View | 'both' | 'compare';
type Outcome = 'landed' | FallVariant;

const VIEW_LABELS: Record<ViewMode, string> = {
  scene: 'SVG scene',
  webgl: 'WebGL 3D',
  '3d': '3D SVG',
  side: '2D SVG',
  both: '3D SVG + 2D',
  compare: 'WebGL + SVG scene',
};

interface Phase {
  label: string;
  t: number;
}

function phasesFor(landed: boolean): Phase[] {
  const tail = landed ? LAND_T : FALL_T;
  return [
    { label: 'wind-up', t: ROLL_IN * 0.45 },
    { label: 'pop', t: ROLL_IN + FLIP_T * 0.1 },
    { label: 'peak', t: ROLL_IN + FLIP_T * 0.5 },
    { label: 'catch', t: ROLL_IN + FLIP_T * 0.88 },
    { label: landed ? 'touch down' : 'falling', t: ROLL_IN + FLIP_T + tail * 0.35 },
    { label: landed ? 'ride away' : 'settled', t: ROLL_IN + FLIP_T + tail },
  ];
}

/** Grind frames sit at each trick's own moments, so the header only names them. */
const GRIND_LABELS = {
  landed: ['pop', 'up', 'lock', 'hold', 'pop off', 'ride away'],
  fall: ['pop', 'up', 'lock', 'slip', 'falling', 'settled'],
};

/**
 * A trick popped into the grind puts its second frame mid-trick, not just
 * mid-hop; one popped out of it does the same for the pop off.
 */
const grindLabels = (landed: boolean, entry: boolean, exit: boolean) =>
  GRIND_LABELS[landed ? 'landed' : 'fall'].map((label, i) =>
    entry && i === 1 ? 'trick in' : exit && landed && i === 4 ? 'trick out' : label);

function grindPhases(tl: GrindTimeline, labels: string[]): Phase[] {
  const up = tl.trickIn ?? (tl.pop + tl.lock) / 2;
  const off = tl.trickOut ?? (tl.off + tl.land) / 2;
  const times = tl.fail === null
    ? [tl.pop, up, tl.lock, (tl.lock + tl.off) / 2, off, tl.end]
    : [tl.pop, up, tl.lock, tl.fail + 0.05, tl.fail + (tl.end - tl.fail) * 0.35, tl.end];
  return times.map((t, i) => ({ label: labels[i], t }));
}

const noop = () => {};

interface CellProps {
  view: View;
  robot: Robot;
  trick: Trick;
  landed: boolean;
  fallVariant: FallVariant;
  riderStance: RiderStance;
  fixedTime: number;
}

interface CaptureProps {
  captureActive: boolean;
  captureBatch: string;
  captureIndex: number;
  onCaptured: (batch: string, index: number) => void;
}

/**
 * Hundreds of live WebGL canvases would exhaust the browser's context limit.
 * Draw one cell at a time, save its frozen frame, then release its context.
 * Read the canvas in the same effect flush as the renderer's draw: its default
 * drawing buffer is cleared once the browser presents that frame.
 */
const FrozenWebGLCell = memo(function FrozenWebGLCell({
  robot, trick, landed, fallVariant, riderStance, fixedTime,
  captureActive, captureBatch, captureIndex, onCaptured,
}: CellProps & CaptureProps) {
  const host = useRef<HTMLDivElement>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!captureActive) return;
    const canvas = host.current?.querySelector('canvas');
    const unavailable = host.current?.querySelector('p:not([hidden])');
    const context = canvas?.getContext('webgl2');
    if (!canvas || !context || unavailable) {
      setFailed(true);
    } else {
      try {
        setPicture(canvas.toDataURL('image/png'));
      } catch {
        setFailed(true);
      }
    }
    // Advance after React has replaced this canvas with the captured image.
    // Yielding also keeps a long contact-sheet capture responsive to controls.
    const next = window.setTimeout(() => {
      context?.getExtension('WEBGL_lose_context')?.loseContext();
      onCaptured(captureBatch, captureIndex);
    }, 0);
    return () => window.clearTimeout(next);
  }, [captureActive, captureBatch, captureIndex, onCaptured]);

  return (
    <div
      ref={host}
      data-renderer="three"
      data-time={fixedTime.toFixed(3)}
      style={{ width: '100%', aspectRatio: '500 / 404' }}
    >
      {picture ? (
        <img
          src={picture}
          alt={`${trick.name}, ${riderStance} rider, at ${fixedTime.toFixed(2)} seconds`}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      ) : failed ? (
        <p role="status">WebGL frame unavailable.</p>
      ) : captureActive ? (
        <TrickScene3D
          robot={robot}
          trick={trick}
          landed={landed}
          fallVariant={fallVariant}
          riderStance={riderStance}
          fixedTime={fixedTime}
          onDone={noop}
        />
      ) : (
        <span style={{ fontSize: 12, opacity: 0.6 }}>Waiting for 3D frame…</span>
      )}
    </div>
  );
});

/** Memoized so filter keystrokes only re-render rows that actually change. */
const Cell = memo(function Cell(props: CellProps & CaptureProps) {
  const { view, robot, trick, landed, fallVariant, riderStance, fixedTime } = props;
  const Renderer = view === 'scene' ? TrickScene : view === '3d' ? TrickAnimation3D : TrickAnimation;
  return (
    <div
      className={styles.cell}
      data-view={view}
      data-rider-stance={riderStance}
      data-trick={trick.id}
      style={view === 'webgl' && props.captureActive ? { contentVisibility: 'visible' } : undefined}
    >
      {view === 'webgl' ? <FrozenWebGLCell {...props} /> : <Renderer
        robot={robot}
        trick={trick}
        landed={landed}
        fallVariant={fallVariant}
        riderStance={riderStance}
        backgroundSceneId="park"
        fixedTime={fixedTime}
        onDone={noop}
      />}
    </div>
  );
});

export default function ContactSheet() {
  const [discipline, setDiscipline] = useState<Discipline>('flatground');
  const [stance, setStance] = useState<Stance>('regular');
  const [riderMode, setRiderMode] = useState<RiderMode>('regular');
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const [outcome, setOutcome] = useState<Outcome>('landed');
  const [robotId, setRobotId] = useState(ROBOTS[0].id);
  const [filter, setFilter] = useState('');
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [captureProgress, setCaptureProgress] = useState({ batch: '', index: 0 });
  const onCaptured = useCallback((batch: string, index: number) => {
    setCaptureProgress((current) => {
      const currentIndex = current.batch === batch ? current.index : 0;
      return currentIndex === index ? { batch, index: index + 1 } : current;
    });
  }, []);

  const robot = ROBOTS.find((r) => r.id === robotId) ?? ROBOTS[0];
  const landed = outcome === 'landed';
  const fallVariant: FallVariant = landed ? 'slam' : outcome;
  const phases = useMemo(() => phasesFor(landed), [landed]);

  const grinds = discipline === 'grinds';
  const tricks = useMemo(() => {
    const all = grinds
      ? GRIND_BASES.flatMap((base) => GRIND_SIDES.map((side) => grindTrick(
        base, side, stance, entry || undefined,
        // Each grind pops the trick out off the tail if it rides it, else off the nose.
        exit ? { base: exit, end: exitEndsFor(base)[0] } : undefined,
      )))
      : tricksForStance(stance);
    const query = filter.trim().toLowerCase();
    return query ? all.filter((t) => t.base.toLowerCase().includes(query)) : all;
  }, [grinds, stance, entry, exit, filter]);

  const riders: RiderStance[] = riderMode === 'both' ? ['regular', 'goofy'] : [riderMode];
  const activeViewMode = grinds && (viewMode === '3d' || viewMode === 'side' || viewMode === 'both') ? 'scene' : viewMode;
  // Both scene renderers include the bar; the earlier SVG views do not.
  const views: View[] = activeViewMode === 'compare' ? ['webgl', 'scene']
    : activeViewMode === 'both' ? ['3d', 'side'] : [activeViewMode];
  const captureBatch = JSON.stringify([robotId, discipline, stance, riderMode, viewMode, outcome, entry, exit, filter]);
  const captureIndex = captureProgress.batch === captureBatch ? captureProgress.index : 0;
  const captureCount = views.includes('webgl') ? tricks.length * riders.length * phases.length : 0;
  if (captureProgress.batch !== captureBatch) {
    setCaptureProgress({ batch: captureBatch, index: 0 });
  }
  const rowPhases = (trick: Trick, rider: RiderStance): Phase[] => {
    const tl = grinds ? grindTimelineFor(trick, rider, robot.skateStyle, landed, fallVariant) : null;
    return tl ? grindPhases(tl, grindLabels(landed, entry !== '', exit !== '')) : phases;
  };
  const rowsPerTrick = riders.length * views.length;

  return (
    <div className={styles.wrap}>
      <section className={playgroundStyles.card}>
        <div className={styles.controls}>
          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>Discipline</span>
            <div className={playgroundStyles.stanceRow}>
              {(['flatground', 'grinds'] as Discipline[]).map((d) => (
                <button
                  key={d}
                  className={`${playgroundStyles.stanceBtn} ${discipline === d ? playgroundStyles.stanceBtnActive : ''}`}
                  onClick={() => setDiscipline(d)}
                  aria-pressed={discipline === d}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {grinds && <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>Trick into grind</span>
            <select
              className={playgroundStyles.trickSelect}
              aria-label="Trick into grind"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
            >
              <option value="">None (ollie on)</option>
              {GRIND_ENTRY_BASES.map((base) => (
                <option key={base} value={base}>{base}</option>
              ))}
            </select>
          </div>}

          {grinds && <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>Trick out of grind</span>
            <select
              className={playgroundStyles.trickSelect}
              aria-label="Trick out of grind"
              title="Off the tail where the grind rides it, else off the nose (nollie)"
              value={exit}
              onChange={(e) => setExit(e.target.value)}
            >
              <option value="">None (pop off)</option>
              {GRIND_EXIT_BASES.map((base) => (
                <option key={base} value={base}>{base} out</option>
              ))}
            </select>
          </div>}

          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>Trick stance</span>
            <div className={playgroundStyles.stanceRow}>
              {STANCES.map((s) => (
                <button
                  key={s}
                  className={`${playgroundStyles.stanceBtn} ${stance === s ? playgroundStyles.stanceBtnActive : ''}`}
                  onClick={() => setStance(s)}
                  aria-pressed={stance === s}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>Rider</span>
            <div className={playgroundStyles.stanceRow}>
              {(['regular', 'goofy', 'both'] as RiderMode[]).map((r) => (
                <button
                  key={r}
                  className={`${playgroundStyles.stanceBtn} ${riderMode === r ? playgroundStyles.stanceBtnActive : ''}`}
                  onClick={() => setRiderMode(r)}
                  aria-pressed={riderMode === r}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>View</span>
            <div className={playgroundStyles.stanceRow}>
              {(grinds
                ? ['scene', 'webgl', 'compare'] as ViewMode[]
                : ['scene', 'webgl', 'compare', '3d', 'side', 'both'] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  className={`${playgroundStyles.stanceBtn} ${activeViewMode === v ? playgroundStyles.stanceBtnActive : ''}`}
                  onClick={() => setViewMode(v)}
                  aria-pressed={activeViewMode === v}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>Outcome</span>
            <div className={playgroundStyles.stanceRow}>
              <button
                className={`${playgroundStyles.stanceBtn} ${outcome === 'landed' ? playgroundStyles.stanceBtnActive : ''}`}
                onClick={() => setOutcome('landed')}
                aria-pressed={outcome === 'landed'}
              >
                landed
              </button>
              {FALL_VARIANT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`${playgroundStyles.stanceBtn} ${outcome === option.id ? playgroundStyles.stanceBtnActive : ''}`}
                  onClick={() => setOutcome(option.id)}
                  aria-pressed={outcome === option.id}
                >
                  {option.label.toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>Robot</span>
            <select
              className={playgroundStyles.trickSelect}
              value={robotId}
              onChange={(e) => setRobotId(e.target.value)}
            >
              {ROBOTS.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>Filter tricks</span>
            <input
              className={styles.filterInput}
              type="search"
              placeholder="e.g. heelflip, bigspin…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>
        <p className={styles.meta}>
          {tricks.length} tricks × {rowsPerTrick} row{rowsPerTrick > 1 ? 's' : ''} × {phases.length} frames
          = {tricks.length * rowsPerTrick * phases.length} cells
          {captureCount > 0 && ` · WebGL frames: ${Math.min(captureIndex, captureCount)}/${captureCount}`}
        </p>
      </section>

      <div className={styles.sheet}>
        {tricks.length === 0 ? (
          <p className={styles.empty}>No tricks match “{filter}”.</p>
        ) : (
          <div className={styles.grid} style={{ '--phase-count': phases.length } as CSSProperties}>
            <div className={styles.headCell}>Trick</div>
            {phases.map((phase, i) => (
              <div key={phase.label} className={styles.headCell}>
                {grinds ? grindLabels(landed, entry !== '', exit !== '')[i] : phase.label}
                {!grinds && <small>t = {phase.t.toFixed(2)}s</small>}
              </div>
            ))}
            {tricks.map((trick, trickIndex) =>
              riders.map((rider, riderIndex) =>
                views.map((view) => (
                  <div style={{ display: 'contents' }} key={`${captureBatch}:${trick.id}:${rider}:${view}`}>
                    <div className={styles.labelCell}>
                      <span>{trick.base}</span>
                      {(riders.length > 1 || views.length > 1) && (
                        <span className={styles.labelBadge}>
                          {riders.length > 1 ? rider : ''}
                          {riders.length > 1 && views.length > 1 ? ' · ' : ''}
                          {views.length > 1 ? VIEW_LABELS[view] : ''}
                        </span>
                      )}
                    </div>
                    {rowPhases(trick, rider).map((phase, phaseIndex) => (
                      <Cell
                        key={`${trick.id}:${rider}:${view}:${phase.label}`}
                        view={view}
                        robot={robot}
                        trick={trick}
                        landed={landed}
                        fallVariant={fallVariant}
                        riderStance={rider}
                        fixedTime={phase.t}
                        captureActive={view === 'webgl' && captureIndex === (trickIndex * riders.length + riderIndex) * phases.length + phaseIndex}
                        captureBatch={captureBatch}
                        captureIndex={(trickIndex * riders.length + riderIndex) * phases.length + phaseIndex}
                        onCaptured={onCaptured}
                      />
                    ))}
                  </div>
                ))
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
