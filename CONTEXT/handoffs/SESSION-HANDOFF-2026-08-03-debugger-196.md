# Session Handoff — Debugger #196

- **Ticket:** #196 / local issue 188 — Complete the real Persona training callback lifecycle
- **Stage:** Debugging → Review Ready
- **Hardening commit:** `0f8a4c6` (`fix(persona): harden training lifecycle boundaries`)
- **Builder baseline:** `f453f44`

## Debug result

Luna max red-team found and fixed the reachable lifecycle gaps:

- Web Persona creation now preserves `selfConsent` and `jurisdiction` into the production boundary.
- Own-subject Adult Members can create/accept/retrain; Baby creation remains Guardian-only.
- Retrain submits to fal before committing `review → training`, avoiding a durable stuck state on submission failure.
- Legacy workflow success registration is disabled; readiness comes from the signed callback lifecycle.
- Callback review samples use short-lived signed URLs for Family-owned LoRA blobs.
- Callback completion RPC privileges are explicitly restricted to `service_role`.
- Redacted `failure_reason` is hydrated/read after restart.
- Jurisdiction-configured Baby consent and moderation-before-liveness remain fail-closed.

## Evidence

```text
npx vitest run tests/188-persona-training-lifecycle.integration.test.ts tests/188-fal-callback-idempotency.integration.test.ts
Test Files 2 passed (2)
Tests 29 passed (29)
```

Scoped ESLint and `git diff --check` passed. Full `npm run verify` was not used as the ticket gate because the shared worktree has concurrent later-wave changes; parent/reviewer must re-run the broad gate on the settled tree and judge only this commit's files.

## Scope

Only the following paths were staged in `0f8a4c6`:

- `src/app/api/personas/[id]/retrain/route.ts`
- `src/db/supabase-store.ts`
- `src/lib/actions.ts`
- `src/services/fal-training-webhook.ts`
- `src/services/persona.ts`
- `src/services/production-persona-creation.ts`
- `src/workflows/functions.ts`
- `src/workflows/persona-create-body.ts`
- `supabase/migrations/024_persona_training_lifecycle.sql`
- `tests/188-fal-callback-idempotency.integration.test.ts`
- `tests/188-persona-training-lifecycle.integration.test.ts`

Unrelated dirty paths were preserved and not staged.
