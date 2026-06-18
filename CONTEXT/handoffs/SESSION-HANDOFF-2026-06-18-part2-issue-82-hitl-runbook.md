# Session Handoff — 2026-06-18: `/part2` issue 82 (HITL smoke runbook foundation)

> `/part2` implementation of **issue 82** (GH #29). Deliverable is a **markdown runbook**,
> not code — so no TDD/code change and the existing suite is **unaffected (green)**. The
> red-team pass attacked the runbook's correctness, not a code happy path.

## What was built
`CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md` — the consolidated HITL smoke runbook for PRD
v10. **§0 Foundation is complete**; per-area sections §1–§5 are scaffolded (headings +
empty results tables) for issues 83–87 to fill in.

Foundation covers issue 82's acceptance criteria:
- **§0.1 bring-up** — `npm run dev:paid` (:3001) + `npm run ios:paid` + `proxy:8081`,
  references `RUN-LOCAL.md` (not duplicated).
- **§0.2 env/secrets checklist** — real-path vars by **name only**.
- **§0.3 OAuth provider prerequisites** — Supabase Google/Apple config.
- **§0.4 dedicated test-Family setup** — dev/sample photos only; hard-delete = teardown.
- **Invariants PASS/FAIL contract**, **global results table**, **defect path** (gh command + repro template).

## Test state
No code changed (markdown only) → existing suite (**225 tests**, last green at commit
`3e87ed4`) is unaffected. No type-check/lint impact.

## Red-team pass — what it tried and found
Attacked the runbook's factual correctness (a wrong runbook is worse than none):
- **Verified true:** `dev:paid` / `ios:paid` / `proxy:8081` all exist; ADR-0020 (roster
  avatar = generated, not raw photo) and ADR-0021 (moment photos write-only) exist with the
  cited meanings; every referenced env var is in `.env.example`; schema scripts exist.
- **Defect found + fixed:** the latency invariant **"p95 < 1s" is not human-measurable** in
  a manual tap-through. Reworded to a human proxy ("settles in under ~1s; flag visible
  multi-second spinners") while keeping p95<1s as the stated engineering target.

## Honest follow-ups
- **Weak dev secret in repo (pre-existing, out of scope):** `mobile/package.json`
  `ios:paid` hard-codes `EXPO_PUBLIC_DEV_PASSWORD=SimulatorDev1!`. It's `__DEV__`-gated and
  not a production path, but it's a literal credential in version control — worth a future
  cleanup slice (move to an untracked env file).
- **Single-account isolation** stays a limited RLS check until a 2nd test account is added
  (flagged in §5 / issue 87).

## Next ready issue
**83 — HITL: auth & account** (GH #30). Blocked-by 82 is now satisfied (runbook foundation
exists). 83 fills in runbook §1. Note: real execution of these HITL sections needs a human
on the Simulator with real keys — `/part2` writes the section; a human records the pass.

## Suggested skills
- `/part2` — issue 83 (write runbook §1: auth & account).
- `hermes` / `xcode-ios-dev` — when a human actually executes the runbook.
