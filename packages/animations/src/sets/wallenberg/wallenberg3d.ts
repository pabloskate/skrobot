import { ClassicSpot3D } from '../classicSpot3d';
import type { SceneCamera, TripodId } from '../../camera/camera';
import type { StageFrame } from '../../stage/stage';
import { buildWallenbergGeometry } from './wallenbergGeometry';
import { WALLENBERG_DROP, WALLENBERG_FILMERS, WALLENBERG_LANE_Z, WALLENBERG_RUN, wallenbergGround } from './wallenbergLayout';
import { wallenbergView } from './wallenbergCamera';

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
    });
  }

  override view(frame: StageFrame, camera: Readonly<SceneCamera>, zoom: number, aspect: number, tripod: TripodId | null) {
    if (tripod || !frame.stairs) return super.view(frame, camera, zoom, aspect, tripod);
    return wallenbergView(frame.lift, frame.scroll, camera, zoom, aspect);
  }
}

export const buildWallenberg3D = () => new Wallenberg3D();
