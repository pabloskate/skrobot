CREATE TABLE analytics_events (
  event_id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  surface TEXT NOT NULL,
  game_id TEXT,
  robot_id TEXT,
  mode TEXT,
  game_format TEXT,
  game_variant TEXT,
  properties TEXT NOT NULL
);

CREATE INDEX idx_analytics_events_name_time ON analytics_events(name, occurred_at);
CREATE INDEX idx_analytics_events_installation_time ON analytics_events(installation_id, occurred_at);
CREATE INDEX idx_analytics_events_user_time ON analytics_events(user_id, occurred_at);
CREATE INDEX idx_analytics_events_game ON analytics_events(game_id);
