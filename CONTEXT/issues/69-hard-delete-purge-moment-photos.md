# 69 — Extend hard-delete to purge Moment photos

Status: shipped

Confirmed/extended the Family hard-delete path (ADR-0007) to erase Moment-photo blobs
along with everything else Family-scoped — no orphaned biometric data survives a purge.
The derived scene-description text is deleted with the Moment record too. Integration
test: create Moment-with-photo → hard-delete Family → assert blob gone. Binding
invariant: Moment photos are write-only, Family-scoped blobs (ADR-0021) and must always
be swept by hard-delete/purge.

(condensed 2026-07-07 — full spec in git history)
