-- Create settings table and insert default token configurations
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('max_tokens', '300');
INSERT OR IGNORE INTO settings (key, value) VALUES ('regen_per_day', '10');
