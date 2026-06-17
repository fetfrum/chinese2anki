-- Add regen_rate column to users table for personalized daily recovery speed
ALTER TABLE users ADD COLUMN regen_rate INTEGER DEFAULT NULL;
