'use client';

import type { ComponentProps } from 'react';
import { TrickScene } from '@skrobot/animations';
import { usePlayerStance } from './gamePreferences';

type Props = ComponentProps<typeof TrickScene>;

export default function PlayerStanceTrickAnimation(props: Props) {
  const stance = usePlayerStance();
  return <TrickScene {...props} riderStance={stance} />;
}
