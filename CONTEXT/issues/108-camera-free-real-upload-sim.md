# 108 — Camera-free real-upload path for the Simulator

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track A.

## What to build
Reference photos already use the library picker (works in the sim); the blocker is the
**adult consent selfie** (`launchCameraAsync`) + runtime Rekognition liveness (no dev
fallback) + LoRA training needing live fal keys. Add, all **double-gated** dev-only:
(1) a `__DEV__` "pick selfie from library" branch in `family/new.tsx`; (2) a dev liveness
bypass (`FakeLiveness` wired only in dev); (3) a **persona-training dev fallback** so a
persona reaches `ready` with a placeholder/generated avatar when fal keys are absent. Use
**free-use / synthetic faces, not real celebrities** (publicity-rights). Photos still pass
the safety scan; raw photos never rendered (ADR-0020).

## Acceptance criteria
- [ ] In the Simulator (dev, flagged), a tester creates an Adult Persona end-to-end from
      library photos + a library selfie and it reaches `ready`.
- [ ] The dev liveness bypass + training fallback are **inert in production**
      (server-authoritative, double-gated) — test asserts.
- [ ] Uploaded photos still run the safety scan; the roster shows the generated/placeholder
      avatar, never raw photos.

## Verification-command
```bash
npm test -- dev-persona-upload && tsc --noEmit
```

## Blocked by
107
