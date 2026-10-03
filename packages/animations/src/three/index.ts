/**
 * @skrobot/animations/three — TrickScene drawn with three.js (WebGL).
 *
 * A separate entry point so three.js only ships to pages that use it: the
 * game loads this entry for its waterfront attempts; the gallery keeps the
 * SVG TrickScene from the root. The motion is the package's own (the same physics and
 * rig solvers as TrickScene), so the two renderers show the same frames.
 */
export { default as TrickScene3D } from './TrickScene3D';
