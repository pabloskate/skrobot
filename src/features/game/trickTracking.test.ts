import { afterEach, describe, expect, it, vi } from 'vitest';
import { progressForLog, setAttemptNeedsTrick } from './trickTracking';

afterEach(() => vi.unstubAllGlobals());

describe('trick tracking policy', () => {
  it.each([
    [true, true, true],
    [true, false, true],
    [false, true, true],
    [false, false, false],
  ])('landed=%s, tracking=%s requires a trick=%s', (landed, tracking, expected) => {
    expect(setAttemptNeedsTrick(landed, tracking)).toBe(expected);
  });

  it('reads the current preference for both attribution and completed-match evidence', () => {
    let preference: string | null = null;
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: () => preference });
    const progress = {
      trickIdsLanded: ['regular-kickflip'],
      trickAttempts: [{ trickId: 'regular-kickflip', landed: true }],
      trackingEligible: true,
    };
    expect(setAttemptNeedsTrick(false)).toBe(true);
    expect(progressForLog(progress)).toBe(progress);
    preference = 'off';
    expect(setAttemptNeedsTrick(false)).toBe(false);
    expect(progressForLog(progress)).toEqual({ trickIdsLanded: [], trickAttempts: [], trackingEligible: false });
    preference = 'on';
    expect(progressForLog({ ...progress, trackingEligible: false })).toEqual({
      trickIdsLanded: [], trickAttempts: [], trackingEligible: false,
    });
    expect(progress.trickAttempts).toHaveLength(1);
  });
});
