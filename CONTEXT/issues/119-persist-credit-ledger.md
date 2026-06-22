# 119 — Persist the credit ledger

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track C. ADR-0025.

## What to build
The credit ledger + purchased-credit balances are **in-memory Maps** (`credit-ledger.ts`)
and reset on restart, while story-cap is durable. Move the ledger + balances into the
durable DataStore so they survive restart. Keep idempotent debit/refund by
`action:idempotencyKey`; a failed metered action refunds and never blocks the Story.

## Acceptance criteria
- [ ] Credit balance + ledger **persist across restart** (durable store, not in-memory).
- [ ] Debit/refund stay idempotent; a failed metered action refunds and never blocks the
      Story.

## Verification-command
```bash
npm test -- credit-ledger && tsc --noEmit
```

## Blocked by
(none)
