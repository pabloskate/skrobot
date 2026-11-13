import { FOOT, setInfo, setLocation, spotStands, wrapOrbitYaw, type Obstacle, type PopEnd, type RailChoice, type SceneCamera, type StageSet, type TripodSpot } from '@skrobot/animations';
import {
  DEFAULT_STATE,
  cameraPreset,
  cameraPresetsFor,
  filmedLine,
  outEndsFor,
  sceneTripod,
  stateFromSearch,
  withGrind,
  withMode,
  withSet,
  type CameraPresetId,
  type ExplorerMode,
  type ExplorerState,
  type Phase,
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
  /** The flight at a shared location; omitted when the spot has only one. */
  set?: StageSet;
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
  {
    id: 'hollywood-high', name: setInfo('hollywood-high').label, where: 'Los Angeles', feature: 'Back-to-back 16 and 12 stairs, rails, and fence',
    lines: [
      { ...gap('16 stair'), set: 'hollywood-high' },
      { ...rail('16 rail'), set: 'hollywood-high' },
      { ...gap('Over the fence', 'fence'), set: 'hollywood-high' },
      { ...gap('12 stair'), id: 'twelve-stairs', set: 'hollywood-high-12' },
      { ...rail('12 rail'), id: 'twelve-rail', set: 'hollywood-high-12' },
    ],
  },
  { id: 'carlsbad-gap', name: setInfo('carlsbad-gap').label, where: 'Carlsbad High · California', feature: 'Grass gap beside the 11 stair · uphill landing', lines: [gap('Over the grass')] },
  { id: 'wallenberg', name: setInfo('wallenberg').label, where: 'San Francisco', feature: 'The four block gap', lines: [gap('Four block')] },
  { id: 'sunset-car-wash', name: setInfo('sunset-car-wash').label, where: 'Redesigned setting', feature: 'Off the roof into the bank', lines: [gap('Roof to bank')] },
  { id: 'lyon-25', name: setInfo('lyon-25').label, where: 'Redesigned courtyard', feature: '25 stairs · 14.76 ft down, 21.29 ft across', lines: [gap('25 stairs')] },
  { id: 'leap-of-faith', name: setInfo('leap-of-faith').label, where: 'Point Loma High · San Diego', feature: 'Over the rail · 14.3 ft courtyard drop', lines: [gap('Over the rail')] },
  { id: 'miami-triangle', name: setInfo('miami-triangle').label, where: 'Redesigned park', feature: 'Gap to the triangular bank, or its edges', lines: [gap('Gap to bank'), gap('Over the triangle', 'triangle'), rail('Down an edge')] },
  { id: 'uc-davis-gap', name: setInfo('uc-davis-gap').label, where: 'Roessler Hall · UC Davis', feature: 'Ivy gap · approx. 24 ft 4 in across, 10 ft down', lines: [gap('Over the ivy')] },
  { id: 'emage-20', name: setInfo('emage-20').label, where: 'Denver · Colorado', feature: '20 stair and side rail', lines: [gap('20 stair'), rail('Side rail', 'side')] },
];

const SPOT_BY_ID = new Map(DREAM_SPOTS.map((spot) => [spot.id, spot]));

export const dreamSpot = (set: StageSet): DreamSpot => SPOT_BY_ID.get(setLocation(set).id) ?? DREAM_SPOTS[0];

/** What the rider is hitting at the spot now. */
export function dreamLine(state: ExplorerState): DreamLine {
  const { lines } = dreamSpot(state.set);
  return lines.find((line) => (!line.set || line.set === state.set) && line.mode === state.mode && (line.mode === 'flatground' ? line.obstacle === state.obstacle : line.rail === state.rail)) ?? lines[0];
}

/** Hit something else at the spot, keeping the trick or grind picked for each. */
export function withDreamLine(state: ExplorerState, line: DreamLine): ExplorerState {
  const moved = line.set ? withSet(state, line.set) : state;
  return line.mode === 'flatground'
    ? { ...withMode(moved, 'flatground'), obstacle: line.obstacle }
    : { ...withMode(moved, 'grinds'), rail: line.rail, obstacle: line.obstacle };
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
  if (!SPOT_BY_ID.has(setLocation(state.set).id)) state = withSet(state, DREAM_DEFAULT.set);
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
  { id: CLASSIC_SHOT, label: 'Bottom', hint: 'Filmer at the bottom' },
  { id: 'tripod-side', label: 'Side', hint: 'Filmer beside the drop' },
  { id: 'tripod-top', label: 'Top', hint: 'Filmer at the top' },
  { id: 'follow', label: 'Behind', hint: 'Chasing from behind' },
  { id: 'side', label: 'Beside', hint: 'Rolling alongside' },
  { id: 'head-on', label: 'In front', hint: 'Backing away ahead of the rider' },
  { id: 'overhead', label: 'Above', hint: 'Looking down on the board' },
];

/** The starting points this spot offers for a camera of this kind: its filmers' stands, or angles round the rider. */
export const dreamShots = (state: Pick<ExplorerState, 'set' | 'camera'>, mode?: CameraMode): readonly DreamShot[] => {
  const available = new Set(cameraPresetsFor(state).map((preset) => preset.id));
  return SHOTS.filter((shot) => available.has(shot.id) && (!mode || (cameraPreset(shot.id).tripod != null) === (mode === 'tripod')));
};

// ----- Camera: it follows the skater, or it stays put -----

/**
 * There are only two cameras. One flies with the skater, wherever round
 * them the viewer swings it. The other is a tripod standing still somewhere
 * in the spot, turning to keep them in shot: at one of the spot's own
 * filmers' stands, or anywhere the viewer drags it on the map.
 */
export type CameraMode = 'follow' | 'tripod';

export const cameraMode = (state: Pick<ExplorerState, 'set' | 'camera' | 'stand'>): CameraMode =>
  state.stand || sceneTripod(state) ? 'tripod' : 'follow';

/** A point in a spot seen from above, in stage units: along the drop from its lip, and across the set. */
export interface MapPoint {
  u: number;
  z: number;
}

/** How high a placed tripod's lens can stand over the ground: lying on it, up to a ladder or a roof's edge. */
export const STAND_HEIGHT = Object.freeze({ min: 1 * FOOT, max: 24 * FOOT, eye: 5 * FOOT });
/** How long a lens a placed tripod takes: the distance it shows the rider at the crane's size from. */
const STAND_FRAME = Object.freeze({ min: 14 * FOOT, max: 90 * FOOT });

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Where the rider is on their line at a moment of the attempt. */
export function pathAt(path: ReadonlyArray<MapPoint & { t: number }>, t: number): MapPoint {
  if (path.length === 0) return { u: 0, z: 0 };
  const next = path.findIndex((point) => point.t >= t);
  if (next <= 0) return next === 0 ? path[0] : path[path.length - 1];
  const a = path[next - 1];
  const b = path[next];
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return { u: a.u + (b.u - a.u) * k, z: a.z + (b.z - a.z) * k };
}

/** Where the trick itself happens: halfway between the pop and the last moment worth jumping to (the landing). */
export function actionPoint(path: ReadonlyArray<MapPoint & { t: number }>, phases: readonly Phase[]): MapPoint {
  const pop = phases.find((phase) => phase.label === 'Pop')?.time ?? 0;
  const land = phases[phases.length - 1]?.time ?? pop;
  return pathAt(path, (pop + land) / 2);
}

/** A placed tripod frames a little wider than the crane does, so the spot it stands in is in the picture too. */
const STAND_WIDE = 0.8;

/** The lens a tripod standing `at` takes, so the trick is framed the same from wherever it's stood. */
export const standFrame = (at: MapPoint, action: MapPoint): number =>
  clamp(Math.hypot(at.u - action.u, at.z - action.z) * STAND_WIDE, STAND_FRAME.min, STAND_FRAME.max);

/** The tripod moved to another point on the map, keeping its height. */
export const placeStand = (stand: TripodSpot, to: MapPoint, action: MapPoint): TripodSpot =>
  ({ ...stand, u: to.u, z: to.z, frame: standFrame(to, action) });

/** A stretch of a spot seen from above: along the drop, and across the set. */
export interface MapWindow {
  u0: number;
  u1: number;
  z0: number;
  z1: number;
}

/** Room the map keeps round the rider's line and the filmers: past its ends, and to its sides (where a tripod mostly goes). */
const MAP_PAD = Object.freeze({ along: 16 * FOOT, beside: 24 * FOOT });
/** The map is never narrower across than this, nor an odder shape than these (along over across). */
const MAP_DEPTH = 64 * FOOT;
const MAP_SHAPE = Object.freeze({ min: 1.45, max: 2 });
/** Its edges fall on this grid, so the map holds still from one trick to the next. */
const MAP_GRID = 4 * FOOT;

/**
 * The part of a spot the camera map shows: the rider's line and the spot's
 * own filmers with room round them to stand a tripod, kept inside what the
 * spot's plan covers (`within`).
 */
export function mapWindow(within: MapWindow, points: readonly MapPoint[]): MapWindow {
  if (points.length === 0) return within;
  let u0 = Math.min(...points.map((point) => point.u)) - MAP_PAD.along;
  let u1 = Math.max(...points.map((point) => point.u)) + MAP_PAD.along;
  let z0 = Math.min(...points.map((point) => point.z)) - MAP_PAD.beside;
  let z1 = Math.max(...points.map((point) => point.z)) + MAP_PAD.beside;
  const grow = (low: number, high: number, to: number): [number, number] => {
    const more = Math.max(0, to - (high - low)) / 2;
    return [low - more, high + more];
  };
  [z0, z1] = grow(z0, z1, MAP_DEPTH);
  [z0, z1] = grow(z0, z1, (u1 - u0) / MAP_SHAPE.max);
  [u0, u1] = grow(u0, u1, (z1 - z0) * MAP_SHAPE.min);
  const snap = (value: number, round: (x: number) => number) => round(value / MAP_GRID) * MAP_GRID;
  return {
    u0: Math.max(within.u0, snap(u0, Math.floor)),
    u1: Math.min(within.u1, snap(u1, Math.ceil)),
    z0: Math.max(within.z0, snap(z0, Math.floor)),
    z1: Math.min(within.z1, snap(z1, Math.ceil)),
  };
}

/** A point kept inside a window, a margin in from its edges. */
export const insideWindow = (point: MapPoint, window: MapWindow, margin = 0): MapPoint => ({
  u: clamp(point.u, window.u0 + margin, window.u1 - margin),
  z: clamp(point.z, window.z0 + margin, window.z1 - margin),
});

/** Feet the lens rises per degree a drag would tilt the crane. */
const SWING_RISE = 0.2 * FOOT;

/**
 * The tripod swung round the trick, as a drag across the picture swings the
 * crane round the rider: `yaw` degrees about where the trick happens, and
 * its lens raised as far as `pitch` degrees would lift the crane.
 */
export function swingStand(stand: TripodSpot, action: MapPoint, yaw: number, pitch: number): TripodSpot {
  const du = stand.u - action.u;
  const dz = stand.z - action.z;
  const reach = Math.hypot(du, dz);
  const angle = Math.atan2(-du, dz) + (yaw * Math.PI) / 180;
  return {
    ...stand,
    u: action.u - reach * Math.sin(angle),
    z: action.z + reach * Math.cos(angle),
    height: clamp(stand.height + pitch * SWING_RISE, STAND_HEIGHT.min, STAND_HEIGHT.max),
  };
}

/** Where the crane hangs round the rider, seen from above: its angle and reach as a point off them. */
export function followOffset(camera: SceneCamera, reach: number): MapPoint {
  const a = (camera.yaw * Math.PI) / 180;
  const flat = reach * camera.lens * Math.cos((camera.pitch * Math.PI) / 180);
  return { u: -flat * Math.sin(a), z: flat * Math.cos(a) };
}

/** The crane angle that hangs it over this point off the rider. */
export const followYaw = (offset: MapPoint): number => wrapOrbitYaw((Math.atan2(-offset.u, offset.z) * 180) / Math.PI);

/**
 * Where the spot's own filmer for the shot on stage stands, as a tripod the
 * viewer can then drag: its lens's height over the ground there (`groundAt`
 * reads the spot's plan). Null on the crane, or with a tripod already placed.
 */
export function presetStand(state: ExplorerState, groundAt: (u: number, z: number) => number): TripodSpot | null {
  const tripod = sceneTripod(state);
  const own = tripod && spotStands(state.set, filmedLine(state), state.cameraSide)?.[tripod];
  if (!own) return null;
  return { u: own.u, z: own.z, height: clamp(own.y - groundAt(own.u, own.z), STAND_HEIGHT.min, STAND_HEIGHT.max), frame: own.frame };
}
