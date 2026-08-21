/**
 * Game feature — the S.K.A.T.E. rules engine (pure reducer, the single source
 * of truth for game state) plus the on-screen play mode. Voice mode wraps this
 * same engine; never duplicate rules outside `engine.ts`. Mid-game save/resume
 * for the home continue card lives in `savedGame.ts`.
 */
export type { Phase, Stage, Side, GameFormat, GameVariant, GameState, GameAction } from './engine';
export {
  GAME_LETTERS,
  LETTERS,
  lettersForFormat,
  createInitialGameState,
  initialGameState,
  gameReducer,
  chooseRobotTrick,
  rollAttempt,
} from './engine';
export {
  getGameFormat,
  setGameFormat,
  subscribeGameFormat,
  useGameFormat,
  getGameVariant,
  setGameVariant,
  subscribeGameVariant,
  useGameVariant,
  getPlayerStance,
  setPlayerStance,
  subscribePlayerStance,
  usePlayerStance,
} from './gamePreferences';
export type { PlayerStance } from './gamePreferences';
export type { Rps, RpsOutcome } from './rps';
export { RPS_CHOICES, BEATS, robotThrow, rpsOutcome } from './rps';
export type {
  GameProgress,
  GameSessionSnapshot,
  SavedGame,
  SavedGameMode,
} from './savedGame';
export {
  getSavedGame,
  saveGame,
  clearSavedGame,
  isSaveWorthKeeping,
  subscribeSavedGame,
} from './savedGame';
export { default as GameScreen } from './GameScreen';
export { default as GamePreferencesSection } from './GamePreferencesSection';
export { default as TrickAnimation } from './TrickAnimation';
