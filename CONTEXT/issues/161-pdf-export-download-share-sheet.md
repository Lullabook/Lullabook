# 161 — PDF Export: authenticated download + iOS share sheet

Status: shipped

Added `expo-file-system`/`expo-sharing`. `downloadStorybookPdf(id)` streams the authed
(bearer header) export GET to app cache (`lullabook-<id>.pdf`), 45s client abort, validates
PDF content-type/magic bytes, deletes partial file on failure. Reader "Export PDF" button shows
only when `status === "finalized"` and platform can share; opens native share sheet on success,
retryable error on failure, book stays `finalized`. Egress only via `expo-sharing` (no
`Linking.openURL`, no remote upload, no share links); absent on web. Maestro flow (155)
extended to cover finalize→export.

(condensed 2026-07-07 — full spec in git history)
