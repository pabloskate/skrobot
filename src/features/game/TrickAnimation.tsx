'use client';

import type { ComponentProps } from 'react';
import {
  TrickAnimation3D,
} from '@skrobot/animations';
import { usePlayerStance } from './gamePreferences';

type Props = ComponentProps<typeof TrickAnimation3D>;

export default function PlayerStanceTrickAnimation(props: Props) {
  const stance = usePlayerStance();
  return <TrickAnimation3D {...props} riderStance={stance} />;
}
