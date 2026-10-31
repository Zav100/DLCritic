const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = path.join(__dirname, '..', 'data.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    favorite_game_id TEXT,
    wishlist TEXT NOT NULL DEFAULT '[]',
    activity_dates TEXT NOT NULL DEFAULT '[]',
    is_admin INTEGER NOT NULL DEFAULT 0,
    avatar_url TEXT,
    bio TEXT,
    social_links TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (follower_id, followed_id)
  );
  CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id);

  CREATE TABLE IF NOT EXISTS game_lists (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    is_public INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_game_lists_user ON game_lists(user_id);

  CREATE TABLE IF NOT EXISTS game_list_items (
    list_id TEXT NOT NULL REFERENCES game_lists(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (list_id, game_id)
  );
  CREATE INDEX IF NOT EXISTS idx_game_list_items_list ON game_list_items(list_id);

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    genre TEXT NOT NULL,
    genres TEXT NOT NULL DEFAULT '[]',
    platforms TEXT NOT NULL DEFAULT '[]',
    added_by TEXT,
    created_at TEXT NOT NULL,
    cover_url TEXT,
    card_cover_url TEXT,
    description TEXT,
    developer TEXT,
    publisher TEXT,
    release_year INTEGER,
    game_mode TEXT,
    store_links TEXT NOT NULL DEFAULT '{}',
    hidden INTEGER NOT NULL DEFAULT 0,
    is_new_release INTEGER NOT NULL DEFAULT 0,
    new_release_date TEXT,
    builtin INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS date_events (
    id TEXT PRIMARY KEY,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    game_id TEXT,
    title_es TEXT NOT NULL,
    desc_es TEXT NOT NULL,
    title_en TEXT NOT NULL,
    desc_en TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS news_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    source TEXT NOT NULL,
    url TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#5B8DEF',
    initials TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER,
    text TEXT NOT NULL DEFAULT '',
    platforms TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL,
    UNIQUE(game_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS helpful_votes (
    review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (review_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS daily_progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    guesses TEXT NOT NULL DEFAULT '[]',
    solved INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    roulette_spins INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
  );

  CREATE TABLE IF NOT EXISTS game_covers (
    title_key TEXT PRIMARY KEY,
    image_url TEXT,
    fetched_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    game_id TEXT,
    game_ids TEXT NOT NULL DEFAULT '[]',
    banner_url TEXT,
    banner_game_id TEXT,
    photo_url TEXT,
    description TEXT,
    categories TEXT NOT NULL DEFAULT '[]',
    added_by TEXT,
    created_at TEXT NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_characters_game ON characters(game_id);

  CREATE TABLE IF NOT EXISTS character_reviews (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER,
    text TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE(character_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_character_reviews_character ON character_reviews(character_id);
  CREATE INDEX IF NOT EXISTS idx_character_reviews_user ON character_reviews(user_id);

  CREATE TABLE IF NOT EXISTS game_suggestions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    platforms TEXT NOT NULL DEFAULT '[]',
    genre TEXT,
    release_year INTEGER,
    note TEXT,
    submitted_by TEXT,
    status TEXT NOT NULL DEFAULT 'unread',
    created_at TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'game',
    related_game TEXT,
    categories TEXT NOT NULL DEFAULT '[]'
  );

  CREATE INDEX IF NOT EXISTS idx_reviews_game ON reviews(game_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
`);

// Lightweight migrations for databases created before these columns existed.
// SQLite has no "ADD COLUMN IF NOT EXISTS", so each is just tried and ignored if it already exists.
const migrations = [
  "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE games ADD COLUMN cover_url TEXT",
  "ALTER TABLE games ADD COLUMN description TEXT",
  "ALTER TABLE games ADD COLUMN developer TEXT",
  "ALTER TABLE games ADD COLUMN publisher TEXT",
  "ALTER TABLE games ADD COLUMN release_year INTEGER",
  "ALTER TABLE games ADD COLUMN game_mode TEXT",
  "ALTER TABLE games ADD COLUMN store_links TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE games ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE games ADD COLUMN is_new_release INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE games ADD COLUMN new_release_date TEXT",
  "ALTER TABLE games ADD COLUMN builtin INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE games ADD COLUMN genres TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE games ADD COLUMN card_cover_url TEXT",
  "ALTER TABLE users ADD COLUMN avatar_url TEXT",
  "ALTER TABLE users ADD COLUMN bio TEXT",
  "ALTER TABLE users ADD COLUMN social_links TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE users ADD COLUMN email TEXT",
  "ALTER TABLE characters ADD COLUMN game_ids TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE characters ADD COLUMN banner_url TEXT",
  "ALTER TABLE characters ADD COLUMN banner_game_id TEXT",
  "ALTER TABLE characters ADD COLUMN categories TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE game_suggestions ADD COLUMN kind TEXT NOT NULL DEFAULT 'game'",
  "ALTER TABLE game_suggestions ADD COLUMN related_game TEXT",
  "ALTER TABLE game_suggestions ADD COLUMN categories TEXT NOT NULL DEFAULT '[]'",
  // category (una sola) existió un día, siempre vacía, antes de pasar a categories (varias): se descarta sin migrar datos.
  "ALTER TABLE characters DROP COLUMN category",
  "ALTER TABLE game_suggestions DROP COLUMN category",
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (e) { /* column already exists */ }
}

// SQLite allows multiple NULL values through a UNIQUE index, so accounts
// created before email existed (or that never added one) don't collide.
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)'); } catch (e) { /* index already exists */ }

// Backfill the new multi-genre column from the old single-genre column, once.
const unmigratedGenres = db.prepare("SELECT id, genre FROM games WHERE genres = '[]'").all();
if (unmigratedGenres.length) {
  const setGenres = db.prepare('UPDATE games SET genres = ? WHERE id = ?');
  for (const row of unmigratedGenres) {
    setGenres.run(JSON.stringify([row.genre]), row.id);
  }
}

// Same idea for characters: game_id (one game) -> game_ids (a character can belong to several).
const unmigratedCharGames = db.prepare("SELECT id, game_id FROM characters WHERE game_ids = '[]' AND game_id IS NOT NULL").all();
if (unmigratedCharGames.length) {
  const setGameIds = db.prepare('UPDATE characters SET game_ids = ? WHERE id = ?');
  for (const row of unmigratedCharGames) {
    setGameIds.run(JSON.stringify([row.game_id]), row.id);
  }
}

module.exports = db;
