'use client';

import dynamic from 'next/dynamic';
import { ROBOT_BY_ID, ROBOTS } from '@/features/robots';
import type { Trick } from '@/features/tricks';

const GALLERY_ROBOT = ROBOT_BY_ID.get('shifty') ?? ROBOTS[0];
const ignoreAnimationEnd = () => {};

/** three.js loads only when someone opens a trick without a video tip. */
const TrickScene3D = dynamic(
  () => import('@skrobot/animations/three').then((animations) => animations.TrickScene3D),
  {
    ssr: false,
    loading: () => <div className="game-stage-placeholder" role="status">Loading skate spot…</div>,
  },
);

/** A clean, always-landed playback used when a curated tutorial is unavailable. */
export default function GalleryTrickAnimation({ trick }: { trick: Trick }) {
  return (
    <TrickScene3D
      robot={GALLERY_ROBOT}
      trick={trick}
      landed
      knewIt
      showSpeedToggle
      onDone={ignoreAnimationEnd}
    />
  );
}
