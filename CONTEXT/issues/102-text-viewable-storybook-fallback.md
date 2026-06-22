# 102 — Text-viewable Storybook fallback when illustration is unavailable

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track A.

## What to build
With no working blob store / fal, every page lands `failed` and the book can't reach
`draft` (ready-page floor). Make a generated book reach a **readable text-viewable
`draft`** when illustrations are unavailable: relax `finalizeStorybookStatus` to a
text-viewable terminal state and have the reader render page text when
`illustrationBlobKey` is null (instead of spinning).

## Acceptance criteria
- [ ] With no working illustration path, a generated book reaches a **readable `draft`**
      (text-viewable), not uniformly `failed` and not an infinite spinner.
- [ ] Reader renders text-only pages gracefully when an illustration blob is missing.
- [ ] Test: generation with a no-op/failing image step yields a text-viewable draft.

## Verification-command
```bash
npm test -- storybook-text-fallback && tsc --noEmit
```

## Blocked by
100
