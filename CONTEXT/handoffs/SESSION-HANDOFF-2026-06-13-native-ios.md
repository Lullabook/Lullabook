# Session Handoff — 2026-06-13: Native iOS slices 23–31 (TDD)

> Implemented native iOS vertical slices on branch `handoff/generation-pipeline-prd-v2`
> (or current working branch). Web issues 01–22 were already green; this session
> added slices **23–31** per `CONTEXT/planning/prd-v3-native-ios.md`.

## What shipped

### Issue 23 — Bearer auth + mobile scaffold
- `requireBearerMember` + faked JWT verifier tests (`tests/23-native-auth-bearer.test.ts`)
- `GET /api/home` Bearer-authed cold-start roster
- `/mobile` Expo app: sign-in/up (email + Apple), SecureStore session, home screen polling `/api/home`
- Metro `@domain/*` type sharing from `src/domain/types.ts`

### Issue 24 — Free Character + text tier + bug fixes
- `POST /api/characters`, `POST /api/text-stories`
- **Bug fix:** non-numeric Sightengine text scores fail-closed (`src/adapters/moderation.ts`)
- **Bug fix:** `SupabaseDataStore.sync()` batched via `Promise.all`

### Issue 25 — RevenueCat IAP
- `RevenueCatWebhookHandler` + `POST /api/webhooks/revenuecat`
- `SubscriptionService.handleRevenueCatActivated`

### Issue 26 — Email-Plus VPC
- `EmailPlusVpcService` state machine + routes under `/api/consent/email-plus/*`
- `US_IOS` jurisdiction with `consentMethod: email_plus`
- **Bug fixes:** promotion `kind` threaded through workflow; persona-create failure → `failed` status

### Issues 27–29 — Backend API surfaces
- Storybook status route already Bearer-ready via existing `GET /api/storybooks/[id]`
- **Bug fixes:** `finalizeStorybookStatus` recovers `failed` books; `selectCandidate` uses `illustrationBlobKey`; `pageRecover` terminal handler

### Issue 30 — Push + hard-delete
- `InMemoryPushSubscriptionStore` + `POST /api/push/register`
- `GET /api/account`, `POST /api/account/hard-delete`
- **Bug fix:** `hardDeleteFamily` clears textStories, pendingBriefs, moderationAudit, pushSubscriptions

### Issue 31 — App Store readiness
- `mobile/app.config.ts`, `mobile/eas.json`, AASA at `public/.well-known/apple-app-site-association`
- `mobile/README.md`, `mobile/.env.example`, `INTEGRATION-FOR-OPUS.md`

## Test status

**116 tests green** (`npm test`) — was 105 web + 11 new native slice tests.

## Not done / follow-ups

- Mobile UI for paywall (RevenueCat SDK), curation, library reader offline, brief composer, classics, sharing/export screens — backend routes exist; mobile screens are scaffold-level beyond home/auth.
- `expo-notifications` device registration UI not wired in app shell yet (API route ready).
- Supabase tables for `push_subscriptions` / `email_plus_vpc_requests` — in-memory store only; migrate before production.
- Human steps in `CONTEXT/handoffs/INTEGRATION-FOR-OPUS.md` (HITL issue 31).

## Suggested skills for next session

- `/tdd` — deepen mobile screens (paywall, reader, curation) against existing Bearer routes
- `/code-review` — before TestFlight
- `/handoff` + `/push-handoff` — after each slice lands on device

## Key refs

- PRD: `CONTEXT/planning/prd-v3-native-ios.md`
- Issues: `CONTEXT/issues/23-native-auth-bearer-backend.md` through `31-native-app-store-readiness-eas.md`
- Opus runbook: `CONTEXT/handoffs/INTEGRATION-FOR-OPUS.md`
