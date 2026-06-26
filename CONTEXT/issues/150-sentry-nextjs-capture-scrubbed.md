# 150 — Sentry on the Next.js API: capture, scrub child data, fail-open

Triage: ready-for-agent

## Parent
PRD v17 — `CONTEXT/planning/prd-v17-test-framework-and-logging.md`. Track T1.

## What to build
Wire `@sentry/nextjs` into the API/server (the wizard generates client/server/edge config +
`instrumentation.ts` + source-map upload). Capture unhandled API-route errors and rejections
automatically; `captureException` inside Inngest job catch-blocks. Implement **`beforeSend`
scrubbing** + server-side scrubbing rules so no child/PII data is ever sent. Logging must be
**fire-and-forget and fail-open**. EU (Frankfurt) region; `sendDefaultPii: false`.

## Acceptance criteria
- [ ] API-route throws + unhandled rejections + Inngest job failures are captured with stack +
      release + environment.
- [ ] **Scrubbing is tested:** request bodies, photo URLs/paths, signed Supabase storage URLs,
      LoRA identifiers, consent/auth tokens, and secrets are stripped before send (COPPA/GDPR
      invariant). `sendDefaultPii: false`.
- [ ] **Fails open:** with the Sentry SDK unreachable/misconfigured, requests and generation
      still succeed; capture adds < 10ms on the happy path and never blocks a response.
- [ ] Sentry is disabled (or DSN-less) under Vitest/Playwright (`environment !== "test"`); no
      secret rides a public env var.

## Verification-command
```bash
npm test -- 150-sentry-scrub-failopen && tsc --noEmit
```

## Blocked by
_none_
