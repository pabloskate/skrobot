import type { ReactElement } from 'react';
import { W, X0 } from '../motion/trick';
import type { ViewBox } from '../camera/camera';

/**
 * Building blocks shared by the sets (the spots behind the rider): the
 * street's laid-out span, the bleed past the stage's frame, far layers
 * painted under the canvas, and seeded randomness so every set is the same
 * every frame.
 */

/**
 * A stretch of a set that never changes as the trick plays, only slides: the
 * sky, or a skyline at infinity drifting with the street. Each is drawn as
 * its own SVG under the canvas, so the browser paints it once and then just
 * moves it. Only the stage's own framing (camera and zoom) redraws one.
 */
export interface FarLayer {
  key: string;
  /** The part of the scene it covers, in viewBox units. */
  box: ViewBox;
  /** How far right of `box` (viewBox units) it has slid; absent for a layer that never slides. */
  shift?: number;
  /** Gradients its art paints with. */
  defs?: ReactElement;
  art: ReactElement;
}

/** `view` cut down to the rows from `top` to `bottom`; null when they're out of it. */
export function band(view: ViewBox, top: number, bottom: number): ViewBox | null {
  const y0 = Math.max(view.y, top);
  const y1 = Math.min(view.y + view.height, bottom);
  return y1 > y0 ? { x: view.x, y: y0, width: view.width, height: y1 - y0 } : null;
}

/** Screen-space layers run past the viewBox so a container wider or taller
 *  than the stage's aspect letterboxes into more scene, not a seam. */
export const BLEED_L = -W;
export const BLEED_R = 2 * W;
export const BLEED_Y = 320;

/** The street's laid-out span: props repeat across it as it scrolls. */
export const SPAN_LO = X0 - 2200;
export const SPAN_HI = X0 + 2400;

/**
 * A coordinate rounded to a tenth for path data. Sets draw thousands of
 * points a frame, and this is an order of magnitude faster than toFixed.
 */
export const num = (n: number) => Math.round(n * 10) / 10;

/** Seeded generator (mulberry32): the same art every load, every frame. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 0–1 value for an integer cell. */
export function hash2(i: number, j: number, salt = 0): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
