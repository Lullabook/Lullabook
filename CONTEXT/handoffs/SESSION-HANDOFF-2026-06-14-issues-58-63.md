# Session Handoff — 2026-06-14: Issues 58–63 (Roster Avatars + local dev + TestFlight runbook)

> `/part2` completed issues **58–62** and the **issue-63 runbook** (HITL — not executed).
> Issue **57** was done in the prior session.

## Issues completed

| Issue | Summary |
|-------|---------|
| **58** | `avatarKey` on Persona, generate roster portrait on `ready`, `/api/avatars`, `RosterAvatar` UI everywhere (World, Family, Composer); no raw photos on display surfaces (ADR-0020) |
| **59** | `replacePhotos()` service + Family detail upload zone; retrain → regenerate avatar |
| **60** | `npm run dev:free` (:3000) / `dev:paid` (:3001) via `DEV_FORCE_SUBSCRIPTION`; documented in RUN-LOCAL.md |
| **61** | Create text-story page v2 fonts; World daily-nudge dismiss contrast fix |
| **62** | Mobile `RosterAvatar` + home roster rows; `family/new` no raw photo previews |
| **63** | `mobile/TESTFLIGHT-RUNBOOK.md` written — **human must execute** Apple/Vercel/EAS steps |

## Test state

- `npm test` — **212/212 green**
- Migration: `supabase/migrations/008_avatar_key.sql` — apply on Supabase for prod/local DB

## Honest follow-ups

- **Issue 63 execution** — enroll Apple Developer, fill `eas.json`/`app.json`, deploy Vercel, `eas build/submit` (see runbook).
- Mobile add-family `submit()` still TODO-wired to API — photos upload path not fully connected (pre-existing).
- Apply `008_avatar_key.sql` to your Supabase project if not already done.

## Next ready work

After TestFlight HITL: production coach / Hermes E2E against deployed backend.

## Suggested skills

- `/handoff` + `/push-handoff` — already run this session
- `lullabook-design-check` — after UI tweaks
- Hermes — Playwright + iOS simulator smoke post-deploy
