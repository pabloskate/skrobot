/**
 * Robots feature — the opponent roster (data + skill model) and robot UI.
 * `buildBag` turns a robot + trick pool into the consistency map the game engine rolls against.
 */
export type { Robot, Tier } from './robots';
export { ROBOTS, ROBOT_BY_ID, TIERS, buildBag, robotConsistency } from './robots';
export { default as RobotAvatar } from './RobotAvatar';
export { default as RobotSelect } from './RobotSelect';
