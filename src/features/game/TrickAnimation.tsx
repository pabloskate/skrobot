'use client';

import type { ComponentProps } from 'react';
import {
  TrickAnimation3D,
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

type Props = ComponentProps<typeof TrickAnimation3D>;

export default function PlayerStanceTrickAnimation(props: Props) {
  const stance = usePlayerStance();
  return <TrickAnimation3D {...props} riderStance={stance} />;
}
