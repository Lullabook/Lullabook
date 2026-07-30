# Part 4 Session Handoff — LUL-105 Graded FAIL → Agent Ready

**Date:** 2026-07-30
**Branch:** `fix/lul-100-part3-debugger-ready`
**Scope:** Independent grade of **LUL-105** / local 180 / GitHub #154 only. No code fixes. No live provider or paid execution.

## Mode

- Tracker: Linear-synced (`VrajGupta/Lullabook`), Linear state authoritative; GitHub stage labels mirrored after canary (from LUL-101 lap).
- Role: `/part4` grader.
- Judge independence: separate model/context from the producer session. Verdict formed from **diff + ticket + PLAN invariants** only (no author/debugger handoff before the verdict).

## Queue at claim

Grading Ready (lowest first after LUL-101 Done):

1. **LUL-105** (claimed → graded FAIL)
2. (re-query after route)

Debugger Ready / Debugging left to the parallel debugger; not graded here.

## Board moves (LUL-105 only)

| Step | Linear state | Linear stage label | GitHub #154 stage label |
| --- | --- | --- | --- |
| Claim | `Grading Ready` → **`Grading`** | `Grading Ready` → **`Grading`** | `Grading Ready` → **`Grading`** |
| Fail | `Grading` → **`Agent Ready`** | `Grading` → **`Agent Ready`** | `Grading` → **`Agent Ready`** |

Readbacks:

- Linear after claim: `status: Grading`, labels include `Grading`.
- Linear after route: `status: Agent Ready`, labels `Agent Ready`, `native`, `Bug` (no residual `Grading`).
- GH #154 after route: exactly one stage label `Agent Ready` (plus `bug`, `native`). Issue remains OPEN.

## Gate

```bash
npx vitest run \
  tests/180-likeness-readiness-cold-start.test.ts \
  tests/180-brief-resume-restart.integration.test.ts \
  tests/180-native-retrain-intent.test.ts \
  tests/180-derivative-atomicity.integration.test.ts \
  && npm run verify
```

- Focused suite: **4 files / 11 tests PASS**.
- `npm run verify`: root+mobile TypeScript, full Vitest, Sentry automation, dead-surface, deterministic seed **PASS**. Playwright skipped (no server).

## Verdict

**FAIL** (score **58/100**, diagnostic only)  
**Bounce:** 1 of 3  
**Route:** **Agent Ready**

### Blocking findings

1. **`ColdStartService.onPersonaReady` has no production caller** (`src/services/cold-start.ts:52`). Only tests invoke it. After native accept (`accept-likeness` route / `acceptLikenessAction`), likeness flips true but waiting `pending_briefs` stay `pending` — automatic resume never runs. Violates ticket AC + LIKE-1 resume limb.
2. **`app_claim_pending_brief` (migration 021) is never RPC'd from `src/`**. Claim path is in-memory map + unit-of-work `persist()` only; concurrent durable claim not composed (FAIL-1 partial).

### Held

- Training → samples + avatar without Story spend unlock (`likenessConfirmed !== true` gate).
- Native accept/retrain auth boundaries + ImagePicker retrain intent.
- Replacement derivative atomicity (preserve accepted likeness; purge staging).

### Advisory

- Resume tests are service-unit and mask the missing wire.
- accept-likeness route comment still says Guardian-only for adults; service is subject-aware.

## Evidence locations

- Verdict comment on Linear LUL-105 (synced GH #154 thread).
- Implementation under grade: `src/services/cold-start.ts`, `src/services/persona.ts`, `src/services/storybook.ts`, `src/db/supabase-store.ts`, `supabase/migrations/021_likeness_resume_durability.sql`, `mobile/app/likeness/[id].tsx`, locked `tests/180-*.ts`.

## What this grader did **not** touch

- No product code changes.
- Did not stage parallel debugger dirty files.
- Did not grade LUL-106 / LUL-108 / others; next lap re-queries **Grading Ready**.

## Next for the fleet

1. Coder picks LUL-105 from **Agent Ready**: wire resume after accept (and any multi-persona readiness signal), compose durable claim RPC, add accept→resume integration test that fails if Brief stays pending.
2. Continue serial `/part4` on remaining **Grading Ready**.
3. Parallel `/part3` may keep draining Debugger Ready.

## Temp copy

Mirrored to `$TMPDIR/SESSION-HANDOFF-2026-07-30-part4-LUL-105.md` for cross-agent pickup.
