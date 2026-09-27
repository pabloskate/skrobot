import type { SkateStyle } from './types';

/** Neutral keeps the pre-style animation frame-for-frame equivalent. */
export const DEFAULT_SKATE_STYLE: Readonly<SkateStyle> = Object.freeze({
  popHeight: 1,
  rotationSpeed: 1,
  flickStrength: 1,
});

/**
 * Bounded multipliers keep styles readable without changing game timing.
 * The wider range is intentional: robot signatures should be visible at a
 * glance, while neutral remains frame-for-frame equivalent to the old motion.
 */
export const SKATE_STYLE_BOUNDS = Object.freeze({
  popHeight: Object.freeze({ min: 0.45, max: 1.15 }),
  rotationSpeed: Object.freeze({ min: 0.8, max: 1.25 }),
  flickStrength: Object.freeze({ min: 0.7, max: 1.25 }),
});

const bounded = (value: number | undefined, min: number, max: number): number => {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return Math.max(min, Math.min(max, value));
};

/** Resolve untrusted/fixture metadata once before the animation loop. */
export function resolveSkateStyle(style?: SkateStyle): SkateStyle {
  return {
    popHeight: bounded(
      style?.popHeight,
      SKATE_STYLE_BOUNDS.popHeight.min,
      SKATE_STYLE_BOUNDS.popHeight.max,
    ),
    rotationSpeed: bounded(
      style?.rotationSpeed,
      SKATE_STYLE_BOUNDS.rotationSpeed.min,
      SKATE_STYLE_BOUNDS.rotationSpeed.max,
    ),
    flickStrength: bounded(
      style?.flickStrength,
      SKATE_STYLE_BOUNDS.flickStrength.min,
      SKATE_STYLE_BOUNDS.flickStrength.max,
    ),
  };
}
