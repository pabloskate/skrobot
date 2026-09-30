import { memo, useMemo, useState, type CSSProperties } from 'react';
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
import { GRIND_BASES, GRIND_ENTRY_BASES, GRIND_SIDES, ROBOTS, grindTrick, tricksForStance } from './data';
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
type View = 'scene' | '3d' | 'side';
type ViewMode = View | 'both';
type Outcome = 'landed' | FallVariant;

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

/** A trick popped into the grind puts its second frame mid-trick, not just mid-hop. */
const grindLabels = (landed: boolean, entry: boolean) =>
  GRIND_LABELS[landed ? 'landed' : 'fall'].map((label, i) => (entry && i === 1 ? 'trick' : label));

function grindPhases(tl: GrindTimeline, labels: string[]): Phase[] {
  const up = tl.trick ?? (tl.pop + tl.lock) / 2;
  const times = tl.fail === null
    ? [tl.pop, up, tl.lock, (tl.lock + tl.off) / 2, (tl.off + tl.land) / 2, tl.end]
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

/** Memoized so filter keystrokes only re-render rows that actually change. */
const Cell = memo(function Cell({ view, robot, trick, landed, fallVariant, riderStance, fixedTime }: CellProps) {
  const Renderer = view === 'scene' ? TrickScene : view === '3d' ? TrickAnimation3D : TrickAnimation;
  return (
    <div className={styles.cell}>
      <Renderer
        robot={robot}
        trick={trick}
        landed={landed}
        fallVariant={fallVariant}
        riderStance={riderStance}
        backgroundSceneId="park"
        fixedTime={fixedTime}
        onDone={noop}
      />
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

  const robot = ROBOTS.find((r) => r.id === robotId) ?? ROBOTS[0];
  const landed = outcome === 'landed';
  const fallVariant: FallVariant = landed ? 'slam' : outcome;
  const phases = useMemo(() => phasesFor(landed), [landed]);

  const grinds = discipline === 'grinds';
  const tricks = useMemo(() => {
    const all = grinds
      ? GRIND_BASES.flatMap((base) => GRIND_SIDES.map((side) => grindTrick(base, side, stance, entry || undefined)))
      : tricksForStance(stance);
    const query = filter.trim().toLowerCase();
    return query ? all.filter((t) => t.base.toLowerCase().includes(query)) : all;
  }, [grinds, stance, entry, filter]);

  const riders: RiderStance[] = riderMode === 'both' ? ['regular', 'goofy'] : [riderMode];
  // Grinds need the bar, and only the Scene renderer has one.
  const views: View[] = grinds ? ['scene'] : viewMode === 'both' ? ['3d', 'side'] : [viewMode];
  const rowPhases = (trick: Trick, rider: RiderStance): Phase[] => {
    const tl = grinds ? grindTimelineFor(trick, rider, robot.skateStyle, landed, fallVariant) : null;
    return tl ? grindPhases(tl, grindLabels(landed, entry !== '')) : phases;
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

          {!grinds && <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>View</span>
            <div className={playgroundStyles.stanceRow}>
              {(['scene', '3d', 'side', 'both'] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  className={`${playgroundStyles.stanceBtn} ${viewMode === v ? playgroundStyles.stanceBtnActive : ''}`}
                  onClick={() => setViewMode(v)}
                  aria-pressed={viewMode === v}
                >
                  {v === 'side' ? '2D' : v === 'both' ? '3d + 2D' : v}
                </button>
              ))}
            </div>
          </div>}

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
                {grinds ? grindLabels(landed, entry !== '')[i] : phase.label}
                {!grinds && <small>t = {phase.t.toFixed(2)}s</small>}
              </div>
            ))}
            {tricks.map((trick) =>
              riders.map((rider) =>
                views.map((view) => (
                  <div style={{ display: 'contents' }} key={`${trick.id}:${rider}:${view}`}>
                    <div className={styles.labelCell}>
                      <span>{trick.base}</span>
                      {(riders.length > 1 || views.length > 1) && (
                        <span className={styles.labelBadge}>
                          {riders.length > 1 ? rider : ''}
                          {riders.length > 1 && views.length > 1 ? ' · ' : ''}
                          {views.length > 1 ? (view === 'side' ? '2D' : '3D') : ''}
                        </span>
                      )}
                    </div>
                    {rowPhases(trick, rider).map((phase) => (
                      <Cell
                        key={`${trick.id}:${rider}:${view}:${phase.label}`}
                        view={view}
                        robot={robot}
                        trick={trick}
                        landed={landed}
                        fallVariant={fallVariant}
                        riderStance={rider}
                        fixedTime={phase.t}
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
