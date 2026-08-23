/**
 * Analytics feature - privacy-safe product events, offline delivery, and the
 * browser contract for the D1-backed ingestion endpoint.
 */
export type {
  AnalyticsEventInput,
  AnalyticsGameContext,
  AnalyticsSurface,
  VoiceFailureReason,
} from './events';
export { parseAnalyticsBatch } from './events';
export { flushAnalyticsEvents, subscribeAnalyticsDelivery } from './api';
export type { AnalyticsGameSession, TrackedGame } from './gameTracking';
export { gameAnalytics } from './gameTracking';
