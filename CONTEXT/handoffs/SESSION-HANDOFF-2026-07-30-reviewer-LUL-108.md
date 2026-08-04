# Part 4 Session Handoff — LUL-108 Reviewed FAIL → Debugger Ready

**Date:** 2026-07-30
**Branch:** `fix/lul-100-debugger-debugger-ready`
**Scope:** Independent review of **LUL-108** / local 183 / GitHub #157 only. No code fixes. No paid provider execution.

## Mode

- Tracker: Linear-synced; Linear authoritative; GH stage labels mirrored.
- Role: `/reviewer` reviewer (blind: diff + ticket + invariants only before verdict).

## Board moves (LUL-108 only)

| Step | Linear state | Linear stage label | GitHub #157 stage label |
| --- | --- | --- | --- |
| Claim | `Review Ready` → **`Reviewing`** | matching | `Reviewing` (removed stale Debugger Ready leftover) |
| Fail | `Reviewing` → **`Debugger Ready`** | `Debugger Ready` | `Debugger Ready` |

Readbacks:

- After claim: Linear `Reviewing` + labels `Reviewing,cost,billing,Feature`.
- After route: Linear `Debugger Ready` + labels `Debugger Ready,cost,billing,Feature`.
- GH #157: exactly one stage label `Debugger Ready` among `feature,billing,cost`.

## Gate

```bash
npx vitest run \
  tests/183-provider-cost-metering.test.ts \
  tests/183-production-spend-boundaries.integration.test.ts \
  tests/183-kill-switch-restart.integration.test.ts \
  && npm run verify
```

- Focused: **11/11 PASS**. Full verify **PASS**.

## Verdict

**FAIL** (score **68/100**, diagnostic only)  
**Bounce:** 1 of 3  
**Route:** **Debugger Ready**

### Blocking

1. **COST-1 route-key mismatch** — `PersonaService` / `CustomStyleService` authorize with synthetic endpoints (`fal.training.start`, `fal.image.generate`) and default `unknown-fal-model`, so endpoint/model red switches aimed at real fal queue routes do **not** block those paid calls. Storybook + `fal-lora-training` use real keys and are fine.
2. **Missing terminal metering** on Persona likeness/training and custom-style training — assert only, no `recordAttempt` success/failure/unknown with ownership.

### Held

Allowlisted ledger, unknown outcome, P95 authorizeSpend fail-closed API, kill-switch hydrate/restart for Family-scoped controls, Storybook + FLUX-training wiring, Hard-delete/draft safe under red.

### Advisory

- `authorizeSpend` (P95 mandatory) has no production callers; runtime is kill-switch-only.
- Production ledger estimates often `$0` until bakeoff prices land.

## Evidence

- Linear verdict comment on LUL-108.
- Production seams: `src/services/provider-cost-metering.ts`, `storybook.ts`, `persona.ts`, `custom-style.ts`, `fal-lora-training.ts`, `src/db/supabase-store.ts`, `supabase/migrations/013_*.sql`, `022_provider_cost_controls.sql`, `tests/183-*.ts`.

## What reviewer did not touch

- No product code changes.
- Did not stage parallel-debugger dirt (`CONTEXT/CONTEXT.md`, ADR drafts, `next-env.d.ts`, `.agents/`, `.codex/`, etc.).

## Next

1. Parallel `/debugger` debugger owns LUL-108 bounce.
2. `/reviewer` continues serial review on remaining **Review Ready** (LUL-109, LUL-110 at post-route re-query).

## Temp copy

`$TMPDIR/SESSION-HANDOFF-2026-07-30-reviewer-LUL-108.md`
