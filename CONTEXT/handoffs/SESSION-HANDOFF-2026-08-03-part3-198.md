# Session Handoff — Part3 #198

- **Ticket:** #198 / local issue 190 — Wire atomic allowance and payable spend authorization
- **Stage:** Debugging → Grader Ready
- **Hardening commit:** `ae6af16`
- **Builder baseline:** `20e274c`

## Debug result

Luna max hardened the spend boundary:

- Story allowance reservation/release now uses atomic Postgres RPCs with Family locking and a concurrent transaction regression.
- Payable Anthropic, fal, training, moderation, storage, queue, repair, and retry boundaries use exact non-zero pricing and fail-closed authorization.
- Cost ledger records preserve non-zero estimates/actuals and replay idempotency rather than false zero-cost evidence.
- Default TextStory composition receives margin authorization instead of silently falling back to kill-switch-only behavior.
- Durable reservation cleanup remains terminal and exactly-once.

## Evidence

```text
npx vitest run tests/190-spend-boundary.integration.test.ts tests/190-kill-switch-restart.integration.test.ts
Test Files 2 passed (2)
Tests 27 passed (27)

npx tsc --noEmit
PASS
```

Scoped ESLint had 0 errors and 3 existing unused-symbol warnings in `story-cap.ts`; `git diff --check` passed. Broad verify must be rerun after the shared later-wave work settles. The grader should inspect the #198 diff independently, including the boundary coverage outside the focused fake-provider tests.

## Scope

Only these paths were staged in `ae6af16`:

- `src/lib/context.ts`
- `src/services/provider-cost-metering.ts`
- `src/services/story-cap.ts`
- `src/services/storybook.ts`
- `src/services/text-story.ts`
- `src/workflows/functions.ts`
- `supabase/migrations/025_atomic_story_allowance_reservation.sql`
- `tests/190-spend-boundary.integration.test.ts`

Unrelated dirty paths were preserved and not staged.
