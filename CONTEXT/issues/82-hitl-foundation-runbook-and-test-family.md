# 82 — HITL foundation: smoke runbook scaffold + test-Family setup

Status: shipped

Produced `CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md` (env bring-up, secrets checklist by
name only, OAuth provider prerequisites, dedicated dev-only test-Family setup, global
PASS/FAIL results table, defect-filing path) plus the machine-checkable gate `npm run
check:runbook` (`scripts/check-hitl-runbook.mjs`) verifying required sections, no
nonexistent refs, no literal secrets. This is the scaffold issues 83-87 were meant to
fill in; the doc and gate both still exist and pass, but §1-§5 were never filled (see 83-85).

(condensed 2026-07-07 — full spec in git history)
