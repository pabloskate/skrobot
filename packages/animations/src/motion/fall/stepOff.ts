import { FOOT } from '../../units';

/**
 * Stepping off a made landing with nowhere to ride it out (Emage's twenty:
 * a narrow trail, a strip of dirt, then brush down to the river). The trick
 * is landed and ridden a moment, the landing taken in the legs, then the
 * rider hops off the board before the trail runs out and runs the speed out
 * on their feet, the board rolling on alone into the brush. From the hop on,
 * the kick-out (kickOut.ts) does the running, as it does jumping off a rail.
 */

/** Seconds the landing is ridden at the least before the hop: the legs take the impact first. */
export const STEP_OFF_RIDE = 0.2;
/** How far short of the runout's end the hop goes (world units): the board carries on under the feet as they leave it. */
export const STEP_OFF_LEAD = 3 * FOOT;
/** Seconds the attempt runs on from the hop: off, the steps, the stop, and a look back at the board. */
export const STEP_OFF_T = 2.4;
/** Seconds from the hop until the feet are about down. */
export const STEP_OFF_DOWN = 0.22;
/** The legs' hop off the deck, as the speed it gives the hips (world units a second): up, and out beside the board (KickOutSetup.hopOut). */
export const STEP_OFF_JUMP = { up: 2.5 * FOOT, along: 0, out: 4 * FOOT } as const;

/**
 * When the rider hops off: once the landing's been ridden STEP_OFF_RIDE,
 * or later if there's room, so the board (`along` the route at the clock
 * `from`, rolling at `speed`) is STEP_OFF_LEAD short of `runout`.
 */
export function stepOffAt(land: number, from: number, along: number, speed: number, runout: number): number {
  return Math.max(land + STEP_OFF_RIDE, from + (runout - STEP_OFF_LEAD - along) / Math.max(1e-6, speed));
}
