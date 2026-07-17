export {
  default as TrickAnimation,
  SlowMotionTrickAnimation,
  BACKGROUND_SCENE_OPTIONS,
  FALL_VARIANT_OPTIONS,
  SLOW_MOTION_PLAYBACK_RATE,
  type BackgroundSceneId,
  type FallVariant,
} from './TrickAnimation';
export { default as TrickAnimation3D } from './TrickAnimation3D';
export { default as RobotAvatar } from './RobotAvatar';
export {
  orientTrickRotation,
  resolveRiderMechanics,
  type OrientedTrickRotation,
  type RawTrickRotation,
  type RiderMechanics,
} from './stanceMechanics';
export { rpsSound, rpsVibrate, type RpsSound } from './rpsFeedback';
export type { Robot, Trick, Stance, RiderStance, BodySide } from './types';
