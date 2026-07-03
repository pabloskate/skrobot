/**
 * Gallery feature — flatground trick gallery with stance filtering and search,
 * plus the player's trick book: personal state (proven in games / claimed /
 * learning) overlaid on the catalog, with a bag-vs-robot-ladder readout and
 * "next up" suggestions. Browses the trick catalog (owned by features/tricks)
 * and links each trick to an optional curated video tip. Video metadata is
 * gallery-owned curation, not trick data.
 */
export type { TipVideo } from './tips';
export { TIP_VIDEOS, tipForTrick } from './tips';
export { default as GalleryScreen } from './GalleryScreen';
