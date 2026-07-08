# 150 — Sentry on the Next.js API: capture, scrub child data, fail-open

Status: shipped

Wired `@sentry/nextjs` into the API/server (src/lib/sentry-server.config.ts,
src/lib/sentry-scrub.ts): captures API-route errors, rejections, Inngest job failures.
`beforeSend` scrubs request bodies, photo URLs, signed storage URLs, LoRA IDs, auth tokens
(`sendDefaultPii: false`, COPPA/GDPR invariant). Fail-open, <10ms overhead; EU region; disabled
under test. Note: Next.js API routes remain the mobile app's backend — not superseded by the
mobile-only pivot (that cut the web frontend only). Complements 151 (Expo client), not replaced by it.

(condensed 2026-07-07 — full spec in git history)
