/**
 * @skrobot/animations — everything about a trick except drawing it in 3D,
 * which lives in the separate `@skrobot/animations/three` entry so three.js
 * only ships to pages that show the stage.
 */

/**
 * The trick's motion: its parameters from its name, its frame at clock time
 * t, and the phase timing (seconds) tools use to sample meaningful moments.
 * Also read by the playground's Blender prototype, which poses a GLB rig from
 * these frames.
 */
export {
  FALL_VARIANT_OPTIONS,
  TRICK_BASES,
  ROLL_IN,
  FLIP_T,
  LAND_T,
  FALL_T,
  HOLD,
  specFor,
  computeFrame,
  knee,
  clampFootReach,
  GROUND,
  X0,
  JUMP,
  FOOT_Y,
  type FallVariant,
  type Frame,
  type Spec,
  type Pt,
} from './motion/trick';
/** Camera controls: the crane's bounded orbit and zoom, and the spots' tripods. */
export {
  DEFAULT_SCENE_CAMERA,
  SCENE_ORBIT_BOUNDS,
  SCENE_ZOOM,
  clampOrbitCamera,
  clampZoom,
  wrapOrbitYaw,
  type SceneCamera,
  type TripodId,
} from './camera/camera';
/** The sets (spots) a trick can be staged at, and what each changes: stairs and other obstacles, handrails, tripods. */
export { STAGE_SETS, hasObstacle, railLineFor, setGrindSpec, setHandrail, setInfo, setTerrain, setTimeline, type Obstacle, type RailChoice, type RailLine, type SetInfo, type SetObstacle, type SetRails, type StageSet } from './sets/sets';
/** El Toro's 20 stair: its size and the moments of a trick down it. */
export { FOOT, STAIR_DROP, STAIR_RUN, STAIR_STEPS, stairTimeline, type StairTimeline } from './sets/elToro/stairs';
/** Who rides: the robot, the realistic human, or the alien. */
export { SKATERS, skaterInfo, type Skater, type SkaterInfo } from './riders/skaters';
/** Grinds and slides: on the flat bar, or down a spot's handrail. */
export { grindTimelineFor, type GrindTimeline, type Handrail } from './motion/grind';
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
} from './motion/grindDefinitions';
export { canEnterGrind, canExitGrind } from './motion/grindTricks';
export { default as RobotAvatar } from './ui/RobotAvatar';
export { default as PushOffAnimation } from './ui/PushOffAnimation';
export { readableAccent } from './ui/robotColors';
export {
  orientTrickRotation,
  resolveRiderMechanics,
  type OrientedTrickRotation,
  type RawTrickRotation,
  type RiderMechanics,
} from './motion/stance';
export { rpsSound, rpsVibrate, type RpsSound } from './sound/rpsFeedback';
export { useSoundEffects, setSoundEffects } from './sound/preferences';
export {
  DEFAULT_SKATE_STYLE,
  SKATE_STYLE_BOUNDS,
  resolveSkateStyle,
} from './motion/style';
export type { Robot, Trick, Stance, RiderStance, BodySide, SkateStyle, HeadPose, LeadIn } from './types';
