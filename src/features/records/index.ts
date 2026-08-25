/**
 * Records feature — player W/L records and the per-game log.
 * Currently localStorage-backed behind a versioned, reactive public API; this
 * is the first client-persistence candidate to move to D1.
 */
export type {
  Record_,
  GameLogEntry,
  TrickAttempt,
  TrickMark,
  ProvenTrick,
  TrickStat,
} from './records';
export {
  getRecords,
  recordCompletedMatch,
  getTrickMarks,
  setTrickMark,
  getProvenTricks,
  deriveProvenTricks,
  deriveTrickStats,
} from './records';
export { useRecordsSnapshot } from './useRecordsSnapshot';
