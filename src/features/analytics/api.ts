import type { AnalyticsEvent, AnalyticsEventInput, AnalyticsSurface } from './events';

const INSTALLATION_KEY = 'skrobot.analytics.installation.v1';
const QUEUE_KEY = 'skrobot.analytics.queue.v1';
const QUEUE_CAP = 100;
const BATCH_SIZE = 20;

let flushing = false;

function readQueue(): AnalyticsEvent[] {
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    return Array.isArray(value) ? (value as AnalyticsEvent[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(events: AnalyticsEvent[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(events.slice(-QUEUE_CAP)));
  } catch {
    // Analytics is best-effort when browser storage is unavailable.
  }
}

function installationId(): string {
  try {
    const existing = localStorage.getItem(INSTALLATION_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(INSTALLATION_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function trackAnalyticsEvent(input: AnalyticsEventInput, surface: AnalyticsSurface): void {
  if (typeof window === 'undefined') return;
  const event: AnalyticsEvent = {
    ...input,
    eventId: crypto.randomUUID(),
    installationId: installationId(),
    occurredAt: new Date().toISOString(),
    surface,
  };
  writeQueue([...readQueue(), event]);
  void flushAnalyticsEvents();
}

export async function flushAnalyticsEvents(): Promise<void> {
  if (flushing || typeof window === 'undefined' || !navigator.onLine) return;
  flushing = true;
  try {
    while (true) {
      const batch = readQueue().slice(0, BATCH_SIZE);
      if (batch.length === 0) return;
      let response: Response;
      try {
        response = await fetch('/api/analytics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ events: batch }),
        });
      } catch {
        return;
      }
      if (!response.ok && response.status < 400) return;
      if (!response.ok && response.status >= 500) return;

      const sent = new Set(batch.map((event) => event.eventId));
      writeQueue(readQueue().filter((event) => !sent.has(event.eventId)));
    }
  } finally {
    flushing = false;
  }
}

export function subscribeAnalyticsDelivery(): () => void {
  if (typeof window === 'undefined') return () => {};
  const flush = () => void flushAnalyticsEvents();
  window.addEventListener('online', flush);
  flush();
  return () => window.removeEventListener('online', flush);
}
