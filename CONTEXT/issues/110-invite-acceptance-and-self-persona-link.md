# 110 — Invite acceptance route + onboarding-collision fix + Self-Persona link

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track B. ADR-0024.

## What to build
`acceptInvite` is orphaned (only tests call it) and collides with `ensureFamilyForNewUser`
(a new sign-in gets its own solo Family first). Build an **accept route** that consumes the
token, creates the Member (`role: member`) in the **inviter's** Household, links them to
their Self (Adult) Persona, and **takes precedence over auto-onboarding**. Reject
expired/used/forged tokens.

## Acceptance criteria
- [ ] Accepting a valid token makes the invitee a **non-Guardian Member of the inviter's
      Household**, not a new solo Family.
- [ ] Expired / used / forged tokens are rejected; accept is single-use/idempotent.
- [ ] The accepted Member sees only that Household — cross-family read throws
      `RlsViolationError` (isolation test).

## Verification-command
```bash
npm test -- family-invite && tsc --noEmit
```

## Blocked by
109
