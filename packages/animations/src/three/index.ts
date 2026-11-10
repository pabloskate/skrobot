/**
 * @skrobot/animations/three — the trick stage, drawn with three.js (WebGL).
 *
 * A separate entry point so three.js only ships to pages that show a trick:
 * the game, the explorer, and the gallery's fallback all load it on demand.
 * The root entry stays free of three.js (architecture.test.ts checks).
 */
export { default as TrickScene3D } from './TrickScene3D';
/** A spot from above, for a map of it and for standing a tripod anywhere in it. */
export { groundUnder, planBounds, spotPlan, type SpotPlan } from './spotPlan';
/** Where the rider goes through a spot over an attempt, for drawing their line on that map. */
export { riderPath, type PathPoint } from '../stage/path';
