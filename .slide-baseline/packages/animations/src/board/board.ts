import { TOP_LOCAL, deckBottomY, deckTopY } from './deck';
import { rad, type V3 } from '../math';
import type { BoardRig } from '../motion/skeleton';

/**
 * The skateboard's running gear, in board-local units (x along the deck to
 * the nose, y down from the deck's middle, z across it): where the trucks
 * and wheels sit, how far the wheels hold the deck off the ground, and how
 * the wheels turn as the board rolls. The deck keeps the physics'
 * dimensions — 96 long, kicked nose and tail — and the wheels the same 13
 * units of ride height under it, so foot targets and ground contact land
 * where the trick engine expects. The deck's own shape is in deck.ts.
 */

export const WHEEL_X = 28;
/** Board-local depth of the wheels' contact patch below the deck center: the
 *  shared physics rides the deck this far off the ground. */
export const WHEEL_BOTTOM = 13;
export const WHEEL_R = 4.5;
export const WHEEL_Y = WHEEL_BOTTOM - WHEEL_R;
/** Board-local depth of the bottom of a truck hanger: what rides a bar in a
 *  grind. The wheels dip WHEEL_BOTTOM - HANGER_BOTTOM past the contact. */
export const HANGER_BOTTOM = 9.9;
export const WHEEL_HALF_W = WHEEL_R * 0.46;
/** The wheels' inner faces stay this far from the centerline, clear of a bar. */
export const WHEEL_INNER = 5;
export const WHEEL_Z = WHEEL_INNER + WHEEL_HALF_W;
/**
 * Share of true rolling speed the wheels turn at. Full speed (about nine
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
