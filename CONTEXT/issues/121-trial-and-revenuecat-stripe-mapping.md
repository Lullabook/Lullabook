# 121 — Trial-of-Family + RevenueCat/Stripe product mapping + inherit-on-login

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track C. ADR-0025.

## What to build
Map **one Stripe price + one RevenueCat product per plan**. The 7-day card trial (= VPC)
activates the **full (Our Whole Family) experience**; converting picks a plan (annual
default). Invited Members **inherit** the Household entitlement on login (no own purchase),
since `app_user_id = familyId` already. De-dup if both rails write the same `familyId`
subscription (last-write-wins today).

## Acceptance criteria
- [ ] The trial (card required = VPC) activates the full experience; conversion picks a
      plan, annual pre-selected.
- [ ] An invited Member logging in **inherits** the Household plan (no IAP purchase of their
      own).
- [ ] Webhook activation is idempotent + Household-keyed; cross-rail de-dup holds.

## Verification-command
```bash
npm test -- revenuecat purchase && tsc --noEmit
```

## Blocked by
116, 110
