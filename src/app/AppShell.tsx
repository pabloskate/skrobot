'use client';

import dynamic from 'next/dynamic';
import { useState, useSyncExternalStore } from 'react';
import { TbClipboardList, TbMicrophone, TbSettings, TbSkateboard } from 'react-icons/tb';
import { SignInScreen, SettingsScreen, useAuth } from '@/features/auth';
import { UpgradeScreen } from '@/features/billing';
import { GalleryScreen } from '@/features/gallery';
import type { GameState, SavedGame } from '@/features/game';
import {
  GameScreen,
  GamePreferencesSection,
  lettersForFormat,
  clearSavedGame,
  getSavedGame,
  isSaveWorthKeeping,
  saveGame,
  subscribeSavedGame,
  useGameFormat,
  useGameVariant,
} from '@/features/game';
import { HomeScreen } from '@/features/home';
import type { Robot } from '@/features/robots';
import { ROBOT_BY_ID, RobotProfile } from '@/features/robots';
import type { TrickPool } from '@/features/tricks';
import { defaultRoutedTrickPool } from '@/features/tricks';
import { useOnlineStatus } from '@/shared/useOnlineStatus';

function serverSavedSnapshot(): SavedGame | null {
  return null;
}

function browserSavedSnapshot(): SavedGame | null {
  return getSavedGame();
}

// Voice mode pulls in the Live SDK + audio worklets — load it only when entered.
const VoiceGameScreen = dynamic(() => import('@/features/voice').then((m) => m.VoiceGameScreen), {
  ssr: false,
  loading: () => <p className="muted center">Loading voice mode…</p>,
});

/** Top-level tabs shown in the bottom navigation bar. */
type Tab = 'skate' | 'tricks' | 'settings';

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
  | { id: 'settings' }
  | { id: 'signin'; next?: Screen; from?: Screen }
  | { id: 'upgrade'; from?: Screen };

type ScreenId = Screen['id'];

const ROOT_SCREEN_IDS = new Set<ScreenId>(['home', 'gallery', 'settings']);

const TAB_ROOT_SCREEN: Record<Tab, Extract<Screen, { id: 'home' | 'gallery' | 'settings' }>> = {
  skate: { id: 'home' },
  tricks: { id: 'gallery' },
  settings: { id: 'settings' },
};

const ROOT_TAB_LABELS: Record<Exclude<Tab, 'skate'>, string> = {
  tricks: 'Tricks',
  settings: 'Settings',
};

function betaTricksEnabledFromLocation(): boolean {
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
  if (screen.id === 'settings' || screen.id === 'signin' || screen.id === 'upgrade') return 'settings';
  return 'skate';
}

function titleForScreen(screen: Screen): string {
  if (screen.id === 'home') return 'Skate Robot';
  if (screen.id === 'profile' || screen.id === 'game') return screen.robot.name;
  if (screen.id === 'voice') return `🎙 ${screen.robot.name}`;
  if (screen.id === 'gallery') return 'Trick Gallery';
  if (screen.id === 'settings') return 'Settings';
  if (screen.id === 'signin') return 'Sign in';
  return 'Upgrade';
}

const rootScreen = (): Screen => ({ id: 'home' });

export default function AppShell() {
  const auth = useAuth();
  const gameFormat = useGameFormat();
  const gameVariant = useGameVariant();
  const online = useOnlineStatus();
  const [screen, setScreen] = useState<Screen>(rootScreen);
  const [voiceState, setVoiceState] = useState<GameState | undefined>(undefined);
  const [liveGame, setLiveGame] = useState<GameState | undefined>(undefined);
  const [exitPromptOpen, setExitPromptOpen] = useState(false);
  const betaTricksEnabled = useSyncExternalStore(
    subscribeToUrlChanges,
    betaTricksEnabledFromLocation,
    () => false,
  );
  const savedGame = useSyncExternalStore(subscribeSavedGame, browserSavedSnapshot, serverSavedSnapshot);
  const savedRobot = savedGame ? ROBOT_BY_ID.get(savedGame.robotId) : undefined;

  const go = (next: Screen | ((current: Screen) => Screen)) => {
    setVoiceState(undefined);
    setLiveGame(undefined);
    setExitPromptOpen(false);
    setScreen(next);
  };

  const leaveMatch = (opts: { save: boolean }) => {
    if ((screen.id === 'game' || screen.id === 'voice') && liveGame && opts.save) {
      saveGame({
        robotId: screen.robot.id,
        mode: screen.id === 'voice' ? 'voice' : 'screen',
        state: liveGame,
      });
    } else if (opts.save === false) {
      clearSavedGame();
    }
    go({ id: 'home' });
  };

  const back = () => {
    if (screen.id === 'game' || screen.id === 'voice') {
      if (liveGame && isSaveWorthKeeping(liveGame)) {
        setExitPromptOpen(true);
        return;
      }
      go({ id: 'home' });
      return;
    }
    if (screen.id === 'profile') go({ id: 'home' });
    else if (screen.id === 'signin' || screen.id === 'upgrade')
      go(screen.from ?? { id: 'settings' });
    else go(rootScreen());
  };

  const enterVoice = (next: Extract<Screen, { id: 'voice' }>, from: Screen) => {
    if (!online) return;
    if (!auth.loading && auth.user) go(next);
    else go({ id: 'signin', next, from });
  };

  const continueAfterSignIn = async () => {
    const data = await auth.refresh();
    if (!data.user) return;
    go((current) => (current.id === 'signin' ? (current.next ?? current.from ?? rootScreen()) : current));
  };

  const continueSavedGame = () => {
    if (!savedGame || !savedRobot) {
      clearSavedGame();
      return;
    }
    const next = {
      ...defaultRoutedTrickPool(),
      robot: savedRobot,
      resume: savedGame.state,
    };
    if (savedGame.mode === 'voice') {
      enterVoice({ id: 'voice', ...next }, { id: 'home' });
      return;
    }
    go({ id: 'game', ...next });
  };

  const switchTab = (tab: Tab) => go(TAB_ROOT_SCREEN[tab]);

  const activeTab = tabForScreen(screen);
  const root = isRootScreen(screen);
  const showTabbar = root;
  const title = titleForScreen(screen);
  const exitRobotName =
    screen.id === 'game' || screen.id === 'voice' ? screen.robot.name : 'this robot';

  return (
    <div className={`${showTabbar ? 'has-tabbar ' : ''}${root ? 'is-root-screen' : 'is-detail-screen'}`}>
      {!root && (
        <header className="topbar">
          <button className="back-btn" onClick={back} aria-label="Back">
            ←
          </button>
          <h1>{title}</h1>
          {screen.id === 'game' && voiceState && (
            <button
              className="voice-nav-btn"
              disabled={!online}
              onClick={() =>
                enterVoice(
                  {
                    id: 'voice',
                    pool: screen.pool,
                    poolLabel: screen.poolLabel,
                    robot: screen.robot,
                    resume: voiceState,
                  },
                  screen,
                )
              }
              aria-label={online ? 'Play by voice' : 'Voice needs internet'}
              title={online ? 'Play by voice' : 'Voice needs internet'}
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
              voiceEnabled={online}
              onPlayVoice={(robot) =>
                enterVoice({ id: 'voice', ...defaultRoutedTrickPool(), robot }, { id: 'home' })
              }
              continueMatch={
                savedGame && savedRobot
                  ? {
                      robot: savedRobot,
                      mode: savedGame.mode,
                      playerLetters: savedGame.state.letters.player,
                      robotLetters: savedGame.state.letters.robot,
                      gameLetters: lettersForFormat(savedGame.state.gameFormat),
                    }
                  : null
              }
              onContinueGame={continueSavedGame}
              onDiscardContinue={clearSavedGame}
            />
          )}
          {screen.id === 'gallery' && <GalleryScreen />}
          {screen.id === 'settings' && (
            <SettingsScreen onSignIn={() => go({ id: 'signin', from: { id: 'settings' } })}>
              <GamePreferencesSection />
            </SettingsScreen>
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
              gameFormat={screen.resume?.gameFormat ?? gameFormat}
              gameVariant={screen.resume?.gameVariant ?? gameVariant}
              resume={screen.resume}
              onExit={back}
              onVoiceState={setVoiceState}
              onGameState={setLiveGame}
            />
          )}
          {screen.id === 'voice' && (
            <VoiceGameScreen
              key={screen.robot.id}
              robot={screen.robot}
              pool={screen.pool}
              gameFormat={screen.resume?.gameFormat ?? gameFormat}
              resume={screen.resume}
              onExit={back}
              onGameState={setLiveGame}
              onScreenMode={(state) => go({ ...screen, id: 'game', resume: state })}
            />
          )}
          {screen.id === 'signin' && <SignInScreen onDone={continueAfterSignIn} onCancel={back} />}
          {screen.id === 'upgrade' && <UpgradeScreen onCancel={back} />}
        </div>
      </main>

      {exitPromptOpen && (screen.id === 'game' || screen.id === 'voice') && (
        <div className="sheet-backdrop" onClick={() => setExitPromptOpen(false)}>
          <div
            className="sheet exit-sheet"
            role="dialog"
            aria-label="Save game progress?"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-header">
              <h2>Leave game?</h2>
              <button className="btn-ghost" onClick={() => setExitPromptOpen(false)}>
                Cancel
              </button>
            </div>
            <p className="exit-sheet-copy">
              Save your match vs {exitRobotName} and pick it up later from the home screen, or scrap
              it and start fresh next time.
            </p>
            {liveGame && (
              <p className="exit-sheet-score muted">
                Score — You {liveGame.letters.player} · {exitRobotName} {liveGame.letters.robot}
              </p>
            )}
            <div className="exit-sheet-actions">
              <button className="btn-primary" onClick={() => leaveMatch({ save: true })}>
                Save & exit
              </button>
              <button className="btn-ghost" onClick={() => leaveMatch({ save: false })}>
                Exit without saving
              </button>
            </div>
          </div>
        </div>
      )}

      {showTabbar && (
        <nav className="tabbar">
          <button
            className={`tabbar-btn ${activeTab === 'skate' ? 'active' : ''}`}
            onClick={() => switchTab('skate')}
          >
            <TbSkateboard aria-hidden />
            <span className="tabbar-label">{gameFormat === 'sk8' ? 'SK8' : 'S.K.A.T.E.'}</span>
          </button>
          {betaTricksEnabled && (
            <button
              className={`tabbar-btn ${activeTab === 'tricks' ? 'active' : ''}`}
              onClick={() => switchTab('tricks')}
            >
              <TbClipboardList aria-hidden />
              <span className="tabbar-label">{ROOT_TAB_LABELS.tricks}</span>
            </button>
          )}
          <button
            className={`tabbar-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => switchTab('settings')}
          >
            <TbSettings aria-hidden />
            <span className="tabbar-label">{ROOT_TAB_LABELS.settings}</span>
          </button>
        </nav>
      )}
    </div>
  );
}
