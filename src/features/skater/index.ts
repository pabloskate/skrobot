/**
 * Skater feature — the player model. Derives the player's skate score (a 1-10
 * skill fit onto the robots' own consistency curve, with a bag-frontier
 * fallback) from the game log, places it on the robot ladder, and builds the
 * adaptive rival: a generated opponent that skates one step ahead of the
 * player's current form. Everything is derived — nothing new is persisted.
 */
export type { LadderSpot, SkateScore } from './skateScore';
export {
  computeSkateScore,
  fitRobotEquivalentSkill,
  frontierSkill,
  ladderSpot,
  SKATE_SCORE_UNLOCK_GAMES,
  skateScoreUnlocked,
} from './skateScore';
export {
  buildRivalRobot,
  isRivalId,
  resolveRobot,
  RIVAL_ID,
  RIVAL_NAME,
  rivalDelta,
  rivalFavorites,
} from './rivalBot';
