import {
  DEFAULT_SCENE_CAMERA,
  FOOT,
  GRIND_BASES,
  GRIND_EXIT_TRICKS,
  KICK_OUT_DROP_T,
  SCENE_ORBIT_BOUNDS,
  SCENE_ZOOM,
  STAGE_SETS,
  SKATERS,
  canEnterGrind,
  hasObstacle,
  railLineFor,
  railApproachAllowed,
  setGrindSpec,
  setHandrail,
  setInfo,
  tripodSide,
  canExitGrind,
  clampOrbitCamera,
  clampTripodPan,
  clampZoom,
  exitEndsFor,
  grindSpecFor,
  grindTimelineFor,
  joinGrindBase,
  railBailTimelineFor,
  joinGrindExit,
  specFor,
  setTimeline,
  flatTimeline,
  wrapOrbitYaw,
  type CameraSide,
  type Obstacle,
  type PopEnd,
  type RailBail,
  type RailChoice,
  type RailLine,
  type RiderStance,
  type SceneCamera,
  type SkateStyle,
  type Skater,
  type StageSet,
  type TripodId,
  type TripodPan,
} from '@skrobot/animations';
import {
  TRICKS,
  TRICK_BY_NAME,
  trickDescription,
  trickDiscipline,
  trickMatchesSearch,
  type Stance,
  type Trick,
} from '@/features/tricks';

/**
 * The Trick Explorer's model: what's on the stage (one flatground trick, or a
 * grind with optional tricks popped into and out of it), where the camera
 * films it from, and how that state round-trips through a shareable URL.
 * The animation package decides what can be animated; the trick catalog
 * names and describes it.
 */

export type ExplorerMode = 'flatground' | 'grinds';
export type GrindSide = 'Frontside' | 'Backside';
export type { CameraSide };

/** A trick popped out of a grind, and the end of the board it pops off. */
export interface GrindOut {
  base: string;
  end: PopEnd;
}

export type CameraPresetId =
  | 'classic' | 'side' | 'head-on' | 'follow' | 'overhead' | 'fisheye' | 'long-lens' | 'bottom-center' | 'bottom-right'
  | 'tripod-bottom' | 'tripod-side' | 'tripod-top';

export interface ExplorerState {
  mode: ExplorerMode;
  /** How the trick is ridden: regular, fakie, switch, or nollie. */
  stance: Stance;
  /** The rider's natural footing. */
  rider: RiderStance;
  /** Flatground trick base, e.g. "Kickflip". */
  trick: string;
  /** Grind base, e.g. "Lipslide". */
  grind: string;
  side: GrindSide;
  /** Trick popped into the grind; null ollies on. */
  into: string | null;
  /** Trick popped out of the grind; null pops off plain. */
  out: GrindOut | null;
  /** A named angle, or a custom one the viewer dragged to. */
  camera: CameraPresetId | SceneCamera;
  /**
   * On a shot with sides (a tripod, the side-on crane), which side of the
   * rider's line the viewer asked to film from; omitted, wherever the shot
   * stands (filmingSide). Other shots ignore it.
   */
  cameraSide?: CameraSide;
  /** On a tripod shot, how far the viewer turned its head off the rider; none keeps it on them. */
  pan?: TripodPan;
  /** How far in the picture is magnified, whatever the angle: 1 is the stock framing. */
  zoom: number;
  /** The spot the rider skates, with terrain and supported obstacles from the shared set registry. */
  set: StageSet;
  /** At a spot with several handrails, which one a grind rides: the center one, or the side one the trick's approach takes. */
  rail: RailChoice;
  /** At a spot with more than one way down, what a flatground trick goes over: its stairs, or (Hollywood) the fence beside them. */
  obstacle: Obstacle;
  /** Who skates it: the robot, the realistic human, or the alien. */
  skater: Skater;
  /** How the attempt is missed instead (see Outcome), where the mode has that miss. Null lands it. */
  fall: Outcome | null;
}

/**
 * How an attempt ends when it isn't landed: a flatground or gap trick caught wrong and kicked out; a grind jumped off,
 * forward along the rail or out to the side, and rolled out.
 */
export type Outcome = 'kickout' | 'jump-forward' | 'jump-side';

export interface OutcomeOption {
  fall: Outcome | null;
  label: string;
  /** What happens, in a few words. */
  hint: string;
}

const LANDED: OutcomeOption = { fall: null, label: 'Land', hint: 'ridden away' };
const OUTCOME_OPTIONS: Record<ExplorerMode, readonly OutcomeOption[]> = {
  flatground: [LANDED, { fall: 'kickout', label: 'Kick out', hint: 'caught wrong, kicked away' }],
  grinds: [
    LANDED,
    { fall: 'jump-forward', label: 'Jump forward', hint: 'jumped off ahead, rolled out' },
    { fall: 'jump-side', label: 'Jump aside', hint: 'jumped off the side, rolled out' },
  ],
};

/** The ways an attempt can end in this mode. */
export const outcomeOptions = (mode: ExplorerMode): readonly OutcomeOption[] => OUTCOME_OPTIONS[mode];

/** How the attempt on the stage ends: its outcome if the mode has it, else landed. */
export function outcomeOf(state: Pick<ExplorerState, 'mode' | 'fall'>): Outcome | null {
  return OUTCOME_OPTIONS[state.mode].some((option) => option.fall === state.fall) ? state.fall : null;
}

const RAIL_BAILS: Partial<Record<Outcome, RailBail>> = { 'jump-forward': 'forward', 'jump-side': 'side' };

/** What the stage is told of an outcome: landed or not, the miss, and which way off a rail. */
export function stageOutcome(fall: Outcome | null): { landed: boolean; fallVariant?: 'kickout'; railBail?: RailBail } {
  if (fall == null) return { landed: true };
  return { landed: false, fallVariant: 'kickout', railBail: RAIL_BAILS[fall] };
}

export const STANCES: readonly Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
export const RIDERS: readonly RiderStance[] = ['regular', 'goofy'];
export const GRIND_SIDES: readonly GrindSide[] = ['Frontside', 'Backside'];

const FLATGROUND = TRICKS.filter((t) => t.category === 'flatground');
const regularOf = (base: string) => FLATGROUND.find((t) => t.base === base && t.stance === 'regular');

/** Every flatground trick base, in catalog order. */
export const FLATGROUND_BASES: readonly string[] = FLATGROUND.filter((t) => t.stance === 'regular').map((t) => t.base);

export interface TrickTier {
  label: string;
  bases: readonly string[];
}

/** Flatground bases grouped the way they're learned, by base difficulty. */
export const FLATGROUND_TIERS: readonly TrickTier[] = (() => {
  const tiers: Array<{ label: string; upTo: number }> = [
    { label: 'Basics', upTo: 2 },
    { label: 'Flips & spins', upTo: 5 },
    { label: 'Tech', upTo: 7 },
    { label: 'Pro', upTo: Infinity },
  ];
  let from = -Infinity;
  return tiers.map(({ label, upTo }) => {
    const bases = FLATGROUND_BASES
      .filter((base) => {
        const difficulty = regularOf(base)?.baseDifficulty ?? 0;
        return difficulty > from && difficulty <= upTo;
      })
      .sort((a, b) => (regularOf(a)?.baseDifficulty ?? 0) - (regularOf(b)?.baseDifficulty ?? 0));
    from = upTo;
    return { label, bases };
  });
})();

/** The catalog's own trick for a flatground base in a stance ("Half Cab", "Nollie Kickflip"). */
export function flatgroundTrick(base: string, stance: Stance): Trick {
  return FLATGROUND.find((t) => t.base === base && t.stance === stance) ?? FLATGROUND[0];
}

/** Every grind and slide the stage can animate, easiest first. */
export const GRIND_CHOICES: readonly string[] = [...GRIND_BASES].sort(
  (a, b) => (TRICK_BY_NAME.get(a)?.difficulty ?? 10) - (TRICK_BY_NAME.get(b)?.difficulty ?? 10),
);

const isSlide = (grind: string) => {
  const trick = TRICK_BY_NAME.get(grind);
  return trick != null && trickDiscipline(trick) === 'slide';
};

/** The grinds on the trucks, then the slides on the deck, each easiest first. */
export const GRIND_TIERS: readonly TrickTier[] = [
  { label: 'Grinds', bases: GRIND_CHOICES.filter((grind) => !isSlide(grind)) },
  { label: 'Slides', bases: GRIND_CHOICES.filter(isSlide) },
];

/** Whether a grind answers a search, by its name or what skaters call it ("crooks", "50 50"). */
export function grindMatchesSearch(grind: string, query: string): boolean {
  const trick = TRICK_BY_NAME.get(grind);
  return trick ? trickMatchesSearch(trick, query) : grind.toLowerCase().includes(query.trim().toLowerCase());
}

/** Flatground tricks that can be popped into a grind. */
export const INTO_CHOICES: readonly string[] = FLATGROUND_BASES.filter(canEnterGrind);

/** The tricks that can be popped into a grind, grouped the way flatground tricks are. */
export const INTO_TIERS: readonly TrickTier[] = FLATGROUND_TIERS
  .map(({ label, bases }) => ({ label, bases: bases.filter((base) => INTO_CHOICES.includes(base)) }))
  .filter((tier) => tier.bases.length > 0);

/** Tricks offered out of a grind: the ones the animation package verifies off both ends, not the whole catalog. */
export const OUT_CHOICES: readonly string[] = GRIND_EXIT_TRICKS.filter(canExitGrind);

/** The ends a trick out of this grind can pop off: only an end that's on the bar. */
export const outEndsFor = (grind: string): readonly PopEnd[] => exitEndsFor(grind);

/** A grind's 1–10 difficulty from the catalog, or null for one it doesn't list. */
export const grindDifficulty = (grind: string): number | null => TRICK_BY_NAME.get(grind)?.difficulty ?? null;

/** The catalog's one-line description of a grind or slide. */
export function grindDescription(grind: string): string {
  const trick = TRICK_BY_NAME.get(grind);
  return trick ? trickDescription(trick) : '';
}

/**
 * Classic pulls back a little from the stock stage framing, so the spot reads
 * around the rider instead of the rider filling the stage.
 */
const CLASSIC_ZOOM = 0.9;

export const DEFAULT_STATE: Readonly<ExplorerState> = Object.freeze({
  mode: 'grinds',
  stance: 'regular',
  rider: 'regular',
  trick: 'Kickflip',
  grind: '50-50 Grind',
  side: 'Frontside',
  into: null,
  out: null,
  camera: 'classic',
  zoom: CLASSIC_ZOOM,
  set: 'waterfront',
  rail: 'center',
  obstacle: 'stairs',
  skater: 'robot',
  fall: null,
});

/** Move to another spot; gap-only spots open the saved gap trick, and an obstacle the new spot lacks goes back to its stairs. */
export function withSet(state: ExplorerState, set: StageSet): ExplorerState {
  return restrictRailApproach({
    ...state,
    set,
    mode: setInfo(set).grinds ? state.mode : 'flatground',
    fall: setInfo(set).grinds ? state.fall : outcomeOf({ mode: 'flatground', fall: state.fall }),
    rail: setInfo(set).rails?.fixedLine ? 'side' : setInfo(set).rails?.sideGrinds === false ? 'center' : state.rail,
    obstacle: hasObstacle(set, state.obstacle) ? state.obstacle : DEFAULT_STATE.obstacle,
  });
}

/** Whether the stage offers a choice of obstacle: a flatground trick at a spot with more than one way down. */
export const picksObstacle = (state: Pick<ExplorerState, 'mode' | 'set'>) =>
  state.mode === 'flatground' && (setInfo(state.set).obstacles?.length ?? 0) > 1;

/** Switch between gap/flatground tricks and grinds where the spot supports them. */
export function withMode(state: ExplorerState, mode: ExplorerMode): ExplorerState {
  const next = { ...state, mode: mode === 'grinds' && !setInfo(state.set).grinds ? 'flatground' as const : mode };
  // A miss the other mode doesn't have goes back to landed.
  return restrictRailApproach({ ...next, fall: outcomeOf(next) });
}

/** Keeps a trick out only if the grind rides the end it pops off. */
export function withGrind(state: ExplorerState, grind: string): ExplorerState {
  const out = state.out && outEndsFor(grind).includes(state.out.end) ? state.out : null;
  return restrictRailApproach({ ...state, grind, out });
}

// ----- Names -----

const STANCE_LEAD: Record<Stance, string> = { regular: '', fakie: 'Fakie ', switch: 'Switch ', nollie: 'Nollie ' };

/** The grind combo's base name as the animation package reads it. */
function grindBase(state: ExplorerState): string {
  const sided = `${state.side} ${state.grind}`;
  const out = state.out ? joinGrindExit(sided, state.out.base, state.out.end) : sided;
  return state.into ? joinGrindBase(state.into, out) : out;
}

/** How the rider gets on the bar: "Ollie on", "Switch Ollie on", "Nollie on", or the trick popped in ("Fakie Kickflip"). */
export function trickInName(state: ExplorerState): string {
  if (state.stance === 'nollie' && !state.into) return 'Nollie on';
  return `${STANCE_LEAD[state.stance]}${state.into ?? 'Ollie on'}`;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** The trick on the stage, shaped for TrickScene3D. */
export function stageTrick(state: ExplorerState): Pick<Trick, 'id' | 'name' | 'base' | 'stance'> {
  if (state.mode === 'flatground') return flatgroundTrick(state.trick, state.stance);
  const base = grindBase(state);
  return { id: `${slug(base)}-${state.stance}`, name: `${STANCE_LEAD[state.stance]}${base}`, base, stance: state.stance };
}

/** "Nollie Heelflip out" / "Pop Shuvit out". */
export const outName = (out: GrindOut) => `${out.end === 'nose' ? 'Nollie ' : ''}${out.base} out`;

/** "a Kickflip", "an Inward Heelflip", "an FS Bigspin". */
const withArticle = (name: string) => `${/^([aeiou]|fs\b)/i.test(name) ? 'an' : 'a'} ${name}`;

/**
 * The handrail a grind rides at a spot that has them: the center one, or
 * the side one (left or right going down) the trick's approach takes. Null
 * for flatground, or a spot that grinds a flat bar.
 */
export function railLine(state: ExplorerState): RailLine | null {
  return state.mode === 'grinds' ? railLineFor(state.set, stageTrick(state), state.rider, state.rail) : null;
}

/** Sides that can approach the selected spot’s rail. */
export function grindSidesFor(state: ExplorerState): readonly GrindSide[] {
  if (state.mode !== 'grinds') return GRIND_SIDES;
  return GRIND_SIDES.filter((side) => railApproachAllowed(state.set, stageTrick({ ...state, side }), state.rider));
}

/** Keep the trick on the accessible side when the spot, stance, rider or trick changes. */
export function restrictRailApproach(state: ExplorerState): ExplorerState {
  const sides = grindSidesFor(state);
  return sides.length && !sides.includes(state.side) ? { ...state, side: sides[0] } : state;
}

/** One step of a trick or combo, as a skater would call it. */
export interface TrickStep {
  label: string;
  detail: string;
}

/**
 * How the trick goes, step by step. A flatground trick is its catalog
 * description; a grind walks through the approach, the way on, the lock,
 * and the way off.
 */
export function trickSteps(state: ExplorerState): TrickStep[] {
  if (state.mode === 'flatground') {
    const trick = flatgroundTrick(state.trick, state.stance);
    const description = trickDescription(trick);
    return description ? [{ label: trick.name, detail: description }] : [];
  }
  const spec = setGrindSpec(state.set, stageTrick(state));
  if (!spec) return [];
  const riding = state.stance === 'regular' ? 'rolling' : `riding ${state.stance}`;
  const side = spec.toesideApproach ? 'toeside' : 'heelside';
  // At a spot with handrails the grind goes down one: the center one, or (El Toro) the side one it comes in toward.
  // At Miami it's one of the slab's edges, across the gap from the terrace.
  const line = railLine(state);
  const rail = line != null;
  const ledge = rail && setInfo(state.set).ledges != null;
  const bar = ledge ? `${line} edge` : line === 'left' || line === 'right' ? `${line} rail` : rail ? 'rail' : 'bar';
  const along = ledge ? 'edge' : 'rail';
  const steps: TrickStep[] = [
    {
      label: 'Approach',
      detail: ledge
        ? `Come in ${riding} along the deck with the slab’s ${bar} on your ${side}, then carve in toward it before the tip.`
        : `Come in ${riding} with the ${bar} on your ${side}${rail ? ', a little slower than you would to jump the set' : ''}.`,
    },
    state.into
      ? {
        label: state.into,
        detail: spec.reversed
          ? `Pop ${withArticle(state.into)} onto the ${bar}. It turns you round, so you lock in riding the other way.`
          : `Pop ${withArticle(state.into)} and catch it on the way onto the ${bar}.`,
      }
      : {
        label: state.stance === 'nollie' ? 'Nollie on' : 'Ollie on',
        detail: ledge
          ? 'Pop on the flat short of the rim and fly the gap, turning in the air to line up with the edge, and lock on a couple of feet below the apex.'
          : rail ? 'Pop as the rail starts beside you. Your speed carries you on while it drops away under the board, so lock on a few stairs down.' : 'Pop up and lock onto the bar.',
      },
    { label: `${state.side} ${state.grind}`, detail: `${grindDescription(state.grind)}${rail ? ` Stay over it as it picks up speed down the ${along}.` : ''}` },
    state.out
      ? {
        label: outName(state.out),
        detail: `Pop ${withArticle(`${state.out.end === 'nose' ? 'nollie ' : ''}${state.out.base}`)} off the ${state.out.end} as you leave the ${bar}.`,
      }
      : {
        label: 'Pop off',
        detail: ledge ? 'Pop off the low corner and ride away across the plaza.'
          : rail ? 'Pop off the bottom of the rail and ride away from the landing.' : 'Pop off the end of the bar and ride away.',
      },
  ];
  return steps;
}

// ----- Timeline -----

export interface Phase {
  label: string;
  time: number;
}

export interface Timeline {
  phases: Phase[];
  duration: number;
}

/** The moments worth jumping to, and how long the trick runs (seconds). */
export function timelineFor(state: ExplorerState, style: SkateStyle | undefined): Timeline {
  const kickOut = state.mode === 'flatground' && state.fall === 'kickout';
  if (state.mode === 'flatground') {
    // Down a drop the flight is the drop's; on flat ground the robot's own pop sets it.
    const drop = setInfo(state.set).terrain !== null;
    const tl = drop ? setTimeline(state.set, style, true, state.obstacle, state.stance, stageTrick(state).base) : flatTimeline(style, !kickOut, kickOut);
    return {
      duration: kickOut && drop ? tl.land + KICK_OUT_DROP_T : tl.end,
      phases: [
        { label: 'Set up', time: 0 },
        { label: 'Pop', time: tl.pop + 0.06 },
        { label: 'Peak', time: tl.peak },
        { label: kickOut ? 'Kick out' : 'Catch', time: tl.catch },
        { label: kickOut ? (drop ? 'Down' : 'Run out') : 'Land', time: tl.land },
      ],
    };
  }
  const handrail = setHandrail(state.set, stageTrick(state), state.rider, state.rail);
  const { railBail } = stageOutcome(outcomeOf(state));
  if (railBail) {
    // Jumped off: the grind's on up to the jump, then the flight and the roll.
    const bail = railBailTimelineFor(stageTrick(state), state.rider, style, railBail, handrail);
    if (bail) {
      return {
        duration: bail.end,
        phases: [
          { label: 'Set up', time: 0 },
          { label: 'Pop', time: bail.pop },
          ...(bail.trickIn == null ? [] : [{ label: 'Trick in', time: bail.trickIn }]),
          { label: 'Lock', time: bail.lock },
          { label: 'Jump off', time: bail.bail },
          { label: 'Roll', time: bail.down },
        ],
      };
    }
  }
  const grind = grindTimelineFor(stageTrick(state), state.rider, style, true, 'slam', handrail);
  if (!grind) return { phases: [{ label: 'Set up', time: 0 }], duration: flatTimeline(style).end };
  return {
    duration: grind.end,
    phases: [
      { label: 'Set up', time: 0 },
      { label: 'Pop', time: grind.pop },
      ...(grind.trickIn == null ? [] : [{ label: 'Trick in', time: grind.trickIn }]),
      { label: 'Lock', time: grind.lock },
      { label: 'Pop off', time: grind.off },
      ...(grind.trickOut == null ? [] : [{ label: 'Trick out', time: grind.trickOut }]),
      { label: 'Land', time: grind.land },
    ],
  };
}

/** The phase a moment falls in: the last one started by then. */
export function phaseAt(phases: readonly Phase[], time: number): Phase {
  let current = phases[0];
  for (const phase of phases) if (phase.time <= time + 1e-6) current = phase;
  return current;
}

// ----- Camera -----

export interface CameraPreset {
  id: CameraPresetId;
  label: string;
  /** What this angle shows best. */
  hint: string;
  camera: SceneCamera;
  /** Optional framing magnification when choosing this composition. */
  zoom?: number;
  /**
   * Framed against the direction of travel (in front of or behind the
   * rider). Flatground fakie reverses travel; at a spot with a drop the
   * travel and camera stay fixed while the rider faces backwards down it.
   */
  followsTravel: boolean;
  /** Spot-specific choices are shown there, or while they remain selected. */
  set?: StageSet;
  /**
   * A filmer standing still in the spot, panning with the rider, instead of
   * the crane flying alongside; `camera` is then only roughly where they
   * stand, for the dial and as where dragging takes over from.
   */
  tripod?: TripodId;
  /** A shot filmed from one side of the rider's line, where the viewer can pick the other: a tripod, or the side-on crane. */
  sides?: boolean;
}

export const CAMERA_PRESETS: readonly CameraPreset[] = [
  { id: 'classic', label: 'Classic', hint: 'The game view', camera: { ...DEFAULT_SCENE_CAMERA }, zoom: CLASSIC_ZOOM, followsTravel: false },
  { id: 'bottom-center', label: 'Bottom center', hint: 'Straight up the center rail from the landing', camera: { yaw: -90, pitch: 6, lens: 1, targetZ: -6 * FOOT }, zoom: 0.6, followsTravel: false, set: 'el-toro' },
  { id: 'bottom-right', label: 'Bottom right', hint: 'Up the stairs from the planted bank side', camera: { yaw: -125, pitch: 9, lens: 1 }, followsTravel: false, set: 'el-toro' },
  { id: 'tripod-bottom', label: 'Bottom tripod', hint: 'Standing at the bottom, panning as it comes down at you', camera: { yaw: -100, pitch: 2, lens: 1.4 }, tripod: 'bottom', followsTravel: false, set: 'el-toro', sides: true },
  { id: 'tripod-side', label: 'Side tripod', hint: 'Beside the spot, panning across the whole drop', camera: { yaw: 0, pitch: 6, lens: 1.4 }, tripod: 'side', followsTravel: false, set: 'el-toro', sides: true },
  { id: 'tripod-top', label: 'Top tripod', hint: 'At the top, watching it drop away', camera: { yaw: 70, pitch: 14, lens: 1 }, tripod: 'top', followsTravel: false, set: 'el-toro', sides: true },
  { id: 'side', label: 'Side on', hint: 'Pop height and flip axis', camera: { yaw: 0, pitch: 3, lens: 1.25 }, followsTravel: false, sides: true },
  { id: 'head-on', label: 'Head on', hint: 'Which way the board flicks', camera: { yaw: -70, pitch: 7, lens: 1 }, followsTravel: true },
  { id: 'follow', label: 'Follow cam', hint: 'Chasing from behind', camera: { yaw: 58, pitch: 14, lens: 0.85 }, followsTravel: true },
  { id: 'overhead', label: 'Overhead', hint: 'How the board spins', camera: { yaw: -18, pitch: 58, lens: 1.15 }, followsTravel: false },
  { id: 'fisheye', label: 'Fisheye', hint: 'Up close, skate-video style', camera: { yaw: -38, pitch: 4, lens: SCENE_ORBIT_BOUNDS.lens.min }, followsTravel: true },
  { id: 'long-lens', label: 'Long lens', hint: 'Flat and steady', camera: { yaw: -16, pitch: 5, lens: SCENE_ORBIT_BOUNDS.lens.max }, followsTravel: true },
];

/** Keep a chosen spot angle available when moving to another spot. */
export const cameraPresetsFor = (state: Pick<ExplorerState, 'set' | 'camera'>): readonly CameraPreset[] =>
  CAMERA_PRESETS.filter((preset) => preset.id === state.camera || (preset.tripod
    ? setInfo(state.set).tripods.includes(preset.tripod)
    : !preset.set || preset.set === state.set));

const PRESET_BY_ID = new Map(CAMERA_PRESETS.map((p) => [p.id, p]));

export const cameraPreset = (id: CameraPresetId): CameraPreset => PRESET_BY_ID.get(id) ?? CAMERA_PRESETS[0];

/** Whether this camera offers a choice of sides: a tripod or the side-on crane. */
export const cameraHasSides = (camera: ExplorerState['camera']): boolean =>
  typeof camera === 'string' && cameraPreset(camera).sides === true;

/** The two sides a shot can film from, in picker order. */
export const CAMERA_SIDES: readonly { id: CameraSide; label: string }[] = [
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
];

const defaultZoomForCamera = (camera: ExplorerState['camera']) => typeof camera === 'string' ? cameraPreset(camera).zoom ?? 1 : 1;

/** World-space travel: a spot with terrain (stairs, a gap, a bank) is fixed downhill, tricks and rails alike, while fakie elsewhere reverses. */
function travelDir(state: ExplorerState): 1 | -1 {
  if (setInfo(state.set).terrain) return 1;
  const trick = stageTrick(state);
  return (grindSpecFor(trick) ?? specFor(trick)).dir;
}

/** The camera the 3D explorer films from. */
export function sceneCamera(state: ExplorerState): SceneCamera {
  // A tripod films from where it stands, so dragging turns its head rather than flying the crane.
  if (sceneTripod(state)) return { ...presetCamera(state), pan: state.pan ?? { yaw: 0, pitch: 0 } };
  return presetCamera(state);
}

function presetCamera(state: ExplorerState): SceneCamera {
  if (typeof state.camera !== 'string') return clampOrbitCamera(state.camera);
  const preset = cameraPreset(state.camera);
  // El Toro's angles aim across at the center rail from the stair line; a grind is already on it.
  if (setInfo(state.set).rails && state.mode === 'grinds' && preset.camera.targetZ) {
    return sidedCamera(state, preset, { yaw: preset.camera.yaw, pitch: preset.camera.pitch, lens: preset.camera.lens });
  }
  const base = !preset.followsTravel || travelDir(state) === 1 ? preset.camera : { ...preset.camera, yaw: -preset.camera.yaw };
  return sidedCamera(state, preset, base);
}

/** The side of the rider's line a crane at `yaw` films from: yaw 0 is side-on from their right. */
const yawSide = (yaw: number): CameraSide => Math.cos((yaw * Math.PI) / 180) >= 0 ? 'right' : 'left';

/**
 * A shot from the side of the rider's line it films from: the crane swings
 * round to its mirror image across the line, and a tripod's filmer crosses
 * to stand there, its rough angle (for the dial) mirrored with them.
 */
function sidedCamera(state: ExplorerState, preset: CameraPreset, camera: SceneCamera): SceneCamera {
  const side = preset.sides ? filmingSide(state) : null;
  if (!side) return camera;
  const sided = yawSide(camera.yaw) === side ? camera : { ...camera, yaw: wrapOrbitYaw(-180 - camera.yaw) };
  return state.cameraSide && sceneTripod(state) ? { ...sided, side: state.cameraSide } : sided;
}

/**
 * Which side of the rider's line a shot with sides films from: the one the
 * viewer picked, or else wherever the spot's own filmer stands for this
 * line (or the crane, where the spot has no such filmer). Null for a shot
 * without sides.
 */
export function filmingSide(state: ExplorerState): CameraSide | null {
  if (typeof state.camera !== 'string' || !cameraPreset(state.camera).sides) return null;
  if (state.cameraSide) return state.cameraSide;
  const tripod = sceneTripod(state);
  const line = railLine(state);
  const own = tripod && tripodSide(state.set, tripod, {
    obstacle: state.mode === 'flatground' ? state.obstacle : undefined,
    ledge: setInfo(state.set).ledges && (line === 'left' || line === 'right') ? line : undefined,
  });
  return own ?? yawSide(cameraPreset(state.camera).camera.yaw);
}

/** The tripod the 3D explorer films from, where the spot has the chosen one; null for the crane. */
export function sceneTripod(state: Pick<ExplorerState, 'set' | 'camera'>): TripodId | null {
  if (typeof state.camera !== 'string') return null;
  const { tripod } = cameraPreset(state.camera);
  return tripod && setInfo(state.set).tripods.includes(tripod) ? tripod : null;
}

/**
 * A tripod's long lens sees a narrow slice of the spot, so turning its head
 * as far as the crane would swing makes the picture race past the finger.
 */
const TRIPOD_TURN = 0.1;

/** Swing freely around the rider, wrapping yaw while keeping pitch in bounds; on a tripod, turn its head instead. */
export function turnCamera(camera: SceneCamera, yaw: number, pitch: number): SceneCamera {
  if (camera.pan) {
    return { ...camera, pan: clampTripodPan({ yaw: camera.pan.yaw + yaw * TRIPOD_TURN, pitch: camera.pan.pitch + pitch * TRIPOD_TURN }) };
  }
  return clampOrbitCamera({ ...camera, yaw: camera.yaw + yaw, pitch: camera.pitch + pitch });
}

/** The state looking through `camera`, a turn of the stage's: a tripod keeps its shot and takes the pan. */
export function withCamera(state: ExplorerState, camera: SceneCamera): ExplorerState {
  if (camera.pan && sceneTripod(state)) return { ...state, pan: camera.pan.yaw || camera.pan.pitch ? camera.pan : undefined };
  // Dragging a crane makes it a custom angle, which carries its side in the yaw.
  return { ...state, camera, pan: undefined, cameraSide: undefined };
}

/** The state on a named shot, looking where that shot looks. */
export function withShot(state: ExplorerState, shot: CameraPresetId): ExplorerState {
  return {
    ...state,
    camera: shot,
    // A side the viewer picked carries over to another shot with sides.
    cameraSide: cameraPreset(shot).sides ? state.cameraSide : undefined,
    pan: undefined,
    zoom: defaultZoomForCamera(shot),
  };
}

/** Film from this side of the rider's line, keeping the rest of the shot. */
export function withCameraSide(state: ExplorerState, side: CameraSide): ExplorerState {
  return { ...state, cameraSide: side, pan: undefined };
}

/** How much a key press, button, or notch of scrolling zooms by. */
export const ZOOM_STEP = 1.2;

/** `zoom` magnified by `factor`, kept in range and rounded so links stay short. */
export const zoomBy = (zoom: number, factor: number) => clampZoom(Math.round(zoom * factor * 1000) / 1000);

/** How close (in log zoom) the slider has to be to 1× to settle onto it. */
const ZOOM_SNAP = 0.04;

/** The slider's zoom for a position on its log scale, settling onto 1× when it's close. */
export function zoomAt(position: number): number {
  return Math.abs(position) < ZOOM_SNAP ? 1 : clampZoom(Math.exp(position));
}

/** Slider positions are logs of the zoom, so a step in and a step out feel the same. */
export const ZOOM_RANGE = { min: Math.log(SCENE_ZOOM.min), max: Math.log(SCENE_ZOOM.max) } as const;

export const cameraLabel = (state: ExplorerState) =>
  typeof state.camera === 'string' ? cameraPreset(state.camera).label : 'Your angle';

// ----- Shuffle -----

const pick = <T,>(items: readonly T[], random: () => number): T => items[Math.floor(random() * items.length) % items.length];

/** A random trick in the current mode, keeping the stance, rider, and camera. */
export function shuffle(state: ExplorerState, random: () => number = Math.random): ExplorerState {
  if (state.mode === 'flatground') {
    const others = FLATGROUND_BASES.filter((base) => base !== state.trick);
    return { ...state, trick: pick(others, random) };
  }
  const grind = pick(GRIND_CHOICES, random);
  const ends = outEndsFor(grind);
  return {
    ...state,
    grind,
    side: pick(GRIND_SIDES, random),
    into: random() < 0.5 ? pick(INTO_CHOICES, random) : null,
    out: random() < 0.5 ? { base: pick(OUT_CHOICES, random), end: pick(ends, random) } : null,
  };
}

// ----- Shareable URL -----

const fromSlug = (choices: readonly string[], value: string | null) =>
  value == null ? undefined : choices.find((choice) => slug(choice) === value);

const isStance = (value: string | null): value is Stance => STANCES.includes(value as Stance);

/** A preset id, or `yaw_pitch_lens` with an optional fourth lateral-target field. */
function parseCamera(value: string | null): ExplorerState['camera'] {
  if (!value) return DEFAULT_STATE.camera;
  if (PRESET_BY_ID.has(value as CameraPresetId)) return value as CameraPresetId;
  const fields = value.split('_').map(Number);
  if ((fields.length !== 3 && fields.length !== 4) || fields.some((n) => !Number.isFinite(n))) return DEFAULT_STATE.camera;
  const [yaw, pitch, lens, targetZ] = fields;
  return clampOrbitCamera({ yaw, pitch, lens, targetZ });
}

/** A zoom from a link, kept in range; anything that isn't a number is the stock framing. */
function parseZoom(value: string | null): number {
  if (value == null || value.trim() === '') return 1;
  const zoom = Number(value);
  return Number.isFinite(zoom) ? clampZoom(zoom) : 1;
}

const round = (n: number, places: number) => Number(n.toFixed(places));

/** A tripod's head turned `yaw_pitch` off the rider; none (or nonsense) keeps it on them. */
function parsePan(value: string | null): TripodPan | null {
  const fields = value?.split('_').map(Number) ?? [];
  if (fields.length !== 2 || fields.some((n) => !Number.isFinite(n))) return null;
  const pan = clampTripodPan({ yaw: fields[0], pitch: fields[1] });
  return pan.yaw || pan.pitch ? pan : null;
}

/** Public links use neutral names; internal IDs remain stable for existing links and the renderer. */
const PUBLIC_SET_SLUGS: Partial<Record<StageSet, string>> = {
  'sunset-car-wash': 'roof-to-bank',
  'lyon-25': '25-stair',
  'miami-triangle': 'triangle-bank',
};

/** The explorer state a URL query describes; anything missing or unknown keeps its default. */
export function stateFromSearch(search: string): ExplorerState {
  const params = new URLSearchParams(search);
  const stanceParam = params.get('stance');
  const camera = parseCamera(params.get('cam'));
  const set = STAGE_SETS.find((option) => option.id === params.get('set') || PUBLIC_SET_SLUGS[option.id] === params.get('set'))?.id ?? DEFAULT_STATE.set;
  const pan = parsePan(params.get('pan'));
  const base: ExplorerState = {
    ...DEFAULT_STATE,
    stance: isStance(stanceParam) ? stanceParam : DEFAULT_STATE.stance,
    rider: params.get('rider') === 'goofy' ? 'goofy' : 'regular',
    camera,
    cameraSide: cameraHasSides(camera) ? CAMERA_SIDES.find((side) => side.id === params.get('from'))?.id : undefined,
    zoom: params.has('zoom') ? parseZoom(params.get('zoom')) : defaultZoomForCamera(camera),
    ...(pan && sceneTripod({ set, camera }) ? { pan } : {}),
    set,
    rail: setInfo(set).rails?.fixedLine || (params.get('rail') === 'side' && setInfo(set).rails?.sideGrinds !== false) ? 'side' : DEFAULT_STATE.rail,
    obstacle: setInfo(set).obstacles?.find((o) => o.id === params.get('obstacle'))?.id ?? DEFAULT_STATE.obstacle,
    skater: SKATERS.find((option) => option.id === params.get('skater'))?.id ?? DEFAULT_STATE.skater,
    // Kept if it's a miss the mode named below has (a flatground trick's kick-out, a grind's jump off).
    fall: OUTCOME_OPTIONS.grinds.concat(OUTCOME_OPTIONS.flatground).find((o) => o.fall != null && o.fall === params.get('fall'))?.fall ?? null,
  };
  const grind = fromSlug(GRIND_CHOICES, params.get('grind'));
  if (!grind) {
    // Flatground is asked for by naming its trick; a link naming nothing the
    // stage knows opens on the default grind (at El Toro, down its rail), or
    // on the trick at a spot with no grinds.
    const trick = fromSlug(FLATGROUND_BASES, params.get('trick'));
    if (trick) return withMode({ ...base, trick }, 'flatground');
    const opened = withSet(base, base.set);
    return withMode(opened, opened.mode);
  }
  const outParam = params.get('out') ?? '';
  const nose = outParam.startsWith('nollie-');
  const outBase = fromSlug(OUT_CHOICES, nose ? outParam.slice('nollie-'.length) : outParam);
  return withGrind({
    ...withMode(base, 'grinds'),
    grind,
    side: params.get('side') === 'bs' ? 'Backside' : 'Frontside',
    into: fromSlug(INTO_CHOICES, params.get('in')) ?? null,
    out: outBase ? { base: outBase, end: nose ? 'nose' : 'tail' } : null,
  }, grind);
}

/** A downloaded video's name: the trick, the spot's public name when given, speed, and extension matching its encoded format. */
export function videoFilename(trickName: string, rate: number, mimeType = 'video/mp4', set?: StageSet): string {
  const extension = mimeType.startsWith('video/webm') ? 'webm' : 'mp4';
  const location = set ? `-${slug(setInfo(set).label)}` : '';
  return `${slug(trickName) || 'trick'}${location}${rate === 1 ? '' : `-${rate}x`}.${extension}`;
}

/** The URL query that reopens this state: only what's on the stage, defaults left out. */
export function searchFromState(state: ExplorerState): string {
  const params = new URLSearchParams();
  if (state.mode === 'flatground') {
    params.set('trick', slug(state.trick));
  } else {
    params.set('grind', slug(state.grind));
    if (state.side === 'Backside') params.set('side', 'bs');
    if (state.into) params.set('in', slug(state.into));
    if (state.out) params.set('out', `${state.out.end === 'nose' ? 'nollie-' : ''}${slug(state.out.base)}`);
  }
  if (state.stance !== 'regular') params.set('stance', state.stance);
  if (state.rider !== 'regular') params.set('rider', state.rider);
  if (state.camera !== DEFAULT_STATE.camera) {
    if (typeof state.camera === 'string') params.set('cam', state.camera);
    else {
      const camera = clampOrbitCamera(state.camera);
      const fields = [wrapOrbitYaw(round(camera.yaw, 1)), round(camera.pitch, 1), round(camera.lens, 2)];
      const targetZ = round(camera.targetZ ?? 0, 1);
      if (targetZ !== 0) fields.push(targetZ);
      params.set('cam', fields.join('_'));
    }
  }
  if (state.pan && sceneTripod(state)) {
    const pan = clampTripodPan(state.pan);
    if (pan.yaw || pan.pitch) params.set('pan', `${round(pan.yaw, 1)}_${round(pan.pitch, 1)}`);
  }
  if (state.cameraSide && cameraHasSides(state.camera)) params.set('from', state.cameraSide);
  if (state.zoom !== defaultZoomForCamera(state.camera)) params.set('zoom', String(round(state.zoom, 2)));
  if (state.set !== DEFAULT_STATE.set) params.set('set', PUBLIC_SET_SLUGS[state.set] ?? state.set);
  if (state.rail !== DEFAULT_STATE.rail) params.set('rail', state.rail);
  if (picksObstacle(state) && state.obstacle !== DEFAULT_STATE.obstacle) params.set('obstacle', state.obstacle);
  if (state.skater !== DEFAULT_STATE.skater) params.set('skater', state.skater);
  const fall = outcomeOf(state);
  if (fall) params.set('fall', fall);
  return `?${params.toString()}`;
}
