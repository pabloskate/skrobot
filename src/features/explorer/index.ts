/**
 * Explorer feature — the customer-facing Trick Explorer at /explore: watch any
 * flatground trick or grind combo the robot can skate, slowed down, scrubbed,
 * and filmed from any camera angle at either spot, with a shareable URL for
 * what's on stage.
 * Animation comes from @skrobot/animations/three; names and descriptions from tricks.
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
  phaseAt,
  sceneCamera,
  searchFromState,
  stageTrick,
  stateFromSearch,
  timelineFor,
  trickSteps,
  turnCamera,
  usePlayhead,
  zoomAt,
  zoomBy,
  type ExplorerState,
  type Timeline,
} from './shared';
