# Product Analytics

Gameplay analytics are privacy-safe first-party events stored in D1. The browser
uses an anonymous installation ID and an offline queue; authenticated requests
also receive the current internal user ID on the server. Events never include
email, IP address, audio, captions, transcripts, trick names, or free-form text.

The owner dashboard is available at `/admin/analytics`. Its aggregate API
requires an authenticated account matching the server-side
`ANALYTICS_ADMIN_EMAIL` Worker variable. Other signed-in accounts receive no
analytics data.

## Event Contract

| Event | Meaning |
|---|---|
| `game_started` | A fresh game or rematch entered the game flow. |
| `game_saved` | A progressed game was saved before exit. |
| `game_resumed` | A saved game was continued. |
| `game_completed` | A game reached an authoritative winner. |
| `voice_connection_failed` | Voice could not start or permanently lost its connection. |

Every event has a deduplicated event ID, installation ID, occurrence time,
web/native surface, and game context. The strict server parser rejects unknown
event names and properties.

## Weekly Queries

Run these against production with
`npx wrangler d1 execute skrobot --remote --command "<SQL>"`.

Weekly players completing at least one game:

```sql
SELECT strftime('%Y-%W', occurred_at) AS week,
       count(DISTINCT coalesce(user_id, 'install:' || installation_id)) AS players
FROM analytics_events
WHERE name = 'game_completed'
GROUP BY week
ORDER BY week DESC;
```

Start-to-completion rate:

```sql
SELECT count(DISTINCT CASE WHEN name = 'game_started' THEN game_id END) AS started,
       count(DISTINCT CASE WHEN name = 'game_completed' THEN game_id END) AS completed,
       round(100.0 * count(DISTINCT CASE WHEN name = 'game_completed' THEN game_id END) /
             nullif(count(DISTINCT CASE WHEN name = 'game_started' THEN game_id END), 0), 1) AS completion_pct
FROM analytics_events
WHERE occurred_at >= datetime('now', '-7 days');
```

Robot balance over completed games:

```sql
SELECT robot_id,
       count(*) AS games,
       round(100.0 * avg(json_extract(properties, '$.won')), 1) AS player_win_pct
FROM analytics_events
WHERE name = 'game_completed'
GROUP BY robot_id
ORDER BY games DESC;
```

Mode completion and voice reliability:

```sql
SELECT mode,
       count(DISTINCT CASE WHEN name = 'game_started' THEN game_id END) AS starts,
       count(DISTINCT CASE WHEN name = 'game_completed' THEN game_id END) AS completions,
       count(CASE WHEN name = 'voice_connection_failed' THEN 1 END) AS voice_failures
FROM analytics_events
WHERE occurred_at >= datetime('now', '-7 days')
GROUP BY mode;
```

Save-to-resume rate:

```sql
SELECT count(DISTINCT CASE WHEN name = 'game_saved' THEN game_id END) AS saved,
       count(DISTINCT CASE WHEN name = 'game_resumed' THEN game_id END) AS resumed,
       round(100.0 * count(DISTINCT CASE WHEN name = 'game_resumed' THEN game_id END) /
             nullif(count(DISTINCT CASE WHEN name = 'game_saved' THEN game_id END), 0), 1) AS resume_pct
FROM analytics_events;
```

Apply migrations before deployment with `npm run db:migrate:remote`. Do not run
that command implicitly as part of a deploy; review pending migrations first.
