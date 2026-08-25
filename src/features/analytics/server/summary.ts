import { getDb } from '@/platform/server/db';
import type {
  AnalyticsDailyPoint,
  AnalyticsFailureRow,
  AnalyticsModeRow,
  AnalyticsOverview,
  AnalyticsRangeDays,
  AnalyticsRobotRow,
  AnalyticsSummary,
} from '../summary';
import { percentage } from '../summary';

interface OverviewRow {
  active_players: number;
  games_started: number;
  games_completed: number;
  voice_failures: number;
  games_saved: number;
  games_resumed: number;
}

interface DailyRow {
  date: string;
  players: number;
  starts: number;
  completions: number;
}

interface ModeRow {
  mode: 'screen' | 'voice';
  starts: number;
  completions: number;
  failures: number;
}

interface RobotRow {
  robot_id: string;
  starts: number;
  completions: number;
  player_wins: number;
}

interface FailureRow {
  reason: string;
  count: number;
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fillDaily(rows: DailyRow[], days: AnalyticsRangeDays): AnalyticsDailyPoint[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - index - 1));
    const key = dateKey(date);
    const row = byDate.get(key);
    return {
      date: key,
      players: number(row?.players),
      starts: number(row?.starts),
      completions: number(row?.completions),
    };
  });
}

export async function getAnalyticsSummary(days: AnalyticsRangeDays): Promise<AnalyticsSummary> {
  const db = await getDb();
  const window = `-${days} days`;
  const [overviewResult, dailyResult, modesResult, robotsResult, failuresResult] = await db.batch([
    db
      .prepare(
        `SELECT
           count(DISTINCT CASE WHEN name = 'game_completed'
             THEN coalesce(user_id, 'install:' || installation_id) END) AS active_players,
           count(DISTINCT CASE WHEN name = 'game_started' THEN game_id END) AS games_started,
           count(DISTINCT CASE WHEN name = 'game_completed' THEN game_id END) AS games_completed,
           count(CASE WHEN name = 'voice_connection_failed' THEN 1 END) AS voice_failures,
           count(DISTINCT CASE WHEN name = 'game_saved' THEN game_id END) AS games_saved,
           count(DISTINCT CASE WHEN name = 'game_resumed' THEN game_id END) AS games_resumed
         FROM analytics_events
         WHERE datetime(occurred_at) >= datetime('now', ?)`,
      )
      .bind(window),
    db
      .prepare(
        `SELECT date(occurred_at) AS date,
           count(DISTINCT CASE WHEN name = 'game_completed'
             THEN coalesce(user_id, 'install:' || installation_id) END) AS players,
           count(DISTINCT CASE WHEN name = 'game_started' THEN game_id END) AS starts,
           count(DISTINCT CASE WHEN name = 'game_completed' THEN game_id END) AS completions
         FROM analytics_events
         WHERE datetime(occurred_at) >= datetime('now', ?)
         GROUP BY date(occurred_at)
         ORDER BY date(occurred_at)`,
      )
      .bind(window),
    db
      .prepare(
        `SELECT mode,
           count(DISTINCT CASE WHEN name = 'game_started' THEN game_id END) AS starts,
           count(DISTINCT CASE WHEN name = 'game_completed' THEN game_id END) AS completions,
           count(CASE WHEN name = 'voice_connection_failed' THEN 1 END) AS failures
         FROM analytics_events
         WHERE datetime(occurred_at) >= datetime('now', ?) AND mode IN ('screen', 'voice')
         GROUP BY mode`,
      )
      .bind(window),
    db
      .prepare(
        `SELECT robot_id,
           count(DISTINCT CASE WHEN name = 'game_started' THEN game_id END) AS starts,
           count(DISTINCT CASE WHEN name = 'game_completed' THEN game_id END) AS completions,
           count(DISTINCT CASE WHEN name = 'game_completed'
             AND json_extract(properties, '$.won') = 1 THEN game_id END) AS player_wins
         FROM analytics_events
         WHERE datetime(occurred_at) >= datetime('now', ?) AND robot_id IS NOT NULL
         GROUP BY robot_id
         ORDER BY completions DESC, starts DESC, robot_id`,
      )
      .bind(window),
    db
      .prepare(
        `SELECT json_extract(properties, '$.reason') AS reason, count(*) AS count
         FROM analytics_events
         WHERE name = 'voice_connection_failed' AND datetime(occurred_at) >= datetime('now', ?)
         GROUP BY reason
         ORDER BY count DESC`,
      )
      .bind(window),
  ]);

  const rawOverview = (overviewResult.results?.[0] ?? {}) as unknown as Partial<OverviewRow>;
  const overviewBase = {
    activePlayers: number(rawOverview.active_players),
    gamesStarted: number(rawOverview.games_started),
    gamesCompleted: number(rawOverview.games_completed),
    voiceFailures: number(rawOverview.voice_failures),
    gamesSaved: number(rawOverview.games_saved),
    gamesResumed: number(rawOverview.games_resumed),
  };
  const overview: AnalyticsOverview = {
    ...overviewBase,
    completionRate: percentage(overviewBase.gamesCompleted, overviewBase.gamesStarted),
    gamesPerPlayer:
      overviewBase.activePlayers === 0
        ? 0
        : Math.round((overviewBase.gamesCompleted / overviewBase.activePlayers) * 10) / 10,
    resumeRate: percentage(overviewBase.gamesResumed, overviewBase.gamesSaved),
  };

  const modes: AnalyticsModeRow[] = ((modesResult.results ?? []) as unknown as ModeRow[]).map((row) => ({
    mode: row.mode,
    starts: number(row.starts),
    completions: number(row.completions),
    completionRate: percentage(number(row.completions), number(row.starts)),
    failures: number(row.failures),
  }));
  const robots: AnalyticsRobotRow[] = ((robotsResult.results ?? []) as unknown as RobotRow[]).map((row) => ({
    robotId: row.robot_id,
    starts: number(row.starts),
    completions: number(row.completions),
    playerWins: number(row.player_wins),
    winRate: percentage(number(row.player_wins), number(row.completions)),
    completionRate: percentage(number(row.completions), number(row.starts)),
  }));
  const voiceFailures: AnalyticsFailureRow[] = ((failuresResult.results ?? []) as unknown as FailureRow[]).map(
    (row) => ({ reason: row.reason, count: number(row.count) }),
  );

  return {
    generatedAt: new Date().toISOString(),
    rangeDays: days,
    overview,
    daily: fillDaily((dailyResult.results ?? []) as unknown as DailyRow[], days),
    modes,
    robots,
    voiceFailures,
  };
}
