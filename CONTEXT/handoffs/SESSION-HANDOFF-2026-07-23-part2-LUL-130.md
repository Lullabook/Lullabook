# Part 2 Handoff — LUL-130 Persona Creation Recovery

## Scope
Completed the LUL-130 crash-safe Persona creation foundation. This ticket does not wire a public create route or start provider training; LUL-103 owns that production entrypoint and consumer callback.

## Delivered
- Added forward-only migration `015_persona_creation_recovery.sql`; migration `014` remains unchanged.
- Revalidates Baby or Adult consent at finalization, before Persona writes or outbox creation.
- Adds retryable expiry reconciliation: expired reservation blobs are deleted before a durable cleanup acknowledgement. Failed deletion remains retryable.
- Adds Family-scoped, lease-based outbox claims with stable event IDs and idempotent sent acknowledgement.
- Adds PostgreSQL finalized-result rehydration.
- Adds serializable `persona-creation-finalized` WorkflowAdapter payload dispatch.
- Adds idempotent workflow-step consumer. LUL-103 supplies its real training callback and Inngest function registration.

## Verification
Passed:
- `npx vitest run tests/178-persona-creation-protocol.integration.test.ts tests/178-supabase-rls.integration.test.ts` — 14/14.
- `npx tsc --noEmit`.
- `git diff --check`.
- Kaizen Coach glossary, documentation organization, and architecture/secrets checks.

Repository-wide `npx vitest run` is not green: 823/831 tests pass. Eight unrelated mobile/source-contract failures remain, plus three unrelated source-scan timeouts under concurrent load. The earlier corrupted `@pdf-lib/standard-fonts` JSON was repaired with `npm ci --ignore-scripts`; it is no longer a failure source. No provider call, deployment, release, or production claim was made.

## Debugger Focus
- Verify the forward migration is safe after published migration 014.
- Verify RLS scope and `SECURITY DEFINER` functions use `app_current_family_id()` everywhere.
- Verify a failed blob deletion remains eligible for later cleanup.
- Verify a lease replay retains the same outbox event ID and consumer step key.
- Confirm LUL-103 must register the `persona-creation-finalized` Inngest handler and provide the actual post-finalization training callback before any production route invokes the dispatcher.
