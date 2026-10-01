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
/** From-scratch look (new robot, skate plaza, crane camera) on the same physics. */
export { default as TrickScene, type HeadPose, type LeadIn } from './scene/TrickScene';
/** Where TrickScene films from: the stock 3/4 view, or any angle inside the tested bounds. */
export {
  DEFAULT_SCENE_CAMERA,
  SCENE_CAMERA_BOUNDS,
  clampSceneCamera,
  type SceneCamera,
} from './scene/camera';
/** Flat-bar grinds and slides — TrickScene only (the other renderers are flatground). */
export { grindTimelineFor, type GrindTimeline } from './scene/grind';
/**
 * Grind names. Flatground tricks can be popped into a grind ("Kickflip into
 * Frontside Lipslide", "Backside 180 into Frontside Nosegrind") and out of it
 * off an end the grind rides ("Backside 5-0 Grind Kickflip Out", "Crooked
 * Grind Nollie Kickflip Out"; see exitEndsFor).
 */
export {
  GRIND_BASES,
  exitEndsFor,
  grindSpecFor,
  joinGrindBase,
  joinGrindExit,
  splitGrindBase,
  type GrindExitName,
  type GrindSide,
  type PopEnd,
} from './scene/grindDefinitions';
export { canEnterGrind, canExitGrind } from './scene/grindTricks';
/** Frozen pre-rework snapshot of the 3D renderer, for side-by-side comparison. */
export { default as TrickAnimation3DLegacy } from './TrickAnimation3DLegacy';
export { default as RobotAvatar } from './RobotAvatar';
export { default as PushOffAnimation } from './PushOffAnimation';
export { readableAccent } from './robotColors';
export {
  orientTrickRotation,
  resolveRiderMechanics,
  type OrientedTrickRotation,
  type RawTrickRotation,
  type RiderMechanics,
} from './stanceMechanics';
export { rpsSound, rpsVibrate, type RpsSound } from './rpsFeedback';
export {
  DEFAULT_SKATE_STYLE,
  SKATE_STYLE_BOUNDS,
  resolveSkateStyle,
} from './skateStyle';
export type { Robot, Trick, Stance, RiderStance, BodySide, SkateStyle } from './types';
