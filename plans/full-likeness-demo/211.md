# 211 — Illustrate twelve Pages with real multi-Persona likeness

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Generate the twelve Page illustrations using the confirmed per-Persona LoRAs, including Pages containing two or more family members in one scene. This is the ADR-0005 composition gate, now with five real LoRAs. Repair only the Pages that fail, within budget.

## Acceptance criteria

- [ ] Every Page reaches a terminal state, and the Storybook reaches `draft` or `failed` within the watchdog (`FAIL-1`).
- [ ] At least one Page composes two or more confirmed Personas in a single scene, satisfying the ADR-0005 composition gate.
- [ ] Full twelve-Page generation completes p95 under 90 seconds once Personas are ready (`LAT-3`).
- [ ] A failed Page triggers bounded selective repair, and the repair count per Storybook is capped so a repair loop cannot exhaust the budget (`COST-1`).
- [ ] A Storybook whose images partly fail still reaches a text-viewable `draft`, never an unbounded `generating` state (`FAIL-1`).
- [ ] Total live fal.ai illustration spend per Storybook is recorded and priced from `PROVIDER_PRICE_TABLE` before the provider boundary (`COST-1`).

## Verification-command

```bash
npx vitest run tests/211-multi-persona-illustration.test.ts && npm run verify
```

## Blocked by

210

## Invariants restated

LAT-3, FAIL-1, COST-1

## Notes

ADR-0005 calls multi-LoRA composition the riskiest, least-proven part of the pipeline. Budget repair attempts accordingly.

**Target backend:** Vercel.
