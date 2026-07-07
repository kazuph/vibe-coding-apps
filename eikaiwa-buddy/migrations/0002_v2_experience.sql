CREATE TABLE IF NOT EXISTS user_context (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  fact_key TEXT NOT NULL,
  fact_value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'interview',
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, fact_key)
);

CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  topic TEXT NOT NULL,
  audience TEXT,
  status TEXT NOT NULL DEFAULT 'interview',
  interview_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS script_sentences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id TEXT NOT NULL REFERENCES scripts(id),
  position INTEGER NOT NULL,
  ja_text TEXT NOT NULL,
  en_variants_json TEXT,
  en_selected TEXT,
  best_score INTEGER DEFAULT 0,
  practice_count INTEGER DEFAULT 0,
  UNIQUE(script_id, position)
);

ALTER TABLE sessions ADD COLUMN script_id TEXT REFERENCES scripts(id);
ALTER TABLE sessions ADD COLUMN phase TEXT;
ALTER TABLE sessions ADD COLUMN active_sentence_position INTEGER DEFAULT 1;
ALTER TABLE attempts ADD COLUMN script_sentence_id INTEGER REFERENCES script_sentences(id);

CREATE INDEX IF NOT EXISTS idx_scripts_user_updated ON scripts(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_script_sentences_script_position ON script_sentences(script_id, position);
CREATE INDEX IF NOT EXISTS idx_attempts_script_sentence ON attempts(script_sentence_id);
