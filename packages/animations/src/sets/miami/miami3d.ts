import { ClassicSpot3D } from '../classicSpot3d';
import { CARLSBAD_LOOK } from '../carlsbad/carlsbad3d';
import type { SpotLook } from '../surfaces';
import { buildMiamiGeometry } from './miamiGeometry';
import {
  MIAMI_DROP, MIAMI_FILMERS, MIAMI_SLAB_GRADE, MIAMI_SLAB_LIP_X, miamiGround,
} from './miamiLayout';
import { MIAMI_PAINT as PAINT } from './miamiPalette';
import { MIAMI_CARS, MIAMI_TREES, miamiCanopies } from './miamiTrees';

export { buildMiamiGeometry } from './miamiGeometry';
export { MIAMI_TRAFFIC } from './miamiTrees';

/**
 * Bay-front Miami's light: a high subtropical sun through humid air, hazier and bluer at a distance than
 * Carlsbad's, the shade lifted by bright paving (the clips in docs/MIAMI_TRIANGLE_REFERENCE.md). The realistic
 * look, with the plaza's clay pavers and the boulevard's asphalt.
 */
export const MIAMI_LOOK: SpotLook = {
  ...CARLSBAD_LOOK,
  haze: { color: '#d3dde1', from: 60, to: 1100, amount: 0.55 },
  fill: { sky: 0.72, bounce: 0.95 },
  // Urethane marks where the bank line rolls off onto the pavers and the over line lands and rolls away.
  marks: [{ x: [13, 32], z: [-3.5, 3.5] }],
  markDepth: 0.16,
  gum: 1.5,
  // Square clay pavers about eight inches, on pale sanded joints (Muska's and Edge's frames).
  pavers: { size: 7.6 / 12, joint: 0.4 / 12, jointColor: PAINT.joint, paint: PAINT.paver, spread: 0.09 },
  asphalt: { scale: 0.028, contrast: 0.13 },
  foliage: true,
  sash: undefined,
};

export class Miami3D extends ClassicSpot3D {
  constructor() {
    super({
      build: () => {
        const built = buildMiamiGeometry();
        return { ...built, canopies: miamiCanopies(built.canopies) };
      },
      laneZ: 0, ground: miamiGround,
      grade: MIAMI_SLAB_GRADE, run: MIAMI_SLAB_LIP_X, drop: MIAMI_DROP,
      framing: 0.85,
      streetProps: { cars: MIAMI_CARS, trees: MIAMI_TREES },
      filmers: MIAMI_FILMERS,
      look: MIAMI_LOOK,
    });
  }
}

export const createMiami = () => new Miami3D();
