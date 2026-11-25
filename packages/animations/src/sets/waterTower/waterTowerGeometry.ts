import { Bake } from '../../three/bake';
import { canopiesFromTrees } from '../surfaces';
import { HATCH, roofFurniture, roadside, STUBS, transmissionTower, VENT, yard } from './waterTowerFixtures';
import { WATER_TOWER_FOOT as F, WATER_TOWER_LANDING_X, WATER_TOWER_TAKEOFF_X } from './waterTowerLayout';
import { buildings, landscape, sitePaths } from './waterTowerSite';
import { footingContacts, tank, thirdTank, type ShadowBox } from './waterTowerTanks';
import { WATER_TOWER_TREES } from './waterTowerTrees';
import { buildWaterTowerWear } from './waterTowerWear';

/**
 * The water tower gap's scenery, baked: the ground (pavement, slopes, road and both roofs, which take the rider's
 * shadow), the props (the tanks' edges and walls, the buildings and fixtures), and the decals a hair over the
 * ground (the roofs' joints, patches and stains, the slot's chalk line, the lane paint).
 */
export function buildWaterTowerGeometry() {
  const ground = new Bake(), props = new Bake(), decals = new Bake();
  const shadowBoxes: ShadowBox[] = [];
  landscape(ground);
  for (const centre of [WATER_TOWER_TAKEOFF_X, WATER_TOWER_LANDING_X]) tank(ground, props, shadowBoxes, centre / F);
  thirdTank(props);
  buildings(props);
  sitePaths(props);
  roofFurniture(props);
  roadside(props, decals);
  yard(props);
  transmissionTower(props);
  buildWaterTowerWear(decals, { vent: [VENT.x, VENT.z], hatch: [HATCH.x, HATCH.z], stubs: STUBS });
  return {
    ground: ground.geometry(),
    props: props.geometry(),
    decals: decals.geometry(),
    shadowBoxes,
    // The verge's eight street trees and the three clumps behind the takeoff tank: the trees near enough to dapple.
    canopies: canopiesFromTrees(WATER_TOWER_TREES.slice(0, 11)),
    // Where the footings' kerbs meet the pavement, through the slot.
    contacts: [WATER_TOWER_TAKEOFF_X, WATER_TOWER_LANDING_X].flatMap((centre) => footingContacts(centre / F)),
  };
}
