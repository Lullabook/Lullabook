# LUL-100 ticket map

LUL-101 through LUL-110 remain existing issues updated in place. The verified LUL-103 blocker required exactly two new prerequisite children, LUL-129 and LUL-130. The Linear description for each issue should mirror its section. `Verification-command` is the owning coder/debugger lock and is deterministic/non-paid. `Blocked live-evidence gate` is not part of that command and cannot be run without a new user authorization.

## 1. LUL-129 — Establish deterministic PostgreSQL RLS integration harness

- Priority: 1 — Urgent
- State after corrective planner handoff: Coding
- Blocked by: None
- Next handoff: coder (`coder`), then debugger (`debugger`)

Goal: Add a repo-owned deterministic integration harness that executes the real Lullabook migrations and RLS policies on an actual PostgreSQL engine with Supabase-compatible authenticated claims, so Family A/B isolation is proven by PostgreSQL rather than DataStore guards or a recording stub.

Production/test entry points:

- `package.json` and `package-lock.json`
- `supabase/migrations/001_families_rls.sql` through `013_provider_artifacts_rls_and_delete.sql`
- repo-local support under `tests/support/postgres/` or its equivalent
- `tests/178-supabase-rls.integration.test.ts`

Invariants: RLS-H1, RLS-H2, RLS-H3.

Acceptance criteria:

- The harness uses an actual PostgreSQL engine. An embedded local PostgreSQL distribution plus a Supabase auth/JWT compatibility bootstrap is acceptable; in-memory maps, SQL string assertions, PGlite-only approximation, and mocked Supabase clients are not.
- A clean isolated database applies the migrations needed by LUL-103 in order, including `auth.uid()` compatibility.
- Family A and Family B authenticated principals are deterministic fixtures, and the service role is not the assertion principal.
- Family A can perform its permitted operations and cannot select, insert, update, or delete Family B Members, Personas, Babies, Baby–Person bonds, or Consent receipts.
- Missing PostgreSQL runtime, migration, or locked test file is a hard failure rather than a skip or Vitest no-match success.
- Setup and teardown leave no persistent credentials, database process, or fixture data.

Verification-command:

```bash
npx vitest run tests/178-supabase-rls.integration.test.ts && npm run verify
```

Blocked live-evidence gate: None. The database is local and deterministic.

## 2. LUL-130 — Establish crash-safe Persona creation reservation and outbox protocol

- Priority: 1 — Urgent
- State after corrective planner handoff: Coding
- Blocked by: LUL-129
- Next handoff: coder, then debugger

Goal: Establish the database-authoritative RPC/transaction, storage compensation, and durable outbox protocol that LUL-103 will consume, without yet rewiring the native Persona route/action.

Production entry points:

- a new Supabase migration after `013_provider_artifacts_rls_and_delete.sql`
- a focused PostgreSQL repository/adapter for Persona creation
- production `BlobStore` and `WorkflowAdapter` boundaries
- `tests/178-persona-creation-protocol.integration.test.ts`
- the PostgreSQL support introduced by LUL-129

Invariants: ATOM-H1, ATOM-H2, ATOM-H3, ATOM-H4, ATOM-H5, SAFE-1, SAFE-2, FAM-1.

Acceptance criteria:

- Request photo/selfie bytes remain in memory through authenticated role, consent, liveness, preflight, and moderation checks; no blob or workflow/provider submission precedes those checks.
- A prepare RPC executed as the authenticated principal revalidates authority, jurisdictional Baby consent or durable subject-linked Adult self-consent, capacity, and idempotency, then reserves immutable Family-owned IDs/keys without creating Persona/Baby/bond domain rows or a workflow event.
- The application writes only moderated bytes to reserved keys and records SHA-256/size manifests. Partial upload failure deletes every successful creation-scoped key and aborts/removes the reservation.
- A finalize RPC revalidates the reservation/consent and atomically creates the Persona, optional Baby/bond, applicable durable Adult consent receipt, and exactly one outbox event.
- Finalize failure compensates every blob. An expiry reconciler removes blobs and pending rows left by a crash after upload but before finalize.
- Outbox lease/retry uses a stable event ID; crash after send is safe with an idempotent consumer, and training cannot start from prepared/aborted requests.
- Concurrent/retried requests produce at most one finalized creation, capacity claim, and logical workflow event.
- Compensation never scans or deletes another request's rows or keys; all pending/outbox records are Family-scoped, Hard-delete discoverable, and contain no bytes or secrets.
- The successful result rehydrates from PostgreSQL without making a process-local map authoritative.
- No route/action/native product wiring changes in this foundation ticket; that remains LUL-103.

Verification-command:

```bash
npx vitest run tests/178-persona-creation-protocol.integration.test.ts tests/178-supabase-rls.integration.test.ts && npm run verify
```

Blocked live-evidence gate: None. Storage and workflow failures use stateful deterministic fakes at the production adapter boundaries.

## 3. LUL-103 / local 178 — Wire the crash-safe consent-safe Persona protocol into production

- Priority: 1 — Urgent
- State after planner handoff: Coding
- Blocked by: LUL-129, LUL-130
- Next handoff: coder (`coder`), then debugger (`debugger`)

Goal: Make the native Persona creation route/action and workflow consume the LUL-129/LUL-130 PostgreSQL, compensation, and outbox foundations as one externally observable operation. LUL-103 owns production wiring and behavior, not redesigning the protocol.

Production entry points:

- `src/lib/actions.ts`
- `src/workflows/persona-create-body.ts`
- `src/services/persona.ts`
- `src/db/supabase-store.ts`
- the Persona creation repository/RPC/outbox introduced by LUL-130
- `supabase/migrations/012_atomic_consent_safe_persona.sql` plus the LUL-130 migration
- native Family creation caller under `mobile/app/family/`

Invariants: SAFE-1, SAFE-2, FAM-1, RLS-1.

Acceptance criteria:

- The bearer API, server action, promotion path where applicable, and workflow all call one production Persona creation protocol; `createAtomic` and map-wide rollback are no longer the production authority.
- No source photo is durably written before moderation succeeds, and no provider submission occurs before both consent and moderation succeed.
- Missing, revoked, expired, wrong-jurisdiction, and rejected-photo cases leave no Family/Person/Baby/bond/Persona/Consent rows and no blob.
- Adult self-consent is a durable subject-linked receipt, not an unpersisted caller boolean.
- Ordinary Members are rejected before Adult or Baby Persona persistence/training.
- The production schema round-trips lifecycle status, consent method, and relationships.
- Authenticated Family A/B tests execute real PostgreSQL RLS policies.
- The route returns success only after the durable finalize/outbox commit. Workflow delivery may be asynchronous, but a queue-send crash is recoverable from the committed outbox.
- Injected upload/finalize/dispatch crashes exercise LUL-130 compensation and recovery through the production composition path, with no duplicate training submission.

Verification-command:

```bash
npx vitest run tests/178-atomic-consent-safe-persona.test.ts tests/178-supabase-rls.integration.test.ts tests/178-persona-creation-protocol.integration.test.ts tests/178-production-persona-entrypoint.integration.test.ts && npm run verify
```

Blocked live-evidence gate: None. Provider calls are faked behind the production adapter in this deterministic ticket.

## 4. LUL-104 / local 179 — Enforce signed fal callbacks and owned LoRA lifecycle

- Priority: 1 — Urgent
- State after planner handoff: Coding
- Blocked by: LUL-103
- Next handoff: coder, then debugger

Goal: Route production training and callbacks through the existing signed lifecycle so raw callback authentication, durable idempotency, model/endpoint metadata, artifact validation, owned storage, and durable failures are active on the deployed path.

Production entry points:

- `src/app/api/webhooks/fal/route.ts`
- `src/adapters/fal-webhook.ts`
- `src/services/fal-training-webhook.ts`
- `src/services/fal-lora-training.ts`
- `src/services/persona.ts`
- `src/adapters/fal.ts`
- `src/db/supabase-store.ts`

Invariants: PROV-1, PROV-2, OWN-1, COST-1 (request metadata only until LUL-108).

Acceptance criteria:

- The route retains the raw body and verifies timestamp, body hash, JSON parseability, and signature in that order before business dispatch.
- Unsigned, stale, malformed, replayed, and out-of-order callbacks cannot enqueue events, copy artifacts, or advance Persona state.
- A database-atomic receipt claim permits exactly one artifact copy and transition under concurrent duplicate callbacks and process restart.
- Production Persona training uses ZIP submission and persists provider request ID, canonical endpoint/model, selected model, step count, and idempotency key.
- The selected model is sent at the fal boundary rather than recorded as metadata only.
- LoRA and configuration downloads validate trusted origin/redirect policy, content type, non-empty content, parseable config, and expected artifact identity before copying to Family-owned storage.
- Durable errors and logs redact credentials, provider URLs containing tokens, and source-media data.

Verification-command:

```bash
npx vitest run tests/179-fal-lora-contract.test.ts tests/179-fal-webhook.test.ts tests/179-fal-route-production.integration.test.ts tests/179-fal-callback-concurrency.integration.test.ts && npm run verify
```

Blocked live-evidence gate: No real fal training request is permitted. Real provider execution belongs to LUL-101 and requires fresh authorization.

## 5. LUL-102 / local 177 — Make R1 entitlement and capacity database-authoritative

- Priority: 2 — High
- State after planner handoff: Coding
- Blocked by: LUL-103
- Next handoff: coder, then debugger

Goal: Converge API, paywall, native usage, role checks, Persona capacity, and Story allowance recovery on one persisted R1 plan contract after the safe production creation boundary exists.

Production entry points:

- `src/services/entitlement.ts`
- `src/app/api/entitlement/route.ts`
- `src/services/persona.ts`
- `src/services/story-cap.ts`
- `src/services/storybook.ts`
- `src/db/supabase-store.ts`
- `mobile/app/billing.tsx`

Invariants: FAM-1, ENT-1, FAIL-1.

Acceptance criteria:

- Entitlement API returns one canonical plan shape; no top-level legacy cap or capability contradicts `plan.limits`.
- Paywall and mobile usage consume that same shape.
- Only the Guardian can create an R1 Adult or Baby Persona.
- Capacity is claimed atomically in the database; two concurrent attempts at the fourth Persona result in at most one success and no rejected training submission.
- A stranded/watchdog-failed Story generation releases its allowance reservation exactly once across retries/restart.
- R1 remains one Member login, three type-neutral Personas, at most three starring Personas, and four completed Storybooks per monthly reset.

Verification-command:

```bash
npx vitest run tests/177-r1-family-plan-entitlement.test.ts tests/177-production-entitlement.integration.test.ts tests/177-persona-cap-concurrency.integration.test.ts tests/177-allowance-watchdog.integration.test.ts && npm run verify
```

Blocked live-evidence gate: None.

## 6. LUL-108 / local 183 — Put durable spend controls on every payable boundary

- Priority: 2 — High
- State after planner handoff: Coding
- Blocked by: LUL-104
- Next handoff: coder, then debugger

Goal: Make cost authorization and terminal attempt metering part of production text, training, image, repair, moderation, storage/queue/retry composition so persisted red switches stop new spend rather than merely changing an isolated report.

Production entry points:

- `src/services/provider-cost-metering.ts`
- `src/services/storybook.ts`
- `src/services/persona.ts`
- `src/services/fal-lora-training.ts`
- `src/adapters/fal.ts`
- `src/adapters/anthropic.ts`
- `src/db/supabase-store.ts`
- `supabase/migrations/013_provider_artifacts_rls_and_delete.sql`

Invariants: COST-1, COST-2, FAIL-1.

Acceptance criteria:

- Every payable production call authorizes before invocation and records accepted/failed/unknown outcome with canonical provider/model/endpoint/pricing version and owning artifact IDs.
- A persisted global, provider, model, or endpoint red switch prevents new paid calls after process restart while deletion and inspection remain available.
- Cost ledger, kill switches, allowance reservations, and margin inputs hydrate/sync through Supabase and use atomic claims where double spend is possible.
- Missing P95/full-cap margin evidence fails closed; the 70% floor cannot be bypassed by omitting a field.
- Records contain no credentials, prompt/raw-photo content, or tokenized provider URLs.

Verification-command:

```bash
npx vitest run tests/183-provider-cost-metering.test.ts tests/183-production-spend-boundaries.integration.test.ts tests/183-kill-switch-restart.integration.test.ts && npm run verify
```

Blocked live-evidence gate: Actual provider billing reconciliation is deferred to the separately authorized LUL-101 canary.

## 7. LUL-105 / local 180 — Make Likeness review, retrain, and Brief resume durable

- Priority: 2 — High
- State after planner handoff: Coding
- Blocked by: LUL-104
- Next handoff: coder, then debugger

Goal: Persist the review lifecycle and waiting Brief claim so native accept/retrain actions, selected Personas, downstream failure recovery, derivatives, and exactly-once Story enqueue survive process restart.

Production entry points:

- `src/services/cold-start.ts`
- `src/services/persona.ts`
- `src/services/storybook.ts`
- `src/db/supabase-store.ts`
- `mobile/app/likeness/[id].tsx`

Invariants: LIKE-1, FAIL-1, OWN-1.

Acceptance criteria:

- Waiting Brief status and selected Persona IDs persist and rehydrate across service instances.
- A claim is committed only after durable downstream acceptance; enqueue return alone does not delete the Brief.
- Provider/workflow failure leaves one recoverable Brief and cannot duplicate Story allowance/provider spend.
- Native Retry/retrain invokes the authenticated retraining command rather than reloading samples.
- Persona review readiness and Family-owned sample/avatar artifacts commit atomically or purge partial derivatives.
- Training completion alone cannot unlock Story spend.

Verification-command:

```bash
npx vitest run tests/180-likeness-readiness-cold-start.test.ts tests/180-brief-resume-restart.integration.test.ts tests/180-native-retrain-intent.test.ts tests/180-derivative-atomicity.integration.test.ts && npm run verify
```

Blocked live-evidence gate: None; provider outcomes are deterministic fakes.

## 8. LUL-106 / local 181 — Persist bounded Story Context and enforce the R1 12-Page contract

- Priority: 2 — High
- State after planner handoff: Coding
- Blocked by: LUL-102, LUL-108
- Next handoff: coder, then debugger

Goal: Make the R1 production text path select bounded authorized context, persist provenance, enforce complete Style Bible/exactly-twelve output before image spend, and meter Anthropic token usage.

Production entry points:

- `src/services/context-selector.ts`
- `src/services/storybook.ts`
- `src/adapters/anthropic.ts`
- `src/domain/story-type.ts`
- `src/db/supabase-store.ts`

Invariants: CTX-1, COST-1, FAIL-1, RLS-1.

Acceptance criteria:

- R1 callers cannot select the legacy five-Page short type; valid R1 output has exactly twelve ordered Pages/Scenes.
- Style Bible validation requires a complete wardrobe entry for every selected Persona.
- Family-owned source manifests/provenance persist and rehydrate without raw images.
- Selected fields, including `theyCallBaby`, render when in the accepted bounded context.
- Anthropic usage reaches the authoritative cost ledger.
- Invalid/truncated/refused text releases allowance before any illustration call.

Verification-command:

```bash
npx vitest run tests/181-story-context-sonnet-contract.test.ts tests/181-r1-production-story-contract.integration.test.ts tests/181-context-provenance-reload.integration.test.ts && npm run verify
```

Blocked live-evidence gate: Sonnet 4.6 versus Sonnet 5 quality/cost comparison remains part of LUL-101 and requires fresh authorization.

## 9. LUL-107 / local 182 — Send real multi-LoRA Page requests with bounded repair

- Priority: 2 — High
- State after planner handoff: Coding
- Blocked by: LUL-104, LUL-106, LUL-108
- Next handoff: coder, then debugger

Goal: Ensure every selected one-to-three-Persona R1 Page uses the canonical multi-LoRA request and that repair receives valid owned failed-Page/identity inputs while preserving bounded concurrency and recovery.

Production entry points:

- `src/services/storybook.ts`
- `src/adapters/fal.ts`
- provider routing/configuration in `src/lib/context.ts`

Invariants: IMG-1, FAIL-1, COST-1, OWN-1.

Acceptance criteria:

- Multi-Persona generation never substitutes fabricated `example.com` references or bypasses LoRAs through an unapproved reference route.
- Captured production adapter requests contain selected owned LoRA inputs, Style Bible, seed, provider/model/endpoint, safety, and required dimensions.
- Repair receives a valid owned failed-Page artifact and supported identity-preserving inputs; the fal adapter does not drop LoRAs.
- Twelve Pages use bounded concurrency; one failed Page remains a re-rollable hole.
- Cheap repair precedes Pro repair, both are bounded and metered, and generated output is moderated before completion.

Verification-command:

```bash
npx vitest run tests/182-multipersona-page-fanout.test.ts tests/182-fal-request-contract.integration.test.ts tests/182-production-repair-routing.integration.test.ts && npm run verify
```

Blocked live-evidence gate: Multi-Persona visual quality and repair efficacy require the separately authorized LUL-101 canary.

## 10. LUL-109 / local 184 — Make RLS and Hard-delete consume the real persisted inventory

- Priority: 1 — Urgent
- State after planner handoff: Coding
- Blocked by: LUL-103, LUL-104, LUL-105, LUL-106, LUL-107, LUL-108
- Next handoff: coder, then debugger

Goal: Persist every Family-owned provider/context/cost/allowance artifact, prove PostgreSQL RLS with authenticated Family principals, and make Hard-delete complete/idempotent across process restart and provider degradation.

Production entry points:

- `src/db/supabase-store.ts`
- `src/services/hard-delete.ts`
- `src/services/storybook.ts`
- `supabase/migrations/013_provider_artifacts_rls_and_delete.sql`
- production blob/provider adapter interfaces

Invariants: RLS-1, DEL-1, OWN-1.

Acceptance criteria:

- Supabase round-trips provider training requests, webhook receipts, cost ledger, allowance reservations, Story Context provenance, and owned artifact keys.
- Authenticated Family A cannot select, mutate, or delete Family B data at the database policy boundary.
- Hard-delete inventories and removes rows, raw photos, review/avatar derivatives, Storybooks/Pages, moderation audit rows, LoRA/config, context provenance, and Family-scoped ledger/allowance rows.
- Completion claims/reports are durable; a second authenticated delete after restart is safe and idempotent.
- Provider deletion failure does not restore local content and yields a durable machine-readable limitation with no secret/provider URL leakage.
- SQL and application retention behavior both hard-delete Family-scoped financial rows.

Verification-command:

```bash
npx vitest run tests/184-provider-artifact-delete-rls.test.ts tests/184-supabase-artifact-inventory.integration.test.ts tests/184-hard-delete-restart.integration.test.ts tests/184-authenticated-rls.integration.test.ts && npm run verify
```

Blocked live-evidence gate: None; remote provider deletion is represented by a stateful adapter fake. Real provider limitations are evidence for the final authorized smoke only.

## 11. LUL-101 / local 176 — Make the canary harness safe and evidence-eligible, then hold spend

- Priority: 3 — Medium
- State after planner handoff: Coding
- Blocked by: LUL-104, LUL-106, LUL-107, LUL-108, LUL-109
- Next handoff: coder, then debugger; human authorization before live evidence

Goal: Wire the canary to the production adapters and make fixtures, consent provenance, durable run state, budget accounting, request/result trust, semantic validation, redaction, and evidence eligibility deterministic before any provider spend is authorized.

Production entry points:

- `tools/provider-bakeoff.ts`
- `src/services/provider-bakeoff.ts`
- `src/adapters/fal.ts`
- `src/adapters/anthropic.ts`
- durable provider/cost persistence introduced by LUL-108/LUL-109

Invariants: EVID-1, LIVE-1, COST-1, PROV-2.

Acceptance criteria:

- The approved fixture manifest is cryptographically bound to the exact archive/golden set and records synthetic or consenting-adult classification plus durable consent proof; minors are refused.
- Canonical provider/model/endpoint identifiers and production structured Story validation are shared rather than copied from expected metadata.
- Durable run state resumes accepted queue work without resubmission; crash/retry behavior cannot exceed the hard budget.
- Unknown/failed provider billing remains non-eligible and reserves worst-case budget until reconciled.
- Trusted URL/redirect/request-ID/content boundaries reject untrusted output and redact credentials/raw media.
- Fake, missing, copied, or synthetic request IDs/costs cannot become release-eligible.
- The default command refuses before network access without the separate explicit live authorization inputs.

Verification-command:

```bash
npx vitest run tests/176-provider-bakeoff-contract.test.ts tests/176-canary-fixture-integrity.test.ts tests/176-canary-resume-budget.integration.test.ts tests/176-canary-evidence-eligibility.test.ts && npm run verify
```

Blocked live-evidence gate:

```text
DO NOT RUN: LIVE_PROVIDER_BUDGET_USD=10 npm run smoke:provider-bakeoff
```

The `$10` canary requires a new explicit user authorization after deterministic verification. Its real result may reopen ADR-0028 routing/economics and cannot be marked passed by coder/debugger.

## 12. LUL-110 / local 185 — Build the deterministic production-like release gate, then hold live smoke

- Priority: 1 — Urgent
- State after planner handoff: Coding
- Blocked by: LUL-101, LUL-102, LUL-103, LUL-104, LUL-105, LUL-106, LUL-107, LUL-108, LUL-109
- Next handoff: coder, then debugger; human authorization before live evidence

Goal: Exercise the production native/API/Supabase composition with deterministic providers over one persisted fixture and produce non-synthetic-only release eligibility logic, failure/recovery evidence, RLS/Hard-delete proof, and robust redaction before any real-provider smoke is considered.

Production entry points:

- `tools/r1-provider-e2e.ts`
- `src/services/r1-provider-e2e.ts`
- native routes/screens for trial, Family creation, Likeness review, and Story creation
- `src/db/supabase-store.ts`
- production provider adapter interfaces

Invariants: EVID-1, LIVE-1, SAFE-1, PROV-1, FAM-1, LIKE-1, CTX-1, IMG-1, COST-1, RLS-1, DEL-1.

Acceptance criteria:

- Deterministic production-like execution covers trial, consent, multiple Family people/Babies, training submission/callback, review/accept, waiting Brief resume, valid 12-Page multi-Persona draft, cost/allowance evidence, RLS denial, and Hard-delete on the same persisted fixture.
- Forced text/Page/repair failure and duplicate callbacks prove recoverable/terminal states without double allowance or provider spend.
- Release eligibility requires real request IDs and validated provider/model/endpoint/actual cost/duration; deterministic fake evidence is always non-release-eligible.
- JSON, nested credentials, provider URLs, prompts, and photo fields are redacted from every report/log path.
- The live checklist reflects executed evidence rather than returning permanently pending steps as success.

Verification-command:

```bash
npx vitest run tests/185-r1-provider-e2e-gate.test.ts tests/185-production-composition.integration.test.ts tests/185-release-evidence-redaction.test.ts && npm run verify
```

Blocked live-evidence gate:

```text
DO NOT RUN: LIVE_PROVIDER_BUDGET_USD=2 npm run smoke:r1-provider-e2e
```

The `$2` smoke requires a new explicit user authorization after every blocker is independently verified and the LUL-101 canary has an accepted result. No deployment or release action is implied.
