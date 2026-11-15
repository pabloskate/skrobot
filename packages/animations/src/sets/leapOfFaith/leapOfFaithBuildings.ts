import type { Bake } from '../../three/bake';
import { buildLeapOfFaithFacade } from './leapOfFaithFacade';
import { buildLeapOfFaithBlocks } from './leapOfFaithBlocks';
import { buildLeapOfFaithPlanting } from './leapOfFaithPlanting';

/**
 * The architecture round the gap, in WORLD axes and in feet at its builders' boundaries (x out from the facade
 * into the lower court, y up from the walkway, z along the facade; SITE_PLAN.md). Never reflect these bakes: only
 * the fixed stairs, rails and their wear still use the kit's legacy elevation convention. Its shadow boxes and
 * contact lines are picked in one place, leapOfFaithLight.ts.
 */

/**
 * Everything standing round the gap at the walkway's level and above it: the facade, gallery and undercroft,
 * the tall retaining wall, the left block and the right wing, and the planting on the wall's top. Refs 20, 82
 * and 91 (1998) and 05 (1997).
 */
export function buildLeapOfFaithBuildings(b: Bake) {
  buildLeapOfFaithFacade(b);
  buildLeapOfFaithBlocks(b);
  buildLeapOfFaithPlanting(b);
}
