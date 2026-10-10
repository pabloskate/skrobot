import { ClassicSpot3D } from '../classicSpot3d';
import type { SceneCamera, TripodId } from '../../camera/camera';
import type { StageFrame } from '../../stage/stage';
import { buildWallenbergGeometry } from './wallenbergGeometry';
import { FOOT, WALLENBERG_DROP, WALLENBERG_LANE_Z, WALLENBERG_RUN, wallenbergGround, wallenbergLevel } from './wallenbergLayout';
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
      tripods: {
        bottom: { u: WALLENBERG_RUN + 24 * FOOT, z: 2 * FOOT, height: 4.5 * FOOT - WALLENBERG_DROP, frame: 21 * FOOT, place: 0.42 },
        side: { u: 9 * FOOT, z: -36 * FOOT, height: 6.5 * FOOT + wallenbergLevel(2), frame: 20 * FOOT, place: 0.44 },
        top: { u: -2 * FOOT, z: -9.5 * FOOT, height: 5.5 * FOOT, frame: 20 * FOOT, place: 0.46 },
      },
    });
  }

  override view(frame: StageFrame, camera: Readonly<SceneCamera>, zoom: number, aspect: number, tripod: TripodId | null) {
    if (tripod || !frame.stairs) return super.view(frame, camera, zoom, aspect, tripod);
    return wallenbergView(frame.lift, frame.scroll, camera, zoom, aspect);
  }
}

export const buildWallenberg3D = () => new Wallenberg3D();
