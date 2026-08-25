import { describe, expect, it } from 'vitest';
import { analyticsRangeDays, percentage } from './summary';

describe('analytics summary helpers', () => {
  it('accepts only supported dashboard ranges', () => {
    expect(analyticsRangeDays('30')).toBe(30);
    expect(analyticsRangeDays('7')).toBe(7);
    expect(analyticsRangeDays('365')).toBe(7);
    expect(analyticsRangeDays(null)).toBe(7);
  });

  it('calculates stable one-decimal percentages', () => {
    expect(percentage(2, 3)).toBe(66.7);
    expect(percentage(0, 0)).toBe(0);
  });
});
