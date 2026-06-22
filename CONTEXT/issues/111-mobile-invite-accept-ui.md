# 111 — Mobile invite + accept UI

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track B. ADR-0024.

## What to build
Mobile UI to **attach an email to a roster person and send the invite** (Guardian-only —
wire the stubbed `sendInvite` in `mobile/app/account.tsx`/family detail to the real API),
plus an **accept screen / deep-link** that drives issue-110's accept flow.

## Acceptance criteria
- [ ] A Guardian can send an invite from mobile (real API call, not a notice stub).
- [ ] Non-guardians don't see the invite control.
- [ ] An invite link/deep-link drives the accept flow into the inviter's Household.

## Verification-command
```bash
cd mobile && npx tsc --noEmit && test -z "$(find . -name '* 2.*' -not -path '*/node_modules/*')"
```

## Blocked by
110
