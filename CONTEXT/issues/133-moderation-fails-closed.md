# 133 — Moderation fails CLOSED on the shipping path

Triage: ready-for-agent

## Parent
PRD v14 — `CONTEXT/planning/prd-v14-r1-release.md`. Track C. ADR-0010.

## What to build
Ensure the shipping path's safety moderation **fails closed**: CSAM hash-match + safety
classifier on uploaded photos, image moderation on generated outputs, and moderation of the
free-text Brief note. If a moderation service is unavailable → **block, never allow**.

## Acceptance criteria
- [ ] Upload + generation paths run moderation; an unavailable service → **blocked** (test
      asserts fail-closed), never silently allowed.
- [ ] Flagged content blocked + surfaced; no child likeness is generated from a photo that
      failed safety.

## Verification-command
```bash
npm test -- moderation safety && tsc --noEmit
```

## Blocked by
—
