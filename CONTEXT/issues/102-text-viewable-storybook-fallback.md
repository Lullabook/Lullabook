# 102 — Text-viewable Storybook fallback when illustration is unavailable

Status: shipped

Fixed the case where a missing blob store/fal makes every page `failed` and the book can
never reach `draft`. Relaxed `finalizeStorybookStatus` to allow a text-viewable terminal
`draft` when illustrations are unavailable, and the reader now renders page text when
`illustrationBlobKey` is null instead of spinning.
Invariant: a book with no working illustration path still reaches a readable draft,
never uniformly `failed` and never an infinite spinner.

(condensed 2026-07-07 — full spec in git history)
