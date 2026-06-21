# 92 — RevenueCat Apple IAP + 7-day trial as VPC (ADR-0023, ADR-0018, ADR-0008)

Triage: ready-for-agent

## Parent
PRD v12 — `CONTEXT/planning/prd-v12-release-grade-monetization-context-ux.md`. Track A.

## What to build
Purchase + entitlement sync via **RevenueCat Apple IAP**, with the **7-day free trial of
Normal** as the entry — and the trial's **card-on-file = the VPC** (ADR-0008 as updated).
Supersedes/extends issue 25.

- RevenueCat product config for Basic/Normal/Plus (monthly; annual carries forward) +
  the Normal trial offer. Validate receipts; map the active entitlement to issue 91's model.
- **Starting the trial requires a payment method** — this is the VPC gate; no child
  likeness (Family-member/baby photo upload) is permitted without it.
- Cache the last-known entitlement so a RevenueCat outage degrades gracefully.

## Acceptance criteria
- [ ] Trial/purchase round-trip maps to the correct server entitlement (faked RevenueCat
      adapter in tests).
- [ ] **Security invariant (cornerstone):** **no child likeness without a card-on-file
      VPC** — baby/Family-member photo upload is blocked until a paid entry (incl. trial)
      exists.
- [ ] **Failure invariant:** RevenueCat down / receipt validation fails → keep last-known
      cached entitlement, **no crash**, retry; surface only if unconfirmable.
- [ ] **Latency invariant:** entitlement check **<300ms** cached and never blocks render.
- [ ] No secrets committed — RevenueCat keys referenced by env-var name only.
- [ ] Tests cover trial→entitlement, the VPC upload-block, and the outage-degrade path.

## Verification-command
```bash
npm test -- revenuecat && tsc --noEmit
```

## Blocked by
91
