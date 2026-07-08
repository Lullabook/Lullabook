# 122 — Diagnose & fix the fal.ai illustration failure (real images render)
Status: shipped
Root-caused 100% fal.ai image-call failures (48/48 moderation=failed, zero images on disk) and fixed it so real generation produces real page images and books reach draft with images; added a regression test mocking the fal HTTP boundary (success→blob stored, failure→page failed + book stays text-viewable draft). Per-page illustration p95 < 60s; book always reaches a terminal state within the 5-min watchdog.
(condensed 2026-07-07 — full spec in git history)
