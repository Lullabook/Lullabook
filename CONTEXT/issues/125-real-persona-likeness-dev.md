# 125 — Real persona likeness in dev + real likeness-confirmation gate

Triage: ready-for-agent

## Parent
PRD v14 — `CONTEXT/planning/prd-v14-r1-release.md`. Track A.

## What to build
Replace the faked `FakeWorkflow.waitForEvent`-synthesized `ready` (audit: personas show
`ready` with non-functional LoRA keys) so a persona in dev reaches `ready` with a usable LoRA
(or an explicit `DEV_FAL_FALLBACK` placeholder), and make the **likeness confirmation** step
(review sample generations → accept / retrain) real and gating before any book spend.

## Acceptance criteria
- [ ] In dev a created Baby Persona reaches `ready` with a usable/placeholder LoRA, not a
      dangling key.
- [ ] Likeness confirmation renders samples and **gates** generation — a book cannot be
      generated from an unconfirmed persona.
- [ ] LoRA training failure → persona `failed`, surfaced, **no book charge** (invariant);
      SLA < 15 min to `ready`/`failed`.

## Verification-command
```bash
npm test -- persona likeness && tsc --noEmit && (cd mobile && npx tsc --noEmit)
```

## Blocked by
122
