# 118 — Enforce the monthly Story cap at generation

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track C. ADR-0025.

## What to build
`StoryCapService.requireUnderCap` is **never called** in production — the monthly cap is
computed/displayed but not enforced. Wire `requireUnderCap(familyId, memberId)` into the
generate path. The cap is a **single shared per-Household pool** across all creators and
must stay idempotent (distinct-by-id count) and reset monthly.

## Acceptance criteria
- [ ] Generation beyond the plan's monthly cap is rejected (403) with a "N/N used, resets
      DATE" payload; multiple creators draw **one shared Household pool**.
- [ ] The cap is idempotent under replay; resets monthly.

## Verification-command
```bash
npm test -- story-cap && tsc --noEmit
```

## Blocked by
116
