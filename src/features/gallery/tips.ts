import type { Trick } from '@/features/tricks';

export interface TipVideo {
  /** YouTube video id (privacy-enhanced nocookie embed). */
  ytId: string;
  channel: string;
  duration: string;
}

/**
 * Curated video tips keyed by trick *base* name. Stance variants reuse the
 * base tip (a Switch Kickflip tutorial is still a kickflip tutorial). Tricks
 * without an entry have no tip yet — the gallery shows them with a disabled
 * play button.
 */
const TIPS: Record<string, TipVideo> = {};

/** The curated tip video for a trick, or undefined if none is linked yet. */
export function tipForTrick(trick: Trick): TipVideo | undefined {
  return TIPS[trick.base];
}

/** All curated tip videos (for the gallery count). */
export const TIP_VIDEOS = TIPS;
