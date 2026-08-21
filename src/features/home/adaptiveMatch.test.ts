import { describe, expect, it } from 'vitest';
import type { GameLogEntry, TrickAttempt } from '@/features/records';
import { RIVAL_ID, SKATE_SCORE_UNLOCK_GAMES } from '@/features/skater';
import { buildAdaptiveMatchState } from './adaptiveMatch';

function game(index: number, attempts: TrickAttempt[]): GameLogEntry {
  return {
    date: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    robotId: 'shifty',
    mode: 'screen',
    won: true,
    playerLetters: 1,
    robotLetters: 5,
    tricksLanded: attempts.filter((attempt) => attempt.landed).map((attempt) => attempt.trick),
    trickAttempts: attempts,
  };
}

const CALIBRATION_ATTEMPTS: TrickAttempt[] = [
  { trick: 'Ollie', landed: true },
  { trick: 'Pop Shuvit', landed: true },
  { trick: 'Frontside 180', landed: true },
  { trick: 'Kickflip', landed: false },
];

function calibratedLog(): GameLogEntry[] {
  return Array.from({ length: SKATE_SCORE_UNLOCK_GAMES }, (_, index) =>
    game(index, CALIBRATION_ATTEMPTS),
  );
}

describe('buildAdaptiveMatchState', () => {
  it('reports the remaining calibration games before the unlock threshold', () => {
    const log = calibratedLog().slice(0, SKATE_SCORE_UNLOCK_GAMES - 1);

    expect(buildAdaptiveMatchState(log, {})).toEqual({
      status: 'needs_games',
      gamesPlayed: SKATE_SCORE_UNLOCK_GAMES - 1,
      gamesRemaining: 1,
    });
  });

  it('distinguishes insufficient trick evidence after enough completed games', () => {
    const log = Array.from({ length: SKATE_SCORE_UNLOCK_GAMES }, (_, index) => game(index, []));

    expect(buildAdaptiveMatchState(log, {})).toEqual({
      status: 'needs_evidence',
      gamesPlayed: SKATE_SCORE_UNLOCK_GAMES,
    });
  });

  it('returns the score, built rival, adaptive delta, and rival record when ready', () => {
    const record = { w: 2, l: 1 };
    const state = buildAdaptiveMatchState(calibratedLog(), { [RIVAL_ID]: record });

    expect(state.status).toBe('ready');
    if (state.status !== 'ready') throw new Error('expected the adaptive match to be ready');

    expect(state.score.gamesPlayed).toBe(SKATE_SCORE_UNLOCK_GAMES);
    expect(state.rival.id).toBe(RIVAL_ID);
    expect(state.rival.skill).toBeGreaterThan(state.score.skill);
    expect(state.delta).toBe(0.75);
    expect(state.record).toBe(record);
  });
});
