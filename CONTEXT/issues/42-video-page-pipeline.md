# 42 — Video pages: per-page ~5-sec clip + narration
Status: cut
Built a `VideoAdapter` interface + fake (per-page image-to-video clip with narration, muxed, idempotent per page) per the spec. "Video pages" was later named in the PRD v14/v16 R2-defer list (see issue 149) and gated off server-side for R1 — kept behind config, not deleted.
(condensed 2026-07-07 — full spec in git history)
