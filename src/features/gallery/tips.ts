import type { Trick } from '@/features/tricks';

export interface TipVideo {
  /** YouTube video id. */
  ytId?: string;
  /** Instagram reel/post shortcode for a public embed. */
  igId?: string;
  channel: string;
  duration: string;
  /** Vertical clip (YouTube Short or Instagram Reel) — player uses 9:16. */
  short?: boolean;
}

const CH = 'Skateboard Theory';

/**
 * Curated video tips keyed by trick id (stance + base, e.g. `regular-kickflip`).
 * Stance variants are different tricks and need their own tutorials — a regular
 * kickflip clip is not a switch kickflip clip. Long-form HOW TOs win over Shorts
 * when both exist. Tricks without an entry use the gallery's 3D animation
 * fallback instead.
 */
const TIPS: Record<string, TipVideo> = {
  'regular-ollie': { ytId: 'fQcigBOFDOk', channel: CH, duration: '4:03' },
  'nollie-ollie': { ytId: 'MbJbaD-U_yM', channel: CH, duration: '4:11' },
  'regular-frontside-180': { ytId: 'JomQhs7qjxw', channel: CH, duration: '4:10' },
  'regular-backside-180': { ytId: '4-MfqJnzybs', channel: CH, duration: '3:41' },
  'fakie-backside-180': { ytId: 'SmWRawE2UqA', channel: CH, duration: '1:00', short: true },
  'fakie-frontside-180': { igId: 'DbBlUcMR_Sm', channel: CH, duration: 'Reel', short: true },
  'regular-kickflip': { ytId: '9msHUYrxlis', channel: CH, duration: '3:46' },
  'regular-varial-kickflip': { igId: 'DJZxGxgpqNx', channel: CH, duration: 'Reel', short: true },
  'nollie-kickflip': { ytId: 'GmMyJ6_F1v8', channel: CH, duration: '3:48' },
  'switch-kickflip': { igId: 'C8sH6syJe0y', channel: CH, duration: 'Reel', short: true },
  'fakie-kickflip': { igId: 'DAZgxQYpCT4', channel: CH, duration: 'Reel', short: true },
  'regular-heelflip': { ytId: 'dB74KBzDeyE', channel: CH, duration: '1:36' },
  'switch-heelflip': { igId: 'DJMnwtFxnPi', channel: CH, duration: 'Reel', short: true },
  'regular-varial-heelflip': { igId: 'CwTgHnCsdIr', channel: CH, duration: 'Reel', short: true },
  'fakie-bs-bigspin-heelflip': { igId: 'DLqrfRosm-h', channel: CH, duration: 'Reel', short: true },
  'regular-backside-flip': { ytId: '3RCPC_cmX90', channel: CH, duration: '1:00', short: true },
  'fakie-backside-flip': { igId: 'C5WEIaXuTHR', channel: CH, duration: 'Reel', short: true },
  'regular-frontside-flip': { ytId: 'fZ-uD_GYaBQ', channel: CH, duration: '2:24' },
  'nollie-frontside-flip': { ytId: 'H18VDQlbGmw', channel: CH, duration: '0:59', short: true },
  'nollie-backside-flip': { ytId: 'VwqbL7nnjzI', channel: CH, duration: '1:00', short: true },
  'regular-bigspin': { ytId: 'LjAcP9h3Y5Y', channel: CH, duration: '3:42' },
  'switch-bigspin': { ytId: 'xCb3ybzldo8', channel: CH, duration: '1:00', short: true },
  'switch-fs-bigspin': { igId: 'CwBeRSNsNGt', channel: CH, duration: 'Reel', short: true },
  'regular-360-shuvit': { ytId: '7Sk7ypvZ9L8', channel: CH, duration: '3:39' },
  'regular-frontside-360-shuvit': { igId: 'DbL8erBRg_R', channel: CH, duration: 'Reel', short: true },
  'regular-late-kickflip': { ytId: 'NQxWbZIKMeg', channel: CH, duration: '3:38' },
  'nollie-late-kickflip': { ytId: 'fY1wlGQ7zlU', channel: CH, duration: '2:31' },
  'regular-frontside-heelflip': { ytId: 'wXOk7eF4tiM', channel: CH, duration: '1:00', short: true },
  'nollie-frontside-heelflip': { ytId: 'bBSN_Pxv6Z4', channel: CH, duration: '1:00', short: true },
  'nollie-backside-heelflip': { ytId: 'Md68F_7xiAQ', channel: CH, duration: '1:00', short: true },
  'regular-pressure-flip': { ytId: 'NyJqW-1Qkd0', channel: CH, duration: '3:34' },
  'regular-hardflip': { ytId: 'gn2T1-D98Lk', channel: CH, duration: '0:59', short: true },
  'fakie-hardflip': { igId: 'Db3VmS1xzhZ', channel: CH, duration: 'Reel', short: true },
  'switch-hardflip': { ytId: 'e20_pPexaLg', channel: CH, duration: '1:00', short: true },
  'regular-inward-heelflip': { ytId: 'YRqZPH38Ao0', channel: CH, duration: '1:01' },
  'nollie-inward-heelflip': { igId: 'Cw3m_XcRoms', channel: CH, duration: 'Reel', short: true },
  'regular-360-flip': { ytId: 'hTntN_m-b98', channel: CH, duration: '2:22' },
  'regular-double-kickflip': { igId: 'DbJnFcnRURR', channel: CH, duration: 'Reel', short: true },
  'nollie-360-flip': { ytId: 'Dt3-NYOgdl0', channel: CH, duration: '3:33' },
  'fakie-360-flip': { ytId: 'M6z-TLqCdTM', channel: CH, duration: '1:00', short: true },
  'regular-bigspin-flip': { ytId: 'uj3CdOLdMmc', channel: CH, duration: '1:00', short: true },
  'regular-dolphin-flip': { ytId: 'K84Pkz9JU24', channel: CH, duration: '1:00', short: true },
  'regular-laser-flip': { ytId: 'UYBclNmS3t8', channel: CH, duration: '1:00', short: true },
  '50-50-grind': { ytId: 'b8zIQYbB1pI', channel: CH, duration: '0:59', short: true },
  boardslide: { ytId: '3YmqpUkzSx8', channel: CH, duration: '1:00', short: true },
  tailslide: { ytId: 'UQDuS5_R9mU', channel: CH, duration: '0:58', short: true },
  'smith-grind': { ytId: 'xBrzumyRCrA', channel: CH, duration: '0:59', short: true },
  lipslide: { ytId: '_y8G1YPcJks', channel: CH, duration: '1:00', short: true },
  'no-comply-180': { ytId: '7ju4I7YPLCM', channel: CH, duration: '1:00', short: true },
};

/** The curated tip video for a trick, or undefined if none is linked yet. */
export function tipForTrick(trick: Trick): TipVideo | undefined {
  return TIPS[trick.id];
}

/**
 * Gallery still. YouTube Shorts use the vertical `oar2` frame; landscape
 * tips use `mqdefault` (always exists, 16:9). Instagram Reels use a still
 * saved in `public/tips/` — Instagram's `/media/` posters 302 in curl but
 * browsers won't display them as `<img>` hotlinks.
 */
export function tipThumbnailUrl(tip: TipVideo): string | undefined {
  if (tip.ytId) {
    const still = tip.short ? 'oar2.jpg' : 'mqdefault.jpg';
    return `https://i.ytimg.com/vi/${tip.ytId}/${still}`;
  }
  if (tip.igId) return `/tips/${tip.igId}.jpg`;
  return undefined;
}

/**
 * YouTube embed with explicit client identity, or Instagram's official captioned embed.
 * Captioned `/embed/` plays inline; the uncaptioned reel URL often becomes a
 * "Watch on Instagram" link that leaves the app.
 */
export function tipPlayerSrc(tip: TipVideo, embeddingOrigin?: string): string | undefined {
  if (tip.igId) return `https://www.instagram.com/reel/${tip.igId}/embed/captioned/`;
  if (tip.ytId) {
    const params = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1' });
    if (embeddingOrigin) params.set('origin', embeddingOrigin);
    return `https://www.youtube.com/embed/${tip.ytId}?${params.toString()}`;
  }
  return undefined;
}

/** All curated tip videos (for the gallery count). */
export const TIP_VIDEOS = TIPS;
