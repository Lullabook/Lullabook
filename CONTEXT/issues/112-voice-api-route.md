# 112 — Voice API route over VoiceClipService

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track B. ADR-0024.

## What to build
The `VoiceClipService` is fully built (consent, upload, list, playback URL, revoke,
lullaby-weave into the Prompt) but **no API route exposes it** — clips can only be seeded.
Add a Bearer-authed voice route surface (record/upload, list, signed playback URL, revoke).
The consent + `narrate` capability (403) gates already exist server-side — keep them.

## Acceptance criteria
- [ ] Upload / list / playback / revoke routes work over the existing service; consent +
      capability (403) gates hold.
- [ ] Upload requires a prior consent receipt; revoke deletes clips + blobs.
- [ ] A clip carries a server-validated `transcript` + `durationSecs`.

## Verification-command
```bash
npm test -- voice && tsc --noEmit
```

## Blocked by
(none)
