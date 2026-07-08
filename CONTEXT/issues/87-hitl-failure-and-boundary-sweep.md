# 87 — HITL: cross-cutting failure & boundary sweep

Status: shipped (assumed — see git history)

Manual HITL sweep (PRD v10) of failure modes/security boundaries: backend-down/5xx and
offline show in-screen kit errors with no crash/unhandled rejection; missing/expired
token → 401 + routed to sign-in; `DEV_FORCE_SUBSCRIPTION` confirmed dev-only/never-ship;
single-account smoke flagged as a limited RLS check (true cross-Family isolation needs a
2nd account).
This doc's own PASS/FAIL rows in `HITL-SMOKE-RUNBOOK.md` §5 were left blank — the manual
sweep itself is unconfirmed, though the underlying error-handling invariants persisted
through later hardening waves.

(condensed 2026-07-07 — full spec in git history)
