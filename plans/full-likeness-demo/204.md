# 204 — Enforce the $20 live fal.ai spend cap fail-closed

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Make the authorized `$20` live fal.ai budget a hard, enforced ceiling rather than a dashboard number. Every payable fal.ai attempt reserves its estimated cost from `PROVIDER_PRICE_TABLE` before the provider boundary. Cumulative reserved spend is persisted. Crossing the cap blocks the attempt. Crossing a `$18` warning threshold emits an observable checkpoint telling the Guardian to raise the cap.

## Acceptance criteria

- [ ] A payable fal.ai attempt whose estimated cost would push cumulative live spend above `$20` is rejected before the provider boundary and reserves nothing (`COST-1`).
- [ ] An attempt on a route absent from `PROVIDER_PRICE_TABLE` is rejected, never priced as zero (`COST-1`).
- [ ] Cumulative live spend at or above `$18` emits a `spend_checkpoint` observability event naming the remaining budget.
- [ ] A live fal.ai call attempted without `LIVE_PROVIDER_RUN_APPROVED` set is rejected before the provider boundary (`COST-2`).
- [ ] A failed provider attempt releases its reservation, so failures cannot silently exhaust the cap.
- [ ] The cap value is read from configuration, so raising it needs a deliberate change, not a code edit.

## Verification-command

```bash
npx vitest run tests/204-live-spend-cap.test.ts && npm run verify
```

## Blocked by

none

## Invariants restated

COST-1, COST-2

## Notes

This ticket exists because the budget is `$20`, not because the burn is expected to be large. Five trainings plus a few Storybooks is roughly `$10`; the cap protects against a retry loop.

**Target backend:** Vercel.
