# 203 — Deploy to Vercel and prove a stable public callback URL

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Deploy the Next.js app to Vercel and configure `NEXT_PUBLIC_APP_URL` plus the fal.ai callback base URL to that origin. Provider secrets are set as Vercel server-side environment variables. Add a reachability preflight the training submission path calls before it spends money.

## Acceptance criteria

- [ ] The training submission path calls a reachability preflight against the configured public callback base URL before any fal.ai call is made.
- [ ] When the preflight fails, submission returns a failure naming the unreachable callback URL and no fal.ai request is sent and no spend is reserved (`FAIL-6`).
- [ ] `FAL_API_KEY` and `ANTHROPIC_API_KEY` are absent from every client bundle and every API response body (`SEC-1`).
- [ ] The callback base URL is read from configuration, never hardcoded, and a missing value fails closed at startup.
- [ ] The deployed origin is recorded in `CONTEXT/planning/prd-v23-full-likeness-demo.md` under a `Deployed callback origin` heading.

## Verification-command

```bash
npx vitest run tests/203-public-callback-url.test.ts && npm run verify
```

## Blocked by

none

## Invariants restated

FAIL-6, SEC-1

## Notes

A tunnel is not acceptable here: it dies when the Mac sleeps and strands overnight training callbacks.

**Target backend:** Vercel.
