# 177 — Enforce the accepted R1 Family and Just Us plan invariants

Triage: ready-for-agent

## Parent

PRD v21 — GitHub issue #149; `CONTEXT/planning/prd-v21-r1-family-persona-story-economics.md`.


## What to build

Make one server-authoritative plan definition drive entitlement, paywall copy, mobile usage display, and API enforcement: one creating Guardian Member, no invitations, up to three trained Personas in any Adult/Baby mix, up to three starring Personas per Storybook, four completed Storybooks per monthly reset, and the accepted `$14.99/month` / `$119.99/year` prices. Remove the one-Baby restriction without enabling extra Member logins or collaboration.

## Acceptance criteria

- [ ] A Family can create multiple Babies and Adult Personas until the shared three-Persona cap; the fourth is rejected before persistence/training.
- [ ] Persona kind does not change the shared cap, and Story allowance never multiplies by Persona count.
- [ ] Only the Guardian Member can create in R1; invite/accept/collaborative routes remain inert.
- [ ] Paywall, entitlement, Story cap, API responses, and native usage UI all expose one consistent price/cap definition.
- [ ] A Story allowance is reserved at enqueue, committed after valid Story text, released when text generation fails, and not charged again for Page repair.
- [ ] Existing active subscriptions and legacy tier mapping remain readable through an explicit migration/compatibility decision.

## Verification-command

```bash
npx vitest run tests/177-r1-family-plan-entitlement.test.ts && npm run verify
```

## Blocked by

- GitHub issue #150 (local ticket 176)
