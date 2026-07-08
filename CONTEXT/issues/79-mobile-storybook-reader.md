# 79 — Mobile Storybook reader (paged + candidate/re-roll)

Status: shipped

Native reader: `listStorybooks()` as a cover library; reader pairs each Page's text +
illustration via `getStorybook(id)`, respecting generating→draft→finalized lifecycle. A
failed Page renders as a recoverable hole, never a crash. Per-Page candidate pick/re-roll
where the API supports it (bounded by existing re-roll budget). Images load via the
existing authenticated image path — never raw photos (ADR-0020 unaffected; these are
generated illustrations). Closed as code-complete (GH #22).

(condensed 2026-07-07 — full spec in git history)
