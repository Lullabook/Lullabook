# Session Handoff — 2026-06-16: mobile Simulator HITL bugs (Add Family)

Status: historical

HITL pass on the paid iOS Simulator after PR #26. Found the P0 bugs blocking issue 70:
B1 FormData upload needed native `{ uri, name, type }` parts (`mobile/lib/form-data.ts`),
B2 selfie camera needed a permission gate + try/catch, B6 `/api/home` ignored
`DEV_FORCE_SUBSCRIPTION` (fixed `ece605d`). Fixes landed; authenticated HITL re-run was
owed at the time.

- Binding: React Native uploads must use native file parts via `appendNativeFile` / `setNativeFile` in `mobile/lib/form-data.ts` — never web `Blob` casts.
- Binding: dev sign-in uses `EXPO_PUBLIC_DEV_EMAIL` / `EXPO_PUBLIC_DEV_PASSWORD` from `mobile/.env` — never commit `.env`.

(condensed 2026-07-07 — full text in git history)
