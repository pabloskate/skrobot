import { ClassicSpot3D } from '../classicSpot3d';
import type { SceneCamera, TripodId } from '../../camera/camera';
import type { StageFrame } from '../../stage/stage';
import { CARLSBAD_LOOK } from '../carlsbad/carlsbad3d';
import type { SpotLook } from '../surfaces';
import { buildWallenbergGeometry } from './wallenbergGeometry';
import { WALLENBERG_DROP, WALLENBERG_FILMERS, WALLENBERG_LANE_Z, WALLENBERG_RUN, wallenbergGround } from './wallenbergLayout';
import { wallenbergView } from './wallenbergCamera';
import { WALLENBERG_PAINT as PAINT } from './wallenbergPalette';
import { WALLENBERG_CARS, WALLENBERG_TREES } from './wallenbergTrees';

/**
 * San Francisco's clear afternoon light, cooler and hazier than Carlsbad's (the 2020 FindSkateSpots
 * photograph, the 2024 group photograph): the realistic look, with the gym's painted block and brick.
 */
export const WALLENBERG_LOOK: SpotLook = {
  ...CARLSBAD_LOOK,
  haze: { color: '#cfd8dd', from: 45, to: 800, amount: 0.55 },
  // The curbs' caps and faces carry their own wear (wallenbergWear.ts); the treads are asphalt, which the
  // marks never touch.
  marks: [],
  gum: 2,
  // The gym's painted block: joints a shade under the cream, filled by coats of paint.
  mortar: '#b09675',
  // Common brick, 8 x 2 1/4 in on 3/8 in joints, pale mortar (the FindSkateSpots photograph).
  brick: { length: 8 / 12, height: 2.25 / 12, joint: 0.375 / 12, mortar: PAINT.mortar, paint: PAINT.brick, spread: 0.1 },
  // Schoolyard asphalt, sealed and worn smooth.
  asphalt: { scale: 0.025, contrast: 0.12 },
  foliage: true,
  sash: undefined,
};

/**
 * Wallenberg: the roll-in down the alley beside the gym, then the four
 * curbs, in their schoolyard. Its filmers stand where the photographs were
 * taken: out on the street straight up the line, on the court side below
 * the blocks' rounded ends, and beside the lip looking up the alley.
 */
export class Wallenberg3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildWallenbergGeometry,
      laneZ: WALLENBERG_LANE_Z,
      ground: wallenbergGround,
      grade: WALLENBERG_DROP / WALLENBERG_RUN,
      run: WALLENBERG_RUN,
      drop: WALLENBERG_DROP,
      filmers: WALLENBERG_FILMERS,
      streetProps: { trees: WALLENBERG_TREES, cars: WALLENBERG_CARS },
      look: WALLENBERG_LOOK,
    });
  }

  override view(frame: StageFrame, camera: Readonly<SceneCamera>, zoom: number, aspect: number, tripod: TripodId | null) {
    if (tripod || !frame.stairs) return super.view(frame, camera, zoom, aspect, tripod);
    return wallenbergView(frame.lift, frame.scroll, camera, zoom, aspect);
  }
}

export const buildWallenberg3D = () => new Wallenberg3D();
