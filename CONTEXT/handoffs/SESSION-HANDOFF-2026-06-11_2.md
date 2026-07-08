# Session Handoff — 2026-06-11 (session 2): PRD v2 productionization one-shot, ~35% complete

Status: historical

First ~35% of the FABLE-ONESHOT productionization: full Postgres schema + RLS
(migration 002), real adapters for every port (Anthropic, fal queue REST,
Sightengine+CSAM moderation, R2 blob store, Inngest, Stripe, classics catalog,
Resend/web-push, pdf-lib, Rekognition liveness), workflow bodies made serializable
(`runGenerationBody`/`runRecoveryBody`), and `SupabaseDataStore` (hydrate/sync
per-request unit of work). Completed by the 2026-06-12 session.

- Binding: story text model is locked to `claude-sonnet-4-6` (stack.md) — overrides skill defaults.
- Binding: moderation fails closed; CSAM hash layer runs before classifiers and escalates.
- Binding: workflow `enqueue` buffers — request handlers must `await workflow.flush()` before responding; `wait-*` steps are never wrapped in `step.run`; post-wait mutations must be idempotent.
- Binding: never change the in-memory `DataStore` API (tests reach into its maps) — only extend it; `npm install` needs `--legacy-peer-deps`.

(condensed 2026-07-07 — full text in git history)
