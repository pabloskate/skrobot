import { CARLSBAD_LOOK } from '../carlsbad/carlsbad3d';
import { ClassicSpot3D } from '../classicSpot3d';
import type { SpotLook } from '../surfaces';
import { buildEmageGeometry } from './emageGeometry';
import * as PAINT from './emagePalette';
import { emageTrees } from './emageTrees';
import { EMAGE_DROP, EMAGE_FILMERS, EMAGE_FOOT as F, EMAGE_LANE_Z, EMAGE_RUN, emageGround } from './emageLayout';

/**
 * Denver's dry, clear river-valley daylight (the listing photographs, refs 01-07): Carlsbad's soft light with a
 * thinner, cooler haze, so downtown keeps its tone. The terraces' concrete weathers per pixel (`walls`: cast, so it
 * only stains: splash-back at the foot, a few runs, the arris chipped pale); the beds are grey gravel (`asphalt`'s
 * aggregate at gravel size); the plaza is cast in panels (`pavers` at panel size, each pour its own tone); boards
 * leave urethane where they roll to the lip and land on the apron (`marks`). The half-steps alternate, so the
 * uniform-flight stair wear (`stairs`) can't serve them; Carlsbad's sash, and every option Emage doesn't use, stay off.
 */
export const EMAGE_LOOK: SpotLook = {
  ...CARLSBAD_LOOK,
  haze: { color: PAINT.RIVER_HAZE, from: 80, to: 1500, amount: 0.42 },
  marks: [{ x: [-14, -0.5], z: [-3.5, 3.5] }, { x: [23, 40], z: [-6, 6] }],
  markDepth: 0.16,
  walls: { bare: PAINT.CONCRETE, damp: 0.45, scale: 1.3 },
  asphalt: { scale: 0.05, contrast: 0.16 },
  pavers: { size: 10.4, joint: 0.05, jointColor: PAINT.PLAZA_JOINT, paint: PAINT.PLAZA, spread: 0.025 },
  foliage: true,
  stairs: undefined, sash: undefined, lockers: undefined, brick: undefined, gum: undefined, mortar: undefined,
};

/**
 * Emage 20 in Denver: the riverside twenty, its side rail and the terraces beside it, the bridge, the river and
 * the apartments round the plaza. Its filmers stand on the trail, on the bank and at the top (emageLayout.ts).
 */
export class Emage3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildEmageGeometry, laneZ: EMAGE_LANE_Z, ground: emageGround,
      grade: EMAGE_DROP / EMAGE_RUN, run: EMAGE_RUN, drop: EMAGE_DROP,
      framing: 0.88,
      cameraZ: [-40 * F, 35 * F], stayUp: ['stairs'],
      streetProps: { trees: emageTrees() },
      filmers: EMAGE_FILMERS, look: EMAGE_LOOK,
    });
  }
}
