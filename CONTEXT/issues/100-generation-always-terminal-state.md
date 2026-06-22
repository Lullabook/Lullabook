# 100 — Generation always reaches a terminal state (every workflow adapter)

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track A.

## What to build
The root cause of "stuck on Illustrating forever": the "never strand in `generating`"
backstop lives only in the Inngest `storybookGenerate` function, not the
`LocalDevWorkflowAdapter`/`FakeWorkflow.drain` path the app actually runs. Move the guard
**into `StorybookService.runGeneration`/`runGenerationBody`** (or wrap `drain`) so any
throw on **any** adapter forces the book to `failed` if still `generating`. Add a watchdog
budget that marks a non-terminal book `failed`.

## Acceptance criteria
- [ ] A throw anywhere in generation leaves the Storybook in a terminal status
      (`draft` | `failed`), never `generating`, on the **local-dev adapter** (not just Inngest).
- [ ] A watchdog marks a book `failed` if it hasn't reached terminal within the budget
      (≤ ~5 min, configurable).
- [ ] Test simulates a throwing illustration/context step on the local-dev path and asserts
      a terminal status.

## Verification-command
```bash
npm test -- storybook-terminal && tsc --noEmit
```

## Blocked by
(none)
