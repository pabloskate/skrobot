/**
 * Skater feature — the player model. Derives the player's skate score from the
 * game log as a 1-10 skill fit using a player-only curve (with a
 * bag-frontier fallback), then projects it onto the same calibrated robot ladder
 * to produce an 800–2400 display rating directly comparable to the roster. Also
 * builds the adaptive rival: a generated opponent that skates one step ahead of
 * the player's current form. Everything is derived — nothing new is persisted.
 */
export type { SkateScore } from './skateScore';
/** Shared with the offline player-rating calibration; never used to author robot rates. */
export { playerConsistencyCurve } from './skillCurve';
export {
  computeSkateScore,
  SKATE_SCORE_UNLOCK_GAMES,
  skateScoreUnlocked,
} from './skateScore';
export {
  buildRivalRobot,
  isRivalId,
  resolveRobot,
  RIVAL_ID,
  rivalDelta,
} from './rivalBot';
