import { ClassicSpot3D } from '../classicSpot3d';
import { buildEmageGeometry, emageTrees } from './emageGeometry';
import { EMAGE_DROP, EMAGE_FILMERS, EMAGE_FOOT as F, EMAGE_LANE_Z, EMAGE_RUN, emageGround } from './emageLayout';

export class Emage3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildEmageGeometry, laneZ: EMAGE_LANE_Z, ground: emageGround,
      grade: EMAGE_DROP / EMAGE_RUN, run: EMAGE_RUN, drop: EMAGE_DROP,
      framing: 0.88,
      cameraZ: [-40 * F, 35 * F], stayUp: ['stairs'],
      streetProps: { trees: emageTrees() },
      filmers: EMAGE_FILMERS,
    });
  }
}
