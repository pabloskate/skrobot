/**
 * Explorer feature — the customer-facing Trick Explorer at /explore: watch any
 * flatground trick or grind combo the robot can skate, slowed down, scrubbed,
 * and filmed from any camera angle at any spot (at the landmarks, El Toro's
 * 20 stair, Hollywood High's connected 16 and 12, Wallenberg, and Roof to Bank, flatground tricks
 * go down the drop, grinds go down a handrail where there is one, and tripods
 * film from the bottom, the side, and the top), by the robot or the
 * realistic human, with a shareable URL for what's on stage and a video of it to download (MP4, with a WebM fallback).
 * Animation comes from @skrobot/animations/three (filming from its video entry);
 * names and descriptions from tricks.
 *
 * Dream Tricks at /dream-tricks is the same stage for players: the picture
 * stays in view over four tiles (trick, spot, skater, camera) that each open
 * their choices, on repeat. Its camera is a tripod stood anywhere on a map of
 * the spot, or one that follows the skater.
 * The virtual-location disclosures live at /about, linked from both explorers and Settings.
 */
export { default as TrickExplorer } from './TrickExplorer';
export { default as DreamTricks } from './DreamTricks';
export { default as AboutSkateRobot } from './AboutSkateRobot';
