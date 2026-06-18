# Session Handoff — 2026-06-18: `/part2` re-run — issue 82 verification gate

> Re-ran `/part2` on **issue 82** under the **updated skill** (which now requires a
> machine-checkable done-condition, not an eyeball judgment). Per the user: **update in
> place, don't rewrite.** The runbook content was already correct from the first pass —
> this run adds the automated **gate** that proves it and guards issues 83–87.

## What changed (additive — no runbook rewrite, no app source touched)
- **New gate:** `scripts/check-hitl-runbook.mjs` + `npm run check:runbook`. Exits 0 iff
  `CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md` has all required sections and cites **no**
  nonexistent `npm run` script / repo file / `ADR-NNNN`, and pastes **no** literal secret.
- **Runbook:** added a **## Verification** section pointing at the command (so each later
  slice runs it after editing).
- **Issue 82** (`CONTEXT/issues/82-…md`): added the **Verification-command** field that the
  updated `/part1`/`/part2` skills expect.
- **package.json:** added `check:runbook` script.

## Is it "better"? (the point of the re-run)
Yes — the deliverable moved from "looks right" to **"proven right by a command."** Before,
correctness rested on my manual red-team. Now there's a runnable done-condition that also
catches *future* drift as issues 83–87 extend the runbook.

## Red-team pass (this run targeted the gate, not the runbook)
A green checker that can't catch faults is theater, so I fault-injected and confirmed it
**FAILs correctly** on all five classes, then passes clean on the pristine file:
1. missing required section ✓ caught
2. `npm run` script that doesn't exist ✓ caught
3. referenced repo file that doesn't exist ✓ caught
4. `ADR-9999` with no doc ✓ caught
5. a committed `SUPABASE_SERVICE_ROLE_KEY=<value>` ✓ caught

## Test / gate state
- `npm run check:runbook` → **exit 0**.
- No app source changed (standalone Node script + one package.json line + markdown) →
  existing vitest suite (225) unaffected.

## Honest follow-ups
- The gate's env-var check is intentionally **not** enforced (dev-only vars like
  `EXPO_PUBLIC_DEV_*` / `DEV_FORCE_SUBSCRIPTION` aren't in `.env.example`, so a strict check
  would false-positive). Names-only discipline for secrets is covered by check #5 instead.
- Pre-existing weak dev password literal in `mobile/package.json` still stands (logged last run).
- Issues **83–87** were created before the `/part1` Verification-command rule; they don't yet
  carry one. When `/part2` picks each up, derive its gate (extend `check:runbook` or add a
  section assertion) — or backfill a Verification-command line first.

## Next ready issue
**83 — HITL: auth & account** (GH #30). Blocked-by 82 satisfied. Run `npm run check:runbook`
after writing runbook §1.

## Suggested skills
- `/part2` — issue 83 (write runbook §1; extend the gate to cover it).
