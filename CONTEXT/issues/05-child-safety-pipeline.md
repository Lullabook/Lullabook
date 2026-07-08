# 05 — Child-safety pipeline (CSAM hash + moderation + NCMEC)

Status: shipped
Defense-in-depth content safety: every uploaded photo and every free-text Brief/style note is screened (CSAM hash-match + safety classifier) before storage/training; every generated image is screened before the parent ever sees it. Includes audit trail, NCMEC reporting path, abuse-report endpoint, account bans. "Moderate before persist" is a hard invariant reused by every later generation issue (15, 16, 26, ...). Real CSAM-hash vendor + NCMEC workflow is a launch blocker (HITL).
(condensed 2026-07-07 — full spec in git history)
