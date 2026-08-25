/**
 * Game feature — the S.K.A.T.E. rules engine (pure reducer, the single source
 * of truth for game state) plus the on-screen play mode. Voice mode wraps this
 * same engine; never duplicate rules outside `engine.ts`. Mid-game save/resume
 * for the home continue card lives in `savedGame.ts`.
 */
export type { GameFormat, GameState, GameAction } from './engine';
export {
  lettersForFormat,
  createInitialGameState,
  gameReducer,
  chooseRobotTrick,
  rollAttempt,
} from './engine';
export {
  useGameFormat,
  useGameVariant,
} from './gamePreferences';
export type { Rps } from './rps';
export { robotThrow, rpsOutcome } from './rps';
export type {
  GameProgress,
  GameSessionIdentity,
  GameSessionSnapshot,
  SavedGame,
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
