import { FOOT } from '../elToro/stairs';

/**
 * Sunset Car Wash, its skateable 2019 appearance. Dimensions are photo-based
 * reconstruction estimates, not a survey; see docs/SUNSET_REFERENCE.md.
 * +x runs downhill toward Sunset Boulevard. Facing the wash from the street,
 * -z is right: the rider follows -z along the roof, then turns downhill.
 */
/** Recalibrated against the rider in the supplied wide shot; still a photo estimate. */
export const SUNSET_SCALE = 1.5;
const UNIT = FOOT * SUNSET_SCALE;
export const SUNSET_DROP = 12 * UNIT;
export const SUNSET_BANK_START = 0;
export const SUNSET_BANK_END = 8 * UNIT;
export const SUNSET_BANK_TOP = -4 * UNIT;
export const SUNSET_LAND_X = 2 * UNIT;
export const SUNSET_LANE_Z = -12 * UNIT;
/** The bank meets the sidewalk through a short rounded concrete toe. */
export const SUNSET_TOE_LENGTH = 1.2 * UNIT;
export const SUNSET_TOE_START = SUNSET_BANK_END - SUNSET_TOE_LENGTH;
export const SUNSET_GRADE = (SUNSET_DROP + SUNSET_BANK_TOP) / (SUNSET_BANK_END - SUNSET_BANK_START - SUNSET_TOE_LENGTH / 2);
export const SUNSET_BANK_Z0 = -28 * UNIT;
export const SUNSET_BANK_Z1 = 62 * UNIT;
export const SUNSET_ROOF_BACK = -36 * UNIT;
export const SUNSET_ROOF_Z0 = -6 * UNIT;
export const SUNSET_ROOF_Z1 = 59 * UNIT;
export const SUNSET_POP_X = -2 * UNIT;
// Tail-pop offset belongs to the unchanged board size, not the enlarged building.
export const SUNSET_POP_Z = SUNSET_ROOF_Z0 + 26;
export const SUNSET_SIDEWALK_END = SUNSET_BANK_END + 5 * UNIT;

/**
 * One bank profile for the whole frontage and right-side landing. Its crest
 * stays six feet below the roof; there is no raised section at the roof end.
 */
export function sunsetGround(u: number): number {
  if (u < SUNSET_BANK_START) return SUNSET_BANK_TOP;
  if (u >= SUNSET_BANK_END) return -SUNSET_DROP;
  if (u <= SUNSET_TOE_START) return SUNSET_BANK_TOP - SUNSET_GRADE * (u - SUNSET_BANK_START);
  const remaining = SUNSET_BANK_END - u;
  return -SUNSET_DROP + SUNSET_GRADE * remaining * remaining / (2 * SUNSET_TOE_LENGTH);
}

/** Roof and bank are adjacent surfaces, not a roof extending behind every x. */
export function sunsetSurface(x: number, z: number): number {
  if (x < SUNSET_BANK_START && z >= SUNSET_ROOF_Z0 && z <= SUNSET_ROOF_Z1 && x >= SUNSET_ROOF_BACK) return 0;
  if (z < SUNSET_BANK_Z0 || z > SUNSET_BANK_Z1) return -SUNSET_DROP;
  return sunsetGround(x);
}

/** Signed ground gradient dy/dx, for board pitch and both wheel contacts. */
export function sunsetSlope(u: number): number {
  if (u < SUNSET_BANK_START || u >= SUNSET_BANK_END) return 0;
  if (u <= SUNSET_TOE_START) return -SUNSET_GRADE;
  return -SUNSET_GRADE * (SUNSET_BANK_END - u) / SUNSET_TOE_LENGTH;
}
