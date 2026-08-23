import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { trackAnalyticsEvent } = vi.hoisted(() => ({ trackAnalyticsEvent: vi.fn() }));

vi.mock('./api', () => ({ trackAnalyticsEvent }));

import { gameAnalytics, type TrackedGame } from './gameTracking';

const game: TrackedGame = {
  session: { id: 'game-id-123', startedAt: '2026-08-23T12:00:00.000Z' },
  robotId: 'shifty',
  mode: 'screen',
  gameFormat: 'skate',
  gameVariant: 'classic',
};

const snapshot = {
  state: {
    winner: 'player' as const,
    letters: { player: 2, robot: 5 },
    gameFormat: 'skate' as const,
    gameVariant: 'classic' as const,
  },
  progress: { trickAttempts: [{}, {}, {}] },
};

beforeEach(() => {
  trackAnalyticsEvent.mockClear();
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-23T12:03:00.000Z'));
});

afterEach(() => vi.restoreAllMocks());

describe('gameAnalytics', () => {
  it('owns completion payload derivation', () => {
    gameAnalytics.completed(game, snapshot, 'web');

    expect(trackAnalyticsEvent).toHaveBeenCalledWith(
      {
        name: 'game_completed',
        properties: {
          gameId: 'game-id-123',
          robotId: 'shifty',
          mode: 'screen',
          gameFormat: 'skate',
          gameVariant: 'classic',
          won: true,
          playerLetters: 2,
          robotLetters: 5,
          attemptCount: 3,
          durationMs: 180_000,
        },
      },
      'web',
    );
  });

  it('owns save, resume, and voice-failure event semantics', () => {
    gameAnalytics.saved(game, snapshot, 'native');
    gameAnalytics.resumed(game, '2026-08-23T11:59:00.000Z', 'native');
    gameAnalytics.voiceConnectionFailed(game, 'connection_lost', 'native');

    expect(trackAnalyticsEvent.mock.calls.map(([event]) => event)).toEqual([
      expect.objectContaining({ name: 'game_saved', properties: expect.objectContaining({ attemptCount: 3 }) }),
      expect.objectContaining({ name: 'game_resumed', properties: expect.objectContaining({ savedForMs: 240_000 }) }),
      expect.objectContaining({
        name: 'voice_connection_failed',
        properties: expect.objectContaining({ reason: 'connection_lost' }),
      }),
    ]);
  });
});
