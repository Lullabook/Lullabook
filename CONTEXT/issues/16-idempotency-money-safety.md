# 16 — Idempotency & money-safety hardening

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v2](../planning/prd-v2-generation-pipeline.md)
- Refs: ADR-0011, ADR-0004, ADR-0010
- Glossary: Storybook (`failed` status), Regeneration / re-roll

## What to build

Make the durable generation workflow safe under at-least-once retries, and finish
the failure semantics. Each Page becomes a sequence of discrete **memoized**
workflow steps (generate → moderate → store → persist); a successful step is
never re-executed on replay. All identifiers used inside the workflow derive
**deterministically** from `{storybookId}/{pageIndex}` (+ an attempt counter for
re-rolls) — no `uuid()` / `Date.now()` inside the workflow — so replays overwrite
the same blob key and upsert the same Page row. A deterministic **fal
idempotency key** is passed if the fal API accepts one; otherwise rare
double-spend is tolerated (no reconciliation ledger in v1).

Complete the failure model: the book flips `generating → failed` when the Claude
pass yields no Story, or fewer than a configurable **ready-Page floor** succeed.
System-caused recovery regeneration of a failed/quarantined Page is **free**;
only a parent-initiated re-roll decrements the budget/credits. A **CSAM-positive**
on a generated image escalates to the human-in-the-loop / NCMEC path (issue 05),
not a soft Page quarantine.

## Acceptance criteria

- [ ] A faked workflow replay that re-invokes a Page's steps calls fal **at most once** per Page per attempt.
- [ ] On replay, the blob key is stable and the Page row upserts — no duplicate Pages, no orphaned blobs.
- [ ] No `uuid()` / `Date.now()` is used to mint identifiers inside the workflow body.
- [ ] A deterministic fal idempotency key is sent when supported; absence degrades to tolerated rare double-spend (documented), not a crash.
- [ ] The book flips to `failed` when the Claude pass produces no Story, and when fewer than the configured ready-Page floor succeed; no partial book is presented as a draft in those cases.
- [ ] System recovery regeneration does **not** decrement the re-roll budget; a parent-initiated re-roll does.
- [ ] A faked CSAM-positive on a generated image triggers the child-safety escalation path, not a soft quarantine.
- [ ] Tested at the service seam with a fake `WorkflowAdapter` able to re-run a step; integration-test per-Page isolation + idempotency end-to-end.

## Blocked by

- 15 — Durable generation spine (single-Persona, real seams)
