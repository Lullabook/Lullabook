# 109 — Invite token model + email send

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track B. ADR-0024.

## What to build
The `invites` table has no token/expiry/role/status — acceptance keys off the raw PK and
no email is sent. Extend the invite domain + table with an **opaque single-use token**, an
**expiry**, a fixed **role (`member`)**, and **status**; have `FamilyService.inviteMember`
mint the token and **send the invite email via the existing Resend adapter** (mirror the
Email-Plus VPC token+confirm pattern).

## Acceptance criteria
- [ ] An invite persists with token / expiry / role(`member`) / status; the token is an
      opaque secret distinct from the PK.
- [ ] Inviting sends an email with the accept link via Resend.
- [ ] Only a Guardian can invite (rejects non-guardian); the role can't be attacker-chosen.

## Verification-command
```bash
npm test -- family-invite && tsc --noEmit
```

## Blocked by
(none)
