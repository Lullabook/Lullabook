-- Per-baby editable daily routine (Daily Life page).
ALTER TABLE babies ADD COLUMN IF NOT EXISTS daily_routine jsonb;
