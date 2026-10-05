/**
 * @skrobot/animations/three — the trick stage, drawn with three.js (WebGL).
 *
 * A separate entry point so three.js only ships to pages that show a trick:
 * the game, the explorer, and the gallery's fallback all load it on demand.
 * The root entry stays free of three.js (architecture.test.ts checks).
 */
export { default as TrickScene3D } from './TrickScene3D';
