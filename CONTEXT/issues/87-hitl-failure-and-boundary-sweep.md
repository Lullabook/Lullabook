# 87 — HITL: cross-cutting failure & boundary sweep

Triage: ready-for-agent (HITL)

## Parent
PRD v10 — `CONTEXT/planning/prd-v10-hitl-smoke-verification.md`

## What to build
The final sweep of the smoke runbook: deliberately exercise the failure modes and
security boundaries from the PRD invariants, rather than the happy path. This mirrors the
`/part2` red-team intent at the manual-test level.

- **Backend down / 5xx:** stop `dev:paid` (or force a 500) mid-flow; confirm screens show
  an in-screen error via the kit (`C.danger`) with **no crash and no unhandled promise
  rejection**.
- **Offline:** disable networking; confirm graceful, retryable error states (not white
  screens / infinite spinners).
- **Auth boundary:** with no/expired token, confirm protected Bearer endpoints return
  **401** and the app routes to sign-in; no protected data renders without auth.
- **Dev-gate check:** confirm `DEV_FORCE_SUBSCRIPTION` is the only reason the paywall is
  bypassed locally, and note that it must never ship enabled.
- **Isolation note:** record that single-account smoke is a **limited** RLS check; true
  cross-Family isolation needs a second test account (flag as a follow-up, not a blocker).

## Acceptance criteria
- [ ] Backend-down and offline states render kit errors with no crash / no unhandled rejection.
- [ ] Missing/expired token → 401 + routed to sign-in; no protected data leaks.
- [ ] The dev subscription bypass is confirmed dev-only and documented as never-ship.
- [ ] The single-account isolation limitation is recorded as a follow-up.
- [ ] Each step recorded PASS/FAIL; any FAIL filed as a `bug` issue with repro.

## Blocked by
82
