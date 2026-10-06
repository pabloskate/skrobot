import {
  DEFAULT_SCENE_CAMERA,
  FLIP_T,
  FOOT,
  GRIND_BASES,
  LAND_T,
  ROLL_IN,
  SCENE_ORBIT_BOUNDS,
  SCENE_ZOOM,
  STAGE_SETS,
  SKATERS,
  canEnterGrind,
  railLineFor,
  setInfo,
  canExitGrind,
  clampOrbitCamera,
  clampZoom,
  exitEndsFor,
  grindSpecFor,
  grindTimelineFor,
  joinGrindBase,
  joinGrindExit,
  specFor,
  setTimeline,
  wrapOrbitYaw,
  type PopEnd,
  type RailChoice,
  type RailLine,
  type RiderStance,
  type SceneCamera,
  type SkateStyle,
  type Skater,
  type StageSet,
  type TripodId,
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
  /** How far in the picture is magnified, whatever the angle: 1 is the stock framing. */
  zoom: number;
  /** The spot the rider skates, with terrain and supported obstacles from the shared set registry. */
  set: StageSet;
  /** At a spot with several handrails, which one a grind rides: the center one, or the side one the trick's approach takes. */
  rail: RailChoice;
  /** Who skates it: the robot, illustrated human, realistic human, or humanoid. */
  skater: Skater;
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

/**
 * Tricks offered out of a grind: the flips, shuvs, 180s, 180 flips, and
 * bigspins the animation package verifies off both ends, not the whole catalog.
 */
export const OUT_CHOICES: readonly string[] = [
  'Kickflip',
  'Heelflip',
  'Pop Shuvit',
  'Frontside Shuvit',
  '360 Flip',
  'Frontside 180',
  'Backside 180',
  'Backside Flip',
  'Frontside Flip',
  'Backside Heelflip',
  'Frontside Heelflip',
  'Bigspin',
  'FS Bigspin',
].filter(canExitGrind);

/** The ends a trick out of this grind can pop off: only an end that's on the bar. */
export const outEndsFor = (grind: string): readonly PopEnd[] => exitEndsFor(grind);

/** A grind's 1–10 difficulty from the catalog, or null for one it doesn't list. */
export const grindDifficulty = (grind: string): number | null => TRICK_BY_NAME.get(grind)?.difficulty ?? null;

/** The catalog's one-line description of a grind or slide. */
export function grindDescription(grind: string): string {
  const trick = TRICK_BY_NAME.get(grind);
  return trick ? trickDescription(trick) : '';
}

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
  zoom: 1,
  set: 'waterfront',
  rail: 'center',
  skater: 'robot',
});

/** Move to another spot; gap-only spots open the saved gap trick. */
export function withSet(state: ExplorerState, set: StageSet): ExplorerState {
  return { ...state, set, mode: setInfo(set).grinds ? state.mode : 'flatground', rail: setInfo(set).rails?.sideGrinds === false ? 'center' : state.rail };
}

/** Switch between gap/flatground tricks and grinds where the spot supports them. */
export function withMode(state: ExplorerState, mode: ExplorerMode): ExplorerState {
  return { ...state, mode: mode === 'grinds' && !setInfo(state.set).grinds ? 'flatground' : mode };
}

/** Keeps a trick out only if the grind rides the end it pops off. */
export function withGrind(state: ExplorerState, grind: string): ExplorerState {
  const out = state.out && outEndsFor(grind).includes(state.out.end) ? state.out : null;
  return { ...state, grind, out };
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
  const spec = grindSpecFor(stageTrick(state));
  if (!spec) return [];
  const riding = state.stance === 'regular' ? 'rolling' : `riding ${state.stance}`;
  const side = spec.toesideApproach ? 'toeside' : 'heelside';
  // At a spot with handrails the grind goes down one: the center one, or (El Toro) the side one it comes in toward.
  const line = railLine(state);
  const rail = line != null;
  const bar = line === 'left' || line === 'right' ? `${line} rail` : rail ? 'rail' : 'bar';
  const steps: TrickStep[] = [
    { label: 'Approach', detail: `Come in ${riding} with the ${bar} on your ${side}${rail ? ', a little slower than you would to jump the set' : ''}.` },
    state.into
      ? {
        label: state.into,
        detail: spec.reversed
          ? `Pop ${withArticle(state.into)} onto the ${bar}. It turns you round, so you lock in riding the other way.`
          : `Pop ${withArticle(state.into)} and catch it on the way onto the ${bar}.`,
      }
      : {
        label: state.stance === 'nollie' ? 'Nollie on' : 'Ollie on',
        detail: rail ? 'Pop as the rail starts beside you. Your speed carries you on while it drops away under the board, so lock on a few stairs down.' : 'Pop up and lock onto the bar.',
      },
    { label: `${state.side} ${state.grind}`, detail: `${grindDescription(state.grind)}${rail ? ' Stay over it as it picks up speed down the rail.' : ''}` },
    state.out
      ? {
        label: outName(state.out),
        detail: `Pop ${withArticle(`${state.out.end === 'nose' ? 'nollie ' : ''}${state.out.base}`)} off the ${state.out.end} as you leave the ${bar}.`,
      }
      : { label: 'Pop off', detail: rail ? 'Pop off the bottom of the rail and ride away from the landing.' : 'Pop off the end of the bar and ride away.' },
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
  if (state.mode === 'flatground' && setInfo(state.set).terrain) {
    // Down the stairs the flight is the drop's: longer the lower the robot pops.
    const stairs = setTimeline(state.set, style)!;
    return {
      duration: stairs.end,
      phases: [
        { label: 'Set up', time: 0 },
        { label: 'Pop', time: stairs.pop + 0.06 },
        { label: 'Peak', time: stairs.peak },
        { label: 'Catch', time: stairs.catch },
        { label: 'Land', time: stairs.land },
      ],
    };
  }
  if (state.mode === 'flatground') {
    const land = ROLL_IN + FLIP_T;
    return {
      duration: land + LAND_T,
      phases: [
        { label: 'Set up', time: 0 },
        { label: 'Pop', time: ROLL_IN + FLIP_T * 0.1 },
        { label: 'Peak', time: ROLL_IN + FLIP_T * 0.5 },
        { label: 'Catch', time: ROLL_IN + FLIP_T * 0.88 },
        { label: 'Land', time: land },
      ],
    };
  }
  const grind = grindTimelineFor(stageTrick(state), state.rider, style, true, 'slam', setInfo(state.set).rails?.handrail ?? null);
  if (!grind) return { phases: [{ label: 'Set up', time: 0 }], duration: ROLL_IN + FLIP_T + LAND_T };
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
}

export const CAMERA_PRESETS: readonly CameraPreset[] = [
  { id: 'classic', label: 'Classic', hint: 'The game view', camera: { ...DEFAULT_SCENE_CAMERA }, followsTravel: false },
  { id: 'bottom-center', label: 'Bottom center', hint: 'Straight up the center rail from the landing', camera: { yaw: -90, pitch: 6, lens: 1, targetZ: -6 * FOOT }, zoom: 0.6, followsTravel: false, set: 'el-toro' },
  { id: 'bottom-right', label: 'Bottom right', hint: 'Up the stairs from the planted bank side', camera: { yaw: -125, pitch: 9, lens: 1 }, followsTravel: false, set: 'el-toro' },
  { id: 'tripod-bottom', label: 'Bottom tripod', hint: 'Standing at the bottom, panning as it comes down at you', camera: { yaw: -100, pitch: 2, lens: 1.4 }, tripod: 'bottom', followsTravel: false, set: 'el-toro' },
  { id: 'tripod-side', label: 'Side tripod', hint: 'Beside the spot, panning across the whole drop', camera: { yaw: 0, pitch: 6, lens: 1.4 }, tripod: 'side', followsTravel: false, set: 'el-toro' },
  { id: 'tripod-top', label: 'Top tripod', hint: 'At the top, watching it drop away', camera: { yaw: 70, pitch: 14, lens: 1 }, tripod: 'top', followsTravel: false, set: 'el-toro' },
  { id: 'side', label: 'Side on', hint: 'Pop height and flip axis', camera: { yaw: 0, pitch: 3, lens: 1.25 }, followsTravel: false },
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

const defaultZoomForCamera = (camera: ExplorerState['camera']) => typeof camera === 'string' ? cameraPreset(camera).zoom ?? 1 : 1;

/** World-space travel: a spot with terrain (stairs, a gap, a bank) is fixed downhill, tricks and rails alike, while fakie elsewhere reverses. */
function travelDir(state: ExplorerState): 1 | -1 {
  if (setInfo(state.set).terrain) return 1;
  const trick = stageTrick(state);
  return (grindSpecFor(trick) ?? specFor(trick)).dir;
}

/** The camera the 3D explorer films from. */
export function sceneCamera(state: ExplorerState): SceneCamera {
  if (typeof state.camera !== 'string') return clampOrbitCamera(state.camera);
  const preset = cameraPreset(state.camera);
  // El Toro's angles aim across at the center rail from the stair line; a grind is already on it.
  if (setInfo(state.set).rails && state.mode === 'grinds' && preset.camera.targetZ) {
    return { yaw: preset.camera.yaw, pitch: preset.camera.pitch, lens: preset.camera.lens };
  }
  if (!preset.followsTravel || travelDir(state) === 1) return preset.camera;
  return { ...preset.camera, yaw: -preset.camera.yaw };
}

/** The tripod the 3D explorer films from, where the spot has the chosen one; null for the crane. */
export function sceneTripod(state: Pick<ExplorerState, 'set' | 'camera'>): TripodId | null {
  if (typeof state.camera !== 'string') return null;
  const { tripod } = cameraPreset(state.camera);
  return tripod && setInfo(state.set).tripods.includes(tripod) ? tripod : null;
}

/** Swing freely around the rider, wrapping yaw while keeping pitch in bounds. */
export function turnCamera(camera: SceneCamera, yaw: number, pitch: number): SceneCamera {
  return clampOrbitCamera({ ...camera, yaw: camera.yaw + yaw, pitch: camera.pitch + pitch });
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

/** The explorer state a URL query describes; anything missing or unknown keeps its default. */
export function stateFromSearch(search: string): ExplorerState {
  const params = new URLSearchParams(search);
  const stanceParam = params.get('stance');
  const camera = parseCamera(params.get('cam'));
  const set = STAGE_SETS.find((option) => option.id === params.get('set'))?.id ?? DEFAULT_STATE.set;
  const base: ExplorerState = {
    ...DEFAULT_STATE,
    stance: isStance(stanceParam) ? stanceParam : DEFAULT_STATE.stance,
    rider: params.get('rider') === 'goofy' ? 'goofy' : 'regular',
    camera,
    zoom: params.has('zoom') ? parseZoom(params.get('zoom')) : defaultZoomForCamera(camera),
    set,
    rail: params.get('rail') === 'side' && setInfo(set).rails?.sideGrinds !== false ? 'side' : DEFAULT_STATE.rail,
    skater: SKATERS.find((option) => option.id === params.get('skater'))?.id ?? DEFAULT_STATE.skater,
  };
  const grind = fromSlug(GRIND_CHOICES, params.get('grind'));
  if (!grind) {
    // Flatground is asked for by naming its trick; a link naming nothing the
    // stage knows opens on the default grind (at El Toro, down its rail), or
    // on the trick at a spot with no grinds.
    const trick = fromSlug(FLATGROUND_BASES, params.get('trick'));
    return trick ? { ...base, mode: 'flatground', trick } : withSet(base, base.set);
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

/** A downloaded video's file name: the trick, and its speed when slowed down ("kickflip-0.25x.mp4"). */
export function videoFilename(trickName: string, rate: number): string {
  return `${slug(trickName) || 'trick'}${rate === 1 ? '' : `-${rate}x`}.mp4`;
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
  if (state.zoom !== defaultZoomForCamera(state.camera)) params.set('zoom', String(round(state.zoom, 2)));
  if (state.set !== DEFAULT_STATE.set) params.set('set', state.set);
  if (state.rail !== DEFAULT_STATE.rail) params.set('rail', state.rail);
  if (state.skater !== DEFAULT_STATE.skater) params.set('skater', state.skater);
  return `?${params.toString()}`;
}
