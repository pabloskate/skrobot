/**
 * Robots feature — the opponent roster (data + skill model) and robot UI.
 * `buildBag` turns a robot + trick pool into the consistency map the game engine rolls against.
 * `trickSetWeight` turns land rate into a set-pick weight (favorites boosted,
 * uncommon tricks cut, optional `setWeights` override).
 */
export type { Robot, RpsTaunts, SetWeightRobot, Tier } from './robots';
export { ROBOTS, ROBOT_BY_ID, ROBOT_ELO_BY_ID, TIERS, buildBag, consistencyCurve, getRpsTaunt, isFlatgroundRobot, robotConsistency, robotDisplayRating, robotVibe, trickSetWeight } from './robots';
export { default as RobotAvatar } from './RobotAvatar';
export { default as RobotProfile } from './RobotProfile';
export { default as RobotSelect } from './RobotSelect';
