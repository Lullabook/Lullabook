# 135 — Release hardening: secrets audit + Apple App Review prep

Triage: ready-for-agent

## Parent
PRD v14 — `CONTEXT/planning/prd-v14-r1-release.md`. Track C.

## What to build
(a) **Secrets audit:** no secret value in any `EXPO_PUBLIC_*`; the dev sim creds
(`EXPO_PUBLIC_DEV_PASSWORD`) and all dev overrides (seed / liveness / subscription /
`DEV_FAL_FALLBACK`) are inert or absent in a release build. (b) **Apple App Review prep:**
privacy disclosures + the consent flow documented for Guideline 4.2 (kids / biometric data).

## Acceptance criteria
- [ ] Automated check: no secret in any `EXPO_PUBLIC_*`; dev-only flags gated off in release
      config (test proves all override paths inert when `NODE_ENV === "production"`).
- [ ] App Review packet: privacy nutrition labels, consent-flow walkthrough, data-use &
      deletion docs.

## Verification-command
```bash
npm test -- secrets release-config && (cd mobile && npx tsc --noEmit)
```

## Blocked by
—
