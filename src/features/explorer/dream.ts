import { setInfo, type Obstacle, type PopEnd, type RailChoice, type StageSet } from '@skrobot/animations';
import {
  DEFAULT_STATE,
  cameraPreset,
  cameraPresetsFor,
  outEndsFor,
  stateFromSearch,
  withGrind,
  withMode,
  withSet,
  type CameraPresetId,
  type ExplorerMode,
  type ExplorerState,
} from './explorer';

/**
 * Dream Tricks: the Trick Explorer cut down for someone who just wants to
 * see a trick at a famous spot. Pick the spot and skater, then what to hit
 * there (its stairs, its rail, the fence) within the trick section. The
 * same explorer state and shareable link underneath, so nothing is lost.
 */

/** One way to hit a spot, in a skater's words: a gap trick over something, or a grind down a rail. */
export interface DreamLine {
  id: string;
  label: string;
  mode: ExplorerMode;
  /** What a gap trick goes over. */
  obstacle: Obstacle;
  /** Which handrail a grind goes down. */
  rail: RailChoice;
}

export interface DreamSpot {
  id: StageSet;
  name: string;
  /** Where in the world it is. */
  where: string;
  /** What's there, in a few words. */
  feature: string;
  /** The first is where a visit starts. */
  lines: readonly DreamLine[];
}

const gap = (label: string, obstacle: Obstacle = 'stairs'): DreamLine => ({ id: obstacle, label, mode: 'flatground', obstacle, rail: 'center' });
const rail = (label: string, choice: RailChoice = 'center'): DreamLine => ({
  id: choice === 'center' ? 'rail' : 'side-rail', label, mode: 'grinds', obstacle: 'stairs', rail: choice,
});

/** The landmark spots, the only ones this page offers (the plaza and waterfront stay in the explorer). */
export const DREAM_SPOTS: readonly DreamSpot[] = [
  { id: 'el-toro', name: setInfo('el-toro').label, where: 'Lake Forest, CA', feature: '20 stair and handrails', lines: [gap('20 stair'), rail('Center rail'), rail('Side rail', 'side')] },
  { id: 'hollywood-high', name: setInfo('hollywood-high').label, where: 'Los Angeles', feature: '16 stair, rail, and fence', lines: [gap('16 stair'), rail('Handrail'), gap('Over the fence', 'fence')] },
  { id: 'wallenberg', name: setInfo('wallenberg').label, where: 'San Francisco', feature: 'The four block gap', lines: [gap('Four block')] },
  { id: 'sunset-car-wash', name: setInfo('sunset-car-wash').label, where: 'Redesigned setting', feature: 'Off the roof into the bank', lines: [gap('Roof to bank')] },
  { id: 'lyon-25', name: setInfo('lyon-25').label, where: 'Redesigned courtyard', feature: '25 stairs · 14.76 ft down, 21.29 ft across', lines: [gap('25 stairs')] },
  { id: 'leap-of-faith', name: setInfo('leap-of-faith').label, where: 'Point Loma High · San Diego', feature: 'Over the rail · 14.3 ft courtyard drop', lines: [gap('Over the rail')] },
  { id: 'miami-triangle', name: setInfo('miami-triangle').label, where: 'Redesigned park', feature: 'Gap to the triangular bank, or its edges', lines: [gap('Gap to bank'), gap('Over the triangle', 'triangle'), rail('Down an edge')] },
  { id: 'uc-davis-gap', name: setInfo('uc-davis-gap').label, where: 'Roessler Hall · UC Davis', feature: 'Ivy gap · approx. 24 ft 4 in across, 10 ft down', lines: [gap('Over the ivy')] },
];

const SPOT_BY_ID = new Map(DREAM_SPOTS.map((spot) => [spot.id, spot]));

export const dreamSpot = (set: StageSet): DreamSpot => SPOT_BY_ID.get(set) ?? DREAM_SPOTS[0];

/** What the rider is hitting at the spot now. */
export function dreamLine(state: ExplorerState): DreamLine {
  const { lines } = dreamSpot(state.set);
  return lines.find((line) => line.mode === state.mode && (line.mode === 'flatground' ? line.obstacle === state.obstacle : line.rail === state.rail)) ?? lines[0];
}

/** Hit something else at the spot, keeping the trick or grind picked for each. */
export function withDreamLine(state: ExplorerState, line: DreamLine): ExplorerState {
  return line.mode === 'flatground'
    ? { ...withMode(state, 'flatground'), obstacle: line.obstacle }
    : { ...withMode(state, 'grinds'), rail: line.rail };
}

/** Go to another spot, starting on its first line. */
export function withDreamSpot(state: ExplorerState, set: StageSet): ExplorerState {
  const moved = withSet(state, set);
  return withDreamLine(moved, dreamSpot(set).lines[0]);
}

/** The end a trick out of this grind pops off: the tail where it's on the bar, as most are. */
export const dreamOutEnd = (grind: string): PopEnd => (outEndsFor(grind).includes('tail') ? 'tail' : 'nose');

/** Change the grind, keeping a trick out (off whichever end the new grind allows). */
export function withDreamGrind(state: ExplorerState, grind: string): ExplorerState {
  return withGrind({ ...state, out: state.out && { ...state.out, end: dreamOutEnd(grind) } }, grind);
}

/**
 * The classic shot here is a filmer standing at the bottom. The explorer's
 * classic is a crane flying alongside, which no one could follow down a
 * landmark with, so this page doesn't offer it.
 */
const CLASSIC_SHOT: CameraPresetId = 'tripod-bottom';

/** The framing that shot opens on, so the explorer's classic pull-back doesn't follow the link over here. */
const CLASSIC_SHOT_ZOOM = cameraPreset(CLASSIC_SHOT).zoom ?? 1;

/** A first visit: a kickflip down El Toro, filmed from the bottom. */
export const DREAM_DEFAULT: Readonly<ExplorerState> = Object.freeze({ ...DEFAULT_STATE, mode: 'flatground', trick: 'Kickflip', set: 'el-toro', camera: CLASSIC_SHOT, zoom: CLASSIC_SHOT_ZOOM });

/** The state a link opens on this page: any explorer link works, moved to a landmark if it was elsewhere, the crane's classic shot to this page's. */
export function dreamStateFromSearch(search: string): ExplorerState {
  const params = new URLSearchParams(search);
  let state = stateFromSearch(search);
  if (!params.get('trick') && !params.get('grind')) state = { ...state, mode: 'flatground', trick: DREAM_DEFAULT.trick };
  if (!SPOT_BY_ID.has(state.set)) state = withSet(state, DREAM_DEFAULT.set);
  if (state.camera === 'classic') state = { ...state, camera: CLASSIC_SHOT, zoom: params.has('zoom') ? state.zoom : CLASSIC_SHOT_ZOOM };
  return state;
}

/** A camera shot, named for where the filmer stands. */
export interface DreamShot {
  id: CameraPresetId;
  label: string;
  hint: string;
}

const SHOTS: readonly DreamShot[] = [
  { id: CLASSIC_SHOT, label: 'Classic', hint: 'Filmer at the bottom' },
  { id: 'tripod-side', label: 'From the side', hint: 'Filmer beside the drop' },
  { id: 'tripod-top', label: 'From the top', hint: 'Filmer at the top' },
  { id: 'follow', label: 'Follow', hint: 'Drone chasing from behind' },
  { id: 'head-on', label: 'Head on', hint: 'Drone facing the rider' },
];

/** The shots this spot can film from. */
export const dreamShots = (state: Pick<ExplorerState, 'set' | 'camera'>): readonly DreamShot[] => {
  const available = new Set(cameraPresetsFor(state).map((preset) => preset.id));
  return SHOTS.filter((shot) => available.has(shot.id));
};
