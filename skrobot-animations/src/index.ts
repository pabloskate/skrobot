export {
  default as TrickAnimation,
  SlowMotionTrickAnimation,
  BACKGROUND_SCENE_OPTIONS,
  FALL_VARIANT_OPTIONS,
  SLOW_MOTION_PLAYBACK_RATE,
  type BackgroundSceneId,
  type FallVariant,
} from './TrickAnimation';
export { default as RobotAvatar } from './RobotAvatar';
export { rpsSound, rpsVibrate, type RpsSound } from './rpsFeedback';
export { TRICKS, ROBOTS, trickByBase, tricksForStance, robotById } from './data';
export type { Robot, Trick, Stance } from './types';
