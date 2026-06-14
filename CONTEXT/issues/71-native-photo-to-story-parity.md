# 71 — Native iOS parity: photo-to-story (camera capture)

Triage: ready-for-agent

## Parent
PRD v8 — `CONTEXT/planning/prd-v8-photo-stories-and-calendar.md`

## What to build
Bring photo-to-story to the iOS app — the most natural place for it, since the photo comes
straight from the phone. A parent captures/picks a photo when logging a
[Moment](../CONTEXT.md); it uploads **write-only** (never displayed,
[ADR-0021](../docs/adr/0021-moment-photos-write-only-vision-to-text.md)) and feeds the same
vision→text + story-from-Moment path as web (issues 65/66).

- Mobile Moment capture gains a camera/library photo affordance using the wiring from
  issue 70.
- The photo uploads Family-scoped; the app never renders the raw photo (parity with the
  web invariant).
- Generating a Story from a photo Moment uses the same backend path — no mobile-specific
  generation logic.

## Acceptance criteria
- [ ] A Moment can be logged with a captured/selected photo on iOS; the photo uploads
      write-only and the scene description is produced server-side.
- [ ] The iOS app never renders the raw Moment photo on any surface.
- [ ] A Story generated from an iOS-captured photo Moment reflects the photo's scene.
- [ ] Mobile tests / smoke cover the capture→upload→story path. Existing tests stay green.
- [ ] Documented real-keys manual smoke passes (HITL): capture a real photo on iOS and
      generate a real Story from it.

## Blocked by
- 65
- 66
- 70
