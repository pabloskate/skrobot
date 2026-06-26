/**
 * Gallery feature — flatground trick gallery with stance filtering and search.
 * Browses the trick catalog (owned by features/tricks) and links each trick to
 * an optional curated video tip. Video metadata is gallery-owned curation, not
 * trick data.
 */
export type { TipVideo } from './tips';
export { TIP_VIDEOS, tipForTrick } from './tips';
export { default as GalleryScreen } from './GalleryScreen';
