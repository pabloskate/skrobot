'use client';

import { useEffect, useState } from 'react';
import { TbArrowLeft, TbBolt, TbChartBar, TbRefresh, TbSkateboard } from 'react-icons/tb';
import { AnalyticsSummaryError, fetchAnalyticsSummary } from './api';
import type { AnalyticsRangeDays, AnalyticsSummary } from './summary';

function formatRobot(id: string): string {
  if (id === 'rival') return 'Nemesis';
  return id.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDay(date: string, days: AnalyticsRangeDays): string {
  return new Intl.DateTimeFormat('en', {
    month: days === 7 ? 'short' : undefined,
    day: days === 7 ? 'numeric' : undefined,
    weekday: days === 7 ? 'short' : undefined,
  }).format(new Date(`${date}T12:00:00Z`));
}

function metric(value: number, suffix = ''): string {
  return `${value.toLocaleString()}${suffix}`;
}

function LoadingDashboard() {
  return (
    <main className="analytics-loading" role="status">
      <div>
        <span />
        <p>Pulling the latest lines...</p>
      </div>
    </main>
  );
}

function AccessState({ error }: { error: AnalyticsSummaryError | Error }) {
  const signedOut = error instanceof AnalyticsSummaryError && error.status === 401;
  const forbidden = error instanceof AnalyticsSummaryError && error.status === 403;
  return (
    <main className="analytics-access">
      <div className="analytics-access-card">
        <span className="analytics-kicker">Private session</span>
        <h1>{signedOut ? 'Sign in first' : forbidden ? 'Owner access only' : 'Dashboard unavailable'}</h1>
        <p>
          {signedOut
            ? 'Sign in with the owner account in Skate Robot, then come back to this page.'
            : forbidden
              ? 'This account is signed in, but it is not authorized to view product analytics.'
              : 'The analytics summary could not be loaded. Try again in a moment.'}
        </p>
        <a className="analytics-primary-link" href={signedOut ? '/?tab=settings' : '/admin/analytics'}>
          {signedOut ? 'Go to sign in' : 'Try again'}
        </a>
        <a className="analytics-back-link" href="/">
          <TbArrowLeft aria-hidden /> Back to Skate Robot
        </a>
      </div>
    </main>
  );
}

export default function AnalyticsDashboard() {
  const [days, setDays] = useState<AnalyticsRangeDays>(7);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchAnalyticsSummary(days, controller.signal)
      .then(setSummary)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason : new Error('summary_unavailable'));
      });
    return () => controller.abort();
  }, [days, refresh]);

  if (error) return <AccessState error={error} />;
  if (!summary) return <LoadingDashboard />;

  const { overview } = summary;
  const maxDaily = Math.max(1, ...summary.daily.flatMap((point) => [point.starts, point.completions]));
  const screenMode = summary.modes.find((row) => row.mode === 'screen');
  const voiceMode = summary.modes.find((row) => row.mode === 'voice');

  return (
    <main className="analytics-dashboard">
      <header className="analytics-header">
        <div>
          <a className="analytics-brand" href="/">
            <TbSkateboard aria-hidden /> Skate Robot
          </a>
          <span className="analytics-kicker">Owner dashboard</span>
          <h1>How people are skating.</h1>
          <p>Starts, finishes, balance and reliability. No transcripts. No personal profiles.</p>
        </div>
        <div className="analytics-header-actions">
          <div className="analytics-range" aria-label="Analytics date range">
            {([7, 30] as const).map((range) => (
              <button key={range} className={days === range ? 'active' : ''} onClick={() => setDays(range)}>
                {range} days
              </button>
            ))}
          </div>
          <button className="analytics-refresh" onClick={() => setRefresh((value) => value + 1)} aria-label="Refresh data">
            <TbRefresh aria-hidden />
          </button>
        </div>
      </header>

      <section className="analytics-kpis" aria-label="Key metrics">
        <article className="analytics-kpi analytics-kpi--lead">
          <span>Active players</span><strong>{metric(overview.activePlayers)}</strong><small>completed a game</small>
        </article>
        <article className="analytics-kpi">
          <span>Games completed</span><strong>{metric(overview.gamesCompleted)}</strong><small>{metric(overview.gamesPerPlayer)} per player</small>
        </article>
        <article className="analytics-kpi">
          <span>Completion rate</span><strong>{metric(overview.completionRate, '%')}</strong><small>{metric(overview.gamesStarted)} starts</small>
        </article>
        <article className="analytics-kpi">
          <span>Save recovery</span><strong>{metric(overview.resumeRate, '%')}</strong><small>{metric(overview.gamesResumed)} of {metric(overview.gamesSaved)} resumed</small>
        </article>
        <article className="analytics-kpi">
          <span>Voice failures</span><strong>{metric(overview.voiceFailures)}</strong><small>terminal connection errors</small>
        </article>
      </section>

      <section className="analytics-panel analytics-activity">
        <div className="analytics-panel-heading">
          <div><span className="analytics-kicker">Daily pulse</span><h2>Games started vs finished</h2></div>
          <div className="analytics-legend"><span className="starts" /> Starts <span className="finishes" /> Finishes</div>
        </div>
        <div className={`analytics-chart analytics-chart--${days}`}>
          {summary.daily.map((point, index) => (
            <div className="analytics-chart-day" key={point.date} title={`${point.date}: ${point.starts} starts, ${point.completions} finishes`}>
              <div className="analytics-bars">
                <span className="starts" style={{ height: `${(point.starts / maxDaily) * 100}%` }} />
                <span className="finishes" style={{ height: `${(point.completions / maxDaily) * 100}%` }} />
              </div>
              {(days === 7 || index % 5 === 0 || index === summary.daily.length - 1) && <small>{formatDay(point.date, days)}</small>}
            </div>
          ))}
        </div>
        {overview.gamesStarted === 0 && <p className="analytics-empty">No game activity in this window yet.</p>}
      </section>

      <div className="analytics-grid">
        <section className="analytics-panel">
          <div className="analytics-panel-heading">
            <div><span className="analytics-kicker">Format health</span><h2>Screen and voice</h2></div><TbBolt aria-hidden />
          </div>
          <div className="analytics-mode-list">
            {[{ label: 'On-screen', row: screenMode }, { label: 'Voice', row: voiceMode }].map(({ label, row }) => (
              <article key={label}>
                <div><strong>{label}</strong><span>{row?.starts ?? 0} starts</span></div>
                <b>{row?.completionRate ?? 0}%</b>
                <div className="analytics-progress"><span style={{ width: `${row?.completionRate ?? 0}%` }} /></div>
                {label === 'Voice' && <small>{row?.failures ?? 0} connection failures</small>}
              </article>
            ))}
          </div>
          {summary.voiceFailures.length > 0 && (
            <div className="analytics-failures">
              {summary.voiceFailures.map((failure) => <span key={failure.reason}>{failure.reason.replaceAll('_', ' ')} <b>{failure.count}</b></span>)}
            </div>
          )}
        </section>

        <section className="analytics-panel analytics-robots">
          <div className="analytics-panel-heading">
            <div><span className="analytics-kicker">Opponent check</span><h2>Robot balance</h2></div><TbChartBar aria-hidden />
          </div>
          {summary.robots.length === 0 ? (
            <p className="analytics-empty">Completed games will reveal opponent balance here.</p>
          ) : (
            <div className="analytics-table-wrap">
              <table>
                <thead><tr><th>Robot</th><th>Games</th><th>Finish</th><th>Player wins</th></tr></thead>
                <tbody>
                  {summary.robots.map((robot) => (
                    <tr key={robot.robotId}>
                      <th>{formatRobot(robot.robotId)}</th><td>{robot.completions}</td><td>{robot.completionRate}%</td>
                      <td><span className={robot.winRate > 65 || robot.winRate < 35 ? 'analytics-rate-alert' : ''}>{robot.winRate}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <footer className="analytics-footer">
        <span>Updated {new Date(summary.generatedAt).toLocaleString()}</span>
        <span>Anonymous installation analytics · UTC dates</span>
      </footer>
    </main>
  );
}
