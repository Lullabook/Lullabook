# Session Handoff — 2026-06-18: `/part1` PRD v10 (HITL full-app smoke)

Status: historical

Planning-only `/part1`: PRD v10 (`CONTEXT/planning/prd-v10-hitl-smoke-verification.md`) +
issues 82–87 (GH #29–34) — a human-executed full-app smoke wave driven by one consolidated
runbook, `CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md`.

- Binding invariants (PASS/FAIL contract): generate `generating→draft` ≤5 min; reader page image ≤30s; home/API p95 <1s; Moment→timeline <2s; 5xx → kit error, never crash; failed Page = recoverable hole; 401 on missing/invalid token; reader shows only generated illustrations (ADR-0020); `DEV_FORCE_SUBSCRIPTION` dev-only; hard-delete propagates DB+blob.
- Binding: HITL test data = dedicated test Family + dev/sample photos only — never real minor photos or prod users; wiping it doubles as the hard-delete check.
- On HITL failure: file a new `bug` + `ready-for-agent` issue with runbook repro; closed feature issues stay closed.

(condensed 2026-07-07 — full text in git history)
