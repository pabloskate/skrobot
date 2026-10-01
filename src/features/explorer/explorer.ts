import {
  DEFAULT_SCENE_CAMERA,
  FLIP_T,
  GRIND_BASES,
  LAND_T,
  ROLL_IN,
  SCENE_CAMERA_BOUNDS,
  canEnterGrind,
  canExitGrind,
  clampSceneCamera,
  exitEndsFor,
  grindSpecFor,
  grindTimelineFor,
  joinGrindBase,
  joinGrindExit,
  specFor,
  type PopEnd,
  type RiderStance,
  type SceneCamera,
  type SkateStyle,
} from '@skrobot/animations';
import { TRICKS, TRICK_BY_NAME, trickDescription, type Stance, type Trick } from '@/features/tricks';

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

export type CameraPresetId = 'classic' | 'side' | 'head-on' | 'follow' | 'overhead' | 'fisheye' | 'long-lens';

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

/** Flatground tricks that can be popped into a grind. */
export const INTO_CHOICES: readonly string[] = FLATGROUND_BASES.filter(canEnterGrind);

/**
 * Tricks offered out of a grind: the flips, shuvs, 180s, and bigspins the
 * animation package verifies off both ends, not the whole catalog.
 */
export const OUT_CHOICES: readonly string[] = [
  'Kickflip',
  'Heelflip',
  'Pop Shuvit',
  'Frontside Shuvit',
  '360 Flip',
  'Frontside 180',
  'Backside 180',
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
  mode: 'flatground',
  stance: 'regular',
  rider: 'regular',
  trick: 'Kickflip',
  grind: '50-50 Grind',
  side: 'Frontside',
  into: null,
  out: null,
  camera: 'classic',
});

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

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** The trick on the stage, shaped for TrickScene. */
export function stageTrick(state: ExplorerState): Pick<Trick, 'id' | 'name' | 'base' | 'stance'> {
  if (state.mode === 'flatground') return flatgroundTrick(state.trick, state.stance);
  const base = grindBase(state);
  return { id: `${slug(base)}-${state.stance}`, name: `${STANCE_LEAD[state.stance]}${base}`, base, stance: state.stance };
}

/** "Nollie Heelflip out" / "Pop Shuvit out". */
export const outName = (out: GrindOut) => `${out.end === 'nose' ? 'Nollie ' : ''}${out.base} out`;

/** "a Kickflip", "an Inward Heelflip", "an FS Bigspin". */
const withArticle = (name: string) => `${/^([aeiou]|fs\b)/i.test(name) ? 'an' : 'a'} ${name}`;

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
  const bar = spec.toesideApproach ? 'toeside' : 'heelside';
  const steps: TrickStep[] = [
    { label: 'Approach', detail: `Come in ${riding} with the bar on your ${bar}.` },
    state.into
      ? {
        label: state.into,
        detail: spec.reversed
          ? `Pop ${withArticle(state.into)} onto the bar. It turns you round, so you lock in riding the other way.`
          : `Pop ${withArticle(state.into)} and catch it on the way onto the bar.`,
      }
      : { label: state.stance === 'nollie' ? 'Nollie on' : 'Ollie on', detail: 'Pop up and lock onto the bar.' },
    { label: `${state.side} ${state.grind}`, detail: grindDescription(state.grind) },
    state.out
      ? {
        label: outName(state.out),
        detail: `Pop ${withArticle(`${state.out.end === 'nose' ? 'nollie ' : ''}${state.out.base}`)} off the ${state.out.end} as you leave the bar.`,
      }
      : { label: 'Pop off', detail: 'Pop off the end of the bar and ride away.' },
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
  const grind = grindTimelineFor(stageTrick(state), state.rider, style, true, 'slam');
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
  /**
   * Framed against the direction of travel (in front of or behind the
   * rider), so a fakie trick, rolling the other way, swings it round too.
   */
  followsTravel: boolean;
}

export const CAMERA_PRESETS: readonly CameraPreset[] = [
  { id: 'classic', label: 'Classic', hint: 'The game view', camera: { ...DEFAULT_SCENE_CAMERA }, followsTravel: false },
  { id: 'side', label: 'Side on', hint: 'Pop height and flip axis', camera: { yaw: 0, pitch: 3, lens: 1.25 }, followsTravel: false },
  { id: 'head-on', label: 'Head on', hint: 'Which way the board flicks', camera: { yaw: -70, pitch: 7, lens: 1 }, followsTravel: true },
  { id: 'follow', label: 'Follow cam', hint: 'Chasing from behind', camera: { yaw: 58, pitch: 14, lens: 0.85 }, followsTravel: true },
  { id: 'overhead', label: 'Overhead', hint: 'How the board spins', camera: { yaw: -18, pitch: 58, lens: 1.15 }, followsTravel: false },
  { id: 'fisheye', label: 'Fisheye', hint: 'Up close, skate-video style', camera: { yaw: -38, pitch: 4, lens: SCENE_CAMERA_BOUNDS.lens.min }, followsTravel: true },
  { id: 'long-lens', label: 'Long lens', hint: 'Flat and steady', camera: { yaw: -16, pitch: 5, lens: SCENE_CAMERA_BOUNDS.lens.max }, followsTravel: true },
];

const PRESET_BY_ID = new Map(CAMERA_PRESETS.map((p) => [p.id, p]));

export const cameraPreset = (id: CameraPresetId): CameraPreset => PRESET_BY_ID.get(id) ?? CAMERA_PRESETS[0];

/** Which way the rider rolls along the street: fakie rolls backwards. */
function travelDir(state: ExplorerState): 1 | -1 {
  const trick = stageTrick(state);
  return (grindSpecFor(trick) ?? specFor(trick)).dir;
}

/** The camera TrickScene films from. */
export function sceneCamera(state: ExplorerState): SceneCamera {
  if (typeof state.camera !== 'string') return clampSceneCamera(state.camera);
  const preset = cameraPreset(state.camera);
  if (!preset.followsTravel || travelDir(state) === 1) return preset.camera;
  return { ...preset.camera, yaw: -preset.camera.yaw };
}

/** The camera swung round the rider (yaw) and up over them (pitch) by some degrees, kept in bounds. */
export function turnCamera(camera: SceneCamera, yaw: number, pitch: number): SceneCamera {
  return clampSceneCamera({ ...camera, yaw: camera.yaw + yaw, pitch: camera.pitch + pitch });
}

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

/** A preset id, or a custom angle as `yaw_pitch_lens` ("-30_12_1"): underscores stay readable in a link. */
function parseCamera(value: string | null): ExplorerState['camera'] {
  if (!value) return DEFAULT_STATE.camera;
  if (PRESET_BY_ID.has(value as CameraPresetId)) return value as CameraPresetId;
  const [yaw, pitch, lens] = value.split('_').map(Number);
  if ([yaw, pitch, lens].some((n) => !Number.isFinite(n))) return DEFAULT_STATE.camera;
  return clampSceneCamera({ yaw, pitch, lens });
}

const round = (n: number, places: number) => Number(n.toFixed(places));

/** The explorer state a URL query describes; anything missing or unknown keeps its default. */
export function stateFromSearch(search: string): ExplorerState {
  const params = new URLSearchParams(search);
  const stanceParam = params.get('stance');
  const base: ExplorerState = {
    ...DEFAULT_STATE,
    stance: isStance(stanceParam) ? stanceParam : DEFAULT_STATE.stance,
    rider: params.get('rider') === 'goofy' ? 'goofy' : 'regular',
    camera: parseCamera(params.get('cam')),
  };
  const grind = fromSlug(GRIND_CHOICES, params.get('grind'));
  if (!grind) {
    return { ...base, trick: fromSlug(FLATGROUND_BASES, params.get('trick')) ?? DEFAULT_STATE.trick };
  }
  const outParam = params.get('out') ?? '';
  const nose = outParam.startsWith('nollie-');
  const outBase = fromSlug(OUT_CHOICES, nose ? outParam.slice('nollie-'.length) : outParam);
  return withGrind({
    ...base,
    mode: 'grinds',
    grind,
    side: params.get('side') === 'bs' ? 'Backside' : 'Frontside',
    into: fromSlug(INTO_CHOICES, params.get('in')) ?? null,
    out: outBase ? { base: outBase, end: nose ? 'nose' : 'tail' } : null,
  }, grind);
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
    params.set('cam', typeof state.camera === 'string'
      ? state.camera
      : [round(state.camera.yaw, 1), round(state.camera.pitch, 1), round(state.camera.lens, 2)].join('_'));
  }
  return `?${params.toString()}`;
}
