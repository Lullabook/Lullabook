# LUL-100 — Production-path remediation plan for R1 Family/provider spine

LUL-100 must turn the already-implemented R1 Family, Persona, Story Context, provider, and unit-economics spine into a production-wired, independently verifiable system without treating the green fake/in-memory suite as release evidence. This corrective revision preserves audited Linear issues LUL-101 through LUL-110, adds only the two foundations proven missing by the blocked LUL-103 coder run (LUL-129 and LUL-130), then closes moderation-before-persistence in LUL-103 and signed fal callbacks in LUL-104. Every paid provider canary/smoke remains behind a separate fresh authorization gate.

## Scope and planning basis

- Parent: LUL-100, currently the oldest `Agent Ready` issue in the Lullabook queue.
- Existing implementation set: LUL-101 through LUL-110, mapped to local tickets 176–185. These issues are reused; no duplicate replacements are created.
- Decision source: ADR-0028.
- Audit source: `CONTEXT/handoffs/DEBUG-AUDIT-2026-07-21-r1-176-185.md`.
- Production vocabulary source: `CONTEXT/CONTEXT.md`.
- Planning branch: `feat/prd-v20-pillar-a-payment`.
- Planning-only restriction: no application code, provider canary, provider smoke, paid/live provider request, deployment, publication, or PR operation is in this planner run.
- Corrective evidence: LUL-103 comment `3fd29bcd-811e-4b7e-b96d-5f8504222dd0`, which records the exercised/reverted prototype, missing real RLS file/harness, absent database/blob/queue atomicity protocol, and no code commit.

The effort is one coherent remediation program rather than a new product design. The accepted ADR fixes product scope and economics; the audit fixes the defect frontier. No additional user interview is needed because the current request explicitly settles sequencing, tracker reuse, non-paid verification, and live-provider authorization boundaries.

## Problem statement

Commit `654d5e3` has a real deterministic green baseline, but several tests exercise dead services, in-memory maps, stubs, or report shape instead of the routes, workflows, database policies, storage boundaries, and provider adapters used in production. The result can claim success while a Baby photo is durably staged before moderation, an unsigned fal callback advances workflow state, a red cost switch fails to prevent spend, provider artifacts are absent from Hard-delete inventory, or synthetic evidence is labeled release-eligible.

## Outcome

The production composition path must enforce the accepted R1 contract from authenticated native request through durable Supabase state, provider boundaries, recovery, and Hard-delete. Each existing issue receives:

1. a parent relationship to LUL-100;
2. an explicit priority and blocking edge;
3. named production entry points;
4. inherited testable invariants;
5. a deterministic, non-paid locked verification command; and
6. an explicit live-evidence gate where provider spend would otherwise be implied.

## Non-goals

- No Family invitations or additional creating Members.
- No change to the accepted `$14.99/month`, `$119.99/year`, four-Storybook, three-Persona, 12-Page R1 envelope.
- No provider/model approval from fake or deterministic evidence.
- No automatic routing switch based on a canary.
- No real minor photos in engineering fixtures.
- No paid provider operation without a new budget authorization naming the gate and cap.
- No deployment, release, App Store submission, PR creation/merge, or GitHub issue mutation.

## Design decisions

### D1 — Production composition path is the test seam

A passing service seam is insufficient where the service is not called. Remediation tests must enter through the route/action/workflow used by the native client and cross the real persistence adapter. Provider network calls remain faked in deterministic CI, but the fake must be injected behind the same production adapter boundary and must capture the exact request.

### D2 — Safety foundations, production wiring, then webhook security are the first remediation chain

The first runnable production-risk sequence is:

1. LUL-129: establish a deterministic actual-PostgreSQL RLS harness with Supabase-compatible authenticated claims.
2. LUL-130: establish the database prepare/finalize RPC, creation-scoped blob compensation/reconciliation, and durable outbox protocol.
3. LUL-103 / 178: make the native action and workflow consume those foundations so moderation precedes every source-photo write.
4. LUL-104 / 179: make training submission and the deployed fal webhook use authenticated, idempotent, owned-artifact lifecycle handling.

LUL-129 has no blocker. LUL-130 is blocked by LUL-129. LUL-103 is blocked by both foundations, and LUL-104 remains blocked by LUL-103. Broader entitlement consolidation follows without diluting these bounded slices.

### D3 — Durable claims, not read-then-write checks

Persona capacity, callback receipts, Brief resume, allowance reservations, and deletion completion require database-authoritative claims/transactions with unique constraints or compare-and-set semantics. Process-local sets/maps may cache state but cannot be the authority.

For Persona creation specifically, the locked protocol is a prepare/upload/finalize saga:

1. Keep request bytes in memory through authenticated role/consent/liveness/preflight/moderation checks.
2. A PostgreSQL prepare RPC revalidates authority, consent, capacity, and idempotency, then reserves immutable Family-owned IDs/keys without creating Persona/Baby/bond rows or a workflow event.
3. Write only moderated bytes to those keys. An Nth-write failure deletes every creation-scoped successful write and aborts the reservation.
4. A finalize RPC revalidates and atomically creates all domain rows, the durable Adult subject-consent receipt where applicable, and exactly one outbox event.
5. Finalize failure compensates blobs. An expiry reconciler cleans crash-left prepared uploads. Committed outbox rows dispatch with a stable event ID, leases, and idempotent consumption.

No rollback scans global maps or prefixes that another request can own.

### D4 — One authoritative persisted provider/cost inventory

Supabase must hydrate and persist provider requests, webhook receipts, owned artifacts, allowance reservations, Story Context provenance, cost ledger entries, and kill switches. Hard-delete and metering consume this same inventory. Parallel shadow maps that production persistence does not round-trip are prohibited.

### D5 — Hard-delete removes Family-scoped financial rows

For this release, Family-attributable cost-ledger and allowance rows are Family-owned and are hard-deleted with the Family, matching the existing SQL cascade and DEL-1. Aggregate business metrics may exist only if already irreversibly de-identified before deletion; they are not part of the Family artifact inventory and cannot contain provider request IDs, prompts, raw media, or stable Family identifiers.

### D6 — R1 Storybooks are exactly twelve Pages

The five-Page short Story type remains legacy/non-R1 only. Every accepted R1 creation entry point requires the 12-Page contract before illustration spend. Invalid text releases the allowance exactly once.

### D7 — Release evidence is non-synthetic

Deterministic tests can prove wiring, request shape, refusal behavior, redaction, persistence, recovery, RLS, and budget enforcement. They cannot approve a provider/model or satisfy a live release gate. Real evidence must include non-synthetic provider request IDs, canonical provider/model/endpoint IDs, actual billed cost, and authorized synthetic/consenting-adult fixture provenance.

### D8 — Live gates remain blocked, even after deterministic code is green

Two paid gates remain outside this autonomous run:

- LUL-101: the hard-capped `$10` provider bake-off.
- LUL-110: the hard-capped `$2` production-like real-provider smoke.

Neither command may run from CI, cron, coder, debugger, or this planner without a fresh user authorization specifying fixtures and budget. A deterministic issue verdict must say whether code is ready for the live gate; it must not report the live criterion as passed.

### D9 — Duplicate Next declarations are transient workspace artifacts, not a source prerequisite

The blocked coder run left ignored `* 2.*` prototype copies under `src/`, and the local Next caches contain ignored duplicate generated declarations such as `.next/types/routes.d 2.ts` and `.next/types/cache-life.d 2.ts`. The tracked `next-env.d.ts` reference also changes when the free/paid dev variants regenerate it. Current `tsc` failures cite those ignored copies, including imports that exist only in the reverted prototype; no tracked source migration or product dependency is missing for this reason.

Therefore no Linear implementation prerequisite is created for the duplicate declarations. The owning coder should remove only its abandoned ignored prototype copies and regenerate its local Next caches before running a locked command, while preserving the existing tracked `next-env.d.ts` worktree change. This corrective planner pass does not delete caches or modify unrelated product code.

## Executable invariants

| ID | Owner | Observable condition | Deterministic verification |
| --- | --- | --- | --- |
| SAFE-1 | LUL-103 | Rejected, absent, expired, revoked, or wrong-jurisdiction Baby consent and failed moderation leave zero durable rows, blobs, or provider submissions. | Production action/workflow integration test against Supabase + stateful storage/provider fakes. |
| SAFE-2 | LUL-103 | Adult Persona creation has a durable subject-linked self-consent receipt; ordinary Members cannot create Adult or Baby Personas. | Authenticated role and schema round-trip integration tests. |
| PROV-1 | LUL-104 | The deployed fal route verifies timestamp, body hash, parseability, and signature before business dispatch; stale, replayed, malformed, and unsigned input cannot advance state. | Route-level signed raw-body tests. |
| PROV-2 | LUL-104 | One durable callback claim permits one artifact copy/state transition under concurrent duplicates. | Concurrent duplicate callback test across two service instances. |
| OWN-1 | LUL-104, LUL-109 | LoRA/config/review artifacts become validated Family-owned keys; provider URLs never become owned keys. | Persistence/reload plus inventory test. |
| FAM-1 | LUL-102, LUL-103 | R1 has one creating Guardian Member; the total type-neutral Persona cap is three and concurrent fourth creation cannot persist or train. | Authenticated concurrent production-boundary test. |
| ENT-1 | LUL-102 | Entitlement API, paywall, and mobile usage consume one canonical plan shape with no contradictory legacy caps. | API contract and client fixture tests. |
| FAIL-1 | LUL-102, LUL-105, LUL-107 | Failed Story text/watchdog releases once; a failed Page/Brief remains recoverable without double allowance or duplicate provider spend. | Restart and forced-failure integration tests. |
| LIKE-1 | LUL-105 | Training completion does not unlock Story spend; review/accept/retrain and waiting Brief claims survive restart. | Native intent plus persistence/reload tests. |
| CTX-1 | LUL-106 | R1 text is exactly twelve Pages; complete Style Bible and bounded Family-owned provenance persist without raw photos. | Invalid-output/no-image-spend and reload tests. |
| IMG-1 | LUL-107 | One to three Personas produce one multi-LoRA request per Page with real selected owned inputs; no fabricated references. | Captured provider request body and bounded fan-out tests. |
| COST-1 | LUL-108 | Every payable boundary authorizes before call and records terminal outcome; a red switch prevents new paid calls across process restart. | Production composition tests with throwing provider fakes and persisted switches. |
| COST-2 | LUL-108 | The 70% P95/full-cap margin input is mandatory; omission is a refusal, not a bypass. | Focused threshold test. |
| RLS-1 | LUL-103, LUL-109 | Authenticated Family A cannot read or mutate Family B rows across every added table. | Real PostgreSQL/Supabase policy tests, not DataStore guards. |
| DEL-1 | LUL-109 | Hard-delete inventories and removes all Family rows/blobs/artifacts and is idempotent across restart; provider degradation yields a durable machine-readable limitation. | Stateful provider/blob fakes plus Supabase persistence/reload test. |
| EVID-1 | LUL-101, LUL-110 | Fake, missing, or synthetic IDs/costs can never become release-eligible; JSON credentials/media fields are redacted. | Deterministic evidence eligibility and redaction tests. |
| LIVE-1 | Human authorization gate | No paid canary/smoke runs without a new explicit cap/fixture authorization. | Commands are absent from locked deterministic verification and remain documented as blocked. |
| RLS-H1 | LUL-129 | Tests run real PostgreSQL policies as authenticated Family A/B principals; the service role is not the assertion principal. | `tests/178-supabase-rls.integration.test.ts` on an isolated PostgreSQL engine. |
| RLS-H2 | LUL-129 | One deterministic command starts and tears down an isolated local database without cloud credentials or paid/live services. | Process/database teardown assertion after the locked test. |
| RLS-H3 | LUL-129 | Missing PostgreSQL support, failed clean migration, or missing locked test is a hard failure, never a skip/no-match pass. | Clean migration and explicit harness readiness assertions. |
| ATOM-H1 | LUL-130 | Prepare/upload/finalize failure and crash injection leaves no domain row, source blob, or workflow submission after compensation. | PostgreSQL protocol test with stateful blob/workflow fakes. |
| ATOM-H2 | LUL-130 | Success atomically commits the complete Persona/Baby/bond/receipt set plus exactly one outbox event. | Transaction visibility assertions before and after finalize. |
| ATOM-H3 | LUL-130 | Retry/concurrency yields at most one finalized creation, capacity claim, and logical workflow event. | Concurrent duplicate prepare/finalize/dispatch test. |
| ATOM-H4 | LUL-130 | Adult self-consent is a durable receipt linked to the finalized Adult Persona/subject reference; a caller boolean is not authoritative. | PostgreSQL receipt linkage and revoked/absent denial tests. |
| ATOM-H5 | LUL-130 | Pending/outbox rows are Family-scoped, RLS/service-write constrained, Hard-delete discoverable, and contain no photo bytes or secrets. | Schema/RLS/inventory assertions. |

Performance/resource invariants: Page generation remains bounded concurrent work; no deterministic command performs paid network operations. Provider latency/cost targets remain evidence to collect at the blocked live gates, not values invented by CI.

Failure/recovery invariants: provider, storage, queue, and process failures terminate durably or leave an explicit retryable claim. No fallback may convert provider unavailability into production success.

Compatibility invariant: legacy five-Page Story behavior may remain for non-R1 callers, but cannot be reachable from an R1 entitlement path.

## Dependency order

```text
LUL-129 actual-PostgreSQL authenticated RLS harness
  └─> LUL-130 Persona prepare/finalize + blob compensation + outbox
       └─> LUL-103 moderation-before-persistence production wiring
            └─> LUL-104 signed webhook + owned LoRA lifecycle
       ├─> LUL-102 canonical entitlement/cap/allowance
       ├─> LUL-108 production metering + kill switches
       └─> LUL-105 durable Likeness review + Brief resume

LUL-102 + LUL-108 ─> LUL-106 persisted Story Context + exact 12-Page contract
LUL-104 + LUL-106 + LUL-108 ─> LUL-107 real multi-LoRA fanout + repair
LUL-103..LUL-108 ─> LUL-109 production RLS + Hard-delete inventory
LUL-104 + LUL-106..LUL-109 ─> LUL-101 deterministic canary readiness
LUL-101..LUL-109 ─> LUL-110 deterministic native release-gate readiness
```

The exact Linear edges and commands are in `plans/LUL-100/TICKETS.md`.

## Acceptance criteria for LUL-100 planning

- [x] LUL-100 goal is restated and bounded by ADR-0028.
- [x] LUL-101 through LUL-110 are reused; no duplicate replacement issue is introduced.
- [x] Every issue has a priority, production entry points, inherited invariants, blocker list, acceptance criteria, and a non-paid verification command.
- [x] LUL-103 then LUL-104 are the first production-risk remediation chain.
- [x] The `$10` canary and `$2` smoke are explicit blocked live-evidence gates requiring fresh authorization.
- [x] Planning artifacts contain no provider credentials, raw media, or paid operation.
- [x] The verified LUL-103 blocker is split into the smallest two prerequisite foundations: LUL-129 (real RLS harness) then LUL-130 (atomic persistence/blob/outbox protocol).
- [x] Duplicate generated Next declarations are classified as ignored transient workspace cleanup, not a tracked source prerequisite.
- [x] Corrective Linear issue descriptions, parent relationships, priorities, states, and blocking edges are written and re-read successfully.
- Commit/push verification and the exact final Linear handoff comment are recorded after remote readback; they are not self-attested inside the pre-commit artifact.

## Planner locked verification

```bash
git diff --check -- plans/LUL-100 && node -e "const fs=require('fs'); for (const f of ['PLAN.md','TICKETS.md','HANDOFF.md']) { const s=fs.readFileSync('plans/LUL-100/'+f,'utf8'); for (const id of ['LUL-129','LUL-130','LUL-103']) if (!s.includes(id)) throw new Error(f+' missing '+id); }"
```

This command validates the corrective planning artifacts without mutating the unrelated ignored Next/prototype artifacts that currently make the product-wide typecheck fail. It is deterministic and contains no live-provider smoke/canary invocation.

## Open decisions

No coding-blocking product decision remains. Two evidence decisions intentionally remain blocked on future human authorization and real results:

1. whether FLUX.2 at no more than 500 steps passes the quality/economics rubric;
2. whether the final real-provider native smoke satisfies release evidence.

Neither can be inferred from deterministic tests. If the canary fails, ADR-0028 requires reopening price, cap, Persona count, or routing before release.
