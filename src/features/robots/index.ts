/**
 * Robots feature — opponent metadata, explicit per-trick behavior, and robot UI.
 * Land rates and set weights are direct table lookups with no modeled fallback.
 */
export type { Robot, SetWeightRobot, Tier } from './robots';
export { DEFENSE_ROBOTS, ROBOTS, ROBOT_BY_ID, buildBag, hasDefenseSets, isFlatgroundRobot, rawEloToDisplayRating, robotDisplayRating, trickDefenseSetWeight, trickSetWeight } from './robots';
export { default as RobotAvatar } from './RobotAvatar';
export { default as RobotProfile } from './RobotProfile';
export { default as RobotSelect } from './RobotSelect';
export { default as TuneScreen } from './TuneScreen';
