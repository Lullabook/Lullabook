# 59 — Update / replace reference photos → retrain → regenerate avatar (web)
Status: cut
Added a `replacePhotos` service path (re-run child-safety checks, swap stored photos, reset to `training`, clear `avatarKey`, retrain, regenerate avatar) plus an "Update photos" web UI that never shows a gallery of the current photos. Depends on 58 and shares its fate — built, then gated off for R1 under the same "roster avatars" defer bucket (issue 149).
(condensed 2026-07-07 — full spec in git history)
