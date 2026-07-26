# 178 — Create Family people, Babies, bonds, and Personas atomically behind consent and moderation

Triage: ready-for-agent

> **Coder update 2026-07-24 — PRODUCTION PROTOCOL + ADULT SELF-CONSENT PUSHED.**
> The production native flow now uses the atomic protocol via Supabase RPC:
> source-photo moderation before persistence, Adult liveness, durable outbox
> dispatch, finalized-event LoRA training. RLS tested against real PostgreSQL.
> Adult self-consent is durable (SQL `consent_receipts`). Commits `f1cfac1`,
> `2d6c826`. Full suite 844/844 passes.

## Parent

PRD v21 — GitHub issue #149; `CONTEXT/planning/prd-v21-r1-family-persona-story-economics.md`.


## What to build

Deliver one end-to-end native creation flow that persists the selected Person, optional Baby, relationship/nickname bonds, Persona, and safe generated-avatar state atomically. Verified parental consent gates Baby Personas; self-consent gates Adult Personas; moderation occurs before durable source-photo persistence or provider submission. Fix production schema/RLS round-tripping required by that flow.

## Acceptance criteria

- [ ] The native relationship and nickname fields round-trip and the selected Baby/Person bonds are created in the same use case.
- [ ] Absent, revoked, expired, or wrong-jurisdiction consent rejects Baby Persona creation with no partial rows or blobs.
- [ ] Adult Persona creation requires self-consent and cannot reuse a Guardian attestation as the subject’s consent.
- [ ] Source photos are moderated before durable persistence/training; rejected photos leave no owned blob.
- [ ] Consent method and every accepted lifecycle status round-trip through the production schema.
- [ ] Roster responses return a neutral or generated Roster avatar, never the raw uploaded photo.
- [ ] Database RLS protects all new/updated Family-owned rows.

## Verification-command

```bash
npx vitest run tests/178-atomic-consent-safe-persona.test.ts tests/rls-isolation.test.ts && npm run verify
```

## Blocked by

- GitHub issue #151 (local ticket 177)
