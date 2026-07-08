# 151 — Sentry on the Expo app: crash capture, source maps, no photo-screen replay

Status: shipped

Wired `@sentry/react-native` (mobile/lib/sentry-init.ts, mobile/lib/sentry-scrub.ts); native
source maps via EAS Build (auth token as EAS secret, never `.env`/bundle). Same `beforeSend`
scrubbing as server; `sendDefaultPii: false`; no `setUser` with email/name (opaque ID only).
Session Replay + crash screenshots OFF entirely (`attachScreenshot: false`) — binding rule: no
screenshot/replay on any photo/upload/child-name screen. Fail-open; disabled in tests.

(condensed 2026-07-07 — full spec in git history)
