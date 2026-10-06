/** World units per foot, shared with the existing five-foot rider scale. */
export const FOOT = 29;
export const WALLENBERG_STEPS = 4;
/** Jenkem's measured 51-inch height and 198-inch lip-to-lip length (2017). */
export const WALLENBERG_DROP = (51 / 12) * FOOT;
export const WALLENBERG_RUN = (198 / 12) * FOOT;
export const WALLENBERG_RISER = WALLENBERG_DROP / WALLENBERG_STEPS;
export const WALLENBERG_TREAD = WALLENBERG_RUN / (WALLENBERG_STEPS - 1);
export const WALLENBERG_LANE_Z = 0;
/** The architectural dimensions below are photo estimates, not surveyed measurements. */
export const WALLENBERG_HALF_WIDTH = 19 * FOOT;
export const WALLENBERG_SCHOOL_X = -32 * FOOT;
export const WALLENBERG_SCHOOL_HEIGHT = 25 * FOOT;
export const WALLENBERG_STAIR_EDGE = -27 * FOOT;
export const WALLENBERG_DRIVE_EDGE = 43 * FOOT;

/** Four separate curbs, with three broad asphalt terraces between their lips. */
export function wallenbergGround(x: number): number {
  if (x < 0) return 0;
  if (x >= WALLENBERG_RUN) return -WALLENBERG_DROP;
  return -(Math.floor(x / WALLENBERG_TREAD) + 1) * WALLENBERG_RISER;
}
