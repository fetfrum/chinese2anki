-- Initial database schema for Chinese2Anki

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    display_name TEXT,
    picture TEXT,
    tokens_remaining INTEGER DEFAULT 30,
    last_reset_date TEXT,
    banned_until TEXT,
    is_admin INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dictionary (
    hanzi TEXT,
    pinyin TEXT,
    meaning TEXT,
    hsk TEXT,
    audio_tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (hanzi, pinyin)
);

CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    uuid TEXT,
    date TEXT,
    time TEXT,
    deck_name TEXT,
    cards_generated INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    message TEXT,
    user_id INTEGER,
    session_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
