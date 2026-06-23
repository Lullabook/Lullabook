# 128 — RevenueCat IAP: trial start + server-authoritative entitlement

Triage: ready-for-agent

## Parent
PRD v14 — `CONTEXT/planning/prd-v14-r1-release.md`. Track B. ADR-0018.

## What to build
Apple IAP via RevenueCat: start the **7-day trial**, flip the **Household-level** entitlement
**server-side** on purchase (webhook/receipt verification), support **restore-purchases**, and
verify in the IAP sandbox. Entitlement is the source of truth; client UI is never trusted.

## Acceptance criteria
- [ ] Trial start via IAP flips the Household entitlement server-side; restore-purchases works.
- [ ] Purchase failure → entitlement does **not** flip; clear error surfaced (invariant).
- [ ] Entitlement check < 300ms, server-side; validated in IAP sandbox.

## Verification-command
```bash
npm test -- entitlement iap && tsc --noEmit
```

## Blocked by
—
