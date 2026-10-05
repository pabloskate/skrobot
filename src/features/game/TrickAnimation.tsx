'use client';

import type { ComponentProps } from 'react';
import dynamic from 'next/dynamic';
import type { TrickScene3D } from '@skrobot/animations/three';
import { usePlayerStance } from './gamePreferences';

const GameTrickScene = dynamic(
  () => import('@skrobot/animations/three').then((animations) => animations.TrickScene3D),
  {
    ssr: false,
    loading: () => <div className="game-stage-placeholder" role="status">Loading skate spot…</div>,
  },
);

type Props = ComponentProps<typeof TrickScene3D>;

export default function PlayerStanceTrickAnimation(props: Props) {
  const stance = usePlayerStance();
  return <GameTrickScene showSpeedToggle set="waterfront" sound {...props} riderStance={stance} />;
}
