# 122 — Diagnose & fix the fal.ai illustration failure (real images render)

Triage: ready-for-agent

## Parent
PRD v14 — `CONTEXT/planning/prd-v14-r1-release.md`. Track A. The R1 centerpiece blocker.

## What to build
Diagnose why **100% of fal.ai image calls fail** (the audit found 48/48 `*.moderation`
markers = `failed`, zero images on disk in `.localblob`). Identify the root cause — API key
validity, endpoint/model id, request shape, quota/billing, or moderation-response parsing —
and fix it so a real generation produces real page images and a book reaches `draft` **with
images**. Add a regression test mocking the fal HTTP boundary. See `src/adapters/fal.ts`,
`src/services/storybook.ts:502-511`.

## Acceptance criteria
- [ ] Root cause documented in the PR; the live fal call returns an image, or the exact
      upstream error is surfaced and handled.
- [ ] A generated Bedtime book reaches `draft` with ≥1 real page image stored (blob present),
      not silently text-only-degraded.
- [ ] Regression test mocks the fal boundary: success → image blob stored; failure → page
      `failed` (re-rollable hole) + book text-viewable `draft` (invariant preserved).
- [ ] Per-page illustration p95 < 60s; whole book reaches a terminal state within the 5-min
      watchdog — never infinite "Illustrating".

## Verification-command
```bash
npm test -- fal storybook && tsc --noEmit
```

## Blocked by
—
