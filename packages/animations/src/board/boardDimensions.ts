import { TIP_X } from './deck';
import { DECK_HALF_WIDTH } from '../motion/skeleton';
import { INCH } from '../units';

/**
 * How much wider the meshes and the collision solids draw the deck and its
 * running gear than the physics' board: out to a 7¾-inch deck, a 31-inch
 * popsicle's width. Length and ride height follow the shared rig.
 */
export const BOARD_WIDTH_SCALE = (3.875 * INCH) / DECK_HALF_WIDTH;

export function boardHalfWidth(x: number): number {
  const start = TIP_X - 9.5;
  const u = Math.max(0, (Math.abs(x) - start) / 9.5);
  return u >= 1 ? 0 : DECK_HALF_WIDTH * BOARD_WIDTH_SCALE * Math.sqrt(1 - u * u);
}
