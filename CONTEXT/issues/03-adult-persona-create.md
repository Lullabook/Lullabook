# 03 — Adult Persona creation (self, liveness-gated)

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v1](../planning/prd-v1.md)
- Refs: ADR-0002, ADR-0014

## What to build

A Member creates an Adult Persona of themselves: upload reference photos, pass a
selfie/liveness match against those photos, pass automated pre-flight checks
(face present, single subject, resolution, not blurry, same-person consistency),
then a LoRA trains via the fal.ai adapter (fake acceptable for tests; real wired
behind webhook). Persona moves `training → ready/failed`. On ready, show
likeness-confirmation samples; on failure, auto-retry once then refund + guide
re-upload.

## Acceptance criteria

- [ ] Member uploads photos and completes a liveness/selfie capture; mismatch is rejected.
- [ ] Pre-flight checks reject unusable photo sets *before* a training run is started (test via faked trainer — trainer not called on rejection).
- [ ] Training transitions Persona state; a `waitForEvent` step parks on the fal.ai webhook.
- [ ] On ready, likeness-confirmation sample images are shown; user accepts or re-trains.
- [ ] On training failure: auto-retry once, then refund + notify.
- [ ] `PersonaService.create` tested at the service seam with provider faked.

## Blocked by

- 01 — Walking skeleton
