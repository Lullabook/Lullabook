# 32 — Persist `push_subscriptions` + `email_plus_vpc_requests` (migration 003 + real store + hard-delete + CI smoke)

Status: shipped

Migration 003 adds the two tables; still-binding RLS shape: `push_subscriptions` is member-scoped (no `family_id`, a Member sees only their own rows), `email_plus_vpc_requests` mirrors `consent_receipts` RLS and the secret `token` is resolved server-side only, never via a client RLS read. Hard-delete erases both; `sync()` must never re-upsert deleted rows. CI applies migrations 001→003 from scratch.

(condensed 2026-07-07 — full spec in git history)
