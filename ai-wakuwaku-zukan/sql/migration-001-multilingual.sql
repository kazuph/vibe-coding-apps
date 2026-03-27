-- Migration 001: Multi-language support + schema fixes
-- Date: 2026-03-26

-- Fix: Add is_favorite column (was used by API but missing from schema)
ALTER TABLE Images ADD COLUMN is_favorite INTEGER DEFAULT 0;

-- Add multilingual metadata columns to Images
ALTER TABLE Images ADD COLUMN name_ja TEXT;
ALTER TABLE Images ADD COLUMN name_en TEXT;
ALTER TABLE Images ADD COLUMN name_hiragana TEXT;
ALTER TABLE Images ADD COLUMN name_katakana TEXT;
ALTER TABLE Images ADD COLUMN name_romaji TEXT;
ALTER TABLE Images ADD COLUMN description_ja TEXT;
ALTER TABLE Images ADD COLUMN description_en TEXT;
ALTER TABLE Images ADD COLUMN is_preset INTEGER DEFAULT 0;

-- Add English name to Categories
ALTER TABLE Categories ADD COLUMN name_en TEXT;
ALTER TABLE Categories ADD COLUMN created_at INTEGER DEFAULT (strftime('%s', 'now'));

-- Add locale to Users
ALTER TABLE Users ADD COLUMN locale TEXT DEFAULT 'ja';

-- Update existing categories with English names
UPDATE Categories SET name_en = 'Animals' WHERE name = 'どうぶつ';
UPDATE Categories SET name_en = 'Vehicles' WHERE name = 'のりもの';
UPDATE Categories SET name_en = 'Food' WHERE name = 'たべもの';
UPDATE Categories SET name_en = 'Bugs' WHERE name = 'むし';
UPDATE Categories SET name_en = 'Flowers' WHERE name = 'おはな';

-- Add missing categories
INSERT OR IGNORE INTO Categories (name, name_en, icon, is_default) VALUES ('しぜん', 'Nature', '🌸', 1);
INSERT OR IGNORE INTO Categories (name, name_en, icon, is_default) VALUES ('うちゅう', 'Space', '🚀', 1);
INSERT OR IGNORE INTO Categories (name, name_en, icon, is_default) VALUES ('がっこう', 'School', '🏫', 1);
INSERT OR IGNORE INTO Categories (name, name_en, icon, is_default) VALUES ('その他', 'Others', '📦', 1);

-- Backfill: Copy prompt to name_ja for existing images
UPDATE Images SET name_ja = prompt WHERE name_ja IS NULL;
