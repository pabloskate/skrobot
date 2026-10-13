import { TOP_LOCAL, deckBottomY, deckTopY } from './deck';
import { rad, type V3 } from '../math';
import type { BoardRig } from '../motion/skeleton';

/**
 * The skateboard's running gear, in board-local units (x along the deck to
 * the nose, y down from the deck's middle, z across it): where the trucks
 * and wheels sit, how far the wheels hold the deck off the ground, and how
 * the wheels turn as the board rolls. It's a street board's: 56 mm wheels
 * on high trucks over quarter-inch risers, the axles 15.5 inches apart (a
 * 14-inch wheelbase between the inner bolts), the grip about four inches off
 * the ground. The deck's own shape is in deck.ts.
 *
 * Across the board (z) these are the physics' widths: the meshes and the
 * collision solids draw everything BOARD_WIDTH_SCALE wider
 * (boardDimensions.ts), the wheels' faces out to the deck's edges.
 */

export const WHEEL_X = 24;
/** Board-local depth of the wheels' contact patch below the deck center: the
 *  shared physics rides the deck this far off the ground. */
export const WHEEL_BOTTOM = 10.05;
export const WHEEL_R = 3.4;
export const WHEEL_Y = WHEEL_BOTTOM - WHEEL_R;
/** Board-local depth of the bottom of a truck hanger: what rides a bar in a
 *  grind. The wheels dip WHEEL_BOTTOM - HANGER_BOTTOM past the contact. */
export const HANGER_BOTTOM = WHEEL_Y + 1.25;
export const WHEEL_HALF_W = 1.4;
/** The wheels' inner faces stay this far from the centerline, clear of a bar. */
export const WHEEL_INNER = 5.8;
export const WHEEL_Z = WHEEL_INNER + WHEEL_HALF_W;
/**
 * A truck, board-local (half extents for the boxes), shared by both meshes
 * and the collision solids: the riser and baseplate from the deck's
 * underside down to `plateBottom`, the bushing under it, and the hanger's
 * hump from `humpTop` down to HANGER_BOTTOM, sloping out into wings round
 * the axle.
 */
export const TRUCK = {
  plate: { f: 4.2, u: 0.8, s: 2.6, r: 0.4 },
  plateBottom: 0.8,
  bushing: { f: 1.5, u: 1.4, s: 1.45, r: 1.2 },
  humpTop: 3.6,
  hump: { f: 1.9, s: 1.1 },
  wing: { f: 1.2, top: WHEEL_Y - 1 },
  round: 0.65,
} as const;
/**
 * Share of true rolling speed the wheels turn at. Full speed (about twelve
 * turns a second) is a blur the eye can't follow on a wheel this small.
 */
export const WHEEL_SPIN = 0.6;

export { deckBottomY, deckTopY };

export interface BoardLook {
  /** Painted underside. */
  graphic: string;
  /** Stripe across the underside graphic. */
  stripe: string;
}

/** How far the wheels have turned on their axles this frame. */
export interface WheelSpin {
  /** Roll angle about the axle in board space, radians. */
  angle: number;
  /** Signed radians turned over one displayed frame; the mark smears across it. */
  sweep: number;
}

/**
 * Wheel roll angle after the street has moved `dist` world units. Rolling
 * without slipping turns a wheel dist / R, scaled by WHEEL_SPIN so the
 * mark stays readable. Airborne wheels coast at their
 * takeoff spin; from touchdown on they roll along the board's landed
 * heading, so a board that lands turned 180° spins its wheels the other way.
 */
export function wheelRoll(dist: number, touchdownDist: number, dir: 1 | -1, landedYawDeg: number): number {
  const before = Math.min(dist, touchdownDist);
  const after = Math.max(0, dist - touchdownDist);
  return (WHEEL_SPIN * dir * (before + Math.cos(rad(landedYawDeg)) * after)) / WHEEL_R;
}

/** Outline samples plus wheel bottoms, for the cast ground shadow. */
export function boardShadowPoints(board: BoardRig): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i < TOP_LOCAL.length; i += 3) pts.push(board.point(TOP_LOCAL[i]));
  for (const tx of [-WHEEL_X, WHEEL_X]) {
    for (const wz of [-WHEEL_Z, WHEEL_Z]) pts.push(board.point({ x: tx, y: WHEEL_Y + WHEEL_R, z: wz }));
  }
  return pts;
}
