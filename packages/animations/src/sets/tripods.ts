import type { CameraSide, TripodId } from '../camera/camera';
import type { Obstacle, StageSet } from './sets';
import { SET_FOOT } from './setScale';
import { CARLSBAD_FILMERS } from './carlsbad/carlsbadLayout';
import { EL_TORO_FILMERS } from './elToro/elToroLayout';
import { EMAGE_FILMERS } from './emage/emageLayout';
import { HOLLYWOOD_12_FILMERS, HOLLYWOOD_FILMERS } from './hollywood/hollywoodLayout';
import { LEAP_OF_FAITH_FILMERS } from './leapOfFaith/leapOfFaithLayout';
import { LYON_FILMERS } from './lyon/lyonLayout';
import { MIAMI_FILMERS } from './miami/miamiLayout';
import { SUNSET_FILMERS } from './sunset/sunsetLayout';
import { UC_DAVIS_FILMERS } from './ucDavis/ucDavisLayout';
import { WALLENBERG_FILMERS } from './wallenberg/wallenbergLayout';

/**
 * The filmers standing still at the landmarks, and which side of the
 * rider's line each stands on.
 *
 * Every spot's filmers stand where its reference footage was shot from,
 * each to one side of the line: never quite on it, or the rider would ride
 * into them. A viewer can ask for any of them on the other side instead.
 * Sides are the rider's, looking down the line the way they ride (+z is
 * their right), as the spots' side rails are named, so a filmer at the
 * bottom on the left stands on its own right as it looks back up.
 */

/**
 * Where a filmer stands, in the set's own layout (setScale.ts): along the
 * drop from the lip, across the set, and the lens's height over the top
 * landing; how far off its lens shows the rider at the crane's size; and
 * how far down the picture it holds them.
 */
export interface SpotTripod { u: number; z: number; height: number; frame: number; place: number }

/**
 * A spot's filmers for one way down: where each stands, and across the
 * rider's `line` (the z they ride down, in set units; at each u where it
 * runs at an angle) where each stands on the other side instead, wherever
 * the stand's mirror image across the line won't do (in a wall, behind
 * the stair block, up in the air).
 */
export interface SpotTripods {
  line: number | ((u: number) => number);
  stands: Readonly<Record<TripodId, SpotTripod>>;
  across?: Readonly<Partial<Record<TripodId, SpotTripod>>>;
}

/** Where the rider's line runs across the set `u` along it. */
const lineAt = (tripods: SpotTripods, u: number) => typeof tripods.line === 'number' ? tripods.line : tripods.line(u);

/** All of a spot's filmers: for its main way down, and where they move for another obstacle or for a grind down one of its ledges. */
export interface SpotFilmers {
  stairs: SpotTripods;
  obstacles?: Readonly<Partial<Record<Obstacle, SpotTripods>>>;
  ledges?: Readonly<Record<'left' | 'right', SpotTripods>>;
}

/** What a frame is filming at a spot: a flatground trick over one of its obstacles, or a grind down one of its ledges. */
export interface FilmedLine {
  obstacle?: Obstacle;
  ledge?: 'left' | 'right';
}

/** The filmers for this line: a ledge's own, an obstacle's own, or the spot's main ones. */
export const filmersFor = (filmers: SpotFilmers, at: FilmedLine): SpotTripods =>
  (at.ledge && filmers.ledges?.[at.ledge]) || (at.obstacle && filmers.obstacles?.[at.obstacle]) || filmers.stairs;

/** The side of the line a spot's own filmer stands. */
export function standSide(tripods: SpotTripods, tripod: TripodId): CameraSide {
  const { u, z } = tripods.stands[tripod];
  return z < lineAt(tripods, u) ? 'left' : 'right';
}

/** Across the line, a filmer stands at least this far off it, so the picture changes even where its own stands nearly on it. */
const ACROSS_OFF = 4 * SET_FOOT;

/**
 * Where the filmer for `tripod` stands on `side` of the line; omitted,
 * wherever its own does. On the other side, where the spot doesn't say,
 * it's its own stand's mirror image across the line.
 */
export function tripodStand(tripods: SpotTripods, tripod: TripodId, side?: CameraSide): SpotTripod {
  const own = tripods.stands[tripod];
  if (!side || side === standSide(tripods, tripod)) return own;
  const authored = tripods.across?.[tripod];
  if (authored) return authored;
  const line = lineAt(tripods, own.u);
  const off = Math.max(Math.abs(own.z - line), ACROSS_OFF);
  return { ...own, z: side === 'left' ? line - off : line + off };
}

const FILMERS: Readonly<Partial<Record<StageSet, SpotFilmers>>> = {
  'el-toro': EL_TORO_FILMERS,
  'hollywood-high': HOLLYWOOD_FILMERS,
  'hollywood-high-12': HOLLYWOOD_12_FILMERS,
  wallenberg: WALLENBERG_FILMERS,
  'sunset-car-wash': SUNSET_FILMERS,
  'lyon-25': LYON_FILMERS,
  'leap-of-faith': LEAP_OF_FAITH_FILMERS,
  'miami-triangle': MIAMI_FILMERS,
  'uc-davis-gap': UC_DAVIS_FILMERS,
  'carlsbad-gap': CARLSBAD_FILMERS,
  'emage-20': EMAGE_FILMERS,
};

/** A spot's filmers; null where it has none (the crane films everything there). */
export const setFilmers = (set: StageSet): SpotFilmers | null => FILMERS[set] ?? null;

/**
 * The side of the rider's line the spot's own `tripod` stands on, filming
 * this line; null where the spot has no such filmer.
 */
export function tripodSide(set: StageSet, tripod: TripodId, at: FilmedLine = {}): CameraSide | null {
  const filmers = setFilmers(set);
  return filmers ? standSide(filmersFor(filmers, at), tripod) : null;
}
