import { TIP_X } from '../scene/deck';
import { DECK_HALF_WIDTH } from '../scene/skeleton';

/** Broader 3D deck and axle silhouette; length and ride height follow the shared rig. */
export const BOARD_WIDTH_SCALE = 1.2;

export function boardHalfWidth(x: number): number {
  const start = TIP_X - 9.5;
  const u = Math.max(0, (Math.abs(x) - start) / 9.5);
  return u >= 1 ? 0 : DECK_HALF_WIDTH * BOARD_WIDTH_SCALE * Math.sqrt(1 - u * u);
}
