# 75 — Mobile Journal: real Moment capture + timeline

Triage: ready-for-agent

## What to build
Replace the mock state in `mobile/app/daily.tsx` with the real capture loop over the
issue-74 API, so the Daily/Journal screen actually persists.

- Capture: the existing add-moment card (`text` + `momentType` chips + `significant`)
  calls `createMoment(...)`, then refetches the timeline. Remove the `TODO: persist via
  createDayMoment API` placeholder and the seeded mock array.
- Timeline: load `listMoments(babyId)` on mount, render reverse-chronological with the
  existing Maya's World moment cards; significant Moments visually marked; empty state
  invites the first Moment.
- Loading + error states use the kit (`C.danger` for errors); optimistic add is fine as
  long as it reconciles with the refetch.
- Baby selection: use the Member's default Baby from the home payload (multi-Baby picker
  is out of scope for v9).

## Acceptance criteria
- Logging a Moment on the Simulator persists it (survives app reload) and it appears at
  the top of the timeline.
- The timeline shows real server data, not mock state; empty state renders for a Baby
  with no Moments.
- Errors surface in-screen; no unhandled promise rejections.
- Manual Simulator pass recorded in the handoff (HITL).

## Blocked by
74
