/**
 * Analytics feature - privacy-safe product events, offline delivery, and the
 * browser contract for the D1-backed ingestion endpoint.
 */
export { parseAnalyticsBatch } from './events';
export { analyticsRangeDays } from './summary';
export { subscribeAnalyticsDelivery } from './api';
export type { TrackedGame } from './gameTracking';
export { gameAnalytics } from './gameTracking';
export { default as AnalyticsDashboard } from './AnalyticsDashboard';
