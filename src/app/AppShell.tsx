'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { SignInScreen, useAuth } from '@/features/auth';
import { UpgradeScreen } from '@/features/billing';
import { DiceScreen } from '@/features/dice';
import type { GameState } from '@/features/game';
import { GameScreen } from '@/features/game';
import type { ModeChoice } from '@/features/home';
import { HomeScreen } from '@/features/home';
import type { Robot } from '@/features/robots';
import { RobotProfile, RobotSelect } from '@/features/robots';
import type { Category, Trick } from '@/features/tricks';
import { CustomSetup, tricksFor } from '@/features/tricks';
import { ThemeToggle } from '@/shared/theme';

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
  | { id: 'profile'; pool: Trick[]; poolLabel: string; robot: Robot }
  | { id: 'game'; pool: Trick[]; poolLabel: string; robot: Robot; resume?: GameState }
  | { id: 'voice'; pool: Trick[]; poolLabel: string; robot: Robot; resume?: GameState }
  | { id: 'signin'; next?: Screen; from?: Screen }
  | { id: 'upgrade'; from?: Screen };

const CATEGORY_LABELS: Record<Category, string> = {
  flatground: 'Flatground',
  grinds: 'Grinds',
  other: 'Other',
};

export default function AppShell() {
  const auth = useAuth();
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
    if (screen.id === 'game' || screen.id === 'voice' || screen.id === 'profile')
      setScreen({ id: 'robots', pool: screen.pool, poolLabel: screen.poolLabel });
    else if (screen.id === 'signin' || screen.id === 'upgrade') setScreen(screen.from ?? { id: 'home' });
    else setScreen({ id: 'home' });
  };

  const enterVoice = (next: Extract<Screen, { id: 'voice' }>, from: Screen) => {
    if (!auth.loading && auth.user) setScreen(next);
    else setScreen({ id: 'signin', next, from });
  };

  const continueAfterSignIn = async () => {
    const data = await auth.refresh();
    if (!data.user) return;
    setScreen((current) => (current.id === 'signin' ? (current.next ?? current.from ?? { id: 'home' }) : current));
  };

  const title =
    screen.id === 'home'
      ? 'Skate Robot'
      : screen.id === 'dice'
        ? 'Skate Dice'
        : screen.id === 'custom'
          ? 'Custom Game'
          : screen.id === 'profile' || screen.id === 'game'
            ? screen.robot.name
            : screen.id === 'voice'
              ? `🎙 ${screen.robot.name}`
              : screen.id === 'signin'
                ? 'Sign in'
                : screen.id === 'upgrade'
                  ? 'Upgrade'
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
        <ThemeToggle />
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
              setScreen({ id: 'profile', pool: screen.pool, poolLabel: screen.poolLabel, robot })
            }
          />
        )}
        {screen.id === 'profile' && (
          <RobotProfile
            robot={screen.robot}
            pool={screen.pool}
            onStart={() =>
              setScreen({ id: 'game', pool: screen.pool, poolLabel: screen.poolLabel, robot: screen.robot })
            }
          />
        )}
        {screen.id === 'game' && (
          <GameScreen
            key={screen.robot.id}
            robot={screen.robot}
            pool={screen.pool}
            resume={screen.resume}
            onExit={back}
            onVoice={(state) =>
              enterVoice(
                { id: 'voice', pool: screen.pool, poolLabel: screen.poolLabel, robot: screen.robot, resume: state },
                screen,
              )
            }
          />
        )}
        {screen.id === 'voice' && (
          <VoiceGameScreen
            key={screen.robot.id}
            robot={screen.robot}
            pool={screen.pool}
            resume={screen.resume}
            onExit={back}
            onScreenMode={(state) => setScreen({ ...screen, id: 'game', resume: state })}
          />
        )}
        {screen.id === 'signin' && <SignInScreen onDone={continueAfterSignIn} onCancel={back} />}
        {screen.id === 'upgrade' && <UpgradeScreen onCancel={back} />}
      </main>
    </>
  );
}
