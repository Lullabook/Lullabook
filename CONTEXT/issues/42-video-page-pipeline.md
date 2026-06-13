# 42 — Video pages: per-page ~5-sec clip + narration

## What to build
Premium "video story": animate each page's illustration into a **~5-second clip**
(image-to-video) in the page's art style, mux that page's narration over it, and
assemble a short video story. Provider/cost from research; runs as an extra durable
per-page step after illustration.

## Acceptance criteria
- One page → one ~5-sec clip with narration plays in the Reader.
- A short book assembles into a playable video story; per-page idempotent (issue 16).
- Provider adapter is behind an interface + faked in tests (no real spend in CI).

## Blocked by
39, 41
