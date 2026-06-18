# Session Handoff — 2026-06-18: `/part1` PRD v10 (HITL full-app smoke)

> `/part1` planning run — **no app code.** Produced PRD v10 + issues 82–87 (GitHub
> #29–34) for a human-executed, full-app smoke-verification wave on the local
> Simulator. Next: `/part2` from **issue 82**.

## What this effort is
The PRD v9 mobile wave (issues 75–81) shipped with green unit tests but **no recorded
end-to-end human pass**. This plan turns the owed HITL verification — widened to a
**full-app smoke** — into executable runbooks with concrete PASS/FAIL criteria.

## Locked decisions (the grill)
- **Environment:** local iOS Simulator → `npm run dev:paid` (:3001); dev gate force-unlocked.
- **Apple Sign-In caveat:** if the Simulator has no Apple ID, that one step **defers to a
  device/TestFlight** (issue 63); everything else stays local.
- **Deliverable:** one consolidated runbook `CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md`
  (written by `/part2` at issue 82) + dependency-ordered HITL issues by area.
- **Scope:** full-app smoke — every major flow, not just v9.
- **On failure:** file a **new** `bug` + `ready-for-agent` issue with runbook repro;
  closed feature issues stay closed.
- **Test data:** dedicated test Family + dev/sample photos only — never real minor photos
  / prod users; wiping it doubles as the hard-delete check.

## Invariants (the PASS/FAIL contract — full text in the PRD)
- **Latency:** generate `generating→draft` ≤ 5 min; reader page image ≤ 30s; home/API
  p95 < 1s; Moment→timeline < 2s.
- **Failure modes:** 5xx → kit error, no crash/unhandled rejection; gen failure
  re-rollable; failed Page = recoverable hole; expired token → sign-in; offline → graceful.
- **Security:** 401 on missing/invalid token; reader shows only generated illustrations
  (ADR-0020); `DEV_FORCE_SUBSCRIPTION` dev-only; hard-delete propagates DB+blob; secrets
  never committed.

## Artifacts
- **PRD:** `CONTEXT/planning/prd-v10-hitl-smoke-verification.md`
- **Issues:** `CONTEXT/issues/82`–`87` → GitHub **#29–34**

| Issue | GH | Slice | Blocked by |
|-------|----|-------|-----------|
| 82 | #29 | Foundation: runbook scaffold + test-Family setup | — |
| 83 | #30 | Auth & account (Google, Apple, session, hard-delete) | 82 |
| 84 | #31 | Family & roster (create, photo upload 70, avatars, edit 80) | 82, 83 |
| 85 | #32 | Journal / Firsts / Moments (75, 76, photo, birthday) | 82, 83, 84 |
| 86 | #33 | Storybook generate & reader real pipeline (78, 79, lullaby 73) | 82, 83, 84 |
| 87 | #34 | Cross-cutting failure & boundary sweep | 82 |

## Next agent starts at issue 82
`/part2`: issue 82 has no blockers. Note it's a **runbook-writing** slice (markdown
deliverable, no TDD code) — the `/part2` red-team pass applies to verifying the runbook's
invariants/PASS-FAIL contract are concrete, not to code.

## Suggested skills
- `/part2` — build issue 82 (write the consolidated HITL smoke runbook).
- `hermes` / `xcode-ios-dev` — when a human actually executes the runbook on Simulator.
