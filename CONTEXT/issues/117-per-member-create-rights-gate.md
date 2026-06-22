# 117 — Per-member create-rights gate

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track C. ADR-0025.

## What to build
Today create-rights are Household-only (`requireEntitled`); there is no per-member gate. Add
`EntitlementService.requireCanCreate(familyId, actorMemberId)` — **Just Us → Guardian only;
Our Whole Family → any Member** — and wire it into `StorybookService.generate` /
`generateFromClassic` right after `requireEntitled`. The actor `memberId` comes from the
verified Bearer JWT, never the request body.

## Acceptance criteria
- [ ] On Just Us, a non-Guardian Member is blocked (403) from generating; on Our Whole
      Family any Member may generate.
- [ ] Create-rights resolve server-side from plan + role, never from client state.

## Verification-command
```bash
npm test -- create-rights && tsc --noEmit
```

## Blocked by
116
