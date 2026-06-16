# 79 — Mobile Storybook reader (paged + candidate/re-roll)

Triage: ready-for-agent

## What to build
The native reader for a generated Storybook: paged text + illustration, with per-Page
candidate selection / re-roll where the API supports it.

- Library/list surface: `listStorybooks()` rendered as covers with status; tapping a
  `draft`/`finalized` book opens the reader.
- Reader: swipeable/paged view pairing each Page's text with its illustration, using
  `getStorybook(id)`; respects the `generating → draft → finalized` lifecycle (a failed
  Page shows as a re-rollable hole, not a crash).
- Per-Page actions where the API exposes them: pick among **candidates** / **re-roll**
  text or illustration (bounded by the existing re-roll budget). If `/api/storybooks/[id]`
  lacks candidate data, extend it minimally (flagged in issue 77).
- Images load via the existing authenticated image path (`/api/images`/avatars pattern),
  never raw photos (ADR-0020 unaffected — these are generated illustrations).

## Acceptance criteria
- A generated Storybook reads page-by-page on the Simulator with text + illustration.
- Where supported, re-rolling/picking a candidate updates the Page in place.
- A failed Page renders as a recoverable hole, not an error screen.
- Manual Simulator pass recorded in the handoff.

## Blocked by
78
