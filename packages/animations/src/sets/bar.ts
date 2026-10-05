import { GROUND } from '../motion/trick';
import type { V3 } from '../math';
import { BAR_HALF, BAR_TOP_Y, BAR_Z } from '../motion/grindDefinitions';

/**
 * The flat bar grinds ride: one square steel tube on two square posts,
 * laid out in street distance so it scrolls with the ground. Its height and
 * thickness are the grind's contact geometry (grindDefinitions.ts).
 */

/** Posts sit this far in from each end of the bar. */
export const POST_INSET = 46;
export const POST_HALF = 2.1;

export interface BarSpan {
  /** World x of the bar's two ends, x0 < x1. */
  x0: number;
  x1: number;
}

interface Box {
  x0: number;
  x1: number;
  /** World y of the top and bottom (y is down, so top < bottom). */
  top: number;
  bottom: number;
  z0: number;
  z1: number;
}

function boxes(span: BarSpan): { bar: Box; posts: Box[] } {
  const bar: Box = { x0: span.x0, x1: span.x1, top: BAR_TOP_Y, bottom: BAR_TOP_Y + 2 * BAR_HALF, z0: BAR_Z - BAR_HALF, z1: BAR_Z + BAR_HALF };
  const post = (x: number): Box => ({
    x0: x - POST_HALF,
    x1: x + POST_HALF,
    top: bar.bottom,
    bottom: GROUND,
    z0: BAR_Z - POST_HALF,
    z1: BAR_Z + POST_HALF,
  });
  return { bar, posts: [post(span.x0 + POST_INSET), post(span.x1 - POST_INSET)] };
}

const corners = (b: Box): V3[] => {
  const out: V3[] = [];
  for (const x of [b.x0, b.x1]) for (const y of [b.top, b.bottom]) for (const z of [b.z0, b.z1]) out.push({ x, y, z });
  return out;
};

/** The bar's and its posts' corners, for the shadows they cast. */
export function barShadowParts(span: BarSpan): V3[][] {
  const { bar, posts } = boxes(span);
  return [corners(bar), ...posts.map(corners)];
}
