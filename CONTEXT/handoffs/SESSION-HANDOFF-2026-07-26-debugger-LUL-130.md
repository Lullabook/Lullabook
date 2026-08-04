# Part 3 Session Handoff — LUL-130 Persona Creation Protocol

**Date:** 2026-07-26  
**Issue:** LUL-130 only  
**Branch:** `fix/lul-100-debugger-debugger-ready`

## Scope and Current Status

This session worked only on LUL-130: crash-safe Persona creation reservation, upload, finalize, consent enforcement, blob compensation, durable outbox delivery, scheduled recovery, Inngest replay, and forward migration `017_persona_creation_protocol_hardening.sql`.

Other debugger-ready issues were deliberately not started. The broader decisions and dependency chain remain owned by:

- `plans/LUL-100/PLAN.md`
- `plans/LUL-100/TICKETS.md`
- `CONTEXT/docs/adr/0028-r1-family-persona-provider-economics.md`

LUL-130 was moved to **Debugging** in Linear at the start of this work. Its move to **Done** and the PR link are still pending; the root session is handling those immediately after this document. No Linear or GitHub mutation was performed while writing this handoff.

## Delivered for LUL-130

The current scoped implementation provides:

- a durable reservation → upload-attempt → finalize protocol for Baby and Adult Personas;
- exact consent association and revalidation at the SQL authority boundary;
- attempt-scoped upload ownership and crash-safe blob compensation;
- retryable, leased cleanup for failed attempts and expired reservations;
- durable, lease-based outbox dispatch with stable event IDs;
- scheduled service-role recovery and bounded quarantine work;
- finalized-result rehydration after lost acknowledgements;
- Inngest event deduplication and replay through an idempotent workflow step;
- migration 017 hardening for migration-016 upgrade rows, RLS, grants, invariants, cleanup, and outbox claims.

This handoff records the session delta only; it does not restate the product plan, ticket definitions, or ADR.

## Maker → Checker Loops

Three independent fresh-eyes checker rounds reviewed LUL-130. Every round returned **DIRTY**. Each verified defect was repaired test-first before the next round or final gate.

### Round 1 — DIRTY, four findings

1. **Jurisdictional Baby consent was hardcoded to `email_plus`.**
   - This rejected valid US `payment_vpc` consent and admitted the wrong method at the SQL boundary.
   - Repair: one canonical jurisdiction/method/notice predicate now governs migration backfill, trigger validation, prepare, retry, and finalize, with accept/reject regressions.

2. **Reservation JSON was not whitelisted.**
   - Authenticated callers could persist raw/base64 photo bytes, provider material, or other secret-like fields in pending rows.
   - Repair: Baby, bond, and photo-manifest JSON now reject unknown properties and persist only the allowed shapes; regressions prove sensitive fields are rejected before persistence.

3. **Repeated cleanup failures ended in terminal quarantine without requeue.**
   - After enough blob-store failures, cleanup could become permanently unrecoverable.
   - Repair: the terminal attempt cap was removed; cleanup remains bounded and leased but indefinitely retryable, and transient failures release the lease. Tests cover success after more than ten failures for reservation and upload-attempt cleanup.

4. **Abort authorization was open to ordinary Family Members.**
   - A same-Family Member could abort a Guardian-owned reservation.
   - Repair: authenticated abort now requires both reservation ownership and current Guardian authority; service-role recovery remains available.

Post-repair focused result: **69 tests passed**.

### Round 2 — DIRTY, four findings

1. **Authenticated users could forge verified consent receipts.**
   - Repair: authenticated consent mutation policies were removed, authenticated `INSERT`/`UPDATE`/`DELETE` were revoked, Family-scoped reads remain, and trusted service-role issuance is covered by RLS regressions.

2. **Unauthorized migration-016 finalized Adult Personas remained dispatchable.**
   - Repair: migration 017 detects Adult Personas finalized by non-Guardians, marks the Persona and outbox failed, aborts the reservation with a durable remediation reason, and leaves the graph eligible for leased cleanup. Valid Guardian-created rows remain dispatchable.

3. **Hard-delete missed `persona-creation/{familyId}/` blobs.**
   - Repair: Family blob discovery now includes the Persona-creation prefix and protocol source-photo inventory, with deletion and repeated-call idempotence tests.

4. **Requests with more than 20 photos reached moderation before rejection.**
   - Repair: the shared 20-photo maximum is enforced before preflight, liveness, moderation, reservation, blob work, or `File.arrayBuffer()`. A 21-photo regression proves zero moderation and reservation calls.

Post-repair focused result: **74 tests passed**.

### Round 3 — DIRTY, one HIGH finding

- **Migration-016 finalized Baby reservations retained `baby_consent_receipt_id = NULL`.**
  - A receipt could be revoked after the legacy finalize, yet the queued training event remained claimable because the claim path did not revalidate the exact canonical Baby consent.
  - Repair:
    - migration 017 now includes finalized migration-016 Baby reservations in a bidirectionally unique canonical-consent backfill;
    - ambiguous or unresolved finalized rows are durably remediated: outbox failed, Persona failed, reservation aborted and queued for cleanup;
    - outbox quarantine, general claim, reservation-specific claim, and finalized-event reads revalidate the exact associated Baby receipt;
    - revocation before dispatch blocks training and leaves the Persona/Baby graph eligible for idempotent cleanup;
    - upgrade regressions cover valid backfill and claim, later revocation, claim denial, durable remediation, and graph cleanup.

Post-repair focused result: **5 files / 75 tests passed**.

No fourth checker round was run after the final repair. The root session inspected the final consent backfill/claim/cleanup safeguards and reran the deterministic gates below; do not describe the checker outcome as CLEAN.

## Deterministic Verification Actually Run

Passed:

- Focused LUL-130 suites: **5 test files / 75 tests**.
  - `tests/178-persona-creation-protocol.integration.test.ts`
  - `tests/178-supabase-rls.integration.test.ts`
  - `tests/178-production-persona-entrypoint.integration.test.ts`
  - `tests/real-adapters.test.ts`
  - `tests/12-hard-delete.test.ts`
- Root `npm run verify`: **PASS**, recorded as `VERIFY-EXIT:0`.
  - root TypeScript: PASS;
  - mobile TypeScript: PASS;
  - full Vitest suite: PASS;
  - Sentry issue automation: PASS;
  - dead-surface sweep: PASS;
  - deterministic seed: PASS;
  - Playwright: **SKIP**, because no server was running/configured.
- `git diff --check`: clean.

Mobile lint baseline is unchanged:

- `npx eslint mobile` exits 1;
- two known pre-existing `mobile/metro.config.js` CommonJS `require()` errors remain;
- 15 pre-existing warnings remain;
- no mobile source file was changed by LUL-130.

The PostgreSQL-focused runs can emit a non-failing `MaxListenersExceededWarning` because repeated tests start multiple embedded PostgreSQL instances. It did not fail the suites or verification gate.

## No Live or Paid Provider Execution

No live, paid, production, or deployment provider command ran.

The following gates remain blocked and require fresh user authorization that specifies fixtures and budget:

- LUL-101: hard-capped **$10** provider bake-off;
- LUL-110: hard-capped **$2** real-provider smoke.

The relevant budget environment key is `LIVE_PROVIDER_BUDGET_USD`; no value or credential is recorded here.

## Scoped Files Changed

### Session reviewer configuration

- `.claude/agents/debugger-lullabook.md`

### Migration and production code

- `supabase/migrations/017_persona_creation_protocol_hardening.sql`
- `src/adapters/fakes.ts`
- `src/adapters/inngest.ts`
- `src/db/persona-creation-protocol.ts`
- `src/lib/actions.ts`
- `src/services/hard-delete.ts`
- `src/services/persona.ts`
- `src/services/production-persona-creation.ts`
- `src/workflows/functions.ts`

### Tests and PostgreSQL harness

- `tests/03-adult-persona.test.ts`
- `tests/12-hard-delete.test.ts`
- `tests/178-persona-creation-protocol.integration.test.ts`
- `tests/178-production-persona-entrypoint.integration.test.ts`
- `tests/178-supabase-rls.integration.test.ts`
- `tests/real-adapters.test.ts`
- `tests/support/postgres/rls-harness.ts`

### Handoff

- `CONTEXT/handoffs/SESSION-HANDOFF-2026-07-26-debugger-LUL-130.md`

## Unrelated Worktree Changes Preserved

These pre-existing/unrelated changes were deliberately preserved, were not folded into LUL-130, and were not committed by this handoff task:

- `CONTEXT/CONTEXT.md`
- `CONTEXT/docs/adr/0028-r1-family-persona-provider-economics.md`
- `next-env.d.ts`
- `.agents/`
- `.codex/`
- `codex-native-selector/`
- `CONTEXT/handoffs/DEBUG-AUDIT-2026-07-21-r1-176-185.md`

## Delivery and Next Action

Current delivery state:

- Linear: LUL-130 is **Debugging**; move to **Done** is pending.
- Branch: `fix/lul-100-debugger-debugger-ready`.
- PR: no PR link existed at the final transcript check; branch push/PR creation and Linear linking are pending in the root session immediately after this document.
- This handoff task did not commit, push, open a PR, or touch Linear/GitHub.

After LUL-130 delivery metadata is closed, continue the remaining dependency-ordered debugger-ready chain starting with **LUL-103**. Do not begin another issue before LUL-130’s scoped commit, push, PR link, and Linear status update are complete.

## Suggested Skills

- `/debugger` — continue the debugger-ready chain, starting with LUL-103.
- `/handoff` — refresh the session handoff before a context switch.
- `/push-handoff` — commit/push the scoped work and publish the handoff when authorized.
