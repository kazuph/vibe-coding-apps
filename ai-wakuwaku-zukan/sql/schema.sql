DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Categories;
DROP TABLE IF EXISTS Images;

CREATE TABLE Users (
  id TEXT PRIMARY KEY, -- passphrase
  locale TEXT DEFAULT 'ja',
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE Categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT,
  icon TEXT NOT NULL,
  is_default BOOLEAN DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE Images (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  image_url TEXT NOT NULL,
  category_id INTEGER,
  category_name TEXT, -- Denormalized for easier fetch
  name_ja TEXT,
  name_en TEXT,
  name_hiragana TEXT,
  name_katakana TEXT,
  name_romaji TEXT,
  description_ja TEXT,
  description_en TEXT,
  is_favorite INTEGER DEFAULT 0,
  is_preset INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES Users(id),
  FOREIGN KEY (category_id) REFERENCES Categories(id)
);

INSERT INTO Categories (name, name_en, icon, is_default) VALUES ('どうぶつ', 'Animals', '🐘', 1);
INSERT INTO Categories (name, name_en, icon, is_default) VALUES ('のりもの', 'Vehicles', '🚒', 1);
INSERT INTO Categories (name, name_en, icon, is_default) VALUES ('たべもの', 'Food', '🍎', 1);
INSERT INTO Categories (name, name_en, icon, is_default) VALUES ('むし', 'Bugs', '🐞', 1);
INSERT INTO Categories (name, name_en, icon, is_default) VALUES ('おはな', 'Flowers', '🌻', 1);
INSERT INTO Categories (name, name_en, icon, is_default) VALUES ('しぜん', 'Nature', '🌸', 1);
INSERT INTO Categories (name, name_en, icon, is_default) VALUES ('うちゅう', 'Space', '🚀', 1);
INSERT INTO Categories (name, name_en, icon, is_default) VALUES ('がっこう', 'School', '🏫', 1);
INSERT INTO Categories (name, name_en, icon, is_default) VALUES ('その他', 'Others', '📦', 1);
