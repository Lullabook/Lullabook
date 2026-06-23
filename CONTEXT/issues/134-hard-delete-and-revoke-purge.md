# 134 — Hard-delete erases all stores + consent-revoke → purge

Triage: ready-for-agent

## Parent
PRD v14 — `CONTEXT/planning/prd-v14-r1-release.md`. Track C. ADR-0007.

## What to build
Verify/complete **Hard-delete**: Guardian-triggered, always-available, erasing ALL child data
across **every** store (photos, LoRA weights, prompts, persona metadata, generated
Storybooks). Wire consent **revoke** (from 127) to route existing child data into the same
purge.

## Acceptance criteria
- [ ] Hard-delete erases child data across every store; a test verifies nothing remains.
- [ ] Consent revoke → purge path triggers and blocks new Baby Persona creation.
- [ ] Always available to the Guardian (never gated by subscription state).

## Verification-command
```bash
npm test -- hard-delete purge && tsc --noEmit
```

## Blocked by
127
