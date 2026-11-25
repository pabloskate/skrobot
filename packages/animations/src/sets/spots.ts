import { CARLSBAD_SPOT } from './carlsbad/carlsbadSpot';
import { EL_TORO_SPOT } from './elToro/elToroSpot';
import { EMAGE_SPOT } from './emage/emageSpot';
import { HOLLYWOOD_12_SPOT, HOLLYWOOD_SPOT } from './hollywood/hollywoodSpot';
import { LEAP_OF_FAITH_SPOT } from './leapOfFaith/leapOfFaithSpot';
import { LYON_SPOT } from './lyon/lyonSpot';
import { MIAMI_SPOT } from './miami/miamiSpot';
import { defineSpot } from './spot';
import { SUNSET_SPOT } from './sunset/sunsetSpot';
import { UC_DAVIS_SPOT } from './ucDavis/ucDavisSpot';
import { WALLENBERG_SPOT } from './wallenberg/wallenbergSpot';
import { WATER_TOWER_SPOT } from './waterTower/waterTowerSpot';
import { WATERFRONT_SPOT } from './waterfront/waterfrontSpot';

/**
 * Every spot, in the order the pickers show them. Adding a spot is its
 * folder (a `<spot>Spot.ts` definition beside its layout and scenery), a
 * line here, and its scenery in three/setPieces.ts, which the compiler asks
 * for once the spot is listed.
 */

/** Flat ground and the flat bar, with no scenery to speak of: the stage's default. */
const PLAZA_SPOT = defineSpot({ id: 'plaza', label: 'Plaza', grinds: true, terrain: null });

export const SPOTS = [
  PLAZA_SPOT,
  WATERFRONT_SPOT,
  EL_TORO_SPOT,
  HOLLYWOOD_SPOT,
  HOLLYWOOD_12_SPOT,
  CARLSBAD_SPOT,
  WALLENBERG_SPOT,
  SUNSET_SPOT,
  LYON_SPOT,
  LEAP_OF_FAITH_SPOT,
  MIAMI_SPOT,
  UC_DAVIS_SPOT,
  EMAGE_SPOT,
  WATER_TOWER_SPOT,
] as const;

/** A spot's id. */
export type StageSet = (typeof SPOTS)[number]['id'];
