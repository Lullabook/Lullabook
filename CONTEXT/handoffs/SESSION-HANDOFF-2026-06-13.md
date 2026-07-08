# Session Handoff — 2026-06-13: native iOS, one-shot → sliced workflow

Status: historical

Planning session: Fable became unavailable, so the native iOS effort was re-planned
as sliced TDD work for Cursor — wrote `CONTEXT/planning/prd-v3-native-ios.md`,
issues 23–31 (money-first vertical slices, issue 31 HITL App Store readiness), and
added glossary entries Email-Plus VPC + Subscription to `CONTEXT/CONTEXT.md`.

- Binding: `/mobile` Expo app, iOS-only, sharing types only via `@domain/*` alias + Metro watchFolders; Next.js repo root untouched.
- Binding: paywall = one entitlement `active`, monthly + annual, no trial (the free text tier is the trial); gate line = illustration + Personas, free = Character → text Stories.
- Binding: Email-Plus VPC = link-confirm + delayed second email with revoke, version-stamped receipt, `consentMethod = email_plus`; web keeps Stripe-as-VPC; `email_plus` lives in the shared consent engine, mobile-only.
- Binding: auth = Supabase email/password + Sign in with Apple; mobile gen progress polls `GET /api/storybooks/[id]` (Bearer).

(condensed 2026-07-07 — full text in git history)
