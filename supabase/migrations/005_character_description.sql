-- Issue 46: auto-generated Character description (engine-written blurb from the
-- Trait Questionnaire). NOT NULL with empty default so existing rows backfill.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
