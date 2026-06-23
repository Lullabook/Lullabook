# 123 — DEV_FAL_FALLBACK placeholder images (populated demo without live keys)

Triage: ready-for-agent

## Parent
PRD v14 — `CONTEXT/planning/prd-v14-r1-release.md`. Track A.

## What to build
Add `DEV_FAL_FALLBACK` (**double-gated**: `NODE_ENV !== "production"` AND an explicit flag,
exactly like `DEV_FORCE_SUBSCRIPTION`) that returns deterministic placeholder page images and
a usable placeholder LoRA, so the Simulator and demo reach a **populated illustrated `draft`**
without live fal keys. Inert in production.

## Acceptance criteria
- [ ] With `DEV_FAL_FALLBACK=true` (non-prod), generation yields placeholder page images and
      books reach an illustrated `draft`.
- [ ] Flag is **inert in production** (test asserts it can never resolve when
      `NODE_ENV === "production"`).
- [ ] No flag/secret leaks to the client bundle.

## Verification-command
```bash
npm test -- fal-fallback && tsc --noEmit
```

## Blocked by
122
