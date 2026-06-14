# 65 — Moment photo (write-only) + vision→text adapter

Triage: ready-for-agent

## Parent
PRD v8 — `CONTEXT/planning/prd-v8-photo-stories-and-calendar.md`

## What to build
The spine of photo-to-story. A [Moment](../CONTEXT.md) gains an **optional photo**, and a
new **vision→text adapter** reads that photo into a **scene description**. Per
[ADR-0021](../docs/adr/0021-moment-photos-write-only-vision-to-text.md) the photo is
**write-only**: stored, never rendered, vision-extracted, never likeness-training.

- New **vision→text provider port** behind an interface (faked in tests like the existing
  Anthropic/fal/moderation adapters; real provider used when keys are present). It takes
  an image and returns a short scene description string.
- `MomentService` accepts an optional photo on create. The raw photo is stored under the
  **Family-scoped** blob key space; the derived scene description is persisted on the
  Moment. The raw photo is **never** placed on `MomentView` or any view object returned to
  the UI.
- Web: an "add a photo" affordance on the Moment capture surface. The Journal continues to
  render the Moment text only — **no raw-photo `<img>` anywhere** (extends the ADR-0020
  invariant).

## Acceptance criteria
- [ ] Creating a Moment with a photo stores the photo Family-scoped and persists a
      vision-derived scene description (fake vision adapter in tests).
- [ ] No view object or rendered surface ever exposes the raw photo URL/bytes (web).
- [ ] With no vision-provider keys, the dev path still completes (real-provider call only
      when keys present); tests assert the adapter is invoked and its output stored.
- [ ] `MomentService` tests cover create-with-photo, scene-description persistence, and the
      never-displayed invariant. All existing tests stay green.
- [ ] Documented real-keys manual smoke passes (HITL): attach a real photo to a Moment
      locally and confirm a real scene description is produced and the photo never renders.

## Blocked by
None - can start immediately
