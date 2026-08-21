'use client';

import type { ComponentProps } from 'react';
import {
  TrickAnimation3DLegacy,
} from '@skrobot/animations';
import { usePlayerStance } from './gamePreferences';

export {
  TrickAnimation,
  SlowMotionTrickAnimation,
  BACKGROUND_SCENE_OPTIONS,
  FALL_VARIANT_OPTIONS,
  SLOW_MOTION_PLAYBACK_RATE,
  type BackgroundSceneId,
  type FallVariant,
} from '@skrobot/animations';

type Props = ComponentProps<typeof TrickAnimation3DLegacy>;

export default function PlayerStanceTrickAnimation(props: Props) {
  const stance = usePlayerStance();
  // Legacy 3D renderer until the reworked one is ironed out (see
  // TrickAnimation3DLegacy in @skrobot/animations).
  return <TrickAnimation3DLegacy {...props} riderStance={stance} />;
}
