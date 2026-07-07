ALTER TABLE users ADD COLUMN active_session_id TEXT REFERENCES sessions(id);

CREATE INDEX IF NOT EXISTS idx_sessions_user_updated ON sessions(user_id, updated_at);
