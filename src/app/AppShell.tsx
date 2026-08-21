'use client';

import dynamic from 'next/dynamic';
import { useState, useSyncExternalStore, type MouseEvent } from 'react';
import { TbClipboardList, TbMicrophone, TbSettings, TbSkateboard } from 'react-icons/tb';
import { SignInScreen, SettingsScreen, useAuth } from '@/features/auth';
import { UpgradeScreen } from '@/features/billing';
import { GalleryScreen } from '@/features/gallery';
import { getGameLog, getRecords } from '@/features/records';
import type { GameSessionSnapshot, SavedGame } from '@/features/game';
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
import { AppInstallBanner, useAppInstallOffer } from '@/features/install';
import type { Robot } from '@/features/robots';
import { RobotProfile } from '@/features/robots';
import { isRivalId, resolveRobot } from '@/features/skater';
import type { TrickPool } from '@/features/tricks';
import { defaultRoutedTrickPool } from '@/features/tricks';
import { useOnlineStatus } from '@/shared/useOnlineStatus';
import {
  betaFeaturesEnabledFromSearch,
  hrefForRootTab,
  parseRootTab,
  subscribeToUrlChanges,
  syncRootTabUrl,
  type RootTab,
} from './rootTab';

function serverSavedSnapshot(): SavedGame | null {
  return null;
}

function browserSavedSnapshot(): SavedGame | null {
  return getSavedGame();
}

function subscribeToNativeApp(): () => void {
  return () => {};
}

function browserNativeAppSnapshot(): boolean {
  const nativeWindow = window as Window & {
    ReactNativeWebView?: unknown;
    __SKROBOT_NATIVE_APP?: true;
  };
  return nativeWindow.__SKROBOT_NATIVE_APP === true || nativeWindow.ReactNativeWebView !== undefined;
}

function serverNativeAppSnapshot(): boolean {
  return false;
}

// Voice mode pulls in the Live SDK + audio worklets — load it only when entered.
const VoiceGameScreen = dynamic(() => import('@/features/voice').then((m) => m.VoiceGameScreen), {
  ssr: false,
  loading: () => <p className="muted center">Loading voice mode…</p>,
});

/** Top-level tabs shown in the bottom navigation bar. */
type Tab = RootTab;

/**
 * Client-side screen state machine. The whole game is a single page by design:
 * trick pools and the chosen robot are in-memory state. Root tabs are
 * addressable with `?tab=skate|tricks|settings` so they can be shared; game
 * screens stay in memory because trick pools aren't URL-serializable.
 */
type Screen =
  | { id: 'home' }
  | ({ id: 'profile'; robot: Robot } & TrickPool)
  | ({ id: 'game'; robot: Robot; resume?: GameSessionSnapshot } & TrickPool)
  | ({ id: 'voice'; robot: Robot; resume?: GameSessionSnapshot } & TrickPool)
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

export default function AppShell({ initialSearch = '' }: { initialSearch?: string }) {
  const auth = useAuth();
  const gameFormat = useGameFormat();
  const gameVariant = useGameVariant();
  const online = useOnlineStatus();
  const nativeApp = useSyncExternalStore(
    subscribeToNativeApp,
    browserNativeAppSnapshot,
    serverNativeAppSnapshot,
  );
  const appInstallOffer = useAppInstallOffer(nativeApp);
  const search = useSyncExternalStore(subscribeToUrlChanges, () => window.location.search, () => initialSearch);
  const betaFeaturesEnabled = betaFeaturesEnabledFromSearch(search);
  const urlTab = parseRootTab(search);
  const [detail, setDetail] = useState<Screen | null>(null);
  const screen = detail ?? TAB_ROOT_SCREEN[urlTab];
  const [voiceState, setVoiceState] = useState<GameSessionSnapshot | undefined>(undefined);
  const [liveGame, setLiveGame] = useState<GameSessionSnapshot | undefined>(undefined);
  const [exitPromptOpen, setExitPromptOpen] = useState(false);
  const savedGame = useSyncExternalStore(subscribeSavedGame, browserSavedSnapshot, serverSavedSnapshot);
  // Roster lookup, with the adaptive rival resolved from current form (it
  // adapts between games — a resumed save meets the rival as it skates today).
  const resolvedSavedRobot = savedGame ? resolveRobot(savedGame.robotId, getGameLog(), getRecords()) : undefined;
  const savedRobot = savedGame && isRivalId(savedGame.robotId) && !betaFeaturesEnabled
    ? undefined
    : resolvedSavedRobot;
  const adaptiveSaveWaiting = Boolean(
    betaFeaturesEnabled && savedGame && isRivalId(savedGame.robotId) && !savedRobot,
  );

  const go = (next: Screen | ((current: Screen) => Screen)) => {
    setVoiceState(undefined);
    setLiveGame(undefined);
    setExitPromptOpen(false);
    setDetail((currentDetail) => {
      const current = currentDetail ?? TAB_ROOT_SCREEN[urlTab];
      const resolved = typeof next === 'function' ? next(current) : next;
      return isRootScreen(resolved) ? null : resolved;
    });
  };

  const goRoot = (tab: Tab) => {
    if (tab === 'settings') window.scrollTo(0, 0);
    syncRootTabUrl(tab);
    setVoiceState(undefined);
    setLiveGame(undefined);
    setExitPromptOpen(false);
    setDetail(null);
  };

  const leaveMatch = (opts: { save: boolean }) => {
    if ((screen.id === 'game' || screen.id === 'voice') && liveGame && opts.save) {
      saveGame({
        robotId: screen.robot.id,
        mode: screen.id === 'voice' ? 'voice' : 'screen',
        state: liveGame.state,
        progress: liveGame.progress,
      });
    } else if (opts.save === false) {
      clearSavedGame();
    }
    goRoot('skate');
  };

  const back = () => {
    if (screen.id === 'game' || screen.id === 'voice') {
      if (liveGame && isSaveWorthKeeping(liveGame.state)) {
        setExitPromptOpen(true);
        return;
      }
      goRoot('skate');
      return;
    }
    if (screen.id === 'profile') goRoot('skate');
    else if (screen.id === 'signin' || screen.id === 'upgrade') {
      const from = screen.from ?? { id: 'settings' as const };
      if (isRootScreen(from)) goRoot(tabForScreen(from));
      else go(from);
    } else goRoot('skate');
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
      resume: { state: savedGame.state, progress: savedGame.progress },
    };
    if (betaFeaturesEnabled && savedGame.mode === 'voice') {
      enterVoice({ id: 'voice', ...next }, { id: 'home' });
      return;
    }
    // Older release channels resume any saved voice match on screen.
    go({ id: 'game', ...next });
  };

  const switchTab = (tab: Tab, event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    goRoot(tab);
  };

  const activeTab = tabForScreen(screen);
  const root = isRootScreen(screen);
  const showTabbar = root;
  const title = titleForScreen(screen);
  const exitRobotName =
    screen.id === 'game' || screen.id === 'voice' ? screen.robot.name : 'this robot';

  return (
    <div className={`${showTabbar ? 'has-tabbar ' : ''}${root ? 'is-root-screen' : 'is-detail-screen'}${nativeApp ? ' is-native-app' : ''}`}>
      {!root && (
        <header className="topbar">
          <button className="back-btn" onClick={back} aria-label="Back">
            ←
          </button>
          <h1>{title}</h1>
          {betaFeaturesEnabled && screen.id === 'game' && voiceState && (
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
              installBanner={<AppInstallBanner offer={appInstallOffer} />}
              onPickRobot={(robot) => go({ id: 'profile', ...defaultRoutedTrickPool(), robot })}
              voiceVisible={betaFeaturesEnabled}
              adaptiveMatchVisible={betaFeaturesEnabled}
              adaptiveSaveWaiting={betaFeaturesEnabled && adaptiveSaveWaiting}
              voiceEnabled={online}
              onPlayVoice={
                betaFeaturesEnabled
                  ? (robot) =>
                      enterVoice({ id: 'voice', ...defaultRoutedTrickPool(), robot }, { id: 'home' })
                  : undefined
              }
              continueMatch={
                savedGame && savedRobot
                  ? {
                      robot: savedRobot,
                      mode: betaFeaturesEnabled ? savedGame.mode : 'screen',
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
            <SettingsScreen
              onSignIn={() => go({ id: 'signin', from: { id: 'settings' } })}
              voiceVisible={betaFeaturesEnabled}
            >
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
              gameFormat={screen.resume?.state.gameFormat ?? gameFormat}
              gameVariant={screen.resume?.state.gameVariant ?? gameVariant}
              resume={screen.resume}
              onExit={back}
              onVoiceState={betaFeaturesEnabled ? setVoiceState : undefined}
              onGameState={setLiveGame}
              trickSaveEnabled
            />
          )}
          {betaFeaturesEnabled && screen.id === 'voice' && (
            <VoiceGameScreen
              key={screen.robot.id}
              robot={screen.robot}
              pool={screen.pool}
              gameFormat={screen.resume?.state.gameFormat ?? gameFormat}
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
                Score — You {liveGame.state.letters.player} · {exitRobotName}{' '}
                {liveGame.state.letters.robot}
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
          <a
            href={hrefForRootTab('skate', search)}
            className={`tabbar-btn ${activeTab === 'skate' ? 'active' : ''}`}
            aria-current={activeTab === 'skate' ? 'page' : undefined}
            onClick={(event) => switchTab('skate', event)}
          >
            <TbSkateboard aria-hidden />
            <span className="tabbar-label">{gameFormat === 'sk8' ? 'SK8' : 'S.K.A.T.E.'}</span>
          </a>
          <a
            href={hrefForRootTab('tricks', search)}
            className={`tabbar-btn ${activeTab === 'tricks' ? 'active' : ''}`}
            aria-current={activeTab === 'tricks' ? 'page' : undefined}
            onClick={(event) => switchTab('tricks', event)}
          >
            <TbClipboardList aria-hidden />
            <span className="tabbar-label">{ROOT_TAB_LABELS.tricks}</span>
          </a>
          <a
            href={hrefForRootTab('settings', search)}
            className={`tabbar-btn ${activeTab === 'settings' ? 'active' : ''}`}
            aria-current={activeTab === 'settings' ? 'page' : undefined}
            onClick={(event) => switchTab('settings', event)}
          >
            <TbSettings aria-hidden />
            <span className="tabbar-label">{ROOT_TAB_LABELS.settings}</span>
          </a>
        </nav>
      )}
    </div>
  );
}
