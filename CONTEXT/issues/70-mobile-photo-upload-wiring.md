# 70 — Finish mobile photo-upload wiring (prerequisite)

Triage: ready-for-agent

## Parent
PRD v8 — `CONTEXT/planning/prd-v8-photo-stories-and-calendar.md`

## What to build
Close the pre-existing native-iOS gap: the mobile add-family `submit()` is TODO-wired and
the photo-upload path is not fully connected to the API (noted in the issues-58–63
handoff). Finish that wiring so any mobile photo flow — roster reference photos **and**
(next slices) Moment photos — actually reaches the backend blob store.

- Wire the mobile photo-upload path end-to-end to the existing upload API so a selected
  photo reaches the Family-scoped blob store.
- Confirm the add-family `submit()` actually persists (no remaining TODO stub).
- No display of raw photos on mobile (ADR-0020/0021 invariant holds).

## Acceptance criteria
- [ ] A photo selected on mobile uploads to the backend and lands in the Family-scoped blob
      store.
- [ ] Mobile add-family `submit()` persists a member with photos (no TODO stub remaining).
- [ ] No raw uploaded photo is rendered on any mobile surface.
- [ ] Mobile tests / smoke cover the upload path. Existing web + mobile tests stay green.
- [ ] Documented real-keys manual smoke passes (HITL): upload a photo from the iOS app
      (simulator or device) and confirm it reaches the store.

## Blocked by
None - can start immediately
