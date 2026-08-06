# 208 — Run five real fal.ai LoRA trainings with watchdog reconciliation

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Run the first real trainings this project has ever performed: one FLUX LoRA per Persona for all five roster members, against live fal.ai, under the `$20` cap. Add the watchdog that reconciles a training whose callback never arrives by polling fal.ai for terminal status.

## Acceptance criteria

- [ ] Each of the five Personas completes or fails terminally within 25 minutes wall clock, and the app shows a bounded progress state throughout, never an unbounded spinner (`LAT-5`).
- [ ] A training whose callback never arrives inside the budget is reconciled by polling fal.ai for terminal status, so training never depends on the callback alone (`FAIL-4`).
- [ ] Total live fal.ai spend for the five trainings is recorded and stays under the `$20` cap, and the run halts at the `$18` checkpoint rather than continuing (`COST-1`).
- [ ] A training failure produces a durable `failed` Persona with a redacted reason and a working retry control that does not double-spend (`FAIL-3`).
- [ ] A second full five-Persona retrain round stops and asks the Guardian before it runs, and an agent never raises the cap itself (`COST-3`).
- [ ] The live run records the fal.ai request ids and actual reconciled cost per Persona to an evidence file.
- [ ] Deterministic tests cover the watchdog and the cap; the live run reports `BLOCKED` rather than `PASS` when `LIVE_PROVIDER_RUN_APPROVED` is unset (`COST-2`).

## Verification-command

```bash
npx vitest run tests/208-lora-training-watchdog.test.ts && npm run verify
```

## Blocked by

205, 207

## Invariants restated

LAT-5, FAIL-3, FAIL-4, COST-1, COST-2, COST-3

## Notes

This is the riskiest ticket in the plan: the live path has never run. Expect the first attempt to fail on credentials, ZIP shape, or callback signature. The `$20` cap and the retry budget are sized for that: about `$6` for five trainings leaves roughly `$13` of retry room.

**Target backend:** Vercel. fal.ai cannot deliver a callback to a local dev server.
