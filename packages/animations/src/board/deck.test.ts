import { describe, expect, it } from 'vitest';
import { THICKNESS, TIP_X, deckBottomY, deckTopY, halfWidth, kickY } from './deck';

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
