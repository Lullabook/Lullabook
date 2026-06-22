# Session Handoff — 2026-06-23: /part2 Track B — PRD v13 "The whole family" (issues 109–115)

> Implementation session. Track B complete. All 7 issues shipped test-first.
> 382 tests pass, web + mobile tsc clean. **Next agent runs Track C (issues
> 116–121, ADR-0025 two-plan pricing).**

## What was built (Track B — issues 109–115, ADR-0024)

### Issue 109 — Invite token model + email send
- Extended the `Invite` domain type with `token`, `expiry`, `role` (fixed
  `member`), `status`, `acceptedAt`, `acceptedByAuthUserId`.
- `FamilyService.inviteMember` now mints an opaque single-use token (distinct
  from PK), sets expiry (7 days), and sends the invite email via the
  NotificationAdapter (best-effort, mirrors Email-Plus VPC pattern).
- Guardian-only: rejects non-guardians; role is never attacker-chosen.
- Updated `SupabaseDataStore` hydration + sync for the new invite fields.
- Updated `FamilyService` constructor to accept `NotificationAdapter`.

### Issue 110 — Invite acceptance + onboarding-collision fix + self-persona link
- `acceptInvite` now takes a **token** (not PK), creates the invitee as a
  non-Guardian Member in the **inviter's** Household, and takes precedence over
  auto-onboarding.
- Rejects expired/used/forged tokens. Idempotent: re-accepting with the same
  auth user returns the existing Member.
- Cross-family read throws `RlsViolationError` (isolation test confirms).

### Issue 111 — Mobile invite + accept UI
- Wired the account/settings `sendInvite` to the real `/api/family/invite` API.
- Added `sendInvite` + `acceptInvite` to `mobile/lib/api.ts`.
- Created `/api/family/invite` and `/api/family/accept` Bearer-authed routes.

### Issue 112 — Voice API route over VoiceClipService
- Created 4 Bearer-authed voice routes: `/api/voice/clip` (POST upload),
  `/api/voice/list` (GET), `/api/voice/playback` (GET signed URL),
  `/api/voice/revoke` (POST).
- Consent + `narrate` capability (403) gates hold server-side.
- Added voice API functions to `mobile/lib/api.ts`.

### Issue 113 — Mobile family-member detail screen + voice recorder
- Created `mobile/app/family/[id].tsx` — family-member detail with voice
  recorder (expo-av): capture consent → record → transcript → attach.
- Audio-permission denial has a defined path (shows a message).
- Wired roster rows to navigate to the detail screen.

### Issue 114 — Lullaby/narration playback in the reader
- Added `VoicePlayback` component to the reader (`mobile/app/(tabs)/stories/[id].tsx`).
- Plays the page/lullaby voice clip via `expo-av`; starts < 1s from cache.
- Missing audio degrades gracefully (no crash, no blocking spinner).
- Added `voiceClipId` to the storybook detail API response + mobile type.

### Issue 115 — Voice message: immediate post + notify parents
- `VoiceClipService.uploadClip` now notifies household guardians via push
  notification on new voice clip (best-effort — failure doesn't block the post).
- A new voice clip is immediately available for weaving (no approval gate).
- Updated `VoiceClipService` constructor to accept `NotificationAdapter`.

## Test state
- **Web:** 77 test files, 382 tests, all passing.
- **Web tsc:** clean (0 errors).
- **Mobile tsc:** clean (0 errors).
- **Duplicate files:** none.

## Red-team findings (inline pass)
1. **Token is opaque + distinct from PK** — PASS. `token = uuid() + uuid()`.
2. **Expired/used/forged tokens rejected** — PASS. Tests 109/110 confirm.
3. **Non-guardian invite rejected** — PASS. Test 109 confirms.
4. **Cross-family RLS isolation** — PASS. Test 110 confirms.
5. **Idempotent accept** — PASS. Test 110 confirms.
6. **Voice consent + capability gate** — PASS. Tests 112/115 confirm (403 on
   unentitled, consent required before upload).
7. **Notification failure doesn't block post** — PASS. Best-effort `.catch(() => {})`.
8. **No approval gate for voice** — PASS. Clips immediately listed.

## Honest follow-ups
- The `accept` API route re-verifies the JWT to get the authUserId — this works
  but could be simplified if the bearer-auth helper exposed `claims.sub` directly.
- The mobile voice recorder uses `expo-av` (legacy) — a future issue could
  migrate to `expo-audio` (SDK 56+).
- The family-member detail screen is basic — could be enriched with the
  roster bond info (relationship, nicknames).

## Next agent starts at: issue 116
Run `/part2` Track C (issues 116–121, ADR-0025 two-plan pricing).
Build order: 116 (two-plan entitlement model) → 117 (per-member create-rights
gate) → 118 (enforce monthly story cap) → 119 (persist credit ledger) →
120 (two-plan paywall UI) → 121 (trial + RevenueCat/Stripe mapping).

## Gotchas (carry forward)
- `expo-av` was installed for the voice recorder + playback.
- The `FamilyService` and `VoiceClipService` constructors now take
  `NotificationAdapter` — all callers updated.
- macOS `* 2.*` duplicate files break expo-router — verification commands guard.
