export {
  default as TrickAnimation,
  SlowMotionTrickAnimation,
  BACKGROUND_SCENE_OPTIONS,
  FALL_VARIANT_OPTIONS,
  SLOW_MOTION_PLAYBACK_RATE,
  // Phase timing (seconds) — lets tools like the playground contact sheet
  // place fixedTime samples at meaningful points of the animation.
  ROLL_IN,
  FLIP_T,
  LAND_T,
  FALL_T,
  HOLD,
  // Parametric trick physics — shared by the 2D/3D renderers and the Blender
  // playground prototype (which poses a GLB rig from these frames).
  specFor,
  computeFrame,
  knee,
  clampFootReach,
  GROUND,
  X0,
  JUMP,
  FOOT_Y,
  type BackgroundSceneId,
  type FallVariant,
  type Frame,
  type Spec,
  type Pt,
} from './TrickAnimation';
export { default as TrickAnimation3D } from './TrickAnimation3D';
/** Frozen pre-rework snapshot of the 3D renderer, for side-by-side comparison. */
export { default as TrickAnimation3DLegacy } from './TrickAnimation3DLegacy';
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
