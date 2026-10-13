import { describe, expect, it } from 'vitest';
import { THICKNESS, TIP_X, deckBottomY, deckTopY, halfWidth, kickY } from './deck';
import { WHEEL_BOTTOM, WHEEL_HALF_W, WHEEL_R, WHEEL_X, WHEEL_Z } from './board';
import { BOARD_WIDTH_SCALE } from './boardDimensions';
import { INCH } from '../units';

/** A length in the stage's units, in inches. */
const inches = (units: number) => units / INCH;

describe('a real street board', () => {
  it('is a 31-inch deck, 7¾ inches wide and seven plies thick', () => {
    expect(inches(2 * TIP_X)).toBeCloseTo(31, 9);
    expect(inches(2 * halfWidth(0) * BOARD_WIDTH_SCALE)).toBeCloseTo(7.75, 9);
    expect(inches(THICKNESS)).toBeCloseTo(0.45, 1);
  });

  it('rolls on 56 mm wheels on high trucks and risers, its axles 15.5 inches apart and an axle as wide as the deck', () => {
    expect(inches(2 * WHEEL_R) * 25.4).toBeCloseTo(56, 0);
    expect(inches(2 * WHEEL_X)).toBeCloseTo(15.5, 1);
    expect(inches(2 * (WHEEL_Z + WHEEL_HALF_W) * BOARD_WIDTH_SCALE)).toBeCloseTo(7.75, 1);
    // The grip about four inches off the ground.
    expect(inches(WHEEL_BOTTOM - deckTopY(0))).toBeCloseTo(4, 1);
    // The kicks well up at the tips: about two and three-quarter inches.
    expect(inches(deckTopY(0) - deckTopY(TIP_X))).toBeCloseTo(2.7, 1);
  });
});

/** The deck's shape is what the feet, the bar, and the 3D deck are all measured from. */
describe('Deck shape', () => {
  it('keeps the deck a solid of the same thickness the feet and the bar are measured from', () => {
    for (const x of [-48, -30, 0, 30, 48]) expect(deckBottomY(x) - deckTopY(x)).toBeCloseTo(THICKNESS, 9);
  });

  it('kicks the nose and tail up past the trucks, the same both ends', () => {
    expect(kickY(TIP_X)).toBeLessThan(kickY(20) - 5);
    for (const x of [10, 30, 40, TIP_X]) expect(kickY(-x)).toBeCloseTo(kickY(x), 9);
    expect(halfWidth(0)).toBeGreaterThan(halfWidth(TIP_X - 2));
    expect(halfWidth(TIP_X)).toBe(0);
  });
});
