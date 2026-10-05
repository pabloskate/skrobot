import type { V3 } from '../math';
import { DECK_HALF_WIDTH } from '../motion/skeleton';

/**
 * The deck's shape: a popsicle, flat between the trucks, kicked up past them
 * into a nose and tail that curl harder toward the tip, with round ends.
 * Board-local units: x along the deck to the nose, y down, z across it.
 */

export const TIP_X = 48;
export const THICKNESS = 2.4;
const KICK_FROM = 28;
const KICK_RISE = 8.4;
const KICK_CURL = 1.3;
const MID_Y = -1;
const HALF_W = DECK_HALF_WIDTH;
const CORNER_R = 9.5;
/** Segments along the deck. */
const SAMPLES = 28;

const DECK_PROFILE: ReadonlyArray<[number, number]> = (() => {
  const nose: Array<[number, number]> = [];
  for (let x = KICK_FROM; x <= TIP_X; x += 2) nose.push([x, MID_Y - KICK_RISE * ((x - KICK_FROM) / (TIP_X - KICK_FROM)) ** KICK_CURL]);
  const tail = nose.map(([x, y]): [number, number] => [-x, y]).reverse();
  return [...tail, [-8, MID_Y - 0.1], [0, MID_Y], [8, MID_Y - 0.1], ...nose];
})();

/** Board-local y of the deck's midplane at `x`. */
export function kickY(x: number): number {
  if (x <= DECK_PROFILE[0][0]) return DECK_PROFILE[0][1];
  for (let i = 1; i < DECK_PROFILE.length; i++) {
    const [x0, y0] = DECK_PROFILE[i - 1];
    const [x1, y1] = DECK_PROFILE[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return DECK_PROFILE[DECK_PROFILE.length - 1][1];
}

/** Board-local y of the grip and of the underside at `x` along the deck. */
export const deckTopY = (x: number) => kickY(x) - THICKNESS / 2;
export const deckBottomY = (x: number) => kickY(x) + THICKNESS / 2;

/** Half the deck's width at `x` along it: full through the middle, rounded off at the tips. */
export function halfWidth(x: number): number {
  const ax = Math.abs(x);
  const start = TIP_X - CORNER_R;
  if (ax <= start) return HALF_W;
  const u = (ax - start) / CORNER_R;
  return u >= 1 ? 0 : HALF_W * Math.sqrt(1 - u * u);
}

/** Stations along the deck, bunched toward the tips so the rounded ends stay round. */
const stationX = (i: number) => -TIP_X * Math.cos((Math.PI * i) / SAMPLES);

/** The deck's planform at one face (offsetY from the midplane), around once. */
function outline(offsetY: number): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const x = stationX(i);
    pts.push({ x, y: kickY(x) + offsetY, z: -halfWidth(x) });
  }
  for (let i = SAMPLES - 1; i >= 1; i--) {
    const x = stationX(i);
    pts.push({ x, y: kickY(x) + offsetY, z: halfWidth(x) });
  }
  return pts;
}

export const TOP_LOCAL = outline(-THICKNESS / 2);
export const BOTTOM_LOCAL = outline(THICKNESS / 2);
