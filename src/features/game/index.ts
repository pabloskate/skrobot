/**
 * Game feature — the S.K.A.T.E. rules engine (pure reducer, the single source
 * of truth for game state) plus the on-screen play mode. Voice mode wraps this
 * same engine; never duplicate rules outside `engine.ts`.
 */
export type { Phase, Stage, Side, GameState, GameAction } from './engine';
export { LETTERS, initialGameState, gameReducer, chooseRobotTrick, rollAttempt } from './engine';
export type { Rps, RpsOutcome } from './rps';
export { RPS_CHOICES, BEATS, robotThrow, rpsOutcome } from './rps';
export { default as GameScreen } from './GameScreen';
export { default as TrickAnimation } from './TrickAnimation';
