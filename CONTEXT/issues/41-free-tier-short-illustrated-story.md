# 41 — Short illustrated story (fewer pages, still good)
Status: shipped
Added a ~5-page short-story length as a tier-agnostic generation flag (no paywall coupling at the time). Persisted as the `pageCount`/`resolvePageCount` domain concept (`src/domain/story-type.ts`, `DEFAULT_PAGE_COUNT`), with a Length picker in the web composer. Reuses the same curate/reader pipeline regardless of length.
(condensed 2026-07-07 — full spec in git history)
