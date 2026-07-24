CREATE TABLE IF NOT EXISTS api_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  audio_input_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_created ON api_usage(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_user_model ON api_usage(user_id, model);

ALTER TABLE attempts ADD COLUMN model TEXT;
