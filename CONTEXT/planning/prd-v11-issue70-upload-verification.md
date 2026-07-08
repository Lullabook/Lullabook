# PRD v11 — iOS Add-Family photo-upload verification gate (addendum to v10)

Status: shipped/closed. Thin addendum to PRD v10 — added one gate issue (88) for the
mobile FormData upload fix (commit `dc3f836`) and re-pointed owed HITL passes (75-81)
onto the v10 runbook; no new runbook structure.

Still-binding: mobile uploads build native `{uri,name,type}` multipart parts (not web
Blobs) — `mobile/lib/form-data.ts`; no raw uploaded photo is ever rendered, only the
generated Roster avatar.

(condensed 2026-07-07 — full text in git history)
