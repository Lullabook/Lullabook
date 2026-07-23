# LUL-100 — Production-path remediation plan for R1 Family/provider spine

LUL-100 must turn the already-implemented R1 Family, Persona, Story Context, provider, and unit-economics spine into a production-wired, independently verifiable system without treating the green fake/in-memory suite as release evidence. This plan reuses audited Linear issues LUL-101 through LUL-110, closes the two live production-risk boundaries first (moderation before persistence in LUL-103, then signed fal callbacks in LUL-104), and keeps every paid provider canary/smoke behind a separate fresh authorization gate.

## Scope and planning basis

- Parent: LUL-100, currently the oldest `Agent Ready` issue in the Lullabook queue.
- Existing implementation set: LUL-101 through LUL-110, mapped to local tickets 176–185. These issues are reused; no duplicate replacements are created.
- Decision source: ADR-0028.
- Audit source: `CONTEXT/handoffs/DEBUG-AUDIT-2026-07-21-r1-176-185.md`.
- Production vocabulary source: `CONTEXT/CONTEXT.md`.
- Planning branch: `feat/prd-v20-pillar-a-payment`.
- Planning-only restriction: no application code, provider canary, provider smoke, paid/live provider request, deployment, publication, or PR operation is in this planner run.

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

### D2 — Safety and webhook security are the first remediation chain

The first runnable production-risk sequence is:

1. LUL-103 / 178: native action and workflow use moderation-before-persistence atomic creation.
2. LUL-104 / 179: training submission and the deployed fal webhook use authenticated, idempotent, owned-artifact lifecycle handling.

LUL-103 has no blocker. LUL-104 is blocked only by LUL-103. Broader entitlement consolidation follows without delaying closure of these two live boundaries.

### D3 — Durable claims, not read-then-write checks

Persona capacity, callback receipts, Brief resume, allowance reservations, and deletion completion require database-authoritative claims/transactions with unique constraints or compare-and-set semantics. Process-local sets/maps may cache state but cannot be the authority.

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

Performance/resource invariants: Page generation remains bounded concurrent work; no deterministic command performs paid network operations. Provider latency/cost targets remain evidence to collect at the blocked live gates, not values invented by CI.

Failure/recovery invariants: provider, storage, queue, and process failures terminate durably or leave an explicit retryable claim. No fallback may convert provider unavailability into production success.

Compatibility invariant: legacy five-Page Story behavior may remain for non-R1 callers, but cannot be reachable from an R1 entitlement path.

## Dependency order

```text
LUL-103 moderation-before-persistence atomic production path
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
- [ ] Planning artifacts are committed, pushed, and verified on the configured remote.
- [ ] Linear issue descriptions/relationships/states and the parent handoff comment are written and re-read successfully.

## Planner locked verification

```bash
git diff --check -- plans/LUL-100 && npm run verify
```

This command is deterministic and contains no live-provider smoke/canary invocation.

## Open decisions

No coding-blocking product decision remains. Two evidence decisions intentionally remain blocked on future human authorization and real results:

1. whether FLUX.2 at no more than 500 steps passes the quality/economics rubric;
2. whether the final real-provider native smoke satisfies release evidence.

Neither can be inferred from deterministic tests. If the canary fails, ADR-0028 requires reopening price, cap, Persona count, or routing before release.
