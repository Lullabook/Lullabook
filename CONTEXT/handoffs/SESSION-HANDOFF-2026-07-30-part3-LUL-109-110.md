# Debugger handoff — LUL-109 / LUL-110

**Date:** 2026-07-30  
**Branch:** `fix/lul-100-part3-debugger-ready`  
**Pipeline state:** both tickets have been moved to **Grading Ready** in Linear and read back successfully. GitHub Issues Sync is enabled; no GitHub issue write was made.

## Completed

### LUL-109 — RLS isolation and Hard-delete

**Commit:** `7d3d84c fix(delete): erase family provider controls`

- Family Hard-delete removes provider-cost-ledger entries and Family-scoped provider kill switches in the in-memory unit of work.
- Supabase sync now deletes snapshot-missing ledger/control rows, preserving append-only behavior for normal flows while propagating the explicit hard-delete exception.
- Deletion reports count ledger rows under `deleted.database.providerCostLedger`; no report claims cost evidence was retained.
- Provider-deletion failures use a stable, non-sensitive limitation message instead of provider error text that could include signed URLs or tokens.
- A new request unit receiving a repeat deletion of an already-erased member produces an empty, non-disclosing idempotent report.
- Added durable Supabase inventory tests proving only the deleted Family's cost/control rows disappear; PostgreSQL RLS tests prove a constrained Family A principal cannot select/update/delete Family B provider records.

**Verified:**

```bash
npx vitest run tests/184-provider-artifact-delete-rls.test.ts tests/184-supabase-artifact-inventory.integration.test.ts tests/184-hard-delete-restart.integration.test.ts tests/184-authenticated-rls.integration.test.ts && npm run verify
```

Result: **4 files / 7 tests passed**; `npm run verify` passed. Playwright was skipped because no server is configured.

### LUL-110 — production-like R1 provider release gate

**Commit:** `4bb94c8 fix(release): fail closed on incomplete evidence`

- Provider evidence now carries explicit provenance; absent provenance is deterministic and cannot count as real-provider evidence.
- A successful operation now requires a non-synthetic request ID and exact provider/endpoint/model/pricing-version match, finite non-negative duration, and actual cost inside the operation cap.
- Missing or mismatched evidence becomes failed evidence; duplicated request IDs, non-real provenance, incomplete checklists, and failed operations prevent release eligibility.
- Flow checklist state reflects the three actually executed harness operations rather than falsely reporting all 16 entries as permanently pending success. The remaining 13 stages make release evidence unavailable.
- Report-log redaction recursively removes nested structured credentials, tokens, prompts, photo/image/media fields and strips provider URLs from both structured and text log forms.
- Added deterministic operation accounting/failure tests plus redaction and missing-ID tests.

**Verified:**

```bash
npx vitest run tests/185-r1-provider-e2e-gate.test.ts tests/185-production-composition.integration.test.ts tests/185-release-evidence-redaction.test.ts && npm run verify
```

Result: **3 files / 12 tests passed**; `npm run verify` passed. Playwright was skipped because no server is configured.

## Live-provider safety boundary

No paid provider commands were run and no release evidence was created:

```text
DO NOT RUN: LIVE_PROVIDER_BUDGET_USD=10 npm run smoke:provider-bakeoff
```

```text
DO NOT RUN: LIVE_PROVIDER_BUDGET_USD=2 npm run smoke:r1-provider-e2e
```

The R1 smoke remains explicitly blocked pending a new user authorization. The hardened gate will remain blocked until a real adapter executes every checklist stage and produces valid, unique, fully redacted evidence.

## Tracker receipt

- **LUL-109** — `Grading Ready`, labels: `Grading Ready`, `rls`, `Feature`.
- **LUL-110** — `Grading Ready`, labels: `Grading Ready`, `release-gate`, `native`, `Feature`.
- Both tickets have an evidence comment containing the commit, exact passing command, and the live-smoke prohibition.

## Working-tree note

This handoff deliberately does not include unrelated existing work:

- modified: `CONTEXT/CONTEXT.md`, `CONTEXT/docs/adr/0028-r1-family-persona-provider-economics.md`, `next-env.d.ts`
- untracked: `.agents/`, `.codex/`, `CONTEXT/handoffs/DEBUG-AUDIT-2026-07-21-r1-176-185.md`, `codex-native-selector/`

No push, pull request, deployment, or live provider invocation was performed.
