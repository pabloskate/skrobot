'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { TbMicrophone } from 'react-icons/tb';
import { SignInScreen, useAuth } from '@/features/auth';
import { UpgradeScreen } from '@/features/billing';
import type { GameState } from '@/features/game';
import { GameScreen } from '@/features/game';
import { HomeScreen } from '@/features/home';
import type { Robot } from '@/features/robots';
import { RobotProfile } from '@/features/robots';
import type { Trick } from '@/features/tricks';
import { tricksFor } from '@/features/tricks';

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
  | { id: 'profile'; pool: Trick[]; poolLabel: string; robot: Robot }
  | { id: 'game'; pool: Trick[]; poolLabel: string; robot: Robot; resume?: GameState }
  | { id: 'voice'; pool: Trick[]; poolLabel: string; robot: Robot; resume?: GameState }
  | { id: 'signin'; next?: Screen; from?: Screen }
  | { id: 'upgrade'; from?: Screen };

const FLATGROUND = () => ({ pool: tricksFor('flatground'), poolLabel: 'Flatground' });

/** The app opens to the home screen — a dynamic hero above the robot roster. */
const rootScreen = (): Screen => ({ id: 'home' });

export default function AppShell() {
  const auth = useAuth();
  const [screen, setScreen] = useState<Screen>(rootScreen);
  const [voiceState, setVoiceState] = useState<GameState | undefined>(undefined);

  const isRoot = screen.id === 'home';
  const go = (next: Screen | ((current: Screen) => Screen)) => {
    setVoiceState(undefined);
    setScreen(next);
  };

  const back = () => {
    if (screen.id === 'game' || screen.id === 'voice' || screen.id === 'profile')
      go({ id: 'home' });
    else if (screen.id === 'signin' || screen.id === 'upgrade') go(screen.from ?? rootScreen());
    else go(rootScreen());
  };

  const enterVoice = (next: Extract<Screen, { id: 'voice' }>, from: Screen) => {
    if (!auth.loading && auth.user) go(next);
    else go({ id: 'signin', next, from });
  };

  const continueAfterSignIn = async () => {
    const data = await auth.refresh();
    if (!data.user) return;
    go((current) => (current.id === 'signin' ? (current.next ?? current.from ?? rootScreen()) : current));
  };

  const title =
    screen.id === 'home'
      ? 'Skate Robot'
      : screen.id === 'profile' || screen.id === 'game'
        ? screen.robot.name
        : screen.id === 'voice'
          ? `🎙 ${screen.robot.name}`
          : screen.id === 'signin'
            ? 'Sign in'
            : 'Upgrade';

  return (
    <>
      {!isRoot && (
        <header className="topbar">
          <button className="back-btn" onClick={back} aria-label="Back">
            ←
          </button>
          <h1>{title}</h1>
          {screen.id === 'game' && voiceState && (
            <button
              className="voice-nav-btn"
              onClick={() =>
                enterVoice(
                  { id: 'voice', pool: screen.pool, poolLabel: screen.poolLabel, robot: screen.robot, resume: voiceState },
                  screen,
                )
              }
              aria-label="Play by voice"
            >
              <TbMicrophone aria-hidden />
            </button>
          )}
        </header>
      )}
      <main>
        <div className="screen" key={screen.id}>
          {screen.id === 'home' && (
            <HomeScreen
              onPickRobot={(robot) => go({ id: 'profile', ...FLATGROUND(), robot })}
              onPlayVoice={(robot) =>
                enterVoice({ id: 'voice', ...FLATGROUND(), robot }, { id: 'home' })
              }
            />
          )}
          {screen.id === 'profile' && (
            <RobotProfile
              robot={screen.robot}
              pool={screen.pool}
              onStart={() =>
                go({ id: 'game', pool: screen.pool, poolLabel: screen.poolLabel, robot: screen.robot })
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
              onVoiceState={setVoiceState}
            />
          )}
          {screen.id === 'voice' && (
            <VoiceGameScreen
              key={screen.robot.id}
              robot={screen.robot}
              pool={screen.pool}
              resume={screen.resume}
              onExit={back}
              onScreenMode={(state) => go({ ...screen, id: 'game', resume: state })}
            />
          )}
          {screen.id === 'signin' && <SignInScreen onDone={continueAfterSignIn} onCancel={back} />}
          {screen.id === 'upgrade' && <UpgradeScreen onCancel={back} />}
        </div>
      </main>
    </>
  );
}
