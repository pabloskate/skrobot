/**
 * Robots feature — opponent metadata, explicit per-trick behavior, and robot UI.
 * Land rates and set weights are direct table lookups with no modeled fallback.
 */
export type { Robot, RpsTaunts, SetWeightRobot, Tier } from './robots';
export { ROBOTS, ROBOT_BY_ID, ROBOT_ELO_BY_ID, TIERS, buildBag, getRpsTaunt, isFlatgroundRobot, rawEloToDisplayRating, robotConsistency, robotDisplayRating, robotVibe, trickSetWeight } from './robots';
export { default as RobotAvatar } from './RobotAvatar';
export { default as RobotProfile } from './RobotProfile';
export { default as RobotSelect } from './RobotSelect';
export { default as TuneScreen } from './TuneScreen';
