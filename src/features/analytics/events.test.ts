import { describe, expect, it } from 'vitest';
import { parseAnalyticsBatch } from './events';

const event = {
  eventId: 'event-id-123',
  installationId: 'install-id-123',
  occurredAt: '2026-08-23T12:00:00.000Z',
  surface: 'web',
  name: 'game_completed',
  properties: {
    gameId: 'game-id-123',
    robotId: 'shifty',
    mode: 'screen',
    gameFormat: 'skate',
    gameVariant: 'classic',
    won: true,
    playerLetters: 3,
    robotLetters: 5,
    attemptCount: 12,
    durationMs: 180_000,
  },
};

describe('parseAnalyticsBatch', () => {
  it('accepts the strict product event contract', () => {
    expect(parseAnalyticsBatch({ events: [event] })).toEqual([event]);
  });

  it('rejects unknown names and oversized batches', () => {
    expect(parseAnalyticsBatch({ events: [{ ...event, name: 'caption_recorded' }] })).toBeNull();
    expect(parseAnalyticsBatch({ events: Array.from({ length: 21 }, () => event) })).toBeNull();
  });

  it('rejects free-form extra properties', () => {
    expect(
      parseAnalyticsBatch({
        events: [{ ...event, properties: { ...event.properties, transcript: 'private words' } }],
      }),
    ).toBeNull();
  });
});
