import type { DropTerrain } from '../elToro/stairs';
import { SET_FOOT as F } from '../setScale';
import { smoothstep } from '../../math';

/** Classic Roessler/UC Davis ivy gap. Henry Luc's 2008 on-site study
 * estimates 24′4″ across and ~10′ down from the adjacent nine-flat-nine.
 * These are a documented approximation, not a survey. All other dimensions
 * are photo-derived modeling choices: docs/UC_DAVIS_REFERENCE.md. */
export const UC_DAVIS_FOOT = F;
export const UC_DAVIS_DROP = 10 * F;
export const UC_DAVIS_RUN = (24 + 4 / 12) * F;
export const UC_DAVIS_LANE_Z = 0;
/** Looking uphill from the landing, +z is left: the building ends here.
 * The sole access stair is to the right (negative z). */
export const UC_DAVIS_BANK_Z0 = -25 * F;
export const UC_DAVIS_BANK_Z1 = 16 * F;
export const UC_DAVIS_STAIR_Z0 = -34 * F;
export const UC_DAVIS_STAIR_Z1 = UC_DAVIS_BANK_Z0;
export const UC_DAVIS_STEPS_PER_FLIGHT = 9;
export const UC_DAVIS_STAIR_FLIGHT = 9 * F;
export const UC_DAVIS_STAIR_MID_END = UC_DAVIS_RUN - UC_DAVIS_STAIR_FLIGHT;
export const UC_DAVIS_RISER = UC_DAVIS_DROP / (2 * UC_DAVIS_STEPS_PER_FLIGHT);
export const UC_DAVIS_TREAD = UC_DAVIS_STAIR_FLIGHT / (UC_DAVIS_STEPS_PER_FLIGHT - 1);
export const UC_DAVIS_PLANTER_X = 0;
export const UC_DAVIS_PLANTER_Z = 8 * F;
export const UC_DAVIS_PLANTER_RADIUS = 5.5 * F;
export const UC_DAVIS_PLANTER_TOP = -0.1 * F;
export const UC_DAVIS_PLANTER_BASE = -2.7 * F;
/** The red facade faces the landing, across the back of the narrow walk.
 * It continues right past the stair, and ends at the left corner. */
export const UC_DAVIS_BUILDING_Z0 = -95 * F;
export const UC_DAVIS_BUILDING_Z1 = UC_DAVIS_BANK_Z1;
export const UC_DAVIS_BUILDING_FRONT_X = -7 * F;
export const UC_DAVIS_BUILDING_BACK_X = UC_DAVIS_BUILDING_FRONT_X - 48 * F;
/** Open hallway through the facade, aligned with the straight jump line. */
export const UC_DAVIS_HALL_HALF_WIDTH = 3 * F;
export const UC_DAVIS_ROOF_BOTTOM = 12.3 * F;
export const UC_DAVIS_ROOF_TOP = 14.4 * F;
export const UC_DAVIS_ROOF_FRONT_X = 0.4 * F;
/** Photo-derived planting width beside the building. The bed and its low
 * curb curve around the corner; the facade end is not a terrain cutoff. */
export const UC_DAVIS_WRAP_WIDTH = 12 * F;
export const UC_DAVIS_WRAP_Z = UC_DAVIS_BUILDING_Z1 + UC_DAVIS_WRAP_WIDTH;
export const UC_DAVIS_WRAP_BACK_X = UC_DAVIS_BUILDING_BACK_X - 12 * F;
export const UC_DAVIS_CURB_TOP = -UC_DAVIS_DROP + 0.4 * F;

/** The rounded planting bed bows out furthest on the jump line. */
export const ucDavisBankEnd = (z: number) => UC_DAVIS_RUN - 3 * F * (z / Math.abs(UC_DAVIS_BANK_Z0)) ** 2;

/** Bare earth beneath the ivy, with a small lip below the concrete walk. */
export function ucDavisBank(x: number, z: number): number {
  const t = Math.max(0, Math.min(1, x / ucDavisBankEnd(z)));
  return -0.65 * F + t * (-UC_DAVIS_DROP + 1.05 * F);
}

/** Inside edge of the side bed: level against the building, easing down
 * past the terrace's end to the small drop below the takeoff lip. Behind
 * the building it settles into the lower ground, avoiding another cut face. */
export function ucDavisSideBankTop(x: number): number {
  if (x < UC_DAVIS_BUILDING_BACK_X) {
    return UC_DAVIS_CURB_TOP * smoothstep((UC_DAVIS_BUILDING_BACK_X - x) / (UC_DAVIS_BUILDING_BACK_X - UC_DAVIS_WRAP_BACK_X));
  }
  return -0.65 * F * smoothstep((x - UC_DAVIS_BUILDING_FRONT_X) / -UC_DAVIS_BUILDING_FRONT_X);
}

/** Curb around the front-left corner, from the main toe to the side path. */
export const ucDavisCornerPoint = (angle: number) => ({
  x: ucDavisBankEnd(UC_DAVIS_BANK_Z1) * Math.cos(angle),
  z: UC_DAVIS_BANK_Z1 + UC_DAVIS_WRAP_WIDTH * Math.sin(angle),
});

/** The outer edge of the rounded front corner at a given lateral z. */
export const ucDavisCornerEnd = (z: number) => ucDavisBankEnd(UC_DAVIS_BANK_Z1)
  * Math.sqrt(Math.max(0, 1 - ((z - UC_DAVIS_BANK_Z1) / UC_DAVIS_WRAP_WIDTH) ** 2));

/** Sloping soil around the corner and alongside the building; null on the
 * surrounding path. At z=bankZ1 this exactly meets the main bank's height. */
export function ucDavisWrapSurface(x: number, z: number): number | null {
  if (z < UC_DAVIS_BANK_Z1 || z > UC_DAVIS_WRAP_Z || x < UC_DAVIS_WRAP_BACK_X) return null;
  const across = (z - UC_DAVIS_BANK_Z1) / UC_DAVIS_WRAP_WIDTH;
  const t = x <= 0 ? across : Math.hypot(x / ucDavisBankEnd(UC_DAVIS_BANK_Z1), across);
  if (t > 1 + 1e-9) return null;
  const top = x <= 0 ? ucDavisSideBankTop(x) : -0.65 * F;
  return top + (UC_DAVIS_CURB_TOP - top) * Math.min(1, t);
}

/** Nine risers, a level landing, then nine more; no rail through the gap. */
export function ucDavisStairGround(x: number): number {
  if (x <= 0) return 0;
  if (x >= UC_DAVIS_RUN) return -UC_DAVIS_DROP;
  if (x < UC_DAVIS_STAIR_FLIGHT) return -(Math.floor(x / UC_DAVIS_TREAD) + 1) * UC_DAVIS_RISER;
  if (x <= UC_DAVIS_STAIR_MID_END) return -UC_DAVIS_DROP / 2;
  return -UC_DAVIS_DROP / 2 - (Math.floor((x - UC_DAVIS_STAIR_MID_END) / UC_DAVIS_TREAD) + 1) * UC_DAVIS_RISER;
}

/** A semicircular rock planter beside the launch, never on the rider's line. */
export function ucDavisOnPlanter(x: number, z: number): boolean {
  return x >= UC_DAVIS_PLANTER_X && Math.hypot(x - UC_DAVIS_PLANTER_X, z - UC_DAVIS_PLANTER_Z) <= UC_DAVIS_PLANTER_RADIUS;
}

/** The same physical surface is used for flight clearance and shadows. */
export function ucDavisSurface(x: number, z: number): number {
  if (x >= UC_DAVIS_BUILDING_BACK_X && x <= UC_DAVIS_BUILDING_FRONT_X && Math.abs(z) <= UC_DAVIS_HALL_HALF_WIDTH) return 0;
  if (x >= UC_DAVIS_BUILDING_FRONT_X && x <= 0 && z >= UC_DAVIS_BUILDING_Z0 && z <= UC_DAVIS_BANK_Z1) return 0;
  if (z >= UC_DAVIS_STAIR_Z0 && z <= UC_DAVIS_STAIR_Z1) return ucDavisStairGround(x);
  if (ucDavisOnPlanter(x, z)) {
    const radius = Math.hypot(x - UC_DAVIS_PLANTER_X, z - UC_DAVIS_PLANTER_Z);
    return radius > UC_DAVIS_PLANTER_RADIUS - 0.4 * F ? UC_DAVIS_PLANTER_TOP : -0.35 * F;
  }
  if (x > 0 && z >= UC_DAVIS_BANK_Z0 && z < UC_DAVIS_BANK_Z1 && x < ucDavisBankEnd(z)) return ucDavisBank(x, z);
  const wrapped = ucDavisWrapSurface(x, z);
  if (wrapped != null) return wrapped;
  return -UC_DAVIS_DROP;
}

export const ucDavisGround = (x: number) => ucDavisSurface(x, UC_DAVIS_LANE_Z);

export const UC_DAVIS_TERRAIN: DropTerrain = {
  drop: UC_DAVIS_DROP,
  run: UC_DAVIS_RUN,
  landPast: 3 * F,
  laneZ: UC_DAVIS_LANE_Z,
  ground: ucDavisGround,
  surface: ucDavisSurface,
};
