export type AnalyticsSurface = 'web' | 'native';
export type AnalyticsGameMode = 'screen' | 'voice';
export type AnalyticsGameFormat = 'skate' | 'sk8';
export type AnalyticsGameVariant = 'classic' | 'defense';
export type VoiceFailureReason =
  | 'offline'
  | 'auth_required'
  | 'quota_exceeded'
  | 'start_failed'
  | 'connection_lost';

export interface AnalyticsGameContext {
  gameId: string;
  robotId: string;
  mode: AnalyticsGameMode;
  gameFormat: AnalyticsGameFormat;
  gameVariant: AnalyticsGameVariant;
}

export type AnalyticsEventInput =
  | { name: 'game_started'; properties: AnalyticsGameContext }
  | { name: 'game_saved'; properties: AnalyticsGameContext & { attemptCount: number } }
  | { name: 'game_resumed'; properties: AnalyticsGameContext & { savedForMs: number } }
  | {
      name: 'game_completed';
      properties: AnalyticsGameContext & {
        won: boolean;
        playerLetters: number;
        robotLetters: number;
        attemptCount: number;
        durationMs: number;
      };
    }
  | { name: 'voice_connection_failed'; properties: AnalyticsGameContext & { reason: VoiceFailureReason } };

export interface AnalyticsEvent {
  eventId: string;
  installationId: string;
  occurredAt: string;
  surface: AnalyticsSurface;
  name: AnalyticsEventInput['name'];
  properties: AnalyticsEventInput['properties'];
}

const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const ROBOT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const EVENT_NAMES = new Set<AnalyticsEvent['name']>([
  'game_started',
  'game_saved',
  'game_resumed',
  'game_completed',
  'voice_connection_failed',
]);
const VOICE_FAILURE_REASONS = new Set<VoiceFailureReason>([
  'offline',
  'auth_required',
  'quota_exceeded',
  'start_failed',
  'connection_lost',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasGameContext(value: Record<string, unknown>): boolean {
  return (
    typeof value.gameId === 'string' &&
    ID_PATTERN.test(value.gameId) &&
    typeof value.robotId === 'string' &&
    ROBOT_ID_PATTERN.test(value.robotId) &&
    (value.mode === 'screen' || value.mode === 'voice') &&
    (value.gameFormat === 'skate' || value.gameFormat === 'sk8') &&
    (value.gameVariant === 'classic' || value.gameVariant === 'defense')
  );
}

function isValidProperties(name: AnalyticsEvent['name'], value: unknown): value is AnalyticsEvent['properties'] {
  if (!isRecord(value) || !hasGameContext(value)) return false;
  const contextKeys = ['gameId', 'robotId', 'mode', 'gameFormat', 'gameVariant'] as const;
  if (name === 'game_started') return hasOnlyKeys(value, contextKeys);
  if (name === 'game_saved') {
    return hasOnlyKeys(value, [...contextKeys, 'attemptCount']) && isNonNegativeInteger(value.attemptCount);
  }
  if (name === 'game_resumed') {
    return hasOnlyKeys(value, [...contextKeys, 'savedForMs']) && isNonNegativeInteger(value.savedForMs);
  }
  if (name === 'voice_connection_failed') {
    return (
      hasOnlyKeys(value, [...contextKeys, 'reason']) &&
      typeof value.reason === 'string' &&
      VOICE_FAILURE_REASONS.has(value.reason as VoiceFailureReason)
    );
  }
  return (
    hasOnlyKeys(value, [
      ...contextKeys,
      'won',
      'playerLetters',
      'robotLetters',
      'attemptCount',
      'durationMs',
    ]) &&
    typeof value.won === 'boolean' &&
    isNonNegativeInteger(value.playerLetters) &&
    isNonNegativeInteger(value.robotLetters) &&
    isNonNegativeInteger(value.attemptCount) &&
    isNonNegativeInteger(value.durationMs)
  );
}

function parseEvent(value: unknown): AnalyticsEvent | null {
  if (!isRecord(value)) return null;
  if (typeof value.eventId !== 'string' || !ID_PATTERN.test(value.eventId)) return null;
  if (typeof value.installationId !== 'string' || !ID_PATTERN.test(value.installationId)) return null;
  if (typeof value.occurredAt !== 'string' || !Number.isFinite(Date.parse(value.occurredAt))) return null;
  if (value.surface !== 'web' && value.surface !== 'native') return null;
  if (typeof value.name !== 'string' || !EVENT_NAMES.has(value.name as AnalyticsEvent['name'])) return null;
  const name = value.name as AnalyticsEvent['name'];
  if (!isValidProperties(name, value.properties)) return null;
  return value as unknown as AnalyticsEvent;
}

export function parseAnalyticsBatch(value: unknown): AnalyticsEvent[] | null {
  if (!isRecord(value) || !Array.isArray(value.events) || value.events.length < 1 || value.events.length > 20) {
    return null;
  }
  const events: AnalyticsEvent[] = [];
  for (const valueEvent of value.events) {
    const event = parseEvent(valueEvent);
    if (!event) return null;
    events.push(event);
  }
  return events;
}
