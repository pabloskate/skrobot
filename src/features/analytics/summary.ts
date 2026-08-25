export type AnalyticsRangeDays = 7 | 30;

export interface AnalyticsOverview {
  activePlayers: number;
  gamesStarted: number;
  gamesCompleted: number;
  completionRate: number;
  gamesPerPlayer: number;
  voiceFailures: number;
  gamesSaved: number;
  gamesResumed: number;
  resumeRate: number;
}

export interface AnalyticsDailyPoint {
  date: string;
  players: number;
  starts: number;
  completions: number;
}

export interface AnalyticsModeRow {
  mode: 'screen' | 'voice';
  starts: number;
  completions: number;
  completionRate: number;
  failures: number;
}

export interface AnalyticsRobotRow {
  robotId: string;
  starts: number;
  completions: number;
  playerWins: number;
  winRate: number;
  completionRate: number;
}

export interface AnalyticsFailureRow {
  reason: string;
  count: number;
}

export interface AnalyticsSummary {
  generatedAt: string;
  rangeDays: AnalyticsRangeDays;
  overview: AnalyticsOverview;
  daily: AnalyticsDailyPoint[];
  modes: AnalyticsModeRow[];
  robots: AnalyticsRobotRow[];
  voiceFailures: AnalyticsFailureRow[];
}

export function analyticsRangeDays(value: string | null): AnalyticsRangeDays {
  return value === '30' ? 30 : 7;
}

export function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}
