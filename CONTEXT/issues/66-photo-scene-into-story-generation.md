# 66 — Photo-derived scene description seeds story-from-Moment

Status: shipped

Built: create-Story-from-Moment path now folds a photo Moment's scene description into
the Brief/auto-context that conditions generation. Text only, per ADR-0021 — photo pixels
never reach the illustration pipeline; LoRA/Style Bible untouched. Photo-less Moments
unchanged. This backend piece is shared infra: native photo-to-story (issue 71) reuses
the same vision→text + story-from-Moment path rather than rebuilding it.

(condensed 2026-07-07 — full spec in git history)
