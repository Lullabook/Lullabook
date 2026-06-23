-- Issue 125: likeness-confirmation gate. A persona is created with
-- likeness_confirmed = false; the Guardian must review sample generations and
-- accept BEFORE any book-generation spend. Persisted so the gate holds across
-- SupabaseDataStore round-trips (the in-memory store alone was insufficient).
alter table personas add column if not exists likeness_confirmed boolean not null default false;
