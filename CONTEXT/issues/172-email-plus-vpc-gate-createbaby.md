# 172 — Email-Plus VPC gate on Baby Persona creation (close the COPPA hole)

Triage: ready-for-agent

## Parent
PRD v20 — `CONTEXT/planning/prd-v20-monetization-r1.md`. Pillar B root (independent of Pillar
A). Carries **SEC-3**, **SEC-4**. [ADR-0008](../docs/adr/0008-verifiable-parental-consent.md) /
[ADR-0018](../docs/adr/0018-native-ios-app-iap-and-email-plus-vpc.md).

## What to build
1. **Diagnose the hole first.** Confirm (with a failing test) that today
   `PersonaService.createBaby` accepts baby photos and starts a LoRA train with **no**
   `consent_verified` check — a Baby Persona (minor biometric data) is creatable without VPC.
2. **Gate.** Add `requireConsentVerified(familyId)` (in `EntitlementService` or
   `ConsentEngine`, wherever the Household `consent_verified` flag is authoritative) and call
   it at the **start** of `createBaby` — before any photo is accepted or persisted. An
   unverified Household → **403** (structured, with the consent CTA), **no partial Persona**,
   **no photos stored**, **no train started** (SEC-3).
3. **Fail closed (SEC-4).** If the consent-engine read errors, `createBaby` **denies** (never
   permits). Adult Persona (self-consent, ADR-0014) and the photo-free Character tier are
   **unaffected** — this gate is Baby-Persona-only.
4. **Orthogonal to payment (ADR-0018).** This check is independent of the subscription gate:
   payment does not satisfy consent and consent does not satisfy payment. Both are required
   before a baby's photos are accepted, in either order.

## Acceptance criteria
- [ ] SEC-3: `createBaby` on an **unverified** Household → 403; no Persona row, no stored
      photo, no LoRA train (asserted by a test that inspects the store after the reject).
- [ ] A Household flagged `consent_verified` can create a Baby Persona (happy path unchanged).
- [ ] SEC-4: a consent-engine read error → `createBaby` denies (fail closed).
- [ ] Adult Persona + Character creation paths are unaffected (regression test).
- [ ] Existing suite green; root typecheck clean.

## Verification-command
```bash
npx vitest run tests/172-consent-gate-createbaby.test.ts && npm run verify
```

## Blocked by
_none_
