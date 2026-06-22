# 114 — Lullaby / narration playback in the reader

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track B. ADR-0024.

## What to build
The mobile reader (`mobile/app/storybooks/[id].tsx`) has **zero audio UI**. Add playback for
the woven lullaby / per-page narration voice clip.

## Acceptance criteria
- [ ] The reader plays the page/lullaby voice clip; playback starts < 1 s from cache.
- [ ] Missing audio degrades gracefully (no crash, no blocking spinner).

## Verification-command
```bash
cd mobile && npx tsc --noEmit && test -z "$(find . -name '* 2.*' -not -path '*/node_modules/*')"
```

## Blocked by
112
