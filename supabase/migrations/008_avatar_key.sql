-- Issue 58 / ADR-0020: generated roster avatar blob key (display-only; raw photos never shown).
alter table personas add column if not exists avatar_key text;
