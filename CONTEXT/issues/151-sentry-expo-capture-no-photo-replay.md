# 151 — Sentry on the Expo app: crash capture, source maps, no photo-screen replay

Triage: ready-for-agent

## Parent
PRD v17 — `CONTEXT/planning/prd-v17-test-framework-and-logging.md`. Track T2.

## What to build
Wire `@sentry/react-native` into the Expo app via its config plugin; initialize in the root
layout with `environment` + `release`. Upload native source maps via EAS Build (auth token as an
**EAS secret**, not `.env`). Apply the same **`beforeSend` scrubbing** as the server. **Session
Replay and crash screenshots OFF** on any screen showing a photo or a child's name
(`attachScreenshot: false`); safest default is Session Replay off entirely.

## Acceptance criteria
- [ ] iOS crashes/errors are captured with a symbolicated stack (source maps upload at build).
- [ ] **No child data leaves the device:** `beforeSend` scrubbing applied; `sendDefaultPii:
      false`; no `setUser` with email/name (opaque ID only). Tested.
- [ ] **No screenshot/replay on photo/upload/character screens** — `attachScreenshot: false`;
      replay (if used at all) masks all text/media and explicitly blocks photo components.
- [ ] **Fails open:** SDK unreachable → app still renders and generates; capture never blocks UI.
- [ ] `SENTRY_AUTH_TOKEN` is an EAS secret / build-time only — never in the bundle or an
      `EXPO_PUBLIC_*` var; Sentry disabled in test runs.

## Verification-command
```bash
cd mobile && npx tsc --noEmit && npm test -- 151-sentry-mobile-scrub
```

## Blocked by
150
