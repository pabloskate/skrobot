/**
 * Explorer feature — the customer-facing Trick Explorer at /explore: watch any
 * flatground trick or grind combo the robot can skate, slowed down, scrubbed,
 * and filmed from any camera angle at any spot (at El Toro's 20 stair,
 * flatground tricks go down it, grinds go down its center handrail, and
 * tripods film from the bottom, the side, and the top), by the robot, human, or detailed humanoid, with a
 * shareable URL for what's on stage and an MP4 of it to download.
 * Animation comes from @skrobot/animations/three (filming from its video entry);
 * names and descriptions from tricks.
 */
export { default as TrickExplorer } from './TrickExplorer';

/**
 * The explorer's trick picker, clock, and URL model, shared with the 3D
 * explorer (explorer3d), which stages the same tricks with the three.js
 * renderer. They come through a client module so a server page importing
 * this barrel (/explore) never evaluates the model; nothing here changes
 * how /explore behaves.
 */
export {
  CAMERA_PRESETS,
  CameraDial,
  TrickBuilder,
  ZOOM_RANGE,
  ZOOM_STEP,
  cameraLabel,
  cameraPreset,
  cameraPresetsFor,
  phaseAt,
  sceneCamera,
  sceneTripod,
  searchFromState,
  stageTrick,
  stateFromSearch,
  timelineFor,
  trickSteps,
  turnCamera,
  usePlayhead,
  withSet,
  zoomAt,
  zoomBy,
  type ExplorerState,
  type Timeline,
} from './shared';
