# 173 — Mobile Email-Plus consent flow

Triage: ready-for-agent

## Parent
PRD v20 — `CONTEXT/planning/prd-v20-monetization-r1.md`. Pillar B — the mobile surface that
clears the gate from 172. Carries **FAIL-4**, **SEC-4**.

## What to build
1. **Flow.** A mobile consent screen (reached from the "Add your baby" step and on a 403 from
   `createBaby`, issue 172): the Guardian **attests guardianship + enters their email** →
   the app calls the server to `sendConsentLink` (reusing `EmailPlusVpcService`) → the screen
   shows a "check your email" pending state and **polls / re-checks** the Household
   `consent_verified` flag → once verified, the baby-photo upload step unlocks.
2. **Contract (ADR-0018).** The "plus" second confirmation + revoke link are server behavior
   already; mobile only needs the send → pending → verified transitions. Do not render any
   raw consent PII beyond the Guardian's own email.
3. **Failure (FAIL-4).** Email send failure (Resend down) → the screen shows a **retry**, the
   Household stays **unverified**, and baby creation stays **blocked** (fail closed, SEC-4).
   Closing the app mid-flow and reopening resumes at the correct step (pending vs verified),
   never a dead end.

## Acceptance criteria
- [ ] Attest + email → `sendConsentLink` called; pending state shown.
- [ ] On `consent_verified` flipping true, the baby-photo upload step unlocks.
- [ ] FAIL-4 / SEC-4: email-send failure → retryable, stays unverified, baby creation blocked.
- [ ] Reopening mid-flow resumes at the correct step (no dead end).
- [ ] Mobile typecheck clean; `npx eslint mobile` clean.

## Verification-command
```bash
npx vitest run tests/173-mobile-consent-flow.test.ts && npm run verify
```

## Blocked by
172
