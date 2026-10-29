import { ClassicSpot3D } from '../classicSpot3d';
import { buildLyonGeometry } from './lyonGeometry';
import {
  LYON_DROP, LYON_FILMERS, LYON_FOOT as F, LYON_GRADE, LYON_LANE_Z,
  LYON_LEFT_Z, LYON_RIGHT_Z, LYON_RUN, lyonGround,
} from './lyonLayout';

export { buildLyonGeometry } from './lyonGeometry';

export class Lyon3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildLyonGeometry,
      laneZ: LYON_LANE_Z, ground: lyonGround,
      grade: LYON_GRADE, run: LYON_RUN, drop: LYON_DROP,
      // Keep the crane in the open courtyard, clear of the low-rise blocks
      // and of the full-height retaining wall on the park side.
      cameraZ: [LYON_LEFT_Z + 2 * F, LYON_RIGHT_Z - 8 * F],
      filmers: LYON_FILMERS,
    });
  }
}

export const buildLyon3D = () => new Lyon3D();
