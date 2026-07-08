# 71 — Native iOS parity: photo-to-story (camera capture)

Status: shipped

Brought photo-to-story to iOS: capturing/picking a photo when logging a Moment uploads
write-only (never displayed, ADR-0021) via the issue-70 wiring, feeding the same
vision→text + story-from-Moment backend path as web (issues 65/66) — no mobile-specific
generation logic. Invariant: iOS never renders the raw Moment photo on any surface;
Story generated from a photo Moment reflects the photo's scene via the shared backend.

(condensed 2026-07-07 — full spec in git history)
