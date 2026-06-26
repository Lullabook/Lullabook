# 145 — Cut audio from R1 (voice clips, messages, lullaby weave, narration)

Triage: ready-for-agent

## Parent
PRD v16 — `CONTEXT/planning/prd-v16-r1-ruthless-cut.md`. Track S1.

## What to build
Remove all audio from the R1 surface and **disable it server-side**: voice clips, voice
messages, the lullaby-ending weave, and AI narration. Remove the record/play UI from the mobile
app; make the voice-related API routes return a clean `404`/`403` rather than running. Keep the
code behind config (don't delete) so R2 re-enables by flag.

## Acceptance criteria
- [ ] No record/play/voice UI is reachable anywhere in the mobile app (no dead buttons).
- [ ] Voice-clip / voice-message / narration endpoints are **disabled server-side** and return a
      clean `404`/`403` — never run, never 500. (Failure-mode invariant: deferred = absent, not error.)
- [ ] Storybook generation + reader work end-to-end with audio absent (no spinner waiting on a
      voice step; terminal state unaffected).
- [ ] Audio code remains behind config for R2 (not deleted); no entitlement regressions.
- [ ] A test asserts the voice endpoints are inert and the storybook loop is unaffected.

## Verification-command
```bash
npm test -- 145-cut-audio && (cd mobile && npx tsc --noEmit)
```

## Blocked by
_none_
