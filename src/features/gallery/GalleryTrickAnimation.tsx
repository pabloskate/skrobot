'use client';

import { TrickAnimation3DLegacy } from '@skrobot/animations';
import { ROBOT_BY_ID, ROBOTS } from '@/features/robots';
import type { Trick } from '@/features/tricks';

const GALLERY_ROBOT = ROBOT_BY_ID.get('shifty') ?? ROBOTS[0];
const ignoreAnimationEnd = () => {};

/** A clean, always-landed playback used when a curated tutorial is unavailable. */
export default function GalleryTrickAnimation({ trick }: { trick: Trick }) {
  return (
    <TrickAnimation3DLegacy
      robot={GALLERY_ROBOT}
      trick={trick}
      landed
      knewIt
      onDone={ignoreAnimationEnd}
    />
  );
}
