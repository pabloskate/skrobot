import { ClassicSpot3D } from '../classicSpot3d';
import type { SceneCamera, TripodId } from '../../camera/camera';
import type { StageFrame } from '../../stage/stage';
import { buildWallenbergGeometry } from './wallenbergGeometry';
import { FOOT, WALLENBERG_DROP, WALLENBERG_LANE_Z, WALLENBERG_RUN, wallenbergGround } from './wallenbergLayout';
import { wallenbergView } from './wallenbergCamera';

/** Wallenberg's four asphalt terraces and weathered white curbs in their schoolyard. */
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
        bottom: { u: WALLENBERG_RUN + 27 * FOOT, z: 9 * FOOT, height: 3 * FOOT - WALLENBERG_DROP, frame: 21 * FOOT, place: 0.4 },
        side: { u: WALLENBERG_RUN + 9 * FOOT, z: 34 * FOOT, height: 10 * FOOT - WALLENBERG_DROP, frame: 20 * FOOT, place: 0.44 },
        top: { u: -8 * FOOT, z: 16 * FOOT, height: 6.5 * FOOT, frame: 22 * FOOT, place: 0.46 },
      },
    });
  }

  override view(frame: StageFrame, camera: Readonly<SceneCamera>, zoom: number, aspect: number, tripod: TripodId | null) {
    if (tripod || !frame.stairs) return super.view(frame, camera, zoom, aspect, tripod);
    return wallenbergView(frame.lift, frame.scroll, camera, zoom, aspect);
  }
}

export const buildWallenberg3D = () => new Wallenberg3D();
