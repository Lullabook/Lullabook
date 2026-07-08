# 88 — Verify Add-Family photo upload on iOS Simulator (issue-70 gate)

Status: shipped

Gate-0 for the PRD v10 HITL wave (blocks 83–87): added the FormData-builder unit test
(`tests/mobile-form-data.test.ts`) and extended `scripts/check-hitl-runbook.mjs` to
require a §2.x Add-Family issue-70 step in the runbook — both shipped in the PRD v12
wave (commit `8d663e4`, "feat(92-99,88)").
Invariants: `POST /api/personas` returns 202 within 10s for ≤6 photos; uploaded photo
lives in the Family-scoped blob store; only the generated `RosterAvatar` renders, never
the raw photo (ADR-0020/0021); missing/invalid Bearer → 401.
The manual Simulator HITL recording (§2.x result rows) was left blank in the
runbook — machine-checkable proxy passed, human recording unconfirmed.

(condensed 2026-07-07 — full spec in git history)
