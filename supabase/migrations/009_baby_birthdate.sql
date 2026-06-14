-- Issue 64: optional birthDate on babies for Birthday Story offers (PRD v8)

ALTER TABLE babies ADD COLUMN IF NOT EXISTS birth_date date;
