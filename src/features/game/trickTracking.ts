import { getTrickTracking } from './gamePreferences';
import type { GameProgress } from './savedGame';

/** Eligibility survives mode changes; the preference controls the current match. */
export function isTrackingGame(eligible: boolean): boolean {
  return eligible && getTrickTracking();
}

/** Both play modes must identify landed sets and every tracked missed set. */
export function setAttemptNeedsTrick(landed: boolean, tracking = getTrickTracking()): boolean {
  return landed || tracking;
}

/** A match only contributes stats if every part stayed trackable. */
export function progressForLog(progress: GameProgress): GameProgress {
  return isTrackingGame(progress.trackingEligible)
    ? progress
    : { trickIdsLanded: [], trickAttempts: [], trackingEligible: false };
}
