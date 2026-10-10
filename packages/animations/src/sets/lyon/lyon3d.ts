import { ClassicSpot3D } from '../classicSpot3d';
import { buildLyonGeometry } from './lyonGeometry';
import {
  LYON_DROP, LYON_FOOT as F, LYON_GRADE, LYON_LANE_Z,
  LYON_LEFT_Z, LYON_RIGHT_Z, LYON_RUN, lyonGround,
} from './lyonLayout';

export { buildLyonGeometry } from './lyonGeometry';

export class Lyon3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildLyonGeometry,
      laneZ: LYON_LANE_Z, ground: lyonGround,
      grade: LYON_GRADE, run: LYON_RUN, drop: LYON_DROP,
      // Keep the crane in the open canyon, clear of the projecting gallery
      // and of the full-height retaining wall on the park side.
      cameraZ: [LYON_LEFT_Z + 2 * F, LYON_RIGHT_Z - 8 * F],
      tripods: {
        bottom: { u: LYON_RUN + 32 * F, z: -7 * F, height: -LYON_DROP + 4 * F, frame: 29 * F, place: 0.43 },
        side: { u: LYON_RUN + 9 * F, z: LYON_LEFT_Z + 2.5 * F, height: -LYON_DROP + 5 * F, frame: 28 * F, place: 0.47 },
        top: { u: -7 * F, z: LYON_LEFT_Z + 3 * F, height: 6 * F, frame: 25 * F, place: 0.48 },
      },
    });
  }
}

export const buildLyon3D = () => new Lyon3D();
