'use client';

import { setTrickTracking, useTrickTracking } from './gamePreferences';

/**
 * Ambient tracking status, pinned to the bottom of the scoreboard. The
 * default state whispers (muted, calm, always in the same spot) so it's
 * glanceable without being a banner; the OFF state is the exception and
 * says so, since that's when "did that count?" surprises happen. Tapping
 * toggles instantly — the opt-out is never more than one tap away.
 */
export default function TrackingStatusChip({ trackingEligible = true }: { trackingEligible?: boolean }) {
  const tracking = useTrickTracking();
  const active = tracking && trackingEligible;
  return (
    <button
      type="button"
      className={`tracking-status ${active ? '' : 'tracking-status-off'}`}
      onClick={() => setTrickTracking(!tracking)}
      aria-pressed={tracking}
      aria-label={
        !trackingEligible
          ? 'This game counts toward your record only because part of it was played without trick tracking. Your preference applies to the next game.'
          : tracking
          ? 'Trick tracking is on — this game feeds your consistency stats. Tap to turn off.'
          : 'Trick tracking is off — games only count toward your record. Tap to turn on.'
      }
    >
      <span className="tracking-status-dot" aria-hidden />
      {!trackingEligible
        ? 'Trick stats off for this game'
        : tracking ? 'Tracking your tricks for consistency stats' : 'Not tracking — tap to turn on'}
    </button>
  );
}
