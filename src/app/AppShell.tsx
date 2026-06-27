'use client';

import dynamic from 'next/dynamic';
import { useState, useSyncExternalStore } from 'react';
import { TbClipboardList, TbMicrophone, TbUser, TbSkateboard } from 'react-icons/tb';
import { SignInScreen, AccountScreen, useAuth } from '@/features/auth';
import { UpgradeScreen } from '@/features/billing';
import { GalleryScreen } from '@/features/gallery';
import type { GameState } from '@/features/game';
import { GameScreen } from '@/features/game';
import { HomeScreen } from '@/features/home';
import type { Robot } from '@/features/robots';
import { RobotProfile } from '@/features/robots';
import type { TrickPool } from '@/features/tricks';
import { defaultRoutedTrickPool } from '@/features/tricks';

// Voice mode pulls in the Live SDK + audio worklets — load it only when entered.
const VoiceGameScreen = dynamic(() => import('@/features/voice').then((m) => m.VoiceGameScreen), {
  ssr: false,
  loading: () => <p className="muted center">Loading voice mode…</p>,
});

/** Top-level tabs shown in the bottom navigation bar. */
type Tab = 'skate' | 'tricks' | 'account';

/**
 * Client-side screen state machine. The whole game is a single page by design:
 * trick pools and the chosen robot are in-memory state passed between screens,
 * not URL state. If a screen ever needs to be linkable, lift its inputs into
 * the URL and split it into its own route under src/app/.
 */
type Screen =
  | { id: 'home' }
  | ({ id: 'profile'; robot: Robot } & TrickPool)
  | ({ id: 'game'; robot: Robot; resume?: GameState } & TrickPool)
  | ({ id: 'voice'; robot: Robot; resume?: GameState } & TrickPool)
  | { id: 'gallery' }
  | { id: 'account' }
  | { id: 'signin'; next?: Screen; from?: Screen }
  | { id: 'upgrade'; from?: Screen };

type ScreenId = Screen['id'];

const ROOT_SCREEN_IDS = new Set<ScreenId>(['home', 'gallery', 'account']);

const TAB_ROOT_SCREEN: Record<Tab, Extract<Screen, { id: 'home' | 'gallery' | 'account' }>> = {
  skate: { id: 'home' },
  tricks: { id: 'gallery' },
  account: { id: 'account' },
};

const ROOT_TAB_LABELS: Record<Tab, string> = {
  skate: 'S.K.A.T.E.',
  tricks: 'Tricks',
  account: 'Account',
};

function betaTabsEnabledFromLocation(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('beta') === 'true';
}

function subscribeToUrlChanges(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('popstate', onStoreChange);
  return () => window.removeEventListener('popstate', onStoreChange);
}

function isRootScreen(screen: Screen): boolean {
  return ROOT_SCREEN_IDS.has(screen.id);
}

/** Maps a screen to the tab that owns it (for the bottom nav highlight). */
function tabForScreen(screen: Screen): Tab {
  if (screen.id === 'gallery') return 'tricks';
  if (screen.id === 'account' || screen.id === 'signin' || screen.id === 'upgrade') return 'account';
  return 'skate';
}

function titleForScreen(screen: Screen): string {
  if (screen.id === 'home') return 'Skate Robot';
  if (screen.id === 'profile' || screen.id === 'game') return screen.robot.name;
  if (screen.id === 'voice') return `🎙 ${screen.robot.name}`;
  if (screen.id === 'gallery') return 'Trick Gallery';
  if (screen.id === 'account') return 'Account';
  if (screen.id === 'signin') return 'Sign in';
  return 'Upgrade';
}

const rootScreen = (): Screen => ({ id: 'home' });

export default function AppShell() {
  const auth = useAuth();
  const [screen, setScreen] = useState<Screen>(rootScreen);
  const [voiceState, setVoiceState] = useState<GameState | undefined>(undefined);
  const betaTabsEnabled = useSyncExternalStore(
    subscribeToUrlChanges,
    betaTabsEnabledFromLocation,
    () => false,
  );

  const go = (next: Screen | ((current: Screen) => Screen)) => {
    setVoiceState(undefined);
    setScreen(next);
  };

  const back = () => {
    if (screen.id === 'game' || screen.id === 'voice' || screen.id === 'profile')
      go({ id: 'home' });
    else if (screen.id === 'signin' || screen.id === 'upgrade')
      go(screen.from ?? { id: 'account' });
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

  const switchTab = (tab: Tab) => go(TAB_ROOT_SCREEN[tab]);

  const activeTab = tabForScreen(screen);
  const root = isRootScreen(screen);
  const showTabbar = root && betaTabsEnabled;
  const title = titleForScreen(screen);

  return (
    <div className={showTabbar ? 'has-tabbar' : ''}>
      {!root && (
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
              onPickRobot={(robot) => go({ id: 'profile', ...defaultRoutedTrickPool(), robot })}
              onPlayVoice={(robot) =>
                enterVoice({ id: 'voice', ...defaultRoutedTrickPool(), robot }, { id: 'home' })
              }
            />
          )}
          {screen.id === 'gallery' && <GalleryScreen />}
          {screen.id === 'account' && (
            <AccountScreen onSignIn={() => go({ id: 'signin', from: { id: 'account' } })} />
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

      {showTabbar && (
        <nav className="tabbar">
          <button
            className={`tabbar-btn ${activeTab === 'skate' ? 'active' : ''}`}
            onClick={() => switchTab('skate')}
          >
            <TbSkateboard aria-hidden />
            <span className="tabbar-label">{ROOT_TAB_LABELS.skate}</span>
          </button>
          <button
            className={`tabbar-btn ${activeTab === 'tricks' ? 'active' : ''}`}
            onClick={() => switchTab('tricks')}
          >
            <TbClipboardList aria-hidden />
            <span className="tabbar-label">{ROOT_TAB_LABELS.tricks}</span>
          </button>
          <button
            className={`tabbar-btn ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => switchTab('account')}
          >
            <TbUser aria-hidden />
            <span className="tabbar-label">{ROOT_TAB_LABELS.account}</span>
          </button>
        </nav>
      )}
    </div>
  );
}
