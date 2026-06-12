/**
 * Records feature — player W/L records and the per-game log.
 * Currently localStorage-backed; this is the first candidate to move to D1
 * when the backend lands (see CLAUDE.md "Backend roadmap").
 */
export type { Record_, GameLogEntry } from './records';
export { getRecords, recordResult, getGameLog, appendGameLog } from './records';
