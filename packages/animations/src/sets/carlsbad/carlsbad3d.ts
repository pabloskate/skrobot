import { ClassicSpot3D } from '../classicSpot3d';
import { buildCarlsbadGeometry } from './carlsbadGeometry';
import {
  CARLSBAD_DROP, CARLSBAD_FILMERS, CARLSBAD_FOOT as F, CARLSBAD_LANE_Z, CARLSBAD_RUN,
  carlsbadGround,
} from './carlsbadLayout';

export class Carlsbad3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildCarlsbadGeometry,
      laneZ: CARLSBAD_LANE_Z, ground: carlsbadGround,
      grade: CARLSBAD_DROP / CARLSBAD_RUN, run: CARLSBAD_RUN, drop: CARLSBAD_DROP,
      cameraZ: [-42 * F, 36 * F], stayUp: ['stairs'],
      filmers: CARLSBAD_FILMERS,
    });
  }
}
