# 127 — Email-Plus VPC flow (gates Baby Persona on iOS)

Triage: ready-for-agent

## Parent
PRD v14 — `CONTEXT/planning/prd-v14-r1-release.md`. Track B. ADR-0008 / ADR-0018.

## What to build
Email-Plus Verifiable Parental Consent end to end: Guardian attests guardianship + enters
email → backend sends a **notice-versioned, single-use** consent link → Guardian confirms →
Family flagged `consent_verified` + version-stamped **consent receipt** → delayed second
"revoke" email. **Server-gates Baby Persona creation** (Apple IAP can't prove payer identity,
so card-on-file ≠ consent on iOS).

## Acceptance criteria
- [ ] Full flow works; Baby Persona creation is **blocked server-side** until `consent_verified`.
- [ ] Link is single-use + notice-versioned; expired/used/forged → rejected. Email send
      failure → consent not granted, retryable (invariant).
- [ ] Revoke link clears `consent_verified` → blocks new Baby Personas + routes child data to
      the purge path (ADR-0007).
- [ ] Consent receipt stored (who consented, when, notice version).

## Verification-command
```bash
npm test -- consent vpc && tsc --noEmit
```

## Blocked by
—
