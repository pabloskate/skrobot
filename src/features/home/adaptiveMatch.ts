import type { GameLogEntry, Record_ } from '@/features/records';
import type { Robot } from '@/features/robots';
import {
  buildRivalRobot,
  computeSkateScore,
  rivalDelta,
  RIVAL_ID,
  SKATE_SCORE_UNLOCK_GAMES,
  skateScoreUnlocked,
} from '@/features/skater';
import type { SkateScore } from '@/features/skater';

/** Home-facing state for the adaptive-match entry point. */
export type AdaptiveMatchState =
  | { status: 'needs_games'; gamesPlayed: number; gamesRemaining: number }
  | { status: 'needs_evidence'; gamesPlayed: number }
  | {
      status: 'ready';
      score: SkateScore;
      rival: Robot;
      delta: number;
      record: Record_ | undefined;
    };

/**
 * Distinguishes time spent calibrating from a completed calibration that still
 * lacks enough attributable trick evidence to produce a score and rival.
 */
export function buildAdaptiveMatchState(
  log: GameLogEntry[],
  records: Record<string, Record_>,
): AdaptiveMatchState {
  if (!skateScoreUnlocked(log)) {
    return {
      status: 'needs_games',
      gamesPlayed: log.length,
      gamesRemaining: Math.max(0, SKATE_SCORE_UNLOCK_GAMES - log.length),
    };
  }

  const score = computeSkateScore(log);
  if (!score) return { status: 'needs_evidence', gamesPlayed: log.length };

  const rival = buildRivalRobot(log, records);
  if (!rival) return { status: 'needs_evidence', gamesPlayed: log.length };

  const record = records[RIVAL_ID];
  return {
    status: 'ready',
    score,
    rival,
    delta: rivalDelta(record),
    record,
  };
}
