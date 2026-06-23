# 140 — Blurred translucent tab bar

Triage: ready-for-agent

## Parent
PRD v15 — `CONTEXT/planning/prd-v15-ui-native-polish.md`. Track UI-B.

## What to build
Replace the opaque tab bar (`(tabs)/_layout.tsx:17`) with a **translucent blurred** bar
(`expo-blur`) that content scrolls under (the iOS standard). Make the emoji tab icons crisper —
animate **scale/weight** for selected state instead of opacity-dimming. Fallback to opaque if
blur is unavailable.

## Acceptance criteria
- [ ] Tab bar is translucent/blurred; content scrolls under it; selected tab animates scale/weight.
- [ ] Graceful opaque fallback when `expo-blur` is unavailable.
- [ ] Passes `lullabook-design-check`; emoji iconography retained.

## Verification-command
```bash
(cd mobile && npx tsc --noEmit)
```

## Blocked by
—
