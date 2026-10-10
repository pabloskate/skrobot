import type { DropTerrain } from '../elToro/stairs';

/** Lyon's Cité Internationale. Exact gap dimensions supplied by the user;
 * architecture follows the photographs and film in docs/LYON_REFERENCE.md. */
export const LYON_FOOT = 29;
const F = LYON_FOOT;
export const LYON_STEPS = 25;
export const LYON_DROP = 14.76 * F;
/** Horizontal distance from the launch nosing to the last riser. */
export const LYON_RUN = 21.29 * F;
export const LYON_RISER = LYON_DROP / LYON_STEPS;
export const LYON_TREAD = LYON_RUN / (LYON_STEPS - 1);
export const LYON_GRADE = LYON_RISER / LYON_TREAD;
/** Commons' spot record lists twelve metres across; not a site survey. */
export const LYON_WIDTH = 12 / 0.3048 * F;
export const LYON_LEFT_Z = -LYON_WIDTH / 2;
export const LYON_RIGHT_Z = LYON_WIDTH / 2;
export const LYON_LANE_Z = 0;
export const LYON_BUILDING_FACE = LYON_RIGHT_Z;
export const LYON_BUILDING_TOP = 39 * F;
export const LYON_WALL_TOP = 0.65 * F;
export const LYON_PROMENADE_Y = 12 * F;
export const LYON_PROMENADE_Z = LYON_LEFT_Z - 24 * F;
export const LYON_REAR_X = -85 * F;

/** Twenty-five risers and twenty-four treads, with the open courtyard below. */
export function lyonGround(x: number): number {
  if (x < 0) return 0;
  if (x >= LYON_RUN) return -LYON_DROP;
  return -(Math.floor(x / LYON_TREAD) + 1) * LYON_RISER;
}

/** Ground only; the building and retaining wall are solid scenery. */
export function lyonSurface(x: number, z: number): number {
  if (z < LYON_PROMENADE_Z) return LYON_PROMENADE_Y;
  if (z < LYON_LEFT_Z) {
    const across = (LYON_LEFT_Z - z) / (LYON_LEFT_Z - LYON_PROMENADE_Z);
    return LYON_WALL_TOP + across * (LYON_PROMENADE_Y - LYON_WALL_TOP);
  }
  return lyonGround(x);
}

export const LYON_TERRAIN: DropTerrain = {
  drop: LYON_DROP, run: LYON_RUN, landPast: 5 * F,
  laneZ: LYON_LANE_Z, ground: lyonGround, surface: lyonSurface,
  runUp: 0.85,
};
