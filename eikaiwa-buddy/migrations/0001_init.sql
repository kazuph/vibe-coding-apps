CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  level INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  topic TEXT,
  state TEXT NOT NULL DEFAULT 'topic',
  current_phrase_json TEXT,
  chat_history_json TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  phrase_en TEXT NOT NULL,
  verbatim TEXT,
  words_json TEXT,
  pronunciation_score INTEGER,
  fluency_score INTEGER,
  next_step TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS level_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  from_level INTEGER,
  to_level INTEGER,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
