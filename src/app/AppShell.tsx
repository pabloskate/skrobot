'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { DiceScreen } from '@/features/dice';
import { GameScreen } from '@/features/game';
import type { ModeChoice } from '@/features/home';
import { HomeScreen } from '@/features/home';
import type { Robot } from '@/features/robots';
import { RobotSelect } from '@/features/robots';
import type { Category, Trick } from '@/features/tricks';
import { CustomSetup, tricksFor } from '@/features/tricks';

// Voice mode pulls in the Live SDK + audio worklets — load it only when entered.
const VoiceGameScreen = dynamic(() => import('@/features/voice').then((m) => m.VoiceGameScreen), {
  ssr: false,
  loading: () => <p className="muted center">Loading voice mode…</p>,
});

/**
 * Client-side screen state machine. The whole game is a single page by design:
 * trick pools and the chosen robot are in-memory state passed between screens,
 * not URL state. If a screen ever needs to be linkable, lift its inputs into
 * the URL and split it into its own route under src/app/.
 */
type Screen =
  | { id: 'home' }
  | { id: 'dice' }
  | { id: 'custom' }
  | { id: 'robots'; pool: Trick[]; poolLabel: string }
  | { id: 'game'; pool: Trick[]; poolLabel: string; robot: Robot }
  | { id: 'voice'; pool: Trick[]; poolLabel: string; robot: Robot };

const CATEGORY_LABELS: Record<Category, string> = {
  flatground: 'Flatground',
  grinds: 'Grinds',
  other: 'Other',
};

export default function AppShell() {
  const [screen, setScreen] = useState<Screen>({ id: 'home' });

  const onMode = (mode: ModeChoice) => {
    if (mode.kind === 'dice') setScreen({ id: 'dice' });
    else if (mode.kind === 'custom') setScreen({ id: 'custom' });
    else
      setScreen({
        id: 'robots',
        pool: tricksFor(mode.category),
        poolLabel: CATEGORY_LABELS[mode.category],
      });
  };

  const back = () => {
    if (screen.id === 'game' || screen.id === 'voice')
      setScreen({ id: 'robots', pool: screen.pool, poolLabel: screen.poolLabel });
    else setScreen({ id: 'home' });
  };

  const title =
    screen.id === 'home'
      ? 'Skate Robot'
      : screen.id === 'dice'
        ? 'Skate Dice'
        : screen.id === 'custom'
          ? 'Custom Game'
          : screen.id === 'game'
            ? screen.robot.name
            : screen.id === 'voice'
              ? `🎙 ${screen.robot.name}`
              : `${screen.poolLabel} · Pick a robot`;

  return (
    <>
      <header className="topbar">
        {screen.id !== 'home' && (
          <button className="back-btn" onClick={back} aria-label="Back">
            ←
          </button>
        )}
        <h1>{title}</h1>
      </header>
      <main>
        {screen.id === 'home' && <HomeScreen onPick={onMode} />}
        {screen.id === 'dice' && <DiceScreen />}
        {screen.id === 'custom' && (
          <CustomSetup onDone={(pool) => setScreen({ id: 'robots', pool, poolLabel: 'Custom' })} />
        )}
        {screen.id === 'robots' && (
          <RobotSelect
            onPick={(robot) =>
              setScreen({ id: 'game', pool: screen.pool, poolLabel: screen.poolLabel, robot })
            }
          />
        )}
        {screen.id === 'game' && (
          <GameScreen
            key={screen.robot.id}
            robot={screen.robot}
            pool={screen.pool}
            onExit={back}
            onVoice={() =>
              setScreen({ id: 'voice', pool: screen.pool, poolLabel: screen.poolLabel, robot: screen.robot })
            }
          />
        )}
        {screen.id === 'voice' && (
          <VoiceGameScreen key={screen.robot.id} robot={screen.robot} pool={screen.pool} onExit={back} />
        )}
      </main>
    </>
  );
}
