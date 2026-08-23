import { getDb } from '@/platform/server/db';
import type { AnalyticsEvent } from '../events';

export async function ingestAnalyticsEvents(events: AnalyticsEvent[], userId: string | null): Promise<void> {
  const db = await getDb();
  const receivedAt = new Date().toISOString();
  await db.batch(
    events.map((event) => {
      const properties = event.properties;
      return db
        .prepare(
          `INSERT OR IGNORE INTO analytics_events
            (event_id, installation_id, user_id, name, occurred_at, received_at, surface,
             game_id, robot_id, mode, game_format, game_variant, properties)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          event.eventId,
          event.installationId,
          userId,
          event.name,
          event.occurredAt,
          receivedAt,
          event.surface,
          properties.gameId,
          properties.robotId,
          properties.mode,
          properties.gameFormat,
          properties.gameVariant,
          JSON.stringify(properties),
        );
    }),
  );
}
