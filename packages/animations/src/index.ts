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
/** Camera controls: bounded angles for SVG scenes, full-circle orbit and spot tripods for 3D. */
export {
  DEFAULT_SCENE_CAMERA,
  SCENE_CAMERA_BOUNDS,
  SCENE_ORBIT_BOUNDS,
  SCENE_ZOOM,
  clampOrbitCamera,
  clampSceneCamera,
  clampZoom,
  wrapOrbitYaw,
  TRIPODS,
  type SceneCamera,
  type TripodId,
} from './scene/camera';
/** The sets TrickScene can be staged on, and the ones TrickScene3D can (those plus El Toro's 20 stair). */
export { SCENE_SETS, STAGE_SETS, sceneSetFor, type SceneSet, type StageSet } from './scene/setKit';
/** El Toro's 20 stair: its size, the moments of a trick down it, and the center handrail its grinds ride. */
export { FOOT, STAIR_DROP, STAIR_RUN, STAIR_STEPS, stageRail, stairTimeline, type StairTimeline } from './scene/stairs';
/** Who rides in the three.js renderer: robot, illustrated human, or detailed humanoid. */
export { SKATERS, type Skater } from './skaters';
/** Grinds and slides: on the flat bar (both TrickScenes), or down El Toro's handrail (TrickScene3D). */
export { grindTimelineFor, type GrindTimeline, type Handrail } from './scene/grind';
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
