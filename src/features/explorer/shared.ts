'use client';

/**
 * What the explorer shares with explorer3d (see index.ts). A client module:
 * the model computes its trick lists from the animation package when it
 * loads, which only the browser bundle may do.
 */
export { default as TrickBuilder } from './TrickBuilder';
export { default as CameraDial } from './CameraDial';
export { usePlayhead } from './usePlayhead';
export {
  CAMERA_PRESETS,
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
  zoomAt,
  zoomBy,
  type ExplorerState,
  type Timeline,
} from './explorer';
