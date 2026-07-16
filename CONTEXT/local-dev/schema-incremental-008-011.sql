-- Incremental schema for dev Supabase projects created before migration 008.
-- Idempotent (IF NOT EXISTS throughout) — safe to re-run.
-- Paste into the Supabase SQL editor and Run. Covers migrations 008–011.

-- ==== 008_avatar_key.sql ====
-- Issue 58 / ADR-0020: generated roster avatar blob key (display-only; raw photos never shown).
alter table personas add column if not exists avatar_key text;

-- ==== 009_baby_birthdate.sql ====
-- Issue 64: optional birthDate on babies for Birthday Story offers (PRD v8)
ALTER TABLE babies ADD COLUMN IF NOT EXISTS birth_date date;

-- ==== 010_baby_daily_routine.sql ====
-- Per-baby editable daily routine (Daily Life page).
ALTER TABLE babies ADD COLUMN IF NOT EXISTS daily_routine jsonb;

-- ==== 011_likeness_confirmed.sql ====
-- Issue 125: likeness-confirmation gate. A persona is created with
-- likeness_confirmed = false; the Guardian must review sample generations and
-- accept BEFORE any book-generation spend.
alter table personas add column if not exists likeness_confirmed boolean not null default false;
