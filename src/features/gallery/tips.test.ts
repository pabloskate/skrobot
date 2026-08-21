import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRICK_BY_ID } from '@/features/tricks';
import { TIP_VIDEOS, tipForTrick, tipPlayerSrc, tipThumbnailUrl } from './tips';

describe('tipForTrick', () => {
  it('only catalogs tips for real trick ids', () => {
    for (const id of Object.keys(TIP_VIDEOS)) {
      expect(TRICK_BY_ID.has(id), id).toBe(true);
    }
  });

  it('keys tips by trick id so stance variants do not share a video', () => {
    const stances = ['regular', 'fakie', 'switch', 'nollie'] as const;
    const tips = stances.map((stance) => tipForTrick(TRICK_BY_ID.get(`${stance}-kickflip`)!));
    const ytIds = tips.filter((tip) => tip?.ytId).map((tip) => tip!.ytId);

    expect(tipForTrick(TRICK_BY_ID.get('regular-kickflip')!)).toBeDefined();
    expect(new Set(ytIds).size).toBe(ytIds.length);
  });

  it('embeds a public Instagram Reel without a YouTube id', () => {
    const fakieHardflip = tipForTrick(TRICK_BY_ID.get('fakie-hardflip')!);
    expect(fakieHardflip).toMatchObject({ igId: 'Db3VmS1xzhZ', short: true });
    expect(fakieHardflip?.ytId).toBeUndefined();
    expect(tipPlayerSrc(fakieHardflip!)).toBe(
      'https://www.instagram.com/reel/Db3VmS1xzhZ/embed/captioned/',
    );
  });

  it('uses a local still for Instagram Reel gallery thumbs', () => {
    const doubleKickflip = tipForTrick(TRICK_BY_ID.get('regular-double-kickflip')!);
    expect(tipThumbnailUrl(doubleKickflip!)).toBe('/tips/DbJnFcnRURR.jpg');

    for (const tip of Object.values(TIP_VIDEOS)) {
      if (!tip.igId) continue;
      expect(existsSync(resolve('public/tips', `${tip.igId}.jpg`)), tip.igId).toBe(true);
    }
  });

  it('marks YouTube Shorts so the player can use a 9:16 frame', () => {
    const nollieBsFlip = tipForTrick(TRICK_BY_ID.get('nollie-backside-flip')!);
    const nollieFsHeel = tipForTrick(TRICK_BY_ID.get('nollie-frontside-heelflip')!);
    expect(nollieBsFlip).toMatchObject({ ytId: 'VwqbL7nnjzI', short: true });
    expect(nollieFsHeel).toMatchObject({ ytId: 'bBSN_Pxv6Z4', short: true });
    expect(tipForTrick(TRICK_BY_ID.get('regular-ollie')!)?.short).toBeUndefined();
  });

  it('identifies the app to YouTube and requests inline playback', () => {
    const kickflip = tipForTrick(TRICK_BY_ID.get('regular-kickflip')!);
    expect(tipPlayerSrc(kickflip!, 'https://app.skaterobot.com')).toBe(
      'https://www.youtube.com/embed/9msHUYrxlis?autoplay=1&rel=0&playsinline=1&origin=https%3A%2F%2Fapp.skaterobot.com',
    );
  });
});
