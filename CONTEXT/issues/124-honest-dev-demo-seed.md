# 124 — Honest DEV_DEMO_SEED (real text + images, not empty display rows)

Triage: ready-for-agent

## Parent
PRD v14 — `CONTEXT/planning/prd-v14-r1-release.md`. Track A.

## What to build
Replace the empty-display seed (`src/dev/seed-maya-world.ts` writes page-less books) with a
real `DEV_DEMO_SEED` (double-gated) that creates a **baby + a small family roster + a Bedtime
Storybook carrying real generated text and images** (via the real pipeline or
`DEV_FAL_FALLBACK`). Wire `DEV_DEMO_SEED=true` into the `dev:paid` env so the in-app seed
button / `/api/dev/seed` stops returning 403.

## Acceptance criteria
- [ ] Seed creates a baby + ≥2 family members + a Bedtime book with **real text + images**;
      the running app shows a populated world.
- [ ] `/api/dev/seed` returns 200 under the flag (not 403); double-gated + inert in prod.
- [ ] The seeded book satisfies the same terminal-state + payload (<500KB) invariants as a
      user-generated one.

## Verification-command
```bash
npm test -- seed && tsc --noEmit
```

## Blocked by
122, 123
