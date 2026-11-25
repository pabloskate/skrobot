import { ClassicSpot3D } from '../classicSpot3d';
import { BASE_LOOK, type SpotLook } from '../surfaces';
import { buildWaterTowerGeometry } from './waterTowerGeometry';
import { WATER_TOWER_FILMERS, WATER_TOWER_GAP, WATER_TOWER_LANE_Z, waterTowerGround } from './waterTowerLayout';
import { WATER_TOWER_PAINT as PAINT, WATER_TOWER_SCRUB } from './waterTowerPalette';
import { WATER_TOWER_CARS, WATER_TOWER_TREES } from './waterTowerTrees';

/**
 * A dry, clear inland morning (the 1997 footage): the realistic look, hazing toward the hills, with the tanks'
 * cast walls worn per pixel, the pad's fresh asphalt and the slopes' dry scrub.
 */
export const WATER_TOWER_LOOK: SpotLook = {
  ...BASE_LOOK,
  haze: { color: '#d6d6c8', from: 60, to: 900, amount: 0.33 },
  // Nobody skated here before that morning: no urethane on the roofs.
  marks: [],
  // Cast concrete a storey high: runs from under the soffit, a damp band at the foot, upright form boards each a
  // touch their own tone (03, 65, 66).
  walls: { bare: PAINT.wallBare, damp: 0.45, fall: 2.5, scale: 5 },
  // Fresh dark asphalt, fine and close (03, 66).
  asphalt: { scale: 0.028, contrast: 0.12 },
  scrub: WATER_TOWER_SCRUB,
  foliage: true,
};

/**
 * The water tower gap: two reservoirs and the slot between them, under the
 * hillside it was filmed from. Its filmers stand where the pictures were
 * taken (waterTowerLayout.ts).
 */
export class WaterTower3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildWaterTowerGeometry,
      laneZ: WATER_TOWER_LANE_Z,
      ground: waterTowerGround,
      // Roof to roof on the level: nothing to pitch the crane down after.
      grade: 0,
      run: WATER_TOWER_GAP,
      drop: 0,
      filmers: WATER_TOWER_FILMERS,
      look: WATER_TOWER_LOOK,
      streetProps: { trees: WATER_TOWER_TREES, cars: WATER_TOWER_CARS },
    });
  }
}
