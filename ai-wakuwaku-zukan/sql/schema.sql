DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Categories;
DROP TABLE IF EXISTS Images;

CREATE TABLE Users (
  id TEXT PRIMARY KEY, -- passphrase
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE Categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  is_default BOOLEAN DEFAULT 0
);

CREATE TABLE Images (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  image_url TEXT NOT NULL,
  category_id INTEGER,
  category_name TEXT, -- Denormalized for easier fetch
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES Users(id),
  FOREIGN KEY (category_id) REFERENCES Categories(id)
);

INSERT INTO Categories (name, icon, is_default) VALUES ('どうぶつ', '🐘', 1);
INSERT INTO Categories (name, icon, is_default) VALUES ('のりもの', '🚒', 1);
INSERT INTO Categories (name, icon, is_default) VALUES ('たべもの', '🍎', 1);
INSERT INTO Categories (name, icon, is_default) VALUES ('むし', '🐞', 1);
INSERT INTO Categories (name, icon, is_default) VALUES ('おはな', '🌻', 1);
