# Session Handoff — 2026-06-13: first local run + 4 bug fixes

Status: historical

First real local run: created `CONTEXT/local-dev/RUN-LOCAL.md` + `schema.sql`
(Supabase is the hard floor, no in-memory demo mode) and fixed 4 bugs — FK-safe
`sync()` ordering, local-only moderation fallback, multi-photo picker
accumulation, and Supabase SSR session-refresh middleware (132 tests unchanged).

- Binding: `SupabaseDataStore.sync()` upserts sequentially parent→child and deletes child→parent (fakes don't enforce FKs, so tests can't catch regressions here).
- Binding: `PermissiveDevModeration` activates only when `SIGHTENGINE_API_USER` is absent AND `NODE_ENV !== production` — prod stays fail-closed (ADR-0010).
- Binding: `.env.local` holds real keys, is git-ignored, and must never be committed.

(condensed 2026-07-07 — full text in git history)
