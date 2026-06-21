# 94 — Credit ledger + metering for video & custom-style overage

Triage: ready-for-agent

## Parent
PRD v12 — `CONTEXT/planning/prd-v12-release-grade-monetization-context-ux.md`. Track A.

## What to build
A per-Household **credit ledger** that meters the cost-heavy features beyond their
included allotment: **video pages** (Plus: 2 included/mo) and **custom-style trainings**
(Plus: 1 included/mo), plus re-roll overage (ADR-0004).

- Ledger with monthly included grants + purchasable credits; every metered action debits
  atomically; balance is server-authoritative.
- **Refund-on-failure:** a failed video render or style train **credits back** the debit.
- Exhaustion returns a clear "out of credits — buy more / resets on DATE" state, never a
  silent failure or a charge for a failed generation.

## Acceptance criteria
- [ ] Metered actions debit atomically; included allotments apply before purchased credits.
- [ ] **Failure invariant:** a failed video/train **refunds the credit**; **no charge for
      a failed generation** (idempotent — ADR-0011 / issue 16).
- [ ] **Security invariant:** balance is server-authoritative and cannot be escalated
      client-side; debits are idempotent under replay.
- [ ] Exhaustion surfaces a structured "out of credits" state (balance, reset date, buy CTA).
- [ ] Tests cover debit, included-before-purchased, refund-on-failure, idempotent replay,
      and the exhaustion state.

## Verification-command
```bash
npm test -- credit-ledger && tsc --noEmit
```

## Blocked by
91
